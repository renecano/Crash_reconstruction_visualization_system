"""Reversa: el vehículo avanza con la parte posterior por delante (R4b).

Antes, la maniobra «reversa» giraba la trayectoria 180° y el cuerpo la seguía: el vehículo chocaba
con el frente. Ahora el rumbo del frente es el que dejó el perito y el sentido de marcha es el
contrario.
"""

from __future__ import annotations

import copy
import math
from typing import Any

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


# --- T3.3: el sentido de marcha va aparte de la maniobra ------------------------------------------


def _con_sentido(maniobra: str) -> JsonObj:
    """La reversa de arriba, dicha con `sentido_marcha` y con la maniobra que se pida."""
    spec: Any = _reversa()
    a = next(v for v in spec["vehiculos"] if v["id"] == "veh-a")
    a["maniobra"] = {"valor": maniobra, "fuente": "supuesto", "confianza": 0.6}
    a["sentido_marcha"] = {"valor": "reversa", "fuente": "usuario", "confianza": 0.8}
    return spec


def _antes(spec: JsonObj, vid: str = "veh-a") -> list[tuple[float, float, float, float, float]]:
    """(x, y, rumbo, vx, vy) de las muestras anteriores al impacto."""
    tr = next(v for v in reconstruct(spec).vehiculos if v.id == vid).trajectory
    return [
        (s.x, s.y, s.yaw, s.vx, s.vy)
        for s in (tr.state(i) for i in range(len(tr)) if tr.t[i] < -0.05)
    ]


def test_sentido_reversa_con_maniobra_recta_es_la_reversa_recta() -> None:
    assert _antes(_con_sentido("recto")) == _antes(_reversa())


def test_el_resultado_dice_quien_iba_en_reversa() -> None:
    doc = reconstruct(_con_sentido("recto")).to_dict()
    vs = {v["id"]: v for v in doc["vehiculos"]}
    assert vs["veh-a"]["sentido_marcha"] == "reversa"
    assert "sentido_marcha" not in vs["veh-b"]
    # Con la maniobra «reversa» de siempre, también.
    doc = reconstruct(_reversa()).to_dict()
    assert next(v for v in doc["vehiculos"] if v["id"] == "veh-a")["sentido_marcha"] == "reversa"
    # Y un alcance de frente no lo lleva.
    doc = reconstruct(load_fixture("alcance")).to_dict()
    assert all("sentido_marcha" not in v for v in doc["vehiculos"])


def test_la_vuelta_en_reversa_va_hacia_el_lado_del_conductor() -> None:
    # A mira al oriente y retrocede: su izquierda es el norte (+y).
    izq = _antes(_con_sentido("vuelta_izquierda"))
    der = _antes(_con_sentido("vuelta_derecha"))
    assert izq
    assert der
    for muestras, lado in ((izq, 1.0), (der, -1.0)):
        x0, y0, yaw0 = muestras[0][:3]
        x1, y1, yaw1 = muestras[-1][:3]
        assert x1 < x0 - 1.0, "retrocede hacia el poniente"
        assert lado * (y1 - y0) > 0.5, "la parte posterior se abre hacia el lado de la vuelta"
        # Al retroceder con el volante a la izquierda, el frente gira en sentido horario.
        assert lado * wrap_angle(yaw1 - yaw0) < -0.1
        for x, y, yaw, vx, vy in muestras:
            del x, y
            # Siempre con la parte posterior por delante: la velocidad es contraria al frente.
            assert vx * math.cos(yaw) + vy * math.sin(yaw) < 0


def test_el_cambio_de_carril_en_reversa_va_hacia_el_lado_del_conductor() -> None:
    izq = _antes(_con_sentido("cambio_carril_izquierda"))
    der = _antes(_con_sentido("cambio_carril_derecha"))
    assert izq[-1][1] - izq[0][1] > 0.2
    assert der[-1][1] - der[0][1] < -0.2


def test_en_una_curva_la_reversa_sigue_el_carril() -> None:
    from croquis_solver.road import road_axis

    spec = copy.deepcopy(load_fixture("frontal_curva"))
    axis = road_axis(spec["lugar"])
    assert axis.kind == "arco"
    a = next(v for v in spec["vehiculos"] if v["id"] == "veh-a")
    cx, cy = axis.center
    radio = math.hypot(a["posicion_inicial"]["x"] - cx, a["posicion_inicial"]["y"] - cy)
    # El mismo recorrido, pero con el frente al revés y en reversa.
    a["posicion_inicial"]["rumbo_deg"] = math.degrees(
        wrap_angle(math.radians(a["posicion_inicial"]["rumbo_deg"]) + math.pi)
    )
    a["sentido_marcha"] = {"valor": "reversa", "fuente": "usuario", "confianza": 0.8}
    muestras = _antes(spec)
    assert len(muestras) > 10
    for x, y, yaw, vx, vy in muestras:
        del x, y
        assert vx * math.cos(yaw) + vy * math.sin(yaw) < 0
    # Desde su posición inicial va sobre el arco del carril (antes de ella se extrapola en recta).
    for x, y, *_ in muestras[-20:]:
        assert math.isclose(math.hypot(x - cx, y - cy), radio, abs_tol=0.02), "sigue el carril"
