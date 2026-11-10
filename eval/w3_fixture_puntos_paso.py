"""Arma la escena de paridad de C1 (W3): `fixtures/inversion/lateral_puntos_paso.json`.

Es la colisión lateral canónica (`lateral_interseccion`) sin su posición final declarada. En su
lugar lleva lo que el perito marca en la escena fácil:

- dos puntos de paso con hora por vehículo, tomados de la reconstrucción con las velocidades
  «verdaderas» (55 y 35 km/h), a un cuarto y a tres cuartos del tramo posterior al impacto;
- el punto inicial del choque, donde esa reconstrucción pone el contacto, con la fuente del perito.

La escena arranca con las velocidades del relato: la inversión tiene que acercarse a las
verdaderas y pasar por los puntos dentro de su precisión (0.5 m). Es sintética: sirve para probar
que Python y TS hacen lo mismo, no reproduce un dictamen.

    uv run python eval/w3_fixture_puntos_paso.py
    uv run croquis-solver reconstruct --all   # escribe su resultado de referencia
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from croquis_scene_schema import load_fixture
from croquis_solver import inversion as inv
from croquis_solver.reconstruct import reconstruct

SALIDA = (
    Path(__file__).resolve().parents[1]
    / "packages"
    / "scene-schema"
    / "fixtures"
    / "inversion"
    / "lateral_puntos_paso.json"
)
VERDAD_KMH = (55.0, 35.0)
PRECISION_M = 0.5
DEL_PERITO = {"fuente": "usuario", "confianza": 0.9}


def armar() -> dict[str, Any]:
    spec: dict[str, Any] = copy.deepcopy(load_fixture("lateral_interseccion"))
    spec["meta"]["id"] = "fx-lateral-puntos-paso"
    spec["meta"]["titulo"] = "Inversión con puntos de paso y punto inicial marcados (C1, W3)"
    spec["evidencias"] = [e for e in spec["evidencias"] if e.get("tipo") != "posicion_final"]
    for v in spec["vehiculos"]:
        v.pop("posicion_final", None)
        v.pop("posicion_final_supuesta", None)
    moving = inv.moving_vehicles(spec)
    verdad = dict(zip(moving, VERDAD_KMH, strict=False))
    r = reconstruct(inv.with_speeds(spec, list(verdad), list(verdad.values())), dt=0.1)
    for k, vid in enumerate(moving):
        tr = next(v for v in r.vehiculos if v.id == vid).trajectory
        despues = [i for i, t in enumerate(tr.t) if t > 0.0]
        puntos: list[dict[str, Any]] = []
        for n, fraccion in enumerate((0.25, 0.75)):
            i = despues[int(len(despues) * fraccion)]
            puntos.append(
                {
                    "id": f"pp-{'ab'[k]}-{n + 1}",
                    "orden": n + 1,
                    "posicion": {"x": round(tr.x[i], 2), "y": round(tr.y[i], 2)},
                    "precision_m": PRECISION_M,
                    "t_s": round(tr.t[i], 2),
                    "procedencia": dict(DEL_PERITO),
                }
            )
        next(v for v in spec["vehiculos"] if v["id"] == vid)["puntos_paso"] = puntos
    evento = min(
        (e for e in spec["eventos"] if str(e["tipo"]).startswith("impacto")),
        key=lambda e: int(e["orden"]),
    )
    if r.punto_impacto is None:
        msg = "La reconstrucción no dio punto de impacto"
        raise RuntimeError(msg)
    evento["punto_impacto"] = {"x": round(r.punto_impacto[0], 2), "y": round(r.punto_impacto[1], 2)}
    evento["procedencia"] = dict(DEL_PERITO)
    return spec


if __name__ == "__main__":
    SALIDA.write_text(
        json.dumps(armar(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
