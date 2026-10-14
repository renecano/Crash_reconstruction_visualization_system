from __future__ import annotations

import math

from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_solver.crash3 import Stiffness, crush_energy
from croquis_solver.fixed_object import is_rigid, narrow_object, rigid_barrier
from croquis_solver.models import Body2D

CAR = Body2D.from_dimensions(1300.0, 4.5, 1.8)
K = Stiffness.from_kgf_cm(55.0, 36.0)
speed = st.floats(min_value=1, max_value=30, allow_nan=False)


@settings(max_examples=100, deadline=None)
@given(speed, st.floats(min_value=0, max_value=0.3, allow_nan=False))
def test_barrera_rigida_delta_v_y_energia(v: float, e: float) -> None:
    r = rigid_barrier(CAR, v, K, restitution=e)
    assert math.isclose(r.delta_v, v * (1 + e))
    assert math.isclose(r.energy_absorbed_vehicle, 0.5 * 1300 * v * v * (1 - e * e))
    assert (
        math.isclose(
            crush_energy(r.profile, r.damage_width, K), r.energy_absorbed_vehicle, rel_tol=1e-6
        )
        or r.max_crush == 0
    )
    assert len(set(r.profile)) == 1  # uniforme
    assert r.rigid


def test_mas_velocidad_mas_aplastamiento() -> None:
    assert rigid_barrier(CAR, 15.0, K).max_crush > rigid_barrier(CAR, 8.0, K).max_crush > 0


def test_poste_rigido_concentra_el_dano() -> None:
    r = narrow_object(CAR, 12.0, K, diameter_m=0.3, material="concreto")
    assert r.rigid
    assert r.damage_width < CAR.width
    assert r.damage_width >= 0.3
    assert r.profile[2] == r.max_crush
    assert r.profile[0] < r.max_crush
    assert math.isclose(
        crush_energy(r.profile, r.damage_width, K), r.energy_absorbed_vehicle, rel_tol=1e-6
    )
    # Igual energía que la barrera plana pero en menos ancho ⇒ más profundidad
    flat = rigid_barrier(CAR, 12.0, K, restitution=0.05)
    assert r.max_crush > flat.max_crush


def test_arbol_delgado_cede_y_el_auto_sigue() -> None:
    r = narrow_object(CAR, 12.0, K, diameter_m=0.12, material="vegetal")
    assert not r.rigid
    assert 0 < r.v_after < 12.0
    assert r.energy_absorbed_object > 0
    assert math.isclose(r.delta_v, 12.0 - r.v_after)
    assert is_rigid("vegetal", 0.4)
    assert not is_rigid("madera", 0.2)
    assert is_rigid("metal", 0.1)


@settings(max_examples=60, deadline=None)
@given(st.floats(min_value=0.0, max_value=30.0, allow_nan=False), st.floats(0.1, 1.0))
def test_poste_a_cualquier_velocidad_sin_fallar(v: float, diameter: float) -> None:
    # Regresión (F7): a baja energía no hay deformación permanente y el perfil es cero.
    r = narrow_object(CAR, v, K, diameter_m=diameter, material="concreto")
    assert r.max_crush >= 0.0
    if r.max_crush == 0.0:
        assert r.energy_absorbed_vehicle <= crush_energy(r.profile, r.damage_width, K)
