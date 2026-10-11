from __future__ import annotations

import math
from dataclasses import dataclass

from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_solver.impact import central_collision_1d, pdof_hours, planar_impact
from croquis_solver.models import (
    Body2D,
    State2D,
    angular_momentum_about,
    kinetic_energy,
    linear_momentum,
)

mass = st.floats(min_value=80, max_value=20000, allow_nan=False, allow_infinity=False)
dim = st.floats(min_value=1.0, max_value=16.0, allow_nan=False, allow_infinity=False)
coord = st.floats(min_value=-5, max_value=5, allow_nan=False, allow_infinity=False)
vel = st.floats(min_value=-40, max_value=40, allow_nan=False, allow_infinity=False)
yawr = st.floats(min_value=-3, max_value=3, allow_nan=False, allow_infinity=False)
ang = st.floats(min_value=-math.pi, max_value=math.pi, allow_nan=False, allow_infinity=False)
e_st = st.floats(min_value=0, max_value=1, allow_nan=False, allow_infinity=False)
mu_st = st.floats(min_value=0, max_value=1.2, allow_nan=False, allow_infinity=False)


@dataclass(frozen=True)
class Scenario:
    body_a: Body2D
    body_b: Body2D
    sa: State2D
    sb: State2D
    point: tuple[float, float]
    normal: tuple[float, float]
    e: float
    mu: float


@st.composite
def scenario(draw: st.DrawFn) -> Scenario:
    body_a = Body2D.from_dimensions(draw(mass), draw(dim), draw(dim) / 3)
    body_b = Body2D.from_dimensions(draw(mass), draw(dim), draw(dim) / 3)
    sa = State2D(draw(coord), draw(coord), draw(ang), draw(vel), draw(vel), draw(yawr))
    sb = State2D(draw(coord) + 6, draw(coord), draw(ang), draw(vel), draw(vel), draw(yawr))
    n_ang = draw(ang)
    return Scenario(
        body_a,
        body_b,
        sa,
        sb,
        (draw(coord) + 3, draw(coord)),
        (math.cos(n_ang), math.sin(n_ang)),
        draw(e_st),
        draw(mu_st),
    )


def _rel(a: float, b: float) -> float:
    return abs(a - b) / max(1.0, abs(a), abs(b))


@settings(max_examples=400, deadline=None)
@given(scenario())
def test_conserva_momento_lineal_y_angular(s: Scenario) -> None:
    ba, bb, sa, sb = s.body_a, s.body_b, s.sa, s.sb
    r = planar_impact(ba, sa, bb, sb, s.point, s.normal, restitution=s.e, friction=s.mu)
    assert r.b_after is not None
    p0 = linear_momentum(ba, sa)
    q0 = linear_momentum(bb, sb)
    p1 = linear_momentum(ba, r.a_after)
    q1 = linear_momentum(bb, r.b_after)
    assert _rel(p0[0] + q0[0], p1[0] + q1[0]) < 1e-9
    assert _rel(p0[1] + q0[1], p1[1] + q1[1]) < 1e-9
    origin = (0.0, 0.0)
    l0 = angular_momentum_about(ba, sa, origin) + angular_momentum_about(bb, sb, origin)
    l1 = angular_momentum_about(ba, r.a_after, origin) + angular_momentum_about(
        bb, r.b_after, origin
    )
    assert _rel(l0, l1) < 1e-9


@settings(max_examples=400, deadline=None)
@given(scenario())
def test_energia_no_aumenta(s: Scenario) -> None:
    ba, bb, sa, sb = s.body_a, s.body_b, s.sa, s.sb
    r = planar_impact(ba, sa, bb, sb, s.point, s.normal, restitution=s.e, friction=s.mu)
    assert r.b_after is not None
    ke0 = kinetic_energy(ba, sa) + kinetic_energy(bb, sb)
    ke1 = kinetic_energy(ba, r.a_after) + kinetic_energy(bb, r.b_after)
    assert ke1 <= ke0 * (1 + 1e-9) + 1e-6
    assert r.energy_loss >= 0
    assert r.friction_used <= s.mu


