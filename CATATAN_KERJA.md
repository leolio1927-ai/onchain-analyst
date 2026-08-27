# CATATAN KERJA — Terminal Alpha (AI Memecoin Scanner Terminal)

## 1. Apa Ini dan Kenapa Dibuat
Terminal Alpha adalah terminal (CLI/TUI) untuk trader memecoin: hunting, scanning, analisis risiko, AI reasoning — lintas chain (Solana, BSC, Base, HyperEVM/Hyperliquid, Avalanche).
BUKAN: bot trading (TIDAK ada eksekusi transaksi), bukan pengganti platform eksekusi (Axiom/GMGN/BullX), bukan penyedia sinyal beli/jual. Diferensiasi: AI yang menjelaskan KENAPA dengan reasoning transparan, tanpa custody.

## 2. Prinsip yang Gak Boleh Dilanggar
1. Tidak ada eksekusi transaksi. Terminal murni riset/analisis.
2. Tidak ada custody dana user. Tidak pernah minta/simpan private key; cek saldo hanya via public address.
3. Versi gratis tidak boleh sengaja dibikin kurang akurat. Token utility mengatur KEDALAMAN (tier free/deep), bukan KEBENARAN data.
4. AI tidak boleh mengarang fakta. Semua kesimpulan berbasis data provider (evidence-first).
5. Tidak ada klaim "akurasi tinggi/jaminan cuan". Framing: mengurangi noise, menambah konteks.
6. Verdict risiko tidak pernah biner dari satu sinyal. Gabungan heuristik; data kurang → jujur "DATA KURANG".

## 3. Cakupan Chain
Target: Solana (sol), BNB (bnb), Base, HyperEVM/Hyperliquid (hype), Avalanche (avax).
Robinhood Chain ($HOOD) belum terverifikasi di provider manapun — jangan ditampilkan sebagai supported sampai diverifikasi.

## 4. Arsitektur
CLI/TUI input → Data Layer (DexScreener agregat; GeckoTerminal trade per-wallet; Helius wallet balance; nanti Birdeye/Bitquery) → Heuristic Layer deterministik (rug_check, clustering) → AI Analyst (terima hasil heuristik + data sebagai konteks; tidak boleh menambah fakta; output per tier) → Terminal UI (Textual).
Prinsip: AI tidak pernah bicara langsung ke API mentah — selalu lewat heuristic layer.
Web (2026-08-27): frontend/ (React+Vite+TS, MPA: index=landing, terminal=web terminal) + webapp/ (FastAPI serve dist + /api/scan|explain|whale|health). Engine sama dgn TUI; /api/explain re-fetch + re-assess SERVER-SIDE (client tak bisa menempa evidence); endpoint AI rate-limited per-IP; tanpa dist → halaman jujur "run npm run build". Semua user-facing string English (web + TUI + evidence + output AI); dokumen internal tetap Indonesia.

## 5. Strategi Sumber Data
MVP: DexScreener (gratis, tanpa key, TANPA data per-wallet). Paralel: GeckoTerminal (trade individual, gratis, dasar clustering). Nanti: Birdeye (produksi, MCP server resmi), Bitquery (deep query, pricing opaque).

## 6. Rug-Check & Clustering — Status Jujur
Sudah jalan: 6 sinyal berbobot deterministik (heuristics/rug_check.py) — likuiditas, FDV/likuiditas, volume/likuiditas, rasio beli/jual 24j, umur pair, PLUS koordinasi wallet dari heuristics/clustering.py v0 (burst timing + amount uniformity; data trade per-wallet GeckoTerminal; sampel <8 wallet → tidak diskor, tampil jujur). /load menghitung clustering otomatis; provider gagal → degrade jujur ke 5 sinyal + catatan.
Belum ada (jangan diklaim ke user): top holder concentration; funding-source traceback; database sniper-bot; circular transfer detection.
Prinsip false-positive: fair-launch/airdrop/KOL call bisa mirror pola "buruk". Heuristik = bantu keputusan, bukan vonis.

