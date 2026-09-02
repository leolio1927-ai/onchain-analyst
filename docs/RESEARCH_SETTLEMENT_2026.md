# RESEARCH_SETTLEMENT_2026: Multi-Provider Settlement, State Machine & Reconciliation Specification

> **Status:** SLOT D.1 SPECIFICATION ONLY  
> **Scope:** Architecture, Provider Normalization, State Machine Invariants, and Fee Reconciliation Input  
> **Implementation Note:** Pre-T2-F phase has `execution_allowed=False` (no live tx submission path). All settlement watchers and status tracking must be designed for **fixture-first verification** (mock-submitted rows in database). No live RPC/API polling against non-existent transactions.  
> **Network/Verification Disclosure:** Generated in an offline environment without direct web browsing/scraping capability. All provider endpoint details, status field names, refund mechanisms, and rate limits are marked `[TODAY_UNVERIFIED]` pending Founder browser verification against root documentation URLs. None of the unverified values are permitted to act as criteria for terminal state transitions.

---

## BAGIAN 1 — Peta Mentah Per Provider (5 Provider: LI.FI, Relay, Mayan, deBridge, Jupiter)

### 1. LI.FI
| Kolom Wajib | Nilai / Deskripsi | Status Verifikasi |
|---|---|---|
| `source_url_root` | `https://docs.li.fi/` | `[TODAY_UNVERIFIED]` — root URL confirmed, internal paths require browser check |
| `status_query_mech` | Poll REST (`GET /v1/status?txHash=...`) | `[TODAY_UNVERIFIED]` |
| `status_field_raw` | `status` (`NOT_FOUND`, `PENDING`, `DONE`, `FAILED`), substatus in `substatus` | `[TODAY_UNVERIFIED]` |
| `terminal_evidence` | Destination transaction confirmed on destination chain (`receiving.txHash` present with receipt) + `status == "DONE"`. Source confirmation alone is strictly prohibited. | `[TODAY_UNVERIFIED]` |
| `failed_reasons` | Raw `substatus`: `REFUND_IN_PROGRESS`, `REFUNDED`, `EXPIRED`, `SLIPPAGE_EXCEEDED`, `NOT_ENOUGH_GAS` | `[TODAY_UNVERIFIED]` |
| `refund_path` | ADA / DEPENDS ON BRIDGE: Substatus exposes refund state. Some bridges auto-revert to source address; others require manual claim or claim transaction. Mechanism: `TODAY_UNVERIFIED — cek docs`. | `[TODAY_UNVERIFIED]` |
| `actual_fee_source` | Integrator fee field in quote/status payload: `integratorFee` or itemized `feeCosts` array. Used for `fee_reconciliation`. | `[TODAY_UNVERIFIED]` |
| `rate_limit` | Public free tier ~5-10 req/s or requires `x-lifi-api-key` header; exact figure: `TODAY_UNVERIFIED` | `[TODAY_UNVERIFIED]` |
| `dedup_key_hint` | `underlying_route_id` (bridge tool id e.g. `stargate`, `across`, `cctp` + source `txHash`) | `[TODAY_UNVERIFIED]` |
| `breaker_hook` | If `(lifi, chain, route-type)` breaker is OPEN: skip LI.FI status polling; inspect destination RPC directly if tx known, or mark `STUCK_UNKNOWN(reason="breaker_open")`. | `[TODAY_UNVERIFIED]` |

---

### 2. Relay
| Kolom Wajib | Nilai / Deskripsi | Status Verifikasi |
|---|---|---|
| `source_url_root` | `https://docs.relay.link/` | `[TODAY_UNVERIFIED]` — root URL confirmed |
| `status_query_mech` | Poll REST (`GET /requests/status?requestId=...`) or webhook callback | `[TODAY_UNVERIFIED]` |
| `status_field_raw` | `status` (`waiting_deposit`, `pending_fill`, `filled`, `refunded`, `failed`) | `[TODAY_UNVERIFIED]` |
| `terminal_evidence` | `status == "filled"` accompanied by destination transaction hash (`outTxHash`) confirmed on destination block receipt. | `[TODAY_UNVERIFIED]` |
| `failed_reasons` | `refunded`, `fill_failed`, `deposit_timeout`, `expired` | `[TODAY_UNVERIFIED]` |
| `refund_path` | ADA: Relay solver guarantees refund/origin reversal if origin deposit observed but solver cannot fill before timeout. Mechanism: `TODAY_UNVERIFIED — cek docs`. | `[TODAY_UNVERIFIED]` |
| `actual_fee_source` | `appFee` / `relayerFee` returned in request status payload, claimable via distributor contract. Used for `fee_reconciliation`. | `[TODAY_UNVERIFIED]` |
| `rate_limit` | Public REST tier approx ~60 req/min without API key; exact figure: `TODAY_UNVERIFIED` | `[TODAY_UNVERIFIED]` |
| `dedup_key_hint` | `underlying_route_id` (`requestId` from Relay quote or origin `depositTxHash`) | `[TODAY_UNVERIFIED]` |
| `breaker_hook` | If `(relay, chain, route-type)` breaker is OPEN: do not poll Relay status endpoint; fallback to direct destination RPC query or mark `STUCK_UNKNOWN(reason="breaker_open")`. | `[TODAY_UNVERIFIED]` |

