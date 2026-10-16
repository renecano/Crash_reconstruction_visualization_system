"""Extractos de OSM: reintentos si Overpass está saturado y verificación del manifiesto."""

import json
from pathlib import Path

import httpx
import pytest

from croquis_data import osm


def _no_sleep(_s: float) -> None:
    return None


def _client(responses: list[httpx.Response]) -> tuple[httpx.Client, list[httpx.Request]]:
    seen: list[httpx.Request] = []
    it = iter(responses)

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return next(it)

    return httpx.Client(transport=httpx.MockTransport(handler)), seen


def test_reintenta_con_espera_creciente_si_esta_saturado() -> None:
    ok = json.dumps({"osm3s": {"timestamp_osm_base": "2026-10-16T00:00:00Z"}, "elements": []})
    client, seen = _client(
        [
            httpx.Response(504, text="# 502 Gateway Timeout at capacity"),
            httpx.Response(429, text="Too Many Requests"),
            httpx.Response(200, text=ok),
        ]
    )
    waits: list[float] = []
    raw = osm.fetch(osm.query(19.27, -99.65, 150), client, sleep=waits.append)
    assert json.loads(raw)["elements"] == []
    assert waits == list(osm.BACKOFF_S[:2])
    assert len(seen) == 3
    assert b"around%3A150" in seen[0].content or b"around:150" in seen[0].content


def test_falla_sin_reintentar_ante_un_error_de_la_consulta() -> None:
    client, seen = _client([httpx.Response(400, text="parse error")])
    with pytest.raises(RuntimeError, match="400"):
        osm.fetch("mala", client, sleep=_no_sleep)
    assert len(seen) == 1


def test_se_rinde_despues_de_los_reintentos() -> None:
    client, _ = _client([httpx.Response(503, text="busy")] * (len(osm.BACKOFF_S) + 1))
    with pytest.raises(RuntimeError, match="503"):
        osm.fetch("q", client, sleep=_no_sleep)


def test_el_extracto_versionado_coincide_con_su_manifiesto() -> None:
    assert osm.check() == []
    man = json.loads(osm.MANIFEST.read_text(encoding="utf-8"))
    info = man["toluca_carranza_juarez"]
    assert info["nodo_cruce"] == 305269145
    data = json.loads(osm.path_for("toluca_carranza_juarez").read_text(encoding="utf-8"))
    assert info["datos_osm"] == data["osm3s"]["timestamp_osm_base"]


def test_check_detecta_un_extracto_alterado(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(osm, "OSM_DIR", tmp_path)
    monkeypatch.setattr(osm, "MANIFEST", tmp_path / "manifest.json")
    (tmp_path / "x.overpass.json").write_text("{}", encoding="utf-8")
    (tmp_path / "manifest.json").write_text(
        json.dumps({"x": {"sha256": "0" * 64}, "y": {"sha256": "0" * 64}}), encoding="utf-8"
    )
    problems = osm.check()
    assert any("x: el SHA-256" in p for p in problems)
    assert any("y: falta" in p for p in problems)
