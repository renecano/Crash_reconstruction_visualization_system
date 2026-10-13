"""Coeficientes de rigidez CRASH3 por clase de vehículo y zona.

La tabla ``data/stiffness_classes.json`` la escribe la evaluación E2 (``croquis-eval e2-barrier``)
a partir de pruebas frontales contra barrera rígida de NHTSA. Mientras una clase o zona no tenga
datos, se usa el respaldo genérico marcado ``supuesto`` y el resultado lo informa.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

from croquis_solver.crash3 import Stiffness

DATA_PATH = Path(__file__).resolve().parent / "data" / "stiffness_classes.json"

# Respaldo genérico: orden de magnitud de un sedán mediano (kgf/cm y kgf/cm²); E2 lo sustituye.
FALLBACK = Stiffness.from_kgf_cm(55.0, 36.0)
ZONAS = ("frontal", "trasera", "lateral")


@dataclass(frozen=True)
class StiffnessEntry:
    stiffness: Stiffness
    origen: str  # "nhtsa" | "supuesto"
    n_tests: int
    nota: str = ""


@cache
def _table() -> dict[str, Any]:
    if not DATA_PATH.exists():
        return {}
    data: dict[str, Any] = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return data


def stiffness_for(clase: str, zona: str = "frontal") -> StiffnessEntry:
    """Rigidez para la clase y zona; respaldo `supuesto` si no hay datos."""
    if zona not in ZONAS:
        msg = f"Zona desconocida: {zona}"
        raise ValueError(msg)
    clases: dict[str, Any] = _table().get("clases", {})
    entry = clases.get(clase, {}).get(zona)
    if entry and entry.get("a_n_m") and entry.get("b_n_m2"):
        return StiffnessEntry(
            Stiffness(float(entry["a_n_m"]), float(entry["b_n_m2"])),
            str(entry.get("origen", "nhtsa")),
            int(entry.get("n_tests", 0)),
            str(entry.get("nota", "")),
        )
    return StiffnessEntry(
        FALLBACK,
        "supuesto",
        0,
        f"Sin coeficientes medidos para {clase}/{zona}; se usa el respaldo genérico.",
    )


def zona_from_cdc_side(lado: str) -> str:
    return {"F": "frontal", "B": "trasera", "L": "lateral", "R": "lateral"}.get(lado, "frontal")
