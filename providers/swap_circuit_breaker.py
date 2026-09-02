"""Swap provider circuit breaker (T2-E hard requirement).

Per (provider, route) failure/error-rate tracking with the standard three
states: closed (calls allowed) → open (calls blocked for a cool-off) →
half_open (one probe allowed). The route key encodes chains AND route type
(e.g. ``same_chain:sol``, ``cross_chain:sol->bnb``) so granularity is per
(provider, chain, route-type) — a broken Solana same-chain path never
blocks a BNB cross-chain one. A provider that keeps failing is disabled
AUTOMATICALLY here — never by inventing data elsewhere. The global kill
switch (VILMEI_SWAP_KILL=1) blocks every provider immediately and is read
at check time so flipping it needs no restart.

OPEN triggers (per spec): >= failure_threshold consecutive failures OR an
error rate above error_rate_threshold across the sliding error_rate_window
(needs error_rate_min_sample events first, so one unlucky call cannot trip
a breaker on statistical noise).

Fail-closed law: only an explicit allow() decision permits a call; the
breaker never raises, so a broken breaker can only ever BLOCK more, not
less. State is in-memory by design — a restart re-probes providers from
closed, which is the safe direction.
"""
from __future__ import annotations

import os
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field


@dataclass(frozen=True)
class BreakerConfig:
    failure_threshold: int = 3      # consecutive failures before open (spec: >=3)
    open_seconds: float = 120.0     # cool-off before half_open probes (spec: 120)
    half_open_successes: int = 1    # probes that must succeed to close
    latency_spike_ms: float = 15_000.0  # a call slower than this counts as failing
    error_rate_threshold: float = 0.40   # spec: >40% errors in the window → open
    error_rate_window_s: float = 60.0    # spec window: 60 seconds
    error_rate_min_sample: int = 5       # anti-noise: below this, rate never trips


@dataclass
class _RouteState:
    consecutive_failures: int = 0
    state: str = "closed"           # closed | open | half_open
    opened_at: float = 0.0
    half_open_successes: int = 0
    total_failures: int = 0
    total_successes: int = 0
    last_error: str | None = None
    open_reason: str | None = None  # WHY it opened — surfaced at check time
    window: deque = field(default_factory=lambda: deque(maxlen=1000))


class BreakerDecision(dict):
    """dict with a truthy-allow contract: decision['allowed'] is the only
    thing callers may branch on; state/reason are for honest surfacing."""
    @property
    def allowed(self) -> bool:
        return bool(self.get("allowed"))


