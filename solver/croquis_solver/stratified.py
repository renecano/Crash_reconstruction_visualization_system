"""Muestreo estratificado por hipercubo latino (T3.1, ADR 0100).

Los rangos del solver (Monte Carlo e inversión) salen de pocas muestras (64 y 12) sorteadas con la
semilla de la escena; con sorteos independientes, el p10 y el p90 se movían decenas de km/h entre
semillas (`eval/results/axa_semillas.json`). Con un hipercubo latino cada dimensión (cada sorteo que
hace una muestra, en orden) se reparte en `n` estratos iguales y cada muestra cae en un estrato
distinto: la cobertura del rango no depende de la suerte de la semilla.

- La permutación de estratos de cada dimensión sale de `random.shuffle` (CPython: `_randbelow`
  por `getrandbits`, que `PyRandom` reproduce en TS) y la posición dentro del estrato de
  `random()`, de un generador con **semilla de diseño fija** (`DESIGN_SEED`, más el tamaño del
  hipercubo): el diseño es cuasialeatorio y no depende de la semilla de la escena, así el rango
  no se mueve entre corridas (con el hipercubo sorteado por la semilla de la escena, el p10 y el p90
  de V2 en AXA aún se movían 6–7 km/h entre 20 semillas).
- `uniform(a, b)` es `a + (b - a) * u`; `gauss(mu, sigma)` es `mu + sigma * Φ⁻¹(u)` con la
  inversa de la normal de Acklam sobre `dmath.log` (la misma en TS).
- Cuántas dimensiones tiene una muestra se cuenta con `CountingDraws` en una pasada seca.

Es la referencia; `packages/solver-ts/src/stratified.ts` es el port (paridad E7).
"""

from __future__ import annotations

import math
import random
from collections.abc import Callable
from typing import Protocol

from croquis_solver import dmath


class Draws(Protocol):
    """Lo que `perturbed` y Monte Carlo piden de su fuente de sorteos."""

    def uniform(self, a: float, b: float) -> float: ...

    def gauss(self, mu: float, sigma: float) -> float: ...


class CountingDraws:
    """Cuenta los sorteos de una pasada seca (devuelve el centro de cada uno)."""

    def __init__(self) -> None:
        self.count = 0

    def uniform(self, a: float, b: float) -> float:
        self.count += 1
        return (a + b) / 2.0

    def gauss(self, mu: float, sigma: float) -> float:  # noqa: ARG002
        self.count += 1
        return mu


# Coeficientes de Acklam (2000) para la inversa de la normal estándar; error relativo < 1.15e-9.
_A = (
    -3.969683028665376e01,
    2.209460984245205e02,
    -2.759285104469687e02,
    1.383577518672690e02,
    -3.066479806614716e01,
    2.506628277459239e00,
)
_B = (
    -5.447609879822406e01,
    1.615858368580409e02,
    -1.556989798598866e02,
    6.680131188771972e01,
    -1.328068155288572e01,
)
_C = (
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e00,
    -2.549732539343734e00,
    4.374664141464968e00,
    2.938163982698783e00,
)
_D = (
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e00,
    3.754408661907416e00,
)
_P_LOW = 0.02425
_P_MIN = 1e-12


def norm_ppf(p: float) -> float:
    """Inversa de la normal estándar (Acklam), con `p` recortado a [1e-12, 1 - 1e-12]."""
    p = min(1.0 - _P_MIN, max(_P_MIN, p))
    if p < _P_LOW:
        q = math.sqrt(-2.0 * dmath.log(p))
        return (((((_C[0] * q + _C[1]) * q + _C[2]) * q + _C[3]) * q + _C[4]) * q + _C[5]) / (
            (((_D[0] * q + _D[1]) * q + _D[2]) * q + _D[3]) * q + 1.0
        )
    if p > 1.0 - _P_LOW:
        q = math.sqrt(-2.0 * dmath.log(1.0 - p))
        return -(((((_C[0] * q + _C[1]) * q + _C[2]) * q + _C[3]) * q + _C[4]) * q + _C[5]) / (
            (((_D[0] * q + _D[1]) * q + _D[2]) * q + _D[3]) * q + 1.0
        )
    q = p - 0.5
    r = q * q
    return (
        (((((_A[0] * r + _A[1]) * r + _A[2]) * r + _A[3]) * r + _A[4]) * r + _A[5])
        * q
        / (((((_B[0] * r + _B[1]) * r + _B[2]) * r + _B[3]) * r + _B[4]) * r + 1.0)
    )


class StratifiedDraws:
    """Una fila del hipercubo: devuelve sus `u` en el orden en que la muestra los pide."""

    def __init__(self, row: list[float]) -> None:
        self._row = row
        self._k = 0

    def _next(self) -> float:
        if self._k >= len(self._row):
            msg = f"La muestra pidió más sorteos ({self._k + 1}) que dimensiones ({len(self._row)})"
            raise IndexError(msg)
        u = self._row[self._k]
        self._k += 1
        return u

    def uniform(self, a: float, b: float) -> float:
        return a + (b - a) * self._next()

    def gauss(self, mu: float, sigma: float) -> float:
        return mu + sigma * norm_ppf(self._next())


# Semilla del diseño (fija a propósito, ADR 0100): el hipercubo depende solo de su tamaño.
DESIGN_SEED = 20261103


def design_rng(samples: int, dims: int) -> random.Random:
    return dmath.Random(DESIGN_SEED + samples * 1009 + dims)


class LatinHypercube:
    """`samples` filas × `dims` columnas: en cada columna, un estrato distinto por fila."""

    def __init__(self, samples: int, dims: int, rng: random.Random | None = None) -> None:
        rng = design_rng(samples, dims) if rng is None else rng
        self.samples = samples
        self.dims = dims
        self.u: list[list[float]] = [[0.0] * dims for _ in range(samples)]
        for d in range(dims):
            perm = list(range(samples))
            rng.shuffle(perm)
            for i in range(samples):
                self.u[i][d] = (perm[i] + rng.random()) / samples

    def sample(self, i: int) -> StratifiedDraws:
        return StratifiedDraws(self.u[i])


def count_draws(draw: Callable[[Draws], object]) -> int:
    """Cuántos sorteos hace `draw` (pasada seca con `CountingDraws`)."""
    c = CountingDraws()
    draw(c)
    return c.count
