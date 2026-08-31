"""PROMPT-V4 M5 — holdings check: read-only balances for PUBLIC addresses,
priced against each token's deepest GeckoTerminal pool (USD + Δ24h).

Coverage (all probe-first, raw in logs/m0-* + logs/m5-probe-blockscout.txt +
logs/n1-probe-*.txt, 2026-08-31):
- sol   → Helius RPC getBalance + getTokenAccountsByOwner (keyed:
          HELIUS_API_KEY — founder's call; key rides the X-API-Key header,
          never the URL, probed 2026-08-31; the old REST /v0 balances
          endpoint 404s now)
- bnb   → Alchemy eth_getBalance + getTokenBalances (keyed: ALCHEMY_API_KEY)
- base  → Alchemy when the founder key is present; otherwise the KEYLESS
          Blockscout fallback (native + ERC-20, transient-500 tolerant)
- hype  → PARTIAL: no free-tier balance source verified (Etherscan V2 free
- hood  →  tier is ETH-only; no public blockscout instance) — a sentence

Pricing is a heuristic join (chip on the page says so): every USD number is
the base/quote price of the deepest GT pool the token trades in, read from
the token's OWN side of the pool (pool_token_side) — a quote-side holding
like USDC still prices correctly, and ships no Δ24h, because GT exposes no
quote-side change (probe 2026-08-31): absence stays absence. Native rides
the wrapped twin (WSOL / WETH on base); BNB rides a v2-search WBNB pool
because GT serves no bsc token page for WBNB (probe: 404). Tokens beyond
the price cap keep their amount and ship no price — the free tier is
~10 GT calls/min, and a holdings check must never burst past it.

Read-only by construction: a public address goes in, balances come out. No
signing path exists in this repo (v1 law). A missing key is an honest
no_key sentence, an unsupported chain is a PARTIAL sentence — never red,
never a fabricated zero."""
from __future__ import annotations

import math

from . import alchemy, blockscout, helius
from . import geckoterminal as gt

NATIVE_SYMBOL = {"sol": "SOL", "bnb": "BNB", "base": "ETH",
                 "hype": "HYPE", "hood": "HOOD"}

# Wrapped twins GT prices for the natives (probed 2026-08-31: WSOL base-side
# pools 200 · WETH/USDC 0.3% 200 @ $2450 · WBNB has NO bsc token page → the
# search path below).
_WRAPPED_NATIVE = {"sol": "So11111111111111111111111111111111111111112",
                   "base": "0x4200000000000000000000000000000000000006"}

# Free tier is ~10 GT calls/min: one native lookup + up to 8 token lookups
# keeps a cold check under budget; every re-check inside the TTL is free.
PRICE_CAP = 8

_PARTIAL_NOTE = (
    "holdings:partial — no free-tier balance source verified for {chain} "
    "(M0 probe 2026-08-31): Etherscan V2's free tier is ETH-only, no public "
    "blockscout instance serves it, Helius/Alchemy have no coverage — the "
    "terminal says so instead of guessing")


def _num(v: object) -> float | None:
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f           # NaN is absent, not zero


def _reserve(pool: dict) -> float:
    try:
        return float((pool.get("attributes") or {}).get("reserve_in_usd") or 0)
    except (TypeError, ValueError):
        return 0.0


def _price_from_pool(pool: dict, side: str) -> tuple[float | None, float | None]:
    """Read price + Δ24h from the pool's own side. GT exposes no quote-side
    24h change (probe: attribute absent) — quote holdings price but carry
    no Δ, and the page says so with a dash."""
    a = pool.get("attributes") or {}
    if side == "base":
        chg = _num((a.get("price_change_percentage") or {}).get("h24"))
        return _num(a.get("base_token_price_usd")), chg
    return _num(a.get("quote_token_price_usd")), None


