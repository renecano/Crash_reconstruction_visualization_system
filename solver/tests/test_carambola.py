"""Impactos en secuencia (carambolas, ADR 0066)."""

from __future__ import annotations

import copy
import math

from croquis_scene_schema import load_fixture
from croquis_solver.models import Body2D, State2D
from croquis_solver.postimpact import (
    JointBody,
    PlannedImpact,
    WheelConfig,
    contact_point,
    integrate_joint,
    integrate_joint_impacts,
)
from croquis_solver.reconstruct import RESTITUTION_VV, reconstruct

CAR = Body2D.from_dimensions(1300.0, 4.5, 1.8)
ROLLING = WheelConfig.four_wheels(2.6, 1.55, 1.15, locked=False)
LOCKED = WheelConfig.four_wheels(2.6, 1.55, 1.15, locked=True)


def _cadena(gap: float) -> list[JointBody]:
    # B rueda a 6 m/s hacia C, detenido `gap` metros adelante.
    b = JointBody(CAR, State2D(x=0.0, vx=6.0), ROLLING, 0.7, rolling_drag=0.015)
    c = JointBody(CAR, State2D(x=4.5 + gap), LOCKED, 0.7)
    return [b, c]


def test_el_punto_de_contacto_son_las_esquinas_que_entran() -> None:
    a = [(0.0, 0.0), (2.0, 0.0), (2.0, 1.0), (0.0, 1.0)]
    b = [(1.5, 0.5), (3.0, 0.5), (3.0, 2.0), (1.5, 2.0)]
    assert contact_point(a, b) == (1.75, 0.75)  # (2, 1) entra en b y (1.5, 0.5) entra en a


def test_el_impacto_planeado_ocurre_al_tocarse_y_conserva_el_momento() -> None:
    plan = PlannedImpact(0, 1, "ev-2", RESTITUTION_VV, 0.4)
    (rb, rc), hits = integrate_joint_impacts(_cadena(1.0), impacts=[plan])
    assert len(hits) == 1
    hit = hits[0]
    assert hit.event_id == "ev-2"
    # Recorre el metro libre en unos 0.17 s (casi sin frenar) y entonces choca.
    assert 0.15 < hit.t < 0.19
    before = CAR.mass * hit.a_before.vx + CAR.mass * hit.b_before.vx
    res = hit.result
    assert res.b_after is not None
    after = CAR.mass * res.a_after.vx + CAR.mass * res.b_after.vx
    assert math.isclose(before, after, rel_tol=1e-12)
    assert res.energy_loss > 0
    assert rc.distance > 0.5  # C se movió por el golpe
    assert rb.stopped
    assert rc.stopped


def test_sin_impacto_planeado_el_contacto_es_el_de_siempre() -> None:
    plain = integrate_joint(_cadena(1.0))
    (rb, rc), hits = integrate_joint_impacts(_cadena(1.0))
    assert hits == []
    assert plain[0].trajectory.x == rb.trajectory.x
    assert plain[1].trajectory.x == rc.trajectory.x


def test_el_impacto_planeado_que_no_se_alcanza_no_ocurre() -> None:
    plan = PlannedImpact(0, 1, "ev-2", RESTITUTION_VV, 0.4)
    _, hits = integrate_joint_impacts(_cadena(200.0), impacts=[plan])
    assert hits == []


def test_la_carambola_canonica_tiene_su_segundo_impacto() -> None:
    r = reconstruct(load_fixture("carambola"))
    eventos = {e.id: e for e in r.eventos}
    segundo = eventos["ev-impacto-2"]
    assert segundo.tipo == "impacto_vehiculo_vehiculo"
    assert segundo.actores == ["veh-b", "veh-c"]
    assert segundo.t > 0
    assert segundo.detalle["energia_disipada_j"] > 0
    assert not any("no ocurre" in b for b in r.banderas)
    vs = {v.id: v for v in r.vehiculos}
    # C no tenía daño: el del segundo impacto es su daño; B ya tenía el del primero.
    assert vs["veh-c"].involucrado
    assert vs["veh-c"].cdc is not None
    assert vs["veh-c"].cdc["lado"] == "B"
    assert vs["veh-c"].crush_energy_j > 0
    assert vs["veh-c"].delta_v_kmh > 0
    assert vs["veh-b"].cdc is not None
    assert vs["veh-b"].cdc["lado"] == "B"
    posterior = vs["veh-b"].later_damage
    assert [d.event_id for d in posterior] == ["ev-impacto-2"]
    assert posterior[0].cdc is not None
    assert posterior[0].cdc["lado"] == "F"
    # C sale hacia adelante, delante de B.
    assert vs["veh-c"].rest_pose[0] > vs["veh-b"].rest_pose[0]


def test_si_el_segundo_impacto_no_ocurre_lo_dice() -> None:
    spec = copy.deepcopy(load_fixture("carambola"))
    c = next(v for v in spec["vehiculos"] if v["id"] == "veh-c")
    c["posicion_inicial"]["x"] = 300.0  # muy lejos: B no lo alcanza
    r = reconstruct(spec)
    assert not any(e.id == "ev-impacto-2" for e in r.eventos)
    assert any(a.codigo == "impacto_no_ocurre" for a in r.avisos)
