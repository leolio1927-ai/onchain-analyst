"""P1-C — minimal honest alert engine.

Real data only: rules evaluate against the SAME providers the terminal
already uses (DexScreener deepest-pool liquidity, the /api/scan risk
engine). No mock fixture, no notification delivery (in-app only), no
whale-as-fact claims. Every event carries its evidence and a source
timestamp.

Dedup: an event is skipped when the same rule fired the same kind within
COOLDOWN_S. Read/unread state lives with the events. Provider failures and
insufficient data are recorded AS EVENTS (kinds provider_error /
insufficient_data) instead of being hidden or invented around.
"""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path

COOLDOWN_S = 900.0            # same rule+kind may fire at most every 15 min
MAX_EVENTS = 500
MAX_RULES = 50
MIN_WALLETS_FOR_RISK = 1      # risk engine needs ≥1 wallet sample to level

_LOCK = threading.Lock()
STATE_PATH = Path(os.environ.get("VILMEI_ALERTS_FILE", "data/alerts.json"))
KINDS = ("liquidity_below", "risk_level_changed")


class AlertError(ValueError):
    pass


def _load() -> dict:
    try:
        d = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if isinstance(d, dict):
            d.setdefault("rules", [])
            d.setdefault("events", [])
            return d
    except (OSError, ValueError):
        pass
    return {"rules": [], "events": []}


def _save(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    state["events"] = state["events"][-MAX_EVENTS:]
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")


def list_state() -> dict:
    with _LOCK:
        s = _load()
        unread = sum(1 for e in s["events"] if not e.get("read"))
        return {"rules": s["rules"], "events": s["events"][-100:][::-1],
                "unread": unread, "cooldown_s": COOLDOWN_S,
                "kinds": list(KINDS)}


def add_rule(chain: str, token: str, kind: str, params: dict | None) -> dict:
    if kind not in KINDS:
        raise AlertError(f"kind must be one of {KINDS}")
    token = (token or "").strip()
    if not token:
        raise AlertError("token address required")
    params = params or {}
    rule = {"id": uuid.uuid4().hex[:12], "chain": chain, "token": token,
            "kind": kind, "params": params, "created_ts": time.time(),
            "last_level": None, "last_status": "created"}
    with _LOCK:
        s = _load()
        dup = [r for r in s["rules"] if r["chain"] == chain and r["token"] == token and r["kind"] == kind]
        if dup:
            raise AlertError("rule already exists for this token+kind")
        if len(s["rules"]) >= MAX_RULES:
            raise AlertError(f"rule cap reached ({MAX_RULES}) — delete one first")
        s["rules"].append(rule)
        _save(s)
    return rule


def delete_rule(rule_id: str) -> bool:
    with _LOCK:
        s = _load()
        before = len(s["rules"])
        s["rules"] = [r for r in s["rules"] if r["id"] != rule_id]
        changed = len(s["rules"]) < before
        if changed:
            _save(s)
        return changed


def mark_read(all_ids: bool = False, ids: list[str] | None = None) -> int:
    with _LOCK:
        s = _load()
        n = 0
        for e in s["events"]:
            if all_ids or (ids and e["id"] in ids):
                if not e.get("read"):
                    e["read"] = True
                    n += 1
        if n:
            _save(s)
        return n


def _append_event(state: dict, rule: dict, kind: str, severity: str,
                  message: str, evidence: dict) -> None:
    now = time.time()
    for e in state["events"]:
        if e.get("rule_id") == rule["id"] and e.get("kind") == kind \
                and now - e.get("ts", 0) < COOLDOWN_S:
            return                      # dedup + cooldown: same rule+kind window
    state["events"].append({
        "id": uuid.uuid4().hex[:12], "rule_id": rule["id"],
        "chain": rule["chain"], "token": rule["token"],
        "kind": kind, "severity": severity, "message": message,
        "evidence": evidence, "ts": now, "read": False,
        "delivery": "in_app",
    })


async def evaluate_rule(rule: dict, *, scan_chain_async=None) -> dict:
    """Evaluate ONE rule against live provider data. Returns the rule's new
    last_status. `scan_chain_async(chain, address)` is the server's own scan
    coroutine (injected to avoid an import cycle)."""
    out = {"rule_id": rule["id"], "events": 0, "status": "ok"}
    with _LOCK:
        state = _load()
        live = next((r for r in state["rules"] if r["id"] == rule["id"]), None)
        if live is None:
            out["status"] = "deleted"
            return out
        if rule["kind"] == "liquidity_below":
            try:
                from providers import dexscreener
                pair = dexscreener.fetch_pair(rule["chain"], rule["token"])
            except Exception as e:  # noqa: BLE001 — provider failure IS an event
                _append_event(state, rule, "provider_error", "LOW",
                              f"liquidity provider failed: {str(e)[:80]}",
                              {"provider": "dexscreener", "ts": time.time()})
                live["last_status"] = "provider_error"
                _save(state)
                out.update(events=1, status="provider_error")
                return out
            if pair is None:
                _append_event(state, rule, "insufficient_data", "LOW",
                              "no DexScreener pair for this token — liquidity unknown, nothing scored",
                              {"provider": "dexscreener", "ts": time.time()})
                live["last_status"] = "insufficient_data"
                _save(state)
                out.update(events=1, status="insufficient_data")
                return out
            liq = (pair.get("liquidity") or {}).get("usd")
            if liq is None:
                _append_event(state, rule, "insufficient_data", "LOW",
                              "pair found but liquidity field absent — no value invented",
                              {"pair": pair.get("pairAddress"), "ts": time.time()})
                live["last_status"] = "insufficient_data"
                _save(state)
                out.update(events=1, status="insufficient_data")
                return out
            min_usd = float((rule.get("params") or {}).get("min_usd") or 0)
            if liq < min_usd:
                _append_event(state, rule, "liquidity_below", "HIGH",
                              f"liquidity ${liq:,.0f} fell below your ${min_usd:,.0f} threshold",
                              {"liquidity_usd": liq, "threshold_usd": min_usd,
                               "pair": pair.get("pairAddress"), "ts": time.time()})
                out["events"] = 1
            live["last_status"] = "ok"
        elif rule["kind"] == "risk_level_changed":
            if scan_chain_async is None:
                out["status"] = "no_evaluator"
                return out

            scan = await scan_chain_async(rule["chain"], rule["token"])
            if scan is None:
                _append_event(state, rule, "insufficient_data", "LOW",
                              "no DexScreener pair — risk level unknown, nothing scored",
                              {"provider": "scan", "ts": time.time()})
                live["last_status"] = "insufficient_data"
                _save(state)
                out.update(events=1, status="insufficient_data")
                return out
            level = (scan.get("assessment") or {}).get("level")
            score = (scan.get("assessment") or {}).get("score")
            prev = live.get("last_level")
            live["last_level"] = level
            if prev is not None and level is not None and level != prev:
                _append_event(state, rule, "risk_level_changed", "HIGH",
                              f"risk level changed {prev} → {level} (score {score})",
                              {"from": prev, "to": level, "score": score,
                               "thresholds": "public in heuristics/rug_check.py",
                               "ts": time.time()})
                out["events"] = 1
            live["last_status"] = "ok"
        _save(state)
    return out


async def evaluate_all(scan_chain_async=None) -> dict:
    with _LOCK:
        rules = _load()["rules"]
    results = [await evaluate_rule(r, scan_chain_async=scan_chain_async) for r in rules]
    return {"evaluated": len(results), "results": results}
