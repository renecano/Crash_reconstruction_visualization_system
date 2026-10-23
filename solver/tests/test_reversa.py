"""Reversa: el vehículo avanza con la parte posterior por delante (R4b).

Antes, la maniobra «reversa» giraba la trayectoria 180° y el cuerpo la seguía: el vehículo chocaba
con el frente. Ahora el rumbo del frente es el que dejó el perito y el sentido de marcha es el
contrario.
"""

from __future__ import annotations

import copy
import math

from croquis_scene_schema import load_fixture
from croquis_solver.models import wrap_angle
from croquis_solver.preimpact import ReversePath, StraightPath, travel_heading
from croquis_solver.reconstruct import reconstruct
from croquis_solver.units import kmh_to_ms

JsonObj = dict[str, object]


def _reversa() -> JsonObj:
    """El alcance canónico al revés: A está delante de B, mira al oriente y retrocede hacia él."""
    spec = copy.deepcopy(load_fixture("alcance"))
    spec["eventos"] = [e for e in spec["eventos"] if e["id"] != "ev-frenado"]
    spec["evidencias"] = []
    a = next(v for v in spec["vehiculos"] if v["id"] == "veh-a")
    a["posicion_inicial"]["x"] = 14.0
    a["maniobra"] = {"valor": "reversa", "fuente": "supuesto", "confianza": 0.6}
    a["velocidad_previa"] = {"valor": 12, "unidad": "km/h", "fuente": "supuesto", "confianza": 0.5}
    del a["frenado"]  # el frenado del alcance canónico no es de esta maniobra
    impacto = next(e for e in spec["eventos"] if e["id"] == "ev-impacto")
    for z in impacto["zonas_impacto"]:
        if z["vehiculo_id"] == "veh-a":
            z["cdc"]["lado"] = "B"
            z["pdof_horas"]["valor"] = 6
        else:
            z["cdc"]["lado"] = "F"
            z["pdof_horas"]["valor"] = 12
    return spec


def test_la_trayectoria_en_reversa_conserva_el_rumbo_del_frente() -> None:
    p = ReversePath(StraightPath((0.0, 0.0), math.pi, 50.0))
    pose = p.pose(10.0)
    assert math.isclose(pose.x, -10.0, abs_tol=1e-12)
    assert math.isclose(wrap_angle(pose.heading), 0.0, abs_tol=1e-12)
    assert math.isclose(travel_heading(p, pose.heading), math.pi, abs_tol=1e-12)
    assert travel_heading(StraightPath((0.0, 0.0), 0.3, 1.0), 0.3) == 0.3


def test_el_que_retrocede_choca_con_su_parte_posterior() -> None:
    r = reconstruct(_reversa())
    vs = {v.id: v for v in r.vehiculos}
    a = vs["veh-a"]
    tr = a.trajectory
    antes = [tr.state(i) for i in range(len(tr)) if tr.t[i] < -0.05]
    assert antes, "A tiene trayectoria antes del impacto"
    for s in antes:
        # Mira al oriente y se mueve al poniente, a la velocidad declarada.
        assert abs(wrap_angle(s.yaw)) < 1e-9
        assert s.vx < 0
        assert math.isclose(math.hypot(s.vx, s.vy), kmh_to_ms(12.0), rel_tol=1e-9)
    assert a.cdc is not None
    assert a.cdc["lado"] == "B"
    b = vs["veh-b"]
    assert b.cdc is not None
    assert b.cdc["lado"] == "F"
    # El golpe empuja a B hacia atrás (al poniente).
    assert b.rest_pose[0] < 0


def test_la_escena_canonica_de_reversa() -> None:
    r = reconstruct(load_fixture("reversa"))
    vs = {v.id: v for v in r.vehiculos}
    assert vs["veh-a"].cdc is not None
    assert vs["veh-a"].cdc["lado"] == "B"
    assert vs["veh-b"].cdc is not None
    assert vs["veh-b"].cdc["lado"] == "F"
    assert vs["veh-b"].rest_pose[0] < -3.0  # detenida en x = −3, el golpe la empuja atrás
