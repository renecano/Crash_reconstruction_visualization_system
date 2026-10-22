"""Impacto contra objetos fijos: barrera plana rígida, objeto estrecho (poste/árbol) y objetos
que ceden.

* Barrera rígida plana: ΔV = v (1 + e); energía absorbida E = ½ m v² (1 − e²); perfil CRASH3
  uniforme sobre el ancho dañado.
* Objeto estrecho: la energía se concentra en un ancho dañado L = min(ancho, D + 2 C_max tan α),
  con α el ángulo de propagación del daño (≈ 45°, aproximación habitual en reconstrucción); como
  C_max depende de L, se itera. Perfil con la forma "poste" de CRASH3.
* Objeto que cede (poste de madera o árbol delgado): absorbe una fracción de la energía y el
  vehículo continúa con la velocidad restante. La fracción es un supuesto documentado hasta E5.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from croquis_solver import dmath
from croquis_solver.crash3 import TRIANGULAR_SHAPES, Stiffness, crush_energy, profile_for_energy
from croquis_solver.models import Body2D

SPREAD_ANGLE_DEG = 45.0
RIGID_DIAMETER_M = 0.25  # árboles/postes de madera con diámetro mayor se tratan como rígidos
YIELDING_FRACTION = (
    0.3  # fracción de energía que absorbe un objeto que cede (supuesto; rango 0.1–0.5)
)


@dataclass(frozen=True)
class FixedObjectResult:
    delta_v: float  # m/s
    v_after: float  # m/s (0 si se detiene)
    energy_absorbed_vehicle: float  # J (deformación del vehículo)
    energy_absorbed_object: float  # J
    damage_width: float  # m
    profile: list[float]  # m, 6 puntos
    max_crush: float  # m
    rigid: bool


def rigid_barrier(
    body: Body2D,
    v_impact: float,
    k: Stiffness,
    *,
    restitution: float = 0.1,
    damage_width: float | None = None,
) -> FixedObjectResult:
    """Impacto frontal pleno contra barrera plana rígida."""
    if v_impact < 0:
        msg = "La velocidad de impacto no puede ser negativa"
        raise ValueError(msg)
    w = damage_width if damage_width is not None else body.width
    energy = 0.5 * body.mass * (v_impact * v_impact) * (1.0 - restitution * restitution)
    profile = profile_for_energy(energy, w, k, TRIANGULAR_SHAPES["uniforme"])
    return FixedObjectResult(
        delta_v=v_impact * (1.0 + restitution),
        v_after=v_impact * restitution,
        energy_absorbed_vehicle=energy,
        energy_absorbed_object=0.0,
        damage_width=w,
        profile=profile,
        max_crush=max(profile),
        rigid=True,
    )


def is_rigid(material: str, diameter_m: float) -> bool:
    if material in {"concreto", "metal", "mamposteria"}:
        return True
    return diameter_m >= RIGID_DIAMETER_M


def narrow_object(
    body: Body2D,
    v_impact: float,
    k: Stiffness,
    *,
    diameter_m: float,
    material: str = "concreto",
    restitution: float = 0.05,
    yielding_fraction: float = YIELDING_FRACTION,
    spread_angle_deg: float = SPREAD_ANGLE_DEG,
    max_iter: int = 60,
) -> FixedObjectResult:
    """Impacto contra poste o árbol

    Si el objeto cede, el vehículo conserva parte de la velocidad.
    """
    if v_impact < 0 or diameter_m <= 0:
        msg = "Velocidad no negativa y diámetro positivo"
        raise ValueError(msg)
    rigid = is_rigid(material, diameter_m)
    kinetic = 0.5 * body.mass * (v_impact * v_impact)
    if rigid:
        e_vehicle = kinetic * (1.0 - restitution * restitution)
        e_object = 0.0
        v_after = v_impact * restitution
        delta_v = v_impact * (1.0 + restitution)
    else:
        e_object = yielding_fraction * kinetic
        # El vehículo se deforma con la energía que no se lleva el objeto, con un límite: no más
        # lo que absorbería contra un objeto rígido.
        e_vehicle = (1.0 - yielding_fraction) * kinetic * 0.5
        remaining = max(kinetic - e_object - e_vehicle, 0.0)
        v_after = math.sqrt(2.0 * remaining / body.mass)
        delta_v = v_impact - v_after
    tan_a = dmath.tan(math.radians(spread_angle_deg))
    width = min(body.width, max(diameter_m, 0.3 * body.width))
    profile = profile_for_energy(e_vehicle, width, k, TRIANGULAR_SHAPES["poste"])
    for _ in range(max_iter):
        new_width = min(body.width, diameter_m + 2.0 * max(profile) * tan_a)
        if abs(new_width - width) < 1e-6:
            break
        width = new_width
        profile = profile_for_energy(e_vehicle, width, k, TRIANGULAR_SHAPES["poste"])
    # Por debajo del umbral de deformación permanente (G·ancho, ~b0) el perfil es cero: la
    # energía se absorbe de forma elástica y no deja aplastamiento.
    below_threshold = max(profile) == 0.0 and e_vehicle <= crush_energy(profile, width, k)
    assert below_threshold or math.isclose(crush_energy(profile, width, k), e_vehicle, rel_tol=1e-6)
    return FixedObjectResult(
        delta_v=delta_v,
        v_after=v_after,
        energy_absorbed_vehicle=e_vehicle,
        energy_absorbed_object=e_object,
        damage_width=width,
        profile=profile,
        max_crush=max(profile),
        rigid=rigid,
    )
