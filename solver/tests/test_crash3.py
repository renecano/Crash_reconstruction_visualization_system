from __future__ import annotations

import math

from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_solver.crash3 import (
    TRIANGULAR_SHAPES,
    Stiffness,
    angle_factor,
    crush_energy,
    delta_v_pair,
    ebs,
    profile_for_energy,
    uniform_crush_energy,
    uniform_crush_for_energy,
)

K = Stiffness.from_kgf_cm(a_kgf_cm=55.0, b_kgf_cm2=36.0)  # orden de magnitud de un sedán (ver E2)
pos = st.floats(min_value=0, max_value=1.2, allow_nan=False, allow_infinity=False)


def test_conversion_de_unidades_tradicionales() -> None:
    k = Stiffness.from_kgf_cm(1.0, 1.0)
    assert math.isclose(k.a, 980.665)
    assert math.isclose(k.b, 98066.5)
    assert math.isclose(k.g, 980.665**2 / (2 * 98066.5))


@settings(max_examples=200, deadline=None)
@given(
    st.floats(min_value=0, max_value=1.5, allow_nan=False),
    st.floats(min_value=0.5, max_value=2.6, allow_nan=False),
)
def test_perfil_uniforme_coincide_con_la_formula_cerrada(c: float, w: float) -> None:
    assert math.isclose(crush_energy([c] * 6, w, K), uniform_crush_energy(c, w, K), rel_tol=1e-12)


@settings(max_examples=200, deadline=None)
@given(
    st.floats(min_value=1e3, max_value=5e5, allow_nan=False),
    st.floats(min_value=0.5, max_value=2.6, allow_nan=False),
)
def test_inversa_uniforme_recupera_la_energia(e: float, w: float) -> None:
    c = uniform_crush_for_energy(e, w, K)
    assert c >= 0
    if c > 0:
        assert math.isclose(uniform_crush_energy(c, w, K), e, rel_tol=1e-9)
    else:
        assert e <= K.g * w


@settings(max_examples=100, deadline=None)
@given(
    st.lists(pos, min_size=6, max_size=6), st.floats(min_value=0.8, max_value=2.4, allow_nan=False)
)
def test_energia_crece_con_el_aplastamiento(profile: list[float], w: float) -> None:
    e0 = crush_energy(profile, w, K)
    e1 = crush_energy([c + 0.05 for c in profile], w, K)
    assert e1 > e0


def test_perfil_con_forma_absorbe_la_energia_pedida() -> None:
    for name, shape in TRIANGULAR_SHAPES.items():
        prof = profile_for_energy(120_000.0, 1.6, K, shape)
        assert len(prof) == 6, name
        assert math.isclose(crush_energy(prof, 1.6, K), 120_000.0, rel_tol=1e-7), name
        assert max(prof) == prof[shape.index(max(shape))]


def test_energia_baja_da_perfil_cero() -> None:
    assert profile_for_energy(1.0, 1.6, K) == [0.0] * 6


def test_factor_de_angulo() -> None:
    assert angle_factor(0) == 1.0
    assert math.isclose(angle_factor(30), 1 + math.tan(math.radians(30)) ** 2)
    assert math.isclose(angle_factor(80), angle_factor(45))  # acotado


def test_ebs_y_delta_v_por_pareja() -> None:
    assert math.isclose(ebs(0.5 * 1500 * 10**2, 1500), 10.0)
    dv1, dv2 = delta_v_pair(200_000.0, 1000.0, 2000.0)
    # Conservación de momento: m1 dv1 = m2 dv2 y la energía total es la pedida.
    assert math.isclose(1000 * dv1, 2000 * dv2)
    assert math.isclose(0.5 * (1000 * 2000 / 3000) * (dv1 + dv2) ** 2, 200_000.0, rel_tol=1e-9)
