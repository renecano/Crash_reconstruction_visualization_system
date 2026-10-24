"""Integración conjunta y contacto secundario después del impacto (ADR 0063)."""

from __future__ import annotations

import itertools
import json
import math
from pathlib import Path
from typing import Any

import pytest

from croquis_scene_schema import list_fixtures, load_fixture
from croquis_solver.models import Body2D, State2D
from croquis_solver.postimpact import (
    AXIS_HYSTERESIS,
    SEPARATION_S,
    JointBody,
    JointState,
    WheelConfig,
    box_corners,
    box_penetration,
    deformed_extents,
    integrate,
    integrate_joint,
    resolve_secondary_contact,
)
from croquis_solver.reconstruct import VehicleOutcome, reconstruct

CAR = Body2D.from_dimensions(1300.0, 4.5, 1.8)
VAN = Body2D.from_dimensions(2600.0, 5.0, 2.0)
LOCKED = WheelConfig.four_wheels(2.6, 1.55, 1.15, locked=True)
ROLLING = WheelConfig.four_wheels(2.6, 1.55, 1.15, locked=False)


def _full(body: Body2D) -> tuple[float, float, float, float]:
    return deformed_extents(body.length, body.width, 0.0, "F")


def test_penetracion_de_dos_cajas_alineadas() -> None:
    a = box_corners(0.0, 0.0, 0.0, _full(CAR))
    b = box_corners(4.2, 0.0, 0.0, _full(CAR))
    depth, n = box_penetration(a, b)
    assert math.isclose(depth, 0.3, abs_tol=1e-12)
    assert n == pytest.approx((1.0, 0.0))  # de a hacia b
    depth_ba, n_ba = box_penetration(b, a)
    assert math.isclose(depth_ba, 0.3, abs_tol=1e-12)
    assert n_ba == pytest.approx((-1.0, 0.0))
    assert box_penetration(a, box_corners(4.6, 0.0, 0.0, _full(CAR))) == (0.0, (0.0, 0.0))


@pytest.mark.parametrize(
    ("face", "expected"),
    [
        ("F", (2.25 - 0.3, 2.25, 0.9, 0.9)),
        ("B", (2.25, 2.25 - 0.3, 0.9, 0.9)),
        ("L", (2.25, 2.25, 0.9 - 0.3, 0.9)),
        ("R", (2.25, 2.25, 0.9, 0.9 - 0.3)),
    ],
)
def test_la_cara_danada_se_hunde_su_aplastamiento(
    face: str, expected: tuple[float, float, float, float]
) -> None:
    assert deformed_extents(4.5, 1.8, 0.3, face) == pytest.approx(expected)
    assert deformed_extents(4.5, 1.8, 5.0, face)[0] >= 0  # nunca se invierte


def _state(spec: JointBody) -> JointState:
    return JointState.from_body(spec)


def test_contacto_plastico_conserva_momento_y_separa_el_exceso() -> None:
    a = _state(JointBody(CAR, State2D(x=0.0, vx=8.0), LOCKED, 0.7))
    b = _state(JointBody(VAN, State2D(x=4.5, vx=2.0), LOCKED, 0.7))
    depth0, n = box_penetration(
        box_corners(a.x, 0, 0, a.extents), box_corners(b.x, 0, 0, b.extents)
    )
    assert n == pytest.approx((1.0, 0.0))
    p0 = (CAR.mass * a.vx + VAN.mass * b.vx, CAR.mass * a.vy + VAN.mass * b.vy)
    cm0 = (CAR.mass * a.x + VAN.mass * b.x) / (CAR.mass + VAN.mass)
    left, axis = resolve_secondary_contact(a, b, 0.1)
    assert math.isclose(left, 0.1)
    assert axis is not None  # empieza un contacto
    p1 = (CAR.mass * a.vx + VAN.mass * b.vx, CAR.mass * a.vy + VAN.mass * b.vy)
    assert p1 == pytest.approx(p0, abs=1e-9)  # momento lineal
    assert math.isclose(a.vx, b.vx, abs_tol=1e-12)  # restitución 0: misma velocidad normal
    cm1 = (CAR.mass * a.x + VAN.mass * b.x) / (CAR.mass + VAN.mass)
    assert math.isclose(cm1, cm0, abs_tol=1e-12)  # la separación no mueve el centro de masa
    depth1, _ = box_penetration(
        box_corners(a.x, a.y, a.yaw, a.extents), box_corners(b.x, b.y, b.yaw, b.extents)
    )
    assert math.isclose(depth1, 0.1, abs_tol=1e-12)
    assert depth0 > depth1
    assert a.u == pytest.approx(a.vx)
    assert b.u == pytest.approx(b.vx)


