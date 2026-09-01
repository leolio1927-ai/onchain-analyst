"""PROMPT-AI-V — VILMEI AI ask engine: personas, guards, budget, cache, SSE.

Laws implemented here (founder spec AI-2/AI-3):
- Server-side payload assembly — the client sends a question (+optional token
  context) and NOTHING else; system prompts never cross the wire.
- Personas are versioned constants (PROMPT_VERSION rides every provenance
  event) so a prompt change is auditable in git, never hidden in a UI string.
- Budget: per-IP sliding RPM window + one global daily pool (file-persisted
  across restarts) + a smaller separate landing pool. Over budget = honest
  429 copy, never a red wall.
- Cache: identical (question|mode|model|persona|evidence digest) answers are
  served for CACHE_TTL_S with provenance cached:true — the founder's free-tier
  credits are never burned twice on the same question.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from collections import OrderedDict, defaultdict, deque
from datetime import UTC, datetime
from pathlib import Path

PROMPT_VERSION = "ai-v2.0"   # v2.0.0 — brief v2 wiring (PROMPT-B PART C)

QUESTION_MAX_CHARS = 2000
HISTORY_MAX_TURNS = 6
HISTORY_TURN_MAX_CHARS = 400
EVIDENCE_MAX_CHARS = 6000
CACHE_TTL_S = 240.0
CACHE_MAX = 128
DEFAULT_RPM_PER_IP = 8
DEFAULT_DAILY_MAX = 240

BUDGET_BUSY_COPY = ("AI budget busy — this IP is asking faster than the free tier can "
                    "answer. Try again in a minute.")
DAILY_SPENT_COPY = ("AI daily budget spent — the free-tier pool resets at midnight UTC. "
                    "The rest of the terminal stays live.")

# ── personas ──────────────────────────────────────────────────────────────

ANALYST_SYSTEM = """You are VILMEI AI — the analyst inside VILMEI, a read-only multichain memecoin research terminal. Prompt version {version}.

PRIME LAW — EVIDENCE ONLY: the JSON in the EVIDENCE block below is your ONE AND ONLY source of numbers.
1. You may not output a single number, price, percentage, level, date or address that does not appear in EVIDENCE. Support levels, resistance levels and price targets are FORBIDDEN — no feed in this terminal produces them, so they cannot exist in your answer.
2. Every claim you make must cite its evidence field in plain words (e.g. "the FDV/liquidity ratio of 63x in the evidence").
3. If EVIDENCE is empty or silent about what was asked, answer with exactly this sentence first: "not in the evidence the terminal has for this token" — then point the user to the surface that can help (scanner, rug check, whale tracker, roadmap).
4. Your output is context, never an audit, and never financial advice — say so once, in one sentence.
5. Tone: terminal-grade — precise, cold, confident. No hype vocabulary (never "moon", "pump", "gem", "100x").
6. Answer in the language of the question.
7. Length: FREE mode stays under ~220 words. DEEP mode is structured with exactly these headings: ASSESSMENT / EVIDENCE-BACKED SIGNALS / GAPS / WHAT TO WATCH — still zero invented numbers.

EVIDENCE block (verbatim terminal data):
{evidence}"""

GUIDE_SYSTEM = """You are VILMEI AI — the community guide of VILMEI, a read-only multichain memecoin research terminal. Prompt version {version}.

PRIME LAW — BRIEF ONLY: the text in the BRIEF block below is your ONE AND ONLY source of facts. Never mention a token, launch, price, date, partnership or feature that is not written in it. If asked about something absent from the brief, say the brief does not cover it — never invent.

STYLE LAWS:
1. Mark every feature claim with its real register: LIVE, PLANNED or BD (business agreement needed). Never blur the three.
2. Describe the future honestly ("planned", "on the roadmap") but without dates — only the Locked roadmap band may carry dates, and the brief lists none.
3. Weave the product keywords naturally when they fit: multichain, evidence-first, read-only terminal, provider coverage matrix, MCP / AI-agent surfaces.
4. Tone: calm, proud, precise — a builder explaining infrastructure, not a pitch deck. No hype vocabulary.
5. Answer in the language of the question. Keep answers under ~220 words unless the question genuinely needs structure.

