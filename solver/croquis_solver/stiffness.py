"""Coeficientes de rigidez CRASH3 por clase de vehículo y zona.

La tabla ``data/stiffness_classes.json`` la escribe la evaluación E2 (``croquis-eval e2-barrier``)
a partir de pruebas frontales contra barrera rígida de NHTSA. Mientras una clase o zona no tenga
datos, se usa el respaldo genérico marcado ``supuesto`` y el resultado lo informa.
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from typing import Any

from croquis_solver import dmath
from croquis_solver.crash3 import Stiffness

DATA_PATH = Path(__file__).resolve().parent / "data" / "stiffness_classes.json"

# Respaldo genérico: orden de magnitud de un sedán mediano (kgf/cm y kgf/cm²); E2 lo sustituye.
FALLBACK = Stiffness.from_kgf_cm(55.0, 36.0)
ZONAS = ("frontal", "trasera", "lateral")
# Sin pruebas para la zona: la pendiente b1 del respaldo se escala por s ∈ [0.7, 1.4] (log-uniforme;
# supuesto) y con ella A·s y B·s², lo que mueve la energía entre ~0.5 y ~2 veces.
FALLBACK_SLOPE_RANGE = (0.7, 1.4)


def _no_samples() -> tuple[Stiffness, ...]:
    return ()


@dataclass(frozen=True)
class StiffnessEntry:
    stiffness: Stiffness
    origen: str  # "nhtsa" | "supuesto"
    n_tests: int
    nota: str = ""
    # Coeficientes (A, B) de cada prueba de la clase: se muestrean juntos (bootstrap).
    samples: tuple[Stiffness, ...] = field(default_factory=_no_samples)


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
        pairs: list[list[float]] = entry.get("muestras_ab", [])
        return StiffnessEntry(
            Stiffness(float(entry["a_n_m"]), float(entry["b_n_m2"])),
            str(entry.get("origen", "nhtsa")),
            int(entry.get("n_tests", 0)),
            str(entry.get("nota", "")),
            tuple(Stiffness(float(a), float(b)) for a, b in pairs),
        )
    return StiffnessEntry(
        FALLBACK,
        "supuesto",
        0,
        f"Sin coeficientes medidos para {clase}/{zona}; se usa el respaldo genérico.",
    )


def sample_stiffness(entry: StiffnessEntry, rng: random.Random, n: int) -> list[Stiffness]:
    """`n` coeficientes plausibles para la clase: bootstrap de sus pruebas o, sin pruebas, el
    respaldo con la pendiente escalada en `FALLBACK_SLOPE_RANGE`."""
    if entry.samples:
        return [entry.samples[rng.randrange(len(entry.samples))] for _ in range(n)]
    lo, hi = (dmath.log(x) for x in FALLBACK_SLOPE_RANGE)
    out: list[Stiffness] = []
    for _ in range(n):
        s = dmath.exp(rng.uniform(lo, hi))
        out.append(Stiffness(entry.stiffness.a * s, entry.stiffness.b * s * s))
    return out


def zona_from_cdc_side(lado: str) -> str:
    return {"F": "frontal", "B": "trasera", "L": "lateral", "R": "lateral"}.get(lado, "frontal")
