# AUDIT REPORT — Terminal Alpha (onchain-analyst)

Tanggal: 2026-08-27 · Auditor: independen (read-only) · Scope: seluruh repo @ commit `723c4f2` (main)
Metode: baca langsung semua file kode + git metadata + grep menyeluruh. Tidak ada kode yang diubah, tidak ada app yang dijalankan.

---

## 1. RINGKASAN EKSEKUTIF

Enam prinsip §2 CATATAN_KERJA **semuanya PATUH** di level kode — tidak ada eksekusi transaksi, tidak ada custody, tidak ada klaim akurasi, verdict multi-sinyal dengan jalur "DATA KURANG" yang jujur. Kebocoran asumsi §10 **BERSIH**: tidak ada satu pun angka/klaim terlarang di kode, UI, atau snapshot. Masalah terbesar bukan compliance, tapi **dokumentasi basi dan repo hygiene**: §6 mengklaim fitur (top-holder, clustering) yang tidak ada, §7/§9 mengklaim grounding log "belum" padahal sudah jalan (`ai_analyst.py:122`), dan README mengklaim "holder distribution + wallet clustering" ke publik. Ada bug crash nyata: harga dengan `priceChange == -100` membagi nol di chart estimator. `.env.example` tertelan pattern `.env.*` di `.gitignore` sehingga **tidak ter-track git** — fresh clone kehilangan file yang dirujuk pesan error sendiri. Total: **P0 = 0, P1 = 6, P2 = 7**.

---

## 2. MATRIKS KEPATUHAN §2

