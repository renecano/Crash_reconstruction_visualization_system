"""Inercia de guiñada desde la base de NHTSA: filtros, evaluación y tabla del solver."""

import csv
import json
import math
from pathlib import Path

import pytest

from croquis_data.nhtsa_inercia import CSV_PATH, InertiaRow
from croquis_eval import inercia_guinada as ig

FIELDS = list(InertiaRow.__dataclass_fields__)


def _row(**kw: object) -> dict[str, object]:
    base: dict[str, object] = {
        "model_year": 1990, "vehicle": "X", "vehicle_no": "V1", "ipmd_version": "5",
        "body_type": "4S", "occupants": "1", "ballast_n": "0", "drive_axle": "F",
        "wheelbase_m": 2.6, "track_front_m": 1.45, "track_rear_m": 1.45, "roof_height_m": 1.4,
        "weight_n": 13000, "mass_kg": 1325.6, "length_m": 4.5, "cg_from_front_axle_m": 1.1,
        "cg_height_m": 0.55, "pitch_kg_m2": 2200, "roll_kg_m2": 450, "yaw_kg_m2": 2300,
        "vin": "VIN0001", "test_date": "01-Jan-90", "comment": "",
    }  # fmt: skip
    base.update(kw)
    return base


def _write(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def test_filtros_cuentan_cada_exclusion(tmp_path: Path) -> None:
    rows = [
        _row(vin="A"),
        _row(vin="A"),  # repetida
        _row(vin="B", ballast_n="200"),
        _row(vin="C", occupants="5"),
        _row(vin="D", yaw_kg_m2=""),
        _row(vin="E", comment="VRTC Outriggers"),
        _row(vin="F", body_type="XX"),
        _row(vin="G", body_type="PU"),
    ]
    path = tmp_path / "inercia.csv"
    _write(path, rows)
    vehicles, counts = ig.load_vehicles(path)
    assert [v.group for v in vehicles] == ["auto", "pickup"]
    assert counts == {
        "total": 8,
        "usados": 2,
        "medicion_repetida": 1,
        "con_lastre_u_ocupantes": 2,
        "sin_guinada_masa_largo_cg_o_vias": 1,
        "estabilizadores_lastre_o_instrumentacion": 1,
        "carroceria_sin_grupo": 1,
    }


def test_el_modelo_reproduce_un_grupo_homogeneo() -> None:
    """Si todos tienen el mismo k/L, dejar uno fuera da error cero y c es ese valor."""
    vs = [
        ig.Vehicle("v", 1990, "4S", "auto", m, length, 2.6, 1.45, 1.1, m * (0.29 * length) ** 2)
        for m, length in ((1200, 4.2), (1400, 4.6), (1600, 4.9), (1100, 4.0), (1300, 4.4))
    ]
    rep = ig.evaluate(vs)["grupos"]["auto"]
    assert rep["c_radio_de_giro_sobre_largo"] == pytest.approx(0.29)
    assert rep["modelo"]["error_relativo_medio"] == pytest.approx(0.0, abs=1e-9)


def test_tabla_versionada_sale_del_csv(tmp_path: Path) -> None:
    vehicles, _ = ig.load_vehicles(CSV_PATH)
    out = ig.write_table(ig.evaluate(vehicles), tmp_path / "yaw_inertia.json")
    assert out.read_bytes() == ig.TABLE_PATH.read_bytes()


def test_el_solver_usa_la_tabla() -> None:
    from croquis_solver.inertia import yaw_inertia
    from croquis_solver.models import Body2D

    doc = json.loads(ig.TABLE_PATH.read_text(encoding="utf-8"))
    c = doc["grupos"]["auto"]["c"]
    sedan = yaw_inertia("sedan_mediano", 1500.0, 4.8, 1.8)
    assert (sedan.origen, sedan.radius_over_length) == ("nhtsa", c)
    assert math.isclose(sedan.value, 1500.0 * (c * 4.8) ** 2)
    moto = yaw_inertia("motocicleta", 200.0, 2.1, 0.8)
    assert moto.origen == "supuesto"
    assert math.isclose(moto.value, Body2D.box_inertia(200.0, 2.1, 0.8))
    # Para un auto la placa uniforme daba más inercia que la medida.
    assert sedan.value < Body2D.box_inertia(1500.0, 4.8, 1.8)
