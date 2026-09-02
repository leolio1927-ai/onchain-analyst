"""Keyless swap quote adapters (T2-C) — verified live from this workspace.

Verified 2026-09-02 (curl, HTTP 200, NO key):
- Jupiter  https://lite-api.jup.ag/swap/v1/quote   Solana same-chain
- LI.FI    https://li.quest/v1/quote               EVM same-chain (bnb/base)
Relay answered 404 on /quote and /quotes → candidate-only, deliberately NO
adapter until its route is verified.

Fail-closed law: a quote leaves this module only with decimals VERIFIED for
both sides and every consumed field finite/shape-checked; anything else
raises SwapQuoteError and the caller degrades honestly to the unwired
contract. Amounts are scaled with Decimal — precision beyond the token
decimals is REFUSED, never silently truncated. Execution never happens
here: this module returns numbers, not transactions.
"""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.request
from collections.abc import Callable
from decimal import Decimal, InvalidOperation
from typing import Any

from providers import swap_policy
from providers.swap_circuit_breaker import BREAKER, SwapCircuitBreaker

JUPITER_BASE = os.environ.get("VILMEI_JUPITER_BASE", "https://lite-api.jup.ag").rstrip("/")
LIFI_BASE = os.environ.get("VILMEI_LIFI_BASE", "https://li.quest").rstrip("/")
SOLANA_RPC_BASE = os.environ.get("VILMEI_SOLANA_RPC", "https://api.mainnet-beta.solana.com").rstrip("/")
TIMEOUT_S = float(os.environ.get("VILMEI_SWAP_QUOTE_TIMEOUT_S", "8"))


def live_enabled() -> bool:
    """Read per call: flipping VILMEI_SWAP_LIVE needs no restart, and the
    suite-wide offline fixture can hold it at 0 for every test."""
    return os.environ.get("VILMEI_SWAP_LIVE", "1").strip().lower() not in ("0", "false", "no", "off")

WSOL_MINT = "So11111111111111111111111111111111111111112"
EVM_NATIVE = "0x0000000000000000000000000000000000000000"
# quote-only terminal: no wallet exists, LI.FI requires a fromAddress — the
# burn address is used and surfaced verbatim in the response provenance.
LIFI_FROM_ADDRESS = "0x000000000000000000000000000000000000dEaD"

NATIVE_DECIMALS = {"sol": 9, "bnb": 18, "base": 18, "hype": 18, "hood": 18}
LIFI_CHAIN_IDS = {"bnb": 56, "base": 8453}  # hype/hood: no verified coverage

_MINT_DECIMALS: dict[str, int] = {WSOL_MINT: 9}
_EVM_TOKEN_DECIMALS: dict[tuple[int, str], int] = {}


class SwapQuoteError(RuntimeError):
    """A provider quote could not be fetched/parsed honestly."""


# ── low-level fetch (blocking; callers wrap in asyncio.to_thread) ─────────

def _get_json(url: str, timeout_s: float = TIMEOUT_S) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "VILMEI-Terminal/1.0 (quote-only)", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as r:
            if r.status != 200:
                raise SwapQuoteError(f"HTTP {r.status} from {url.split('?')[0]}")
            return json.loads(r.read().decode("utf-8"))
    except SwapQuoteError:
        raise
    except Exception as exc:
        raise SwapQuoteError(f"{exc.__class__.__name__}: {exc}") from exc


def _post_json(url: str, body: dict, timeout_s: float = TIMEOUT_S) -> Any:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/json",
                                          "User-Agent": "VILMEI-Terminal/1.0 (quote-only)"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as r:
            if r.status != 200:
                raise SwapQuoteError(f"HTTP {r.status} from {url}")
            return json.loads(r.read().decode("utf-8"))
    except SwapQuoteError:
        raise
    except Exception as exc:
        raise SwapQuoteError(f"{exc.__class__.__name__}: {exc}") from exc


# ── amount scaling (Decimal; refuse — never truncate) ─────────────────────

