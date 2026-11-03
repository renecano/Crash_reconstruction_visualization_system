"""Hipercubo latino (T3.1, ADR 0100): estratos, determinismo e inversa de la normal."""

from __future__ import annotations

import statistics

import pytest

from croquis_solver import dmath
from croquis_solver.stratified import (
    CountingDraws,
    LatinHypercube,
    StratifiedDraws,
    count_draws,
    norm_ppf,
)


def test_cada_dimension_reparte_las_muestras_en_estratos_distintos() -> None:
    lhs = LatinHypercube(12, 3, dmath.Random(7))
    for d in range(3):
        estratos = sorted(int(lhs.u[i][d] * 12) for i in range(12))
        assert estratos == list(range(12))
        assert all(0.0 <= lhs.u[i][d] < 1.0 for i in range(12))


def test_determinista_por_semilla_y_distinto_con_otra() -> None:
    a = LatinHypercube(8, 2, dmath.Random(3)).u
    b = LatinHypercube(8, 2, dmath.Random(3)).u
    c = LatinHypercube(8, 2, dmath.Random(4)).u
    assert a == b
    assert a != c


def test_el_diseno_por_omision_no_depende_de_la_semilla_de_la_escena() -> None:
    # Sin generador, el hipercubo sale de la semilla de diseño: igual para cualquier escena.
    assert LatinHypercube(12, 5).u == LatinHypercube(12, 5).u
    assert LatinHypercube(12, 5).u != LatinHypercube(12, 6).u
    assert LatinHypercube(12, 5).u != LatinHypercube(16, 5).u


@pytest.mark.parametrize("p", [0.001, 0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98, 0.999])
def test_la_inversa_de_la_normal_coincide_con_statistics(p: float) -> None:
    assert norm_ppf(p) == pytest.approx(statistics.NormalDist().inv_cdf(p), abs=2e-8)


def test_los_sorteos_de_una_fila_salen_en_orden_y_no_sobran() -> None:
    fila = StratifiedDraws([0.5, 0.25, 0.9])
    assert fila.uniform(10.0, 20.0) == 15.0
    assert fila.gauss(0.0, 2.0) == pytest.approx(2.0 * norm_ppf(0.25))
    assert fila.uniform(0.0, 1.0) == 0.9
    with pytest.raises(IndexError):
        fila.uniform(0.0, 1.0)


def test_la_pasada_seca_cuenta_los_sorteos() -> None:
    def sortear(d: CountingDraws) -> None:
        d.uniform(0.0, 1.0)
        d.gauss(0.0, 1.0)
        d.gauss(5.0, 1.0)

    assert count_draws(sortear) == 3  # type: ignore[arg-type]