---

### 3. Mayan Finance
| Kolom Wajib | Nilai / Deskripsi | Status Verifikasi |
|---|---|---|
| `source_url_root` | `https://docs.mayan.finance/` | `[TODAY_UNVERIFIED]` — root URL confirmed |
| `status_query_mech` | Poll REST (`GET /v3/swap/status/{swapHash}`) or Wormhole message observer | `[TODAY_UNVERIFIED]` |
| `status_field_raw` | `status` (`INITIATED`, `IN_PROGRESS`, `FULFILLED`, `REFUNDED`, `CLAIMABLE`, `FAILED`) | `[TODAY_UNVERIFIED]` |
| `terminal_evidence` | `status == "FULFILLED"` with destination settlement transaction hash confirmed on-chain. | `[TODAY_UNVERIFIED]` |
| `failed_reasons` | `REFUNDED`, `EXPIRED`, `UNFULFILLED`, `REVERTED` | `[TODAY_UNVERIFIED]` |
| `refund_path` | ADA: If route fails (auction unfulfilled), status transitions to `CLAIMABLE` on Mayan bridge via Wormhole VAA. Requires manual user claim transaction on destination/origin or Mayan UI. Mechanism: `TODAY_UNVERIFIED — cek docs`. | `[TODAY_UNVERIFIED]` |
| `actual_fee_source` | `referrerBps` / `referrerAddress` fee split emitted in swap event log or tracked on Mayan partner dashboard. Used for `fee_reconciliation`. | `[TODAY_UNVERIFIED]` |
| `rate_limit` | Public endpoints ~60 req/min; exact figure: `TODAY_UNVERIFIED` | `[TODAY_UNVERIFIED]` |
| `dedup_key_hint` | `underlying_route_id` (Mayan order hash `swapHash` or Wormhole sequence ID) | `[TODAY_UNVERIFIED]` |
| `breaker_hook` | If `(mayan, chain, route-type)` breaker is OPEN: cease Mayan API querying; fallback to Wormhole scan or mark `STUCK_UNKNOWN(reason="breaker_open")`. | `[TODAY_UNVERIFIED]` |

---

### 4. deBridge
| Kolom Wajib | Nilai / Deskripsi | Status Verifikasi |
|---|---|---|
| `source_url_root` | `https://docs.debridge.finance/` | `[TODAY_UNVERIFIED]` — root URL confirmed |
| `status_query_mech` | Poll REST (`GET /v1.0/dln/order/{orderId}/status`) or DLN webhook | `[TODAY_UNVERIFIED]` |
| `status_field_raw` | `status` (`Created`, `Fulfilled`, `SentUnlock`, `OrderCancelled`, `ClaimedUnlock`) | `[TODAY_UNVERIFIED]` |
| `terminal_evidence` | `status == "Fulfilled"` with `fulfillTxHash` confirmed on destination chain with block confirmations. | `[TODAY_UNVERIFIED]` |
| `failed_reasons` | `OrderCancelled`, `Expired`, `Cancelled` | `[TODAY_UNVERIFIED]` |
| `refund_path` | ADA: DLN order cancellation. If taker fails or deadline expires, user/maker triggers `cancelOrder` (or auto-unlock), emitting `SentUnlock` / `ClaimedUnlock` back to origin. Requires on-chain unlock. Mechanism: `TODAY_UNVERIFIED — cek docs`. | `[TODAY_UNVERIFIED]` |
| `actual_fee_source` | `integratorFee` percentage / amount taken on settlement event. Used for `fee_reconciliation`. | `[TODAY_UNVERIFIED]` |
| `rate_limit` | Public REST API ~10 req/s; exact figure: `TODAY_UNVERIFIED` | `[TODAY_UNVERIFIED]` |
| `dedup_key_hint` | `underlying_route_id` (DLN `orderId` 32-byte hash computed at order creation) | `[TODAY_UNVERIFIED]` |
| `breaker_hook` | If `(debridge, chain, route-type)` breaker is OPEN: skip deBridge API; inspect destination token balance or mark `STUCK_UNKNOWN(reason="breaker_open")`. | `[TODAY_UNVERIFIED]` |