def scale_to_raw(amount: str, decimals: int) -> str:
    try:
        parsed = Decimal(str(amount).strip())
    except InvalidOperation as exc:
        raise SwapQuoteError("invalid_amount") from exc
    if not parsed.is_finite() or parsed <= 0:
        raise SwapQuoteError("invalid_amount")
    quantum = Decimal(1).scaleb(-decimals)
    if parsed != parsed.quantize(quantum):
        raise SwapQuoteError(
            f"amount precision exceeds {decimals} decimals — refusing to truncate silently")
    return str(int(parsed.scaleb(decimals)))


def scale_to_human(raw: str, decimals: int) -> str:
    try:
        value = Decimal(int(str(raw).strip()))
    except (InvalidOperation, ValueError) as exc:
        raise SwapQuoteError("unparseable provider amount") from exc
    return f"{value.scaleb(-decimals):f}"


# ── decimals (verified per side; cached — mint decimals are immutable) ────

def sol_mint_decimals(mint: str) -> int:
    cached = _MINT_DECIMALS.get(mint)
    if cached is not None:
        return cached
    payload = _post_json(SOLANA_RPC_BASE, {
        "jsonrpc": "2.0", "id": 1, "method": "getAccountInfo",
        "params": [mint, {"encoding": "base64"}]})
    try:
        raw = base64.b64decode(payload["result"]["value"]["data"][0])
        if len(raw) < 45:
            raise SwapQuoteError(f"mint account too short for {mint}")
        decimals = raw[44]  # SPL Mint layout: 4+32 authority, 8 supply, 1 decimals
        if not 0 <= decimals <= 30:
            raise SwapQuoteError(f"implausible decimals {decimals} for {mint}")
    except SwapQuoteError:
        raise
    except Exception as exc:
        raise SwapQuoteError(f"mint decimals unavailable for {mint}: {exc.__class__.__name__}") from exc
    _MINT_DECIMALS[mint] = decimals
    return decimals


def evm_token_decimals(chain: str, token: str) -> int:
    """LI.FI /token decimals for a non-native EVM asset (verified endpoint)."""
    chain_id = LIFI_CHAIN_IDS[chain]
    key = (chain_id, token.lower())
    cached = _EVM_TOKEN_DECIMALS.get(key)
    if cached is not None:
        return cached
    payload = _get_json(f"{LIFI_BASE}/v1/token?chain={chain_id}&token={token}")
    decimals = (payload or {}).get("decimals")
    if not isinstance(decimals, int) or not 0 <= decimals <= 30:
        raise SwapQuoteError(f"decimals unavailable for {token} on {chain}")
    _EVM_TOKEN_DECIMALS[key] = decimals
    return decimals


def _resolve_decimals(chain: str, token: str, namespace: str) -> int:
    if token.lower() in ("native", f"native:{chain}"):
        return NATIVE_DECIMALS[chain]
    if namespace == "solana":
        return sol_mint_decimals(token)
    return evm_token_decimals(chain, token)


# ── parsers (pure; unit-tested against captured payloads) ────────────────

def parse_jupiter_quote(payload: Any, *, decimals_in: int, decimals_out: int) -> dict:
    """Shape-checked Jupiter /swap/v1/quote payload → normalized quote dict."""
    if not isinstance(payload, dict):
        raise SwapQuoteError("jupiter payload is not an object")
    out_amount = payload.get("outAmount")
    threshold = payload.get("otherAmountThreshold")
    if not (isinstance(out_amount, str) and out_amount.isdigit() and int(out_amount) > 0):
        raise SwapQuoteError("jupiter outAmount missing/invalid")
    if not (isinstance(threshold, str) and threshold.isdigit()):
        raise SwapQuoteError("jupiter otherAmountThreshold missing/invalid")
    route: list[str] = []
    for step in (payload.get("routePlan") or []):
        label = ((step or {}).get("swapInfo") or {}).get("label")
        if isinstance(label, str) and label:
            route.append(label)
    return {
        "amount_out": scale_to_human(out_amount, decimals_out),
        "minimum_received": scale_to_human(threshold, decimals_out),
        "raw_amount_out": out_amount,
        "route": route or ["jupiter"],
    }