| # | Prinsip | Status | Bukti |
|---|---------|--------|-------|
| 1 | Tidak ada eksekusi transaksi | ✅ PATUH | Satu-satunya network call adalah GET read-only `providers/dexscreener.py:13-15` (`api.dexscreener.com/latest/dex/tokens/...` via `urllib.request`). Grep `private key\|sign\|send\|execute\|swap\|place order` di seluruh `*.py`: nihil. Deps (`pyproject.toml:5-15`) tidak punya lib wallet/web3. |
| 2 | Tidak ada custody / private key | ✅ PATUH | `.env.example` hanya berisi API key AI provider (baris 5-15). UI hanya terima perintah `/load /verify /explain /help` (`ui/dashboard.py:140-158`) — tidak ada input key/saldo. |
| 3 | Free tidak boleh kurang akurat; tier atur KEDALAMAN | ✅ PATUH (dgn catatan) | `ai_analyst.py:145`: `max_tokens=400 if tier == "free" else 1000` — beda PANJANG saja, evidence & prompt identik. Catatan: UI meng-hardcode `"free"` (`ui/dashboard.py:195`), jalur "deep" belum terjangkau (token gate belum ada) → belum ada mekanisme penyabotase free. |
| 4 | AI evidence-first, tidak menambah fakta | ✅ PATUH (by design) | `_evidence()` membatasi subset field (`ai_analyst.py:62-85`); SYSTEM_PROMPT melarang fakta di luar `<evidence>` (`ai_analyst.py:22`); dipanggil dari satu-satunya jalur `explain()` (`ai_analyst.py:140-147`); dikunci test `tests/test_ai_analyst.py:22-27` (`"url" not in ev`, `"chainId" not in ev`). Kepatuhan aktual model saat runtime: PERLU VERIFIKASI. |
| 5 | Tidak ada klaim akurasi/jaminan cuan | ✅ PATUH di UI; ⚠️ README overclaim fitur (lihat Temuan #1) | Disclaimer UI: `ui/dashboard.py:107-108` ("BUKAN saran finansial … DYOR") + footer verify `:183`. Prompt secara eksplisit MELARANG kata "pasti"/"dijamin"/"akurasi tinggi" (`ai_analyst.py:23`). README belum punya disclaimer §12 (P2 #12). |
| 6 | Verdict gabungan sinyal, bukan biner satu sinyal; data kurang → jujur | ✅ PATUH | 5 sinyal berbobot `WEIGHTS` (`heuristics/rug_check.py:13`), `MIN_SIGNALS = 3` di bawah itu → `level="nodata"`, `score=None` (`rug_check.py:14,112-117`); catatan false-positive KOL/airdrop ditulis apa adanya (`rug_check.py:121`). |

---

## 3. REKONSILIASI DOKUMEN vs KODE

| Bagian | Klaim dokumen | Realita kode | Aksi |
|--------|---------------|--------------|------|
| §6 | "top holder concentration" sudah jalan | **TIDAK ADA** — `rug_check.py` punya 5 sinyal: liquidity, fdv_liq, vol_liq, buy_ratio, age (`rug_check.py:104-111`); tidak ada sinyal holder | update-dokumen |
| §6 | "clustering dasar (burst timing + amount uniformity)" sudah jalan | **TIDAK ADA** — tidak ada modul clustering di repo (structure: `providers/`, `heuristics/rug_check.py` saja) | update-dokumen |
| §6 | "sampel <8 wallet → tidak diskor" | Tidak ada konsep wallet sama sekali; analog terdekat `MIN_SIGNALS=3` untuk SINYAL (`rug_check.py:14`) | update-dokumen |
| §6 | "Belum ada: funding traceback / sniper DB / circular" | ✅ benar, konsisten — tidak ada | — |
| §7 | "Belum ada: grounding log" | **STALE — SUDAH ADA**: `_ground_log()` menulis `logs/grounding/YYYY-MM-DD.jsonl` (`ai_analyst.py:122-134`), dipanggil tiap `explain()` (`ai_analyst.py:147`), UI memberitahu user (`ui/dashboard.py:204`); commit `723c4f2` "grounding log per-provider" | update-dokumen |
| §7 | "tier free/deep" | Parameternya ada (`explain(..., tier=...)`, `ai_analyst.py:137,145`) tapi UI selalu kirim `"free"` (`ui/dashboard.py:195`); tidak ada token gate → "deep" tak terjangkau | update-dokumen (+ nanti tambah-kode token gate) |
| §7 | "multi-provider" | ✅ (tidak disebut eksplisit di §7; §9 hanya bilang "butuh ANTHROPIC_API_KEY") — realita: registry claude/glm/kimi (`ai_analyst.py:48-55`) | update-dokumen |
| §7 | "output JSON terstruktur" belum | ✅ benar — output plain text (`ai_analyst.py:115,148`) | — |
| §9 | `data_sources.py` | Tidak ada → sekarang `providers/dexscreener.py` | update-dokumen |
| §9 | `trade_feed.py` (kerangka) | Tidak ada file maupun penggantinya (GeckoTerminal belum onboarding) | update-dokumen |
| §9 | `clustering.py` (kerangka) | Tidak ada | update-dokumen |
| §9 | `rug_check.py` | Ada tapi pindah lokasi: `heuristics/rug_check.py` | update-dokumen |
| §9 | `whale_tracker.py` (kerangka) | Tidak ada (Helius belum) | update-dokumen |
| §9 | `token_gate.py` (kerangka) | Tidak ada sama sekali | update-dokumen |
| §9 | `ai_analyst.py` "butuh ANTHROPIC_API_KEY; grounding log belum" | File ada ✅ tapi **dua klaim stale**: sekarang multi-provider (ANTHROPIC/GLM/KIMI, `ai_analyst.py:48-55`) DAN grounding log sudah jalan | update-dokumen |
| §9 | `ui/app.py` (MVP jalan; /load, /verify, chat) | Nama/jalur salah: sekarang entry point `app.py` di root + layar `ui/dashboard.py`; perintahnya `/load /verify /explain /help` (`ui/dashboard.py:141`) — tidak ada "chat" bebas | update-dokumen |
| §9 (dua arah) | Fitur di kode yang TIDAK tercatat: `webserve.py` (web mode textual-serve, `webserve.py:5`), `ui/theme.py`, `ui/icons.py` (+ mode `--ascii`, `app.py:32-36`), `ui/widgets/stat_card.py`, `ui/widgets/risk_badge.py`, `ui/styles.tcss`, `tests/` (3 file test + snapshot SVG) | — | update-dokumen |
| §11 | Item 4 "Grounding log + JSON output" | Grounding log **selesai**; JSON output belum | update-dokumen (reorder roadmap) |
| §11 | Item 1 "/load, /verify data asli" | Kode `/load` `/verify` ada (`ui/dashboard.py:151,142`) tapi validasi data asli = runtime | PERLU VERIFIKASI |
| README.md | "including holder distribution, liquidity checks, and early wallet clustering" | Holder distribution & clustering **tidak ada**; hanya liquidity/volume/fdv heuristic checks (`rug_check.py`) | update-dokumen (Temuan #1) |
| §12 | Disclaimer "wajib di UI/marketing" | UI ✅ (`ui/dashboard.py:107-108`); README (marketing-facing) ❌ tanpa disclaimer | update-dokumen (P2 #12) |

---

## 4. TEMUAN (urut severity)

**[P1] README.md:2 — klaim publik fitur yang tidak ada.**
`"including holder distribution, liquidity checks, and early wallet clustering"` — grep membuktikan tidak ada sinyal holder maupun clustering di kode (lihat §3). README adalah file paling publik → overclaim paling berbahaya di repo ini. → Perbaikan: ganti deskripsi jadi `"...liquidity and volume heuristic risk checks with AI-assisted evidence-first summaries (early stage; holder & clustering analysis planned)"` + tambahkan disclaimer §12 satu kalimat.

**[P1] .gitignore:15 — `.env.example` tertelan pattern dan TIDAK ter-track git.**
`git check-ignore -v .env.example` → `.gitignore:15:.env.*  .env.example`; `git ls-files` tidak memuatnya. Padahal pesan error sendiri menyuruh user lihat file itu (`ui/dashboard.py:197`, `ai_analyst.py:91`) dan isi `.env.example:1-3` meng-claim "File .env TIDAK masuk git (sudah di .gitignore)" — setengah benar: `.env.example` malah ikut lenyap dari clone. → Perbaikan: tambah baris `!.env.example` SETELAH `.env.*` (urutan penting), lalu `git add -f .env.example`.

**[P1] ui/dashboard.py:121 — crash ZeroDivisionError saat `priceChange == -100`.**
`pts = [price / (1 + float(pc.get(k) or 0) / 100) for k in ("h24","h6","h1","m5")]` — token yang rug -100% (kejadian nyata di memecoin) membuat penyebut `1 + (-100/100) = 0`. `_apply_pair` dipanggil DI LUAR try/except `_load` (`ui/dashboard.py:225`), jadi exception lolos dari worker dan menjatuhkan app. → Perbaikan: guard `d = 1 + pc/100; pts.append(price/d if d > 0 else 0.0)`, dan bungkus `self._apply_pair(pair)` dalam try dengan pesan error yang ramah.

**[P1] ui/dashboard.py:273 — `DataTable.sort("Likuiditas")` mengurutkan STRING terformat, bukan angka.**
Row berisi string `_usd()` (`"$900K"`, `"$1.2M"`, `ui/dashboard.py:261`) → sort lexicographic: `"$900K" > "$1.2M"` sehingga token likuiditas $900K tampil DI ATAS $1.2M. User dibuat salah membaca peringkat — misinformasi ranking. → Perbaikan: simpan nilai numerik (mis. map `row_key → liq_usd`) lalu `t.sort` tidak dipakai; urutkan manual dengan `table.order` dari list key yang sudah di-sort numerik, atau tambah kolom tersembunyi berisi angka sebagai sort key.

**[P1] CATATAN_KERJA.md §6 — klaim "sudah jalan" untuk fitur yang tidak ada.**
"top holder concentration; clustering dasar (burst timing + amount uniformity)" — tidak ada di kode (bukti §3). Dokumen internal ini adalah sumber kebenaran tim; klaim semu ini bisa bocor ke pitching/marketing. → Perbaikan: pakai PATCH §6 di bawah.

**[P1] CATATAN_KERJA.md §7 + §9 — grounding log diklaim "belum" padahal sudah jalan; daftar modul §9 tidak cocok dengan struktur repo.**
Bukti grounding log: `ai_analyst.py:122-134,147` + `ui/dashboard.py:204` + commit `723c4f2`. §9 menyebut 8 file yang 6 di antaranya salah nama/salah lokasi/tidak ada (bukti §3) — repo sudah direstrukturisasi ke `providers/` + `heuristics/` (commit `285d12f`…`723c4f2`) tapi dokumen tidak ikut. → Perbaikan: pakai PATCH §7/§9 di bawah.

**[P2] ui/dashboard.py:197 — pesan error NoKeyError selalu menyebut `ANTHROPIC_API_KEY`.**
Handler dipakai bersama glm/kimi, tapi user yang lupa `GLM_API_KEY` disuruh set env Anthropic — menyesatkan. → Perbaikan: `ai.write(f"[#e67e22]{ai_analyst.PROVIDERS[prov].env_key} belum diset — lihat .env.example[/]")`.

**[P2] ui/dashboard.py:112-115 — `_chart_empty` dead code.**
Didefinisikan, tidak pernah dipanggil (grep: hanya definisi). Chart kosong menampilkan judul default plotext. → Perbaikan: panggil di `on_mount` (line 99) supaya panel chart punya judul "belum ada data" sejak awal, atau hapus.

**[P2] ui/dashboard.py:210 — `address[:12]` tidak di-`escape()` sebelum masuk RichLog (`markup=True`).**
Address berisi `[` bisa inject rich markup (warna/link palsu) ke log UI. Di tempat lain escape dipakai konsisten (`:148,154,158,170,177`); ini satu-satunya bocor. Dampak: cosmetic spoofing pesan oleh input sendiri — rendah, tapi murah diperbaiki. → Perbaikan: `escape(address[:12])`; bonus: validasi charset address di `/load` (tolak kecuali alfanumerik + panjang wajar).

**[P2] ui/dashboard.py:144,151 — parsing perintah pakai `startswith` → `/explainfoo` / `/loadfoo` diterima.**
`text.startswith("/explain")` cocok untuk `/explainGLM` (dianggap `/explain` default claude). → Perbaikan: `cmd, *args = text.split()` lalu cocokkan `cmd` secara eksak.

**[P2] ui/dashboard.py:202 — header output AI tidak menyebut simbol token; race kecil antar worker group.**
`/explain` (group "explain") dan `/load` (group "load") berjalan paralel; `_last_pair` di-set atomik (`:237`) jadi evidence konsisten, tapi jika `/load` baru selesai duluan, output AI untuk token LAMA muncul tanpa label di tengah konteks token BARU — user bisa salah kaitkan. → Perbaikan: capture `symbol` sebelum `await` dan tulis di header: `AI ANALYST · {prov} · {symbol} · tier free`.

**[P2] pyproject.toml:8,10 + dev `pytest-asyncio` — dependency tak terpakai.**
`humanize`, `pyfiglet`: nol pemakaian (grep nihil). `pytest-asyncio`: tidak ada test async. → Perbaikan: hapus ketiganya (lockfile ikut turun), atau realisasikan niatnya.

**[P2] README.md — tanpa disclaimer §12 padahal dokumen bilang "wajib di UI/marketing".**
UI sudah patuh (`ui/dashboard.py:107-108`); README (satu-satunya file marketing) belum. → Perbaikan: satu kalimat disclaimer di akhir README (gabung dengan Temuan #1).

**[P2] logs/grounding/*.jsonl — tanpa batas ukuran/rotasi.**
`_ground_log` append per hari tanpa pruning (`ai_analyst.py:126-133`). Isinya data pasar publik + output AI — bukan secret — dan `logs/` sudah di-gitignore (`.gitignore:26`). → Perbaikan (nanti): rotasi per bulan atau cap ukuran; sekarang masih aman diabaikan.

Catatan yang BUKAN temuan (sudah dicek, memang sehat): `webserve.py:5` bind `127.0.0.1` saja — aman selama tidak di-forward; exception handler broad `except Exception` di `_load`/`_explain` (`ui/dashboard.py:199,218`) menampilkan error ke user, tidak menelan — sesuai komentar `noqa`; `update_cell` terlindung `key in self._keys` (`:265`); `_buy_ratio` aman div-nol karena `tot < 10` return lebih dulu (`rug_check.py:74-77`).

---

## 5. HASIL GREP §10 (asumsi terlarang)

| String | Lokasi | Vonis |
|--------|--------|-------|
| `AUC` | — | **BERSIH** (nihil di kode/UI/snapshot; hanya CATATAN_KERJA.md sendiri) |
| `0.9098` | — | **BERSIH** |
| `3.81` | — | **BERSIH** |
| `0.003` | — | **BERSIH** (test fixture pakai `0.001`, `tests/test_ai_analyst.py:12` — bukan angka asumsi) |
| `akurasi tinggi` | `ai_analyst.py:23` | **AMAN** — muncul di SYSTEM_PROMPT justru sebagai daftar kata yang DILARANG buat AI |
| `jaminan` / `dijamin` / `pasti` | `ai_analyst.py:23` | **AMAN** — konteks identik: ban-list prompt |
| `hype` | `providers/dexscreener.py:9` | **AMAN** — komentar internal menjelaskan chain hype sengaja ditahan sampai verifikasi (konsisten §3) |
| `HyperEVM` | — | **BERSIH** di kode (hanya di CATATAN_KERJA.md) |
| `Robinhood` | — | **BERSIH** |
| `$HOOD` | — | **BERSIH** |
| (bonus) snapshot UI | `tests/__snapshots__/test_ui_snapshot/test_dashboard.svg` | **AMAN** — satu-satunya string sensitif yang muncul: "DYOR" (bagian disclaimer) |

---

## 6. GAP ROADMAP §11 (urutan nilai + dependensi)

1. **Sinkronisasi dokumen + repo hygiene (gratis, 30 menit).** Terapkan PATCH §7; `!.env.example` + track; perbaiki README (hapus klaim clustering, tambah disclaimer). Dependensi: tidak ada. Ini menghilangkan seluruh kategori P1 dokumen sebelum apapun ditulis ulang.
2. **Fix tiga bug P1/P2 kecil yang dirasakan user.** Crash `-100%` (`dashboard.py:121`), sort numerik (`:273`), pesan NoKeyError per provider (`:197`). Dependensi: tidak ada — patch kecil, test mudah.
3. **Validasi runtime item-1 roadmap lama.** PERLU VERIFIKASI: `/load`/`/verify` terhadap API DexScreener asli (rate limit, field nyata), dan model ID GLM (`glm-5.3`) & Kimi (`kimi-k3`) — sudah ditandai sebagai tebakan di `ai_analyst.py:46-47`. Dependensi: API keys + koneksi.
4. **Output JSON terstruktur (sisa item-4 lama).** Grounding log SUDAH selesai → sisa memaksa AI keluar JSON terstruktur (schema + parse + fallback text). Dependensi: tidak ada.
5. **Onboarding sumber data per-wallet** (GeckoTerminal dulu, Birdeye menyusul) — ini prasyarat kejujuran klaim §6: tanpa ini, top-holder/clustering/funding-traceback (item 2-3 roadmap lama) tidak bisa dimulai. Dependensi: verifikasi field `tx_from_address` dkk (masih asumsi §10).

---

## 7. PATCH DOKUMEN (siap copy-paste)

### §6 — pengganti utuh:
```markdown
## 6. Rug-Check & Clustering — Status Jujur
Sudah jalan (heuristics/rug_check.py — 5 sinyal berbobot, deterministik): skor likuiditas,
rasio FDV/likuiditas, rasio volume/likuiditas, rasio beli/jual 24 jam, umur pair.
Sinyal terhitung < 3 → level "DATA KURANG", skor dikosongkan (tidak nebak).
Belum ada (jangan diklaim ke user): top holder concentration, clustering per-wallet
(burst timing / amount uniformity), funding-source traceback, database sniper-bot,
circular transfer detection — semuanya menunggu sumber data per-wallet
(GeckoTerminal/Birdeye) yang belum di-onboarding.
Prinsip false-positive: fair-launch/airdrop/KOL call bisa mirror pola "buruk".
Heuristik = bantu keputusan, bukan vonis.
```

### §7 — pengganti utuh:
```markdown
## 7. AI Analyst
Pola: provider → heuristic → AI reasoning. Sudah ada (ai_analyst.py):
- system prompt melarang prediksi harga, saran beli/jual, janji keuntungan, klaim kepastian;
- multi-provider claude/glm/kimi via registry + .env (endpoint OpenAI-compatible utk glm/kimi);
- grounding log per panggilan → logs/grounding/YYYY-MM-DD.jsonl (evidence + output + token usage)
  — bisa dibandingkan lintas model & di-replay;
- tier free/deep di signature: hanya mengatur PANJANG output (max_tokens 400 vs 1000),
  bukan kebenaran data — tapi UI baru memanggil tier "free"; jalur "deep" menunggu token gate.
Belum ada: output JSON terstruktur; validasi runtime kepatuhan model terhadap aturan evidence-first.
```

### §9 — pengganti utuh:
```markdown
## 9. Status Modul Kode
providers/dexscreener.py (jalan; chain sol/bnb/base/avax; "hype" ditahan sampai chainId
terverifikasi), heuristics/rug_check.py (jalan; 5 sinyal berbobot, verdict gabungan),
ai_analyst.py (jalan; multi-provider claude/glm/kimi; grounding log jalan; tier param ada,
deep belum terjangkau), app.py (entry point; --ascii tanpa Nerd Font),
ui/dashboard.py + ui/theme.py + ui/icons.py + ui/styles.tcss + ui/widgets/{stat_card,risk_badge}.py
(MVP jalan; /load, /verify, /explain [claude|glm|kimi], /help), webserve.py (web mode via
textual-serve di localhost:8000), tests/ (rug_check deterministik; ai evidence-subset +
no-key semua provider; snapshot UI).
Belum ada filenya: trade_feed.py (GeckoTerminal), clustering.py, whale_tracker.py (Helius),
token_gate.py (soulbound) — daftar modul lama pada versi dokumen sebelumnya sudah tidak berlaku.
```

### §11 — pengganti utuh:
```markdown
## 11. Roadmap Prioritas
1. Sinkron dokumen + repo hygiene (README jujur, .env.example masuk git, patch CATATAN_KERJA).
2. Fix bug user-facing: crash chart priceChange -100, sort numerik tabel, pesan NoKeyError per provider.
3. Validasi teknis dasar (/load, /verify terhadap data asli; verifikasi model ID glm/kimi). — PERLU VERIFIKASI runtime.
4. Output JSON terstruktur (grounding log: SUDAH SELESAI).
5. Onboarding sumber data per-wallet (GeckoTerminal → Birdeye) — prasyarat semua analisis wallet.
6. Funding traceback (sampling 10-15 wallet). 7. DB sniper-bot. 8. Token gate + tier deep (soulbound/time-bound).
```

---

*Akhir laporan. Tidak ada file lain yang diubah dalam audit ini.*
