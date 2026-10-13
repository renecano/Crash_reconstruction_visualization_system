from __future__ import annotations

import math

from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_solver.models import G
from croquis_solver.preimpact import (
    ArcPath,
    CompositePath,
    LaneChangePath,
    SpeedProfile,
    StraightPath,
    braking_deceleration,
    simulate,
    skid_distance,
    speed_from_skid,
)

speed = st.floats(min_value=0.5, max_value=60, allow_nan=False)
mu = st.floats(min_value=0.1, max_value=1.0, allow_nan=False)


@settings(max_examples=200, deadline=None)
@given(speed, mu)
def test_distancia_de_derrape_cerrada_e_inversa(v: float, m: float) -> None:
    a = braking_deceleration(m)
    d = skid_distance(v, a)
    assert math.isclose(d, v * v / (2 * m * G), rel_tol=1e-12)
    assert math.isclose(speed_from_skid(d, a), v, rel_tol=1e-12)


def test_pendiente_y_abs_cambian_la_desaceleracion() -> None:
    flat = braking_deceleration(0.7)
    assert braking_deceleration(0.7, grade_percent=5) > flat  # subida frena más
    assert braking_deceleration(0.7, grade_percent=-5) < flat
    assert math.isclose(braking_deceleration(0.7, abs_factor=1.15), flat * 1.15, rel_tol=1e-12)


@settings(max_examples=100, deadline=None)
@given(speed, st.floats(min_value=0.2, max_value=3, allow_nan=False), mu)
def test_perfil_de_velocidad_es_consistente(v0: float, t_brake: float, m: float) -> None:
    a = braking_deceleration(m)
    p = SpeedProfile(v0, t_brake, a)
    t_stop = p.stop_time
    assert math.isclose(t_stop, t_brake + v0 / a, rel_tol=1e-12)
    assert p.speed(t_stop) == 0.0
    assert math.isclose(p.distance(t_stop), v0 * t_brake + skid_distance(v0, a), rel_tol=1e-9)
    # la distancia total se recorre justo al detenerse
    t = p.time_to_distance(p.distance(t_stop) * 0.999999)
    assert t is not None
    assert t <= t_stop + 1e-9
    assert p.time_to_distance(p.distance(t_stop) * 1.01) is None
    # tramo constante
    assert math.isclose(p.distance(t_brake / 2), v0 * t_brake / 2, rel_tol=1e-12)


def test_arco_conserva_radio_y_rumbo() -> None:
    arc = ArcPath(start=(0.0, 0.0), heading=0.0, radius=20.0, length=20 * math.pi, left=True)
    cx, cy = arc.center
    assert math.isclose(cx, 0.0, abs_tol=1e-12)
    assert math.isclose(cy, 20.0, abs_tol=1e-12)
    for s in (0.0, 5.0, 15.0, 20 * math.pi):
        p = arc.pose(s)
        assert math.isclose(math.hypot(p.x - cx, p.y - cy), 20.0, rel_tol=1e-12)
        assert math.isclose(p.curvature, 1 / 20.0)
    end = arc.pose(20 * math.pi)  # medio círculo: rumbo invertido
    assert math.isclose(abs(end.heading), math.pi, abs_tol=1e-9)
    assert math.isclose(end.x, 0.0, abs_tol=1e-9)
    assert math.isclose(end.y, 40.0, abs_tol=1e-9)
    right = ArcPath(start=(0.0, 0.0), heading=0.0, radius=20.0, length=20 * math.pi, left=False)
    assert math.isclose(right.pose(20 * math.pi).y, -40.0, abs_tol=1e-9)


def test_cambio_de_carril_llega_al_desplazamiento() -> None:
    lc = LaneChangePath(origin=(0.0, 0.0), heading=0.0, length=40.0, lateral=3.5)
    start, mid, end = lc.pose(0), lc.pose(20), lc.pose(40)
    assert math.isclose(start.y, 0.0, abs_tol=1e-12)
    assert math.isclose(mid.y, 1.75, rel_tol=1e-12)
    assert math.isclose(end.y, 3.5, rel_tol=1e-12)
    assert math.isclose(start.heading, 0.0, abs_tol=1e-12)
    assert mid.heading > 0  # girando a la izquierda a medio camino
    assert math.isclose(end.heading, 0.0, abs_tol=1e-9)
    assert math.isclose(end.curvature, -start.curvature, rel_tol=1e-9)  # S simétrica


def test_composicion_y_simulacion_determinista() -> None:
    path = CompositePath(
        (StraightPath((0.0, 0.0), 0.0, 20.0), ArcPath((20.0, 0.0), 0.0, 15.0, 10.0))
    )
    assert math.isclose(path.length, 30.0)
    prof = SpeedProfile(v0=10.0, t_brake=1.5, decel=5.0)  # 15 m + 10 m = 25 m: entra al arco
    a = simulate(path, prof, t_end=4.0, dt=0.05)
    b = simulate(path, prof, t_end=4.0, dt=0.05)
    assert a.x == b.x  # bit a bit
    assert a.yaw == b.yaw
    assert len(a) == 81
    assert a.t[0] == 0.0
    assert math.isclose(a.t[-1], 4.0)
    # a t=1 s va a 10 m/s sobre la recta; a los 3.5 s se detuvo (10/5 = 2 s de frenado)
    s1 = a.state(20)
    assert math.isclose(s1.vx, 10.0)
    assert abs(s1.vy) < 1e-12
    assert a.last().speed == 0.0
    # sobre el arco la velocidad angular es v·κ
    i = next(k for k, x in enumerate(a.x) if x > 20.5)
    st_i = a.state(i)
    assert math.isclose(st_i.yaw_rate, st_i.speed / 15.0, rel_tol=1e-9)
