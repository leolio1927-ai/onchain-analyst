# UI-RESCUE — verifikasi AKHIR 2026-08-30 (state SESUDAH perubahan FE)

Mandat diterima hanya jika founder bisa klik Rug Check / Whale Tracker / Swap di UI
dan mendapat data nyata (atau alasan nyata), tanpa pill bohong. Semua bukti di bawah
ditangkap dari bundle produksi yang di-serve backend `:8000` (dist di-build ulang
2026-08-30) + curl rute yang relevan. Snapshot mentah scan: `logs/probes/*.json`.

## Gates
```
pytest 198 passed (+1 snapshot) · ruff: All checks passed · tsc -b: 0 error · vite build: OK
git: tidak ada push (law 8)
```

## Pill states baru (nav)
```
Rug Check      → LIVE   (sebelum: SOON)
Whale Tracker  → LIVE   (sebelum: SOON)
Cluster/AI/Alerts/Portfolio/Holdings/Gate/Settings/Docs/Feedback → SOON (tidak disentuh)
```

## Item 1 — Rug Check page LIVE, chain-aware
Selector 5 chain dari `/api/v1/chains`. sol → Helius authorities + mutable; bnb/base →
GoPlus flags verbatim; hood/hype → alasan catalog verbatim.

Bukti UI (sol BONK):
```
RUG FLAGS — BONK · SOL  [LIVE · helius + jupiter]
Update authorities  ⚠ 1 set — mint/metadata revocable
authority           9AhKqLR67hwapvG8SA2JFXaCshXc9nALJjpKaHZrsbkw
Mutable             ⚠ true — metadata can change
data_mode partial · scanned 2026-08-30T12:51:36Z
CONTEXT NOTES (VERBATIM): sol deployer: helius:create_tx_not_found
```
Bukti UI (hood):
```
RUG FLAGS — HOOD  [DECLARED NULL]
No rug-flag source on this chain
no security API covers robinhood at $0 (probe 2026-08-30)
```
Curl pendukung: `logs/probes/scan_sol_bonk.json`, `scan_base_aero.json`, `scan_hood_apu.json`.

## Item 2 & 3 — Whale Tracker LIVE + panel dashboard chain-aware, dua state berbeda
Halaman Whale Tracker (sol, threshold $1000):
```
WHALE TRANSFERS — SOL  [LIVE]
0 transfers ≥ $1000 in last 100 txs window
whales: helius enhanced txs (window=100 txs, threshold $1000.0) + dexscreener pair price
threshold $1000 · window 100 txs · price $0.000002973 · data_mode live
```
Halaman Whale Tracker (base):
```
WHALE TRANSFERS — BASE  [DECLARED NULL]
No $0 whale feed on this chain
whales:null on this chain — birdeye trade endpoints answer 404 on the free tier (probe 2026-08-30); no $0 trade feed exists
```
Panel whale @dashboard kini mengikuti token yang di-scan: analyze AERO (base) →
header `WHALE ACTIVITY — AERO · BASE` + badge DECLARED NULL + alasan verbatim
(sebelumnya header hardcoded "SOL · LIVE FEED").

## Item 4 — Chains served diturunkan dari catalog
```
Chains served  5 (sol, bnb, base, hood, hype)     ← dari /api/v1/chains, avax tidak mungkin bocor
```
(sebelum: "5 (avax, base, bnb, hood, sol)" dari /api/health server stale).

## Item 5 — Evidence duplikat dihapus
Evidence card kini memuat SATU baris "Wallet coordination" (sebelum ×2).
Baris clustering tetap muncul sekali di kartu verdict (signal ke-6) — tidak diubah.

## Item 6 — HYPE (SOON) di scanner
Scanner pill row kini menampilkan chip abu "HYPE (SOON)" sejajar dashboard.

## Item 7 — Swap jalan dengan kurs pair NYATA
Rail swap mengutip pair native-quoted nyata dari DexScreener (bukan echo mock):
```
SWAP [LIVE QUOTE]
YOU GET  1 SOL = 35,727,045 Bonk
Bonk $0.000002943 · liq $125,943 · orca
[OPEN ORCA PAIR ↗]   ← link eksternal; terminal read-only, tidak ada eksekusi
```
Sanity: BONK $2.943e-6 × 35.7M ≈ $105 ≈ harga SOL — konsisten. Opsi chain yang dulu
duplikat "ETH/ETH" kini "BASE · ETH" vs "HOOD · ETH". Chart/trades/hero tetap SIMULATED (TA-006).

## Dua bug backend yang wajib difix agar modul LIVE terbukti (commit terpisah)
1. `/api/scan` 500 bnb/base — GoPlus `lp_holders` (list) bocor ke `RugFlags` scalar-only.
2. `/api/scan` sol context selalu degrade — address di-lowercase sebelum `_enrich_scan`
   (mint solana case-sensitive). Lihat `ui-rescue-probe-2026-08-30.md`.
