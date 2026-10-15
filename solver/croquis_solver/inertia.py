"""Momento de inercia de guiñada por clase de vehículo.

La tabla ``data/yaw_inertia.json`` la escribe ``croquis-eval inercia-guinada`` desde la base de
parámetros inerciales de vehículos ligeros de NHTSA (VRTC; Heydinger et al., SAE 1999-01-1336): el
radio de giro de guiñada es proporcional al largo total, k = c·L, con c la mediana del grupo de
carrocería (auto, SUV, pickup, van). Las clases sin grupo (autobús, camiones, vehículos de dos
ruedas) usan la placa rectangular uniforme, marcada como supuesto.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

from croquis_solver.models import Body2D

DATA_PATH = Path(__file__).resolve().parent / "data" / "yaw_inertia.json"


@dataclass(frozen=True)
class YawInertia:
    value: float  # kg·m²
    origen: str  # "nhtsa" | "supuesto"
    radius_over_length: float | None = None


@cache
def _table() -> dict[str, Any]:
    if not DATA_PATH.exists():
        return {}
    data: dict[str, Any] = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return data


def yaw_inertia(clase: str, mass: float, length: float, width: float) -> YawInertia:
    """I_z = m·(c·L)² con c del grupo de la clase; sin grupo, la placa uniforme (supuesto)."""
    table = _table()
    group = table.get("clases", {}).get(clase)
    entry = table.get("grupos", {}).get(group) if group else None
    if entry:
        c = float(entry["c"])
        return YawInertia(mass * (c * length) ** 2, "nhtsa", c)
    return YawInertia(Body2D.box_inertia(mass, length, width), "supuesto")


def body_for(clase: str, mass: float, length: float, width: float) -> Body2D:
    """Cuerpo plano con la inercia de guiñada de su clase."""
    return Body2D(
        mass=mass, inertia=yaw_inertia(clase, mass, length, width).value, length=length, width=width
    )


__all__ = ["YawInertia", "body_for", "yaw_inertia"]
