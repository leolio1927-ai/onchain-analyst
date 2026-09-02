"""Deterministic swap policy and simulation boundary.

This module deliberately does not call a bridge, DEX, wallet, or signer. It
owns the safety vocabulary that every future quote/execution adapter must use:
chain-aware asset identity, provider allowlists, slippage/amount limits, and a
tri-state simulation gate. An AI or route provider can recommend; this module
is the deterministic choke point.
"""
from __future__ import annotations

import hashlib
import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any

CHAIN_IDENTITIES: dict[str, dict[str, Any]] = {
    "sol": {
        "name": "Solana",
        "namespace": "solana",
        "caip2": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        "native_symbol": "SOL",
        "execution_status": "quote_only",
        "reason": "provider adapter and simulation gate are not configured",
    },
    "bnb": {
        "name": "BNB Chain",
        "namespace": "eip155",
        "caip2": "eip155:56",
        "native_symbol": "BNB",
        "execution_status": "quote_only",
        "reason": "provider adapter and simulation gate are not configured",
    },
    "base": {
        "name": "Base",
        "namespace": "eip155",
        "caip2": "eip155:8453",
        "native_symbol": "ETH",
        "execution_status": "quote_only",
        "reason": "provider adapter and simulation gate are not configured",
    },
    "hype": {
        "name": "HyperEVM",
        "namespace": "eip155",
        "caip2": "eip155:999",
        "native_symbol": "HYPE",
        "execution_status": "unwired",
        "reason": "route and exact asset coverage are not configured",
    },
    "hood": {
        "name": "Robinhood Chain",
        "namespace": "eip155",
        # Kept null until the canonical production chain id is verified from
        # the official chain registry/provider used by the execution adapter.
        "caip2": None,
        "native_symbol": None,
        "execution_status": "unwired",
        "reason": "canonical chain id and route coverage require verification",
    },
}

PROVIDER_ALLOWLIST = frozenset({"lifi", "relay", "jupiter", "mayan", "debridge"})
MAX_SLIPPAGE_BPS = 500
MAX_AMOUNT_IN_DIGITS = 78
_EVM_ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")
_SOL_ADDRESS = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


class SwapPolicyError(ValueError):
    """A user/action input violates the deterministic swap policy."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def chain_identity(chain: str) -> dict[str, Any]:
    key = str(chain or "").strip().lower()
    row = CHAIN_IDENTITIES.get(key)
    if row is None:
        raise SwapPolicyError("unknown_chain", f"unknown chain '{key}'")
    return {"chain": key, **row}


def _address_valid(chain: str, token: str) -> bool:
    if token.lower() in ("native", "native:" + chain):
        return True
    if chain == "sol":
        return bool(_SOL_ADDRESS.fullmatch(token))
    return bool(_EVM_ADDRESS.fullmatch(token))


def validate_asset(chain: str, token: str) -> str:
    identity = chain_identity(chain)
    value = str(token or "").strip()
    if not value or not _address_valid(identity["chain"], value):
        raise SwapPolicyError("invalid_asset", f"invalid {identity['chain']} asset identifier")
    return value


def validate_amount(amount: str) -> str:
    value = str(amount or "").strip()
    if not value or len(value.replace(".", "").lstrip("+").lstrip("-") or "") > MAX_AMOUNT_IN_DIGITS:
        raise SwapPolicyError("invalid_amount", "amount_in must be a finite positive decimal")
    try:
        parsed = Decimal(value)
    except InvalidOperation as exc:
        raise SwapPolicyError("invalid_amount", "amount_in must be a finite positive decimal") from exc
    if not parsed.is_finite() or parsed <= 0:
        raise SwapPolicyError("invalid_amount", "amount_in must be a finite positive decimal")
    return value


def validate_slippage(slippage_bps: int) -> int:
    if isinstance(slippage_bps, bool) or not isinstance(slippage_bps, int):
        raise SwapPolicyError("invalid_slippage", "slippage_bps must be an integer")
    if slippage_bps < 0 or slippage_bps > MAX_SLIPPAGE_BPS:
        raise SwapPolicyError("slippage_cap", f"slippage_bps must be between 0 and {MAX_SLIPPAGE_BPS}")
    return slippage_bps


def provider_candidates(source_chain: str, destination_chain: str) -> list[str]:
    source = chain_identity(source_chain)["chain"]
    destination = chain_identity(destination_chain)["chain"]
    if source == destination == "sol":
        return ["jupiter", "lifi"]
    if "hood" in (source, destination) or "hype" in (source, destination):
        return ["lifi", "relay", "debridge"]
    if source == "sol" or destination == "sol":
        return ["lifi", "relay", "mayan", "debridge"]
    return ["lifi", "relay", "debridge"]


def simulation_gate(simulation: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return a fail-closed simulation decision.

    ``passed`` is the only state that can authorize a future execution path.
    Missing simulation is not interpreted as success; unavailable is not
    interpreted as safe.
    """
    state = str((simulation or {}).get("state") or "not_run").strip().lower()
    if state == "passed":
        return {"state": "passed", "allowed": True, "reason": "simulation passed"}
    if state == "reverted":
        return {"state": "reverted", "allowed": False, "reason": "simulation reverted"}
    if state == "unavailable":
        return {"state": "unavailable", "allowed": False, "reason": "simulation provider unavailable"}
    return {"state": "not_run", "allowed": False, "reason": "simulation is required before execution"}


