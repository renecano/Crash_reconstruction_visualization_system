"""Medidas de la red vial del mapa: los mismos casos que ``src/red-vial.test.ts`` (paridad)."""

import pytest

from croquis_scene_schema.red_vial import defaults, outside_red_vial_m, via_width_m

CRUCE = [
    {"tipo": "secondary", "carriles": 4, "puntos": [{"x": -50, "y": 0}, {"x": 50, "y": 0}]},
    {"tipo": "residential", "puntos": [{"x": 0, "y": -40}, {"x": 0, "y": 40}]},
    {"tipo": "primary", "ancho_m": 20, "puntos": [{"x": 100, "y": -10}, {"x": 100, "y": 10}]},
]


def test_ancho_de_osm_o_carriles_por_ancho_de_carril() -> None:
    assert via_width_m(CRUCE[0]) == 4 * 3.5
    assert via_width_m(CRUCE[0], 3.3) == pytest.approx(4 * 3.3)
    assert via_width_m(CRUCE[1]) == defaults()["carriles_por_tipo"]["residential"] * 3.5
    assert via_width_m(CRUCE[2]) == 20
    assert via_width_m({"tipo": "secondary_link"}) == 3 * 3.5
    assert via_width_m({"tipo": "track"}) == 2 * 3.5


def test_cuanto_queda_fuera_de_la_calzada() -> None:
    assert outside_red_vial_m((10, 0), CRUCE) == pytest.approx(-7)
    assert outside_red_vial_m((10, 12), CRUCE) == pytest.approx(5)
    assert outside_red_vial_m((0, 30), CRUCE) == pytest.approx(-3.5)
    assert outside_red_vial_m((95, 0), CRUCE) == pytest.approx(-5)
    assert outside_red_vial_m((30, 30), CRUCE) == pytest.approx(23)