def parse_lifi_quote(payload: Any, *, decimals_in: int, decimals_out: int) -> dict:
    """Shape-checked LI.FI /v1/quote payload → normalized quote dict."""
    if not isinstance(payload, dict):
        raise SwapQuoteError("lifi payload is not an object")
    estimate = payload.get("estimate") or {}
    out_amount = estimate.get("toAmount")
    out_min = estimate.get("toAmountMin")
    for name, value in (("toAmount", out_amount), ("toAmountMin", out_min)):
        if not (isinstance(value, str) and value.isdigit() and int(value) > 0):
            raise SwapQuoteError(f"lifi estimate.{name} missing/invalid")
    tool = ((payload.get("toolDetails") or {}).get("name"))
    route = [tool] if isinstance(tool, str) and tool else ["lifi"]
    for step in (payload.get("includedSteps") or []):
        step_tool = ((step or {}).get("toolDetails") or {}).get("name")
        if isinstance(step_tool, str) and step_tool and step_tool not in route:
            route.append(step_tool)
    return {
        "amount_out": scale_to_human(out_amount, decimals_out),
        "minimum_received": scale_to_human(out_min, decimals_out),
        "raw_amount_out": out_amount,
        "route": route,
    }


# ── adapters (network) ────────────────────────────────────────────────────

def _native_id(chain: str, token: str) -> bool:
    return token.lower() in ("native", f"native:{chain}")


def jupiter_quote(*, source_chain: str, destination_chain: str, token_in: str,
                  token_out: str, amount_in: str, slippage_bps: int) -> dict:
    if not (source_chain == destination_chain == "sol"):
        raise SwapQuoteError("jupiter adapter is solana same-chain only")
    input_mint = WSOL_MINT if _native_id("sol", token_in) else token_in
    output_mint = WSOL_MINT if _native_id("sol", token_out) else token_out
    decimals_in = sol_mint_decimals(input_mint)
    decimals_out = sol_mint_decimals(output_mint)
    raw_amount = scale_to_raw(amount_in, decimals_in)
    payload = _get_json(
        f"{JUPITER_BASE}/swap/v1/quote?inputMint={input_mint}&outputMint={output_mint}"
        f"&amount={raw_amount}&slippageBps={int(slippage_bps)}")
    parsed = parse_jupiter_quote(payload, decimals_in=decimals_in, decimals_out=decimals_out)
    return {"provider": "jupiter", "decimals_in": decimals_in, "decimals_out": decimals_out,
            "raw_amount_in": raw_amount, **parsed}


def lifi_quote(*, source_chain: str, destination_chain: str, token_in: str,
               token_out: str, amount_in: str, slippage_bps: int) -> dict:
    if source_chain not in LIFI_CHAIN_IDS or destination_chain not in LIFI_CHAIN_IDS:
        raise SwapQuoteError("lifi adapter covers verified EVM chains only (bnb/base)")
    from_token = EVM_NATIVE if _native_id(source_chain, token_in) else token_in.lower()
    to_token = EVM_NATIVE if _native_id(destination_chain, token_out) else token_out.lower()
    decimals_in = NATIVE_DECIMALS[source_chain] if from_token == EVM_NATIVE \
        else evm_token_decimals(source_chain, from_token)
    raw_amount = scale_to_raw(amount_in, decimals_in)
    payload = _get_json(
        f"{LIFI_BASE}/v1/quote?fromChain={LIFI_CHAIN_IDS[source_chain]}"
        f"&toChain={LIFI_CHAIN_IDS[destination_chain]}"
        f"&fromToken={from_token}&toToken={to_token}"
        f"&fromAmount={raw_amount}&fromAddress={LIFI_FROM_ADDRESS}&slippage={slippage_bps / 10000:g}")
    # decimals_out comes free with the quote (verified: action.toToken.decimals)
    to_dec = ((payload or {}).get("action", {}).get("toToken") or {}).get("decimals")
    if to_token == EVM_NATIVE:
        decimals_out = NATIVE_DECIMALS[destination_chain]
    elif isinstance(to_dec, int) and 0 <= to_dec <= 30:
        decimals_out = to_dec
    else:
        raise SwapQuoteError("lifi toToken.decimals missing/invalid")
    parsed = parse_lifi_quote(payload, decimals_in=decimals_in, decimals_out=decimals_out)
    return {"provider": "lifi", "decimals_in": decimals_in, "decimals_out": decimals_out,
            "raw_amount_in": raw_amount, **parsed}


