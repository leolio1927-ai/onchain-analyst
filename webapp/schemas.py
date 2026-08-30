"""Typed response contracts for every API surface (BE-F1).

One pydantic model per surface that exists or is planned. Mounting these as
FastAPI response_model is ADDITIVE ONLY: every field the engines emit today
stays under its exact name — a model may add fields, never rename or drop
them (the wire is the product; llms.txt:26 promises schema stability).

Honesty law, enforced at the source:
- absent stays absent — every upstream-derived field is None-able and the
  default is None, never 0, "" or an interpolated value;
- zero is a fact — real zeros from upstream pass through untouched;
- data_mode states how the payload was produced:
    "live"    — values copied from a real upstream/engine response;
    "fixture" — values served from a committed test data set;
    "unwired" — the surface has no engine yet; fields stay None.
- ts is always UTC ISO-8601 (generated, never local time);
- schema_version pins the contract revision of this payload.

Planned-only models (TokenMeta, HistoryPage, QuoteResponse, WatchlistItem,
AlertRule, AlertEvent) default to data_mode="unwired" — constructing one
without an engine is the honest state, and it is visible in the payload.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

DataMode = Literal["live", "fixture", "unwired", "static"]
SchemaVersion = Literal["1.0"]

# Upstream-copied scalar: GeckoTerminal/DexScreener send numbers as strings;
# we copy verbatim, so the union is the honest type — never float-coerced here.
Verbatim = str | float | int | None


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


class Envelope(BaseModel):
    """Fields every response carries — the machine contract footer."""

    data_mode: DataMode = "live"
    schema_version: SchemaVersion = "1.0"
    sources: list[str] = Field(default_factory=list)
    ts: str = Field(default_factory=_utc_now_iso)


def _derive_computed(data: object) -> object:
    """computed = severity is not None — attempted AND scored vs attempted
    but honestly not scored (insufficient sample / upstream unavailable)."""
    if isinstance(data, dict) and "computed" not in data and "severity" in data:
        return {**data, "computed": data["severity"] is not None}
    return data


# ── scan surface ─────────────────────────────────────────────────────────

class Pair(BaseModel):
    """DexScreener pair projection (webapp.server._pair_view key set, exact)."""

    pairAddress: str | None = None
    chainId: str | None = None
    dexId: str | None = None
    baseToken: dict | None = None
    quoteToken: dict | None = None
    url: str | None = None
    priceUsd: Verbatim = None
    liquidity: dict | None = None
    fdv: Verbatim = None
    marketCap: Verbatim = None
    volume: dict | None = None
    priceChange: dict | None = None
    txns: dict | None = None
    pairCreatedAt: Verbatim = None


class SignalRow(BaseModel):
    """One rug_check signal. `computed` (added by BE-F1) separates "attempted
    but not scored" (severity None — honest) from scored; `detail` is the
    planned richer explanation slot and stays None until that engine exists."""

    key: str | None = None
    label: str | None = None
    weight: float | None = None
    severity: float | None = None
    evidence: str | None = None
    computed: bool = False
    detail: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _computed_from_severity(cls, data):
        return _derive_computed(data)


class ClusteringBlock(BaseModel):
    """Wallet-coordination result. On upstream failure the counts are None
    (never 0 — a failed fetch observed no wallets); severity None with real
    counts = sample too small, honestly not scored."""

    wallets: int | None = None
    buys: int | None = None
    severity: float | None = None
    evidence: str | None = None
    computed: bool = False

    @model_validator(mode="before")
    @classmethod
    def _computed_from_severity(cls, data):
        return _derive_computed(data)


class RugAssessment(BaseModel):
    level: str | None = None
    level_label: str | None = None
    score: float | None = None
    signals: list[SignalRow] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class ScanResponse(Envelope):
    pair: Pair = Field(default_factory=Pair)
    assessment: RugAssessment = Field(default_factory=RugAssessment)
    clustering: ClusteringBlock = Field(default_factory=ClusteringBlock)
    sources: list[str] = Field(default_factory=list)
    launch_venue: str | None = None
    ts: str = Field(default_factory=_utc_now_iso)


# ── live + discovery surfaces ────────────────────────────────────────────

class SocialLinks(BaseModel):
    twitter: str | None = None
    website: str | None = None


class FeedItem(BaseModel):
    """providers/live.py FIELDS key set, exact — absent stays None."""

    pool_address: str | None = None
    token_symbol: str | None = None
    token_name: str | None = None
    pair: str | None = None
    logo: str | None = None
    price_usd: Verbatim = None
    volume_24h: Verbatim = None
    change_24h: Verbatim = None
    liquidity_usd: Verbatim = None
    txns_24h: int | None = None
    fdv_usd: Verbatim = None
    created_at: str | None = None
    dex_id: str | None = None
    launchpad: str | None = None
    token_address: str | None = None
    socials: SocialLinks | None = None


class LiveResponse(Envelope):
    chain: str | None = None
    network_id: str | None = None
    live: bool = False
    generated_at: str | None = None
    cached: bool | None = None
    stale: bool | None = None
    items: list[FeedItem] = Field(default_factory=list)


class DiscoveryItem(BaseModel):
    """providers/discovery.py FIELDS key set, exact."""

    pool_address: str | None = None
    pair: str | None = None
    dex: str | None = None
    price_usd: Verbatim = None
    volume_24h: Verbatim = None
    change_24h: Verbatim = None
    fdv_usd: Verbatim = None
    created_at: str | None = None


class DiscoveryResponse(Envelope):
    chain: str | None = None
    mode: str | None = None
    count: int = 0
    items: list[DiscoveryItem] = Field(default_factory=list)


# ── whale surface ────────────────────────────────────────────────────────

class WhaleToken(BaseModel):
    mint: str | None = None
    amount: float | None = None


class WhaleResponse(Envelope):
    address: str | None = None
    sol: float | None = None
    tokens: list[WhaleToken] = Field(default_factory=list)


# ── realtime frames (WS payload contracts; wire unchanged) ───────────────

class TradeRow(BaseModel):
    """Normalized GeckoTerminal trade (providers.geckoterminal.fetch_trades)."""

    wallet: str | None = None
    kind: str | None = None
    ts: str | None = None
    usd: float | None = None
    base_token: str | None = None
    tx_hash: str | None = None


class TapeFrame(Envelope):
    type: str = "tape"
    chain: str | None = None
    pool: str | None = None
    trades: list[TradeRow] = Field(default_factory=list)
    ts: str = Field(default_factory=_utc_now_iso)
    error: str | None = None


class SnapTick(BaseModel):
    sym: str | None = None
    chain: str | None = None
    address: str | None = None
    px: float | None = None
    chg: Verbatim = None
    risk: float | None = None
    level: str | None = None
    ts: str | None = None


class SnapshotFrame(Envelope):
    now: str | None = None
    scans: int = 0
    uptime_s: int = 0
    clients: int = 0
    ticks: list[SnapTick] = Field(default_factory=list)


# ── planned surfaces (no engine yet → data_mode "unwired") ───────────────

class TokenMeta(Envelope):
    """Token registry entry (BE-F3) + the planned live token-page fields.
    Registry-backed responses carry data_mode='fixture' today; fields the
    registry does not know (socials, launchpad, …) stay None — absent stays
    absent until a real upstream fills them."""

    data_mode: DataMode = "unwired"

    chain: str | None = None
    address: str | None = None
    symbol: str | None = None
    name: str | None = None
    decimals: int | None = None
    logo: str | None = None
    logo_ref: str | None = None
    tags: list[str] = Field(default_factory=list)
    first_seen: str | None = None
    last_seen: str | None = None
    socials: SocialLinks | None = None
    launchpad: str | None = None
    dex_id: str | None = None


class OhlcvPoint(BaseModel):
    """Point-in-time quote mapped onto the OHLCV shape: open/high/low stay
    None (a candle that was never observed is never synthesized), close =
    the observed price, volume = the observed 24h volume."""

    ts: str | None = None
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: float | None = None
    liquidity: float | None = None
    fdv: float | None = None


class HistoryPage[T](Envelope):
    """Cursor pagination: `next_cursor` is None-terminated — None means the
    page end was reached; a cursor value means more pages exist. Absent
    history is an empty items list, never synthesized points. data_mode is
    the union of the page's rows — a fixture page never reads as live."""

    data_mode: DataMode = "unwired"

    items: list[T] = Field(default_factory=list)
    next_cursor: str | None = None


