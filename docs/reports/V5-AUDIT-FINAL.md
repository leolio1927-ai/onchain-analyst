# V5 AUDIT FINAL — PROMPT-V5G (2026-08-31)

Auditor-eksekutor: setiap klaim diverifikasi ulang via curl/grep/test di sesi ini.
Minset "percaya tidak ada" dijalankan: chip LIVE, laporan fase lama, dan label
status semuanya diuji terhadap wire, bukan ingatan. 5 fase, 5 commit, NO PUSH.

## 1. Verdict G0 (basal, raw)

| probe (upstream langsung) | waktu mentah | hasil |
|---|---|---|
| GET /v1/models (auth) | 0.449s | 200 |
| POST bogus model (auth) | 0.424s | 404 — POST path hidup |
| POST tanpa auth | 0.407s | 401 |
| POST flash-0731 non-stream ×3 | 60.02s / 60.04s / 60.02s | hang, 0 byte, http=000 |
| POST kimi-k3 non-stream ×2 | 45.0s / 30.0s | hang, 0 byte |
| POST kimi + flash SSE | >90s | hang, tak ada header pun |

**VERDICT: UPSTREAM-STALL.** Jaringan, auth, routing, dan jalur balik respons
upstream semuanya sehat (200/404/401 dalam <0.5s); yang hang khusus request
inference model nyata → antrian free-tier NVIDIA, mengonfirmasi catatan stall
AI-1/AI-6 (hari ini kimi-k3 ikut stall, tidak hanya deepseek-v4). Bukan APP-BUG
untuk kematian jawaban — TAPI dua temuan app baru (di bawah).

**Temuan baru G0 (≥2 wajib):**
1. **[A] chunk-0 provenance terkunci di belakang blocking `open_stream`**
   (`server.py:683-689` lama): saat stall, user melihat 0 byte sampai 300s —
   target founder <300ms mustahil dengan struktur lama. → FIXED di G2.
2. **[A/B] Tanpa short-circuit**: request yang stall menumpuk thread + slot
   budget; request berikutnya dapat 429 upstream copy, bukan cooldown jujur
   yang cepat. → FIXED di G2 (circuit breaker).
3. (minor) surface enum = `terminal|landing`, bukan `dashboard` (ditemukan
   via 400 honest, bukan ingatan).

## 2. G1 — Tabel culpability semua chip LIVE

| modul | endpoint (grep wire) | curl 2× (≥90s jarak) | label == verdict? | severity |
|---|---|---|---|---|
| Dashboard feed | /api/v1/live/sol | r1 fresh (cached:false) → r2 cache-hit (cached:true); feed item berubah antar window | ✓ LIVE hanya saat data_mode=live | OK |
| Token Scanner | /api/v1/detect, /discovery | 200 live, dexscreener/geckoterminal | ✓ | OK |
| Rug Check | /api/v1/rug/sol/{mint} | 200 live rugcheck, byte stabil dalam window | ✓ | OK |
| Whale Tracker | /whales, /whale/windows, /whale/auto | r1→r2 whale_auto +116B = data BERUBAH (live nyata) | **✗ junk-key 401 → "unwired" salah cerita** | **A → FIXED** |
| Portfolio Watch | /api/v1/portfolio/snapshot | 200, byte berubah antar fetch | ✓ | OK |
| Holdings Check | /api/v1/holdings/sol/{addr} | 7.2s/7.5s (B: lambat), junk-key → coverage `upstream_error` + reason verbatim | ✓ honest | OK (B catat) |
| Swap rail | /api/v1/fees/estimate + destinations | 200 `data_mode: static` policy — SIMULATED desk jujur, deterministic | ✓ | OK |
| Fee Frontier | /fees/destinations (claimed/total 0/15) | 200 static, awaiting-founder konsisten | ✓ | OK |
| AI panel | /api/v1/ai/ask | G0: stall → lihat G2 | label dari provenance riil | G2 |
| Landing /live | /api/v1/live/{chain} ×5 | StatusChips LIVE/CACHED/STALE/IN BUILD dari flag server | ✓ | OK |
| Docs/Roadmap chip | static content | **✗ AI ANALYST masih `design` di diagram BRANCH + roadmap ta-104 `design` padahal live sejak AI-4** | drift | **B → FIXED** |
| MCP probe | POST /mcp tools/list | JSON-RPC sah, 7 tools | ✓ | OK |

