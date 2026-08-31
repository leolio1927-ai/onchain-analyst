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

DataMode = Literal["live", "fixture", "unwired", "static", "partial"]
# "partial" — the payload is real but enrichment is mixed: some context
# blocks came back live while others are honestly absent (BE-F5a-R).
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


class SellTest(BaseModel):
    """Sell-side simulation, tri-state: routable True / False / None.
    None = "sell simulation unavailable" (timeout etc.) — NEVER implied safe;
    False = a recognized no-route answer, a loud honeypot signal."""

    routable: bool | None = None
    checked_via: str | None = None
    note: str | None = None


class LineageToken(BaseModel):
    """One prior scan_snapshots row for this deployer (DB-local view)."""

    mint: str | None = None
    chain: str | None = None
    score: float | None = None
    rug: str | None = None
    ts: str | None = None


class DeployerLineage(BaseModel):
    """What THIS registry observed about a deployer — DB-local, zero
    provider calls. launches=0 is DATA (watched, launched nothing so far);
    an absent deployer has no lineage block at all."""

    launches: int = 0
    tokens: list[LineageToken] = Field(default_factory=list)
    labels: list[WalletLabel] = Field(default_factory=list)


class RugFlags(BaseModel):
    """Rug-relevant flags, COPIED VERBATIM from the source (sol: helius DAS
    authorities + mutable; EVM: GoPlus security fields as their own strings).
    Field values the source did not send stay absent — no cross-filling."""

    update_authorities: list[str] = Field(default_factory=list)
    mutable: bool | None = None
    is_honeypot: Verbatim = None
    buy_tax: Verbatim = None
    sell_tax: Verbatim = None
    mintable: Verbatim = None
    freezable: Verbatim = None
    holder_count: Verbatim = None
    lp_holders: Verbatim = None


class TokenContext(Envelope):
    """Trader-loop context block (BE-F5a-R) — renders BESIDE the verdict.
    The rug weights and score formula never read from here. Per-block
    provenance: deployer_source names the provider that said it,
    sell_test.checked_via names the quote path, and notes carry the honest
    reason for every absent capability ("<provider>:not_configured",
    "<provider>:timeout", or a catalog reason sentence)."""

    data_mode: DataMode = "unwired"

    deployer: str | None = None
    deployer_kind: str | None = None
    deployer_source: str | None = None
    lineage: DeployerLineage | None = None
    top10_share: float | None = None
    sell_test: SellTest | None = None
    rug_flags: RugFlags | None = None
    notes: list[str] = Field(default_factory=list)
    data_sources: list[str] = Field(default_factory=list)


