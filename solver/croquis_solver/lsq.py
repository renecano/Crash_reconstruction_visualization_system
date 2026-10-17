"""Mínimos cuadrados robustos con límites, en Python puro (ADR 0027).

Reemplaza a ``scipy.optimize.least_squares(..., loss="soft_l1", f_scale=1, x_scale=…)`` en la
inversión. Es Levenberg–Marquardt con:

- **pérdida soft_l1** por mínimos cuadrados reponderados: con z = r², ρ(z) = 2(√(1 + z) − 1) y el
  peso de cada residuo ρ'(z) = 1/√(1 + z). El costo es ½ Σ ρ(rᵢ²), igual que en SciPy;
- **límites** con conjunto activo: las variables en un límite cuyo descenso saldría de la caja se
  fijan en esa iteración y el sistema se resuelve en las libres; el paso se proyecta a la caja y la
  convergencia se mide con el gradiente proyectado;
- **escala** de las variables (``x_scale``): el amortiguamiento λ·I actúa en las variables
  escaladas, y se actualiza con la regla de Nielsen según la razón entre la reducción real del
  costo y la que predice el modelo lineal;
- **presupuesto** de evaluaciones de la función (``max_nfev``; el jacobiano no cuenta, como en SciPy
  con jacobiano explícito).

El orden de las operaciones es fijo y el port TS (`lsq.ts`) lo repite línea por línea.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from croquis_solver import linalg

# Amortiguamiento de Nielsen (1999): λ₀ = τ · máx diag(JᵀJ); con razón de ganancia ρ > 0 se acepta y
# λ ← λ · máx(1/3, 1 − (2ρ − 1)³), ν ← 2; si no, λ ← λ · ν y ν ← 2ν. Gasta muchas menos evaluaciones
# en pasos rechazados que factores fijos.
TAU = 1e-3
LAMBDA_MAX = 1e16
FTOL = 1e-8
XTOL = 1e-8
GTOL = 1e-10
# Si el paso proyectado cae en un límite y no mejora, se prueba el punto interior al 99.5 % del
# camino hasta el límite (como la región de confianza de SciPy, que mantiene los iterados dentro de
# la caja): el costo puede ser discontinuo justo en el límite (p. ej. velocidad exactamente cero).
THETA = 0.995


@dataclass(frozen=True)
class LsqResult:
    x: list[float]
    cost: float
    #: Convergió por tolerancia (no por agotar el presupuesto), como ``status > 0`` en SciPy.
    success: bool
    nfev: int


def soft_l1_cost(r: Sequence[float]) -> float:
    """½ Σ 2(√(1 + r²) − 1), escrito como ½ Σ 2r²/(√(1 + r²) + 1): es la misma cantidad, pero sin
    la cancelación de √(1 + r²) − 1 cuando r es chico (con r ~ 1e-6 esa resta pierde ~4 cifras y las
    decisiones de aceptar un paso se vuelven ruido)."""
    acc = 0.0
    for v in r:
        z = v * v
        acc += 2.0 * z / (math.sqrt(1.0 + z) + 1.0)
    return 0.5 * acc


def _clip(x: Sequence[float], lo: Sequence[float], hi: Sequence[float]) -> list[float]:
    return [min(max(v, lo[i]), hi[i]) for i, v in enumerate(x)]


def least_squares_soft_l1(
    fun: Callable[[list[float]], list[float]],
    jac: Callable[[list[float]], list[list[float]]],
    x0: Sequence[float],
    lo: Sequence[float],
    hi: Sequence[float],
    x_scale: Sequence[float],
    max_nfev: int,
) -> LsqResult:
    """Minimiza ½ Σ ρ(rᵢ(x)²) con ``lo ≤ x ≤ hi``."""
    n = len(x0)
    x = _clip([float(v) for v in x0], lo, hi)
    r = fun(x)
    nfev = 1
    cost = soft_l1_cost(r)
    lam = -1.0  # se fija con la primera matriz normal
    nu = 2.0
    success = False
    while nfev < max_nfev and not success:
        j = jac(x)
        m = len(r)
        # Pesos IRLS (raíz de ρ'), jacobiano escalado por x_scale y gradiente.
        w = [1.0 / math.sqrt(math.sqrt(1.0 + v * v)) for v in r]
        js = [[w[i] * j[i][k] * x_scale[k] for k in range(n)] for i in range(m)]
        rw = [w[i] * r[i] for i in range(m)]
        a = [[0.0] * n for _ in range(n)]
        g = [0.0] * n
        for i in range(m):
            row = js[i]
            for p in range(n):
                g[p] += row[p] * rw[i]
                for q in range(n):
                    a[p][q] += row[p] * row[q]
        # Conjunto libre: fuera de las variables en un límite cuyo descenso (−g) saldría de la caja.
        free = [
            k
            for k in range(n)
            if not ((x[k] <= lo[k] and g[k] > 0.0) or (x[k] >= hi[k] and g[k] < 0.0))
        ]
        gmax = 0.0
        for k in free:
            gmax = max(gmax, abs(g[k]))
        if not free or gmax < GTOL:
            success = True
            break
        if lam < 0.0:
            dmax = 0.0
            for k in free:
                dmax = max(dmax, a[k][k])
            lam = TAU * dmax if dmax > 0.0 else TAU
        accepted = False
        while not accepted and nfev < max_nfev:
            damped = [[a[p][q] + (lam if p == q else 0.0) for q in free] for p in free]
            du_free = linalg.solve_spd(damped, [-g[k] for k in free])
            du = [0.0] * n
            for idx, k in enumerate(free):
                du[k] = du_free[idx]
            x_new = _clip([x[k] + x_scale[k] * du[k] for k in range(n)], lo, hi)
            r_new = fun(x_new)
            nfev += 1
            cost_new = soft_l1_cost(r_new)
            if cost_new >= cost and nfev < max_nfev:
                # ¿El paso tocó un límite? Fracción máxima del paso que queda dentro de la caja.
                alpha = 1.0
                for k in free:
                    dx = x_scale[k] * du[k]
                    if dx > 0.0 and x[k] + dx > hi[k]:
                        alpha = min(alpha, (hi[k] - x[k]) / dx)
                    elif dx < 0.0 and x[k] + dx < lo[k]:
                        alpha = min(alpha, (lo[k] - x[k]) / dx)
                if alpha < 1.0:
                    t = THETA * alpha
                    x_in = [x[k] + t * x_scale[k] * du[k] for k in range(n)]
                    r_in = fun(x_in)
                    nfev += 1
                    cost_in = soft_l1_cost(r_in)
                    if cost_in < cost:
                        x_new, r_new, cost_new = x_in, r_in, cost_in
                        for k in range(n):
                            du[k] *= t
            # Reducción que predice el modelo: ½ duᵀ(λ·du − g) en las variables libres.
            predicted = 0.0
            for k in free:
                predicted += du[k] * (lam * du[k] - g[k])
            predicted *= 0.5
            step = 0.0
            size = 0.0
            for k in range(n):
                step = max(step, abs(x_new[k] - x[k]))
                size = max(size, abs(x[k]))
            if cost_new < cost:
                reduction = cost - cost_new
                x, r, accepted = x_new, r_new, True
                rho = reduction / predicted if predicted > 0.0 else 1.0
                # (2ρ − 1)³ como multiplicaciones: `**` y `Math.pow` pueden diferir en el
                # último bit.
                d = 2.0 * rho - 1.0
                lam *= max(1.0 / 3.0, 1.0 - d * d * d)
                nu = 2.0
                # Costo cero: el mínimo global de soft_l1 (ajuste exacto).
                if cost_new == 0.0 or reduction <= FTOL * cost or step <= XTOL * (XTOL + size):
                    success = True
                cost = cost_new
            else:
                # Paso propuesto despreciable: punto estacionario dentro de la tolerancia (como el
                # criterio xtol de SciPy cuando la región de confianza se encoge).
                if step <= XTOL * (XTOL + size):
                    success = True
                    break
                lam = min(lam * nu, LAMBDA_MAX)
                nu *= 2.0
                if lam >= LAMBDA_MAX:
                    break
        if not accepted:
            break
    return LsqResult(x, cost, success, nfev)
