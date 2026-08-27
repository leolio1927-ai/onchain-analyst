"""Dashboard Terminal Alpha.

Prinsip: UI tidak pernah mengarang data. Kolom kosong = "n/a",
error = pesan yang bisa dipahami, sumber + sinyal selalu ditulis.
UI tidak berisi logika heuristik — itu tugas heuristics/rug_check.
"""
from __future__ import annotations

import asyncio
import urllib.error
from datetime import UTC, datetime

from rich.markup import escape
from textual import work
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.screen import Screen
from textual.widgets import DataTable, Footer, Header, Input, RichLog, Static
from textual_plotext import PlotextPlot

import ai_analyst
from access import token_gate
from heuristics import clustering, rug_check
from providers import dexscreener, geckoterminal, helius
from ui import icons
from ui.theme import AMBER, GREEN, MUTED, ORANGE, RED
from ui.widgets.risk_badge import RiskBadge
from ui.widgets.stat_card import StatCard

COLUMNS = [
    ("Pair", "l", 16), ("DEX", "l", 10), ("Price", "r", 14),
    ("5m", "r", 9), ("1h", "r", 9), ("24h", "r", 10),
    ("Liquidity", "r", 11), ("Vol 24h", "r", 9), ("FDV", "r", 10),
]
_COL_W = {lab: w for lab, _, w in COLUMNS}


def _cell(lab: str, align: str, value: str) -> str:
    s = str(value)
    return s.rjust(_COL_W[lab]) if align == "r" else s.ljust(_COL_W[lab])


def _usd(v) -> str:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return "n/a"
    if v == 0:
        return "n/a"
    if 0 < v < 1:
        s = f"${v:.10f}".rstrip("0")
        return s if len(s) <= 14 else f"${v:.4e}"
    for div, suf in ((1e9, "B"), (1e6, "M"), (1e3, "K")):
        if abs(v) >= div:
            return f"${v / div:.2f}{suf}"
    return f"${v:,.0f}"


def _pct(v) -> str:
    try:
        return f"{float(v):+.2f}%"
    except (TypeError, ValueError):
        return "n/a"


def _est_points(price: float, pc: dict) -> list[float]:
    """Estimasi jalur harga dari priceChange (h24→now). Penyebut <= 0
    (change tepat -100%) di-clamp ke 0.0 — data ekstrem tidak boleh menjatuhkan app."""
    pts = []
    for k in ("h24", "h6", "h1", "m5"):
        d = 1 + float(pc.get(k) or 0) / 100
        pts.append(price / d if d > 0 else 0.0)
    pts.append(price)
    return pts


def _sev_color(sev):
    if sev is None:
        return MUTED
    if sev >= 0.65:
        return RED
    if sev >= 0.4:
        return ORANGE
    if sev > 0:
        return AMBER
    return GREEN


