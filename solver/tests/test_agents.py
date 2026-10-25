"""Los conductores como agentes (R12a, ADR 0088): los criterios de «Listo cuando» del plan."""

from __future__ import annotations

import copy
from typing import Any

import pytest

from croquis_scene_schema import load_fixture
from croquis_solver import agent_fixtures
from croquis_solver.agents import has_drivers, simulate_drivers
from croquis_solver.reconstruct import reconstruct


def _agentes(spec: dict[str, Any]) -> dict[str, Any]:
    res = simulate_drivers(spec, reconstruct(spec))
    assert res is not None
    return res.to_dict()


def test_sin_conductor_no_hay_agentes() -> None:
    spec = load_fixture("alcance")
    assert not has_drivers(spec)
    assert simulate_drivers(spec, reconstruct(spec)) is None


def test_un_caso_del_corpus_reproduce_la_reconstruccion() -> None:
    # AXA A2010930 (reporte de CESVI), sin hipótesis: los agentes reproducen la reconstrucción.
    d = _agentes(agent_fixtures.axa_agentes())
    assert d["resultado"] == d["linea_base"]
    assert d["resultado"]["contacto"] is True
    assert d["resultado"]["t"] == pytest.approx(0.0, abs=1e-6)


def test_frenar_antes_baja_la_velocidad_del_impacto() -> None:
    # «¿Y si A frenaba 0.5 s antes?»: llega más tarde y más lento.
    d = _agentes(agent_fixtures.alcance_frena_antes())
    base, hip = d["linea_base"], d["resultado"]
    assert hip["contacto"] is True
    assert hip["velocidad_relativa_kmh"] < base["velocidad_relativa_kmh"]
    assert hip["t"] > base["t"]
    a = next(c for c in d["conductores"] if c["vehiculo"] == "veh-a")
    assert a["decision"] == {"tipo": "frenar", "t": -1.150752, "origen": "perito"}


def test_volantear_sin_frenar_llega_mas_rapido() -> None:
    # Volantear en vez de frenar: no pierde velocidad, así que si toca, toca más rápido.
    d = _agentes(agent_fixtures.alcance_volantea())
    base, hip = d["linea_base"], d["resultado"]
    if hip["contacto"]:
        assert hip["velocidad_relativa_kmh"] > base["velocidad_relativa_kmh"]


def test_la_carambola_muestra_la_reaccion_en_cadena() -> None:
    d = _agentes(agent_fixtures.carambola_cadena())
    dec = {c["vehiculo"]: c.get("decision") for c in d["conductores"]}
    reaccion = {c["vehiculo"]: c["tiempo_reaccion_s"]["valor"] for c in d["conductores"]}
    # C frena (lo dice el perito); B ve frenar a C y reacciona; A ve frenar a B y reacciona.
    assert dec["veh-c"]["origen"] == "perito"
    assert dec["veh-b"] == {
        "tipo": "frenar",
        "t": pytest.approx(dec["veh-c"]["t"] + reaccion["veh-b"]),
        "origen": "reaccion",
        "ante": "veh-c",
        "percibio_t": pytest.approx(dec["veh-c"]["t"]),
    }
    assert dec["veh-a"]["ante"] == "veh-b"
    assert dec["veh-a"]["percibio_t"] == pytest.approx(dec["veh-b"]["t"])
    assert dec["veh-a"]["t"] == pytest.approx(dec["veh-b"]["t"] + reaccion["veh-a"])


def test_el_mismo_caso_da_lo_mismo() -> None:
    spec = agent_fixtures.carambola_cadena()
    assert _agentes(spec) == _agentes(copy.deepcopy(spec))