class QuoteResponse(Envelope):
    """Read-only route quote (planned TA-101). No order, no signature, no
    execution — amount_out stays None until the quote engine exists."""

    data_mode: DataMode = "unwired"

    chain: str | None = None
    token_in: str | None = None
    token_out: str | None = None
    amount_in: str | None = None
    amount_out: str | None = None
    price_impact_pct: float | None = None
    route: list[str] = Field(default_factory=list)


class WatchlistItem(Envelope):
    data_mode: DataMode = "unwired"

    chain: str | None = None
    address: str | None = None
    symbol: str | None = None
    note: str | None = None
    added_at: str | None = None


class AlertRule(Envelope):
    data_mode: DataMode = "unwired"

    rule_id: str | None = None
    chain: str | None = None
    address: str | None = None
    metric: str | None = None
    op: str | None = None
    threshold: float | None = None
    active: bool = True
    created_at: str | None = None


class AlertEvent(Envelope):
    data_mode: DataMode = "unwired"

    event_id: str | None = None
    rule_id: str | None = None
    fired_at: str | None = None
    value: float | None = None
    detail: str | None = None


class ApiError(Envelope):
    """Error envelope — `detail` keeps the exact human-readable message the
    routes raise today; the footer fields make errors machine-diffable too."""

    detail: str = ""


