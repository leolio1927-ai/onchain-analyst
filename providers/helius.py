"""Provider Helius — saldo wallet via PUBLIC address, read-only (catatan kerja §2.2).

KERANGKA: butuh HELIUS_API_KEY (urusan founder — jangan hardcode).
Response shape belum diverifikasi runtime tanpa key: parse defensif,
semua field opsional, tampilkan apa adanya.
"""
from __future__ import annotations

import json
import os
import urllib.request

BASE = "https://mainnet.helius-rpc.com"
LAMPORTS_PER_SOL = 1_000_000_000


class NoKeyError(RuntimeError):
    pass


def fetch_balances(address: str) -> dict:
    key = os.environ.get("HELIUS_API_KEY")
    if not key:
        raise NoKeyError("HELIUS_API_KEY belum diset — urusan founder (lihat .env.example)")
    url = f"{BASE}/v0/addresses/{address}/balances?api-key={key}"
    req = urllib.request.Request(url, headers={"User-Agent": "terminal-alpha/0.1"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.load(r)

    native = data.get("native_balance") or {}
    tokens = []
    for t in (data.get("tokens") or [])[:10]:
        try:
            amount = float(t.get("amount") or 0) / (10 ** int(t.get("decimals") or 0))
        except (TypeError, ValueError, ZeroDivisionError):
            continue
        tokens.append({"mint": t.get("mint"), "amount": amount})
    return {"address": address,
            "sol": (native.get("lamports") or 0) / LAMPORTS_PER_SOL,
            "tokens": tokens}
