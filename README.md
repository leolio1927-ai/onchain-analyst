# onchain-analyst — Terminal Alpha

Terminal riset memecoin **read-only** (TUI Python/Textual) lintas chain: muat token via
DexScreener, skor risiko heuristik deterministik, dan analisis AI evidence-first
multi-provider (claude/glm/kimi) dengan grounding log yang bisa di-replay.

**Bukan bot trading** — tidak ada eksekusi transaksi, tidak ada custody dana/private key.

## Pakai
```bash
uv run python app.py          # TUI (butuh Nerd Font)
uv run python app.py --ascii  # glyph standar, font apa pun
uv run python webserve.py     # browser → http://localhost:8000
uv run pytest                 # test suite
```
Perintah: `/load <chain> <address>` · `/verify` · `/cluster` · `/explain [claude|glm|kimi]` · `/whale <address>` · `/help`

Status MVP: 5 sinyal heuristik agregat (likuiditas, FDV/likuiditas, volume/likuiditas,
rasio beli-jual, umur pair) + sinyal koordinasi wallet dari trade feed GeckoTerminal
(clustering v0, jalan otomatis saat `/load`). Analisis holder distribution dan funding
traceback belum ada — jangan diklaim. Whale tracking masih kerangka (butuh `HELIUS_API_KEY`).

> **Disclaimer:** tool untuk analisis & edukasi. Output AI BUKAN saran finansial. Semua
> skor risiko adalah heuristik otomatis, bukan audit resmi — lakukan riset mandiri (DYOR).
> Trading memecoin sangat berisiko; jangan pakai dana yang tidak siap hilang.
