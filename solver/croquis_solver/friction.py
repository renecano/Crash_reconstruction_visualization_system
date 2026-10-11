"""Tabla de fricción y parámetros humanos con rango, nominal y fuente (``data/friction.json``)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

import numpy as np

DATA_PATH = Path(__file__).resolve().parent / "data" / "friction.json"


@dataclass(frozen=True)
class RangedValue:
    low: float
    high: float
    nominal: float
    fuente: str
    tipo: str

    def sample(self, rng: np.random.Generator) -> float:
        """Muestra uniforme dentro del rango (determinista con el generador recibido)."""
        return float(rng.uniform(self.low, self.high))

    def clamp(self, value: float) -> float:
        return min(self.high, max(self.low, value))


@cache
def _table() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return data


def _ranged(node: dict[str, Any]) -> RangedValue:
    lo, hi = node["rango"]
    return RangedValue(
        float(lo), float(hi), float(node["nominal"]), str(node["fuente"]), str(node["tipo"])
    )


def tire_friction(superficie: str, estado: str) -> RangedValue:
    """Coeficiente llanta–pavimento (llanta bloqueada) para la superficie y estado del contrato."""
    llanta: dict[str, dict[str, Any]] = _table()["llanta"]
    if superficie not in llanta:
        msg = f"Superficie desconocida: {superficie}"
        raise KeyError(msg)
    if estado not in llanta[superficie]:
        msg = f"Estado desconocido: {estado}"
        raise KeyError(msg)
    return _ranged(llanta[superficie][estado])


def pedestrian_friction(superficie: str) -> RangedValue:
    cuerpo: dict[str, Any] = _table()["cuerpo_peaton"]
    key = superficie if superficie in cuerpo else "otro"
    return _ranged(cuerpo[key])


def abs_peak_factor() -> RangedValue:
    return _ranged(_table()["abs"]["factor_pico_sobre_deslizamiento"])


def perception_reaction_time() -> RangedValue:
    return _ranged(_table()["percepcion_reaccion_s"])


def sources() -> dict[str, str]:
    s: dict[str, str] = _table()["fuentes"]
    return s
