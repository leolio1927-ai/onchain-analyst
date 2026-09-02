# VILMEI LAUNCH PLAN — v1 OFFICIAL
**Status:** RESMI — disetujui founder (diskusi 2026-09-01) · **Target launch v1:** SENIN, 7 SEPTEMBER 2026
**Dokumen induk:** dokumen ini adalah satu-satunya sumber kebenaran rencana launch. Perubahan rencana = edit dokumen ini + catat di §10 changelog.

---

## §1 · KEPUTUSAN STRATEGIS (DECISION LOG)

| # | Keputusan | Alasan |
|---|---|---|
| D1 | **VILMEI dan FLOXI = proyek TERPISAH.** Tidak ada merger/pembatalan. Integrasi lintas-proyek DITUNDA sampai keduanya launch (dicek ulang belakangan) | Masing-masing punya janji brand yang kuat dan berbeda: VILMEI = verifikasi tanpa dana; FLOXI = eksekusi dengan custody. Digabung sebelum launch = melemahkan keduanya |
| D2 | **VILMEI launch DULU, bertahap**: komunitas (5 surface) → token $VLM → fee/audit | 5 surface sudah live + hijau; ringan diluncurkan; mengumpulkan komunitas + modal operasional lebih cepat. FLOXI (stack berat, butuh modal 1 tahun) jalan di belakang TANPA tekanan — belum ada yang tahu FLOXI |
| D3 | **Venue token: pump.fun** (kemungkinan besar) — modal dari **creator rewards** (bagian fee trading ke creator), BUKAN dari jual token | Insentif selaras komunitas: founder untung dari volume yang sehat, bukan dari melempar token. Persentase reward diverifikasi ulang saat launch |
| D4 | **Terminal di-lock saat v1.** Tombol masuk terminal dinonaktifkan; terminal dikerjakan di belakang layar, launch bertahap sebagai news | Fokus komunitas ke 5 surface; terminal masuk sebagai momentum berita bertahap |
| D5 | **AI Analyst terminal = B.AI** (`deepseek-v4-flash`, terverifikasi live). Landing chat = `glm-5.3-flash`. NVIDIA bukan fallback | Latency NVIDIA buruk (G0); direktif founder P1-A, sudah dieksekusi commit `2d76b5f` |
| D6 | **Bot-trade di VILMEI (opsi gabung FLOXI engine) = DEFERRED.** Kandidat skema tersimpan di §8 | Menunggu kedua proyek launch; kalau jalan, wajib tab terpisah berlabel + penulisan ulang law-copy "0 trades" secara tertib |

## §2 · STATUS SAAT INI (snapshot 2026-09-01)

- 5 surface live di localhost:8000, satu DNA (sweep 5/5 zero-deviation), gates: **pytest 363 · vitest 144 · ruff · build** hijau.
- Ledger $RAY live: top-100 index (132.000 akun diwalk), VERIFY NOW browser, CSV, `?tab=` permalink, riwayat (mengakumulasi).
- AI: terminal analyst = B.AI `deepseek-v4-flash` (live terverifikasi SSE); landing chat = `glm-5.3-flash`; run-store JSONL (P1-B); alert engine (P1-C) live dengan evaluasi on-demand.
- Swap: ultra-premium pass + konek semua wallet (EIP-6963 + Solana Wallet Standard + demo) — quote-only, read-only law utuh.
- **Belum ada (blokir launch):** hosting publik, domain/SSL, community links, terminal lock UI, robots/sitemap/404, monitoring, secrets produksi.

## §3 · BUDGET OPERASIONAL 5 SURFACE (tanpa free-tier pain)

| Komponen | Biaya/bln | Catatan |
|---|---|---|
| VPS 2-4 vCPU/4-8GB (Hetzner/DO, Asia) | $10-30 | FastAPI + dist; beban per-user ringan (cache server-side 180s) |
| Domain | ~$1 (≈$12/thn) | Cloudflare gratis di depan (SSL + DDoS) |
| Helius Developer (Solana RPC) | ~$49 | **Satu-satunya wajib-bayar**: ledger top-100/byte-proof tanpa rate limit (verifikasi harga resmi saat launch) |
| GeckoTerminal + DexScreener + GoPlus | $0 | Free tier cukup selamanya untuk volume ini (caching server-side) |
| AI chat (B.AI) | $10-100 | Usage-based; langit-langit via `VILMEI_AI_DAILY_MAX_QUESTIONS` |
| Monitoring | $0-25 | Opsional |
| **TOTAL** | **~$70-205/bln** | Lean ~$70-80; nyaman ~$120-200. One-time: domain $12 |

Creator rewards pump.fun = income VARIABEL (fungsi volume pasca-graduation) — diposisikan sebagai pengisi kas operasional, bukan asumsi breakeven. Biaya tetap kecil ⇒ VILMEI bisa jalan berbulan-bulan tanpa revenue sekalipun.

## §4 · KALENDER 5 HARI (Rabu 2 → Senin 7 September 2026)

