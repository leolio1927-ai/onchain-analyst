"""Suite-wide guarantees (BE-F5a-R).

The offline rule, enforced once instead of remembered everywhere: jupiter is
KEYLESS, so any unstubbed scan would silently hit the live quote API. This
autouse fixture cans it offline for every test; tests that exercise the
enrichment paths in earnest use provider_stub.install_enrichment, which
re-patches with full control over modes.
"""
import pytest

from providers import jupiter


@pytest.fixture(autouse=True)
def _offline_jupiter(monkeypatch):
    jupiter._cache.clear()
    monkeypatch.setattr(jupiter, "_get", lambda path: {"outAmount": "282271"})
    yield
    jupiter._cache.clear()
