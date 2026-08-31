"""PROMPT-V4 M5 — holdings check: read-only balances for PUBLIC addresses.

Coverage (all probe-first, raw in logs/m0-* + logs/m5-probe-blockscout.txt,
2026-08-31):
- sol   → Helius RPC getBalance + getTokenAccountsByOwner (keyed:
          HELIUS_API_KEY — founder's call; the old REST /v0 balances
          endpoint 404s now, probe 2026-08-31)
- bnb   → Alchemy eth_getBalance + getTokenBalances (keyed: ALCHEMY_API_KEY)
- base  → Alchemy when the founder key is present; otherwise the KEYLESS
          Blockscout fallback (native + ERC-20, transient-500 tolerant)
- hype  → PARTIAL: no free-tier balance source verified (Etherscan V2 free
- hood  →  tier is ETH-only; no public blockscout instance) — a sentence

Read-only by construction: a public address goes in, balances come out. No
signing path exists in this repo (v1 law). A missing key is an honest
no_key sentence, an unsupported chain is a PARTIAL sentence — never red,
never a fabricated zero."""
from __future__ import annotations

from . import alchemy, blockscout, helius

NATIVE_SYMBOL = {"sol": "SOL", "bnb": "BNB", "base": "ETH",
                 "hype": "HYPE", "hood": "HOOD"}

_PARTIAL_NOTE = (
    "holdings:partial — no free-tier balance source verified for {chain} "
    "(M0 probe 2026-08-31): Etherscan V2's free tier is ETH-only, no public "
    "blockscout instance serves it, Helius/Alchemy have no coverage — the "
    "terminal says so instead of guessing")


def check(chain: str, address: str) -> dict:
    """One holdings view per (chain, address). The shape is always complete;
    absence lives in the fields + reasons, never in a raised error."""
    out: dict = {
        "chain": chain, "address": address,
        "native_symbol": NATIVE_SYMBOL.get(chain),
        "native_amount": None, "tokens": [], "sources": [], "reasons": [],
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
                          "amount": t.get("amount")}
                         for t in data.get("tokens") or [] if t.get("mint")]
        return out

    if chain == "bnb":
        data, note = alchemy.get_balances(chain, address)
        return _evm_result(out, data, note, ["alchemy"],
                           "holdings:no_key — bnb balances need ALCHEMY_API_KEY; "
                           "declared-null until the founder claims one (see "
                           ".env.example). The address itself was never sent anywhere")

    # base: keyed Alchemy first, keyless Blockscout fallback ($0 path)
    if alchemy._key():                                       # same-tier provider switch
        data, note = alchemy.get_balances(chain, address)
        return _evm_result(out, data, note, ["alchemy"],
                           "holdings:no_key — ALCHEMY_API_KEY vanished mid-flight")
    data, note = blockscout.get_balances(chain, address)
    if data is not None:
        out["data_mode"] = "live"
        out["coverage"] = "ok"
        out["sources"] = ["blockscout"]
        out["native_amount"] = data.get("native")
        out["tokens"] = data.get("tokens") or []
        if data.get("tokens_note"):
            out["reasons"].append(data["tokens_note"])
        out["reasons"].append(
            "holdings:keyless — no ALCHEMY_API_KEY set, so base rides the free "
            "Blockscout v2 API (native + ERC-20); the Blockscout tokens page is "
            "probe-proven flaky, a miss there ships native-only with a sentence")
        return out
    out["data_mode"] = "live"
    out["coverage"] = "upstream_error"
    out["sources"] = ["blockscout"]
    out["reasons"].append(f"holdings:upstream_error — {note}")
    return out


def _evm_result(out: dict, data: dict | None, note: str | None,
                sources: list[str], no_key_sentence: str) -> dict:
    if data is not None:
        out["data_mode"] = "live"
        out["coverage"] = "ok"
        out["sources"] = sources
        out["native_amount"] = data.get("native")
        out["tokens"] = data.get("tokens") or []
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
