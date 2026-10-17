"""Medidas de las calles del mapa (``lugar.red_vial``, ADR 0023): referencia de
``packages/scene-schema/src/red-vial.ts``. Fuente única: ``red_vial.json``."""

from __future__ import annotations

import json
import math
from functools import cache
from itertools import pairwise
from pathlib import Path
from typing import Any

RED_VIAL_PATH = Path(__file__).resolve().parents[2] / "red_vial.json"


@cache
def defaults() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(RED_VIAL_PATH.read_text(encoding="utf-8"))
    return data


def via_width_m(via: dict[str, Any], lane_m: float | None = None) -> float:
    """Ancho de la calzada (m): ``width`` de OSM; si no, carriles × ancho de carril."""
    if via.get("ancho_m") is not None:
        return float(via["ancho_m"])
    d = defaults()
    tipo = str(via["tipo"]).removesuffix("_link")
    lanes = via.get("carriles") or d["carriles_por_tipo"].get(tipo, 2)
    return float(lanes) * (lane_m if lane_m is not None else float(d["ancho_carril_m"]))


def _segment_distance(
    p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]
) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) if l2 > 0 else 0.0
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def outside_red_vial_m(
    p: tuple[float, float], vias: list[dict[str, Any]], lane_m: float | None = None
) -> float:
    """Cuánto queda el punto fuera de la calzada del mapa (m); 0 o negativo es estar sobre ella."""
    best = math.inf
    for v in vias:
        half = via_width_m(v, lane_m) / 2
        pts = [(float(q["x"]), float(q["y"])) for q in v["puntos"]]
        for a, b in pairwise(pts):
            best = min(best, _segment_distance(p, a, b) - half)
    return best
