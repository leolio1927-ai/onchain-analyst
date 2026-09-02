"""Provider Settlement Status Normalizer (Slot D.3).

Draft provider status mapping based on docs/RESEARCH_SETTLEMENT_2026.md [TODAY_UNVERIFIED].
Founder must verify live docs before enabling production polling.

Normalizes raw provider payload representations into canonical settlement state inputs
without performing network calls, background polling, or premature COMPLETED leaps.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from providers import settlement_repository as repo

# ── Canonical Provider Enum ───────────────────────────────────────────────

class CanonicalProvider(StrEnum):
    LIFI = "lifi"
    RELAY = "relay"
    MAYAN = "mayan"
    JUPITER = "jupiter"
    DEBRIDGE = "debridge"


CANONICAL_PROVIDERS: frozenset[str] = frozenset(p.value for p in CanonicalProvider)


# ── Normalized Status Dataclasses ─────────────────────────────────────────

@dataclass(frozen=True)
class TransitionInput:
    to_state: str
    reason: str
    source_tx: str | None = None
    dest_tx: str | None = None
    evidence: dict[str, Any] | None = None
    refund_supported: bool = False
    stuck_reason: str | None = None


@dataclass
class NormalizedSettlementStatus:
    provider: str
    quote_id: str | None = None
    source_chain: str | None = None
    dest_chain: str | None = None
    raw_status: str | None = None
    proposed_state: str | None = None
    source_tx_hash: str | None = None
    dest_tx_hash: str | None = None
    has_source_evidence: bool = False
    has_dest_evidence: bool = False
    amount_dest_observed: str | None = None
    fee_actual_raw: dict[str, Any] | None = None
    refund_candidate: bool = False
    poll_hint: dict[str, Any] | None = None
    reason: str = ""
    unknown_reason: str | None = None
    transition_args: TransitionInput | None = None


# ── Provider Specific Parsers [TODAY_UNVERIFIED] ──────────────────────────

def parse_lifi(
    raw: Mapping[str, Any],
    *,
    quote_id: str | None = None,
    source_chain: str | None = None,
    dest_chain: str | None = None,
) -> NormalizedSettlementStatus:
    """Parse raw LI.FI status payload.

    Draft provider status mapping based on docs/RESEARCH_SETTLEMENT_2026.md [TODAY_UNVERIFIED].
    Founder must verify live docs before enabling production polling.
    """
    raw_status = raw.get("status")
    raw_status_str = str(raw_status).upper() if raw_status is not None else None
    substatus = str(raw.get("substatus") or "").upper()

    sending = raw.get("sending") or {}
    receiving = raw.get("receiving") or {}

    src_tx = sending.get("txHash") or raw.get("sendingTxHash") or raw.get("txHash")
    dst_tx = receiving.get("txHash") or raw.get("receivingTxHash") or raw.get("dest_tx_hash")
    amount_dest = receiving.get("amount") or raw.get("toAmount")

    has_src = bool(src_tx)
    has_dst = bool(dst_tx)

    fee_raw = raw.get("integratorFee") or raw.get("feeCosts")

    if raw_status_str == "DONE":
        if has_dst:
            proposed = "DEST_CONFIRMED"
            reason = f"LI.FI destination confirmed with tx {dst_tx}"
        else:
            # Done on source but destination hash absent — never jump to completed or dest_confirmed
            proposed = "SOLVER_FILLING"
            has_dst = False
            reason = "LI.FI reported DONE but destination tx evidence is missing"
    elif raw_status_str == "PENDING":
        proposed = "SOLVER_FILLING" if has_src else "SUBMITTED_PENDING"
        reason = f"LI.FI bridging in progress (substatus={substatus or 'NONE'})"
    elif raw_status_str == "FAILED":
        if substatus in ("REFUND_IN_PROGRESS", "REFUNDED", "REFUND_AVAILABLE"):
            proposed = "REFUND_AVAILABLE"
            reason = f"LI.FI route failed with refund candidate: {substatus}"
            return NormalizedSettlementStatus(
                provider="lifi",
                quote_id=quote_id,
                source_chain=source_chain,
                dest_chain=dest_chain,
                raw_status=raw_status_str,
                proposed_state=proposed,
                source_tx_hash=src_tx,
                dest_tx_hash=dst_tx,
                has_source_evidence=has_src,
                has_dest_evidence=has_dst,
                amount_dest_observed=amount_dest,
                fee_actual_raw=fee_raw,
                refund_candidate=True,
                reason=reason,
                transition_args=TransitionInput(
                    to_state=proposed,
                    reason=reason,
                    source_tx=src_tx,
                    dest_tx=dst_tx,
                    refund_supported=True,
                ),
            )
        proposed = "FAILED"
        reason = f"LI.FI route failed: {substatus or 'reverted'}"
    else:
        return NormalizedSettlementStatus(
            provider="lifi",
            quote_id=quote_id,
            source_chain=source_chain,
            dest_chain=dest_chain,
            raw_status=raw_status_str,
            proposed_state="STUCK_UNKNOWN",
            source_tx_hash=src_tx,
            dest_tx_hash=dst_tx,
            has_source_evidence=has_src,
            has_dest_evidence=False,
            reason="provider_status_unparsed",
            unknown_reason="unrecognized_lifi_status",
            transition_args=TransitionInput(
                to_state="STUCK_UNKNOWN",
                reason="provider_status_unparsed",
                stuck_reason="status_unparsable",
            ),
        )

    return NormalizedSettlementStatus(
        provider="lifi",
        quote_id=quote_id,
        source_chain=source_chain,
        dest_chain=dest_chain,
        raw_status=raw_status_str,
        proposed_state=proposed,
        source_tx_hash=src_tx,
        dest_tx_hash=dst_tx,
        has_source_evidence=has_src,
        has_dest_evidence=has_dst,
        amount_dest_observed=amount_dest,
        fee_actual_raw=fee_raw,
        refund_candidate=False,
        reason=reason,
        transition_args=TransitionInput(
            to_state=proposed,
            reason=reason,
            source_tx=src_tx,
            dest_tx=dst_tx,
            evidence={"lifi_status": raw_status_str, "substatus": substatus} if (has_dst or has_src) else None,
        ),
    )


def parse_relay(
    raw: Mapping[str, Any],
    *,
    quote_id: str | None = None,
    source_chain: str | None = None,
    dest_chain: str | None = None,
) -> NormalizedSettlementStatus:
    """Parse raw Relay status payload.

    Draft provider status mapping based on docs/RESEARCH_SETTLEMENT_2026.md [TODAY_UNVERIFIED].
    Founder must verify live docs before enabling production polling.
    """
    raw_status = raw.get("status")
    raw_status_str = str(raw_status).lower() if raw_status is not None else None

    src_tx = raw.get("inTxHash") or raw.get("depositTxHash") or raw.get("source_tx_hash")
    dst_tx = raw.get("outTxHash") or raw.get("fillTxHash") or raw.get("dest_tx_hash")
    amount_dest = raw.get("outAmount") or raw.get("amount_out")

    has_src = bool(src_tx)
    has_dst = bool(dst_tx)

    fee_raw = raw.get("appFee") or raw.get("relayerFee")

    if raw_status_str == "waiting_deposit":
        proposed = "SUBMITTED_PENDING"
        reason = "Relay waiting for origin deposit transaction"
    elif raw_status_str in ("pending_fill", "filling"):
        proposed = "SOLVER_FILLING"
        reason = "Relay solver filling liquidity on destination"
    elif raw_status_str in ("filled", "success"):
        if has_dst:
            proposed = "DEST_CONFIRMED"
            reason = f"Relay request filled with destination tx {dst_tx}"
        else:
            proposed = "SOLVER_FILLING"
            has_dst = False
            reason = "Relay reported filled but destination tx hash is absent"
    elif raw_status_str == "refunded":
        proposed = "REFUNDED"
        reason = "Relay deposit refunded to origin wallet"
        return NormalizedSettlementStatus(
            provider="relay",
            quote_id=quote_id,
            source_chain=source_chain,
            dest_chain=dest_chain,
            raw_status=raw_status_str,
            proposed_state=proposed,
            source_tx_hash=src_tx,
            dest_tx_hash=dst_tx,
            has_source_evidence=has_src,
            has_dest_evidence=has_dst,
            refund_candidate=True,
            reason=reason,
            transition_args=TransitionInput(
                to_state=proposed,
                reason=reason,
                source_tx=src_tx,
                dest_tx=dst_tx,
                refund_supported=True,
            ),
        )
    elif raw_status_str in ("failed", "fill_failed"):
        proposed = "FAILED"
        reason = f"Relay request failed: {raw.get('failureReason') or 'fill timeout'}"
    else:
        return NormalizedSettlementStatus(
            provider="relay",
            quote_id=quote_id,
            source_chain=source_chain,
            dest_chain=dest_chain,
            raw_status=raw_status_str,
            proposed_state="STUCK_UNKNOWN",
            source_tx_hash=src_tx,
            dest_tx_hash=dst_tx,
            has_source_evidence=has_src,
            has_dest_evidence=False,
            reason="provider_status_unparsed",
            unknown_reason="unrecognized_relay_status",
            transition_args=TransitionInput(
                to_state="STUCK_UNKNOWN",
                reason="provider_status_unparsed",
                stuck_reason="status_unparsable",
            ),
        )

    return NormalizedSettlementStatus(
        provider="relay",
        quote_id=quote_id,
        source_chain=source_chain,
        dest_chain=dest_chain,
        raw_status=raw_status_str,
        proposed_state=proposed,
        source_tx_hash=src_tx,
        dest_tx_hash=dst_tx,
        has_source_evidence=has_src,
        has_dest_evidence=has_dst,
        amount_dest_observed=amount_dest,
        fee_actual_raw=fee_raw,
        refund_candidate=False,
        reason=reason,
        transition_args=TransitionInput(
            to_state=proposed,
            reason=reason,
            source_tx=src_tx,
            dest_tx=dst_tx,
            evidence={"relay_status": raw_status_str} if (has_dst or has_src) else None,
        ),
    )


def parse_mayan(
    raw: Mapping[str, Any],
    *,
    quote_id: str | None = None,
    source_chain: str | None = None,
    dest_chain: str | None = None,
) -> NormalizedSettlementStatus:
    """Parse raw Mayan Finance status payload.

    Draft provider status mapping based on docs/RESEARCH_SETTLEMENT_2026.md [TODAY_UNVERIFIED].
    Founder must verify live docs before enabling production polling.
    """
    raw_status = raw.get("status")
    raw_status_str = str(raw_status).upper() if raw_status is not None else None

    src_tx = raw.get("sourceTxHash") or raw.get("initiateTxHash") or raw.get("swapHash") or raw.get("source_tx_hash")
    dst_tx = raw.get("destTxHash") or raw.get("fulfillTxHash") or raw.get("dest_tx_hash")
    amount_dest = raw.get("destAmount") or raw.get("amount_out")

    has_src = bool(src_tx)
    has_dst = bool(dst_tx)

    fee_raw = raw.get("referrerBps") or raw.get("fees")

    if raw_status_str == "INITIATED":
        proposed = "SUBMITTED_PENDING"
        reason = "Mayan swap initiated on source chain"
    elif raw_status_str == "IN_PROGRESS":
        proposed = "SOLVER_FILLING"
        reason = "Mayan auction in progress via Wormhole"
    elif raw_status_str == "FULFILLED":
        if has_dst:
            proposed = "DEST_CONFIRMED"
            reason = f"Mayan swap fulfilled on destination with signature {dst_tx}"
        else:
            proposed = "SOLVER_FILLING"
            has_dst = False
            reason = "Mayan reported FULFILLED but destination tx hash is absent"
    elif raw_status_str == "CLAIMABLE":
        proposed = "REFUND_AVAILABLE"
        reason = "Mayan swap unfulfilled; Wormhole VAA claimable for refund"
        return NormalizedSettlementStatus(
            provider="mayan",
            quote_id=quote_id,
            source_chain=source_chain,
            dest_chain=dest_chain,
            raw_status=raw_status_str,
            proposed_state=proposed,
            source_tx_hash=src_tx,
            dest_tx_hash=dst_tx,
            has_source_evidence=has_src,
            has_dest_evidence=has_dst,
            refund_candidate=True,
            reason=reason,
            transition_args=TransitionInput(
                to_state=proposed,
                reason=reason,
                source_tx=src_tx,
                dest_tx=dst_tx,
                refund_supported=True,
            ),
        )
    elif raw_status_str == "REFUNDED":
        proposed = "REFUNDED"
        reason = "Mayan swap refunded to origin wallet"
    elif raw_status_str in ("FAILED", "REVERTED"):
        proposed = "FAILED"
        reason = f"Mayan swap failed: {raw.get('error') or 'auction expired'}"
    else:
        return NormalizedSettlementStatus(
            provider="mayan",
            quote_id=quote_id,
            source_chain=source_chain,
            dest_chain=dest_chain,
            raw_status=raw_status_str,
            proposed_state="STUCK_UNKNOWN",
            source_tx_hash=src_tx,
            dest_tx_hash=dst_tx,
            has_source_evidence=has_src,
            has_dest_evidence=False,
            reason="provider_status_unparsed",
            unknown_reason="unrecognized_mayan_status",
            transition_args=TransitionInput(
                to_state="STUCK_UNKNOWN",
                reason="provider_status_unparsed",
                stuck_reason="status_unparsable",
            ),
        )

    return NormalizedSettlementStatus(
        provider="mayan",
        quote_id=quote_id,
        source_chain=source_chain,
        dest_chain=dest_chain,
        raw_status=raw_status_str,
        proposed_state=proposed,
        source_tx_hash=src_tx,
        dest_tx_hash=dst_tx,
        has_source_evidence=has_src,
        has_dest_evidence=has_dst,
        amount_dest_observed=amount_dest,
        fee_actual_raw=fee_raw,
        refund_candidate=False,
        reason=reason,
        transition_args=TransitionInput(
            to_state=proposed,
            reason=reason,
            source_tx=src_tx,
            dest_tx=dst_tx,
            evidence={"mayan_status": raw_status_str} if (has_dst or has_src) else None,
        ),
    )


def parse_jupiter(
    raw: Mapping[str, Any],
    *,
    quote_id: str | None = None,
    source_chain: str | None = "sol",
    dest_chain: str | None = "sol",
) -> NormalizedSettlementStatus:
    """Parse raw Jupiter / Solana RPC execution status payload.

    Draft provider status mapping based on docs/RESEARCH_SETTLEMENT_2026.md [TODAY_UNVERIFIED].
    Founder must verify live docs before enabling production polling.

    Jupiter is a same-chain Solana AMM aggregator. Same-chain signature confirmed
    can satisfy destination confirmation ONLY when source and destination are both 'sol'.
    Cross-chain requests with Jupiter are invalid and will never confirm destination.
    """
    raw_status = raw.get("confirmationStatus") or raw.get("status")
    raw_status_str = str(raw_status).lower() if raw_status is not None else None
    err = raw.get("err")

    sig = raw.get("signature") or raw.get("txid") or raw.get("source_tx_hash")
    amount_dest = raw.get("outAmount") or raw.get("amount_out")
    fee_raw = raw.get("platformFee") or raw.get("fee")

    is_same_chain = (str(source_chain or "").lower() == "sol" and str(dest_chain or "").lower() == "sol")

    has_src = bool(sig)
    has_dst = False

    if err is not None:
        proposed = "FAILED"
        reason = f"Solana transaction reverted with error: {err}"
        return NormalizedSettlementStatus(
            provider="jupiter",
            quote_id=quote_id,
            source_chain=source_chain,
            dest_chain=dest_chain,
            raw_status=raw_status_str,
            proposed_state=proposed,
            source_tx_hash=sig,
            dest_tx_hash=sig if is_same_chain else None,
            has_source_evidence=has_src,
            has_dest_evidence=False,
            refund_candidate=False,
            reason=reason,
            transition_args=TransitionInput(
                to_state=proposed,
                reason=reason,
                source_tx=sig,
                dest_tx=sig if is_same_chain else None,
            ),
        )

    if raw_status_str in ("confirmed", "finalized", "tx_complete"):
        if is_same_chain and has_src:
            # Atomic same-chain swap on Solana: confirmed signature is verified destination evidence
            proposed = "DEST_CONFIRMED"
            has_dst = True
            dst_tx = sig
            reason = f"Jupiter same-chain Solana transaction {sig} {raw_status_str}"
        else:
            # If not verified same-chain, source confirmation alone NEVER confirms destination
            proposed = "SOURCE_CONFIRMED"
            dst_tx = None
            has_dst = False
            reason = "Jupiter transaction confirmed on source, but not a verified same-chain Solana swap"
    elif raw_status_str == "processed":
        proposed = "SUBMITTED_PENDING"
        dst_tx = None
        has_dst = False
        reason = "Solana transaction processed in block, awaiting cluster confirmation"
    else:
        return NormalizedSettlementStatus(
            provider="jupiter",
            quote_id=quote_id,
            source_chain=source_chain,
            dest_chain=dest_chain,
            raw_status=raw_status_str,
            proposed_state="STUCK_UNKNOWN",
            source_tx_hash=sig,
            dest_tx_hash=None,
            has_source_evidence=has_src,
            has_dest_evidence=False,
            reason="provider_status_unparsed",
            unknown_reason="unrecognized_jupiter_status",
            transition_args=TransitionInput(
                to_state="STUCK_UNKNOWN",
                reason="provider_status_unparsed",
                stuck_reason="status_unparsable",
            ),
        )

    return NormalizedSettlementStatus(
        provider="jupiter",
        quote_id=quote_id,
        source_chain=source_chain,
        dest_chain=dest_chain,
        raw_status=raw_status_str,
        proposed_state=proposed,
        source_tx_hash=sig,
        dest_tx_hash=dst_tx,
        has_source_evidence=has_src,
        has_dest_evidence=has_dst,
        amount_dest_observed=amount_dest,
        fee_actual_raw=fee_raw,
        refund_candidate=False,
        reason=reason,
        transition_args=TransitionInput(
            to_state=proposed,
            reason=reason,
            source_tx=sig,
            dest_tx=dst_tx,
            evidence={"jupiter_status": raw_status_str, "same_chain": is_same_chain} if (has_dst or has_src) else None,
        ),
    )


def parse_debridge(
    raw: Mapping[str, Any],
    *,
    quote_id: str | None = None,
    source_chain: str | None = None,
    dest_chain: str | None = None,
) -> NormalizedSettlementStatus:
    """Parse raw deBridge DLN status payload.

    Draft provider status mapping based on docs/RESEARCH_SETTLEMENT_2026.md [TODAY_UNVERIFIED].
    Founder must verify live docs before enabling production polling.
    """
    raw_status = raw.get("status")
    raw_status_str = str(raw_status).lower() if raw_status is not None else None

    src_tx = raw.get("orderCreationTxHash") or raw.get("sourceTxHash") or raw.get("source_tx_hash")
    dst_tx = raw.get("fulfillTxHash") or raw.get("destTxHash") or raw.get("dest_tx_hash")
    amount_dest = raw.get("takeAmount") or raw.get("amount_out")

    has_src = bool(src_tx)
    has_dst = bool(dst_tx)

    fee_raw = raw.get("affiliateFeePercent") or raw.get("fees")

    if raw_status_str in ("created", "open"):
        proposed = "SOLVER_FILLING"
        reason = "deBridge DLN order created, awaiting taker fulfillment"
    elif raw_status_str in ("fulfilled", "claimed"):
        if has_dst:
            proposed = "DEST_CONFIRMED"
            reason = f"deBridge DLN order fulfilled with tx {dst_tx}"
        else:
            proposed = "SOLVER_FILLING"
            has_dst = False
            reason = "deBridge reported fulfilled but destination tx hash is absent"
    elif raw_status_str in ("ordercancelled", "cancelled", "sentunlock", "claimedunlock"):
        proposed = "REFUND_AVAILABLE"
        reason = f"deBridge order cancelled: {raw_status_str}; unlock available"
        return NormalizedSettlementStatus(
            provider="debridge",
            quote_id=quote_id,
            source_chain=source_chain,
            dest_chain=dest_chain,
            raw_status=raw_status_str,
            proposed_state=proposed,
            source_tx_hash=src_tx,
            dest_tx_hash=dst_tx,
            has_source_evidence=has_src,
            has_dest_evidence=has_dst,
            refund_candidate=True,
            reason=reason,
            transition_args=TransitionInput(
                to_state=proposed,
                reason=reason,
                source_tx=src_tx,
                dest_tx=dst_tx,
                refund_supported=True,
            ),
        )
    elif raw_status_str in ("expired", "failed"):
        proposed = "FAILED"
        reason = f"deBridge order failed: {raw.get('reason') or 'order expired'}"
    else:
        return NormalizedSettlementStatus(
            provider="debridge",
            quote_id=quote_id,
            source_chain=source_chain,
            dest_chain=dest_chain,
            raw_status=raw_status_str,
            proposed_state="STUCK_UNKNOWN",
            source_tx_hash=src_tx,
            dest_tx_hash=dst_tx,
            has_source_evidence=has_src,
            has_dest_evidence=False,
            reason="provider_status_unparsed",
            unknown_reason="unrecognized_debridge_status",
            transition_args=TransitionInput(
                to_state="STUCK_UNKNOWN",
                reason="provider_status_unparsed",
                stuck_reason="status_unparsable",
            ),
        )

    return NormalizedSettlementStatus(
        provider="debridge",
        quote_id=quote_id,
        source_chain=source_chain,
        dest_chain=dest_chain,
        raw_status=raw_status_str,
        proposed_state=proposed,
        source_tx_hash=src_tx,
        dest_tx_hash=dst_tx,
        has_source_evidence=has_src,
        has_dest_evidence=has_dst,
        amount_dest_observed=amount_dest,
        fee_actual_raw=fee_raw,
        refund_candidate=False,
        reason=reason,
        transition_args=TransitionInput(
            to_state=proposed,
            reason=reason,
            source_tx=src_tx,
            dest_tx=dst_tx,
            evidence={"debridge_status": raw_status_str} if (has_dst or has_src) else None,
        ),
    )


# ── Core Normalizer Dispatcher ────────────────────────────────────────────

def normalize_settlement_status(
    raw: Mapping[str, Any],
    *,
    provider: str | None = None,
    quote_id: str | None = None,
    source_chain: str | None = None,
    dest_chain: str | None = None,
) -> NormalizedSettlementStatus:
    """Normalize raw provider payload into a canonical NormalizedSettlementStatus.

    Rules:
    - Provider must be snake lowercase canonical.
    - Unknown provider or unparseable shape returns proposed_state='STUCK_UNKNOWN', reason='provider_status_unparsed'.
    - NEVER sets proposed_state='COMPLETED'.
    - If status suggests completion but only source chain/tx is present, never sets DEST_CONFIRMED.
    """
    prov = str(provider or raw.get("provider") or "").strip().lower()

    if prov not in CANONICAL_PROVIDERS:
        return NormalizedSettlementStatus(
            provider=prov,
            quote_id=quote_id,
            source_chain=source_chain,
            dest_chain=dest_chain,
            raw_status=str(raw.get("status")),
            proposed_state="STUCK_UNKNOWN",
            reason="provider_status_unparsed",
            unknown_reason=f"unknown_provider_{prov or 'missing'}",
            transition_args=TransitionInput(
                to_state="STUCK_UNKNOWN",
                reason="provider_status_unparsed",
                stuck_reason="provider_unverified",
            ),
        )

    parsers = {
        CanonicalProvider.LIFI: parse_lifi,
        CanonicalProvider.RELAY: parse_relay,
        CanonicalProvider.MAYAN: parse_mayan,
        CanonicalProvider.JUPITER: parse_jupiter,
        CanonicalProvider.DEBRIDGE: parse_debridge,
    }
    parser = parsers[CanonicalProvider(prov)]
    status = parser(
        raw,
        quote_id=quote_id,
        source_chain=source_chain,
        dest_chain=dest_chain,
    )

    # Invariant Guard: A parser must NEVER invent or return COMPLETED
    if status.proposed_state == "COMPLETED":
        raise repo.IllegalStateTransitionError(
            "Parser invariant violation: normalize_settlement_status must never output COMPLETED. "
            "COMPLETED is reserved exclusively for the repository layer with verified destination evidence."
        )

    return status


def to_transition_input(status: NormalizedSettlementStatus) -> TransitionInput | None:
    """Extract TransitionInput from a NormalizedSettlementStatus."""
    return status.transition_args


def apply_normalized_status(
    conn: Any,
    quote_id: str,
    status: NormalizedSettlementStatus,
) -> dict[str, Any] | None:
    """Apply normalized status transition to settlement_repository if transition_args are present."""
    args = to_transition_input(status)
    if args is None or args.to_state is None:
        return None

    return repo.transition(
        conn,
        quote_id=quote_id,
        to_state=args.to_state,
        reason=args.reason,
        evidence=args.evidence,
        source_tx=args.source_tx,
        dest_tx=args.dest_tx,
        refund_supported=args.refund_supported,
        stuck_reason=args.stuck_reason,
    )
