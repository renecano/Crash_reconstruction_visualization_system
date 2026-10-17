"""Álgebra lineal propia contra NumPy (ADR 0027): mismos resultados a 1e-10 en matrices pequeñas,
bien condicionadas y de rango deficiente."""

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_solver import linalg

# Dominio de la inversión: residuos en sigmas y parámetros de orden 1-100. Se excluyen magnitudes
# subnormales (< 1e-6), donde la suma de cuadrados se desborda hacia cero (LAPACK reescala).
_mag = st.floats(min_value=1e-6, max_value=50.0, allow_nan=False, allow_infinity=False)
finite = st.one_of(st.just(0.0), _mag, _mag.map(lambda v: -v))


@st.composite
def matrices(draw: st.DrawFn, max_rows: int = 8, max_cols: int = 6) -> list[list[float]]:
    m = draw(st.integers(1, max_rows))
    n = draw(st.integers(1, max_cols))
    return [[draw(finite) for _ in range(n)] for _ in range(m)]


@st.composite
def rank_deficient(draw: st.DrawFn) -> list[list[float]]:
    """Matrices m × n con una columna combinación de otras (rango < n)."""
    m = draw(st.integers(3, 8))
    n = draw(st.integers(2, 5))
    a = [[draw(finite) for _ in range(n - 1)] for _ in range(m)]
    k = draw(st.integers(0, n - 2))
    c = draw(st.floats(min_value=-3, max_value=3, allow_nan=False))
    return [[*row, c * row[k]] for row in a]


def _cond_tol(a: list[list[float]], rcond: float = 1e-10) -> float:
    """Tolerancia relativa de pinv o lstsq: el error de cualquier SVD crece con el número de
    condición (valores singulares por encima del corte) por el épsilon de máquina."""
    sv = np.linalg.svd(np.asarray(a), compute_uv=False)
    kept = sv[sv > rcond * (sv[0] if sv.size else 0.0)]
    cond = float(kept[0] / kept[-1]) if kept.size else 1.0
    return max(1e-10, 1e3 * cond * np.finfo(float).eps)


def _close(a: object, b: object, tol: float = 1e-10) -> None:
    x = np.asarray(a, dtype=float)
    y = np.asarray(b, dtype=float)
    scale = max(1.0, float(np.max(np.abs(y))) if y.size else 1.0)
    assert x.shape == y.shape
    assert np.max(np.abs(x - y), initial=0.0) <= tol * scale


@settings(max_examples=300, deadline=None)
@given(matrices())
def test_svd_reconstruye_y_es_ortonormal(a: list[list[float]]) -> None:
    u, s, vt = linalg.svd(a)
    k = min(len(a), len(a[0]))
    assert len(s) == k
    assert all(s[i] >= s[i + 1] for i in range(k - 1))
    _close(np.asarray(u) @ np.diag(s) @ np.asarray(vt), a)
    # Ortonormales en las componentes con valor singular no nulo (las de valor cero no se usan en
    # pinv ni en lstsq; NumPy las completa con una base arbitraria).
    nz = [i for i, si in enumerate(s) if si > 1e-9 * max(s[0], 1e-300)]
    uu = np.asarray(u)[:, nz]
    vv = np.asarray(vt)[nz, :]
    _close(uu.T @ uu, np.eye(len(nz)))
    _close(vv @ vv.T, np.eye(len(nz)))
    _close(s, np.linalg.svd(np.asarray(a), compute_uv=False))


@settings(max_examples=300, deadline=None)
@given(matrices())
def test_pinv_como_numpy(a: list[list[float]]) -> None:
    _close(linalg.pinv(a, rcond=1e-10), np.linalg.pinv(np.asarray(a), rcond=1e-10), _cond_tol(a))


@settings(max_examples=300, deadline=None)
@given(rank_deficient())
def test_pinv_y_lstsq_en_rango_deficiente(a: list[list[float]]) -> None:
    b = [float(i) - 2.5 for i in range(len(a))]
    _close(linalg.pinv(a, rcond=1e-10), np.linalg.pinv(np.asarray(a), rcond=1e-10), _cond_tol(a))
    _close(
        linalg.lstsq(a, b),
        np.linalg.lstsq(np.asarray(a), np.asarray(b), rcond=None)[0],
        _cond_tol(a, linalg.EPS * max(len(a), len(a[0]))),
    )


@settings(max_examples=300, deadline=None)
@given(matrices(), st.data())
def test_lstsq_como_numpy(a: list[list[float]], data: st.DataObject) -> None:
    b = [data.draw(finite) for _ in range(len(a))]
    _close(
        linalg.lstsq(a, b),
        np.linalg.lstsq(np.asarray(a), np.asarray(b), rcond=None)[0],
        _cond_tol(a, linalg.EPS * max(len(a), len(a[0]))),
    )


@settings(max_examples=300, deadline=None)
@given(matrices(max_rows=8, max_cols=6), st.data())
def test_solve_spd_como_numpy(a: list[list[float]], data: st.DataObject) -> None:
    j = np.asarray(a)
    spd = j.T @ j + np.eye(j.shape[1])  # simétrica definida positiva
    b = [data.draw(finite) for _ in range(j.shape[1])]
    _close(linalg.solve_spd(spd.tolist(), b), np.linalg.solve(spd, np.asarray(b)))


def test_solve_spd_rechaza_no_definida_positiva() -> None:
    with pytest.raises(ValueError):
        linalg.solve_spd([[1.0, 2.0], [2.0, 1.0]], [1.0, 1.0])


def test_matrices_degeneradas() -> None:
    assert linalg.svd([]) == ([], [], [])
    _close(linalg.pinv([[0.0, 0.0], [0.0, 0.0]]), [[0.0, 0.0], [0.0, 0.0]])
    _close(linalg.lstsq([[0.0], [0.0]], [1.0, 2.0]), [0.0])
