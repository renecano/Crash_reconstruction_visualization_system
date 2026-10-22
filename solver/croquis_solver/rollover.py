"""Criterio de inicio de volcadura por tropiezo (PLAN §6.1.6).

Un vehículo que se desliza de lado a velocidad v y tropieza con las llantas (guarnición, borde de
terreno) gira alrededor de la línea de contacto. Conservando el momento angular respecto a ese
punto en el tropiezo impulsivo,

    m v h = I_p ω,      I_p = I_cg + m (h² + (T/2)²),

y exigiendo que la energía de rotación alcance para subir el centro de masa sobre el punto de
giro, ½ I_p ω² ≥ m g Δz con Δz = √(h² + (T/2)²) − h = h(√(1 + SSF²) − 1), sale la velocidad
crítica de deslizamiento (CSV, la que usó NHTSA en su investigación de volcaduras junto con el
factor de estabilidad estática SSF = T / 2h):

    v_crit = √(2 g Δz I_p / (m h²)).

La altura del centro de masa y el momento de inercia de alabeo no vienen en el relato: se toman
como supuestos documentados (h = 0.37 × alto; I_cg de una caja homogénea de ancho × alto). La
secuencia de vueltas en 3D la simula el visor con Rapier desde estas condiciones iniciales y se
etiqueta como ilustrativa.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from croquis_solver import dmath
from croquis_solver.models import G

CG_HEIGHT_FRACTION = 0.37  # supuesto: h ≈ 0.37 × alto (SSF típico 1.0–1.5 según la clase)


@dataclass(frozen=True)
class RolloverCheck:
    ssf: float
    cg_height_m: float
    track_m: float
    critical_speed: float  # m/s
    lateral_speed: float  # m/s, componente hacia el lado del tropiezo
    roll_rate: float  # rad/s justo después del tropiezo
    starts: bool
    side: str  # "derecho" | "izquierdo"

    def to_dict(self) -> dict[str, object]:
        return {
            "inicia": self.starts,
            "lado_tropiezo": self.side,
            "velocidad_lateral_kmh": round(self.lateral_speed * 3.6, 6),
            "velocidad_critica_kmh": round(self.critical_speed * 3.6, 6),
            "ssf": round(self.ssf, 6),
            "altura_cg_m": round(self.cg_height_m, 6),
            "via_m": round(self.track_m, 6),
            "velocidad_alabeo_rad_s": round(self.roll_rate, 6),
        }


def roll_inertia_ratio(width: float, height: float) -> float:
    """I_cg / m de una caja homogénea de ancho × alto (radio de giro al cuadrado)."""
    return (width * width + height * height) / 12.0


def critical_sliding_velocity(track: float, cg_height: float, k2: float) -> float:
    """Velocidad lateral mínima para que el tropiezo voltee al vehículo (m/s)."""
    if track <= 0 or cg_height <= 0 or k2 < 0:
        msg = "Vía, altura del CG e inercia deben ser positivas"
        raise ValueError(msg)
    half = 0.5 * track
    dz = dmath.hypot(cg_height, half) - cg_height
    ip = k2 + cg_height * cg_height + half * half
    return math.sqrt(2.0 * G * dz * ip / (cg_height * cg_height))


def trip_check(
    track: float, width: float, height: float, lateral_speed: float, side: str
) -> RolloverCheck:
    h = CG_HEIGHT_FRACTION * height
    k2 = roll_inertia_ratio(width, height)
    v_c = critical_sliding_velocity(track, h, k2)
    ip = k2 + h * h + 0.25 * track * track
    omega = max(lateral_speed, 0.0) * h / ip
    return RolloverCheck(
        ssf=track / (2.0 * h),
        cg_height_m=h,
        track_m=track,
        critical_speed=v_c,
        lateral_speed=max(lateral_speed, 0.0),
        roll_rate=omega,
        starts=lateral_speed >= v_c,
        side=side,
    )
