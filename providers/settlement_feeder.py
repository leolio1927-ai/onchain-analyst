"""Settlement Lifecycle Simulator (Slot D.5).

DEV SIM FEED — ZERO EXTERNAL PROVIDER / NETWORK CALLS.
Drives the non-custodial settlement state machine using deterministic scenarios.
All state changes go through providers.settlement_repository.transition().

Invariant: Never hardcode COMPLETED without DEST_CONFIRMED and destination evidence.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from providers import settlement_repository as repo
from webapp.db import init_schema

TERMINAL_STATES: frozenset[str] = frozenset({
    "COMPLETED",
    "REFUNDED",
    "EXPIRED",
})

# ── Dataclasses ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SimStep:
    state_to: str
    reason: str
    source_evidence: bool = False
    dest_evidence: bool = False
    refund_supported: bool = False
    next_poll_delta_seconds: int | None = None
    evidence: Mapping[str, Any] | None = None
    source_tx: str | None = None
    dest_tx: str | None = None
    stuck_reason: str | None = None


@dataclass(frozen=True)
class SimScenario:
    quote_id: str
    provider: str
    src_chain: str
    dest_chain: str
    wallet: str
    amount_in: str
    amount_out_expected: str
    amount_out_min: str
    fee_expected_bps: int
    steps: tuple[SimStep, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class TickResult:
    quote_id: str
    state_from: str
    state_to: str
    event_id: int | None = None
    error: str | None = None


# ── Scenario Registry (Deterministic 8–12 Scenarios) ─────────────────────────

SIM_SCENARIOS: tuple[SimScenario, ...] = (
    # 1. LiFi Cross-Chain: Base -> Arbitrum (Complete Lifecycle)
    SimScenario(
        quote_id="q_sim_lifi_01",
        provider="lifi",
        src_chain="eip155:8453",
        dest_chain="eip155:42161",
        wallet="0xsim1111111111111111111111111111111111111111",
        amount_in="1.0 ETH",
        amount_out_expected="0.998 ETH",
        amount_out_min="0.990 ETH",
        fee_expected_bps=15,
        steps=(
            SimStep(
                state_to="SOURCE_CONFIRMED",
                reason="sim: origin deposit inclusion verified on Base sequencer",
                source_evidence=True,
                source_tx="sim:0x3a4b9c1d8e7f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b",
                evidence={"source": "sim_feeder", "block": 21984000},
            ),
            SimStep(
                state_to="SOLVER_FILLING",
                reason="sim: intent solver accepted cross-chain commitment",
                evidence={"source": "sim_feeder", "solver": "sim_taker_alpha"},
            ),
            SimStep(
                state_to="DEST_CONFIRMED",
                reason="sim: destination receipt confirmed on Arbitrum",
                dest_evidence=True,
                dest_tx="sim:0xbb2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
                evidence={"source": "sim_feeder", "dest_block": 18230000},
            ),
            SimStep(
                state_to="COMPLETED",
                reason="sim: cryptographic receipt verified, slippage satisfied",
                dest_evidence=True,
                dest_tx="sim:0xbb2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
                evidence={"source": "sim_feeder", "status": "closed"},
            ),
        ),
    ),
    # 2. Relay Fast Bridge: Base -> Arbitrum (250 USDC)
    SimScenario(
        quote_id="q_sim_relay_02",
        provider="relay",
        src_chain="eip155:8453",
        dest_chain="eip155:42161",
        wallet="0xsim2222222222222222222222222222222222222222",
        amount_in="250.0 USDC",
        amount_out_expected="249.45 USDC",
        amount_out_min="247.50 USDC",
        fee_expected_bps=12,
        steps=(
            SimStep(
                state_to="SOURCE_CONFIRMED",
                reason="sim: relay source deposit recorded",
                source_evidence=True,
                source_tx="sim:0xrelay_src_tx_250usdc",
                evidence={"source": "sim_feeder"},
            ),
            SimStep(
                state_to="DEST_CONFIRMED",
                reason="sim: relay relayer fulfilled destination leg",
                dest_evidence=True,
                dest_tx="sim:0xrelay_dest_tx_250usdc",
                evidence={"source": "sim_feeder"},
            ),
            SimStep(
                state_to="COMPLETED",
                reason="sim: terminal settlement finalized by relay proof",
                dest_evidence=True,
                dest_tx="sim:0xrelay_dest_tx_250usdc",
                evidence={"source": "sim_feeder", "status": "finalized"},
            ),
        ),
    ),
    # 3. Jupiter Same-Chain: Solana -> Solana (Atomic AMM)
    SimScenario(
        quote_id="q_sim_jupiter_03",
        provider="jupiter",
        src_chain="sol",
        dest_chain="sol",
        wallet="SimJupWalletSolana11111111111111111111111111",
        amount_in="10.0 SOL",
        amount_out_expected="1485.50 USDC",
        amount_out_min="1475.00 USDC",
        fee_expected_bps=10,
        steps=(
            SimStep(
                state_to="SOURCE_CONFIRMED",
                reason="sim: solana transaction slot confirmed",
                source_evidence=True,
                source_tx="sim:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp3aB4cC5dE6fG7hI8jK9lM0nO1pQ2rS3t",
                evidence={"source": "sim_feeder"},
            ),
            SimStep(
                state_to="DEST_CONFIRMED",
                reason="sim: same-chain swap receipt verified",
                dest_evidence=True,
                dest_tx="sim:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp3aB4cC5dE6fG7hI8jK9lM0nO1pQ2rS3t",
                evidence={"source": "sim_feeder", "same_chain": True},
            ),
            SimStep(
                state_to="COMPLETED",
                reason="sim: atomic execution verified on-chain",
                dest_evidence=True,
                dest_tx="sim:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp3aB4cC5dE6fG7hI8jK9lM0nO1pQ2rS3t",
                evidence={"source": "sim_feeder", "terminal": True},
            ),
        ),
    ),
    # 4. Mayan Cross-Chain: Ethereum -> Solana (Honest Stuck)
    SimScenario(
        quote_id="q_sim_mayan_04",
        provider="mayan",
        src_chain="eip155:1",
        dest_chain="sol",
        wallet="0xsim4444444444444444444444444444444444444444",
        amount_in="2.0 ETH",
        amount_out_expected="48.20 SOL",
        amount_out_min="47.50 SOL",
        fee_expected_bps=35,
        steps=(
            SimStep(
                state_to="SOURCE_CONFIRMED",
                reason="sim: deposit confirmed on origin block",
                source_evidence=True,
                source_tx="sim:0xmayan_src_deposit_hash",
                evidence={"source": "sim_feeder"},
            ),
            SimStep(
                state_to="STUCK_UNKNOWN",
                reason="no destination evidence at max_watch_until",
                stuck_reason="rpc_timeout",
                evidence={"source": "sim_feeder", "timeout_sec": 900},
            ),
        ),
    ),
    # 5. deBridge DLN: Arbitrum -> Base (Failure -> Refund Flow)
    SimScenario(
        quote_id="q_sim_debridge_05",
        provider="debridge",
        src_chain="eip155:42161",
        dest_chain="eip155:8453",
        wallet="0xsim5555555555555555555555555555555555555555",
        amount_in="500.0 USDC",
        amount_out_expected="498.50 USDC",
        amount_out_min="492.00 USDC",
        fee_expected_bps=18,
        steps=(
            SimStep(
                state_to="SOURCE_CONFIRMED",
                reason="sim: dln order created on origin",
                source_evidence=True,
                source_tx="sim:0xdebridge_src_hash",
                evidence={"source": "sim_feeder"},
            ),
            SimStep(
                state_to="FAILED",
                reason="sim: order cancelled due to market shift",
                evidence={"source": "sim_feeder"},
            ),
            SimStep(
                state_to="REFUND_AVAILABLE",
                reason="sim: emergency refund claim unlocked on origin contract",
                refund_supported=True,
                evidence={"source": "sim_feeder"},
            ),
            SimStep(
                state_to="REFUNDED",
                reason="sim: refund claimed, principal restored to user wallet",
                evidence={"source": "sim_feeder", "refunded": True},
            ),
        ),
    ),
    # 6. LiFi Reverted Swap: Arbitrum -> Ethereum
    SimScenario(
        quote_id="q_sim_lifi_failed_06",
        provider="lifi",
        src_chain="eip155:42161",
        dest_chain="eip155:1",
        wallet="0xsim6666666666666666666666666666666666666666",
        amount_in="5.0 ETH",
        amount_out_expected="4.99 ETH",
        amount_out_min="4.95 ETH",
        fee_expected_bps=15,
        steps=(
            SimStep(
                state_to="SOURCE_CONFIRMED",
                reason="sim: source tx included in block",
                source_evidence=True,
                source_tx="sim:0xlifi_fail_src_hash",
                evidence={"source": "sim_feeder"},
            ),
            SimStep(
                state_to="FAILED",
                reason="sim: slippage limit exceeded on origin dex leg",
                evidence={"source": "sim_feeder", "revert": "EXCESSIVE_SLIPPAGE"},
            ),
        ),
    ),
    # 7. Mayan Refund Action Required: Solana -> Base
    SimScenario(
        quote_id="q_sim_mayan_refund_07",
        provider="mayan",
        src_chain="sol",
        dest_chain="eip155:8453",
        wallet="SimMayanWalletSolana111111111111111111111111",
        amount_in="15.0 SOL",
        amount_out_expected="2200.0 USDC",
        amount_out_min="2190.0 USDC",
        fee_expected_bps=30,
        steps=(
            SimStep(
                state_to="SOURCE_CONFIRMED",
                reason="sim: wormhole lockup finalized on Solana",
                source_evidence=True,
                source_tx="sim:3qX7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7",
                evidence={"source": "sim_feeder"},
            ),
            SimStep(
                state_to="REFUND_AVAILABLE",
                reason="sim: wormhole VAA claim available for user redemption",
                refund_supported=True,
                evidence={"source": "sim_feeder", "vaa": "sim_vaa_payload"},
            ),
        ),
    ),
    # 8. Robinhood Unwired Chain (Must be skipped during seed)
    SimScenario(
        quote_id="q_sim_hood_08",
        provider="hood",
        src_chain="hood",
        dest_chain="eip155:8453",
        wallet="0x0000000000000000000000000000000000000000",
        amount_in="100.0 USD",
        amount_out_expected="100.0 USD",
        amount_out_min="99.0 USD",
        fee_expected_bps=0,
        steps=(),
    ),
    # 9. Expired Quote Scenario
    SimScenario(
        quote_id="q_sim_expired_09",
        provider="relay",
        src_chain="eip155:10",
        dest_chain="eip155:8453",
        wallet="0xsim9999999999999999999999999999999999999999",
        amount_in="50.0 USDC",
        amount_out_expected="49.85 USDC",
        amount_out_min="49.50 USDC",
        fee_expected_bps=12,
        steps=(
            SimStep(
                state_to="EXPIRED",
                reason="sim: quote TTL elapsed without source deposit broadcast",
                evidence={"source": "sim_feeder", "ttl_elapsed": True},
            ),
        ),
    ),
)


def canonical_provider_ok(provider: str) -> bool:
    """Return True if provider is supported by canonical settlement registry."""
    return provider.lower().strip() in repo.SETTLEMENT_PROVIDERS


def scenario_by_quote(quote_id: str) -> SimScenario | None:
    """Find scenario by exact quote_id."""
    for s in SIM_SCENARIOS:
        if s.quote_id == quote_id:
            return s
    return None


# ── Feeder Core Functions ───────────────────────────────────────────────────


def seed_settlements(
    conn: sqlite3.Connection,
    *,
    provider_filter: str | None = None,
    reset: bool = False,
) -> dict[str, int]:
    """Seed simulator settlement rows idempotently.

    - hood rows are skipped and counted in skipped_hood.
    - If reset=True: deletes existing simulator quote_ids by exact match.
    - Idempotent: safe to run multiple times.
    """
    init_schema(conn)

    sim_quote_ids = [s.quote_id for s in SIM_SCENARIOS]

    if reset:
        with conn:
            # Delete exact simulated quotes only
            placeholders = ",".join("?" for _ in sim_quote_ids)
            conn.execute(
                f"DELETE FROM settlement_events WHERE quote_id IN ({placeholders})",
                sim_quote_ids,
            )
            conn.execute(
                f"DELETE FROM settlement_state WHERE quote_id IN ({placeholders})",
                sim_quote_ids,
            )

    seeded = 0
    skipped_hood = 0
    errors = 0

    for scenario in SIM_SCENARIOS:
        # Rule: Hood scenarios must be skipped
        if (
            scenario.provider.lower() == "hood"
            or scenario.src_chain.lower() == "hood"
            or scenario.dest_chain.lower() == "hood"
        ):
            skipped_hood += 1
            continue

        if provider_filter and scenario.provider.lower() != provider_filter.lower():
            continue

        try:
            # If scenario has source tx hash for step 0, use it
            initial_src_tx = scenario.steps[0].source_tx if scenario.steps else None
            initial_reason = f"sim: created scenario {scenario.quote_id}"

            # Check if row already exists
            existing = conn.execute(
                "SELECT * FROM settlement_state WHERE quote_id = ?",
                (scenario.quote_id,),
            ).fetchone()

            if existing is None:
                created = repo.create_settlement(
                    conn,
                    quote_id=scenario.quote_id,
                    wallet=scenario.wallet,
                    provider=scenario.provider,
                    underlying_route_id=f"sim_route_{scenario.quote_id}",
                    src_chain=scenario.src_chain,
                    dest_chain=scenario.dest_chain,
                    amount_in=scenario.amount_in,
                    amount_out_expected=scenario.amount_out_expected,
                    amount_out_min=scenario.amount_out_min,
                    fee_expected_bps=scenario.fee_expected_bps,
                    initial_state="SUBMITTED_PENDING",
                    reason=initial_reason,
                    source_tx_hash=initial_src_tx,
                    dest_tx_hash=None,
                    evidence_payload={"source": "sim_feeder", "scenario": scenario.quote_id},
                )
                if created is not None:
                    seeded += 1
        except Exception:  # noqa: BLE001
            errors += 1

    return {"seeded": seeded, "skipped_hood": skipped_hood, "errors": errors}


def next_steps(
    conn: sqlite3.Connection,
    quote_row: Mapping[str, Any],
    *,
    now: datetime | None = None,
    scenarios: tuple[SimScenario, ...] = SIM_SCENARIOS,
) -> SimStep | None:
    """Pure helper to calculate the next step for a given settlement row."""
    quote_id = quote_row["quote_id"]
    current_state = quote_row["state"]

    if current_state in TERMINAL_STATES:
        return None

    scenario = None
    for s in scenarios:
        if s.quote_id == quote_id:
            scenario = s
            break

    if not scenario or not scenario.steps:
        return None

    # Find the current state in scenario steps, or advance to step 0
    step_indices = [i for i, st in enumerate(scenario.steps) if st.state_to == current_state]
    if not step_indices:
        # Currently at initial state (SUBMITTED_PENDING), take first step
        return scenario.steps[0]

    last_idx = step_indices[-1]
    if last_idx + 1 < len(scenario.steps):
        return scenario.steps[last_idx + 1]

    return None


def tick_settlements(
    conn: sqlite3.Connection,
    *,
    now: datetime | None = None,
    quote_id: str | None = None,
) -> list[TickResult]:
    """Advance active simulated settlements along their deterministic scenario steps.

    - Safe and idempotent.
    - Records error if transition is rejected; never assumes COMPLETED.
    """
    init_schema(conn)
    current_time = now or datetime.now(UTC)

    if quote_id:
        rows = conn.execute(
            "SELECT * FROM settlement_state WHERE quote_id = ?",
            (quote_id,),
        ).fetchall()
    else:
        # Scan unsettled rows only
        terminal_list = ",".join(f"'{s}'" for s in TERMINAL_STATES)
        rows = conn.execute(
            f"SELECT * FROM settlement_state WHERE state NOT IN ({terminal_list}) ORDER BY updated_at ASC",
        ).fetchall()

    results: list[TickResult] = []

    for r in rows:
        row_dict = dict(r)
        q_id = row_dict["quote_id"]
        from_state = row_dict["state"]

        step = next_steps(conn, row_dict, now=current_time)
        if not step:
            continue

        try:
            repo.transition(
                conn,
                quote_id=q_id,
                to_state=step.state_to,
                reason=step.reason,
                evidence=step.evidence or {"source": "sim_feeder"},
                source_tx=step.source_tx,
                dest_tx=step.dest_tx,
                refund_supported=step.refund_supported,
                stuck_reason=step.stuck_reason,
                expected_from_state=from_state,
            )

            # Update next_poll_at delta if provided
            if step.next_poll_delta_seconds:
                next_poll = (current_time + timedelta(seconds=step.next_poll_delta_seconds)).isoformat()
                with conn:
                    conn.execute(
                        "UPDATE settlement_state SET next_poll_at = ? WHERE quote_id = ?",
                        (next_poll, q_id),
                    )

            # Get latest event id
            ev_row = conn.execute(
                "SELECT id FROM settlement_events WHERE quote_id = ? ORDER BY id DESC LIMIT 1",
                (q_id,),
            ).fetchone()
            ev_id = ev_row["id"] if ev_row else None

            results.append(
                TickResult(
                    quote_id=q_id,
                    state_from=from_state,
                    state_to=step.state_to,
                    event_id=ev_id,
                )
            )
        except Exception as exc:  # noqa: BLE001
            results.append(
                TickResult(
                    quote_id=q_id,
                    state_from=from_state,
                    state_to=step.state_to,
                    error=str(exc),
                )
            )

    return results


def dev_advance_once(conn: sqlite3.Connection, *, quote_id: str | None = None) -> list[dict[str, Any]]:
    """Advance active simulated settlements by 1 step."""
    results = tick_settlements(conn, quote_id=quote_id)
    return [
        {
            "quote_id": r.quote_id,
            "state_from": r.state_from,
            "state_to": r.state_to,
            "event_id": r.event_id,
            "error": r.error,
        }
        for r in results
    ]


def dev_seed(conn: sqlite3.Connection, *, reset: bool = False) -> dict[str, int]:
    """Seed dev simulated settlement scenarios."""
    return seed_settlements(conn, reset=reset)


# ── CLI Interface ───────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description="Settlement Lifecycle Feeder (Dev Simulator)")
    parser.add_argument("action", choices=["seed", "tick", "status"], help="Feeder action to execute")
    parser.add_argument("--db", default=None, help="Database path (defaults to ALPHA_DB_PATH or local)")
    parser.add_argument("--reset", action="store_true", help="Reset simulator rows before seeding")
    parser.add_argument("--quote-id", default=None, help="Target specific quote_id")
    parser.add_argument("--pretty", action="store_true", help="Output human readable format")

    args = parser.parse_args()

    db_path = args.db or os.environ.get("ALPHA_DB_PATH") or ".sim-feeder.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    try:
        if args.action == "seed":
            res = seed_settlements(conn, reset=args.reset)
            if args.pretty:
                print(f"seeded={res['seeded']} skipped_hood={res['skipped_hood']} errors={res['errors']}")
            else:
                print(json.dumps(res))
            return 0 if res["errors"] == 0 else 1

        elif args.action == "tick":
            results = tick_settlements(conn, quote_id=args.quote_id)
            adv = len([r for r in results if not r.error])
            comp = len([r for r in results if r.state_to == "COMPLETED" and not r.error])
            stuck = len([r for r in results if r.state_to == "STUCK_UNKNOWN" and not r.error])
            errs = len([r for r in results if r.error])
            if args.pretty:
                print(f"tick advanced={adv} completed={comp} stuck={stuck} errors={errs}")
            else:
                print(
                    json.dumps(
                        {
                            "advanced": adv,
                            "completed": comp,
                            "stuck": stuck,
                            "errors": errs,
                            "items": [
                                {
                                    "quote_id": r.quote_id,
                                    "from": r.state_from,
                                    "to": r.state_to,
                                    "error": r.error,
                                }
                                for r in results
                            ],
                        }
                    )
                )
            return 0 if errs == 0 else 1

        elif args.action == "status":
            init_schema(conn)
            rows = conn.execute("SELECT state, count(*) as c FROM settlement_state GROUP BY state").fetchall()
            counts = {r["state"]: r["c"] for r in rows}
            total = sum(counts.values())
            if args.pretty:
                print(f"total={total} states={counts}")
            else:
                print(json.dumps({"total": total, "states": counts}))
            return 0
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
