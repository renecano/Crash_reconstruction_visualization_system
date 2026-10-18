"""E5, diagnóstico de desarrollo (ADR 0033): la convención de energía entre E2 y el solver.

E2 calibró A y B de cada clase con la energía de CRASH3, ½ m ΔV² con ΔV = v (1 + e). El solver
reparte la energía disipada contra una barrera rígida, ½ m v² (1 − e²). Este script mide, solo en
las pruebas frontales de barrera rígida de **desarrollo** de E5, cuánto cambia el aplastamiento
medio predicho (perfil uniforme sobre el ancho del vehículo, como la zona D) con cada convención,
en la población de E2 (modelos ≥ 1995, 40–65 km/h) y fuera de ella.

Uso: ``uv run croquis-eval e5-energia`` → ``eval/results/e5_convencion_energia.json``.
"""

from __future__ import annotations

import statistics
from pathlib import Path
from typing import Any

from croquis_eval.e2_barrier import MIN_MODEL_YEAR, RESTITUTION, SPEED_RANGE_KMH
from croquis_eval.e5_casos import Caso, nhtsa_cases
from croquis_eval.e5_particion import is_test
from croquis_eval.results import write_result
from croquis_solver.crash3 import TRIANGULAR_SHAPES, profile_for_energy
from croquis_solver.stiffness import stiffness_for


def _valid(c: Caso) -> bool:
    return (
        c.obstaculo == "barrera_rigida"
        and c.velocidad_kmh is not None
        and c.velocidad_kmh > 0
        and c.masa_kg > 0
        and c.ancho_m is not None
        and 1.2 <= c.ancho_m <= 3.0
        and all(0 <= x <= 2 for x in c.perfil_m)
    )


def _crush(energy_j: float, clase: str, width_m: float) -> float:
    k = stiffness_for(clase, "frontal").stiffness
    return profile_for_energy(energy_j, width_m, k, TRIANGULAR_SHAPES["uniforme"])[0]


def bias_rows(cases: list[Caso]) -> list[dict[str, Any]]:
    """Por caso: aplastamiento medio medido y predicho con cada convención (m)."""
    e = RESTITUTION
    rows: list[dict[str, Any]] = []
    for c in cases:
        v = (c.velocidad_kmh or 0.0) / 3.6
        w = c.ancho_m or 0.0
        rows.append(
            {
                "anio": c.anio or 0,
                "v_kmh": c.velocidad_kmh,
                "medido": statistics.fmean(c.perfil_m),
                "disipada": _crush(0.5 * c.masa_kg * v * v * (1 - e * e), c.clase, w),
                "crash3": _crush(0.5 * c.masa_kg * (v * (1 + e)) ** 2, c.clase, w),
            }
        )
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"n": 0}

    def bias(key: str) -> float:
        return round(statistics.median(r[key] - r["medido"] for r in rows) * 100, 1)

    return {
        "n": len(rows),
        "medido_medio_cm": round(statistics.median(r["medido"] for r in rows) * 100, 1),
        "sesgo_disipada_cm": bias("disipada"),
        "sesgo_crash3_cm": bias("crash3"),
    }


def main(out_dir: Path | None = None) -> Path:
    cases = [c for c in nhtsa_cases() if c.tipo == "frontal" and not is_test(c) and _valid(c)]
    rows = bias_rows(cases)
    lo, hi = SPEED_RANGE_KMH

    def in_e2(r: dict[str, Any]) -> bool:
        return r["anio"] >= MIN_MODEL_YEAR and lo <= r["v_kmh"] <= hi

    payload = {
        "descripcion": "E5, diagnóstico de desarrollo (ADR 0033): mediana de (aplastamiento "
        "medio predicho − medido) en pruebas frontales de barrera rígida de NHTSA, perfil uniforme "
        "sobre el ancho del vehículo, con la energía disipada del solver y con la de CRASH3 con la "
        "que E2 calibró la rigidez.",
        "particion": "desarrollo",
        "restitucion": RESTITUTION,
        "grupos": {
            "todos": summarize(rows),
            "poblacion_e2": summarize([r for r in rows if in_e2(r)]),
            "anteriores_a_1995": summarize([r for r in rows if 0 < r["anio"] < MIN_MODEL_YEAR]),
        },
    }
    if out_dir is None:
        return write_result("e5_convencion_energia", payload)
    return write_result("e5_convencion_energia", payload, results_dir=out_dir)
