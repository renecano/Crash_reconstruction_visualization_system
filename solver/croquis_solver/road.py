"""Modelo de la vía compartido con el croquis 2D y el visor (`packages/croquis-2d/src/layout.ts`).

Convenciones (ADR 0006):

* Recta, intersecciones, carretera sin radio: eje recto sobre +X que pasa por el origen.
* Curva (`tipo_via = curva`, o carretera/autopista con `radio_curva`): arco de radio R con centro
  en (0, −R); en el origen la vía es tangente a +X. Para quien avanza hacia +X es una curva a la
  derecha; para quien avanza hacia −X, a la izquierda.
* Glorieta: anillo con centro en (0, R + W/2), donde R es el radio del eje del anillo y W su
  ancho; el borde exterior pasa por el origen (la entrada sur). Se circula en sentido antihorario.

`lane_following_path` da la trayectoria que sigue el carril para un vehículo en una pose: un arco
concéntrico al eje de la vía, en el sentido que coincide con su rumbo declarado.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from croquis_solver import dmath
from croquis_solver.preimpact import CurvedLanePath, Path, StraightPath

DEFAULT_CURVE_RADIUS_M = 25.0
CURVED_ROAD_TYPES = {"carretera_dos_carriles", "autopista"}

_LEN = {"m": 1.0, "cm": 0.01, "mm": 0.001, "km": 1000.0}


@dataclass(frozen=True)
class RoadAxis:
    kind: str  # "recta" | "arco" | "anillo"
    center: tuple[float, float]
    radius: float  # radio del eje (m); 0 en recta
    width: float  # ancho de la calzada principal (m)


def _len(campo: dict[str, Any] | None, default: float) -> float:
    if not campo:
        return default
    return float(campo["valor"]) * _LEN.get(str(campo.get("unidad", "m")), 1.0)


def main_width(lugar: dict[str, Any]) -> float:
    """Ancho de la calzada principal, igual que `roadLayout` en el croquis."""
    lane = _len(lugar.get("ancho_carril"), 3.5)
    lanes = max(1, int(lugar["carriles_por_sentido"]["valor"]))
    dos = lugar["sentidos"]["valor"] == "doble_sentido"
    camellon_campo: dict[str, Any] = lugar.get("camellon") or {}
    camellon = bool(camellon_campo.get("valor", False))
    median = _len(lugar.get("ancho_camellon"), 1.5) if camellon else 0.0
    return lane * lanes * (2 if dos else 1) + median


def secondary_width(lugar: dict[str, Any]) -> float:
    """Ancho de la vía secundaria (norte-sur) en intersecciones, igual que `roadLayout`."""
    lane = _len(lugar.get("ancho_carril"), 3.5)
    lanes_main = max(1, int(lugar["carriles_por_sentido"]["valor"]))
    sec: dict[str, Any] = lugar.get("carriles_por_sentido_secundaria") or {}
    lanes = max(1, int(sec.get("valor", lanes_main)))
    dos = lugar["sentidos"]["valor"] == "doble_sentido"
    return lane * lanes * (2 if dos else 1)


def road_axis(lugar: dict[str, Any]) -> RoadAxis:
    tipo = str(lugar["tipo_via"]["valor"])
    width = main_width(lugar)
    has_radius = lugar.get("radio_curva") is not None
    radius = _len(lugar.get("radio_curva"), DEFAULT_CURVE_RADIUS_M)
    if tipo == "glorieta":
        return RoadAxis("anillo", (0.0, radius + width / 2), radius, width)
    if tipo == "curva" or (tipo in CURVED_ROAD_TYPES and has_radius):
        r = max(radius, width)
        return RoadAxis("arco", (0.0, -r), r, width)
    return RoadAxis("recta", (0.0, 0.0), 0.0, width)


def lane_following_path(
    axis: RoadAxis,
    pose: tuple[float, float, float],
    *,
    length: float = 400.0,
    lateral: float = 0.0,
    change_length: float = 40.0,
) -> Path | None:
    """Trayectoria que sigue el carril desde `pose`; None si la vía es recta (no aplica)."""
    if axis.kind == "recta":
        return None
    x, y, yaw = pose
    cx, cy = axis.center
    r0 = dmath.hypot(x - cx, y - cy)
    if r0 < 1.0:
        return None
    phi0 = dmath.atan2(y - cy, x - cx)
    # Tangente antihoraria en la pose: perpendicular al radio, girada +90°.
    ccw_tangent = (-dmath.sin(phi0), dmath.cos(phi0))
    ccw = dmath.cos(yaw) * ccw_tangent[0] + dmath.sin(yaw) * ccw_tangent[1] >= 0
    if axis.kind == "anillo":
        ccw = True
    return CurvedLanePath(
        (cx, cy), r0, phi0, ccw, length, lateral=lateral, change_length=change_length
    )


def straight_from(pose: tuple[float, float, float], length: float = 500.0) -> Path:
    x, y, yaw = pose
    return StraightPath((x, y), yaw, length)
