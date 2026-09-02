"""T2-E execution ledger: always refuses, idempotent per quote_id, torn
lines never poison the map, storage failure still refuses."""
import json

from webapp import swap_exec


def test_always_refuses_and_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setattr(swap_exec, "EXEC_PATH", tmp_path / "exec.jsonl")
    swap_exec.reset_for_tests()
    r1 = swap_exec.request_execution(quote_id="q1", payload={"a": 1})
    r2 = swap_exec.request_execution(quote_id="q1", payload={"a": 1})
    assert r1["decision"] == "refused" and r2["decision"] == "refused"
    assert r1 == r2, "a retried quote must return the SAME record"
    lines = (tmp_path / "exec.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1, "one quote_id → exactly one record, never two submissions"


def test_missing_or_blank_quote_id_refused_without_record(tmp_path, monkeypatch):
    monkeypatch.setattr(swap_exec, "EXEC_PATH", tmp_path / "exec.jsonl")
    swap_exec.reset_for_tests()
    for bad in ("", "   "):
        out = swap_exec.request_execution(quote_id=bad)
        assert out["decision"] == "refused"
    assert not (tmp_path / "exec.jsonl").exists()


def test_torn_tail_line_does_not_poison_the_map(tmp_path, monkeypatch):
    path = tmp_path / "exec.jsonl"
    good = {"quote_id": "q-good", "ts": "t", "decision": "refused",
            "reason": "r", "payload_digest": "d"}
    path.write_text(json.dumps(good) + "\n" + '{"torn": ', encoding="utf-8")
    monkeypatch.setattr(swap_exec, "EXEC_PATH", path)
    swap_exec.reset_for_tests()
    out = swap_exec.request_execution(quote_id="q-good")
    assert out["decision"] == "refused" and out["ts"] == "t"


def test_storage_failure_still_refuses(tmp_path, monkeypatch):
    monkeypatch.setattr(swap_exec, "EXEC_PATH", tmp_path)  # a directory — open() fails
    swap_exec.reset_for_tests()
    out = swap_exec.request_execution(quote_id="q1")
    assert out["decision"] == "refused"
    assert "store unavailable" in out["reason"]