Grep-hunt jalur error (`Math.random|placeholder|mock|stub|hardcod|canned`):
wallet mock terlabel `mock — preview only` (kind:'mock' vs 'live'), Math.random di
landing = animasi glyph, bukan data — **tidak ada LIVE-palsu**.

**Offline-truth (server :8124, semua key di-junk):** AI → 502 honest "upstream 403 —
key rejected" @0.78s ✓ · holdings → `upstream_error` + `helius: http_401` ✓ ·
whales → **`unwired` ✗ (S/A)** → FIXED: `partial` + `helius:http_401` (live-verified),
FE cabang PARTIAL amber baru; unwired kini hanya untuk chain yang memang tak di-engine
(note "null on this chain").

## 3. G2 — AI kilat (tabel latency raw, scratch :8123)

| Q | TTFB (chunk-0) | total | hasil wire |
|---|---|---|---|
| Q1 guide (brand) | **0.022s** | 20.82s | provenance → flash 10s → pro 10s → error honest "timed out" → [DONE] |
| Q2 guide | **0.007s** | 20.56s | sama (loss ke-2) |
| Q3 (ke-3) | **0.003s** | **0.0065s** | **short-circuit**: degraded:true, cooldown copy + sisa pause, ZERO upstream, tanpa charge |
| Q4 analyst + evidence | **0.028s** (dari 3.0s) | 23.4s | chunk-0 → provenance ke-2 (sources: scan+rug+fees) → error honest |
| Q5 trap (support level?) | 0.003s | 20.5s | error honest (plane stall; trap-refus tercover mock offline `test_trap_question…`) |
| burst 3× paralel | 0.010-0.023s | 20.65s | chain ×2 per request, semua error honest, tidak ada hang |

- Routing terpasang: FREE=deepseek-v4-flash-0731 (900 tok, 10s) → fallback
  deepseek-v4-pro-0813 (10s) → busy jujur. DEEP=kimi-k3 (25s, tanpa fallback).
- Provenance flush DI DALAM stream (`_ai_ask_lazy`): evidence + cache + open
  semuanya setelah chunk-0 → analyst 3.0s→28ms.
- Fallback yang menjawab me-relabel provenance (label law) — tested.
- MCP door = jalur yang sama (cooldown skip + fast budgets).
- FE: chip TTFB riil `first byte Nms` dari event pertama; panel UPSTREAM untuk
  error in-stream (interrupted ≠ done — tested); abort on unmount (tested);
  optimistic skeleton connecting di klik handler (<1 paint).
- **Deviasi jujur: LIVE ANSWER NOT CAPTURED** — plane stall sepanjang sesi
  (8 opens, 0-byte; error event honest setiap kali). Sesuai hukum prompt, tidak
  ada klaim "AI works"; verifikasi penuh = mock + timing raw + founder retry:

```
curl -N -H 'Content-Type: application/json' \
  -d '{"question":"What is VILMEI?","mode":"free","surface":"terminal"}' \
  http://127.0.0.1:8000/api/v1/ai/ask
```

## 4. G3 — brand + embroidery (before/after)

- Founder evidence DIPENUHI: logo `TERMINAL&nbsp;ALPHA` split-by-entity lolos
  gate lama di **3 tempat**: LiveBoard topnav (:108), landing footer (:1303),
  ChainLive topnav (:72) → semua jadi wordmark VILMEI.
- Band 6-warna kini SATU sumber: `tokens.css` `--emb-sol/bnb/base/hype/hood/avax`
  + `--emb-band` + `--emb-thread` (0 hex baru; chain tokens existing).
- 22 gradient band hardcoded di-de-dup → `var(--emb-thread)` (live 2, landing3 5,
  pages 5, docs 7, roadmap 7); landing accents + DocsPage chain map + risk colors
  → var.
