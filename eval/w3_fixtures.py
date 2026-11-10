"""Arma las escenas de paridad de C1 (W3). Son sintéticas: prueban que Python y TS hacen lo mismo,
no reproducen un dictamen.

**`fixtures/inversion/lateral_puntos_paso.json`.** La colisión lateral canónica
(`lateral_interseccion`) sin su posición final declarada. En su lugar lleva lo que el perito marca
en la escena fácil:

- dos puntos de paso con hora por vehículo, tomados de la reconstrucción con las velocidades
  «verdaderas» (55 y 35 km/h), a un cuarto y a tres cuartos del tramo posterior al impacto;
- el punto inicial del choque, donde esa reconstrucción pone el contacto, con la fuente del perito.

La escena arranca con las velocidades del relato: la inversión tiene que acercarse a las
verdaderas y pasar por los puntos dentro de su precisión (0.5 m).

**`fixtures/c1/alcance_muro.json`.** El alcance canónico con un muro que el perito marcó en el
camino del vehículo golpeado, a media distancia de su tramo posterior, y su choque intermedio
(`impacto_vehiculo_objeto` después del primero). Su reconstrucción de referencia va en
`fixtures/c1/resultados/alcance_muro.json`.

    uv run python eval/w3_fixtures.py
    uv run croquis-solver reconstruct --all   # escribe el resultado de la inversión
"""

from __future__ import annotations

import copy
import json
import math
from pathlib import Path
from typing import Any

from croquis_scene_schema import load_fixture
from croquis_solver import inversion as inv
from croquis_solver.reconstruct import reconstruct

FIXTURES = Path(__file__).resolve().parents[1] / "packages" / "scene-schema" / "fixtures"
PUNTOS_PASO = FIXTURES / "inversion" / "lateral_puntos_paso.json"
C1 = FIXTURES / "c1"
VERDAD_KMH = (55.0, 35.0)
PRECISION_M = 0.5
DEL_PERITO = {"fuente": "usuario", "confianza": 0.9}


def armar_puntos_paso() -> dict[str, Any]:
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


def _m(valor: float) -> dict[str, Any]:
    return {"valor": valor, "unidad": "m", "fuente": "usuario", "confianza": 0.9}


def armar_muro() -> dict[str, Any]:
    spec: dict[str, Any] = copy.deepcopy(load_fixture("alcance"))
    spec["meta"]["id"] = "fx-alcance-muro"
    spec["meta"]["titulo"] = "Alcance con un choque intermedio contra un muro marcado (C1, W3)"
    r = reconstruct(spec)
    golpeado = max(r.vehiculos, key=lambda v: v.distance_post_m)
    tr = golpeado.trajectory
    despues = [k for k, t in enumerate(tr.t) if t > 0.0]
    k = despues[len(despues) // 2]
    rumbo = math.degrees(tr.yaw[k])
    spec["entorno"].setdefault("objetos", []).append(
        {
            "id": "muro-1",
            "tipo": "muro",
            "posicion": {"x": round(tr.x[k], 2), "y": round(tr.y[k], 2)},
            # A lo largo del muro: perpendicular al avance del vehículo.
            "rumbo_deg": round(rumbo + 90.0, 1),
            "largo": _m(6.0),
            "ancho": _m(0.2),
            "alto": _m(2.5),
            "procedencia": dict(DEL_PERITO),
        }
    )
    spec["eventos"].append(
        {
            "id": "ev-muro",
            "orden": max(int(e["orden"]) for e in spec["eventos"]) + 1,
            "tipo": "impacto_vehiculo_objeto",
            "actores": [golpeado.id, "muro-1"],
            "procedencia": dict(DEL_PERITO),
        }
    )
    return spec


def _escribir(ruta: Path, doc: dict[str, Any], *, compacto: bool = False) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    texto = (
        json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
        if compacto
        else json.dumps(doc, ensure_ascii=False, indent=2)
    )
    ruta.write_text(texto + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    _escribir(PUNTOS_PASO, armar_puntos_paso())
    muro = armar_muro()
    _escribir(C1 / "alcance_muro.json", muro)
    _escribir(C1 / "resultados" / "alcance_muro.json", reconstruct(muro).to_dict(), compacto=True)