def test_sin_impulso_si_ya_se_separan() -> None:
    a = _state(JointBody(CAR, State2D(x=0.0, vx=2.0), LOCKED, 0.7))
    b = _state(JointBody(CAR, State2D(x=4.2, vx=6.0), LOCKED, 0.7))
    resolve_secondary_contact(a, b, 0.0)
    assert (a.vx, b.vx) == (2.0, 6.0)  # se alejan: ninguna velocidad cambia
    assert math.isclose(b.x - a.x, 4.5, abs_tol=1e-12)  # solo se deshace el encaje


def test_sin_encaje_no_hace_nada() -> None:
    a = _state(JointBody(CAR, State2D(x=0.0, vx=8.0), LOCKED, 0.7))
    b = _state(JointBody(CAR, State2D(x=4.4, vx=2.0), LOCKED, 0.7))
    left, axis = resolve_secondary_contact(a, b, 0.2)
    assert math.isclose(left, 0.1)
    assert axis is None
    assert (a.x, a.vx, b.x, b.vx) == (0.0, 8.0, 4.4, 2.0)
    assert not a.moved
    assert not b.moved


def test_detenido_que_no_sale_del_reposo_detiene_al_otro() -> None:
    # Un empujón que no saca del reposo a la camioneta: queda quieta y el auto pierde su velocidad
    # normal contra ella; toda la separación la hace el que se mueve.
    a = _state(JointBody(CAR, State2D(x=0.0, vx=0.06), LOCKED, 0.7))
    b = _state(JointBody(VAN, State2D(x=4.6), LOCKED, 0.7))
    assert not b.active
    resolve_secondary_contact(a, b, 0.0)
    assert (b.vx, b.x, b.active, b.moved) == (0.0, 4.6, False, False)
    assert math.isclose(a.vx, 0.0, abs_tol=1e-15)
    assert math.isclose(b.x - a.x, 4.75, abs_tol=1e-12)


def test_la_normal_del_contacto_se_conserva_con_histeresis() -> None:
    # Dos cajas encajadas en x (0.3 m) y en y (0.3 m + algo menos que la histéresis): la normal
    # empieza en el menor traslape y no salta al otro eje mientras no gane por la histéresis.
    h = AXIS_HYSTERESIS
    a = _state(JointBody(CAR, State2D(), LOCKED, 0.7))
    b = _state(JointBody(CAR, State2D(x=4.2, y=1.5 - 0.5 * h), LOCKED, 0.7))
    _, first = resolve_secondary_contact(a, b, 0.25)  # x: 0.3 m; y: 0.3 + h/2
    assert first is not None
    a.x = a.y = 0.0
    b.x, b.y = 4.2 - 0.5 * h, 1.5  # x: 0.3 + h/2; y: 0.3 (gana por menos que h)
    _, axis = resolve_secondary_contact(a, b, 0.25, first)
    assert axis == first
    a.x = a.y = 0.0
    b.x, b.y = 4.2 - 0.5 * h, 1.5 + h  # y: 0.3 − h (gana por más que h)
    _, axis = resolve_secondary_contact(a, b, 0.25, first)
    assert axis is not None
    assert axis != first


def test_un_ulp_no_cambia_el_resultado() -> None:
    # Bien condicionado: un ulp en la entrada no mueve la salida (la paridad Python/TS depende de
    # ello).
    a_spec = JointBody(CAR, State2D(x=0.0, y=0.3, vx=12.0, vy=0.5), ROLLING, 0.7, rolling_drag=0.1)
    b_spec = JointBody(VAN, State2D(x=5.0, yaw=0.4, vx=1.0), LOCKED, 0.7, crush=0.1)
    base = integrate_joint([a_spec, b_spec])
    nudged = JointBody(
        CAR, State2D(x=0.0, y=math.nextafter(0.3, 1.0), vx=12.0, vy=0.5), ROLLING, 0.7, 0.1
    )
    pert = integrate_joint([nudged, b_spec])
    for r0, r1 in zip(base, pert, strict=True):
        assert len(r0.trajectory) == len(r1.trajectory)
        for p, q in zip(
            r0.trajectory.x + r0.trajectory.y, r1.trajectory.x + r1.trajectory.y, strict=True
        ):
            assert abs(p - q) < 1e-9


