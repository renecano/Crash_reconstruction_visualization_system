"""Tabla de fricción y parámetros humanos con rango, nominal y fuente (``data/friction.json``)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

import numpy as np

DATA_PATH = Path(__file__).resolve().parent / "data" / "friction.json"

# Después del impacto caen y se deslizan de lado (ADR 0017). La bicicleta sigue con el modelo de
# llantas: no hay medición de su arrastre caída.
DOWNED_SLIDE_CLASSES = frozenset({"motocicleta", "scooter"})


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


def zone_friction(tipo: str, estado: str) -> RangedValue:
    """Coeficiente llanta–suelo de una zona del terreno (C3) según su tipo y el estado del lugar.

    Los tipos de la vía usan su fila de la tabla. La grava es la grava suelta de la terracería, el
    lodo es su lodo y la tierra es la terracería en el estado del lugar. El pasto solo tiene
    medición en seco y en mojado: con grava suelta vale el seco y, con cualquier otro estado, el
    mojado.
    """
    if tipo == "grava":
        return tire_friction("terraceria", "grava_suelta")
    if tipo == "lodo":
        return tire_friction("terraceria", "lodo")
    if tipo == "tierra":
        return tire_friction("terraceria", estado)
    if tipo == "pasto":
        return tire_friction("pasto", "seco" if estado in {"seco", "grava_suelta"} else "mojado")
    return tire_friction(tipo, estado)


def zone_ranges(lugar: dict[str, Any]) -> list[tuple[int, float, float, str]]:
    """(índice de la zona, mínimo, máximo, de dónde sale) de la fricción de cada zona del terreno:
    el rango que declara la zona; si no, ±5 % si la fijó el perito, o el de la tabla para su tipo
    y el estado del lugar. Es lo que muestrean el Monte Carlo y la inversión."""
    out: list[tuple[int, float, float, str]] = []
    terreno: dict[str, Any] = lugar.get("terreno") or {}
    for k, z in enumerate(terreno.get("superficies", [])):
        fz: dict[str, Any] = z["friccion"]
        if fz.get("rango"):
            lo, hi = (float(x) for x in fz["rango"])
            out.append((k, lo, hi, "rango declarado de la zona"))
        elif fz.get("fuente") == "usuario":
            val = float(fz["valor"])
            out.append((k, val * 0.95, val * 1.05, "±5% (usuario)"))
        else:
            mu = zone_friction(str(z["tipo"]), str(lugar["estado_superficie"]["valor"]))
            out.append((k, mu.low, mu.high, f"tabla de fricción ({mu.fuente})"))
    return out


def pedestrian_friction(superficie: str) -> RangedValue:
    cuerpo: dict[str, Any] = _table()["cuerpo_peaton"]
    key = superficie if superficie in cuerpo else "otro"
    return _ranged(cuerpo[key])


def downed_motorcycle_friction(superficie: str) -> RangedValue:
    """Factor de arrastre de una motocicleta o scooter caído que se desliza de lado."""
    moto: dict[str, Any] = _table()["moto_caida"]
    return _ranged(
        moto[superficie] if superficie in moto and superficie != "_nota" else moto["otro"]
    )


def abs_peak_factor() -> RangedValue:
    return _ranged(_table()["abs"]["factor_pico_sobre_deslizamiento"])


def perception_reaction_time() -> RangedValue:
    return _ranged(_table()["percepcion_reaccion_s"])


def sources() -> dict[str, str]:
    s: dict[str, str] = _table()["fuentes"]
    return s
