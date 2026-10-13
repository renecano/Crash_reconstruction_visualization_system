from __future__ import annotations

import math

import pytest

from croquis_scene_schema import list_fixtures, load_fixture
from croquis_solver.preimpact import CurvedLanePath
from croquis_solver.reconstruct import reconstruct
from croquis_solver.road import lane_following_path, road_axis

FIXTURES = list_fixtures()


@pytest.mark.parametrize("name", FIXTURES)
def test_vehiculos_de_las_escenas_arrancan_sobre_su_carril(name: str) -> None:
    spec = load_fixture(name)
    lugar = spec["lugar"]
    axis = road_axis(lugar)
    dos = lugar["sentidos"]["valor"] == "doble_sentido"
    half = axis.width / 2
    for v in spec["vehiculos"]:
        p = v["posicion_inicial"]
        x, y, h = float(p["x"]), float(p["y"]), math.radians(float(p["rumbo_deg"]))
        if axis.kind == "recta":
            if abs(math.sin(h)) > 0.7:  # vía secundaria norte-sur
                right = x if math.sin(h) > 0 else -x
            else:
                right = -y if math.cos(h) > 0 else y
            lo = 0.0 if dos else -half
            assert lo < right <= half + 1e-9, (name, v["id"], right)
        else:
            r = math.hypot(x - axis.center[0], y - axis.center[1])
            on_ring = abs(r - axis.radius) <= half + 1e-9
            on_south_access = axis.kind == "anillo" and abs(x) <= half and y <= 0
            assert on_ring or on_south_access, (name, v["id"], r - axis.radius)


@pytest.mark.parametrize("name", FIXTURES)
def test_las_zonas_de_impacto_declaradas_son_alcanzables(name: str) -> None:
    r = reconstruct(load_fixture(name))
    assert not any("no llegan a tocarse" in b for b in r.banderas), r.banderas


def test_carril_curvo_conserva_el_radio_y_la_distancia() -> None:
    path = CurvedLanePath((0.0, -100.0), 100.0, math.pi / 2, False, 60.0)
    p0, p1 = path.pose(0.0), path.pose(60.0)
    assert math.isclose(math.hypot(p1.x, p1.y + 100.0), 100.0, rel_tol=1e-9)
    assert math.isclose(p0.heading, 0.0, abs_tol=1e-6)  # horario sobre la cima: hacia +X
    # 60 m sobre un círculo de 100 m de radio barren 0.6 rad.
    assert math.isclose(math.atan2(p1.y + 100.0, p1.x), math.pi / 2 - 0.6, abs_tol=1e-3)
    assert p1.curvature == pytest.approx(-0.01, rel=1e-2)


def test_cambio_de_carril_en_curva_se_desplaza_un_carril() -> None:
    base = CurvedLanePath((0.0, -100.0), 100.0, math.pi / 2, False, 80.0, lateral=3.5)
    end = base.pose(80.0)
    # Horario: la izquierda es hacia afuera, el radio crece 3.5 m.
    assert math.isclose(math.hypot(end.x, end.y + 100.0), 103.5, rel_tol=1e-6)


def test_seguir_carril_respeta_el_sentido_del_rumbo() -> None:
    lugar = load_fixture("frontal_curva")["lugar"]
    axis = road_axis(lugar)
    assert axis.kind == "arco"
    hacia_este = lane_following_path(axis, (0.0, -1.75, 0.0))
    hacia_oeste = lane_following_path(axis, (0.0, 1.75, math.pi))
    assert isinstance(hacia_este, CurvedLanePath)
    assert isinstance(hacia_oeste, CurvedLanePath)
    assert not hacia_este.ccw
    assert hacia_oeste.ccw
    assert lane_following_path(road_axis(load_fixture("alcance")["lugar"]), (0, 0, 0)) is None