class Dashboard(Screen):
    def compose(self) -> ComposeResult:
        self._keys: set = set()
        self._liq_usd: dict[str, float] = {}  # sel tampilan Likuiditas → nilai numerik (sort key)
        self._last_pair: dict | None = None
        self._assessment: dict | None = None
        self._chain_key: str | None = None
        yield Header()
        with Horizontal(id="topbar"):
            yield StatCard(label="Price", id="c-price")
            yield StatCard(label="Liquidity", id="c-liq")
            yield StatCard(label="Vol 24h", id="c-vol")
            yield StatCard(label="FDV", id="c-fdv")
            yield RiskBadge(id="risk")
        with Horizontal(id="body"):
            with Vertical(id="left"):
                yield Static(" No pair — /load <chain> <address>", id="pair-title")
                yield DataTable(id="table", cursor_type="row")
            with Vertical(id="right"):
                yield PlotextPlot(id="chart")
                yield RichLog(id="ai", markup=True, highlight=True, wrap=True)
        yield Input(placeholder="Commands…  /load sol <address>  |  /verify  |  /help", id="cmd")
        yield Footer()

    def on_mount(self) -> None:
        t = self.query_one("#table", DataTable)
        t.zebra_stripes = True
        for lab, _align, w in COLUMNS:
            t.add_column(lab, key=lab, width=w)
        ai = self.query_one("#ai", RichLog)
        ai.write(f"[bold {AMBER}]Terminal Alpha[/] ready. [dim]Evidence-first: analysis comes only from provider data.[/]")
        ai.write("[dim]Try: /load sol DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 then /verify[/]")
        ai.write("[dim]Disclaimer: research & education tool — NOT financial advice. "
                 "Scores are automated heuristics, not an audit. DYOR.[/]")
        self._chart_empty()

    # ---------- chart ----------

    def _chart_empty(self) -> None:
        plt = self.query_one("#chart", PlotextPlot).plt
        plt.title("24h price — no data yet")
        self.query_one("#chart", PlotextPlot).refresh()

    def _chart_est(self, pair: dict) -> None:
        """Estimated price path from priceChange — LABELED est., not OHLC."""
        pc = pair.get("priceChange") or {}
        price = float(pair.get("priceUsd") or 0)
        pts = _est_points(price, pc)
        base_price = pts[0] or 1.0
        rel = [v / base_price * 100 for v in pts]  # index 100 = 24h ago
        plt = self.query_one("#chart", PlotextPlot).plt
        plt.clear_data()
        plt.title("24h move — est., index 100 = 24h ago")
        plt.xticks([1, 2, 3, 4, 5], ["24h", "6h", "1h", "5m", "now"])
        plt.plot(rel)
        self.query_one("#chart", PlotextPlot).refresh()

    # ---------- perintah ----------

    async def on_input_submitted(self, event: Input.Submitted) -> None:
        text = event.value.strip()
        event.input.value = ""
        if not text:
            return
        cmd, *args = text.split()
        ai = self.query_one("#ai", RichLog)
        if cmd == "/help":
            ai.write("[bold]Commands:[/] /load <chain> <address> · /verify · /cluster · "
                     "/explain [claude|glm|kimi] · /whale <address> · /help · Ctrl+P palette")
        elif cmd == "/verify":
            self._verify()
        elif cmd == "/cluster":
            self._cluster()
        elif cmd == "/explain":
            prov = args[0].lower() if args else "claude"
            if prov not in ai_analyst.PROVIDERS:
                ai.write(f"[#e74c3c]Unknown provider: {escape(prov)} — pick {'|'.join(ai_analyst.PROVIDERS)}[/]")
            else:
                self._explain(prov)
        elif cmd == "/load":
            if len(args) != 2 or args[0].lower() not in dexscreener.CHAIN_IDS:
                ai.write(f"[#e74c3c]Usage: /load <{'|'.join(dexscreener.CHAIN_IDS)}> <address>[/]")
            else:
                self._load(args[0].lower(), args[1])
        elif cmd == "/whale":
            if len(args) != 1:
                ai.write("[#e74c3c]Usage: /whale <address>[/]")
            else:
                self._whale(args[0])
        else:
            ai.write(f"[dim]Unknown command: {escape(text)}[/]")

    def _verify(self) -> None:
        ai = self.query_one("#ai", RichLog)
        if not self._last_pair or not self._assessment:
            ai.write("[#e67e22]Belum ada token — /load <chain> <address> dulu.[/]")
            return
        p, a = self._last_pair, self._assessment
        base = (p.get("baseToken") or {}).get("symbol") or "?"
        if a["score"] is None:
            ai.write(f"[bold {AMBER}]VERIFY — {escape(base)}[/] · INSUFFICIENT DATA")
        else:
            ai.write(f"[bold {AMBER}]VERIFY — {escape(base)}[/] · score {a['score']:.0f}/100 → {a['level_label']}")
        for s in a["signals"]:
            if s["severity"] is None:
                note = f" ({escape(s['evidence'])})" if s["evidence"] else ""
                ai.write(f"  [dim]· {escape(s['label'])}: data not available{note}[/]")
                continue
            col = _sev_color(s["severity"])
            ai.write(f"  [{col}]■[/] {escape(s['label'])} — {escape(s['evidence'])}"
                     f" [dim](weight {s['weight']:.0%})[/]")
        for n in a["notes"]:
            ai.write(f"  [dim]§ {escape(n)}[/]")
        ts = datetime.now(UTC).strftime("%H:%M:%S")
        ai.write(f"[dim][source: dexscreener {escape(p.get('dexId') or '')} @ {ts} UTC"
                 f" · deterministic heuristics v0 — not financial advice][/]")
        self.notify(f"Verify {base}: {a['level_label']}", title="Risk",
                    severity="warning" if a["level"] in ("high", "medium") else "information")

    @work(exclusive=True, group="explain")
    async def _explain(self, prov: str = "claude") -> None:
        ai = self.query_one("#ai", RichLog)
        if not self._last_pair or not self._assessment:
            ai.write("[#e67e22]Belum ada token — /load <chain> <address> dulu.[/]")
            return
        symbol = (self._last_pair.get("baseToken") or {}).get("symbol") or "?"
        tier = token_gate.resolve_tier()
        ai.write(f"[dim]{prov} analyzing… context = heuristic results + provider data (no external additions)[/]")
        try:
            out = await asyncio.to_thread(ai_analyst.explain, self._last_pair, self._assessment, tier, prov)
        except ai_analyst.NoKeyError:
            ai.write(f"[#e67e22]{ai_analyst.PROVIDERS[prov].env_key} not set — "
                     f"see .env.example, fill .env, restart the app.[/]")
            return
        except Exception as e:  # noqa: BLE001 — show it, never crash
            ai.write(f"[#e74c3c]AI error: {escape(str(e))}[/]")
            return
        ai.write(f"[bold {AMBER}]AI ANALYST · {prov} · {escape(symbol)} · tier {tier}[/]")
        if out.get("parse_ok"):
            ai.write(escape(out.get("summary", "")))
            for s in out.get("key_signals", []):
                ai.write(f"  [dim]·[/] {escape(s.get('label', ''))}: {escape(s.get('evidence', ''))}")
            if out.get("limitations"):
                ai.write(f"  [dim]§ limitations: {escape(out['limitations'])}[/]")
        else:
            ai.write(escape(out.get("summary", "")))
            ai.write("[dim][output was not valid JSON — shown raw][/]")
        ai.write("[dim][grounding: evidence + output logged → logs/grounding/*.jsonl][/]")
        self.notify("AI analysis done", title="AI", severity="information")

    @work(exclusive=True, group="load")
    async def _load(self, chain_key: str, address: str) -> None:
        ai = self.query_one("#ai", RichLog)
        ai.write(f"[dim]Loading {dexscreener.CHAIN_IDS[chain_key]}:{escape(address[:12])}…[/]")
        try:
            pair = await asyncio.to_thread(dexscreener.fetch_pair, chain_key, address)
        except urllib.error.HTTPError as e:
            msg = "rate limited — retry in 30–60s" if e.code == 429 else f"HTTP {e.code}"
            self.notify(f"DexScreener: {msg}", title="Provider", severity="warning")
            ai.write(f"[#e74c3c]Provider error: {msg}[/]")
            return
        except Exception as e:  # noqa: BLE001 — show it, never crash
            self.notify(str(e), title="Network", severity="error")
            ai.write(f"[#e74c3c]Failed to fetch data: {escape(str(e))}[/]")
            return
        if pair is None:
            ai.write("[#e67e22]No pair for that address on this chain — check address/chain.[/]")
            return
        self._chain_key = chain_key
        cl = await self._fetch_clustering(chain_key, pair)
        self._apply_pair(pair, cl)

    async def _fetch_clustering(self, chain_key: str, pair: dict) -> dict:
        """GeckoTerminal trade feed → clustering. Any failure → severity None
        with a reason — the other 5 signals still run (honest degrade, §2.6)."""
        pool = pair.get("pairAddress")
        token = (pair.get("baseToken") or {}).get("address")
        try:
            trades = []
            if pool:
                trades = await asyncio.to_thread(geckoterminal.fetch_trades, chain_key, pool)
            if not trades and token:
                pools = await asyncio.to_thread(geckoterminal.fetch_pools, chain_key, token)
                best = geckoterminal.best_pool(pools)
                addr = (best.get("attributes") or {}).get("address") if best else None
                if addr:
                    trades = await asyncio.to_thread(geckoterminal.fetch_trades, chain_key, addr)
            return clustering.analyze(trades)
        except urllib.error.HTTPError as e:
            return {"wallets": 0, "buys": 0, "severity": None,
                    "evidence": f"GeckoTerminal HTTP {e.code} — clustering data unavailable"}
        except Exception as e:  # noqa: BLE001 — clustering failing ≠ token can't be assessed
            return {"wallets": 0, "buys": 0, "severity": None,
                    "evidence": f"GeckoTerminal failed ({str(e)[:60]}) — clustering data unavailable"}

    @work(exclusive=True, group="cluster")
    async def _cluster(self) -> None:
        ai = self.query_one("#ai", RichLog)
        if not self._last_pair or not self._chain_key:
            ai.write("[#e67e22]No token yet — /load <chain> <address> first.[/]")
            return
        ai.write("[dim]refreshing wallet coordination (GeckoTerminal)…[/]")
        cl = await self._fetch_clustering(self._chain_key, self._last_pair)
        self._apply_pair(self._last_pair, cl, announce=False)
        sig = next((s for s in self._assessment["signals"] if s["key"] == "clustering"), None)
        ev = (sig or {}).get("evidence", "unavailable")
        if sig and sig["severity"] is not None:
            ai.write(f"[dim]clustering: {escape(ev)}[/]")
        else:
            ai.write(f"[#e67e22]clustering: {escape(ev)}[/]")

    @work(exclusive=True, group="whale")
    async def _whale(self, address: str) -> None:
        ai = self.query_one("#ai", RichLog)
        ai.write(f"[dim]checking balance {escape(address[:12])}… (helius)[/]")
        try:
            b = await asyncio.to_thread(helius.fetch_balances, address)
        except helius.NoKeyError:
            ai.write("[#e67e22]HELIUS_API_KEY not set — founder's call. This feature needs a provider key.[/]")
            return
        except Exception as e:  # noqa: BLE001 — show it, never crash
            ai.write(f"[#e74c3c]Helius error: {escape(str(e))}[/]")
            return
        ai.write(f"[bold {AMBER}]WHALE · {escape(address[:8])}…[/]")
        ai.write(f"  SOL: {b['sol']:,.4f}")
        for t in b.get("tokens", [])[:5]:
            mint = escape((t.get("mint") or "?")[:12])
            ai.write(f"  [dim]{mint}… · {t['amount']:,.2f}[/]")
        ai.write("[dim][source: helius · response not runtime-verified · read-only public address][/]")
        self.notify("Balance loaded", title="Whale", severity="information")

    # ---------- terapkan data ----------

    def _apply_pair(self, p: dict, clustering_result: dict | None = None,
                    announce: bool = True) -> None:
        base = p.get("baseToken") or {}
        quote = p.get("quoteToken") or {}
        symbol = base.get("symbol") or "?"
        liq = (p.get("liquidity") or {}).get("usd")
        pc = p.get("priceChange") or {}

        a = rug_check.assess(p, clustering_result)
        self._last_pair, self._assessment = p, a
        badge = self.query_one("#risk", RiskBadge)
        badge.level, badge.score = a["level"], a["score"]

        self.query_one("#c-price", StatCard).set(_usd(p.get("priceUsd")), float(pc.get("m5") or 0))
        self.query_one("#c-liq", StatCard).set(_usd(liq), 0.0)
        self.query_one("#c-vol", StatCard).set(_usd((p.get("volume") or {}).get("h24")), 0.0)
        self.query_one("#c-fdv", StatCard).set(_usd(p.get("fdv") or p.get("marketCap")), float(pc.get("h24") or 0))

        name = (base.get("name") or "—").strip()
        ident = escape(symbol) if name.lower() == symbol.lower() else f"{escape(symbol)} · {escape(name)}"
        self.query_one("#pair-title", Static).update(
            f" {icons.ACTIVE.db} {ident} · {escape(p.get('dexId') or '—')}"
        )

        vals = {
            "Pair": f"{symbol}/{quote.get('symbol') or '?'}",
            "DEX": p.get("dexId") or "—",
            "Price": _usd(p.get("priceUsd")),
            "5m": _pct(pc.get("m5")), "1h": _pct(pc.get("h1")), "24h": _pct(pc.get("h24")),
            "Liquidity": _usd(liq),
            "Vol 24h": _usd((p.get("volume") or {}).get("h24")),
            "FDV": _usd(p.get("fdv") or p.get("marketCap")),
        }
        row = tuple(_cell(lab, al, vals[lab]) for lab, al, _ in COLUMNS)

        t = self.query_one("#table", DataTable)
        key = p.get("pairAddress") or base.get("address") or symbol
        if key in self._keys:
            t.update_cell(key, "Price", row[2]); t.update_cell(key, "5m", row[3])
            t.update_cell(key, "1h", row[4]);    t.update_cell(key, "24h", row[5])
            t.update_cell(key, "Liquidity", row[6]); t.update_cell(key, "Vol 24h", row[7])
            t.update_cell(key, "FDV", row[8])
        else:
            t.add_row(*row, key=key)
            self._keys.add(key)
        # Textual 8 tidak punya DataTable.order() — sort numerik via key fn atas sel tampilan
        try:
            self._liq_usd[row[6]] = float(liq or 0)
        except (TypeError, ValueError):
            self._liq_usd.setdefault(row[6], 0.0)
        t.sort("Likuiditas", key=lambda s: self._liq_usd.get(s, 0.0), reverse=True)

        self._chart_est(p)
        if announce:
            ts = datetime.now(UTC).strftime("%H:%M:%S")
            self.query_one("#ai", RichLog).write(
                f"[bold {AMBER}]{escape(symbol)}[/] loaded · risk "
                f"{a['level_label']}"
                + (f" {a['score']:.0f}/100" if a["score"] is not None else "")
                + f"\n[dim]  [source: dexscreener + geckoterminal @ {ts} UTC] — run /verify for signal details[/]"
            )
            self.notify(f"{symbol} · {a['level_label']}", title="Load",
                        severity="warning" if a["level"] in ("high", "medium") else "information")
