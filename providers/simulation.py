"""Transaction simulation gate (T2-E) — the fail-closed pre-execution check.

Every future execution path MUST route its built transaction_request through
``simulate()`` and ``execution_decision()`` before anything is submitted.
Rules enforced here:

- RPC endpoints come from env ONLY (VILMEI_SIM_RPC_<CHAIN>) — no default
  URLs, no provider hardcodes. A chain without its RPC configured reports
  ``unavailable``; it never pretends to have simulated.
- Only an explicit ``passed`` state can authorize execution. An exception,
  an unparseable payload, a missing field, an unknown response shape — all
  degrade to ``unavailable``/``reverted``, never to "assume it works".
- Asset-change summaries are parsed from what the simulator actually
  returns (EVM: eth_simulateV1 transfers; Solana: simulateTransaction
  reports NO balance deltas — that absence is stated, not papered over).
- Nothing here claims atomicity or guarantee. The verdict vocabulary is
  exactly: passed / reverted / unavailable / not_run.
"""
from __future__ import annotations

import json
import os
import urllib.request
from typing import Any

from providers import swap_policy

TIMEOUT_S = float(os.environ.get("VILMEI_SIM_TIMEOUT_S", "8"))

# env var NAME per chain — the URL value lives in the operator's .env only.
RPC_ENV_VARS = {
    "sol": "VILMEI_SIM_RPC_SOL",
    "bnb": "VILMEI_SIM_RPC_BNB",
    "base": "VILMEI_SIM_RPC_BASE",
    "hype": "VILMEI_SIM_RPC_HYPE",
    "hood": "VILMEI_SIM_RPC_HOOD",
}

# Solidity Error(string) selector — the standard revert-reason encoding.
_ERROR_SELECTOR = "0x08c379a0"


class SimulationUnavailable(RuntimeError):
    """The simulator could not be reached / answered unusably."""


def rpc_url(chain: str) -> str | None:
    """Per-call env read: flipping an RPC var needs no restart."""
    name = RPC_ENV_VARS.get(swap_policy.chain_identity(chain)["chain"])
    if name is None:
        return None
    value = os.environ.get(name, "").strip()
    return value or None


def rpc_configured(chain: str) -> bool:
    return rpc_url(chain) is not None


def _post_rpc(url: str, method: str, params: list) -> Any:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method,
                       "params": params}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/json",
                                          "User-Agent": "VILMEI-Terminal/1.0 (simulation)"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            if r.status != 200:
                raise SimulationUnavailable(f"HTTP {r.status} from simulation RPC")
            payload = json.loads(r.read().decode("utf-8"))
    except SimulationUnavailable:
        raise
    except Exception as exc:
        raise SimulationUnavailable(f"{exc.__class__.__name__}: {exc}") from exc
    if not isinstance(payload, dict) or "result" not in payload:
        raise SimulationUnavailable("simulation RPC returned no result envelope")
    return payload["result"]


def _decode_revert_reason(return_data: Any) -> str | None:
    """Decode Error(string) revert data; anything else is echoed truncated."""
    if not isinstance(return_data, str) or not return_data.startswith("0x"):
        return None
    try:
        raw = bytes.fromhex(return_data[2:])
    except ValueError:
        return None
    if raw[:4] != bytes.fromhex(_ERROR_SELECTOR[2:]):
        return (return_data[:66] + "…") if len(return_data) > 66 else return_data
    try:
        offset = int.from_bytes(raw[4:36], "big")
        start = 4 + offset
        length = int.from_bytes(raw[start:start + 32], "big")
        return raw[start + 32:start + 32 + length].decode("utf-8", "replace")
    except Exception:  # noqa: BLE001 — malformed ABI tail: echo hex, never guess
        return (return_data[:66] + "…") if len(return_data) > 66 else return_data


def _parse_transfers(transfers: Any) -> list[dict]:
    """eth_simulateV1 traceTransfers entries → honest asset-change rows.
    Fields the RPC does not supply are left out — nothing is inferred."""
    changes: list[dict] = []
    if not isinstance(transfers, list):
        return changes
    for t in transfers:
        if not isinstance(t, dict):
            continue
        row: dict[str, Any] = {}
        if isinstance(t.get("from"), str):
            row["from"] = t["from"]
        if isinstance(t.get("to"), str):
            row["to"] = t["to"]
        token = t.get("token")
        row["asset"] = token if isinstance(token, str) else "native"
        try:
            row["raw_value"] = str(int(str(t.get("value", "0x0")), 16))
        except (ValueError, TypeError):
            row["raw_value"] = None
        changes.append(row)
    return changes


