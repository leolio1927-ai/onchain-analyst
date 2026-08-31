"""Provider NVIDIA NIM — OpenAI-compatible chat endpoint, FREE tier.

PROMPT-AI-V probe 2026-08-31 (raw evidence in logs/ai1-*.raw, gitignored):
- GET /v1/models → 200, 83-model catalog; entries carry only
  {created, id, object, owned_by} — NO per-model free/tier label, so the
  model docs page is the source of "which endpoints are free".
- Exact ids present: moonshotai/kimi-k3, moonshotai/kimi-k2.6,
  deepseek-ai/deepseek-v4-pro-0813, deepseek-ai/deepseek-v4-flash-0731.
- /v1/chat/completions is OpenAI-compatible (choices/usage/finish_reason);
  stream=true speaks SSE `data: {...}` lines terminated by `data: [DONE]`.

LAWS (project-wide): the key travels ONLY as `Authorization: Bearer` — never
in a URL, never in a log line, never in a response. stdlib urllib only — the
repo adds no dependency without a founder decision. One retry, capped
backoff on 429: free-tier credits are founder resources, never spammed.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

BASE_URL = "https://integrate.api.nvidia.com/v1"
# Probe-picked defaults (2026-08-31); env overrides per .env.example.
DEFAULT_MODEL_FREE = "moonshotai/kimi-k3"
DEFAULT_MODEL_DEEP = "deepseek-ai/deepseek-v4-pro-0813"
TIMEOUT_S = 60.0          # per socket op; streaming reads get one per chunk
CONNECT_TIMEOUT_S = 20.0
USER_AGENT = "vilmei-ai-analyst/1.0 (read-only research terminal)"


class NvidiaError(Exception):
    """Transport failure with an honest kind — the route turns these into
    envelope-style degraded copy, never a red wall."""

    def __init__(self, kind: str, detail: str = "", status: int | None = None):
        super().__init__(detail or kind)
        self.kind = kind  # no_key | rate_limited | timeout | upstream_error
        self.detail = detail
        self.status = status


def api_key() -> str | None:
    k = (os.environ.get("NVIDIA_API_KEY") or "").strip()
    return k or None


def model_free() -> str:
    return (os.environ.get("VILMEI_AI_MODEL_FREE") or "").strip() or DEFAULT_MODEL_FREE


def model_deep() -> str:
    return (os.environ.get("VILMEI_AI_MODEL_DEEP") or "").strip() or DEFAULT_MODEL_DEEP


def _request(url: str, payload: dict, key: str, accept: str) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": accept,
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )


def _classify(err: urllib.error.HTTPError) -> NvidiaError:
    body = ""
    try:
        body = err.read().decode("utf-8", "replace")[:300]
    except (OSError, ValueError, EOFError):
        body = ""
    if err.code == 429:
        retry_after = err.headers.get("Retry-After", "") if err.headers else ""
        return NvidiaError("rate_limited", f"upstream 429 (Retry-After {retry_after or 'n/a'})", 429)
    if err.code in (401, 403):
        return NvidiaError("upstream_error", f"upstream {err.code} — key rejected", err.code)
    return NvidiaError("upstream_error", f"upstream http {err.code}: {body[:160]}", err.code)


def _backoff_seconds(err: urllib.error.HTTPError, attempt: int) -> float:
    if err.code == 429:
        try:
            ra = float(err.headers.get("Retry-After", "") or 0)
        except ValueError:
            ra = 0.0
        return min(max(ra, 2.0 * (attempt + 1)), 8.0)  # exponential, capped
    return 1.5 * (attempt + 1)


def chat(messages: list[dict], *, model: str, max_tokens: int = 1024,
         temperature: float = 0.2, extra: dict | None = None,
         timeout: float = TIMEOUT_S) -> dict:
    """Non-streaming completion (MCP tool + tests). Returns the raw JSON dict."""
    key = api_key()
    if not key:
        raise NvidiaError("no_key", "NVIDIA_API_KEY not set")
    payload: dict = {"model": model, "messages": messages, "stream": False,
                     "max_tokens": max_tokens, "temperature": temperature}
    if extra:
        payload.update(extra)
    req = _request(f"{BASE_URL}/chat/completions", payload, key, "application/json")
    last: NvidiaError | None = None
    for attempt in range(2):  # initial + exactly one retry
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            nerr = _classify(e)
            last = nerr
            if nerr.kind == "rate_limited" and attempt == 0:
                time.sleep(_backoff_seconds(e, attempt))
                continue
            raise nerr from None
        except TimeoutError as e:
            raise NvidiaError("timeout", f"upstream timeout after {timeout:.0f}s") from e
        except urllib.error.URLError as e:
            if isinstance(getattr(e, "reason", None), (TimeoutError,)):
                raise NvidiaError("timeout", "upstream connect timeout") from e
            raise NvidiaError("upstream_error", f"connect failed: {e.reason}") from e
    raise last or NvidiaError("upstream_error", "unknown failure")


def open_stream(messages: list[dict], *, model: str, max_tokens: int = 1024,
                temperature: float = 0.2, extra: dict | None = None,
                timeout: float = TIMEOUT_S):
    """Open an SSE chat stream. Returns the open response object; the caller
    iterates lines (blocking readline) and MUST close it. One retry on 429."""
    key = api_key()
    if not key:
        raise NvidiaError("no_key", "NVIDIA_API_KEY not set")
    payload: dict = {"model": model, "messages": messages, "stream": True,
                     "max_tokens": max_tokens, "temperature": temperature}
    if extra:
        payload.update(extra)
    req = _request(f"{BASE_URL}/chat/completions", payload, key, "text/event-stream")
    for attempt in range(2):
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            nerr = _classify(e)
            if nerr.kind == "rate_limited" and attempt == 0:
                time.sleep(_backoff_seconds(e, attempt))
                continue
            raise nerr from None
        except TimeoutError as e:
            raise NvidiaError("timeout", f"upstream stream-open timeout after {timeout:.0f}s") from e
        except urllib.error.URLError as e:
            if isinstance(getattr(e, "reason", None), (TimeoutError,)):
                raise NvidiaError("timeout", "upstream connect timeout") from e
            raise NvidiaError("upstream_error", f"connect failed: {e.reason}") from e
    raise NvidiaError("upstream_error", "stream open failed")


def parse_sse_line(line: str) -> dict | str | None:
    """`data: {...}` → dict · `data: [DONE]` → 'DONE' · anything else → None."""
    line = line.strip()
    if not line.startswith("data:"):
        return None
    body = line[5:].strip()
    if body == "[DONE]":
        return "DONE"
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return None


def delta_text(chunk: dict) -> str:
    try:
        return (chunk.get("choices") or [{}])[0].get("delta", {}).get("content") or ""
    except (AttributeError, IndexError):
        return ""
