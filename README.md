# onchain-analyst — Terminal Alpha

A **read-only** memecoin research terminal (Python/Textual TUI) across chains: load tokens via
DexScreener, deterministic heuristic risk scores, and evidence-first AI analysis
multi-provider (claude/glm/kimi) with a replayable grounding log.

**Not a trading bot** — no transaction execution, no custody of funds/private keys.

## Usage
```bash
uv run python app.py          # TUI (needs a Nerd Font)
uv run python app.py --ascii  # standard glyphs, any font
uv run python webserve.py     # remote TUI in the browser (textual-serve)
uv run pytest                 # test suite
```
TUI commands: `/load <chain> <address>` · `/verify` · `/cluster` · `/explain [claude|glm|kimi]` · `/whale <address>` · `/help`

## Web — landing + web terminal

React+Vite+TypeScript frontend (`frontend/`) + FastAPI backend (`webapp/`) serving the
build output + a read-only API (`/api/scan`, `/api/explain`, `/api/whale`, `/api/health`).
Same engine as the TUI (providers → heuristics → ai_analyst); AI runs server-side
(a client can never forge evidence) and the AI endpoints are rate-limited per IP.

**Prerequisites:** uv (Python 3.14) + Node ≥ 24 (nvm recommended).

Dev (two terminals):
```bash
uv run python -m webapp --port 8000     # API + serves dist/
cd frontend && npm install && npm run dev   # Vite dev server (proxies /api → :8000)
```

Production:
```bash
cd frontend && npm ci && npm run build  # → frontend/dist/
cd .. && uv run python -m webapp --host 127.0.0.1 --port 8000
```

Deploy to a domain (docs-only): run `python -m webapp` bound to 127.0.0.1, then put a
reverse proxy + TLS in front. Caddy example (automatic HTTPS):
```
yourdomain.com {
    reverse_proxy 127.0.0.1:8000
}
```
nginx example: `proxy_pass http://127.0.0.1:8000;` + `proxy_set_header X-Forwarded-For $remote_addr;`
in the `location /` block, certificates via certbot. Run as a systemd service
(`ExecStart=/path/uv run python -m webapp --host 127.0.0.1 --port 8000`, `Restart=always`).
AI endpoint rate limit: env `ALPHA_AI_RATELIMIT_HOURLY` (default 5) / `ALPHA_AI_RATELIMIT_DAILY` (default 30).

MVP status: 5 aggregate heuristic signals (liquidity, FDV/liquidity, volume/liquidity,
buy-sell ratio, pair age) + a wallet-coordination signal from the GeckoTerminal trade feed
(clustering v0, runs automatically on `/load`). Holder-distribution analysis and funding
traceback do not exist yet — do not claim them. Whale tracking is still a framework (needs `HELIUS_API_KEY`).

> **Disclaimer:** a tool for analysis & education. AI output is NOT financial advice. All
> risk scores are automated heuristics, not official audits — do your own research (DYOR).
> Trading memecoins is extremely risky; never use funds you cannot afford to lose.
