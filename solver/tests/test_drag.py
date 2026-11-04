"""Arrastre tras el impacto como incógnita de la inversión (T3.2, ADR 0101)."""

from __future__ import annotations

import copy
import json
import math
from pathlib import Path
from typing import Any

import pytest

from croquis_solver import inversion as inv
from croquis_solver.reconstruct import POST_IMPACT_DRAG_FRACTION, reconstruct
from croquis_solver.results_io import INVERSION_DIR, INVERSION_RESULTS_DIR


def load_inversion_fixture(name: str) -> dict[str, Any]:
    return json.loads((INVERSION_DIR / f"{name}.json").read_text("utf-8"))


def test_el_previo_del_arrastre_es_el_supuesto_del_solver() -> None:
    assert inv.DRAG_PRIOR == POST_IMPACT_DRAG_FRACTION
    assert inv.DRAG_BOUNDS[0] <= inv.DRAG_PRIOR <= inv.DRAG_BOUNDS[1]


def test_que_vehiculos_ajustan_su_arrastre() -> None:
    spec = load_inversion_fixture("axa_alcance")
    ev = inv.evidence_from_spec(spec)
    # Los dos están en el impacto, no frenan y tienen reposo (declarado o supuesto).
    assert inv.drag_vehicles(spec, ev) == ["veh-a", "veh-b"]
    by_id = {v["id"]: v for v in spec["vehiculos"]}
    # Frenó: las llantas van bloqueadas y no hay arrastre que ajustar.
    frena = copy.deepcopy(spec)
    next(v for v in frena["vehiculos"] if v["id"] == "veh-b")["frenado"] = {
        "aplico": {"valor": True, "fuente": "relato", "confianza": 0.8}
    }
    assert inv.drag_vehicles(frena, inv.evidence_from_spec(frena)) == ["veh-a"]
    # Lo dijo el perito: se respeta.
    dicho = copy.deepcopy(spec)
    next(v for v in dicho["vehiculos"] if v["id"] == "veh-a")["arrastre_post_impacto"] = {
        "valor": 0.8,
        "fuente": "usuario",
        "confianza": 0.9,
    }
    assert inv.drag_vehicles(dicho, inv.evidence_from_spec(dicho)) == ["veh-b"]
    # Sin reposo ni marcas posteriores, nada lo fija.
    sin = copy.deepcopy(spec)
    for v in sin["vehiculos"]:
        v.pop("posicion_final", None)
        v.pop("posicion_final_supuesta", None)
    assert inv.drag_vehicles(sin, inv.evidence_from_spec(sin)) == []
    assert by_id["veh-a"]["posicion_final_supuesta"] is True
    kinds = [p.kind for p in inv.parameters(spec, ev)]
    assert kinds == ["velocidad", "velocidad", "rumbo", "rumbo", "arrastre", "arrastre"]


def test_apply_values_escribe_el_arrastre_y_la_reconstruccion_lo_usa() -> None:
    spec = load_inversion_fixture("axa_alcance")
    ev = inv.evidence_from_spec(spec)
    golpea = inv.rear_end_pairs(spec)[0][1]  # el alcanzado, que rueda tras el impacto
    base = reconstruct(spec)
    con = inv.apply_values(spec, {f"arrastre:{golpea}": 1.0})
    campo = next(v for v in con["vehiculos"] if v["id"] == golpea)["arrastre_post_impacto"]
    assert campo["valor"] == 1.0
    assert campo["fuente"] == "supuesto"
    r = reconstruct(con)
    assert r.parametros["arrastre_post_impacto"]["por_vehiculo"] == {golpea: 1.0}
    assert "por_vehiculo" not in base.parametros["arrastre_post_impacto"]
    post = {v.id: v.distance_post_m for v in r.vehiculos}
    post0 = {v.id: v.distance_post_m for v in base.vehiculos}
    assert post[golpea] < post0[golpea]
    assert ev.rest  # la escena tiene reposo: el arrastre entra como incógnita
    assert golpea in inv.drag_vehicles(spec, ev)


