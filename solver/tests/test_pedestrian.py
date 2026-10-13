from __future__ import annotations

import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_solver.models import G
from croquis_solver.pedestrian import (
    contact_zones,
    searle_max_angle_deg,
    searle_range,
    searle_speed,
    searle_throw,
    vehicle_speed_range_from_throw,
    wood_speed,
)

throw = st.floats(min_value=0.5, max_value=60, allow_nan=False)
mu = st.floats(min_value=0.3, max_value=1.0, allow_nan=False)
h = st.floats(min_value=0.0, max_value=1.2, allow_nan=False)
angle_frac = st.floats(min_value=0.0, max_value=1.0, allow_nan=False)


@settings(max_examples=300, deadline=None)
@given(throw, mu, h, angle_frac)
def test_cotas_de_searle_acotan_toda_velocidad_de_lanzamiento(
    d: float, m: float, hh: float, frac: float
) -> None:
    th = frac * searle_max_angle_deg(m)
    r = searle_range(d, m, hh)
    v = searle_speed(d, m, th, hh)
    assert r.v_min <= v + 1e-9
    assert v <= r.v_max + 1e-9
    assert math.isclose(searle_speed(d, m, 0.0, hh), r.v_max, rel_tol=1e-12)
    assert math.isclose(searle_speed(d, m, r.theta_min_deg, hh), r.v_min, rel_tol=1e-12)


@settings(max_examples=200, deadline=None)
@given(throw, mu, h, angle_frac)
def test_searle_ida_y_vuelta(d: float, m: float, hh: float, frac: float) -> None:
    th = frac * searle_max_angle_deg(m)
    v = searle_speed(d, m, th, hh)
    assert math.isclose(searle_throw(v, m, th, hh), d, rel_tol=1e-9, abs_tol=1e-9)


def test_valores_conocidos_de_searle() -> None:
    # 20 m de lanzamiento sobre asfalto (μ = 0.66), sin altura: v_max = √(2·0.66·g·20)
    r = searle_range(20.0, 0.66)
    assert math.isclose(r.v_max, math.sqrt(2 * 0.66 * G * 20))
    assert math.isclose(r.v_min, r.v_max / math.sqrt(1 + 0.66**2))
    assert 13 < r.v_min * 3.6 < 60  # km/h plausibles
    assert r.v_max * 3.6 < 60


def test_wood_corrige_por_masas_y_altura() -> None:
    v_light = wood_speed(20.0, 0.66, 1.0, 1000.0, 75.0)
    v_heavy = wood_speed(20.0, 0.66, 1.0, 3000.0, 75.0)
    assert v_light > v_heavy  # un vehículo ligero debía ir más rápido para lanzar igual de lejos
    assert wood_speed(0.3, 0.66, 1.0, 1000.0, 75.0) == 0.0  # distancia menor que μ·h


def test_rango_de_velocidad_del_vehiculo_crece_con_factor_menor() -> None:
    r = vehicle_speed_range_from_throw(12.0, 0.66, 1.0, (0.8, 1.0))
    s = searle_range(12.0, 0.66, 1.0)
    assert math.isclose(r.v_min, s.v_min)
    assert math.isclose(r.v_max, s.v_max / 0.8)
    with pytest.raises(ValueError):
        vehicle_speed_range_from_throw(12.0, 0.66, 1.0, (1.2, 0.8))
    with pytest.raises(ValueError):
        searle_range(-1.0, 0.66)


def test_zonas_de_contacto_por_altura_y_estatura() -> None:
    sedan = contact_zones(
        stature_m=1.70, bumper_height_m=0.48, hood_edge_height_m=0.78, hood_length_m=1.0
    )
    assert sedan.bumper_on_body == "rodilla"
    assert sedan.hood_edge_on_body == "cadera"
    assert sedan.head_contact == "parabrisas"
    suv = contact_zones(
        stature_m=1.20, bumper_height_m=0.62, hood_edge_height_m=1.05, hood_length_m=1.3
    )
    assert suv.bumper_on_body in {"muslo", "cadera"}
    assert suv.head_contact == "cofre"
    assert contact_zones(1.7, 0.48, 0.78, 1.0, wad_factor=0.4).head_contact == "ninguno"
