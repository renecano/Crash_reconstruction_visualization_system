from __future__ import annotations

import pytest

from croquis_eval import e4_pedestrian as e4
from croquis_solver import pedestrian
from croquis_solver.reconstruct import (
    PEDESTRIAN_CG_HEIGHT_FACTOR,
    PEDESTRIAN_LAUNCH_ANGLE_DEG,
    PEDESTRIAN_PROJECTION_FACTOR,
)


def test_casos_transcritos() -> None:
    cases = e4.load_cases()
    assert len(cases) == 18
    assert {c.fuente for c in cases} == {"becker2016_iptm", "eubanks1992", "randles2001"}
    assert sum(1 for c in cases if not c.braking) == 1  # Eubanks y Haight 69: sin frenar
    iptm = [c for c in cases if c.fuente == "becker2016_iptm"]
    # Conversión de la tabla 3 (pies y mph).
    assert iptm[0].d_m == pytest.approx(34.8 * 0.3048, abs=1e-3)
    assert iptm[0].v_kmh == pytest.approx(23.9 * 1.609344, abs=1e-2)
    assert all(c.mu == 0.511 for c in iptm)


def test_estimacion_puntual_invierte_el_modelo_del_solver() -> None:
    for c in e4.load_cases():
        v = e4.croquis_speed_point(c) / 3.6
        mu, _, _ = e4.mu_range(c)
        d = pedestrian.searle_throw(
            PEDESTRIAN_PROJECTION_FACTOR * v,
            mu,
            PEDESTRIAN_LAUNCH_ANGLE_DEG,
            PEDESTRIAN_CG_HEIGHT_FACTOR * c.stature,
        )
        assert d == pytest.approx(c.d_m, rel=1e-6)


def test_intervalos_ordenados_y_resumen() -> None:
    cases = e4.load_cases()
    for c in cases:
        lo, hi = e4.croquis_speed_interval(c)
        assert 0 < lo < hi
        _, s_lo, s_hi = e4.searle_alone(c)
        assert s_lo <= s_hi
        d, b_lo, b_hi = e4.croquis_distance(c)
        assert b_lo <= d <= b_hi
    out = e4.evaluate(cases)
    s = out["resumen"]
    assert s["casos_en_dominio"] == 17
    v = s["velocidad_desde_distancia_kmh"]
    assert 0 <= v["croquis"]["cobertura_intervalo"] <= 1
    assert v["croquis"]["mae"] > 0
    cal = s["calibracion_factor_proyeccion"]
    assert cal["factor_actual"] == PEDESTRIAN_PROJECTION_FACTOR
    assert cal["mae_en_muestra_kmh"] <= cal["mae_factor_actual_kmh"] + 1e-9