def _token_facts(chain: str, token: str) -> tuple[float | None, float | None, str | None]:
    """(price_usd, change_24h, note) for one token; note only when the price
    is absent — 'no_pool' | 'rate_limited' | 'upstream_error'. The pool used
    is the deepest one where the token is the BASE; a token that only quotes
    (USDC and friends) falls back to its deepest quote-side pool."""
    try:
        pools = gt.fetch_pools(chain, token)
    except Exception as e:                          # noqa: BLE001 — upstream states are notes
        if gt.is_rate_limited(e):
            return None, None, "rate_limited"
        return None, None, "upstream_error"
    base_side = [p for p in pools if gt.pool_token_side(p, chain, token) == "base"]
    quote_side = [p for p in pools if gt.pool_token_side(p, chain, token) == "quote"]
    if base_side:
        price, chg = _price_from_pool(max(base_side, key=_reserve), "base")
    elif quote_side:
        price, chg = _price_from_pool(max(quote_side, key=_reserve), "quote")
    else:
        return None, None, "no_pool"
    if price is None:
        return None, None, "upstream_error"
    return price, chg, None


def _native_facts(chain: str) -> tuple[float | None, float | None, str | None]:
    """Native price via the wrapped twin. sol/base ride the standard
    pools-by-token path; bnb rides the v2 search because GT 404s the bsc
    WBNB token page (probe 2026-08-31) — the WBNB-base pool names are the
    match, read from the base side."""
    wrapped = _WRAPPED_NATIVE.get(chain)
    if wrapped is not None:
        return _token_facts(chain, wrapped)
    if chain == "bnb":
        try:
            hits = gt.search_pools_v2("WBNB", "bnb")
        except Exception as e:                      # noqa: BLE001 — upstream states are notes
            if gt.is_rate_limited(e):
                return None, None, "rate_limited"
            return None, None, "upstream_error"
        cands = [p for p in hits
                 if ((p.get("attributes") or {}).get("name") or "").startswith("WBNB /")]
        if not cands:
            return None, None, "no_pool"
        price, chg = _price_from_pool(max(cands, key=_reserve), "base")
        if price is None:
            return None, None, "upstream_error"
        return price, chg, None
    return None, None, "no_pool"


def _attach_pricing(out: dict, chain: str) -> None:
    """Join GT prices onto an already-assembled balance result (coverage ok
    only — a balance-less result has nothing to price). Every miss is a
    note on the row + ONE aggregate sentence, never a red wall."""
    reasons = out["reasons"]
    rate_limited = 0
    if "geckoterminal" not in out["sources"]:
        out["sources"].append("geckoterminal")

    nprice, nchg, nnote = _native_facts(chain)
    out["native_price_usd"] = nprice
    out["native_change_24h"] = nchg
    if nnote == "rate_limited":
        rate_limited += 1
    elif nnote is not None:
        reasons.append(
            f"holdings:native_price_unavailable — {nnote}: the native USD price "
            f"is a dash, balances are untouched by it (heuristic pricing — "
            f"dex-reserve derived)")

    priced = 0
    priceable = [t for t in out["tokens"] if t.get("amount") is not None]
    for i, t in enumerate(priceable):
        if i >= PRICE_CAP:
            t["price_note"] = "capped"
            continue
        price, chg, note = _token_facts(chain, t["token"])
        t["price_usd"] = price
        t["change_24h"] = chg
        if note == "rate_limited":
            rate_limited += 1
            t["price_note"] = "rate_limited"
        elif note is not None:
            t["price_note"] = note
        else:
            priced += 1

    capped = max(0, len(priceable) - PRICE_CAP)
    if capped:
        reasons.append(
            f"holdings:pricing_capped — first {PRICE_CAP} of {len(priceable)} "
            f"tokens priced (GT free tier is ~10 calls/min); the rest show "
            f"amounts only, re-check prices them next window")
    if rate_limited:
        reasons.append(
            f"holdings:pricing_rate_limited — {rate_limited} price lookups hit "
            f"GeckoTerminal's 429; those USD cells are dashes until retry "
            f"(~60s free-tier window)")
    out["pricing_note"] = (
        "heuristic pricing — dex-reserve derived: every USD number is the "
        f"deepest-pool price GeckoTerminal reports ({priced} of "
        f"{len(priceable)} tokens priced)"
        if priceable else
        "heuristic pricing — dex-reserve derived: USD numbers come from the "
        "deepest pool GeckoTerminal reports")