def test_lejos_es_identico_a_integrar_cada_uno() -> None:
    s1 = State2D(x=0.0, y=0.0, yaw=0.3, vx=12.0, vy=4.0, yaw_rate=1.5)
    s2 = State2D(x=0.0, y=200.0, yaw=-1.0, vx=6.0, vy=-1.0, yaw_rate=-0.4)
    joint = integrate_joint(
        [JointBody(CAR, s1, LOCKED, 0.7), JointBody(VAN, s2, ROLLING, 0.7, rolling_drag=0.2)],
        dt_out=0.02,
    )
    solo = [integrate(CAR, s1, LOCKED, 0.7), integrate(VAN, s2, ROLLING, 0.7, rolling_drag=0.2)]
    for j, s in zip(joint, solo, strict=True):
        assert j.trajectory.t == s.trajectory.t
        assert j.trajectory.x == s.trajectory.x
        assert j.trajectory.y == s.trajectory.y
        assert j.trajectory.yaw == s.trajectory.yaw
        assert j.trajectory.vx == s.trajectory.vx
        assert (j.stopped, j.distance, j.duration) == (s.stopped, s.distance, s.duration)
        assert j.energy_dissipated == s.energy_dissipated


def test_empuja_al_que_esta_detenido_sin_atravesarlo() -> None:
    # Un auto rodando alcanza a una camioneta detenida 1 m adelante: la empuja, no la atraviesa.
    a_spec = JointBody(CAR, State2D(x=0.0, vx=10.0), ROLLING, 0.7, rolling_drag=0.05)
    b_spec = JointBody(VAN, State2D(x=5.75), LOCKED, 0.7)
    ra, rb = integrate_joint([a_spec, b_spec])
    assert ra.stopped
    assert rb.stopped
    assert rb.distance > 1.0  # la camioneta se movió
    assert rb.trajectory.x[-1] > a_spec.start.x + ra.distance  # sigue adelante del auto
    ta, tb = ra.trajectory, rb.trajectory
    for k in range(min(len(ta), len(tb))):
        depth, _ = box_penetration(
            box_corners(ta.x[k], ta.y[k], ta.yaw[k], _full(CAR)),
            box_corners(tb.x[k], tb.y[k], tb.yaw[k], _full(VAN)),
        )
        assert depth < 1e-9
    # Momento: lo que pierde el auto lo gana la camioneta (antes de que la fricción lo disipe).
    assert ra.distance < 10.0**2 / (2 * 0.05 * 9.80665)


def test_el_encaje_inicial_se_deshace_en_separation_s() -> None:
    # Dos cuerpos detenidos que arrancan encajados 0.2 m se separan parejo en SEPARATION_S (dos
    # cuadros de 0.02 s, 0.1 m por cuadro entre los dos) y desde ahí sus cajas solo se tocan.
    a_spec = JointBody(CAR, State2D(x=0.0), LOCKED, 0.7)
    b_spec = JointBody(CAR, State2D(x=4.3), LOCKED, 0.7)
    ra, rb = integrate_joint([a_spec, b_spec])
    ta = ra.trajectory
    gaps = [rb.trajectory.x[k] - ta.x[k] for k in range(len(ta))]
    assert math.isclose(gaps[-1], 4.5, abs_tol=1e-9)
    per_frame = 0.2 * 0.02 / SEPARATION_S + 1e-9
    assert all(q - p <= per_frame for p, q in itertools.pairwise(gaps))
    k = next(i for i, t in enumerate(ta.t) if t >= SEPARATION_S - 1e-9)
    assert all(g >= 4.5 - 1e-9 for g in gaps[k:])
    assert ra.duration <= SEPARATION_S + 0.02


VV = [
    n
    for n in list_fixtures()
    if any(e.get("tipo") == "impacto_vehiculo_vehiculo" for e in load_fixture(n)["eventos"])
]
AXA = Path(__file__).resolve().parents[2] / "demo" / "escenas-r11" / "axa.json"


def _escena(name: str) -> dict[str, Any]:
    if name == "axa":
        data: dict[str, Any] = json.loads(AXA.read_text(encoding="utf-8"))
        return data
    return load_fixture(name)