ADAPTERS: dict[str, Callable[..., dict]] = {
    "jupiter": jupiter_quote,
    "lifi": lifi_quote,
}


# ── quote cache (T2-E): damp identical fan-out, NEVER the decision ────────
# Only the provider numbers are cached (10–15s); the Policy Engine and the
# simulation gate run fresh on every request by construction — they live in
# build_quote_response, outside this cache. slippage_bps IS part of the key
# even though the spec's key list omits it: minimum_received derives from
# slippage, and serving a stale minimum would be a lie. Identical spam has
# identical slippage, so the damping is unaffected.

CACHE_TTL_S = float(os.environ.get("VILMEI_SWAP_QUOTE_CACHE_TTL_S", "12"))
_CACHE_MAX_ENTRIES = 512
_QUOTE_CACHE: dict[tuple, tuple[float, dict, list]] = {}


def _cache_key(*, source_chain: str, destination_chain: str, token_in: str,
               token_out: str, amount_in: str, slippage_bps: int,
               provider: str | None) -> tuple:
    return (source_chain, token_in, destination_chain, token_out, amount_in,
            int(slippage_bps), provider or None)


def _cache_get(key: tuple) -> tuple[dict, list] | None:
    entry = _QUOTE_CACHE.get(key)
    if entry is None:
        return None
    stored_at, quote, attempts = entry
    if time.monotonic() - stored_at > CACHE_TTL_S:
        _QUOTE_CACHE.pop(key, None)
        return None
    return quote, attempts


def _cache_put(key: tuple, quote: dict, attempts: list) -> None:
    now = time.monotonic()
    expired = [k for k, (t, _, _) in _QUOTE_CACHE.items() if now - t > CACHE_TTL_S]
    for k in expired:
        _QUOTE_CACHE.pop(k, None)
    while len(_QUOTE_CACHE) >= _CACHE_MAX_ENTRIES:
        _QUOTE_CACHE.pop(next(iter(_QUOTE_CACHE)))
    _QUOTE_CACHE[key] = (now, quote, attempts)


def reset_quote_cache_for_tests() -> None:
    _QUOTE_CACHE.clear()


# ── composition: breaker-wrapped candidate sweep ──────────────────────────

def best_quote(*, source_chain: str, destination_chain: str, token_in: str,
               token_out: str, amount_in: str, slippage_bps: int,
               candidates: list[str], requested: str | None = None,
               breaker: SwapCircuitBreaker = BREAKER) -> tuple[dict | None, list[dict]]:
    """Try candidates (requested first) under the breaker. Returns
    (quote|None, attempts[]). Never raises — every attempt lands in attempts
    with an honest outcome, and None means 'no provider answered'. The
    breaker key encodes chains AND route type (per provider, chain,
    route-type granularity): a failing Solana same-chain path never blocks
    a BNB cross-chain one."""
    route_type = "same_chain" if source_chain == destination_chain else "cross_chain"
    route = f"{route_type}:{source_chain}->{destination_chain}"
    order = list(candidates)
    if requested and requested in order:
        order.remove(requested)
        order.insert(0, requested)
    attempts: list[dict] = []
    for provider in order:
        adapter = ADAPTERS.get(provider)
        if adapter is None:
            attempts.append({"provider": provider, "outcome": "skipped",
                             "detail": "no verified adapter configured"})
            continue
        decision = breaker.check(provider, route)
        if not decision.allowed:
            attempts.append({"provider": provider, "outcome": "breaker_blocked",
                             "detail": decision.get("reason", "blocked")})
            continue
        started = time.monotonic()
        try:
            quote = adapter(source_chain=source_chain, destination_chain=destination_chain,
                            token_in=token_in, token_out=token_out, amount_in=amount_in,
                            slippage_bps=slippage_bps)
            latency_ms = (time.monotonic() - started) * 1000
            breaker.record_success(provider, route, latency_ms)
            quote["latency_ms"] = round(latency_ms)
            quote["source_chain"] = source_chain
            quote["destination_chain"] = destination_chain
            attempts.append({"provider": provider, "outcome": "quoted",
                             "detail": f"{quote['amount_out']} in {quote['latency_ms']}ms"})
            return quote, attempts
        except Exception as exc:  # noqa: BLE001 — any provider failure is an attempt, never a raise
            latency_ms = (time.monotonic() - started) * 1000
            breaker.record_failure(provider, route, str(exc))
            attempts.append({"provider": provider, "outcome": "failed",
                             "detail": f"{exc.__class__.__name__}: {exc}"[:200]})
    return None, attempts