def _result(state: str, reason: str, *, asset_changes: list[dict] | None = None,
            note: str | None = None, detail: dict | None = None) -> dict:
    return {"state": state, "allowed": state == "passed", "reason": reason,
            "asset_changes": asset_changes or [],
            "asset_summary_note": note,
            "detail": detail or {}}


def simulate_evm(transaction_request: dict, chain: str) -> dict:
    """eth_simulateV1 on the chain's configured RPC. Response-shape contract:
    result is a list of blocks whose calls each carry status/returnData and
    (with traceTransfers) the transfer list. ANY deviation → unavailable."""
    url = rpc_url(chain)
    if url is None:
        name = RPC_ENV_VARS.get(swap_policy.chain_identity(chain)["chain"], "")
        return _result("unavailable", f"simulation RPC for {chain} is not configured (set {name})")
    if not isinstance(transaction_request, dict):
        return _result("unavailable", "simulation request is not an object")
    call: dict[str, Any] = {}
    for key in ("from", "to", "data", "value", "gas"):
        if isinstance(transaction_request.get(key), str):
            call[key] = transaction_request[key]
    if "to" not in call or ("data" not in call and "value" not in call):
        return _result("unavailable", "simulation request incomplete — 'to' plus 'data' or 'value' required")
    params = [{"blockStateCalls": [{"calls": [call]}],
               "traceTransfers": True, "validation": True}]
    try:
        result = _post_rpc(url, "eth_simulateV1", params)
    except SimulationUnavailable as exc:
        return _result("unavailable", f"simulation unavailable: {exc}")
    blocks = result if isinstance(result, list) else []
    calls = [c for b in blocks if isinstance(b, dict) for c in (b.get("calls") or [])
             if isinstance(c, dict)]
    if not blocks or not calls:
        return _result("unavailable", "eth_simulateV1 response shape unrecognized — refusing to interpret it as a pass")
    changes = [ch for c in calls for ch in _parse_transfers(c.get("transfers"))]
    for c in calls:
        if str(c.get("status")) == "0x1":
            continue
        reason = _decode_revert_reason(c.get("returnData")) or \
            _decode_revert_reason(c.get("error")) or "call reverted (no decoded reason)"
        return _result("reverted", f"simulation reverted: {reason}",
                       asset_changes=changes, detail={"status": str(c.get("status"))})
    return _result("passed", "simulation passed", asset_changes=changes,
                   detail={"calls": len(calls)})


def simulate_solana(transaction_request: dict) -> dict:
    """Solana simulateTransaction on the configured RPC. err:null → passed.
    This method does NOT return balance deltas: asset_changes stay empty and
    the absence is stated verbatim — it is never read as an asset summary."""
    url = rpc_url("sol")
    if url is None:
        return _result("unavailable",
                       f"simulation RPC for sol is not configured (set {RPC_ENV_VARS['sol']})")
    tx = (transaction_request or {}).get("transaction_base64") \
        if isinstance(transaction_request, dict) else None
    if not isinstance(tx, str) or not tx:
        return _result("unavailable", "simulation request incomplete — transaction_base64 required")
    try:
        value = _post_rpc(url, "simulateTransaction",
                          [tx, {"sigVerify": False, "replaceRecentBlockhash": True,
                                "innerInstructions": False}])
        if not isinstance(value, dict) or "err" not in value and "logs" not in value:
            raise SimulationUnavailable("simulateTransaction response shape unrecognized")
    except SimulationUnavailable as exc:
        return _result("unavailable", f"simulation unavailable: {exc}")
    logs = value.get("logs") if isinstance(value.get("logs"), list) else []
    if value.get("err") is not None:
        err = json.dumps(value.get("err"), separators=(",", ":"))[:200]
        tail = logs[-1] if logs else ""
        return _result("reverted", f"simulation reverted: {err}{(' — ' + tail) if tail else ''}",
                       detail={"logs_tail": logs[-3:]})
    return _result(
        "passed", "simulation passed",
        note="solana simulateTransaction does not report balance deltas — "
             "asset summary is unavailable and is NOT claimed")


def simulate(chain: str, transaction_request: dict | None) -> dict:
    """The one door any future execution path uses. NEVER raises: every
    failure mode lands in an honest state the gate can refuse on."""
    try:
        identity = swap_policy.chain_identity(chain)
    except swap_policy.SwapPolicyError as exc:
        return _result("unavailable", f"simulation refused: {exc.message}")
    if transaction_request is None:
        return _result("unavailable", "simulation unavailable — no transaction request to simulate")
    try:
        if identity["namespace"] == "solana":
            return simulate_solana(transaction_request)
        return simulate_evm(transaction_request, identity["chain"])
    except Exception as exc:  # noqa: BLE001 — a broken simulator must block, never leak
        return _result("unavailable", f"simulation unavailable: {exc.__class__.__name__}: {exc}")