---

### 5. Jupiter (Solana)
| Kolom Wajib | Nilai / Deskripsi | Status Verifikasi |
|---|---|---|
| `source_url_root` | `https://station.jup.ag/docs/` & `https://developers.jup.ag/` | `[TODAY_UNVERIFIED]` — root URLs confirmed |
| `status_query_mech` | Direct Solana RPC (`getSignatureStatuses` / `getTransaction`) since Jupiter is single-chain Solana AMM aggregator, or Jupiter Swap API execution service if routed through backend. | `[TODAY_UNVERIFIED]` |
| `status_field_raw` | Solana RPC `confirmationStatus` (`processed`, `confirmed`, `finalized`) + `err` (`null` vs error object) | `[TODAY_UNVERIFIED]` |
| `terminal_evidence` | Solana signature `confirmed` or `finalized` with `err == null` AND output token account balance increase verified. | `[TODAY_UNVERIFIED]` |
| `failed_reasons` | Instruction error (e.g. `Custom: 6000` slippage exceeded, insufficient funds, expired blockhash). | `[TODAY_UNVERIFIED]` |
| `refund_path` | NGGAK ADA (Atomic Revert): On Solana AMMs, an execution failure reverts atomically in the same transaction. No cross-chain bridge escrow is locked. Status is immediate `FAILED`, not dangling. | `[TODAY_UNVERIFIED]` |
| `actual_fee_source` | `platformFeeBps` SPL token transfer directed to VILMEI feeAccount mint inside transaction `meta.innerInstructions`. Used for `fee_reconciliation` per MINT. | `[TODAY_UNVERIFIED]` |
| `rate_limit` | Governed by Solana RPC node limits (Helius, Alchemy, public RPC); exact figure: `TODAY_UNVERIFIED` | `[TODAY_UNVERIFIED]` |
| `dedup_key_hint` | `underlying_route_id` (Solana transaction signature `txHash`) | `[TODAY_UNVERIFIED]` |
| `breaker_hook` | If `(jupiter, sol, same_chain)` breaker is OPEN: fallback to alternate RPC URL, or mark `STUCK_UNKNOWN(reason="rpc_timeout")`. | `[TODAY_UNVERIFIED]` |

---

## BAGIAN 2 — State Kanon + Matriks Transisi (DESAIN, Bukan SQL)

### 11 State Kanonis
1. `QUOTE_ONLY`: Quote dibuat dan tervalidasi policy. Belum ada transaksi yang disubmit ke chain.
2. `SUBMITTED_PENDING`: User menyiarkan transaksi ke chain asal. Menunggu konfirmasi blok sumber (Pre-T2-F: mock/fixture row only).
3. `SOURCE_CONFIRMED`: Transaksi sumber telah terkonfirmasi di chain asal (termasuk block confirmations).
4. `SOLVER_FILLING`: Untuk protokol intent/bridge (Relay, DLN, Mayan), solver atau market maker sedang memproses pengisian likuiditas.
5. `DEST_CONFIRMED`: Transaksi di chain tujuan telah terkonfirmasi on-chain dengan receipt valid (atau atomic swap selesai pada same-chain).
6. `COMPLETED`: Transaksi tujuan terkonfirmasi dengan bukti kriptografis/receipt DAN inisialisasi rekonsiliasi fee sukses (TERMINAL SUCCESS).
7. `FAILED`: Transaksi gagal secara terminal tanpa jalur refund otomatis (misal: atomic revert pada Solana atau order expired tanpa lock).
8. `REFUND_AVAILABLE`: Bridge/solver gagal mengisi, namun provider menyediakan jalur klaim atau pengembalian dana (NON-TERMINAL).
9. `REFUNDED`: Dana berhasil dikembalikan ke wallet pengguna di chain asal dengan bukti tx reversal (TERMINAL REFUND).
10. `STUCK_UNKNOWN`: Timeout watcher terlampaui, status provider tidak dapat dipastikan, atau circuit breaker open (DEGRADED HONEST TERMINAL).
11. `EXPIRED`: Quote kedaluwarsa sebelum transaksi disubmit ke chain (TERMINAL EXPIRED).