def check(chain: str, address: str) -> dict:
    """One holdings view per (chain, address). The shape is always complete;
    absence lives in the fields + reasons, never in a raised error."""
    out: dict = {
        "chain": chain, "address": address,
        "native_symbol": NATIVE_SYMBOL.get(chain),
        "native_amount": None, "native_price_usd": None, "native_change_24h": None,
        "tokens": [], "sources": [], "reasons": [],
    }

    if chain in ("hype", "hood"):
        out["data_mode"] = "partial"
        out["coverage"] = "partial"
        out["reasons"].append(_PARTIAL_NOTE.format(chain=chain))
        return out

    if chain == "sol":
        try:
            data = helius.fetch_balances(address)
        except helius.NoKeyError:
            out["data_mode"] = "partial"
            out["coverage"] = "no_key"
            out["reasons"].append(
                "holdings:no_key — sol balances need HELIUS_API_KEY; declared-null "
                "until the founder claims one (see .env.example). The address "
                "itself was never sent anywhere")
            return out
        except Exception as e:                          # noqa: BLE001 — upstream states are sentences
            out["data_mode"] = "live"
            out["coverage"] = "upstream_error"
            out["sources"] = ["helius"]
            out["reasons"].append(f"holdings:upstream_error — helius: {str(e)[:120]}")
            return out
        out["data_mode"] = "live"
        out["coverage"] = "ok"
        out["sources"] = ["helius"]
        out["native_amount"] = data.get("sol")
        out["tokens"] = [{"token": t.get("mint"), "symbol": None,
                          "amount": t.get("amount"),
                          "price_usd": None, "change_24h": None, "price_note": None}
                         for t in data.get("tokens") or [] if t.get("mint")]
        _attach_pricing(out, chain)
        return out

    if chain == "bnb":
        data, note = alchemy.get_balances(chain, address)
        out = _evm_result(out, data, note, ["alchemy"],
                          "holdings:no_key — bnb balances need ALCHEMY_API_KEY; "
                          "declared-null until the founder claims one (see "
                          ".env.example). The address itself was never sent anywhere")
        if out["coverage"] == "ok":
            _attach_pricing(out, chain)
        return out

    # base: keyed Alchemy first, keyless Blockscout fallback ($0 path)
    if alchemy._key():                                       # same-tier provider switch
        data, note = alchemy.get_balances(chain, address)
        out = _evm_result(out, data, note, ["alchemy"],
                          "holdings:no_key — ALCHEMY_API_KEY vanished mid-flight")
    else:
        data, note = blockscout.get_balances(chain, address)
        if data is not None:
            out["data_mode"] = "live"
            out["coverage"] = "ok"
            out["sources"] = ["blockscout"]
            out["native_amount"] = data.get("native")
            out["tokens"] = [{**t, "price_usd": None, "change_24h": None,
                              "price_note": None} for t in data.get("tokens") or []]
            if data.get("tokens_note"):
                out["reasons"].append(data["tokens_note"])
            out["reasons"].append(
                "holdings:keyless — no ALCHEMY_API_KEY set, so base rides the free "
                "Blockscout v2 API (native + ERC-20); the Blockscout tokens page is "
                "probe-proven flaky, a miss there ships native-only with a sentence")
        else:
            out["data_mode"] = "live"
            out["coverage"] = "upstream_error"
            out["sources"] = ["blockscout"]
            out["reasons"].append(f"holdings:upstream_error — {note}")
    if out["coverage"] == "ok":
        _attach_pricing(out, chain)
    return out


def _evm_result(out: dict, data: dict | None, note: str | None,
                sources: list[str], no_key_sentence: str) -> dict:
    if data is not None:
        out["data_mode"] = "live"
        out["coverage"] = "ok"
        out["sources"] = sources
        out["native_amount"] = data.get("native")
        out["tokens"] = [{**t, "price_usd": None, "change_24h": None,
                          "price_note": None} for t in data.get("tokens") or []]
        return out
    out["sources"] = sources
    if note == "alchemy:not_configured":
        out["data_mode"] = "partial"
        out["coverage"] = "no_key"
        out["reasons"].append(no_key_sentence)
    else:
        out["data_mode"] = "live"
        out["coverage"] = "upstream_error"
        out["reasons"].append(f"holdings:upstream_error — {note}")
    return out