## 7. AI Analyst
Pola: provider → heuristic → AI reasoning. Sudah ada (ai_analyst.py): system prompt larang klaim kepastian/ajakan; multi-provider claude/glm/kimi via registry + .env; grounding log per panggilan → logs/grounding/YYYY-MM-DD.jsonl (evidence + output mentah + output terstruktur + parse_ok + token usage); output JSON terstruktur {"ringkasan","sinyal_kunci","keterbatasan"} dengan fallback jujur ke teks mentah kalau model tidak patuh format; tier di signature mengatur PANJANG saja (max_tokens 400/1000 — bukan kebenaran), akses via access/token_gate.py v0 yang selalu "free" (deep ditunda sampai soulbound ada).
Belum ada: validasi runtime kepatuhan evidence-first model asli (butuh key founder).

## 8. Token Utility
Token TIDAK atur custody/eksekusi, TIDAK dijual dengan narasi profit. Murni atur akses kedalaman fitur AI. Analogi aman: software license/API key. Direkomendasikan (belum diimplementasi): non-transferable/soulbound, time-bound, jalur bayar USDC alternatif, governance token dipisah total.

## 9. Status Modul Kode
providers/dexscreener.py (jalan; sol/bnb/base/avax; hype ditahan), providers/geckoterminal.py (jalan; trade per-wallet; field & network id TERVERIFIKASI live 2026-08-27), providers/helius.py (kerangka; saldo wallet butuh HELIUS_API_KEY — urusan founder; response belum diverifikasi runtime), heuristics/rug_check.py (jalan; 6 sinyal berbobot, clustering opsional), heuristics/clustering.py (jalan; burst + uniformity; <8 wallet tidak diskor), ai_analyst.py (jalan; multi-provider; grounding log; output JSON terstruktur), access/token_gate.py (kerangka v0 free-only; hook soulbound/time-bound), app.py + ui/ (MVP jalan; /load, /verify, /cluster, /explain [claude|glm|kimi], /whale, /help), webserve.py (jalan; textual-serve localhost:8000), tests/ (26 test hijau: rug_check, clustering, geckoterminal, ai JSON/grounding/tier, token_gate, helper chart, snapshot UI).
Daftar modul versi dokumen lama (data_sources.py, trade_feed.py, whale_tracker.py, token_gate.py flat di root) TIDAK berlaku — sudah direstrukturisasi ke paket providers/ + heuristics/ + access/.
Tambahan web: webapp/server.py (FastAPI; scan/explain/whale/health; TTL cache 30s; rate limit AI per-IP via ALPHA_AI_RATELIMIT_HOURLY/DAILY), frontend/ (Vite 8 + React 19 + TS 7, MPA 2 entry, tanpa UI framework; watchlist localStorage; command bar sama dgn TUI).

## 10. Terverifikasi vs Masih Asumsi
Terverifikasi: GeckoTerminal ada endpoint trade per-wallet gratis; DexScreener tidak expose per-wallet; Birdeye punya MCP server; paper wash-trading (arXiv 2603.13830) ada. TERVERIFIKASI TAMBAHAN 2026-08-27 (dicek live): field response GeckoTerminal (tx_from_address, kind, block_timestamp, volume_in_usd, from/to_token_address); network id GeckoTerminal solana/bsc/base/avax.
Masih asumsi (JANGAN dikutip ke user/marketing): angka "AUC 0.9098", "lead time 3.81 jam", "$0.003/request"; model ID GLM "glm-5.3" & Kimi "kimi-k3" beserta base URL-nya (tunggu key founder); response shape Helius (butuh key); chain ID HyperEVM.

## 11. Roadmap Prioritas
1. Validasi runtime bersama founder (model ID glm/kimi, response Helius, kepatuhan JSON model asli). 2. Funding traceback (sampling 10-15 wallet). 3. DB sniper-bot. 4. Top holder concentration (butuh provider data holder). 5. Migrasi Birdeye begitu ada traksi. 6. Token gate soulbound/time-bound + aktifkan tier deep.
(Selesai & dicoret dari roadmap lama: grounding log, output JSON terstruktur, clustering v0.)

## 12. Disclaimer Produk (wajib di UI/marketing)
Tool untuk analisis & edukasi. Output AI BUKAN saran finansial. Skor risiko = heuristik otomatis, bukan audit resmi. DYOR. Trading memecoin sangat berisiko.