# ── the response the endpoint serves (live + honest fallback) ─────────────

def build_quote_response(*, source_chain: str, destination_chain: str, token_in: str,
                         token_out: str, amount_in: str, slippage_bps: int,
                         provider: str | None = None, live: bool = True,
                         breaker: SwapCircuitBreaker = BREAKER,
                         transaction_request: dict | None = None,
                         simulation_result: dict | None = None) -> dict:
    """Policy-validated quote contract. Live branch returns REAL provider
    numbers with execution STILL refused; any failure degrades to the
    unwired contract with the per-attempt reasons verbatim. The T2-E
    simulation gate rides the SAME flow: no built route → quote_only with
    sim None; a route without a simulation result is fail-closed."""
    base = swap_policy.evaluate_quote(
        source_chain=source_chain, destination_chain=destination_chain,
        token_in=token_in, token_out=token_out, amount_in=amount_in,
        slippage_bps=slippage_bps, provider=provider,
        transaction_request=transaction_request, simulation_result=simulation_result)
    base["data_mode"] = "unwired"
    base["sources"] = ["providers/swap_quotes.py", "providers/swap_policy.py"]
    quote_id = swap_policy.quote_id_for(
        source_chain=source_chain, destination_chain=destination_chain,
        token_in=token_in, token_out=token_out, amount_in=amount_in,
        slippage_bps=slippage_bps, provider=provider)
    base["quote_id"] = quote_id

    attempt_live = live and live_enabled() and not SwapCircuitBreaker.kill_switch_engaged()
    if not attempt_live:
        base["degraded"] = None if not live else (
            "live quoting disabled by kill switch" if SwapCircuitBreaker.kill_switch_engaged()
            else "live quoting disabled by configuration")
        return base

    key = _cache_key(source_chain=base["source_chain"], destination_chain=base["destination_chain"],
                     token_in=base["token_in"], token_out=base["token_out"],
                     amount_in=base["amount_in"], slippage_bps=base["slippage_bps"],
                     provider=provider)
    cached = _cache_get(key)
    if cached is not None:
        quote, attempts = cached
        base["quote_cache"] = "hit"
    else:
        quote, attempts = best_quote(
            source_chain=base["source_chain"], destination_chain=base["destination_chain"],
            token_in=base["token_in"], token_out=base["token_out"],
            amount_in=base["amount_in"], slippage_bps=base["slippage_bps"],
            candidates=base["provider_candidates"], requested=provider, breaker=breaker)
        if quote is not None:
            _cache_put(key, quote, attempts)
        base["quote_cache"] = "hit" if cached is not None else "miss"
    if quote is None:
        base["degraded"] = "; ".join(
            f"{a['provider']}: {a['outcome']} ({a['detail']})" for a in attempts) or \
            "no provider answered"
        return base

    base.update({
        "data_mode": "live",
        "provider_quoted": quote["provider"],
        "amount_out": quote["amount_out"],
        "minimum_received": quote["minimum_received"],
        "route": quote["route"],
        "degraded": None,
        "provenance": {
            "provider": quote["provider"],
            "host": "lite-api.jup.ag" if quote["provider"] == "jupiter" else "li.quest",
            "kind": "keyless",
            "latency_ms": quote["latency_ms"],
            "decimals_in": quote["decimals_in"],
            "decimals_out": quote["decimals_out"],
            "raw_amount_in": quote["raw_amount_in"],
            "raw_amount_out": quote["raw_amount_out"],
            "from_address": LIFI_FROM_ADDRESS if quote["provider"] == "lifi" else None,
        },
    })
    return base
