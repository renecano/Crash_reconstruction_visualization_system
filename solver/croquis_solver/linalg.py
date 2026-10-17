"""Álgebra lineal densa pequeña en Python puro (ADR 0027).

La inversión trabaja con matrices de unos cuantos residuos por ≤ 6 parámetros. En lugar de NumPy y
LAPACK, aquí van rutinas con un orden de operaciones fijo, que el port TS (`linalg.ts`) repite
línea por línea; así la paridad E7 se puede exigir a la misma tolerancia que el resto del solver.

- `svd`: SVD por Jacobi de un lado (Hestenes), con barridos en orden fijo.
- `lstsq`: solución de mínimos cuadrados de norma mínima, como `numpy.linalg.lstsq`.
- `pinv`: pseudoinversa, como `numpy.linalg.pinv`.
- `solve_spd`: sistema simétrico definido positivo por Cholesky.

Las matrices son listas de filas (``list[list[float]]``).

Dominio: valores nulos o de magnitud ≥ 1e-6 (residuos en sigmas y parámetros de orden 1-100). Con
magnitudes subnormales la suma de cuadrados se desborda hacia cero; LAPACK reescala y aquí no hace
falta.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

Matrix = list[list[float]]

EPS = 2.220446049250313e-16  # épsilon de doble precisión (np.finfo(float).eps)
JACOBI_TOL = 1e-15
JACOBI_MAX_SWEEPS = 60


def transpose(a: Sequence[Sequence[float]]) -> Matrix:
    rows = len(a)
    cols = len(a[0]) if rows else 0
    return [[float(a[i][j]) for i in range(rows)] for j in range(cols)]


def matmul(a: Sequence[Sequence[float]], b: Sequence[Sequence[float]]) -> Matrix:
    n = len(b)
    p = len(b[0]) if n else 0
    out: Matrix = []
    for row in a:
        r = [0.0] * p
        for k in range(n):
            aik = row[k]
            bk = b[k]
            for j in range(p):
                r[j] += aik * bk[j]
        out.append(r)
    return out


def matvec(a: Sequence[Sequence[float]], x: Sequence[float]) -> list[float]:
    out: list[float] = []
    for row in a:
        s = 0.0
        for k, v in enumerate(row):
            s += v * x[k]
        out.append(s)
    return out


def svd(a: Sequence[Sequence[float]]) -> tuple[Matrix, list[float], Matrix]:
    """SVD reducida ``a = U · diag(s) · Vᵀ`` con s descendente (m × k, k, k × n; k = min(m, n)).

    Jacobi de un lado sobre las columnas: rota pares de columnas hasta que todas sean ortogonales.
    Si hay más columnas que filas se factoriza la transpuesta.
    """
    m = len(a)
    n = len(a[0]) if m else 0
    if m == 0 or n == 0:
        return [], [], []
    if n > m:
        ut, s, vt = svd(transpose(a))
        # aᵀ = U' S V'ᵀ  ⇒  a = V' S U'ᵀ
        return transpose(vt), s, transpose(ut)
    w = [[float(v) for v in row] for row in a]
    v = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for _ in range(JACOBI_MAX_SWEEPS):
        rotated = False
        for p in range(n - 1):
            for q in range(p + 1, n):
                alpha = 0.0
                beta = 0.0
                gamma = 0.0
                for i in range(m):
                    wp = w[i][p]
                    wq = w[i][q]
                    alpha += wp * wp
                    beta += wq * wq
                    gamma += wp * wq
                if gamma == 0.0 or abs(gamma) <= JACOBI_TOL * math.sqrt(alpha * beta):
                    continue
                rotated = True
                zeta = (beta - alpha) / (2.0 * gamma)
                t = (1.0 if zeta >= 0.0 else -1.0) / (abs(zeta) + math.sqrt(1.0 + zeta * zeta))
                c = 1.0 / math.sqrt(1.0 + t * t)
                s = c * t
                for i in range(m):
                    wp = w[i][p]
                    wq = w[i][q]
                    w[i][p] = c * wp - s * wq
                    w[i][q] = s * wp + c * wq
                for i in range(n):
                    vp = v[i][p]
                    vq = v[i][q]
                    v[i][p] = c * vp - s * vq
                    v[i][q] = s * vp + c * vq
        if not rotated:
            break
    sigma: list[float] = []
    for j in range(n):
        acc = 0.0
        for i in range(m):
            acc += w[i][j] * w[i][j]
        sigma.append(math.sqrt(acc))
    # Orden descendente estable (empates por índice) para que sea reproducible.
    order = sorted(range(n), key=lambda j: (-sigma[j], j))
    s_sorted = [sigma[j] for j in order]
    u: Matrix = [[0.0] * n for _ in range(m)]
    for k, j in enumerate(order):
        if sigma[j] > 0.0:
            for i in range(m):
                u[i][k] = w[i][j] / sigma[j]
    vt: Matrix = [[v[i][j] for i in range(n)] for j in order]
    return u, s_sorted, vt


def _cutoff(s: Sequence[float], rcond: float) -> float:
    return rcond * (s[0] if s else 0.0)


def pinv(a: Sequence[Sequence[float]], rcond: float = 1e-15) -> Matrix:
    """Pseudoinversa de Moore-Penrose (como ``numpy.linalg.pinv(a, rcond)``)."""
    m = len(a)
    n = len(a[0]) if m else 0
    u, s, vt = svd(a)
    cut = _cutoff(s, rcond)
    out: Matrix = [[0.0] * m for _ in range(n)]
    for k, sk in enumerate(s):
        if sk <= cut or sk == 0.0:
            continue
        inv = 1.0 / sk
        for i in range(n):
            vik = vt[k][i] * inv
            for j in range(m):
                out[i][j] += vik * u[j][k]
    return out


def lstsq(
    a: Sequence[Sequence[float]], b: Sequence[float], rcond: float | None = None
) -> list[float]:
    """Mínimos cuadrados de norma mínima (como ``numpy.linalg.lstsq(a, b, rcond)[0]``).

    Con ``rcond=None`` usa, como NumPy, ``eps · max(m, n)`` relativo al mayor valor singular.
    """
    m = len(a)
    n = len(a[0]) if m else 0
    if rcond is None:
        rcond = EPS * max(m, n)
    u, s, vt = svd(a)
    cut = _cutoff(s, rcond)
    x = [0.0] * n
    for k, sk in enumerate(s):
        if sk <= cut or sk == 0.0:
            continue
        coef = 0.0
        for j in range(m):
            coef += u[j][k] * b[j]
        coef /= sk
        for i in range(n):
            x[i] += coef * vt[k][i]
    return x


def solve_spd(a: Sequence[Sequence[float]], b: Sequence[float]) -> list[float]:
    """Resuelve ``a x = b`` con ``a`` simétrica definida positiva (Cholesky ``a = L Lᵀ``).

    Lanza ``ValueError`` si ``a`` no es definida positiva.
    """
    n = len(a)
    low: Matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            s = float(a[i][j])
            for k in range(j):
                s -= low[i][k] * low[j][k]
            if i == j:
                if s <= 0.0:
                    raise ValueError("La matriz no es definida positiva")
                low[i][i] = math.sqrt(s)
            else:
                low[i][j] = s / low[j][j]
    y = [0.0] * n
    for i in range(n):
        s = float(b[i])
        for k in range(i):
            s -= low[i][k] * y[k]
        y[i] = s / low[i][i]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = y[i]
        for k in range(i + 1, n):
            s -= low[k][i] * x[k]
        x[i] = s / low[i][i]
    return x