---

### Matriks Transisi Legal
```
[QUOTE_ONLY]
     │
     ├─ (user submit tx) ─────────────────────► [SUBMITTED_PENDING]
     ├─ (quote expired / TTL buffer) ─────────► [EXPIRED]
     └─ (policy rejection / failure) ─────────► [FAILED]

[SUBMITTED_PENDING]
     │
     ├─ (source tx confirmed on-chain) ───────► [SOURCE_CONFIRMED]
     ├─ (source tx reverted / dropped) ───────► [FAILED]
     └─ (watcher timeout / RPC unreachable) ──► [STUCK_UNKNOWN]
     * CATATAN: Transisi langsung ke [COMPLETED] DILARANG KERAS (REJECT).

[SOURCE_CONFIRMED]
     │
     ├─ (solver claimed order) ───────────────► [SOLVER_FILLING]
     ├─ (same-chain atomic swap confirmed) ───► [DEST_CONFIRMED]
     ├─ (bridge failure + refund path) ───────► [REFUND_AVAILABLE]
     ├─ (bridge failure + NO refund path) ────► [FAILED]
     └─ (cross-chain watcher timeout) ────────► [STUCK_UNKNOWN]
     * CATATAN: Transisi langsung ke [COMPLETED] DILARANG KERAS (REJECT).

[SOLVER_FILLING]
     │
     ├─ (destination tx confirmed + receipt) ──► [DEST_CONFIRMED]
     ├─ (solver timeout / expired + refund) ──► [REFUND_AVAILABLE]
     ├─ (solver failed without refund) ───────► [FAILED]
     └─ (max watch time exceeded) ────────────► [STUCK_UNKNOWN]

[DEST_CONFIRMED]
     │
     ├─ (dest_evidence verified + receipt) ───► [COMPLETED]
     └─ (unverifiable receipt / lag) ─────────► [STUCK_UNKNOWN]

[REFUND_AVAILABLE]
     │
     ├─ (refund tx confirmed on origin) ──────► [REFUNDED]
     └─ (claim window timeout / unverified) ──► [STUCK_UNKNOWN]

[STUCK_UNKNOWN]
     │
     ├─ (manual probe / re-fetch finds DEST) ─► [DEST_CONFIRMED]
     ├─ (manual probe finds refund ready) ────► [REFUND_AVAILABLE]
     └─ (manual probe confirms revert) ───────► [FAILED]
     * CATATAN: Transisi langsung ke [COMPLETED] DILARANG KERAS (REJECT).
```

---

### Pemetaan Status Mentah Provider ke State Internal

| Provider | Field Mentah | State INTERNAL | Bukti yang Dibutuhkan (Destination Evidence) |
|---|---|---|---|
| **LI.FI** | `"PENDING"` | `SUBMITTED_PENDING` / `SOLVER_FILLING` | Source tx hash terdaftar di explorer sumber |
| **LI.FI** | `"DONE"` | `DEST_CONFIRMED` | `receiving.txHash` terkonfirmasi di chain tujuan |
| **LI.FI** | `"FAILED"` + `REFUND_IN_PROGRESS` | `REFUND_AVAILABLE` | Substatus refund terdeteksi dari respons status |
| **Relay** | `"pending_fill"` | `SOLVER_FILLING` | Origin tx mined, solver sedang mengisi di dest |
| **Relay** | `"filled"` | `DEST_CONFIRMED` | `outTxHash` terkonfirmasi di chain tujuan |
| **Relay** | `"refunded"` | `REFUNDED` | Refund tx hash pada chain asal |
| **Mayan** | `"IN_PROGRESS"` | `SOLVER_FILLING` | Swap hash terdaftar di Mayan protocol |
| **Mayan** | `"FULFILLED"` | `DEST_CONFIRMED` | Destination settlement signature terverifikasi |
| **Mayan** | `"CLAIMABLE"` | `REFUND_AVAILABLE` | Wormhole VAA tersedia untuk klaim |
| **deBridge** | `"Created"` | `SOLVER_FILLING` | DLN order creation event terdeteksi |
| **deBridge** | `"Fulfilled"` | `DEST_CONFIRMED` | `fulfillTxHash` pada chain tujuan |
| **deBridge** | `"OrderCancelled"` | `REFUND_AVAILABLE` | Event pembatalan order pada origin |
| **Jupiter** | `confirmed`, `err=null` | `DEST_CONFIRMED` | Solana signature `confirmed` dengan balance delta |
| **Jupiter** | `confirmed`, `err!=null`| `FAILED` | Solana transaction error object |
| **Any Provider** | Timeout / Unreachable | `STUCK_UNKNOWN` | Waktu watch melebihi `max_watch_until` |