def evaluate_quote(*, source_chain: str, destination_chain: str, token_in: str,
                   token_out: str, amount_in: str, slippage_bps: int = 50,
                   provider: str | None = None,
                   transaction_request: dict[str, Any] | None = None,
                   simulation_result: dict[str, Any] | None = None) -> dict:
    source = chain_identity(source_chain)
    destination = chain_identity(destination_chain)
    source_token = validate_asset(source["chain"], token_in)
    destination_token = validate_asset(destination["chain"], token_out)
    amount = validate_amount(amount_in)
    slippage = validate_slippage(slippage_bps)
    if provider is not None and provider not in PROVIDER_ALLOWLIST:
        raise SwapPolicyError("provider_not_allowed", f"provider '{provider}' is not allowlisted")
    candidates = provider_candidates(source["chain"], destination["chain"])
    if provider is not None and provider not in candidates:
        raise SwapPolicyError("provider_route_unsupported", f"provider '{provider}' is not configured for this route")
    # T2-E simulation gate, in-flow (never a second path): no route built →
    # quote_only with sim None and the explicit reason; a route WITHOUT a
    # simulation result is fail-closed 'simulation unavailable'; only a real
    # 'passed' result can ever allow execution.
    route_present = transaction_request is not None
    if not route_present:
        simulation = {"state": "not_run", "allowed": False,
                      "reason": "no route provider wired — quote policy only"}
        gate_reason = simulation["reason"]
        gate_allowed = False
    elif simulation_result is None:
        simulation = {"state": "unavailable", "allowed": False,
                      "reason": "simulation unavailable"}
        gate_reason = simulation["reason"]
        gate_allowed = False
    else:
        simulation = simulation_gate(simulation_result)
        gate_reason = simulation["reason"]
        gate_allowed = simulation["allowed"]
    execution_status = "unwired"
    if source["execution_status"] == "quote_only" and destination["execution_status"] == "quote_only":
        execution_status = "quote_only"
    execution_allowed = bool(gate_allowed and execution_status != "unwired")
    reasons = [gate_reason]
    if execution_status == "unwired":
        reasons.append(destination["reason"])
    return {
        "source_chain": source["chain"],
        "destination_chain": destination["chain"],
        "source_chain_caip2": source["caip2"],
        "destination_chain_caip2": destination["caip2"],
        "token_in": source_token,
        "token_out": destination_token,
        "amount_in": amount,
        "slippage_bps": slippage,
        "provider_requested": provider,
        "provider_candidates": candidates,
        "execution_status": execution_status,
        "policy": {
            "quote_allowed": True,
            "execution_allowed": execution_allowed,
            "reasons": reasons,
        },
        "simulation": simulation,
        "route": [],
        "amount_out": None,
        "minimum_received": None,
        "transaction_request": transaction_request,
    }


def capabilities() -> list[dict[str, Any]]:
    return [{"chain": chain, **info, "provider_candidates": provider_candidates(chain, chain)}
            for chain, info in CHAIN_IDENTITIES.items()]


def quote_id_for(*, source_chain: str, destination_chain: str, token_in: str,
                 token_out: str, amount_in: str, slippage_bps: int,
                 provider: str | None = None) -> str:
    """Deterministic idempotency key (T2-E): the SAME validated request always
    maps to the same quote_id, so a future execution path can map
    quote_id → submission and a retry can never double-submit. Fields are
    VERBATIM (amount/token strings are not re-formatted): any textual
    difference is a different request and MUST get a different id."""
    canonical = json.dumps({
        "v": 1,
        "src": chain_identity(source_chain)["chain"],
        "dst": chain_identity(destination_chain)["chain"],
        "in": str(token_in or "").strip(),
        "out": str(token_out or "").strip(),
        "amt": str(amount_in or "").strip(),
        "bps": int(slippage_bps),
        "prov": str(provider or "").strip().lower() or None,
    }, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]
