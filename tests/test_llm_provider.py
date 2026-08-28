"""LLM factory: provider resolution (env > arg > MiniMax default), key placed
in SDK auth (never a URL), model defaults, unknown provider error."""
import pytest

from providers import llm


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for v in ("LLM_PROVIDER", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"):
        monkeypatch.delenv(v, raising=False)
    yield


def test_default_provider_is_minimax():
    cfg = llm.resolve_llm_config()
    assert cfg["name"] == "minimax"
    assert cfg["kind"] == "openai"
    assert cfg["base_url"] == llm.MinimaxDefaultBase


def test_provider_resolved_from_env(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "KIMI")  # case-insensitive
    cfg = llm.resolve_llm_config()
    assert cfg["name"] == "kimi"
    assert cfg["base_url"] == "https://api.moonshot.ai/v1"


def test_key_travels_in_auth_not_url(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-llm-secret-123")
    client = llm.make_llm_client("minimax")
    assert client.api_key == "sk-llm-secret-123"
    # the key must never ride along in the base URL (error logs embed URLs)
    assert "sk-llm-secret-123" not in str(client.base_url)
    assert str(client.base_url).startswith("https://api.minimax.chat")


def test_base_url_env_overrides_default(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "https://proxy.internal/v1")
    client = llm.make_llm_client("minimax", api_key="k")
    # the OpenAI SDK normalizes base URLs with a trailing slash
    assert str(client.base_url).rstrip("/") == "https://proxy.internal/v1"


def test_model_default_and_env_override(monkeypatch):
    assert llm.resolve_llm_model("minimax") == llm.LLM_CONFIGS["minimax"]["default_model"]
    monkeypatch.setenv("LLM_MODEL", "custom-model-x")
    assert llm.resolve_llm_model("minimax") == "custom-model-x"


def test_unknown_provider_raises_clear_error():
    with pytest.raises(llm.LLMConfigError, match="unknown LLM provider"):
        llm.resolve_llm_config("grok")
