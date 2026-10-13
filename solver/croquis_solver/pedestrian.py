"""Proyección de peatones y ciclistas: distancia de lanzamiento ↔ velocidad.

Searle (SAE 831622, 1983; SAE 930659, 1993): un cuerpo lanzado con velocidad v y ángulo θ que
cae desde una altura h y desliza con fricción μ hasta detenerse a distancia D cumple

    v(θ) = √(2 μ g (D + μ h)) / (cos θ + μ sin θ)

El mínimo sobre θ (tan θ = μ) y el máximo (θ = 0) acotan la velocidad de lanzamiento para
ángulos de lanzamiento en [0, 2·atan μ] (los físicamente plausibles; fuera de ese dominio la
fórmula crece de nuevo porque se desperdicia energía hacia arriba):
    v_min = √(2 μ g (D + μ h) / (1 + μ²)),   v_max = √(2 μ g (D + μ h)).

Wood (1988), según lo reproduce Spinu et al. 2018 (IOP Conf. Ser. 444 072017, ec. 2), corrige por
las masas del vehículo y el peatón: v = √(2 μ g (D − μ h)) · (m_v + m_p) / m_v.

La velocidad del vehículo se relaciona con la de lanzamiento del peatón por un factor de
proyección (≈ 1 en proyección frontal, menor en trayectorias de envolvimiento); se expone como
parámetro con rango y se marca como supuesto hasta calibrarlo con E4.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from croquis_solver.models import G


@dataclass(frozen=True)
class ThrowSpeedRange:
    v_min: float  # m/s
    v_max: float  # m/s
    theta_min_deg: float  # ángulo que da la velocidad mínima

    def contains(self, v: float, tol: float = 1e-9) -> bool:
        return self.v_min - tol <= v <= self.v_max + tol


def searle_speed(
    throw_m: float, mu: float, launch_angle_deg: float, cg_height_m: float = 0.0
) -> float:
    """Velocidad de lanzamiento para un ángulo dado (ecuación de Searle)."""
    _check(throw_m, mu)
    th = math.radians(launch_angle_deg)
    denom = math.cos(th) + mu * math.sin(th)
    if denom <= 0:
        msg = "Ángulo de lanzamiento fuera del dominio"
        raise ValueError(msg)
    return math.sqrt(2.0 * mu * G * (throw_m + mu * cg_height_m)) / denom


def searle_range(throw_m: float, mu: float, cg_height_m: float = 0.0) -> ThrowSpeedRange:
    """Cotas mínima y máxima de la velocidad de lanzamiento (Searle)."""
    _check(throw_m, mu)
    base = 2.0 * mu * G * (throw_m + mu * cg_height_m)
    return ThrowSpeedRange(
        v_min=math.sqrt(base / (1.0 + mu * mu)),
        v_max=math.sqrt(base),
        theta_min_deg=math.degrees(math.atan(mu)),
    )


def searle_max_angle_deg(mu: float) -> float:
    """Límite superior del dominio de ángulos en el que v_max = v(0): 2·atan μ."""
    return math.degrees(2.0 * math.atan(mu))


def searle_throw(
    v_launch: float, mu: float, launch_angle_deg: float, cg_height_m: float = 0.0
) -> float:
    """Inversa: distancia de lanzamiento para una velocidad y ángulo dados."""
    if v_launch < 0:
        msg = "La velocidad no puede ser negativa"
        raise ValueError(msg)
    th = math.radians(launch_angle_deg)
    denom = math.cos(th) + mu * math.sin(th)
    d = (v_launch * denom) ** 2 / (2.0 * mu * G) - mu * cg_height_m
    return max(d, 0.0)


def wood_speed(
    throw_m: float, mu: float, cg_height_m: float, vehicle_mass_kg: float, pedestrian_mass_kg: float
) -> float:
    """Velocidad del vehículo según Wood (1988) con corrección de masas."""
    _check(throw_m, mu)
    inner = throw_m - mu * cg_height_m
    if inner <= 0:
        return 0.0
    return (
        math.sqrt(2.0 * mu * G * inner) * (vehicle_mass_kg + pedestrian_mass_kg) / vehicle_mass_kg
    )


def vehicle_speed_range_from_throw(
    throw_m: float,
    mu: float,
    cg_height_m: float = 1.0,
    projection_factor: tuple[float, float] = (0.8, 1.0),
) -> ThrowSpeedRange:
    """Rango de velocidad del vehículo: cotas de Searle divididas por el factor de proyección."""
    r = searle_range(throw_m, mu, cg_height_m)
    lo_f, hi_f = projection_factor
    if not 0 < lo_f <= hi_f <= 1.5:
        msg = "Factor de proyección inválido"
        raise ValueError(msg)
    return ThrowSpeedRange(
        v_min=r.v_min / hi_f, v_max=r.v_max / lo_f, theta_min_deg=r.theta_min_deg
    )


@dataclass(frozen=True)
class ContactZones:
    """Puntos de contacto probables entre el frente del vehículo y un peatón de pie."""

    bumper_on_body: str  # "pierna" | "rodilla" | "muslo" | "cadera"
    hood_edge_on_body: str | None
    head_contact: str  # "cofre" | "parabrisas" | "techo" | "ninguno"
    wrap_around_distance_m: float


def contact_zones(
    stature_m: float,
    bumper_height_m: float,
    hood_edge_height_m: float,
    hood_length_m: float,
    wad_factor: float = 1.08,
) -> ContactZones:
    """Asigna contactos por altura (defensa, borde de cofre) y por envolvimiento (cabeza).

    La distancia de envolvimiento (WAD) de la cabeza se aproxima como `wad_factor × estatura`
    (≈ 1.03–1.1 en la literatura de impacto a peatones); es una aproximación documentada en
    docs/physics.md que F5 calibra con el ragdoll.
    """
    if stature_m <= 0:
        msg = "La estatura debe ser positiva"
        raise ValueError(msg)
    knee, hip = 0.28 * stature_m, 0.53 * stature_m
    if bumper_height_m < knee * 0.85:
        bumper = "pierna"
    elif bumper_height_m < knee * 1.25:
        bumper = "rodilla"
    elif bumper_height_m < hip:
        bumper = "muslo"
    else:
        bumper = "cadera"
    hood_edge = None
    if hood_edge_height_m > bumper_height_m:
        hood_edge = "cadera" if hood_edge_height_m < 0.6 * stature_m else "abdomen"
    wad = wad_factor * stature_m
    along = (
        hood_edge_height_m - bumper_height_m
    ) + bumper_height_m  # borde de cofre medido desde el suelo
    if wad <= along:
        head = "ninguno"
    elif wad - along <= hood_length_m:
        head = "cofre"
    elif wad - along <= hood_length_m + 1.2:
        head = "parabrisas"
    else:
        head = "techo"
    return ContactZones(bumper, hood_edge, head, wad)


def _check(throw_m: float, mu: float) -> None:
    if throw_m < 0:
        msg = "La distancia de lanzamiento no puede ser negativa"
        raise ValueError(msg)
    if not 0 < mu <= 1.5:
        msg = "Fricción cuerpo–suelo fuera de rango"
        raise ValueError(msg)
