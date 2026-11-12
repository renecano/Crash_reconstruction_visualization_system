"""Los conductores como agentes (R12a, ADR 0088): los criterios de «Listo cuando» del plan."""

from __future__ import annotations

import copy
from typing import Any

import pytest

from croquis_scene_schema import load_fixture
from croquis_solver import agent_fixtures, agents
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


def test_los_agentes_respetan_el_orden_de_impactos() -> None:
    # T6.4: en una fila detenida, C quedó colocado tocando a B. El hecho narra primero el alcance de
    # A a B y después el golpe de B a C: el primer contacto de los agentes es el de A con B.
    d = _agentes(agent_fixtures.carambola_orden())
    assert d["resultado"]["vehiculos"] == ["veh-a", "veh-b"]
    assert d["resultado"]["t"] == pytest.approx(0.0, abs=1e-6)
    # Sin hipótesis, los agentes reproducen la reconstrucción.
    assert d["resultado"] == d["linea_base"]
    assert d["supuestos"][-1] == (
        "Se respeta el orden de impactos del hecho: no se busca contacto entre veh-b y veh-c "
        "antes del primer impacto."
    )


def _sin_orden(spec: dict[str, Any], ids: set[str]) -> frozenset[tuple[str, str]]:
    return frozenset()


def test_sin_el_orden_el_primer_contacto_seria_el_de_la_fila(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Lo que pasaba antes de T6.4: B y C «chocan» detenidos, 3 s antes del alcance y a 0 km/h.
    monkeypatch.setattr(agents, "later_pairs", _sin_orden)
    d = _agentes(agent_fixtures.carambola_orden())
    assert d["resultado"]["vehiculos"] == ["veh-b", "veh-c"]
    assert d["resultado"]["t"] < -1.0
    assert d["resultado"]["velocidad_relativa_kmh"] == 0.0


def test_un_par_que_el_hecho_no_narra_si_se_busca() -> None:
    # Solo se dejan de buscar los pares de los impactos posteriores: en la cadena (un solo impacto
    # narrado) los tres pares siguen vigilados y no hay supuesto del orden.
    spec = agent_fixtures.carambola_cadena()
    rec = reconstruct(spec)
    assert agents.later_pairs(spec, set(rec.previa)) == frozenset()
    assert not any("orden de impactos" in s for s in _agentes(spec)["supuestos"])
    orden = agent_fixtures.carambola_orden()
    ids = {"veh-a", "veh-b", "veh-c"}
    assert agents.later_pairs(orden, ids) == frozenset({("veh-b", "veh-c")})


def test_el_mismo_caso_da_lo_mismo() -> None:
    spec = agent_fixtures.carambola_cadena()
    assert _agentes(spec) == _agentes(copy.deepcopy(spec))
