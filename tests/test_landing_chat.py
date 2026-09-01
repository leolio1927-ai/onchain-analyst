"""V6-3 — landing chat route (/api/v1/landing/chat): transport mocked.

Laws under test: no key → honest 503; SSE framing = provenance → delta* →
[DONE]; an upstream failure arrives as an honest error event (never red);
validation clamps; the system prompt carries the grounding + anti-fabrication
rules; history is clamped (max turns, max chars)."""
import json

import pytest
from fastapi.testclient import TestClient

from providers import bai
from webapp import server

SSE = 'data: {"choices":[{"delta":{"content":"%s"}}]}\n'


class FakeStream:
    def __init__(self, lines):
        self._lines = list(lines)
        self.closed = False

    def readline(self):
        return self._lines.pop(0) if self._lines else b""

    def close(self):
        self.closed = True


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(bai, "api_key", lambda: "test-key")
    return TestClient(server.app)


def test_no_key_is_honest_503(monkeypatch, client):
    monkeypatch.setattr(bai, "api_key", lambda: None)
    r = client.post("/api/v1/landing/chat", json={"message": "hi"})
    assert r.status_code == 503
    assert "offline" in r.json()["detail"].lower()


def test_validation_400(monkeypatch, client):
    assert client.post("/api/v1/landing/chat", json={"message": ""}).status_code == 400
    assert client.post("/api/v1/landing/chat",
                       json={"message": "x" * 501}).status_code == 400


def test_framing_and_grounding_prompt(monkeypatch, client):
    seen = {}

    def fake_open2(messages, **kw):
        seen["messages"] = messages
        seen["max_tokens"] = kw.get("max_tokens")
        return FakeStream([b'data: {"choices":[{"delta":{"content":"fast"}}]}\n',
                           b"data: [DONE]\n"])

    monkeypatch.setattr(bai, "open_stream", fake_open2)
    r = client.post("/api/v1/landing/chat",
                    json={"message": "What is VILMEI?", "history": [
                        {"role": "user", "content": "earlier question"},
                        {"role": "assistant", "content": "earlier answer"}]})
    assert r.status_code == 200
    ev = [json.loads(l[5:]) for l in r.text.splitlines()
          if l.startswith("data:") and l[5:].strip() != "[DONE]"]
    assert ev[0]["type"] == "provenance"
    assert ev[0]["prompt_version"] == "lc-v2.0"
    deltas = [e for e in ev if e["type"] == "delta"]
    assert "".join(d["text"] for d in deltas) == "fast"
    assert r.text.rstrip().endswith("data: [DONE]")
    sys = seen["messages"][0]["content"]
    assert seen["messages"][0]["role"] == "system"
    # brief v2.0.0 rides the system prompt verbatim; the identity is VILMEI AI
    assert "VILMEI AI" in sys and "OPERATING BRIEF v2.0.0" in sys
    assert "never invent prices" in sys and "read-only" in sys.lower()
    assert seen["messages"][-1]["content"] == "What is VILMEI?"
    assert seen["messages"][1]["content"] == "earlier question"
    assert seen["max_tokens"] == server._LANDING_CHAT_MAX_TOKENS


def test_history_is_clamped(monkeypatch, client):
    seen = {}

    def fake_open(messages, **kw):
        seen["messages"] = messages
        return FakeStream([b"data: [DONE]\n"])

    monkeypatch.setattr(bai, "open_stream", fake_open)
    long = "y" * 600
    history = [{"role": "user", "content": long}] * 20
    client.post("/api/v1/landing/chat", json={"message": "hi", "history": history})
    msgs = seen["messages"]
    # system + clamped turns + the live user message
    assert len(msgs) <= server._LANDING_CHAT_MAX_TURNS + 2
    assert all(len(m["content"]) <= server._LANDING_CHAT_MAX_CHARS for m in msgs[1:])


def test_upstream_failure_is_honest_error_event(monkeypatch, client):
    def dead_open(messages, **kw):
        raise bai.BaiError("timeout", "upstream timeout after 30s")

    monkeypatch.setattr(bai, "open_stream", dead_open)
    r = client.post("/api/v1/landing/chat", json={"message": "hi"})
    assert r.status_code == 200
    ev = [json.loads(l[5:]) for l in r.text.splitlines()
          if l.startswith("data:") and l[5:].strip() != "[DONE]"]
    err = next(e for e in ev if e["type"] == "error")
    assert err["kind"] == "timeout" and "could not answer" in err["detail"]
    assert r.text.rstrip().endswith("data: [DONE]")
