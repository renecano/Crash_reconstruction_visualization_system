from typing import Any

import pytest
from fastapi.testclient import TestClient

from croquis_api import relato
from croquis_api.main import app
from croquis_scene_schema import load_fixture, schema_errors

STORY = (
    "Iba en mi Aveo como a 50 por Tollocan y una camioneta blanca se me cerró; le pegué por "
    "detrás. No alcancé a frenar."
)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    return TestClient(app)


def test_extraer_con_reglas_sin_llave(client: TestClient) -> None:
    r = client.post("/relato/extraer", json={"texto": STORY})
    assert r.status_code == 200
    body = r.json()
    assert body["metodo"] == "reglas"
    assert body["motivo"] is None
    assert schema_errors(body["spec"]) == []
    assert body["verificador"]["degradados"] == 0
    assert any(t["id"] == "se_me_cerro" for t in body["glosario"])
    assert len(body["preguntas"]) <= 3


def test_pedir_claude_sin_llave_explica_y_usa_reglas(client: TestClient) -> None:
    body = client.post("/relato/extraer", json={"texto": STORY, "metodo": "claude"}).json()
    assert body["metodo"] == "reglas"
    assert "no está configurado" in body["motivo"]


def test_el_servidor_vuelve_a_redactar(client: TestClient) -> None:
    body = client.post(
        "/relato/extraer", json={"texto": "Me llamo Ana López, placas ABC-123-D. " + STORY}
    ).json()
    assert body["redacciones_servidor"] == 2
    assert "Ana" not in body["texto"]
    assert "Ana" not in str(body["spec"])


def test_texto_vacio_o_enorme_se_rechaza(client: TestClient) -> None:
    assert client.post("/relato/extraer", json={"texto": ""}).status_code == 422
    big = "a" * (relato.MAX_TEXT + 1)
    assert client.post("/relato/extraer", json={"texto": big}).status_code == 422


def test_responder_aplica_y_no_repite(client: TestClient) -> None:
    spec = load_fixture("lateral_interseccion")
    r = client.post(
        "/relato/responder",
        json={"spec": spec, "respuestas": {"velocidad:veh-b": "45"}, "contestadas": []},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["aplicadas"] == ["velocidad:veh-b"]
    assert body["spec"]["vehiculos"][1]["velocidad_previa"]["fuente"] == "usuario"
    assert all(p["id"] != "velocidad:veh-b" for p in body["preguntas"])


def test_spec_invalida_es_422(client: TestClient) -> None:
    r = client.post("/relato/responder", json={"spec": {"meta": {}}, "respuestas": {}})
    assert r.status_code == 422
    assert client.post("/reconstruir", json={"spec": {"x": 1}}).status_code == 422


def test_reconstruir_devuelve_el_resultado_del_solver(client: TestClient) -> None:
    r = client.post("/reconstruir", json={"spec": load_fixture("alcance")})
    assert r.status_code == 200
    body = r.json()
    assert body["escena_id"] == load_fixture("alcance")["meta"]["id"]
    assert len(body["vehiculos"]) == 2


def test_reconstruir_con_analisis_trae_inversion_y_consistencia(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from croquis_scene_schema import result_errors

    monkeypatch.setattr(relato, "analysis_limiter", relato.RateLimiter())
    monkeypatch.setenv("CROQUIS_ANALYSIS_RATE_LIMIT_PER_HOUR", "1")
    spec = load_fixture("peaton_cruce")
    r = client.post("/reconstruir", json={"spec": spec, "analisis": True})
    assert r.status_code == 200
    body = r.json()
    assert result_errors(body) == []
    assert body["inversion"]["evidencia"]
    assert any(f["codigo"] == "velocidad_vs_evidencia" for f in body["consistencia"])
    assert "incertidumbre" in body
    # El análisis cuesta CPU: tiene límite por hora (la reconstrucción simple no).
    again = client.post("/reconstruir", json={"spec": spec, "analisis": True})
    assert again.status_code == 429
    assert client.post("/reconstruir", json={"spec": spec}).status_code == 200


def test_ruta_de_claude_con_doble(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-prueba")
    monkeypatch.setenv("CROQUIS_LLM_DAILY_BUDGET_USD", "1")
    calls: list[dict[str, Any]] = []

    def fake_extract(text: str, key: str, model: str, **kw: Any) -> dict[str, Any]:
        calls.append({"text": text, "model": model, **kw})
        return {
            "salida": {
                "vehiculos": [{"narrador": True}, {"narrador": False}],
                "personas": [{"rol": "conductor", "cita": "Iba en mi Aveo", "vehiculo": 0}],
                "hechos": [
                    {
                        "campo": "evento.tipo",
                        "vehiculo": -1,
                        "persona": -1,
                        "valor": "impacto_vehiculo_vehiculo",
                        "cita": "le pegué",
                    }
                ],
                "dispositivos": [],
                "preguntas": [],
            }
        }

    monkeypatch.setattr(relato, "extract", fake_extract)
    body = TestClient(app).post("/relato/extraer", json={"texto": STORY}).json()
    assert body["metodo"] == "claude"
    assert calls[0]["mode"] == "live"
    assert calls[0]["budget"] == 1.0
    assert schema_errors(body["spec"]) == []


def test_limite_por_hora() -> None:
    lim = relato.RateLimiter()
    assert lim.allow("a", 2, now=0)
    assert lim.allow("a", 2, now=1)
    assert not lim.allow("a", 2, now=2)
    assert lim.allow("b", 2, now=2)
    assert lim.allow("a", 2, now=3602)