BRIEF block (verbatim project facts):
{brief}"""

NO_EVIDENCE_SENTENCE = "not in the evidence the terminal has for this token"


def analyst_system(evidence_json: str) -> str:
    return ANALYST_SYSTEM.format(version=PROMPT_VERSION, evidence=evidence_json)


def guide_system(brief_text: str) -> str:
    return GUIDE_SYSTEM.format(version=PROMPT_VERSION, brief=brief_text)


_BRIEF_PATH = Path(os.environ.get("VILMEI_AI_BRIEF", "docs/AI-BRIEF-v2.md"))
_BRIEF_FALLBACK = Path("docs/AI-BRIEF.md")   # v1 remains as a degraded fallback
_brief_cache: str | None = None


def load_brief() -> str:
    """docs/AI-BRIEF-v2.md (v2.0.0 living contract), cached after first read;
    a missing v2 degrades to v1, then to a one-line honesty sentence rather
    than crashing the route."""
    global _brief_cache
    if _brief_cache is None:
        try:
            _brief_cache = _BRIEF_PATH.read_text(encoding="utf-8")
        except OSError:
            try:
                _brief_cache = _BRIEF_FALLBACK.read_text(encoding="utf-8")
            except OSError:
                _brief_cache = ("(AI-BRIEF unavailable — answer only that VILMEI facts are "
                                "momentarily unavailable; invent nothing.)")
    return _brief_cache


# ── guards ────────────────────────────────────────────────────────────────

def clamp_question(q: str) -> str:
    q = q.strip()
    return q[:QUESTION_MAX_CHARS]


def clamp_history(history: list[dict]) -> list[dict]:
    """Last N turns, each role-gated and char-clamped — junk in must not be
    able to smuggle a system prompt or a mega-prompt into the payload."""
    out = []
    for turn in (history or [])[-HISTORY_MAX_TURNS:]:
        role = turn.get("role")
        content = str(turn.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        out.append({"role": role, "content": content[:HISTORY_TURN_MAX_CHARS]})
    return out


def truncate_evidence(evidence: dict, max_chars: int = EVIDENCE_MAX_CHARS) -> str:
    """Evidence JSON → verbatim string, hard-clamped with a visible note so
    the model knows it is looking at a truncated record. V5-G2: FREE rides
    the default 6 000-char cap (~1.5k tokens); DEEP may carry twice that."""
    raw = json.dumps(evidence, ensure_ascii=False, separators=(",", ":"))
    if len(raw) <= max_chars:
        return raw
    return raw[:max_chars] + ',"_note":"EVIDENCE TRUNCATED BY THE TERMINAL — fields beyond this point were cut for size; never invent what they might have said"}'


def evidence_digest(evidence: dict | None) -> str:
    if not evidence:
        return "none"
    raw = json.dumps(evidence, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


# ── budget: per-IP RPM + global daily pool (+ separate landing pool) ─────

_LOCK = threading.Lock()
_ip_window: dict[str, deque] = defaultdict(deque)
_daily: dict = {}


def _env_int(name: str, default: int, lo: int, hi: int) -> int:
    try:
        v = int((os.environ.get(name) or "").strip() or default)
    except ValueError:
        v = default
    return max(lo, min(hi, v))


def rpm_per_ip() -> int:
    return _env_int("VILMEI_AI_RPM_PER_IP", DEFAULT_RPM_PER_IP, 1, 60)


def daily_max() -> int:
    return _env_int("VILMEI_AI_DAILY_MAX_QUESTIONS", DEFAULT_DAILY_MAX, 10, 10000)


def landing_daily_max() -> int:
    return max(16, daily_max() // 4)


def _budget_path() -> Path:
    return Path(os.environ.get("VILMEI_AI_BUDGET_FILE", "data/ai-budget.json"))


def _today() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


def _load_daily() -> dict:
    global _daily
    if _daily:
        return _daily
    try:
        _daily = json.loads(_budget_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        _daily = {}
    if _daily.get("date") != _today():
        _daily = {"date": _today(), "main": 0, "landing": 0}
    return _daily


def _save_daily() -> None:
    try:
        p = _budget_path()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(_daily), encoding="utf-8")
    except OSError:
        pass  # best-effort: a disk hiccup must not brick the AI surface


def charge(ip: str, surface: str) -> tuple[bool, str | None]:
    """Record one question against the IP window + the right daily pool.
    Returns (ok, reason) with reason in {None, 'rpm', 'daily'}."""
    now = time.time()
    pool = "landing" if surface == "landing" else "main"
    with _LOCK:
        day = _load_daily()
        cap = landing_daily_max() if pool == "landing" else daily_max()
        if day.get(pool, 0) >= cap:
            return False, "daily"
        q = _ip_window[ip]
        while q and now - q[0] > 60.0:
            q.popleft()
        if len(q) >= rpm_per_ip():
            return False, "rpm"
        q.append(now)
        day[pool] = day.get(pool, 0) + 1
        _save_daily()
        return True, None


def budget_state() -> dict:
    with _LOCK:
        day = _load_daily()
        return {"date": day.get("date"), "main_used": day.get("main", 0),
                "main_max": daily_max(), "landing_used": day.get("landing", 0),
                "landing_max": landing_daily_max(), "rpm_per_ip": rpm_per_ip()}


def _reset_budget_state_for_tests() -> None:
    global _daily
    with _LOCK:
        _ip_window.clear()
        _daily = {}


# ── V5-G2 short-circuit: 2 consecutive open failures → 60 s cooldown ──────
# Founder law: "respon cepet, jangan loading." When the free plane stalls
# (G0: flash AND kimi both 0-byte), every further ask would burn a 10 s +
# 10 s open budget just to fail. The circuit skips upstream entirely and
# answers instantly with the honest busy sentence; first success resets it.

CIRCUIT_FAILS_BEFORE_COOLDOWN = 2
CIRCUIT_COOLDOWN_S = 60.0
BUSY_COPY = ("VILMEI AI is paused for a moment — the free tier is stalling "
             "right now, so the terminal skips the wait instead of loading. "
             "Try again in a minute; everything else stays live.")

_circuit: dict = {"fails": 0, "cooldown_until": 0.0}


def circuit_blocked_s() -> float:
    """Seconds left on the cooldown; 0.0 means the door may try upstream."""
    return max(0.0, _circuit["cooldown_until"] - time.time())


def circuit_note(ok: bool) -> None:
    if ok:
        _circuit["fails"] = 0
        _circuit["cooldown_until"] = 0.0
        return
    _circuit["fails"] += 1
    if _circuit["fails"] >= CIRCUIT_FAILS_BEFORE_COOLDOWN:
        _circuit["cooldown_until"] = time.time() + CIRCUIT_COOLDOWN_S


def _reset_circuit_for_tests() -> None:
    _circuit.update(fails=0, cooldown_until=0.0)


# ── answer cache ──────────────────────────────────────────────────────────

_cache: OrderedDict[str, tuple[float, str]] = OrderedDict()


def cache_key(question: str, mode: str, model: str, persona: str, digest: str) -> str:
    raw = f"{question}|{mode}|{model}|{persona}|{digest}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def cache_get(key: str) -> str | None:
    with _LOCK:
        hit = _cache.get(key)
        if not hit:
            return None
        ts, text = hit
        if time.time() - ts > CACHE_TTL_S:
            _cache.pop(key, None)
            return None
        _cache.move_to_end(key)
        return text


def cache_put(key: str, text: str) -> None:
    with _LOCK:
        _cache[key] = (time.time(), text)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX:
            _cache.popitem(last=False)


def _reset_cache_for_tests() -> None:
    with _LOCK:
        _cache.clear()


# ── SSE framing (the wire contract with the frontend) ────────────────────

def sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def provenance_event(*, model: str, mode: str, persona: str, cached: bool,
                     degraded: bool = False, evidence_sources: list[str] | None = None) -> str:
    return sse({"type": "provenance", "model": model, "mode": mode,
                "persona": persona, "cached": cached, "degraded": degraded,
                "prompt_version": PROMPT_VERSION,
                "evidence_sources": evidence_sources or []})


def build_messages(*, persona: str, question: str, history: list[dict],
                   evidence_json: str | None) -> list[dict]:
    if persona == "analyst":
        system = analyst_system(evidence_json or "{}")
    else:
        system = guide_system(load_brief())
    msgs = [{"role": "system", "content": system}]
    msgs.extend(clamp_history(history))
    msgs.append({"role": "user", "content": clamp_question(question)})
    return msgs
