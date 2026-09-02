"""Settlement State Machine & Persistence Repository (Slot D.2).

Enforces strict canonical state transitions, atomic database persistence,
non-custodial audit trails, and fail-closed settlement invariants.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime
from typing import Any

# ── Canonical Enums & Constants ───────────────────────────────────────────

SETTLEMENT_STATES: frozenset[str] = frozenset({
    "QUOTE_ONLY",
    "SUBMITTED_PENDING",
    "SOURCE_CONFIRMED",
    "SOLVER_FILLING",
    "DEST_CONFIRMED",
    "COMPLETED",
    "FAILED",
    "REFUND_AVAILABLE",
    "REFUNDED",
    "STUCK_UNKNOWN",
    "EXPIRED",
})

SETTLEMENT_PROVIDERS: frozenset[str] = frozenset({
    "lifi",
    "relay",
    "mayan",
    "jupiter",
    "debridge",
})

STUCK_REASONS: frozenset[str] = frozenset({
    "rpc_timeout",
    "breaker_open",
    "status_unparsable",
    "no_receipt",
    "provider_unverified",
})


# ── Domain Exceptions ─────────────────────────────────────────────────────

class SettlementError(Exception):
    """Base exception for settlement state machine errors."""


class SettlementNotFoundError(SettlementError, LookupError):
    """Raised when a settlement record for quote_id is not found."""


class IllegalStateTransitionError(SettlementError, ValueError):
    """Raised when an illegal or unverified state transition is attempted."""


# ── Helper: Explorer URLs ─────────────────────────────────────────────────

def explorer_tx_link(chain: str, tx_hash: str | None) -> str | None:
    """Return public explorer URL for a given transaction hash."""
    if not tx_hash:
        return None
    c = chain.lower().strip()
    explorers = {
        "sol": f"https://solscan.io/tx/{tx_hash}",
        "bnb": f"https://bscscan.com/tx/{tx_hash}",
        "base": f"https://basescan.org/tx/{tx_hash}",
        "hype": f"https://hyperscan.xyz/tx/{tx_hash}",
    }
    return explorers.get(c)


# ── Pure Transition Validator ─────────────────────────────────────────────

def can_transition(
    *,
    from_state: str,
    to_state: str,
    source_evidence: bool = False,
    dest_evidence: bool = False,
    refund_supported: bool = False,
    reason: str | None = None,
) -> tuple[bool, str]:
    """Validate whether a state transition is legal according to D.1 invariants.

    Pure function: zero DB dependencies. Used by test suites and transition().
    """
    if from_state not in SETTLEMENT_STATES:
        return False, f"unknown source state {from_state!r}"
    if to_state not in SETTLEMENT_STATES:
        return False, f"unknown target state {to_state!r}"

    # Self-transition is prohibited
    if from_state == to_state:
        return False, f"cannot transition from {from_state} to itself"

    # Terminal states have no outbound transitions
    if from_state in ("COMPLETED", "REFUNDED", "EXPIRED"):
        return False, f"terminal state {from_state} has no legal outbound transitions"

    # Invariant 1: COMPLETED can ONLY be reached from DEST_CONFIRMED with verified dest_evidence
    if to_state == "COMPLETED":
        if from_state != "DEST_CONFIRMED" or not dest_evidence:
            return False, "COMPLETED requires DEST_CONFIRMED + destination evidence; source submitted is NEVER COMPLETED"
        return True, "legal"

    # Invariant: source-submitted states cannot reach COMPLETED directly
    if from_state in ("SUBMITTED_PENDING", "SOURCE_CONFIRMED") and to_state == "COMPLETED":
        return False, "COMPLETED requires DEST_CONFIRMED + destination evidence; source submitted is NEVER COMPLETED"

    # Invariant: REFUND_AVAILABLE is legal ONLY if refund_supported is True
    if to_state == "REFUND_AVAILABLE":
        if not refund_supported:
            return False, "REFUND_AVAILABLE requires refund_supported=True for provider/route"
        if from_state not in ("SOURCE_CONFIRMED", "SOLVER_FILLING", "FAILED", "STUCK_UNKNOWN"):
            return False, f"REFUND_AVAILABLE cannot be reached from {from_state}"
        return True, "legal"

    # QUOTE_ONLY transitions
    if from_state == "QUOTE_ONLY":
        if to_state in ("SUBMITTED_PENDING", "EXPIRED", "FAILED"):
            return True, "legal"
        return False, f"QUOTE_ONLY can only transition to SUBMITTED_PENDING, EXPIRED, or FAILED (got {to_state})"

    # SUBMITTED_PENDING transitions
    if from_state == "SUBMITTED_PENDING":
        if to_state in ("SOURCE_CONFIRMED", "FAILED", "STUCK_UNKNOWN"):
            return True, "legal"
        return False, f"SUBMITTED_PENDING can only transition to SOURCE_CONFIRMED, FAILED, or STUCK_UNKNOWN (got {to_state})"

    # SOURCE_CONFIRMED transitions
    if from_state == "SOURCE_CONFIRMED":
        if to_state in ("SOLVER_FILLING", "DEST_CONFIRMED", "FAILED", "STUCK_UNKNOWN"):
            return True, "legal"
        return False, f"SOURCE_CONFIRMED cannot transition to {to_state}"

    # SOLVER_FILLING transitions
    if from_state == "SOLVER_FILLING":
        if to_state in ("DEST_CONFIRMED", "FAILED", "STUCK_UNKNOWN"):
            return True, "legal"
        return False, f"SOLVER_FILLING cannot transition to {to_state}"

    # DEST_CONFIRMED transitions
    if from_state == "DEST_CONFIRMED":
        if to_state in ("COMPLETED", "FAILED", "STUCK_UNKNOWN"):
            return True, "legal"
        return False, f"DEST_CONFIRMED cannot transition to {to_state}"

    # FAILED transitions
    if from_state == "FAILED":
        if to_state == "REFUND_AVAILABLE" and refund_supported:
            return True, "legal"
        return False, f"FAILED has no outbound transitions without refund_supported=True (attempted {to_state})"

    # REFUND_AVAILABLE transitions
    if from_state == "REFUND_AVAILABLE":
        if to_state in ("REFUNDED", "STUCK_UNKNOWN"):
            return True, "legal"
        return False, f"REFUND_AVAILABLE can only transition to REFUNDED or STUCK_UNKNOWN (got {to_state})"

    # STUCK_UNKNOWN transitions
    if from_state == "STUCK_UNKNOWN":
        if to_state in ("DEST_CONFIRMED", "FAILED"):
            return True, "legal"
        return False, f"STUCK_UNKNOWN cannot transition to {to_state}"

    return False, f"illegal transition from {from_state} to {to_state}"


# ── Database Operations ───────────────────────────────────────────────────

def create_settlement(
    conn: sqlite3.Connection,
    *,
    quote_id: str,
    wallet: str | None,
    provider: str,
    underlying_route_id: str,
    src_chain: str,
    dest_chain: str,
    initial_state: str = "SUBMITTED_PENDING",
    reason: str | None = None,
    amount_in: str | None = None,
    amount_out_expected: str | None = None,
    amount_out_min: str | None = None,
    fee_expected_bps: int | None = None,
    source_tx_hash: str | None = None,
    dest_tx_hash: str | None = None,
    evidence_payload: str | dict | None = None,
) -> dict[str, Any] | None:
    """Idempotently create a settlement_state row.

    Guards:
    - If dest_chain == 'hood' or 'UNAVAILABLE' (or src_chain == 'hood'): return None (no-op, DO NOT INSERT).
    - If provider is not in SETTLEMENT_PROVIDERS: raises ValueError.
    - If initial_state is not in SETTLEMENT_STATES: raises ValueError.
    - Idempotent: if row with quote_id exists, returns existing row without duplicating.
    """
    if not quote_id or not str(quote_id).strip():
        raise ValueError("quote_id is required")

    src = str(src_chain or "").strip().lower()
    dst = str(dest_chain or "").strip().lower()
    if dst in ("hood", "unavailable") or src in ("hood", "unavailable"):
        return None

    prov = str(provider or "").strip().lower()
    if prov not in SETTLEMENT_PROVIDERS:
        raise ValueError(f"unknown provider {provider!r}; allowed: {sorted(SETTLEMENT_PROVIDERS)}")

    if initial_state not in SETTLEMENT_STATES:
        raise ValueError(f"unknown state {initial_state!r}")

    # Check for existing row
    existing = conn.execute("SELECT * FROM settlement_state WHERE quote_id = ?", (quote_id,)).fetchone()
    if existing is not None:
        return dict(existing)

    claim_token = str(uuid.uuid4())
    now_iso = datetime.now(UTC).isoformat()
    ev_str = json.dumps(evidence_payload) if isinstance(evidence_payload, (dict, list)) else evidence_payload

    with conn:
        conn.execute(
            """
            INSERT INTO settlement_state (
                quote_id, wallet, provider, underlying_route_id,
                src_chain, dest_chain, state, reason,
                source_tx_hash, dest_tx_hash, amount_in,
                amount_out_expected, amount_out_min, fee_expected_bps,
                next_poll_at, max_watch_until, evidence_payload,
                stuck_reason, claim_token, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                quote_id, wallet, prov, underlying_route_id,
                src, dst, initial_state, reason,
                source_tx_hash, dest_tx_hash, amount_in,
                amount_out_expected, amount_out_min, fee_expected_bps,
                now_iso, None, ev_str,
                None, claim_token, now_iso, now_iso,
            ),
        )
        conn.execute(
            """
            INSERT INTO settlement_events (
                quote_id, state_from, state_to, event_type,
                reason, evidence_ref, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (quote_id, "NONE", initial_state, "created", reason, ev_str, now_iso),
        )

    row = conn.execute("SELECT * FROM settlement_state WHERE quote_id = ?", (quote_id,)).fetchone()
    return dict(row) if row else None


def get_settlement(conn: sqlite3.Connection, *, quote_id: str) -> dict[str, Any] | None:
    """Retrieve settlement state row by quote_id."""
    row = conn.execute("SELECT * FROM settlement_state WHERE quote_id = ?", (quote_id,)).fetchone()
    if row is None:
        return None
    return dict(row)


def get_settlement_events(conn: sqlite3.Connection, *, quote_id: str, limit: int = 10) -> list[dict[str, Any]]:
    """Retrieve append-only audit event log for a quote_id."""
    rows = conn.execute(
        """
        SELECT * FROM settlement_events
        WHERE quote_id = ?
        ORDER BY created_at ASC, id ASC
        LIMIT ?
        """,
        (quote_id, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def transition(
    conn: sqlite3.Connection,
    *,
    quote_id: str,
    to_state: str,
    reason: str,
    evidence: Any = None,
    source_tx: str | None = None,
    dest_tx: str | None = None,
    refund_supported: bool = False,
    stuck_reason: str | None = None,
    expected_from_state: str | None = None,
) -> dict[str, Any]:
    """Execute an atomic state transition on a settlement row in ONE BEGIN IMMEDIATE transaction.

    Locks the row, validates the legal transition via can_transition(), updates state,
    and appends an immutable event to settlement_events.
    """
    if to_state not in SETTLEMENT_STATES:
        raise ValueError(f"unknown target state {to_state!r}")

    if stuck_reason is not None and stuck_reason not in STUCK_REASONS:
        raise ValueError(f"unknown stuck_reason {stuck_reason!r}; allowed: {sorted(STUCK_REASONS)}")

    now_iso = datetime.now(UTC).isoformat()
    new_claim_token = str(uuid.uuid4())
    actual_stuck_reason = stuck_reason if to_state == "STUCK_UNKNOWN" else None

    # BEGIN IMMEDIATE transaction
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute("SELECT * FROM settlement_state WHERE quote_id = ?", (quote_id,)).fetchone()
        if row is None:
            raise SettlementNotFoundError(f"settlement row for quote_id {quote_id!r} not found")

        from_state = row["state"]
        if expected_from_state is not None and from_state != expected_from_state:
            conn.rollback()
            raise IllegalStateTransitionError(
                f"state conflict: expected {expected_from_state}, but current state is {from_state}"
            )

        has_src_ev = bool(source_tx or row["source_tx_hash"] or (evidence and "source" in str(evidence).lower()))
        has_dest_ev = bool(dest_tx or row["dest_tx_hash"] or (evidence and "dest" in str(evidence).lower()))

        legal, err_msg = can_transition(
            from_state=from_state,
            to_state=to_state,
            source_evidence=has_src_ev,
            dest_evidence=has_dest_ev,
            refund_supported=refund_supported,
            reason=reason,
        )
        if not legal:
            conn.rollback()
            raise IllegalStateTransitionError(err_msg)

        ev_str = json.dumps(evidence) if isinstance(evidence, (dict, list)) else (evidence or row["evidence_payload"])

        conn.execute(
            """
            UPDATE settlement_state SET
                state = ?,
                reason = ?,
                source_tx_hash = COALESCE(?, source_tx_hash),
                dest_tx_hash = COALESCE(?, dest_tx_hash),
                evidence_payload = ?,
                stuck_reason = ?,
                claim_token = ?,
                updated_at = ?
            WHERE quote_id = ?
            """,
            (
                to_state,
                reason,
                source_tx,
                dest_tx,
                ev_str,
                actual_stuck_reason,
                new_claim_token,
                now_iso,
                quote_id,
            ),
        )

        conn.execute(
            """
            INSERT INTO settlement_events (
                quote_id, state_from, state_to, event_type,
                reason, evidence_ref, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                quote_id,
                from_state,
                to_state,
                f"transition_{to_state.lower()}",
                reason,
                ev_str,
                now_iso,
            ),
        )

        conn.commit()
    except Exception:
        conn.rollback()
        raise

    updated = conn.execute("SELECT * FROM settlement_state WHERE quote_id = ?", (quote_id,)).fetchone()
    return dict(updated)
