# UI-RESCUE probe — 2026-08-30 (state BEFORE perubahan FE)

Mandat: FE harus membuktikan modul LIVE, bukan cuma API. Probe-first: setiap
temuan founder diverifikasi ulang terhadap stack yang berjalan SEBELUM kode
diubah. Stack saat probe: FE dist 2026-08-30 02:57 (== HEAD fase-7), backend
**STALE** (proses `python -m webapp` dari Aug 29, sebelum fase 1–7).

## 0. Temuan lintas-cutting: backend yang berjalan STALE

Proses lama (PID 990921, start Aug 29) tidak memuat rute fase-3/4:

```
$ curl http://127.0.0.1:8000/api/health            (server STALE)
{"status":"ok","chains":["avax","base","bnb","hood","sol"], ...}   ← avax residue

$ curl http://127.0.0.1:8000/api/v1/chains         (server STALE)
{"detail":"Not Found"}

$ curl http://127.0.0.1:8000/api/v1/whales/sol/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
{"detail":"Not Found"}
```

Setelah restart ke kode HEAD (dengan `.env` termuat — Helius key ada):

```
$ curl http://127.0.0.1:8000/api/health            (server HEAD)
{"status":"ok","chains":["base","bnb","hood","sol"],"tier":"free","ai_providers":[]}
```

avax hilang dari `/api/health` di HEAD — tetapi mandat UI-4 tetap berlaku:
string "Chains served" di FE harus diturunkan dari catalog `/api/v1/chains`
(5 chain termasuk hype), bukan dari literal/list apa pun.

## Dua bug backend NYATA ditemukan saat probe (fix minimal, verdict untouched)

1. **`/api/scan` 500 pada bnb/base** — `goplus.security_flags` meneruskan
   `lp_holders` (LIST of dict) ke `RugFlags` yang scalar-only
   (`Verbatim = str|float|int|None`) → ResponseValidationError. Probe:

   ```
   $ curl -X POST /api/scan {"chain":"base","address":"0x9401…8631"}   → HTTP 500
   ```

   Fix: `providers/goplus.py` berhenti meng-emit `lp_holders` (kontrak tidak
   berubah — field tetap absent/None).

2. **`/api/scan` sol context selalu degrade** — `api_scan` meneruskan
   `address.strip().lower()` ke `_enrich_scan`; mint solana case-sensitive →
   helius menjawab `no_asset` / `http_400` untuk SEMUA capability
   (deployer/holders/whales/rug_flags). Fix: `webapp/server.py` meneruskan
   address AS GIVEN (idents DB tetap di-lowercase di `_persist_scan`).

## Verifikasi 7 temuan founder (BEFORE)

| # | Temuan | Status verifikasi |
|---|--------|-------------------|
| 1 | Pill Rug Check & Whale Tracker SOON, halaman stub | CONFIRMED — `Shell.tsx` NAV `soon: true`; `RugCheckPage` render mock `$MEMEATCHI` tanpa chain selector; `WhalePage` render mock `WHALES_TOP` dengan badge "LIVE" palsu |
| 2 | Panel whale @dashboard: token BASE dengan header "SOL · LIVE FEED" | CONFIRMED — analyze AERO (base) → badge `/ BASE`, panel tetap `WHALE ACTIVITY (SOL · LIVE FEED)` (fetch hardcoded sol/BONK di `Dashboard.tsx:87`) |
| 3 | SOL valid + route live → FE "Whale feed unavailable" | CONFIRMED berlapis: di server stale rute 404 → `getWhales` null → "Whale feed unavailable". Di server HEAD, rute `unwired` (bnb/base) akan jatuh ke cabang "No transfers over threshold" — alasan declared-null tidak pernah tampil. Dua state memang tidak dibedakan |
| 4 | "Chains served 5 (avax, base, bnb, hood, sol)" | CONFIRMED di UI (snapshot dashboard) — sumber: `/api/health` server stale. Fix: derive dari catalog |
| 5 | Evidence: baris "Wallet coordination" ×2 | CONFIRMED — sinyal clustering sudah ada di `assessment.signals` (rug_check.py:120) DAN di-append lagi dari `clusteringEvidence` (Dashboard.tsx:259-266) |
| 6 | Scanner pill row: HYPE tidak muncul | CONFIRMED — Tabs scanner hanya 4 chain; dashboard punya chip `HYPE (SOON)`, scanner tidak |
| 7 | Swap "tidak jalan" | CONFIRMED — halaman render penuh (tidak crash), tapi: rate hardcoded `price = 0.0031` (1 SOL = 322.58 FOMO — menganggap SOL = $1, meleset ~200×), CTA `onClick={() => {}}` mati, dua opsi chain sama-sama berlabel "ETH" (base & hood) |

## Bukti curl SESUDAH restart + 2 fix backend (dasar flip pill)

```
$ curl "/api/v1/whales/sol/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263?threshold_usd=1000"
{"data_mode":"live","sources":["helius","dexscreener"],"chain":"sol",
 "price_usd":2.984e-6,"threshold_usd":1000.0,"window_txs":100,
 "transfers":[],"netflow":[],
 "data_sources":["whales: helius enhanced txs (window=100 txs, threshold $1000.0) + dexscreener pair price"]}
```
→ state "live, jendela sepi" (0 transfers ≥ threshold dalam 100 tx window).

```
$ curl "/api/v1/whales/base/0x940181a94A35A4569E4529A3CDfB74e38FD98631"
{"data_mode":"unwired","transfers":[],
 "data_sources":["whales:null on this chain — birdeye trade endpoints answer 404
                  on the free tier (probe 2026-08-30); no $0 trade feed exists"]}
```
→ state "declared null + alasan verbatim".

```
$ curl -X POST /api/scan {"chain":"sol","address":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}
context.rug_flags: {"update_authorities":["9AhKqLR67hwapvG8SA2JFXaCshXc9nALJjpKaHZrsbkw"],
                    "mutable":true, ...}
context.top10_share: 0.385814   sell_test: {"routable":true,"checked_via":"jupiter"}
notes: ["sol deployer: helius:create_tx_not_found"]   ← honest absence, BONK terlalu tua
```

```
$ curl -X POST /api/scan {"chain":"base","address":"0x940181a94A35A4569E4529A3CDfB74e38FD98631"}
context.rug_flags: {"is_honeypot":"0","buy_tax":"0","sell_tax":"0",
                    "holder_count":"751014", ...}     ← GoPlus verbatim
context.deployer: 0xe83f922C34A1962e9aE9F52B59e18239764f2818 (blockscout, kind eoa)
```

```
$ curl -X POST /api/scan {"chain":"hood","address":"0x0f03df65dace80e5e727b6c2628889c6d8ea20a6"}
context.rug_flags: null
notes: ["hood rug_flags: no security API covers robinhood at $0 (probe 2026-08-30)", ...]
```

```
$ curl /api/v1/chains
sol  scan=True  clustering=True  live_feed=True
bnb  scan=True  clustering=True  live_feed=True
base scan=True  clustering=True  live_feed=True
hood scan=True  clustering=False live_feed=True
hype scan=False clustering=False live_feed=True   ← hype scan SOON by catalog
```

Snapshot mentah tersimpan di `logs/probes/*.json` (tidak dicommit).
