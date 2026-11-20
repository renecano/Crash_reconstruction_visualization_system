"""Ronda 4 (René, 2026-11-19): la trayectoria sigue la geometría real de la calle (`eje_via`)."""

from __future__ import annotations

import json
import math
from pathlib import Path

from croquis_solver.preimpact import PolylineLanePath
from croquis_solver.reconstruct import reconstruct
from croquis_solver.road import lane_following_path, road_axis

FIX = Path(__file__).resolve().parents[2] / "packages/scene-schema/fixtures"
EJE = ((0.0, -60.0), (0.0, -20.0), (3.0, -8.0), (10.0, 0.0), (22.0, 6.0), (40.0, 9.0), (80.0, 10.0))


def test_el_carril_dobla_con_el_eje_y_conserva_su_separacion() -> None:
    p = PolylineLanePath(EJE, (1.5, -40.0, math.pi / 2), 120.0)
    assert abs(math.cos(p.pose(0.0).heading)) < 0.05  # al norte
    assert math.cos(p.pose(110.0).heading) > 0.95  # al oriente, después de la curva


def test_con_eje_via_manda_el_eje_real_y_sin_el_la_plantilla() -> None:
    lugar = {
        "tipo_via": {"valor": "curva"},
        "carriles_por_sentido": {"valor": 1},
        "sentidos": {"valor": "doble_sentido"},
    }
    assert road_axis(lugar).kind == "arco"
    con = {**lugar, "eje_via": {"puntos": [{"x": x, "y": y} for x, y in EJE]}}
    ax = road_axis(con)
    assert ax.kind == "polilinea"
    assert isinstance(lane_following_path(ax, (1.5, -40.0, math.pi / 2)), PolylineLanePath)


def test_el_eje_igual_al_arco_de_la_plantilla_da_la_misma_reconstruccion() -> None:
    base = json.loads((FIX / "frontal_curva.json").read_text(encoding="utf-8"))
    con = json.loads((FIX / "inversion/curva_eje_real.json").read_text(encoding="utf-8"))
    a, b = reconstruct(base).to_dict(), reconstruct(con).to_dict()
    for va, vb in zip(a["vehiculos"], b["vehiculos"], strict=True):
        assert abs(va["v_impacto_kmh"] - vb["v_impacto_kmh"]) < 0.5


def test_la_referencia_de_paridad_esta_al_dia() -> None:
    ref = json.loads(
        (FIX / "inversion/resultados/polilinea_poses.json").read_text(encoding="utf-8")
    )
    for c in ref["casos"]:
        p = PolylineLanePath(
            tuple(map(tuple, ref["eje"])), tuple(c["pose"]), 120.0, lateral=c["lateral"]
        )
        for s, x, y, h, _k in c["poses"]:
            q = p.pose(s)
            assert (q.x, q.y, q.heading) == (x, y, h)