---

### 4 Invariant Wajib (Hukum Settlement VILMEI)

1. **COMPLETED hanya jika dest_evidence hadir:**  
   State `COMPLETED` HANYA boleh dicapai jika bukti tujuan (`dest_evidence`: destination chain, `dest_tx_hash`, block number/confirmations, minimum output token amount) terverifikasi secara nyata. `source_submitted` (`SUBMITTED_PENDING` atau `SOURCE_CONFIRMED`) DILARANG KERAS bertransisi langsung ke `COMPLETED`.
2. **STUCK_UNKNOWN bukan SUCCESS:**  
   Jika waktu pemantauan habis, endpoint provider mengalami timeout, atau circuit breaker terbuka, status dialihkan ke `STUCK_UNKNOWN` dengan alasan jujur (`rpc_timeout`, `breaker_open`, `status_unparsable`, `no_receipt`). UI wajib menampilkan peringatan "status tidak dapat dipastikan — cek manual di explorer", bukan loading spinner abadi atau klaim sukses.
3. **Robinhood Chain (`hood`) UNWIRE:**  
   `hood` memiliki `chain_id: null` pada `CHAIN_IDENTITIES`. Jalur settlement untuk `hood` = no-op jujur (UNAVAILABLE). Engine TIDAK melakukan polling, TIDAK membuat baris settlement di database, dan menolak pembuatan order dengan status `UNAVAILABLE`.
4. **Satu quote_id = Satu baris settlement_state:**  
   `quote_id` adalah Foreign Key 1:1 ke tabel `swap_quotes`. Tidak boleh ada orphan settlement row atau baris settlement paralel untuk quote yang sama. Deduplikasi bridge underlying dikunci menggunakan `underlying_route_id`.

---

## BAGIAN 3 — Input Spesifikasi D.2 (Nama Kolom & Tipe Logis, Bukan DDL/SQL)

### Model `settlement_state` (1 Baris = 1 Quote)
- `quote_id`: String (Primary Key, Foreign Key ke `swap_quotes.quote_id`, 1:1)
- `wallet`: String (Alamat wallet pembuat transaksi)
- `provider`: String (`lifi`, `relay`, `mayan`, `jupiter`, `debridge`)
- `underlying_route_id`: String (Kunci deduplikasi route bridge underlying)
- `src_chain`: String (`sol`, `bnb`, `base`, `hype`)
- `dest_chain`: String (`sol`, `bnb`, `base`, `hype`)
- `state`: String (Enum 11 canonical states)
- `reason`: String (Deskripsi alasan transisi status)
- `source_tx_hash`: String (Hash transaksi di chain asal, nullable)
- `dest_tx_hash`: String (Hash transaksi di chain tujuan, nullable)
- `amount_in`: String (Jumlah token input yang dikirim)
- `amount_out_expected`: String (Jumlah token output yang diperkirakan)
- `amount_out_min`: String (Batas minimum output berdasarkan slippage)
- `fee_expected_bps`: Integer (Expected fee dalam basis points)
- `next_poll_at`: Integer (Epoch timestamp jadwal polling berikutnya untuk worker D.4)
- `max_watch_until`: Integer (Epoch timestamp batas waktu pemantauan sebelum `STUCK_UNKNOWN`)
- `evidence_payload`: String/JSON (Payload bukti on-chain, block number, signature)
- `stuck_reason`: String (Enum: `rpc_timeout`, `breaker_open`, `status_unparsable`, `no_receipt`, `provider_unverified`)
- `claim_token`: String (UUID unik untuk locking aman worker background D.4)
- `claimed_by`: String (ID worker pengambil task, nullable)
- `claimed_at`: Integer (Epoch timestamp saat task di-claim worker)
- `created_at`: String (UTC ISO-8601 timestamp)
- `updated_at`: String (UTC ISO-8601 timestamp)