@settings(max_examples=200, deadline=None)
@given(scenario())
def test_simetria_al_intercambiar_vehiculos(s: Scenario) -> None:
    ba, bb, sa, sb = s.body_a, s.body_b, s.sa, s.sb
    n = s.normal
    r1 = planar_impact(ba, sa, bb, sb, s.point, n, restitution=s.e, friction=s.mu)
    r2 = planar_impact(bb, sb, ba, sa, s.point, (-n[0], -n[1]), restitution=s.e, friction=s.mu)
    assert r2.b_after is not None
    assert math.isclose(r1.a_after.vx, r2.b_after.vx, rel_tol=1e-9, abs_tol=1e-9)
    assert math.isclose(r1.a_after.vy, r2.b_after.vy, rel_tol=1e-9, abs_tol=1e-9)
    assert math.isclose(r1.a_after.yaw_rate, r2.b_after.yaw_rate, rel_tol=1e-9, abs_tol=1e-9)
    assert math.isclose(r1.delta_v_a, r2.delta_v_b, rel_tol=1e-9, abs_tol=1e-9)


def test_choque_central_en_linea_coincide_con_la_solucion_cerrada() -> None:
    ba = Body2D.from_dimensions(1200, 4.4, 1.7)
    bb = Body2D.from_dimensions(1800, 5.2, 1.9)
    for e in (0.0, 0.1, 0.5, 1.0):
        sa = State2D(x=-2.2, vx=15.0)
        sb = State2D(x=2.6, yaw=math.pi, vx=-5.0)  # B de frente a A
        r = planar_impact(
            ba, sa, bb, sb, point=(0.0, 0.0), normal=(1.0, 0.0), restitution=e, friction=0.3
        )
        assert r.b_after is not None
        va2, vb2 = central_collision_1d(1200, 15.0, 1800, -5.0, e)
        assert math.isclose(r.a_after.vx, va2, rel_tol=1e-12, abs_tol=1e-12)
        assert math.isclose(r.b_after.vx, vb2, rel_tol=1e-12, abs_tol=1e-12)
        assert abs(r.a_after.vy) < 1e-12
        assert abs(r.a_after.yaw_rate) < 1e-12
        assert math.isclose(r.delta_v_a, abs(15.0 - va2), rel_tol=1e-12)
        assert math.isclose(r.delta_v_b, abs(-5.0 - vb2), rel_tol=1e-12)
        assert math.isclose(r.pdof_a_deg, 0.0, abs_tol=1e-9)
        assert math.isclose(r.pdof_b_deg, 0.0, abs_tol=1e-9)


def test_barrera_rigida_delta_v_es_v_por_uno_mas_e() -> None:
    ba = Body2D.from_dimensions(1500, 4.5, 1.8)
    for e in (0.0, 0.1, 0.25):
        sa = State2D(x=-2.25, vx=13.9)  # 50 km/h
        r = planar_impact(
            ba, sa, None, None, point=(0.0, 0.0), normal=(1.0, 0.0), restitution=e, friction=0.0
        )
        assert r.b_after is None
        assert math.isclose(r.delta_v_a, 13.9 * (1 + e), rel_tol=1e-12)
        assert math.isclose(r.a_after.vx, -13.9 * e, rel_tol=1e-12, abs_tol=1e-12)
        assert r.energy_loss >= 0


def test_sin_acercamiento_no_hay_impulso() -> None:
    ba = Body2D.from_dimensions(1000, 4, 1.7)
    bb = Body2D.from_dimensions(1000, 4, 1.7)
    r = planar_impact(ba, State2D(vx=5), bb, State2D(x=5, vx=8), point=(2.5, 0), normal=(1, 0))
    assert r.impulse == (0.0, 0.0)
    assert r.delta_v_a == 0.0


def test_pdof_lateral_derecho_son_las_tres() -> None:
    ba = Body2D.from_dimensions(1200, 4.4, 1.7)  # A apunta al este
    bb = Body2D.from_dimensions(1200, 4.4, 1.7)
    # B viene desde el sur (la derecha de A) hacia el norte y golpea el costado derecho de A.
    sa = State2D(x=0, y=0, yaw=0, vx=0)
    sb = State2D(x=0, y=-3.0, yaw=math.pi / 2, vx=0, vy=10)
    r = planar_impact(
        ba, sa, bb, sb, point=(0, -0.85), normal=(0, -1), restitution=0.1, friction=0.0
    )
    assert math.isclose(pdof_hours(r.pdof_a_deg), 3.0, abs_tol=1e-9)
    assert math.isclose(pdof_hours(r.pdof_b_deg), 0.0, abs_tol=1e-9)


def test_pdof_hours_envuelve() -> None:
    assert pdof_hours(0) == 0.0
    assert pdof_hours(90) == 3.0
    assert pdof_hours(180) == 6.0
    assert pdof_hours(270) == 9.0
    assert pdof_hours(360) == 0.0
