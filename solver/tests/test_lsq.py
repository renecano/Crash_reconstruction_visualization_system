"""Optimizador propio contra ``scipy.optimize.least_squares`` (ADR 0027): con presupuesto de sobra,
ambos llegan al mismo mínimo de la pérdida soft_l1, con y sin límites activos."""

import importlib
from collections.abc import Callable, Sequence
from typing import Any

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_solver.lsq import least_squares_soft_l1, soft_l1_cost

least_squares: Any = importlib.import_module("scipy.optimize").least_squares


Fun = Callable[[list[float]], list[float]]
Jac = Callable[[list[float]], list[list[float]]]


def _scipy(
    fun: Fun,
    jac: Jac,
    x0: Sequence[float],
    lo: Sequence[float],
    hi: Sequence[float],
    scale: Sequence[float],
    nfev: int = 500,
) -> tuple[list[float], float]:
    def f(x: Any) -> Any:
        return np.asarray(fun([float(v) for v in x]), dtype=float)

    def jf(x: Any) -> Any:
        return np.asarray(jac([float(v) for v in x]), dtype=float)

    sol: Any = least_squares(
        f,
        np.asarray(x0, dtype=float),
        jac=jf,
        bounds=(lo, hi),
        loss="soft_l1",
        f_scale=1.0,
        x_scale=np.asarray(scale, dtype=float),
        max_nfev=nfev,
        xtol=1e-12,
        ftol=1e-12,
        gtol=1e-12,
    )
    return [float(v) for v in sol.x], float(sol.cost)


coef = st.floats(min_value=-5.0, max_value=5.0, allow_nan=False).filter(lambda v: abs(v) > 0.05)


@settings(max_examples=150, deadline=None)
@given(st.integers(2, 4), st.data())
def test_problemas_lineales_aleatorios_mismo_minimo(n: int, data: st.DataObject) -> None:
    m = n + data.draw(st.integers(2, 6))
    a = [[data.draw(coef) for _ in range(n)] for _ in range(m)]
    if np.linalg.matrix_rank(np.asarray(a)) < n:
        return
    x_true = [data.draw(st.floats(-3, 3, allow_nan=False)) for _ in range(n)]
    b = [
        sum(a[i][k] * x_true[k] for k in range(n)) + data.draw(st.floats(-0.5, 0.5))
        for i in range(m)
    ]

    def fun(x: list[float]) -> list[float]:
        return [sum(a[i][k] * x[k] for k in range(n)) - b[i] for i in range(m)]

    def jac(_x: list[float]) -> list[list[float]]:
        return [row[:] for row in a]

    lo, hi, scale = [-10.0] * n, [10.0] * n, [1.0] * n
    ours = least_squares_soft_l1(fun, jac, [0.0] * n, lo, hi, scale, 500)
    ref_x, ref_cost = _scipy(fun, jac, [0.0] * n, lo, hi, scale)
    # Mismo mínimo: el costo coincide y el punto también (la pérdida es estrictamente convexa aquí).
    assert abs(ours.cost - ref_cost) <= 1e-7 * max(1.0, ref_cost)
    assert np.allclose(ours.x, ref_x, rtol=1e-5, atol=1e-5)
    assert ours.success


def _rosenbrock(x: list[float]) -> list[float]:
    return [10.0 * (x[1] - x[0] * x[0]), 1.0 - x[0]]


def _rosenbrock_jac(x: list[float]) -> list[list[float]]:
    return [[-20.0 * x[0], 10.0], [-1.0, 0.0]]


def test_rosenbrock_llega_al_minimo() -> None:
    res = least_squares_soft_l1(
        _rosenbrock, _rosenbrock_jac, [-1.2, 1.0], [-5.0, -5.0], [5.0, 5.0], [1.0, 1.0], 500
    )
    assert np.allclose(res.x, [1.0, 1.0], atol=1e-6)
    assert res.cost < 1e-12


def test_limite_activo_como_scipy() -> None:
    # El mínimo libre (1, 1) queda fuera de la caja: x0 ≤ 0.5.
    lo, hi = [-5.0, -5.0], [0.5, 5.0]
    res = least_squares_soft_l1(_rosenbrock, _rosenbrock_jac, [-1.2, 1.0], lo, hi, [1.0, 1.0], 500)
    ref_x, ref_cost = _scipy(_rosenbrock, _rosenbrock_jac, [-1.2, 1.0], lo, hi, [1.0, 1.0])
    assert res.x[0] == 0.5
    assert np.allclose(res.x, ref_x, atol=1e-6)
    assert abs(res.cost - ref_cost) <= 1e-9


def test_valor_atipico_atenuado_como_scipy() -> None:
    # Recta y = 2x + 1 con un punto atípico: soft_l1 lo atenúa igual que SciPy.
    xs = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0]
    ys = [1.0, 3.0, 5.0, 7.0, 30.0, 11.0]

    def fun(p: list[float]) -> list[float]:
        return [p[0] * x + p[1] - y for x, y in zip(xs, ys, strict=True)]

    def jac(_p: list[float]) -> list[list[float]]:
        return [[x, 1.0] for x in xs]

    lo, hi = [-100.0, -100.0], [100.0, 100.0]
    res = least_squares_soft_l1(fun, jac, [0.0, 0.0], lo, hi, [10.0, 10.0], 500)
    ref_x, _ = _scipy(fun, jac, [0.0, 0.0], lo, hi, [10.0, 10.0])
    assert np.allclose(res.x, ref_x, atol=1e-5)
    # Más cerca de la recta verdadera que mínimos cuadrados ordinarios.
    ols = np.linalg.lstsq(np.asarray([[x, 1.0] for x in xs]), np.asarray(ys), rcond=None)[0]
    assert abs(res.x[0] - 2.0) < abs(float(ols[0]) - 2.0)


def test_presupuesto_y_determinismo() -> None:
    args = (_rosenbrock, _rosenbrock_jac, [-1.2, 1.0], [-5.0, -5.0], [5.0, 5.0], [1.0, 1.0], 5)
    a = least_squares_soft_l1(*args)
    b = least_squares_soft_l1(*args)
    assert a == b
    assert a.nfev <= 5
    assert not a.success


def test_costo_soft_l1() -> None:
    assert soft_l1_cost([0.0]) == 0.0
    assert abs(soft_l1_cost([1.0]) - (np.sqrt(2.0) - 1.0)) < 1e-15