| Hari | Tanpa budget (prep + polish) | Output |
|---|---|---|
**RABU D1 (2/9)** | ✅ Dokumen ini · robots+sitemap · 404 branded · Terminal CTAs LOCKED · copy-sync blueprint landing · brief v2.1.0 §4 sync · config community links (hidden) | Tree siap launch |
| **KAMIS D2 (3/9)** | OG dinamis per token/halaman · audit copy seluruh 5 surface (semua klaim vs kode) · audit mobile khusus (screenshot semua breakpoint) | Polish visual tuntas |
| **JUMAT D3 (4/9)** | Hero live-verdict ticker (signature) · RSS/Atom roadmap · a11y pass · 404/edge states | Premium tuntas |
| **SABTU D4 (5/9)** | Dry-run deploy ke VPS lokal/staging (semua script siap) · launch-day runbook final · konten announcement draft (ID+EN) | Zero-surprise launch |
| **MINGGU D5 (6/9)** | Freeze + full gates + sweep final + screenshot dokumentasi · founder review visual | GO untuk budget |
| **SENIN D6 (7/9) — BUDGET DAY** | Beli VPS+domain → setup (systemd/Caddy/Cloudflare) → deploy → smoke test publik → unlock community links → **ANNOUNCE v1** | **v1 LIVE** |

Setelah launch: L2 token $VLM pump.fun (timing keputusan founder) → ledger switch $RAY→$VLM (satu env `LEDGER_MINT_ADDRESS` + labels) → L3 fee 0.50% + audit (F3).

## §5 · LAUNCH POLISH SPRINT (tanpa budget) — CHECKLIST

- [x] D1: robots.txt + sitemap.xml
- [x] D1: 404 branded (DNA, bukan default abu-abu)
- [x] D1: semua tombol masuk Terminal → **LOCKED · PHASED LAUNCH**
- [x] D1: copy-sync blueprint landing (status fitur = realita P1)
- [x] D1: brief v2.1.0 — §4 status sinkron (AI LIVE, alerts LIVE, machine surfaces)
- [x] D1: config community links — render otomatis saat URL diisi founder (minta: grup Telegram + akun X)
- [ ] D2: OG dinamis (per halaman + per verdict token)
- [ ] D2: copy-audit menyeluruh 5 surface (klaim = kode, termasuk angka)
- [ ] D2: mobile audit khusus (semua breakpoint, semua surface, screenshot)
- [ ] D3: hero live-verdict ticker (signature moment)
- [ ] D3: RSS/Atom roadmap (machine surface)
- [ ] D3: a11y pass (kontras, focus, aria)
- [ ] D4-D5: dry-run deploy + freeze + review founder

## §6 · L0 RUNBOOK — BUDGET DAY (Senin 7/9)

1. Beli VPS (2-4vCPU/4-8GB, Ubuntu 24.04, region Asia) + domain.
2. DNS → Cloudflare (proxied) → server IP.
3. Server setup: user non-root + SSH key + ufw (22/80/443) + uv + Node 24.
4. Deploy: clone repo → `uv sync` → `.env` produksi (BAI_API_KEY, HELIUS_API_KEY, VILMEI_AI_DAILY_MAX_QUESTIONS, LEDGER_MINT_ADDRESS) → `cd frontend && npm ci && npm run build` → systemd unit `vilmei.service` → Caddy reverse proxy (SSL otomatis).
5. Backup cron: `data/` → tar harian.
6. Smoke test publik: health, 5 surface render, ledger live, AI chat 200, alerts, 404.
7. Isi community URLs → links muncul → ANNOUNCE.

## §7 · ACCEPTANCE CRITERIA v1 LIVE

- 5 surface 200 + render benar dari domain publik, SSL valid
- Ledger: supply/mint/top-100 live + byte-proof jalan dari browser publik
- AI: landing chat menjawab (provenance `glm-5.3-flash`), terminal analyst 503-honest bila terminal terkunci
- Terminal: semua pintu LOCKED, route dalam tetap tidak diindeks (noindex)
- Gates hijau di server (pytest 363+, vitest 144+)
- Unread/units: tidak ada angka hardcode; semua label = implementasi

## §8 · DEFERRED REGISTRY (tersimpan, jangan hilang)

| Item | Kondisi reopen |
|---|---|
| P1-D Real Cluster Backend (endpoint + UI dari data scan) | Setelah v1 stabil — spec lengkap sudah di prompt P1-D |
| Integrasi FLOXI F-1 (pre-trade gate) / F-2 (MCP ke AI Studio) / F-3 (alert→Telegram) / F-4 (cross-engine verify) | Setelah FLOXI mendekati launch; desain sudah dibahas 2026-09-01 |
| Bot-trade di VILMEI (D6): opsi 1 swap=bot / opsi 3 tab "AGENT TRADE powered by FLOXI" / opsi 4 AI-justify human-approved | Setelah KEDUA proyek launch; wajib tab berlabel + rewrite law-copy tertib |
| RWA/attestation/x402/policy-execution | P2/P3 per audit report |

## §9 · RISKS

1. Helius/pump.fun harga & program bisa berubah → verifikasi saat eksekusi (D6).
2. Single VPS = single point → backup harian + redeploy runbook (10 menit pindah host).
3. AI budget bisa membengkak saat trafik naik → cap env deterministik.
4. Konten komunitas (announcement) = faktor sukses terbesar yang BUKAN kode → draft D4 wajib jadi.

## §10 · CHANGELOG
- 2026-09-01 — v1 dokumen dibuat (D1-D6, kalender D1-D6, sprint checklist, runbook, deferred registry).