# ── system surface ───────────────────────────────────────────────────────

class DbInfo(BaseModel):
    """/api/version db block — measured facts about the persistence layer."""

    path_kind: str | None = None       # "off" | "env" (never the raw path)
    schema_version: int | None = None
    rows_by_table: dict[str, int] = Field(default_factory=dict)
    last_run_at: str | None = None
    oldest_row_ts: str | None = None


class VersionResponse(BaseModel):
    name: str | None = None
    version: str | None = None
    python: str | None = None
    fastapi: str | None = None
    uptime_s: int = 0
    db: DbInfo = Field(default_factory=DbInfo)


# ── entity surface (BE-F3: wallet labels) ────────────────────────────────

class WalletLabel(BaseModel):
    """One labeled-wallet claim. `label`+`kind`+`evidence` are the claim;
    `verified` means OPERATOR-checked and is distinct from data provenance —
    fixture-loaded rows are always verified=false. No row is the honest
    'unlabeled' state; there is no unlabeled kind."""

    chain: str | None = None
    address: str | None = None
    label: str | None = None
    kind: str | None = None
    evidence: str | None = None
    verified: bool = False


class WalletLabelsResponse(Envelope):
    """All claims for one wallet across chains. An unlabeled wallet is an
    honest empty list — never synthesized, never a guess, never an error."""

    data_mode: DataMode = "unwired"

    address: str | None = None
    labels: list[WalletLabel] = Field(default_factory=list)


# ── chain capability catalog (BE-F4) ─────────────────────────────────────

class ChainInfo(BaseModel):
    """One chain's verified provider support (webapp/chains.py CHAIN_CATALOG).
    A False cell is a stated absence — e.g. hood clustering is impossible
    today because GeckoTerminal has no robinhood network."""

    chain: str | None = None
    name: str | None = None
    symbol: str | None = None
    scan: bool = False
    clustering: bool = False
    socials: bool = False
    live_feed: bool = False
    venues: list[str] = Field(default_factory=list)
    logo_ref: str | None = None


class ChainsResponse(Envelope):
    """The full catalog, config-not-observed: data_mode='static' marks that
    these are maintained capability flags, not a response observed from an
    upstream at request time. The `note` travels with the payload."""

    data_mode: DataMode = "static"

    chains: list[ChainInfo] = Field(default_factory=list)
    note: str | None = None


# ── ai surface ───────────────────────────────────────────────────────────

class KeySignal(BaseModel):
    """One quoted signal inside an explain narrative ({label, evidence})."""

    label: str | None = None
    evidence: str | None = None


class ExplainResponse(Envelope):
    """Evidence-first narrative (LLM provider or the deterministic local tier).
    `limitations` keeps the wire's string type — typing it as a list would
    500 every explain call; widening it is a deliberate contract change."""

    summary: str | None = None
    key_signals: list[KeySignal] = Field(default_factory=list)
    limitations: str | None = None
    parse_ok: bool = False
    tier: str | None = None
    provider: str | None = None
