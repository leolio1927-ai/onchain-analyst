"""P1-B — persistent AI run history + evidence provenance laws.

1. every run is recorded: provider/model/prompt_version/status/latency
2. evidence hash is the deterministic digest — same evidence = same hash,
   changed evidence = different hash
3. failed runs carry status=error and never read as successes
4. cache hits carry cached=True
5. raw wallet addresses are redacted; no raw question text stored
6. GET /api/v1/ai/runs returns the records, bounded
"""
import json

import pytest
from fastapi.testclient import TestClient

from providers import bai
from webapp import ai_runs, server

MINT = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"
WALLET = "EXJHIM7yNbDxRKLVh7dq8Rcdb8ofAu3y8dv6fJzxCk9Z"


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(ai_runs, "RUNS_PATH", tmp_path / "ai-runs.jsonl")
    monkeypatch.setattr(bai, "api_key", lambda: "test-key")
    return TestClient(server.app)


def _install(monkeypatch, words):
    def fake_open(messages, *, model_id=None, max_tokens=1024, temperature=0.2,
                  extra=None, timeout=60.0):
        lines = [f'data: {{"choices":[{{"delta":{{"content":"{w}"}}}}]}}\n'.encode() for w in words]
        lines.append(b'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n')
        lines.append(b"data: [DONE]\n")

        class R:
            def readline(self):
                return lines.pop(0) if lines else b""

            def close(self):
                pass

        return R()
    monkeypatch.setattr(bai, "open_stream", fake_open)


def _events(text):
    return [json.loads(l[5:]) for l in text.splitlines() if l.startswith("data:") and l[5:].strip() != "[DONE]"]


def test_guide_run_recorded_ok(client, monkeypatch):
    _install(monkeypatch, ["VILMEI ", "is read-only."])
    r = client.post("/api/v1/ai/ask", json={"question": f"What is VILMEI? wallet {WALLET}"})
    assert r.status_code == 200
    runs = ai_runs.read_runs()
    assert len(runs) == 1
    rec = runs[0]
    assert rec["surface"] == "terminal" and rec["provider"] == "bai"
    assert rec["model"] == bai.ANALYST_MODEL_FAST_DEFAULT
    assert rec["status"] == "ok" and rec["cached"] is False
    assert rec["latency_ms"] is not None
    assert WALLET not in json.dumps(rec)          # redaction law
    assert "…" in rec["question_redacted"] and "EXJHIM" in rec["question_redacted"]
    assert rec.get("question_sha") and len(rec["question_sha"]) == 16


def test_evidence_hash_is_deterministic_and_changes_with_input():
    from webapp import ai_ask
    ev = {"a": 1}
    h1 = ai_ask.evidence_digest(ev)
    h2 = ai_ask.evidence_digest(ev)
    h3 = ai_ask.evidence_digest({"a": 2})
    assert h1 == h2 and h1 != h3


def test_error_run_is_error_not_success(client, monkeypatch):
    def dead_open(messages, *, model_id=None, **kw):
        raise bai.BaiError("forbidden", "upstream 403", status=403)
    monkeypatch.setattr(bai, "open_stream", dead_open)
    r = client.post("/api/v1/ai/ask", json={"question": "What is VILMEI?"})
    assert r.status_code == 200
    runs = ai_runs.read_runs()
    assert runs[0]["status"] == "error" and runs[0]["error_kind"] == "forbidden"
    assert runs[0]["model"]  # provenance model still recorded


def test_cache_hit_marks_cached(client, monkeypatch):
    opens = {"n": 0}

    def counting_open(messages, *, model_id=None, **kw):
        opens["n"] += 1
        lines = [b'data: {"choices":[{"delta":{"content":"cached answer"}}]}\n',
                 b"data: [DONE]\n"]

        class R:
            def readline(self):
                return lines.pop(0) if lines else b""

            def close(self):
                pass

        return R()

    monkeypatch.setattr(bai, "open_stream", counting_open)
    client.post("/api/v1/ai/ask", json={"question": "What is VILMEI?"})
    client.post("/api/v1/ai/ask", json={"question": "What is VILMEI?"})
    runs = ai_runs.read_runs()
    assert opens["n"] == 1                        # second ask served from cache
    assert runs[-1]["cached"] is True and runs[0]["cached"] is False


def test_read_endpoint_returns_bounded(client, monkeypatch):
    _install(monkeypatch, ["ok"])
    for i in range(3):
        client.post("/api/v1/ai/ask", json={"question": f"q {i}"})
    r = client.get("/api/v1/ai/runs", params={"limit": 2})
    j = r.json()
    assert r.status_code == 200 and len(j["runs"]) == 2
    assert j["runs"][-1]["question_redacted"].startswith("q 2")


def test_landing_chat_runs_recorded_too(client, monkeypatch):
    class FakeStream:
        def __init__(self, lines):
            self._lines = lines

        def readline(self):
            return self._lines.pop(0) if self._lines else b""

        def close(self):
            pass

    monkeypatch.setattr(bai, "open_stream", lambda m, **kw: FakeStream([
        b'data: {"choices":[{"delta":{"content":"fast"}}]}\n', b"data: [DONE]\n"]))
    r = client.post("/api/v1/landing/chat", json={"message": "Vilmei itu apa?"})
    assert r.status_code == 200
    runs = ai_runs.read_runs()
    assert runs[-1]["surface"] == "landing" and runs[-1]["status"] == "ok"
    assert runs[-1]["model"] == bai.DEFAULT_MODEL   # glm-5.3-flash unchanged