- `.embroidery` utility (band + travelling stitch; reduced-motion = statis) pada
  3 surface terminal: sidebar, topbar, page-head.
- Gate baru `embroidery-gate.test.ts` 3/3: brand 0 aktif (split-proof,
  &nbsp;-normalized, hanya 1 kalimat rename-history DocsPage) · band-once (≥3 hex
  dalam satu baris di luar tokens.css = gagal) · ≥3 surface.

## 5. G4 — tech scan 2026 (detail di TECH-DECISIONS.md)

- **AMBIL**: Rolldown `output.advancedChunks` (jsx-runtime twins 190.29kB/59.89kB gz
  → `react-vendor` stabil 189.62kB/59.61kB gz) + `preconnect` assets.geckoterminal.com
  di live.html & terminal.html. $0, nol dep, diterapkan + gates hijau.
- **TOLAK**: useTransition untuk shimmer (skeleton sudah <1 paint; TTFB kini 22-28ms);
  SWR server cache (TTL + flag cached/stale jujur sudah ada).
- **BACKLOG**: WS tape board (route sudah ada; kerja UI VM-103).

## 6. Closeout gates (tree final, node v24.20.0)

- tsc: 0 error.
- vitest: **26 files / 131 tests ✓** (G0-G3 menambah 9: 6 pytest AI fast lane + 3
  gate G3; +2 pytest G1 whales; +3 vitest G2 AiPage). Satu flaky timing AiPage
  under full-suite load (rerun hijau; precedent ledger N0).
- pytest: **331 + 1 snapshot ✓** (dari 324; +7 whales/ai).
- ruff: All checks passed · oxlint: 15 pre-existing warn / 0 err (baseline parity).
- build ✓: react-vendor 59.61 kB gzip · dial3d 130.10 kB gzip ≤ 150 budget;
  raw >500 kB warning = **known-warning** (rolldown raw threshold; catat, tidak
  mengubah splitting tanpa keputusan — keputusan G4 tercatat).
- grep gates: `integrate.api` di frontend/src = **0** · literal `nvapi-` = **0** ·
  'terminal alpha' aktif = **0** (1 kalimat rename-history) · signing verbs = **0**.
- openapi snapshot test: 13/13 ✓ (schema tidak berubah di V5).
- .env.example update routing (FREE/DEEP/FALLBACK); founder .env tak disentuh.

## 7. Diffstat per fase

```
2015604 G0  docs(V5-G0)                        ledger +1 row
682bde1 G1  fix(V5-G1)  [S/A]   server.py · Dashboard.tsx · DocsPage.tsx · RoadmapPage.tsx · test_whales.py
c740ab0 G2  feat(V5-G2)         nvidia.py · ai_ask.py · server.py · Pages2.tsx · aiApi-related tests (+9)
29cc02e G3  feat(V5-G3)         tokens.css · live/pages/docs/roadmap/landing3.css · landing.tsx · LiveBoard/ChainLive/DocsPage.tsx · Shell.tsx · Pages2.tsx · gate test
5b19f4e G4  feat(V5-G4)         vite.config.ts · live/terminal.html · TECH-DECISIONS.md · .env.example
```

## 8. Deviasi jujur

1. LIVE AI answer tidak tertangkap sesi ini (plane stall; 8 opens 0-byte) —
   semua jalur terverifikasi mock + timing raw; retry command disediakan (§3).
2. 1 flaky vitest AiPage timing under full-suite load (rerun 131/131 hijau).
3. Holdings route 7.2-7.5s (B, target founder) — tidak di-fix sesi ini (bukan
   S/A); catat untuk fase berikut.

## 9. Founder restart block

```bash
cd ~/onchain-analyst
eval "$(.venv/bin/python -m webapp.envfile .env)"
.venv/bin/python -m webapp --host 127.0.0.1 --port 8000
# health check PATH BENAR:
curl -s http://127.0.0.1:8000/api/health   # 200
```

CATATAN: `/api/health` (BUKAN /api/v1/health — yang itu 404).

Review `git log` dulu — NO PUSH (push tugas founder).
