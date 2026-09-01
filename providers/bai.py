"""Provider B.AI — OpenAI-compatible chat endpoint (VILMEI Analyst chat).

V6-3: the landing §06 chat rides THIS provider — the founder asked for a
fast, chat-like connect (the NVIDIA free tier stalls for minutes at a time).
Key arrives from BAI_API_KEY (founder .env, never echoed, never logged).

LAWS (project-wide): the key travels ONLY as `Authorization: Bearer` — never
in a URL, never in a log line, never in a response. stdlib urllib only.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

BASE_URL = "https://api.b.ai/v1"
DEFAULT_MODEL = "glm-5.3-flash"
# P1-A (founder directive): the TERMINAL AI Analyst rides this provider too.
# Model IDs verified by an actual chat-stream probe on 2026-09-01:
#   "deepseek-v4-flash" -> 200 + SSE deltas + usage event  (VERIFIED)
#   "qwen-3.8-flash"    -> 404 model_not_found             (NOT verified)
# /v1/models is 403 on this plan, so env overrides are the sanctioned way to
# switch IDs once the founder confirms alternates. No invented IDs.
ANALYST_MODEL_FAST_DEFAULT = "deepseek-v4-flash"
ANALYST_MODEL_DEEP_DEFAULT = "deepseek-v4-flash"


def analyst_model_fast() -> str:
    return (os.environ.get("VILMEI_ANALYST_MODEL_FAST") or "").strip() or ANALYST_MODEL_FAST_DEFAULT


def analyst_model_deep() -> str:
    return (os.environ.get("VILMEI_ANALYST_MODEL_DEEP") or "").strip() or ANALYST_MODEL_DEEP_DEFAULT
TIMEOUT_S = 30.0
CONNECT_TIMEOUT_S = 15.0
USER_AGENT = "vilmei-analyst-chat/1.0 (read-only research terminal)"


class BaiError(Exception):
    """Transport failure with an honest kind — the route turns these into
    envelope-style degraded copy, never a red wall."""

    def __init__(self, kind: str, detail: str = "", status: int | None = None):
        super().__init__(detail)
        self.kind = kind  # no_key | rate_limited | timeout | upstream_error
        self.detail = detail
        self.status = status


def api_key() -> str | None:
    k = (os.environ.get("BAI_API_KEY") or "").strip()
    if k:
        return k
    # hot-read fallback: a long-running server process can predate a key the
    # founder later added to .env (V6-3 fix — the 503 was exactly this). Read
    # the file silently, never echo the value anywhere.
    for path in (".env", "../.env"):
        try:
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line.startswith("BAI_API_KEY") and "=" in line:
                        val = line.split("=", 1)[1].strip().strip("'\"")
                        if val:
                            return val
        except OSError:
            continue
    return None


def model() -> str:
    return (os.environ.get("VILMEI_CHAT_MODEL") or "").strip() or DEFAULT_MODEL


def open_stream(messages: list[dict], *, model_id: str | None = None,
                max_tokens: int = 1000, temperature: float = 0.7,
                timeout: float = TIMEOUT_S, extra: dict | None = None):
    """Open an SSE chat stream. Returns the open response; the caller
    iterates raw lines and MUST close it. No retry loop: the landing chat
    values a fast first byte over insisting on a busy endpoint. `extra`
    carries optional provider params (e.g. reasoning_effort for deep mode)."""
    key = api_key()
    if not key:
        raise BaiError("no_key", "BAI_API_KEY not set")
    payload = {"model": model_id or model(), "messages": messages,
               "stream": True, "temperature": temperature, "max_tokens": max_tokens}
    if extra:
        payload.update(extra)
    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Accept": "text/event-stream", "User-Agent": USER_AGENT},
        method="POST")
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        kind = {401: "unauthorized", 403: "forbidden", 404: "not_found",
                429: "rate_limited"}.get(e.code, "upstream_error")
        raise BaiError(kind, f"upstream {e.code}", status=e.code) from None
    except TimeoutError as e:
        raise BaiError("timeout", f"upstream timeout after {timeout:.0f}s") from e
    except urllib.error.URLError as e:
        if isinstance(getattr(e, "reason", None), TimeoutError):
            raise BaiError("timeout", "upstream connect timeout") from e
        raise BaiError("upstream_error", f"connect failed: {e.reason}") from e