def test_los_residuos_previos() -> None:
    params = [
        inv.Param("velocidad", "veh-a", 40.0, 5.0, 150.0, False),
        inv.Param("rumbo", "veh-a", 350.0, 330.0, 370.0, False),
        inv.Param("arrastre", "veh-b", 0.35, 0.3, 1.0, False),
    ]
    res = inv.priors(params, [60.0, 365.0, 0.6])
    assert res == {
        "rumbo_previo:veh-a": pytest.approx(15.0 / inv.SIGMA_HEADING_PRIOR_DEG),
        "arrastre_previo:veh-b": pytest.approx(0.25 / inv.SIGMA_DRAG),
    }
    # El rumbo se envuelve: 359° contra 1° son 2°, no 358°.
    res = inv.priors([inv.Param("rumbo", "v", 1.0, -19.0, 21.0, False)], [359.0])
    assert res["rumbo_previo:v"] == pytest.approx(-2.0 / inv.SIGMA_HEADING_PRIOR_DEG)


def test_axa_el_rumbo_de_v2_ya_no_queda_en_el_limite() -> None:
    # Lo que cerró T3.2: la referencia versionada de AXA (la misma que compara la paridad E7).
    doc = json.loads((Path(INVERSION_RESULTS_DIR) / "axa_alcance.json").read_text("utf-8"))
    params = {(p["parametro"], p["vehiculo"]): p for p in doc["inversion"]["parametros"]}
    rumbo = params[("rumbo_inicial", "veh-a")]
    assert rumbo["identificable"] is True
    assert rumbo["en_limite"] is False
    assert abs(rumbo["estimacion"]["mejor"] - rumbo["inicial"]) < inv.SIGMA_HEADING_PRIOR_DEG
    arrastre = params[("arrastre_post_impacto", "veh-b")]
    assert arrastre["unidad"] == "fraccion"
    assert inv.DRAG_BOUNDS[0] <= arrastre["estimacion"]["mejor"] <= inv.DRAG_BOUNDS[1]
    assert not arrastre["en_limite"]


def test_el_rumbo_de_llegada_gira_sobre_el_punto_de_impacto_declarado() -> None:
    # Con +10° en V2, el choque sigue en el punto que colocó el perito (ADR 0101); sin el pivote,
    # el contacto se corría a la posición inicial (12 m antes) o 2 m de lado.
    spec = load_inversion_fixture("axa_alcance")
    h0 = float(
        next(v for v in spec["vehiculos"] if v["id"] == "veh-a")["posicion_inicial"]["rumbo_deg"]
    )
    girada = inv.apply_values(spec, {"rumbo:veh-a": h0 + 10.0})
    pose = next(v for v in girada["vehiculos"] if v["id"] == "veh-a")["posicion_inicial"]
    assert pose["rumbo_deg"] == pytest.approx(h0 + 10.0)
    assert (pose["x"], pose["y"]) != (-3.62, -14.216)
    # A la misma distancia del punto declarado que antes.
    assert math.hypot(pose["x"], pose["y"]) == pytest.approx(math.hypot(-3.62, -14.216))
    r = reconstruct(girada)
    assert r.punto_impacto is not None
    assert math.hypot(*r.punto_impacto) < 0.3
    assert inv.impact_pivot(spec) == (0.0, 0.0)
    # Sin punto declarado, el rumbo gira en su lugar (como antes).
    sin = copy.deepcopy(spec)
    for e in sin["eventos"]:
        e.pop("punto_impacto", None)
    quieta = inv.apply_values(sin, {"rumbo:veh-a": h0 + 10.0})
    pose2 = next(v for v in quieta["vehiculos"] if v["id"] == "veh-a")["posicion_inicial"]
    assert (pose2["x"], pose2["y"]) == (-3.62, -14.216)
