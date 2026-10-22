"""Vectores de referencia de `linalg` y `lsq` para el port TS (ADR 0027, paridad E7).

Genera matrices y problemas de mínimos cuadrados con semilla fija y guarda los resultados de la
referencia Python en ``packages/solver-ts/fixtures/numerics.json``. La prueba del port
(`numerics.test.ts`) recalcula todo y exige igualdad bit a bit. ``--check`` falla si el archivo no
está al día (CI).

Uso: ``uv run croquis-solver numerics [--check]``.
"""

from __future__ import annotations

import json
import random
import statistics
from pathlib import Path
from typing import Any

from croquis_solver import dmath, linalg
from croquis_solver.lsq import least_squares_soft_l1

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages" / "solver-ts" / "fixtures" / "numerics.json"
SEED = 20261017


def _matrix(rng: random.Random, m: int, n: int) -> list[list[float]]:
    out: list[list[float]] = []
    for _ in range(m):
        row: list[float] = []
        for _ in range(n):
            v = rng.uniform(-20.0, 20.0)
            row.append(0.0 if rng.random() < 0.1 else round(v, 6))
        out.append(row)
    return out


def _linalg_cases(rng: random.Random) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for _ in range(40):
        m = rng.randint(1, 8)
        n = rng.randint(1, 6)
        a = _matrix(rng, m, n)
        if rng.random() < 0.3 and n >= 2:  # rango deficiente
            k = rng.randrange(n - 1)
            for row in a:
                row[n - 1] = 2.0 * row[k]
        b = [round(rng.uniform(-10.0, 10.0), 6) for _ in range(m)]
        u, s, vt = linalg.svd(a)
        cases.append(
            {
                "a": a,
                "b": b,
                "svd": {"u": u, "s": s, "vt": vt},
                "pinv": linalg.pinv(a, rcond=1e-10),
                "lstsq": linalg.lstsq(a, b),
            }
        )
    for _ in range(20):
        n = rng.randint(1, 6)
        j = _matrix(rng, n + 2, n)
        spd = linalg.matmul(linalg.transpose(j), j)
        for i in range(n):
            spd[i][i] += 1.0
        b = [round(rng.uniform(-10.0, 10.0), 6) for _ in range(n)]
        cases.append({"spd": spd, "b": b, "solve_spd": linalg.solve_spd(spd, b)})
    return cases


def _rosenbrock(x: list[float]) -> list[float]:
    return [10.0 * (x[1] - x[0] * x[0]), 1.0 - x[0]]


def _rosenbrock_jac(x: list[float]) -> list[list[float]]:
    return [[-20.0 * x[0], 10.0], [-1.0, 0.0]]


def _lsq_cases(rng: random.Random) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    # Problemas lineales aleatorios (con y sin límites activos).
    for _ in range(20):
        n = rng.randint(1, 4)
        m = n + rng.randint(1, 5)
        a = _matrix(rng, m, n)
        b = [round(rng.uniform(-20.0, 20.0), 6) for _ in range(m)]
        lo = [-5.0 if rng.random() < 0.5 else -100.0 for _ in range(n)]
        hi = [5.0 if rng.random() < 0.5 else 100.0 for _ in range(n)]
        scale = [rng.choice([1.0, 10.0]) for _ in range(n)]
        budget = rng.choice([5, 40, 200])

        def fun(x: list[float], a: list[list[float]] = a, b: list[float] = b) -> list[float]:
            out: list[float] = []
            for i in range(len(b)):
                acc = 0.0
                for k in range(len(x)):
                    acc += a[i][k] * x[k]
                out.append(acc - b[i])
            return out

        def jac(_x: list[float], a: list[list[float]] = a) -> list[list[float]]:
            return [row[:] for row in a]

        res = least_squares_soft_l1(fun, jac, [0.0] * n, lo, hi, scale, budget)
        cases.append(
            {
                "kind": "lineal",
                "a": a,
                "b": b,
                "lo": lo,
                "hi": hi,
                "scale": scale,
                "max_nfev": budget,
                "x": res.x,
                "cost": res.cost,
                "success": res.success,
                "nfev": res.nfev,
            }
        )
    for lo, hi in (([-5.0, -5.0], [5.0, 5.0]), ([-5.0, -5.0], [0.5, 5.0])):
        res = least_squares_soft_l1(
            _rosenbrock, _rosenbrock_jac, [-1.2, 1.0], lo, hi, [1.0, 1.0], 500
        )
        cases.append(
            {
                "kind": "rosenbrock",
                "lo": lo,
                "hi": hi,
                "x": res.x,
                "cost": res.cost,
                "success": res.success,
                "nfev": res.nfev,
            }
        )
    return cases


def _random_cases() -> list[dict[str, Any]]:
    """`randrange` (enteros, exactos) y `gauss` de CPython con varias semillas. `gauss` usa cos, sin
    y log, que pueden diferir en el último bit entre bibliotecas matemáticas (MSVC, glibc, V8): se
    guarda con 12 cifras significativas para que el archivo sea el mismo en cualquier sistema."""
    cases: list[dict[str, Any]] = []
    for seed in (0, 1, 12345, 2**40 + 7):
        rng = dmath.Random(seed)
        draws: dict[str, list[int]] = {}
        for n in (1, 2, 3, 10, 300, 1000):
            draws[str(n)] = [rng.randrange(n) for _ in range(25)]
        gauss = [float(f"{rng.gauss(0.0, 1.0):.12g}") for _ in range(25)]
        mixed = [float(f"{rng.uniform(-1.0, 1.0) + rng.gauss(2.0, 0.5):.12g}") for _ in range(10)]
        cases.append({"seed": seed, "randrange": draws, "gauss": gauss, "mixto": mixed})
    return cases


def _statistics_cases(rng: random.Random) -> list[dict[str, Any]]:
    """`statistics.quantiles(..., method="inclusive")` y `statistics.median` (aritmética pura)."""
    cases: list[dict[str, Any]] = []
    for size in (1, 2, 3, 5, 9, 10, 11, 37, 200):
        data = [rng.uniform(-50.0, 150.0) for _ in range(size)]
        q = statistics.quantiles(data, n=10, method="inclusive") if size >= 1 else []
        cases.append({"data": data, "quantiles10": q, "median": statistics.median(data)})
    return cases


def build() -> dict[str, Any]:
    rng = dmath.Random(SEED)
    return {
        "_generado_por": (
            "uv run croquis-solver numerics (solver/croquis_solver/numerics_fixture.py)"
        ),
        "seed": SEED,
        "linalg": _linalg_cases(rng),
        "lsq": _lsq_cases(rng),
        "random": _random_cases(),
        "statistics": _statistics_cases(rng),
    }


def render() -> str:
    return json.dumps(build(), ensure_ascii=False, separators=(",", ":")) + "\n"


def write() -> Path:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(render(), encoding="utf-8", newline="\n")
    return OUT


def check() -> bool:
    return OUT.exists() and OUT.read_text(encoding="utf-8") == render()
