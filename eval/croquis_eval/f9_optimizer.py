"""F9: el optimizador propio de la inversión contra ``scipy.optimize.least_squares`` (ADR 0027).

En cada escena canónica con parámetros que la evidencia puede mover, se resuelve el mismo problema
de la inversión (`fit_evidence`: mismos residuos, punto inicial, límites, escala y presupuesto de 40
evaluaciones) con SciPy (región de confianza reflectiva, pérdida soft_l1) y con
`croquis_solver.lsq` (Levenberg–Marquardt). Se guardan el costo final (menor es mejor ajuste a la
evidencia), las evaluaciones, si convergió y el punto. Los problemas vienen de la simulación y son
multimodales, así que dos algoritmos pueden caer en mínimos distintos: se reporta tal cual.
"""

from __future__ import annotations

import importlib
from typing import Any

import numpy as np

from croquis_eval.results import write_result
from croquis_scene_schema import list_fixtures, load_fixture
from croquis_solver import inversion as inv
from croquis_solver.lsq import least_squares_soft_l1

MAX_NFEV = 40  # el presupuesto de `fit_evidence`


def _scipy(prob: Any, x0: list[float], lo: list[float], hi: list[float], sc: list[float]) -> Any:
    least_squares: Any = importlib.import_module("scipy.optimize").least_squares

    def fun(x: Any) -> Any:
        return np.asarray(prob([float(v) for v in np.asarray(x, dtype=float)]), dtype=float)

    def jac(x: Any) -> Any:
        return np.asarray(prob.jac([float(v) for v in np.asarray(x, dtype=float)]), dtype=float)

    return least_squares(
        fun,
        np.asarray(x0, dtype=float),
        jac=jac,
        bounds=(lo, hi),
        loss="soft_l1",
        f_scale=1.0,
        x_scale=np.asarray(sc, dtype=float),
        max_nfev=MAX_NFEV,
    )


def compare(name: str) -> dict[str, Any] | None:
    spec = load_fixture(name)
    ev = inv.evidence_from_spec(spec)
    base = inv.with_marks(spec, ev)
    params = inv.parameters(base, ev)
    if not params or ev.empty():
        return None
    x0 = [min(max(p.start, p.lo), p.hi) for p in params]
    lo = [p.lo for p in params]
    hi = [p.hi for p in params]
    sc = [inv.SCALE[p.kind] for p in params]
    p_ref = inv._Problem(base, ev, params, {}, 0.1)  # pyright: ignore[reportPrivateUsage]
    p_ref(x0)
    ref: Any = _scipy(p_ref, x0, lo, hi, sc)
    p_own = inv._Problem(base, ev, params, {}, 0.1)  # pyright: ignore[reportPrivateUsage]
    p_own(x0)
    own = least_squares_soft_l1(p_own, p_own.jac, x0, lo, hi, sc, MAX_NFEV)
    return {
        "escena": name,
        "parametros": [p.name for p in params],
        "scipy": {
            "costo": round(float(ref.cost), 6),
            "evaluaciones": int(ref.nfev),
            "convergio": bool(ref.success),
            "x": [round(float(v), 3) for v in ref.x],
        },
        "propio": {
            "costo": round(own.cost, 6),
            "evaluaciones": own.nfev,
            "convergio": own.success,
            "x": [round(v, 3) for v in own.x],
        },
    }


def main() -> str:
    casos = [c for c in (compare(n) for n in list_fixtures()) if c is not None]
    tol = 1e-4
    resumen = {
        "escenas_con_inversion": len(casos),
        "convergen": {
            "scipy": sum(c["scipy"]["convergio"] for c in casos),
            "propio": sum(c["propio"]["convergio"] for c in casos),
        },
        "propio_mejor": [
            c["escena"] for c in casos if c["propio"]["costo"] < c["scipy"]["costo"] - tol
        ],
        "igual": [
            c["escena"] for c in casos if abs(c["propio"]["costo"] - c["scipy"]["costo"]) <= tol
        ],
        "scipy_mejor": [
            c["escena"] for c in casos if c["scipy"]["costo"] < c["propio"]["costo"] - tol
        ],
        "costo_total": {
            "scipy": round(sum(c["scipy"]["costo"] for c in casos), 4),
            "propio": round(sum(c["propio"]["costo"] for c in casos), 4),
        },
        "evaluaciones_totales": {
            "scipy": sum(c["scipy"]["evaluaciones"] for c in casos),
            "propio": sum(c["propio"]["evaluaciones"] for c in casos),
        },
        "tolerancia_igual": tol,
    }
    payload = {
        "descripcion": __doc__.strip().splitlines()[0] if __doc__ else "",
        "metodo": (
            "Mismo problema de fit_evidence por escena (residuos, inicio, límites, x_scale, "
            f"max_nfev={MAX_NFEV}); costo = ½ Σ 2(√(1 + r²) − 1)."
        ),
        "resumen": resumen,
        "casos": casos,
    }
    return str(write_result("f9_optimizador", payload))
