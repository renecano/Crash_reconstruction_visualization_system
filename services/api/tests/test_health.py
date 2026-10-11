import pytest
from fastapi.testclient import TestClient

from croquis_api.main import LEGEND_TEXT, app
from croquis_api.settings import Settings


def test_health_reporta_version_y_leyenda(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["legend"] == LEGEND_TEXT
    assert body["llm_enabled"] is False


def test_llm_se_activa_solo_con_llave_y_presupuesto(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-prueba")
    monkeypatch.setenv("CROQUIS_LLM_DAILY_BUDGET_USD", "0")
    assert Settings().llm_enabled is False
    monkeypatch.setenv("CROQUIS_LLM_DAILY_BUDGET_USD", "1.5")
    assert Settings().llm_enabled is True