def _excess(a: VehicleOutcome, b: VehicleOutcome, k: int) -> float:
    ta, tb = a.trajectory, b.trajectory
    depth, _ = box_penetration(
        box_corners(ta.x[k], ta.y[k], ta.yaw[k], deformed_extents(a.length, a.width, 0.0, "F")),
        box_corners(tb.x[k], tb.y[k], tb.yaw[k], deformed_extents(b.length, b.width, 0.0, "F")),
    )
    return depth - max(0.0, *a.crush_profile_m) - max(0.0, *b.crush_profile_m)


def _depth(a: VehicleOutcome, b: VehicleOutcome, ka: int, kb: int) -> float:
    ta, tb = a.trajectory, b.trajectory
    ea = deformed_extents(a.length, a.width, 0.0, "F")
    eb = deformed_extents(b.length, b.width, 0.0, "F")
    depth, _ = box_penetration(
        box_corners(ta.x[ka], ta.y[ka], ta.yaw[ka], ea),
        box_corners(tb.x[kb], tb.y[kb], tb.yaw[kb], eb),
    )
    return depth


@pytest.mark.parametrize("name", [*VV, "axa"])
def test_desde_separation_s_ningun_contorno_traslapa(name: str) -> None:
    """Comentario de René (2026-10-24, ADR 0089): ningún contorno de vehículo (su caja sin
    deformar, que contiene lo que dibuja el 3D) traslapa a otro desde SEPARATION_S después de cada
    impacto entre los dos, ni en la animación ni en el reposo."""
    r = reconstruct(_escena(name))
    vs = r.vehiculos
    for i, a in enumerate(vs):
        for b in vs[i + 1 :]:
            impactos = [0.0] + [
                e.t
                for e in r.eventos
                if e.tipo == "impacto_vehiculo_vehiculo" and {a.id, b.id} <= set(e.actores)
            ]
            ta, tb = a.trajectory, b.trajectory
            index_b = {round(t, 6): k for k, t in enumerate(tb.t)}
            for ka, t in enumerate(ta.t):
                if t < SEPARATION_S - 1e-9 or any(
                    lo <= t < lo + SEPARATION_S - 1e-9 for lo in impactos
                ):
                    continue
                kb = index_b.get(round(t, 6), len(tb) - 1 if t > tb.t[-1] else None)
                if kb is None:
                    continue
                assert _depth(a, b, ka, kb) <= 1e-9, (name, a.id, b.id, t, _depth(a, b, ka, kb))
            # En reposo (la última pose de cada uno), tampoco.
            assert _depth(a, b, len(ta) - 1, len(tb) - 1) <= 1e-9, (name, a.id, b.id, "reposo")


def test_en_el_impacto_solo_la_moto_pasa_de_su_aplastamiento() -> None:
    """El encaje en t = 0 lo fija el punto de contacto (ADR 0063): pasa de la suma de
    aplastamientos solo en la moto, y es la esquina de su caja de 0.75 m de ancho que entra al
    costado en ángulo: (ancho / 2)·|sen θ|, con θ el ángulo entre la moto y la normal de la puerta.
    """
    for name in VV:
        r = reconstruct(load_fixture(name))
        a, b = r.vehiculos[0], r.vehiculos[1]
        k = a.trajectory.t.index(0.0)
        excess = _excess(a, b, k)
        if name != "motociclista":
            assert excess <= 0.01, (name, excess)
            continue
        moto = next(v for v in r.vehiculos if v.clase == "motocicleta")
        auto = next(v for v in r.vehiculos if v.clase != "motocicleta")
        door_normal = auto.trajectory.yaw[k] + math.pi / 2  # hacia adentro del costado derecho
        theta = moto.trajectory.yaw[k] - door_normal
        corner = moto.width / 2 * abs(math.sin(theta))
        ta, tb = a.trajectory, b.trajectory
        depth, _ = box_penetration(
            box_corners(ta.x[k], ta.y[k], ta.yaw[k], deformed_extents(a.length, a.width, 0, "F")),
            box_corners(tb.x[k], tb.y[k], tb.yaw[k], deformed_extents(b.length, b.width, 0, "F")),
        )
        assert math.isclose(depth, corner, abs_tol=0.01), (depth, corner)
        assert excess > 0.01
