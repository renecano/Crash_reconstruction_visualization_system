"""Conversión de unidades.

Internamente todo es SI (m, s, kg, rad). La interfaz muestra km/h y metros.
Debe coincidir bit a bit con ``packages/solver-ts/src/units.ts`` (paridad E7).
"""

import math

KMH_PER_MS = 3.6


def kmh_to_ms(kmh: float) -> float:
    """km/h → m/s."""
    return kmh / KMH_PER_MS


def ms_to_kmh(ms: float) -> float:
    """m/s → km/h."""
    return ms * KMH_PER_MS


def deg_to_rad(deg: float) -> float:
    """grados → radianes."""
    return deg * math.pi / 180


def rad_to_deg(rad: float) -> float:
    """radianes → grados."""
    return rad * 180 / math.pi