class SwapCircuitBreaker:
    """Thread-safe breaker. ``now_fn`` is injectable for deterministic tests."""

    def __init__(self, config: BreakerConfig | None = None,
                 now_fn: Callable[[], float] = time.monotonic,
                 event_sink: Callable[[dict], None] | None = None):
        self.config = config or BreakerConfig()
        self._now = now_fn
        self._sink = event_sink
        self._lock = threading.Lock()
        self._routes: dict[tuple[str, str], _RouteState] = {}

    # ── reading ───────────────────────────────────────────────────────────
    @staticmethod
    def kill_switch_engaged() -> bool:
        return os.environ.get("VILMEI_SWAP_KILL", "").strip().lower() in ("1", "true", "yes", "on")

    def check(self, provider: str, route: str) -> BreakerDecision:
        """May a call to (provider, route) go out right now? Never raises."""
        try:
            if self.kill_switch_engaged():
                return BreakerDecision(allowed=False, state="killed",
                                       reason="global kill switch is engaged (VILMEI_SWAP_KILL)")
            with self._lock:
                st = self._routes.setdefault((provider, route), _RouteState())
                if st.state == "open":
                    if self._now() - st.opened_at >= self.config.open_seconds:
                        st.state = "half_open"
                        st.half_open_successes = 0
                    else:
                        why = st.open_reason or f"{st.total_failures} failures"
                        return BreakerDecision(allowed=False, state="open", reason=(
                            f"provider '{provider}' route '{route}' is open "
                            f"({why}) — retry after cool-off"))
                return BreakerDecision(allowed=True, state=st.state, reason="breaker closed")
        except Exception as exc:  # noqa: BLE001 — a broken breaker must block, never leak
            return BreakerDecision(allowed=False, state="unknown",
                                   reason=f"breaker internal error: {exc.__class__.__name__}")

    # ── writing ───────────────────────────────────────────────────────────
    def record_success(self, provider: str, route: str, latency_ms: float = 0.0) -> None:
        try:
            with self._lock:
                st = self._routes.setdefault((provider, route), _RouteState())
                st.total_successes += 1
                now = self._now()
                self._prune_window(st, now)
                slow = latency_ms > self.config.latency_spike_ms
                st.window.append((now, not slow))
                if slow:
                    self._fail_locked(provider, route, f"latency spike {latency_ms:.0f}ms")
                    return
                if st.state == "half_open":
                    st.half_open_successes += 1
                    if st.half_open_successes >= self.config.half_open_successes:
                        st.state = "closed"
                        st.consecutive_failures = 0
                        self._emit(provider, route, "closed", "half-open probe succeeded")
                elif st.state == "closed":
                    st.consecutive_failures = 0
                if st.state == "closed" and self._rate_exceeded(st):
                    self._open_rate(provider, route)
        except Exception:  # noqa: BLE001, S110 — recording must never throw into a live quote
            pass

    def record_failure(self, provider: str, route: str, error: str | None = None) -> None:
        try:
            with self._lock:
                self._fail_locked(provider, route, error)
        except Exception:  # noqa: BLE001, S110 — same law: never throw into a live quote
            pass

    def _fail_locked(self, provider: str, route: str, error: str | None) -> None:
        st = self._routes.setdefault((provider, route), _RouteState())
        st.total_failures += 1
        st.consecutive_failures += 1
        st.last_error = (error or "unknown error")[:200]
        self._prune_window(st, self._now())
        st.window.append((self._now(), False))
        if st.state == "half_open":
            self._open(provider, route, "half-open probe failed")
        elif st.consecutive_failures >= self.config.failure_threshold:
            self._open(provider, route, f"{st.consecutive_failures} consecutive failures")
        elif st.state == "closed" and self._rate_exceeded(st):
            self._open_rate(provider, route)

    def _prune_window(self, st: _RouteState, now: float) -> None:
        w = st.window
        while w and now - w[0][0] > self.config.error_rate_window_s:
            w.popleft()

    def _rate_exceeded(self, st: _RouteState) -> bool:
        if len(st.window) < self.config.error_rate_min_sample:
            return False
        fails = sum(1 for _, ok in st.window if not ok)
        return fails / len(st.window) > self.config.error_rate_threshold

    def _open_rate(self, provider: str, route: str) -> None:
        st = self._routes[(provider, route)]
        fails = sum(1 for _, ok in st.window if not ok)
        rate = fails / len(st.window)
        self._open(provider, route,
                   f"error rate {rate:.0%} over the last {self.config.error_rate_window_s:.0f}s")

    def _open(self, provider: str, route: str, why: str) -> None:
        st = self._routes[(provider, route)]
        st.state = "open"
        st.opened_at = self._now()
        st.half_open_successes = 0
        st.open_reason = why
        self._emit(provider, route, "open", why)

    # ── observability ─────────────────────────────────────────────────────
    def snapshot(self) -> list[dict]:
        with self._lock:
            return [{
                "provider": provider, "route": route,
                "state": st.state,
                "consecutive_failures": st.consecutive_failures,
                "total_failures": st.total_failures,
                "total_successes": st.total_successes,
                "last_error": st.last_error,
            } for (provider, route), st in sorted(self._routes.items())]

    def reset_for_tests(self) -> None:
        with self._lock:
            self._routes.clear()

    def _emit(self, provider: str, route: str, state: str, why: str) -> None:
        if self._sink is None:
            return
        try:
            self._sink({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "provider": provider, "route": route, "state": state, "why": why})
        except Exception:  # noqa: BLE001, S110 — an observability sink must never break a quote
            pass


BREAKER = SwapCircuitBreaker()
