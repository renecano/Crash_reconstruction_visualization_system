"""Energía de deformación con el modelo CRASH3 (fuerza lineal por unidad de ancho: F/w = A + B·C).

Perfil de aplastamiento de N puntos (6 en la convención CRASH3) sobre el ancho dañado. Energía:

    E = w_seg · Σ_i [ A (C_i + C_{i+1}) / 2 + B (C_i² + C_i C_{i+1} + C_{i+1}²) / 6 + G ],
    con G = A² / (2B)

con w_seg = ancho / (N − 1). El factor (1 + tan²θ) corrige la energía cuando la fuerza principal
forma un ángulo θ con la normal a la superficie dañada. Unidades SI: A en N/m, B en N/m², C en m.
Referencias: CRASH3 Technical Manual (NHTSA); Campbell 1974; docs/physics.md.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from croquis_solver.models import G as GRAVITY

KGF_PER_CM_TO_N_PER_M = GRAVITY * 100.0
KGF_PER_CM2_TO_N_PER_M2 = GRAVITY * 10_000.0


@dataclass(frozen=True)
class Stiffness:
    """Coeficientes A (N/m) y B (N/m²); G = A²/(2B) en N."""

    a: float
    b: float

    def __post_init__(self) -> None:
        if self.a < 0 or self.b <= 0:
            msg = "A debe ser ≥ 0 y B > 0"
            raise ValueError(msg)

    @property
    def g(self) -> float:
        return self.a * self.a / (2.0 * self.b)

    @classmethod
    def from_kgf_cm(cls, a_kgf_cm: float, b_kgf_cm2: float) -> Stiffness:
        """Convierte los coeficientes en las unidades tradicionales (kgf/cm, kgf/cm²)."""
        return cls(a_kgf_cm * KGF_PER_CM_TO_N_PER_M, b_kgf_cm2 * KGF_PER_CM2_TO_N_PER_M2)

    @classmethod
    def from_b0_b1(cls, mass_kg: float, width_m: float, b0_ms: float, b1_per_s: float) -> Stiffness:
        """A = m b0 b1 / w, B = m b1² / w (b0 en m/s: velocidad sin daño permanente; b1 en 1/s)."""
        return cls(mass_kg * b0_ms * b1_per_s / width_m, mass_kg * b1_per_s * b1_per_s / width_m)


def angle_factor(pdof_offset_deg: float, cap_deg: float = 45.0) -> float:
    """Corrección (1 + tan²θ) acotada a `cap_deg`."""
    th = math.radians(min(abs(pdof_offset_deg), cap_deg))
    return 1.0 + math.tan(th) ** 2


def crush_energy(
    profile_m: Sequence[float], width_m: float, k: Stiffness, pdof_offset_deg: float = 0.0
) -> float:
    """Energía absorbida (J) por un perfil de aplastamiento de N ≥ 2 puntos equiespaciados."""
    n = len(profile_m)
    if n < 2:
        msg = "El perfil necesita al menos dos puntos"
        raise ValueError(msg)
    if width_m <= 0:
        msg = "El ancho dañado debe ser positivo"
        raise ValueError(msg)
    if any(c < 0 for c in profile_m):
        msg = "Las profundidades no pueden ser negativas"
        raise ValueError(msg)
    w = width_m / (n - 1)
    total = 0.0
    for i in range(n - 1):
        c1, c2 = profile_m[i], profile_m[i + 1]
        total += k.a * (c1 + c2) / 2.0 + k.b * (c1 * c1 + c1 * c2 + c2 * c2) / 6.0 + k.g
    return total * w * angle_factor(pdof_offset_deg)


def uniform_crush_energy(depth_m: float, width_m: float, k: Stiffness) -> float:
    """Caso cerrado: perfil uniforme ⇒ E = w (A C + B C²/2 + G)."""
    return width_m * (k.a * depth_m + 0.5 * k.b * depth_m * depth_m + k.g)


def uniform_crush_for_energy(energy_j: float, width_m: float, k: Stiffness) -> float:
    """Profundidad uniforme que absorbe `energy_j`; 0 si la energía no supera el umbral G·w."""
    e_w = energy_j / width_m
    if e_w <= k.g:
        return 0.0
    return (-k.a + math.sqrt(k.a * k.a + 2.0 * k.b * (e_w - k.g))) / k.b


def profile_for_energy(
    energy_j: float,
    width_m: float,
    k: Stiffness,
    shape: Sequence[float] | None = None,
    pdof_offset_deg: float = 0.0,
    tol: float = 1e-9,
) -> list[float]:
    """Perfil con la forma `shape` (pesos en [0, 1]; 6 puntos uniformes por defecto) escalado
    para absorber exactamente `energy_j`."""
    weights = list(shape) if shape is not None else [1.0] * 6
    if max(weights) <= 0:
        msg = "La forma necesita al menos un peso positivo"
        raise ValueError(msg)
    weights = [w / max(weights) for w in weights]
    if energy_j <= crush_energy([0.0] * len(weights), width_m, k, pdof_offset_deg):
        return [0.0] * len(weights)
    lo, hi = 0.0, 1.0
    while crush_energy([hi * w for w in weights], width_m, k, pdof_offset_deg) < energy_j:
        hi *= 2.0
        if hi > 1e3:
            msg = "No converge: energía fuera de rango"
            raise ValueError(msg)
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if crush_energy([mid * w for w in weights], width_m, k, pdof_offset_deg) < energy_j:
            lo = mid
        else:
            hi = mid
        if hi - lo < tol:
            break
    c_max = 0.5 * (lo + hi)
    return [c_max * w for w in weights]


def ebs(energy_j: float, mass_kg: float) -> float:
    """Velocidad equivalente contra barrera (m/s): ½ m v² = E."""
    return math.sqrt(2.0 * energy_j / mass_kg)


def delta_v_pair(energy_total_j: float, m1: float, m2: float) -> tuple[float, float]:
    """ΔV de cada vehículo a partir de la energía total absorbida por ambos.

    Usa conservación de momento: m1·ΔV1 = m2·ΔV2.
    """
    dv1 = math.sqrt(2.0 * energy_total_j * m2 / (m1 * (m1 + m2)))
    return dv1, dv1 * m1 / m2


def delta_v_barrier(energy_j: float, mass_kg: float, restitution: float = 0.0) -> float:
    """ΔV contra barrera fija a partir de la energía absorbida (EBS) y la restitución."""
    return (
        ebs(energy_j, mass_kg) * (1.0 + restitution) / math.sqrt(1.0 - restitution * restitution)
        if restitution < 1
        else float("inf")
    )


TRIANGULAR_SHAPES: dict[str, list[float]] = {
    "uniforme": [1, 1, 1, 1, 1, 1],
    "izquierda": [1.0, 0.8, 0.6, 0.4, 0.2, 0.05],
    "derecha": [0.05, 0.2, 0.4, 0.6, 0.8, 1.0],
    "centro": [0.2, 0.6, 1.0, 1.0, 0.6, 0.2],
    "poste": [0.05, 0.3, 1.0, 1.0, 0.3, 0.05],
}
