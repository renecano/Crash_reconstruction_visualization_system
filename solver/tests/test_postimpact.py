from __future__ import annotations

import math
from itertools import pairwise

from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_solver.models import Body2D, G, State2D, kinetic_energy
from croquis_solver.postimpact import STOP_SPEED, WheelConfig, integrate
from croquis_solver.preimpact import skid_distance

CAR = Body2D.from_dimensions(1300.0, 4.5, 1.8)
WHEELS = WheelConfig.four_wheels(wheelbase=2.6, track=1.55, cg_from_front_axle=1.15, locked=True)


@settings(max_examples=25, deadline=None)
@given(
    st.floats(min_value=2, max_value=30, allow_nan=False),
    st.floats(min_value=0.3, max_value=0.9, allow_nan=False),
)
def test_derrape_recto_coincide_con_la_formula_cerrada(v0: float, mu: float) -> None:
    res = integrate(CAR, State2D(vx=v0), WHEELS, mu)
    assert res.stopped
    expected = skid_distance(v0, mu * G)
    # El integrador declara reposo bajo STOP_SPEED: tolerancias acordes a ese umbral y al paso.
    assert math.isclose(res.distance, expected, rel_tol=0.01, abs_tol=0.05)
    assert math.isclose(
        res.duration, v0 / (mu * G), rel_tol=0.01, abs_tol=STOP_SPEED / (mu * G) + 0.005
    )
    assert abs(res.trajectory.last().y) < 1e-6  # no se desvía
    residual = 0.5 * CAR.mass * STOP_SPEED**2
    assert math.isclose(
        res.energy_dissipated, kinetic_energy(CAR, State2D(vx=v0)), abs_tol=residual + 1e-6
    )


def test_energia_cinetica_no_crece_durante_el_derrape() -> None:
    start = State2D(x=0, y=0, yaw=0.3, vx=12.0, vy=4.0, yaw_rate=1.5)
    res = integrate(CAR, start, WHEELS, 0.7)
    traj = res.trajectory
    ke = [kinetic_energy(CAR, traj.state(i)) for i in range(len(traj))]
    assert all(b <= a + 1e-6 for a, b in pairwise(ke))
    assert res.stopped
    assert abs(traj.last().yaw_rate) < 0.05


def test_giro_decae_y_el_auto_se_detiene() -> None:
    res = integrate(CAR, State2D(vx=8.0, vy=-6.0, yaw_rate=3.0), WHEELS, 0.6)
    assert res.stopped
    assert res.duration < 6.0
    yaw_rates = [abs(r) for r in res.trajectory.yaw_rate]
    assert yaw_rates[-1] < yaw_rates[0]


def test_llantas_rodando_recorren_mas_que_bloqueadas() -> None:
    rolling = WheelConfig.four_wheels(2.6, 1.55, 1.15, locked=False)
    r_lock = integrate(CAR, State2D(vx=10.0), WHEELS, 0.7, t_max=60)
    r_roll = integrate(CAR, State2D(vx=10.0), rolling, 0.7, t_max=60)
    assert r_roll.distance > 3 * r_lock.distance


def test_determinismo_bit_a_bit() -> None:
    start = State2D(x=1, y=2, yaw=0.4, vx=9.0, vy=-2.0, yaw_rate=-1.0, t=0.3)
    a = integrate(CAR, start, WHEELS, 0.65)
    b = integrate(CAR, start, WHEELS, 0.65)
    assert a.trajectory.x == b.trajectory.x
    assert a.trajectory.yaw == b.trajectory.yaw
    assert a.trajectory.t[0] == 0.3


def test_configuracion_de_llantas_valida() -> None:
    w = WheelConfig.four_wheels(2.6, 1.55, 1.1)
    assert math.isclose(sum(w.load_fractions), 1.0)
    assert w.load_fractions[0] > w.load_fractions[2]  # CG adelante ⇒ más carga adelante
