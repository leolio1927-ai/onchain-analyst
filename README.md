# onchain-analyst — Terminal Alpha

Terminal riset memecoin **read-only** (TUI Python/Textual) lintas chain: muat token via
DexScreener, skor risiko heuristik deterministik, dan analisis AI evidence-first
multi-provider (claude/glm/kimi) dengan grounding log yang bisa di-replay.

**Bukan bot trading** — tidak ada eksekusi transaksi, tidak ada custody dana/private key.

## Pakai
```bash
uv run python app.py          # TUI (butuh Nerd Font)
uv run python app.py --ascii  # glyph standar, font apa pun
uv run python webserve.py     # remote TUI di browser (textual-serve)
uv run pytest                 # test suite
```
Perintah TUI: `/load <chain> <address>` · `/verify` · `/cluster` · `/explain [claude|glm|kimi]` · `/whale <address>` · `/help`

## Web — landing + web terminal

Frontend React+Vite+TypeScript (`frontend/`) + backend FastAPI (`webapp/`) yang melayani
hasil build + API read-only (`/api/scan`, `/api/explain`, `/api/whale`, `/api/health`).
Engine-nya sama dengan TUI (providers → heuristics → ai_analyst); AI di-server-side
(client tidak bisa menempa evidence) dan endpoint AI di-rate-limit per IP.

**Prasyarat:** uv (Python 3.14) + Node ≥ 24 (disarankan via nvm).

Dev (dua terminal):
```bash
uv run python -m webapp --port 8000     # API + serve dist/
cd frontend && npm install && npm run dev   # Vite dev server (proxy /api → :8000)
```

Production:
```bash
cd frontend && npm ci && npm run build  # → frontend/dist/
cd .. && uv run python -m webapp --host 127.0.0.1 --port 8000
```

Deploy ke domain (docs-only): jalankan `python -m webapp` bind 127.0.0.1 lalu pasang
reverse proxy + TLS. Contoh Caddy (otomatis HTTPS):
```
yourdomain.com {
    reverse_proxy 127.0.0.1:8000
}
```
Contoh nginx: `proxy_pass http://127.0.0.1:8000;` + `proxy_set_header X-Forwarded-For $remote_addr;`
di block `location /`, sertifikat via certbot. Jalankan sebagai service systemd
(`ExecStart=/path/uv run python -m webapp --host 127.0.0.1 --port 8000`, `Restart=always`).
Rate limit endpoint AI: env `ALPHA_AI_RATELIMIT_HOURLY` (default 5) / `ALPHA_AI_RATELIMIT_DAILY` (default 30).

Status MVP: 5 sinyal heuristik agregat (likuiditas, FDV/likuiditas, volume/likuiditas,
rasio beli-jual, umur pair) + sinyal koordinasi wallet dari trade feed GeckoTerminal
(clustering v0, jalan otomatis saat `/load`). Analisis holder distribution dan funding
traceback belum ada — jangan diklaim. Whale tracking masih kerangka (butuh `HELIUS_API_KEY`).

> **Disclaimer:** tool untuk analisis & edukasi. Output AI BUKAN saran finansial. Semua
> skor risiko adalah heuristik otomatis, bukan audit resmi — lakukan riset mandiri (DYOR).
> Trading memecoin sangat berisiko; jangan pakai dana yang tidak siap hilang.
