# VILMEI SWAP DEVELOPMENT PROGRESS

## Baseline & Audit Summary (T2-E Verified)
- **Commit Baseline:** `fa39daa` ("T2-E: simulation gate + circuit breaker + quote idempotency + throttle/cache").
- **Working Tree:** Clean. 450 tests collected, T2-E modules verified in repo (`providers/swap_policy.py`, `providers/swap_circuit_breaker.py`, `providers/swap_quotes.py`, `webapp/swap_quote_state.py`, `providers/simulation.py`).
- **Validation Philosophy:** Fail-closed, non-custodial, honest degradation, fixture-first verification pre-T2-F.

---

## Status Sesi: Slot D.1 (Riset & Spesifikasi Settlement)
- **Status:** COMPLETED.
- **Output Artifacts:**
  - `docs/RESEARCH_SETTLEMENT_2026.md`: 4-part comprehensive settlement specification (5 provider tables, 11 canonical states + legal transition matrix, 4 core invariants, D.2/D.6 logical schema inputs, and 15-item Founder manual browser verification checklist).
  - `docs/KNOWN_FLAKE.md`: Documented concurrency resource timeout on full vitest suite in Windows/WSL.
- **Scope Compliance:**
  - 3 documentation files only.
  - Zero application code (`.py`, `.ts`, `.sql`) touched.
  - Zero unverified claims wrapped into terminal arguments.
- **Next Step:** Slot D.2 (Settlement State Machine & Persistence v5) completed.

---

## Status Sesi: Slot D.2 (Settlement Persistence + State Machine v5)
- **Status:** COMPLETED.
- **Database Migrations (`webapp/db.py`):**
  - Upgraded schema version to `SCHEMA_VERSION = 5` without modifying `_DDL_V4` (`swap_quotes`).
  - Added `_DDL_V5` defining `settlement_state` (21 columns, unique index on `quote_id`, composite index on `(state, next_poll_at)`) and `settlement_events` (8 columns, append-only, index on `(quote_id, created_at)`).
- **Service Layer (`providers/settlement_repository.py`):**
  - Canonical 11-state enum and 5-provider allowlist (`lifi, relay, mayan, jupiter, debridge`).
  - Implemented `create_settlement` with idempotent insert, Robinhood (`hood`) no-op rejection (returns `None`, zero insert).
  - Implemented pure invariant checker `can_transition(from_state, to_state, source_evidence, dest_evidence, refund_supported)`.
  - Implemented atomic `transition` inside single `BEGIN IMMEDIATE` transaction, row locking, `claim_token` UUID rotation, and append-only logging to `settlement_events`.
- **API Endpoint (`webapp/server.py` & `webapp/schemas.py`):**
  - `GET /api/v1/swap/settlement/{quote_id}` (read-only SQLite fetch; 503 if `ALPHA_DB_PATH` unset; 404 if absent; zero network/simulation calls).
  - Synchronized and verified `docs/reports/openapi-v1.snapshot.json`.
- **Verification Gates (WSL Linux):**
  - `uv run ruff check`: Clean (0 errors).
  - `uv run pytest tests/test_settlement_state.py -q -v`: 15 passed in 19.91s.
  - `uv run pytest -q`: **465 passed** in 119.72s (0 failed, 1 snapshot passed).
  - Total `swap + settlement` tests: **95 passed** (80 swap + 15 settlement; target >= 79).

---

## Status Sesi: Slot D.3 (Provider Settlement Status Normalizer)
- **Status:** COMPLETED.
- **Normalizer Module (`providers/settlement_status.py`):**
  - CanonicalProvider enum: `lifi`, `relay`, `mayan`, `jupiter`, `debridge`.
  - Parsers for all 5 providers: `parse_lifi`, `parse_relay`, `parse_mayan`, `parse_jupiter`, `parse_debridge`.
  - All parsers and module marked with `[TODAY_UNVERIFIED]` draft disclosure.
  - Fail-closed invariant: NO parser ever invents or returns `COMPLETED` (max state is `DEST_CONFIRMED`).
  - Same-chain rule: Jupiter same-chain confirmed signature maps to `DEST_CONFIRMED`; cross-chain or unconfirmed never maps to destination.
  - `to_transition_input` and `apply_normalized_status` pure/DB integration helper.
- **Test Suite (`tests/test_settlement_status.py`):**
  - 13 comprehensive mock-only tests covering all provider status mappings, invariant guards, same-chain branches, and atomic DB application.
- **Verification Gates (WSL Linux):**
  - `uv run ruff check`: Clean (0 errors).
  - `uv run pytest tests/test_settlement_status.py tests/test_settlement_state.py -q`: 28 passed in 68.14s.
  - `uv run pytest -q`: **478 passed** in 113.36s (0 failed, 1 snapshot passed).
  - Settlement tests collected: **28** (`test_settlement_*`).


