"""AI Analyst — evidence-first, multi-provider (catatan kerja §7).

Registry: claude (Anthropic SDK), glm & kimi (endpoint OpenAI-compatible).
Semua provider menerima KONTEKS IDENTIK (<evidence>) — beda otak, sama bukti.
Setiap panggilan dicatat di grounding log lengkap dengan nama provider →
bisa dibandingkan lintas model & di-replay buat regression-test.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

MODEL_DEFAULT = "claude-sonnet-4-5"

SYSTEM_PROMPT = """Kamu AI analyst di Terminal Alpha — alat riset memecoin read-only.
Sumber kebenaranmu HANYA blok <evidence> dari user.

ATURAN MUTLAK:
1. Jangan menambahkan fakta di luar <evidence>. Yang dicari tapi tidak ada di data → katakan "data tidak tersedia".
2. DILARANG: prediksi arah/target harga, saran beli/jual, janji keuntungan, kata "pasti"/"dijamin"/"akurasi tinggi".
3. Setiap klaim WAJIB merujuk sinyal atau angka spesifik dari <evidence> (sebutkan labelnya).
4. Framing resmi: "mengurangi noise, menambah konteks" — heuristik otomatis, bukan audit.
5. Jika level = DATA KURANG, tekankan keterbatasan data. Jangan mengarang kesimpulan.

FORMAT OUTPUT (bahasa Indonesia, tanpa basa-basi):
- 1 kalimat ringkasan kondisi (sebut level + skor).
- 2-3 poin sinyal paling menentukan (label: bukti singkat).
- 1 poin keterbatasan data/kelemahan analisis.
Maksimal ~120 kata."""


@dataclass(frozen=True)
class Provider:
    key: str
    kind: str            # "anthropic" | "openai"
    env_key: str
    env_base: str | None
    env_model: str
    default_model: str
    default_base: str | None


# default_model/base = tebakan awal dari user — VERIFIKASI dari dashboard
# provider masing-masing; koreksi cukup lewat .env, tanpa sentuh kode.
PROVIDERS = {
    "claude": Provider("claude", "anthropic", "ANTHROPIC_API_KEY", None,
                       "ALPHA_MODEL", MODEL_DEFAULT, None),
    "glm":    Provider("glm", "openai", "GLM_API_KEY", "GLM_BASE_URL",
                       "GLM_MODEL", "glm-5.3", "https://api.z.ai/api/paas/v4/"),
    "kimi":   Provider("kimi", "openai", "KIMI_API_KEY", "KIMI_BASE_URL",
                       "KIMI_MODEL", "kimi-k3", "https://api.moonshot.ai/v1"),
}


class NoKeyError(RuntimeError):
    pass


def _evidence(pair: dict, assessment: dict) -> dict:
    """Subset data yang BOLEH dilihat AI — bukan raw dump. AI tidak bisa
    mengutip field yang tidak pernah dikasih."""
    return {
        "token": pair.get("baseToken"),
        "dex": pair.get("dexId"),
        "price_usd": pair.get("priceUsd"),
        "liquidity_usd": (pair.get("liquidity") or {}).get("usd"),
        "fdv_usd": pair.get("fdv") or pair.get("marketCap"),
        "volume": pair.get("volume"),
        "price_change_pct": pair.get("priceChange"),
        "txns": pair.get("txns"),
        "pair_created_at": pair.get("pairCreatedAt"),
        "assessment": {
            "level": assessment.get("level"),
            "score": assessment.get("score"),
            "notes": assessment.get("notes"),
            "signals": [
                {"label": s["label"], "weight": s["weight"],
                 "severity": s["severity"], "evidence": s["evidence"]}
                for s in assessment.get("signals", [])
            ],
        },
    }


def _call(provider: Provider, system: str, user: str, max_tokens: int):
    api_key = os.environ.get(provider.env_key)
    if not api_key:
        raise NoKeyError(f"{provider.env_key} belum diset (lihat .env.example)")

    if provider.kind == "anthropic":
        from anthropic import Anthropic
        client = Anthropic()
        msg = client.messages.create(
            model=os.environ.get(provider.env_model, provider.default_model),
            max_tokens=max_tokens, system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if b.type == "text")
        usage = {"input": msg.usage.input_tokens, "output": msg.usage.output_tokens}
        return text, msg.model, usage

    # openai-compatible: glm / kimi
    from openai import OpenAI
    base = os.environ.get(provider.env_base or "", provider.default_base)
    client = OpenAI(api_key=api_key, base_url=base)
    rsp = client.chat.completions.create(
        model=os.environ.get(provider.env_model, provider.default_model),
        max_tokens=max_tokens,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
    )
    text = rsp.choices[0].message.content or ""
    u = rsp.usage
    usage = {"input": getattr(u, "prompt_tokens", None),
             "output": getattr(u, "completion_tokens", None)}
    return text, rsp.model, usage


def _ground_log(provider: str, ev: dict, output: str, model: str, tier: str,
                usage: dict) -> Path:
    d = Path("logs/grounding")
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{datetime.now(timezone.utc):%Y-%m-%d}.jsonl"
    rec = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "provider": provider, "model": model, "tier": tier,
        "evidence": ev, "output": output, "usage": usage,
    }
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return path


def explain(pair: dict, assessment: dict, tier: str = "free",
            provider: str = "claude") -> str:
    p = PROVIDERS[provider]
    ev = _evidence(pair, assessment)
    text, model, usage = _call(
        p, SYSTEM_PROMPT,
        f"<evidence>\n{json.dumps(ev, ensure_ascii=False, indent=1)}\n</evidence>\n\n"
        f"Analisis token ini. Tier: {tier}.",
        max_tokens=400 if tier == "free" else 1000,
    )
    _ground_log(p.key, ev, text, model, tier, usage)
    return text