class ScanResponse(Envelope):
    """scan contract v1.1 — everything v1.0 served, unchanged, plus the
    best-effort `context` block (BE-F5a-R). The rug weights and score
    formula are NOT part of this bump: context renders beside the verdict,
    never inside it. schema_version is bumped on THIS model only."""

    schema_version: Literal["1.0", "1.1"] = "1.1"

    pair: Pair = Field(default_factory=Pair)
    assessment: RugAssessment = Field(default_factory=RugAssessment)
    clustering: ClusteringBlock = Field(default_factory=ClusteringBlock)
    sources: list[str] = Field(default_factory=list)
    launch_venue: str | None = None
    ts: str = Field(default_factory=_utc_now_iso)
    context: TokenContext = Field(default_factory=lambda: TokenContext())


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
    A False cell is a stated absence — e.g. hype scan is unavailable today
    because DexScreener has no verified hyperevm chainId."""

    chain: str | None = None
    name: str | None = None
    symbol: str | None = None
    scan: bool = False
    clustering: bool = False
    socials: bool = False
    live_feed: bool = False
    venues: list[str] = Field(default_factory=list)
    logo_ref: str | None = None


class WhaleEntry(BaseModel):
    """One large transfer: signed token delta (in/out) + USD at the window
    price. usd stays None when no pair price exists — never fabricated."""

    wallet: str | None = None
    amount: float | None = None
    direction: str | None = None
    ts: str | int | None = None      # verbatim from the provider (helius = epoch int)
    tx: str | None = None
    usd: float | None = None
    price_usd: float | None = None


class NetflowRow(BaseModel):
    """Per-wallet net over the same window as the transfers shown."""

    wallet: str | None = None
    net_amount: float | None = None
    direction: str | None = None
    net_usd: float | None = None


class WhalesResponse(Envelope):
    """Whale tracker (BE-ALL-LIVE F3). A quiet token is an honest empty
    list; an unwired chain carries the probe reason sentence in data_sources."""

    data_mode: DataMode = "unwired"

    chain: str | None = None
    token: str | None = None
    price_usd: float | None = None
    threshold_usd: float | None = None
    window_txs: int = 0
    transfers: list[WhaleEntry] = Field(default_factory=list)
    netflow: list[NetflowRow] = Field(default_factory=list)
    data_sources: list[str] = Field(default_factory=list)


class CapabilityRow(BaseModel):
    """One capability×chain wiring row: either a source (a fn is wired) or
    an explicit reason why nobody computes it at $0."""

    source: str | None = None
    reason: str | None = None


class ChainsResponse(Envelope):
    """The full catalog, config-not-observed: data_mode='static' marks that
    these are maintained capability flags, not a response observed from an
    upstream at request time. The `note` travels with the payload.
    `capabilities` renders the wiring map (BE-F5a-R): who computes what per
    chain — a source name, or an explicit reason sentence."""

    data_mode: DataMode = "static"

    chains: list[ChainInfo] = Field(default_factory=list)
    note: str | None = None
    capabilities: dict[str, dict[str, CapabilityRow]] = Field(
        default_factory=dict)


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


# ── market surface (PROMPT-V Fase 3/4: ohlcv · socials · detect) ─────────

class CacheInfo(BaseModel):
    """Provenance footer: was this served from the TTL cache, and how old."""

    cached: bool = False
    age_s: float | None = None
    ttl_s: int = 0


class Provenance(BaseModel):
    """The FAKTA envelope law (2026-08-30): every new route carries WHERE a
    payload came from and HOW fresh it is. `degraded` is None on a healthy
    payload and a reason sentence otherwise — a degraded payload still ships
    real data (or honest empties), never fabricated values."""

    source: str | None = None
    host: str | None = None
    cache: CacheInfo = Field(default_factory=CacheInfo)
    freshness: dict[str, object] = Field(default_factory=dict)
    degraded: str | None = None


class OhlcvCandle(BaseModel):
    """One GT candle, verbatim floats (no rounding, no gap-filling). ts is
    unix seconds UTC of the bucket OPEN."""

    ts: int
    o: float
    h: float
    l: float
    c: float
    v: float


class OhlcvResponse(Envelope):
    chain: str | None = None
    network_id: str | None = None
    pair: str | None = None
    resolution: str | None = None
    timeframe: str | None = None
    aggregate: int | None = None
    candles: list[OhlcvCandle] = Field(default_factory=list)
    base_token: dict[str, str | None] | None = None
    provenance: Provenance = Field(default_factory=Provenance)


class WebsiteLink(BaseModel):
    url: str
    label: str | None = None


class SocialLink(BaseModel):
    url: str
    type: str | None = None


class SocialsResponse(Envelope):
    """DS token-pairs info for a TOKEN address. Empty websites+links is the
    honest 'no official links in feed' state — links are never invented."""

    chain: str | None = None
    token: str | None = None
    image_url: str | None = None
    header_url: str | None = None
    websites: list[WebsiteLink] = Field(default_factory=list)
    links: list[SocialLink] = Field(default_factory=list)
    pair_address: str | None = None
    dex_id: str | None = None
    liquidity_usd: float | None = None
    provenance: Provenance = Field(default_factory=Provenance)


class DetectCandidate(BaseModel):
    """One candidate pair on one founder chain — the deepest pool DS returned
    for that chainId. `chain` is the founder key (sol|bnb|base|hype|hood)."""

    chain: str | None = None
    chain_id: str | None = None
    symbol: str | None = None
    name: str | None = None
    token_address: str | None = None
    pair_address: str | None = None
    dex_id: str | None = None
    liquidity_usd: float | None = None
    price_usd: Verbatim = None
    url: str | None = None


class DetectResponse(Envelope):
    query: str | None = None
    kind: str | None = None
    candidates: list[DetectCandidate] = Field(default_factory=list)
    provenance: Provenance = Field(default_factory=Provenance)


# ── rug surface (PROMPT-V2 P3: multi-chain rug check, $0 providers) ──────

class RugRiskRow(BaseModel):
    """One RugCheck.xyz risk entry, verbatim (name/level/score/description)."""

    name: str | None = None
    level: str | None = None
    score: Verbatim = None
    description: str | None = None


class RugSolResponse(Envelope):
    """Solana rug summary via RugCheck.xyz — proxied server-side so the
    browser never calls a third-party host (zero-third-party law)."""

    mint: str | None = None
    score: Verbatim = None
    score_normalised: Verbatim = None
    lp_locked_pct: Verbatim = None
    risks: list[RugRiskRow] = Field(default_factory=list)
    provenance: Provenance = Field(default_factory=Provenance)


class RugEvmRow(BaseModel):
    """One GoPlus field → one panel row, verbatim string value (GoPlus sends
    0/1 and '0.05' style strings — no coercion, the FE renders them as-is)."""

    field: str
    value: Verbatim = None
    note: str | None = None


class RugEvmResponse(Envelope):
    """EVM rug surface via GoPlus token_security (bnb=56, base=8453). Rows
    are the verbatim mapping of the fields we display; provider chip rides
    on every row ('GoPlus'). 'context not audit' stays the standing law."""

    chain: str | None = None
    chain_id: int | None = None
    token: str | None = None
    token_symbol: str | None = None
    rows: list[RugEvmRow] = Field(default_factory=list)
    provenance: Provenance = Field(default_factory=Provenance)


# ── PROMPT-V3 R2: whale windows on the GeckoTerminal trade tape ─────────

class WhaleWindowRow(BaseModel):
    """One time window's whale stats. buy/sell/net are USD sums over the
    whale trades in the window; a quiet window is honest zeros."""

    trades: int = 0
    whale_trades: int = 0
    buy_usd: float = 0.0
    sell_usd: float = 0.0
    net_usd: float = 0.0


class WhaleTapeRow(BaseModel):
    """One whale tape trade, verbatim from GT (kind/ts/usd/wallet/tx)."""

    wallet: str | None = None
    kind: str | None = None
    ts: str | None = None
    usd: float | None = None
    tx: str | None = None


class WhaleTopWallet(BaseModel):
    """Per-wallet net over the walked tape — buys/sells counted, never re-derived."""

    wallet: str | None = None
    net_usd: float | None = None
    buys: int = 0
    sells: int = 0
    trades: int = 0


class WhaleVolumeHist(BaseModel):
    """M1 (PROMPT-V4): hourly volume histogram over the 24h walk — ALL trades
    (buckets) with the whale share (whale_buckets), both in USD. Rendered
    muted behind the whale netflow line so a quiet whale window still shows
    the living tape."""

    bucket_s: float = 3600.0
    buckets: list[float] = Field(default_factory=list)
    whale_buckets: list[float] = Field(default_factory=list)


class WhaleWindowsResponse(Envelope):
    """One chain's whale windows for one contract. A whale is a LABELLED
    HEURISTIC (one tape trade ≥ chain threshold), never an on-chain label.
    data_mode='unwired' + the note in data_sources when GT has no pool for
    the contract on that chain — a fact, not an error. M1: top_below_threshold
    + volume_hist keep the page alive when no trade crosses the line."""

    data_mode: DataMode = "unwired"

    chain: str | None = None
    network: str | None = None
    token: str | None = None
    pool: str | None = None
    pool_name: str | None = None
    threshold_usd: float | None = None
    threshold_note: str | None = None
    windows: dict[str, WhaleWindowRow] = Field(default_factory=dict)
    tape: list[WhaleTapeRow] = Field(default_factory=list)
    top_wallets: list[WhaleTopWallet] = Field(default_factory=list)
    top_below_threshold: list[WhaleTapeRow] = Field(default_factory=list)
    volume_hist: WhaleVolumeHist | None = None
    pools_walked: int = 0
    tape_trades_seen: int = 0
    tape_pages: int = 0
    tape_oldest_ts: str | None = None
    data_sources: list[str] = Field(default_factory=list)


class WhaleCandidate(BaseModel):
    """A pool the CA resolves to (AUTO candidates) or a trending pool."""

    chain: str | None = None
    network: str | None = None
    pool: str | None = None
    name: str | None = None
    liquidity_usd: float | None = None
    volume_24h: float | None = None
    price_usd: float | None = None


class WhaleAutoResponse(Envelope):
    """AUTO mode: the CA resolved across networks, whale windows per chain
    that lists it, plus a small trending top-N as candidates. Every failure
    is a sentence in data_sources — never a red wall. M1: chains GT truly
    rate-limited (genuine 429s) ship as ONE structured list — the surface
    renders a single aggregate banner, never stacked yellow rows."""

    data_mode: DataMode = "live"

    token: str | None = None
    results: list[WhaleWindowsResponse] = Field(default_factory=list)
    candidates: list[WhaleCandidate] = Field(default_factory=list)
    trending: list[WhaleCandidate] = Field(default_factory=list)
    data_sources: list[str] = Field(default_factory=list)
    pools_walked: int = 0
    rate_limited: list[str] = Field(default_factory=list)
    retry_after_s: int = 60


# ── PROMPT-V3 R4: fee frontier — the planned fee as inspectable data ────

class FeeProviderStatus(BaseModel):
    """One chain's fee path, verbatim from the docs/FEE-MODELS-2026.md
    matrix row. Verdict vocabulary: SIAP-$0 · PERLU-AGREEMENT-BISNIS ·
    TIDAK-ADA."""

    provider: str
    mechanism: str
    verdict: str
    note: str


class FeeEstimateResponse(Envelope):
    """The PLANNED VILMEI fee (0.50% = ops 0.30 + buyback 0.10 + rewards
    0.10) for one notional on one chain. data_mode='static': a policy
    constant, not a live feed — and nothing is charged, VILMEI is read-only."""

    data_mode: DataMode = "static"

    chain: str | None = None
    amount_usd: float = 0.0
    planned_rate_bps: int = 50
    split_bps: dict[str, int] = Field(default_factory=dict)
    estimate_usd: float = 0.0
    split_usd: dict[str, float] = Field(default_factory=dict)
    provider: FeeProviderStatus | None = None
    matrix: dict[str, FeeProviderStatus] = Field(default_factory=dict)
    buyback_blocker: str | None = None
    honest_note: str = "planned — nothing is charged; VILMEI is read-only"
    provenance: dict = Field(default_factory=dict)


# ── PROMPT-V4 M3: vault destinations — claim-based, public addresses only ─

class VaultDestination(BaseModel):
    """One fee-slice vault: a founder-claimed PUBLIC address, or declared
    null. No key ever enters this repo (docs/FEE-VAULTS.md)."""

    address: str | None = None
    status: str = "awaiting-founder"        # claimed | awaiting-founder
    note: str = ""


class VaultChainRow(BaseModel):
    """One chain's vault row: its fee-path verdict plus the three slice
    vaults (ops 0.30 · buyback 0.10 · rewards 0.10)."""

    fee_path_verdict: str = ""
    vaults: dict[str, VaultDestination] = Field(default_factory=dict)


class FeeDestinationsResponse(Envelope):
    """The 5-chain × 3-slice vault map as policy data (data_mode='static').
    Published BEFORE a basis point could move; nothing is charged."""

    data_mode: DataMode = "static"

    slices_bps: dict[str, int] = Field(default_factory=dict)
    chains: dict[str, VaultChainRow] = Field(default_factory=dict)
    claimed: int = 0
    total: int = 0
    honest_note: str = ("vault map = policy data: public addresses only, "
                        "founder-claimed in .env")
    provenance: dict = Field(default_factory=dict)


# ── PROMPT-V4 M4: portfolio snapshot — market facts for a watchlist ──────

class PortfolioRow(BaseModel):
    """One watchlist token: verbatim market facts from the deepest GT pool,
    or an honest state sentence (no_pool / rate_limited / upstream_error).
    Absent stays absent — never imputed, never zero-filled."""

    chain: str
    token: str
    status: str                                     # ok | no_pool | rate_limited | upstream_error
    pool: str | None = None
    pool_name: str | None = None
    price_usd: float | None = None
    liquidity_usd: float | None = None
    volume_24h: float | None = None
    change_24h: float | None = None
    note: str | None = None


class PortfolioSnapshotResponse(Envelope):
    """Market facts for up to 15 watchlist tokens (positions/amounts stay
    client-side; the server answers only public prices). data_mode='live'."""

    data_mode: DataMode = "live"

    rows: list[PortfolioRow] = Field(default_factory=list)
    rate_limited: list[str] = Field(default_factory=list)
    pools_walked: int = 0
    data_sources: list[str] = Field(default_factory=list)


# ── PROMPT-V4 M5: holdings check — read-only balances for public addresses ──

class HoldingToken(BaseModel):
    """One held token, verbatim: address + amount when the source can read
    them. symbol only where the source provides it for free (Blockscout);
    amount None when decimals are unreadable — never guessed. price_usd /
    change_24h are the M5 price join: the deepest GeckoTerminal pool read
    from the token's OWN side (heuristic — dex-reserve derived); price_note
    says why a price is absent (no_pool | rate_limited | upstream_error |
    capped), never silently."""

    token: str | None = None
    symbol: str | None = None
    amount: float | None = None
    price_usd: float | None = None
    change_24h: float | None = None
    price_note: str | None = None


class HoldingsResponse(Envelope):
    """Read-only balances for a PUBLIC address (v1 law: no signing path).
    coverage says what the terminal could honestly see: ok (facts), no_key
    (founder's call pending), partial (no free source for the chain),
    upstream_error (tried, failed — the reasons say how). Absent stays
    absent — never zero-filled, never fabricated."""

    chain: str
    address: str
    coverage: str                                   # ok | no_key | partial | upstream_error
    native_symbol: str | None = None
    native_amount: float | None = None
    native_price_usd: float | None = None
    native_change_24h: float | None = None
    tokens: list[HoldingToken] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    pricing_note: str | None = None
