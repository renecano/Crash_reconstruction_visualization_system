"""Traslape de contornos después del impacto (comentario de René, 2026-10-24).

Para cada escena (las canónicas y AXA de `demo/escenas-r11/axa.json`), la distancia mínima entre
los contornos de cada par de vehículos desde `T_DESDE_S` hasta que todos quedan en reposo, en la
rejilla de salida de la reconstrucción. Dos contornos por vehículo:

* **caja:** el rectángulo largo × ancho sin deformar;
* **deformado:** la caja con la cara dañada hundida su aplastamiento máximo (`deformed_extents`),
  el contorno que usa el contacto secundario del después del impacto (ADR 0063).

Distancia negativa = traslape (la profundidad de penetración por el eje de menor traslape).

    uv run croquis-eval contornos → eval/results/contornos.json
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from croquis_eval.results import write_result
from croquis_scene_schema import list_fixtures, load_fixture
from croquis_solver import dmath
from croquis_solver.postimpact import box_corners, box_penetration, deformed_extents
from croquis_solver.reconstruct import VehicleOutcome, reconstruct

RAIZ = Path(__file__).resolve().parents[2]
AXA = RAIZ / "demo" / "escenas-r11" / "axa.json"
T_DESDE_S = 0.04
Vec = tuple[float, float]


def _pose(v: VehicleOutcome, t: float) -> tuple[float, float, float]:
    """Pose en t: interpolada entre muestras; antes de la primera o después de la última, esa."""
    tr = v.trajectory
    ts = tr.t
    if t <= ts[0]:
        return tr.x[0], tr.y[0], tr.yaw[0]
    if t >= ts[-1]:
        return tr.x[-1], tr.y[-1], tr.yaw[-1]
    lo, hi = 0, len(ts) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if ts[mid] <= t:
            lo = mid
        else:
            hi = mid
    f = (t - ts[lo]) / (ts[hi] - ts[lo]) if ts[hi] > ts[lo] else 0.0
    dyaw = math.atan2(math.sin(tr.yaw[hi] - tr.yaw[lo]), math.cos(tr.yaw[hi] - tr.yaw[lo]))
    return (
        tr.x[lo] + f * (tr.x[hi] - tr.x[lo]),
        tr.y[lo] + f * (tr.y[hi] - tr.y[lo]),
        tr.yaw[lo] + f * dyaw,
    )


def _face(v: VehicleOutcome) -> str:
    return str((v.cdc or {}).get("lado", "F"))


def _corners(v: VehicleOutcome, t: float, deformed: bool) -> list[Vec]:
    x, y, yaw = _pose(v, t)
    crush = max([0.0, *v.crush_profile_m]) if deformed else 0.0
    return box_corners(x, y, yaw, deformed_extents(v.length, v.width, crush, _face(v)))


def _point_segment(p: Vec, a: Vec, b: Vec) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    den = dx * dx + dy * dy
    u = 0.0 if den == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den))
    return dmath.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy))


def distancia(a: list[Vec], b: list[Vec]) -> float:
    """Distancia entre dos contornos convexos; negativa si se traslapan (su penetración)."""
    depth, _ = box_penetration(a, b)
    if depth > 0:
        return -depth
    return min(
        _point_segment(p, other[i], other[(i + 1) % len(other)])
        for poly, other in ((a, b), (b, a))
        for p in poly
        for i in range(len(other))
    )


def medir(spec: dict[str, Any]) -> dict[str, Any]:
    rec = reconstruct(spec)
    vs = rec.vehiculos
    t_fin = max(v.trajectory.t[-1] for v in vs)
    n = math.floor((t_fin - T_DESDE_S) / rec.dt + 1e-9)
    times = [T_DESDE_S + k * rec.dt for k in range(n + 1)] + [t_fin + rec.dt]
    pares: list[dict[str, Any]] = []
    for i, a in enumerate(vs):
        for b in vs[i + 1 :]:
            out: dict[str, Any] = {"vehiculos": [a.id, b.id]}
            # Tras cada impacto entre los dos (el primero en t = 0 y los de una carambola), sus
            # contornos tienen T_DESDE_S para separarse.
            impactos = [0.0] + [
                e.t
                for e in rec.eventos
                if e.tipo == "impacto_vehiculo_vehiculo" and {a.id, b.id} <= set(e.actores)
            ]
            ventanas = [(t0, t0 + T_DESDE_S) for t0 in impactos]
            for clave, deformed in (("caja", False), ("deformado", True)):
                best = (math.inf, 0.0)
                for t in times:
                    if any(lo <= t < hi - 1e-9 for lo, hi in ventanas):
                        continue
                    d = distancia(_corners(a, t, deformed), _corners(b, t, deformed))
                    if d < best[0]:
                        best = (d, t)
                reposo = distancia(
                    _corners(a, t_fin + 1, deformed), _corners(b, t_fin + 1, deformed)
                )
                out[clave] = {
                    "distancia_minima_m": round(best[0], 4),
                    "en_t_s": round(best[1], 3),
                    "en_reposo_m": round(reposo, 4),
                }
            pares.append(out)
    return {"t_reposo_s": round(t_fin, 3), "pares": pares}


def run() -> Path:
    escenas: dict[str, Any] = {}
    for name in list_fixtures():
        escenas[name] = medir(load_fixture(name))
    escenas["axa"] = medir(json.loads(AXA.read_text(encoding="utf-8")))
    traslapes = {
        clave: sorted(
            name
            for name, e in escenas.items()
            if any(p[clave]["distancia_minima_m"] < 0 for p in e["pares"])
        )
        for clave in ("caja", "deformado")
    }
    doc = {
        "descripcion": (
            "Distancia mínima entre contornos de cada par de vehículos desde "
            f"{T_DESDE_S} s después del impacto hasta el reposo (negativa = traslape)."
        ),
        "t_desde_s": T_DESDE_S,
        "escenas_con_traslape": traslapes,
        "escenas": escenas,
    }
    return write_result("contornos", doc)
