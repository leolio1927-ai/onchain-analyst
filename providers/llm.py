"""Provider-agnostic LLM client factory — one dict, one construction site.

MiniMax is the deployment default; every supported endpoint is described in
LLM_CONFIGS and nowhere else (no scattered hardcoded URLs). Keys travel in
SDK auth headers, never in URLs or logs.
"""
from __future__ import annotations

import os
from typing import Any


class LLMConfigError(RuntimeError):
    """Unknown LLM provider name or unusable configuration."""


# VERIFY(docs): confirm against MiniMax's OpenAI-compatible endpoint docs
# before production traffic; this path assumes their /v1 chat API.
MinimaxDefaultBase = "https://api.minimax.chat/v1"

# The single source of provider endpoint config. ai_analyst builds every
# client through make_llm_client() — no other construction site exists.
LLM_CONFIGS: dict[str, dict[str, Any]] = {
    "claude":  {"kind": "anthropic", "default_base": None, "default_model": "claude-sonnet-4-5"},
    "minimax": {"kind": "openai", "default_base": MinimaxDefaultBase, "default_model": "MiniMax-M1"},
    "openai":  {"kind": "openai", "default_base": "https://api.openai.com/v1", "default_model": "gpt-4o-mini"},
    "glm":     {"kind": "openai", "default_base": "https://api.z.ai/api/paas/v4/", "default_model": "glm-5.3"},
    "kimi":    {"kind": "openai", "default_base": "https://api.moonshot.ai/v1", "default_model": "kimi-k3"},
}

DEFAULT_PROVIDER = "minimax"


def resolve_llm_config(provider: str | None = None) -> dict[str, Any]:
    """provider name → {name, kind, base_url, model}.

    Precedence: explicit arg → LLM_PROVIDER env → MiniMax (DEFAULT_PROVIDER).
    base_url:   explicit arg (set by caller) → LLM_BASE_URL env → dict default.
    model:      LLM_MODEL env → dict default_model.
    """
    name = (provider or os.environ.get("LLM_PROVIDER") or DEFAULT_PROVIDER).strip().lower()
    if name not in LLM_CONFIGS:
        raise LLMConfigError(
            f"unknown LLM provider {name!r} — pick {'|'.join(sorted(LLM_CONFIGS))}")
    cfg = LLM_CONFIGS[name]
    return {
        "name": name,
        "kind": cfg["kind"],
        "base_url": cfg["default_base"],
        "model": os.environ.get("LLM_MODEL", "").strip() or cfg["default_model"],
    }


def resolve_llm_model(provider: str | None = None) -> str:
    """LLM_MODEL env wins, else the provider's dict default."""
    return os.environ.get("LLM_MODEL", "").strip() or resolve_llm_config(provider)["model"]


def make_llm_client(provider: str | None = None, api_key: str | None = None,
                    base_url: str | None = None) -> Any:
    """Construct the SDK client for `provider`.

    `api_key` (explicit or LLM_API_KEY env) is passed to the SDK's header
    auth — never a URL or query string. `base_url` precedence: explicit arg
    → LLM_BASE_URL env → dict default_base. Anthropic with api_key=None keeps
    the old behavior of reading ANTHROPIC_API_KEY itself.
    """
    cfg = resolve_llm_config(provider)
    key = api_key if api_key is not None else (os.environ.get("LLM_API_KEY") or None)
    if cfg["kind"] == "anthropic":
        from anthropic import Anthropic
        return Anthropic(api_key=key, timeout=60.0)
    from openai import OpenAI
    base = base_url or os.environ.get("LLM_BASE_URL", "").strip() or cfg["base_url"]
    return OpenAI(api_key=key or "", base_url=base, timeout=60.0)
