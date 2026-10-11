import math

from hypothesis import given
from hypothesis import strategies as st

from croquis_solver.units import deg_to_rad, kmh_to_ms, ms_to_kmh, rad_to_deg


def test_valores_conocidos() -> None:
    assert math.isclose(kmh_to_ms(36), 10, rel_tol=1e-12)
    assert math.isclose(ms_to_kmh(10), 36, rel_tol=1e-12)
    assert math.isclose(deg_to_rad(180), math.pi, rel_tol=1e-15)


@given(st.floats(min_value=0, max_value=400, allow_nan=False))
def test_ida_y_vuelta_velocidad(v: float) -> None:
    assert math.isclose(ms_to_kmh(kmh_to_ms(v)), v, rel_tol=1e-9, abs_tol=1e-9)


@given(st.floats(min_value=-720, max_value=720, allow_nan=False))
def test_ida_y_vuelta_angulo(d: float) -> None:
    assert math.isclose(rad_to_deg(deg_to_rad(d)), d, rel_tol=1e-9, abs_tol=1e-9)