### Model `settlement_events` (Append-Only Audit Trail)
- `id`: Integer (Primary Key auto-increment)
- `quote_id`: String (Foreign Key ke `settlement_state.quote_id`)
- `state_from`: String (State asal sebelum transisi)
- `state_to`: String (State tujuan setelah transisi)
- `event_type`: String (Tipe event, misal: `created`, `transition_source_confirmed`, `transition_completed`)
- `reason`: String (Penjelasan transisi)
- `evidence_ref`: String/JSON (Referensi bukti terkait)
- `created_at`: String (UTC ISO-8601 timestamp)

### Spesifikasi `fee_reconciliation` (Input Desain D.6)
Rekonsiliasi fee **wajib berbasis pasangan `(chain, asset/mint)`**, BUKAN asumsi "USDC global":
- Pada Solana (`sol`), fee platform dikumpulkan per-SPL token mint di `feeAccount` token tersebut.
- Pada EVM (`base`, `bnb`), fee dikumpulkan per-token contract via transfer/hook fee.
- Kolom yang dibutuhkan: `quote_id`, `chain`, `asset_mint`, `expected_fee_bps`, `actual_fee_amount`, `actual_fee_source`, `status` (`PENDING`, `RECONCILED`, `DISCREPANCY`), `delta_bps`, `reconciled_at`.

---

## BAGIAN 4 — Checklist Verifikasi Manual Buat Founder (Browser Fetch)

Item-item berikut wajib diverifikasi oleh Founder menggunakan browser di dokumentasi resmi provider sebelum implementasi D.3/D.4:

- [ ] **LI.FI**: Cek endpoint status `GET /v1/status?txHash=...` dan daftar substatus refund di https://docs.li.fi/ [TODAY_UNVERIFIED]
- [ ] **LI.FI**: Cek parameter penarikan `integratorFee` dan rate limit API keyless di https://docs.li.fi/ [TODAY_UNVERIFIED]
- [ ] **Relay**: Cek endpoint status `GET /requests/status` dan field `outTxHash` di https://docs.relay.link/ [TODAY_UNVERIFIED]
- [ ] **Relay**: Cek webhook callback signature header dan claimable `appFee` distributor di https://docs.relay.link/ [TODAY_UNVERIFIED]
- [ ] **Mayan**: Cek endpoint status `/v3/swap/status` dan format `swapHash` di https://docs.mayan.finance/ [TODAY_UNVERIFIED]
- [ ] **Mayan**: Cek status `CLAIMABLE` Wormhole VAA dan prosedur klaim manual refund di https://docs.mayan.finance/ [TODAY_UNVERIFIED]
- [ ] **Mayan**: Cek struktur response `referrerBps` dan payout log di https://docs.mayan.finance/ [TODAY_UNVERIFIED]
- [ ] **deBridge**: Cek endpoint status DLN `/v1.0/dln/order/{orderId}/status` di https://docs.debridge.finance/ [TODAY_UNVERIFIED]
- [ ] **deBridge**: Cek mekanisme pembatalan order `cancelOrder` dan pelepasan escrow `SentUnlock` di https://docs.debridge.finance/ [TODAY_UNVERIFIED]
- [ ] **deBridge**: Cek field `affiliateFeePercent` / `integratorFee` pada DLN order di https://docs.debridge.finance/ [TODAY_UNVERIFIED]
- [ ] **Jupiter**: Cek ekstraksi `platformFeeBps` SPL token transfer dari `meta.innerInstructions` pada RPC `getTransaction` di https://developers.jup.ag/ [TODAY_UNVERIFIED]
- [ ] **Jupiter**: Cek penanganan transfer fee / tax pada Token-2022 mints di https://developers.jup.ag/ [TODAY_UNVERIFIED]
- [ ] **Robinhood Chain (`hood`)**: Konfirmasi `chain_id: null` -> settlement no-op jujur, tanpa polling di https://station.jup.ag/docs/ [TODAY_UNVERIFIED]
- [ ] **Rate Limits**: Konfirmasi batas rate limits keyless untuk 5 provider di dokumentasi masing-masing [TODAY_UNVERIFIED]
- [ ] **Timeout Policy**: Konfirmasi batas waktu maksimal bridging (30m fast bridge, 60m slow bridge) sebelum ditandai `STUCK_UNKNOWN` [TODAY_UNVERIFIED]
