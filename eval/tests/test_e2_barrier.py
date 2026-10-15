from __future__ import annotations

import csv
import json
import math
from pathlib import Path

from croquis_eval import e2_barrier as e2
from croquis_solver.crash3 import Stiffness

COLS = [
    "test_no", "model_year", "make", "model", "body_type", "test_weight_kg", "length_mm",
    "width_mm",
    "speed_kmh", "closing_speed_kmh", "impact_angle_deg", "barrier_rigid", "barrier_shape",
    "barrier_angle_deg", "offset_distance_mm", "max_crush_mm", "dpd1_mm", "dpd2_mm", "dpd3_mm",
    "dpd4_mm", "dpd5_mm", "dpd6_mm", "vehicle_modification",
]  # fmt: skip


def _row(
    test_no: int, body: str, length: int, mass: float, speed: float, crush: float, **kw: object
) -> dict[str, object]:
    r: dict[str, object] = {
        "test_no": test_no, "model_year": 2015, "make": "M", "model": "X", "body_type": body,
        "test_weight_kg": mass, "length_mm": length, "width_mm": 1750, "speed_kmh": speed,
        "closing_speed_kmh": speed, "impact_angle_deg": 0, "barrier_rigid": "RIGID",
        "barrier_shape": "FLAT BARRIER", "barrier_angle_deg": 0, "offset_distance_mm": "",
        "max_crush_mm": crush + 40, "vehicle_modification": "PRODUCTION VEHICLE",
    }  # fmt: skip
    for i in range(1, 7):
        r[f"dpd{i}_mm"] = crush
    r.update(kw)
    return r


def _write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in COLS})


def test_classify_mapea_carrocerias() -> None:
    assert e2.classify("4 DOOR SEDAN", 4.4) == "sedan_compacto"
    assert e2.classify("4 DOOR SEDAN", 4.8) == "sedan_mediano"
    assert e2.classify("THREE DOOR HATCHBACK", 3.9) == "hatchback"
    assert e2.classify("SPORT UTILITY VEHICLE", 4.5) == "suv_compacta"
    assert e2.classify("SPORT UTILITY VEHICLE", 5.2) == "suv_grande"
    assert e2.classify("PICKUP TRUCK", 5.3) == "pickup"
    assert e2.classify("MINIVAN", 5.0) == "van"
    assert e2.classify("MOTORCYCLE", 2.0) is None


def test_coeficientes_coinciden_con_el_metodo_de_campbell() -> None:
    t = e2.BarrierTest(
        1, "sedan_compacto", 2015, "M", "X", 1300.0, 1.75, 4.4, 56.0 / 3.6, 0.55, 0.6
    )
    dv = 56.0 / 3.6 * 1.1
    b1 = (dv - 8 / 3.6) / 0.55
    assert math.isclose(t.a_n_m, 1300 * (8 / 3.6) * b1 / 1.75)
    assert math.isclose(t.b_n_m2, 1300 * b1 * b1 / 1.75)
    # La predicción con sus propios coeficientes recupera la medición.
    assert math.isclose(e2.predict_crush(t, t.a_n_m, t.b_n_m2), 0.55, rel_tol=1e-9)
    assert math.isclose(e2.predict_speed(t, t.a_n_m, t.b_n_m2), t.speed_ms, rel_tol=1e-9)
    assert Stiffness(t.a_n_m, t.b_n_m2).g > 0


def test_filtros_y_evaluacion_con_csv_sintetico(tmp_path: Path) -> None:
    rows: list[dict[str, object]] = []
    for i in range(6):  # seis sedanes compactos con ligera variación
        rows.append(_row(100 + i, "4 DOOR SEDAN", 4400, 1200 + 20 * i, 56.0, 520 + 10 * i))
    rows.append(_row(200, "4 DOOR SEDAN", 4400, 1200, 56.0, 520, barrier_rigid="DEFORMABLE"))
    rows.append(_row(201, "4 DOOR SEDAN", 4400, 1200, 56.0, 520, impact_angle_deg=30))
    rows.append(_row(202, "4 DOOR SEDAN", 4400, 1200, 20.0, 150))  # fuera de rango de velocidad
    rows.append(_row(203, "4 DOOR SEDAN", 4400, 1200, 56.0, 0))  # sin perfil
    rows.append(_row(204, "MOTORCYCLE", 2000, 180, 56.0, 300))  # sin clase
    rows.append(_row(205, "4 DOOR SEDAN", 4400, 1200, 56.0, 520, model_year=1988))
    csv_path = tmp_path / "vtb.csv"
    _write_csv(csv_path, rows)
    tests, counts = e2.load_tests(csv_path)
    assert counts["total"] == 12
    assert counts["usadas"] == 6
    assert counts["barrera_no_rigida"] == 1
    assert counts["angulo_no_cero"] == 1
    assert counts["velocidad_fuera_de_rango"] == 1
    assert counts["sin_perfil_de_dano"] == 1
    assert counts["carroceria_no_mapeada"] == 1
    assert counts["modelo_anterior_a_1995"] == 1
    report = e2.evaluate(tests)
    c = report["clases"]["sedan_compacto"]
    assert c["n"] == 6
    assert c["evaluada"]
    assert c["mae_velocidad_kmh"] is not None
    assert c["mae_velocidad_kmh"] < 3.0  # datos casi homogéneos ⇒ error pequeño
    assert report["global"]["n_evaluadas"] == 6
    out = e2.write_stiffness_table(report, tmp_path / "stiff.json")
    doc = json.loads(out.read_text(encoding="utf-8"))
    assert doc["clases"]["sedan_compacto"]["frontal"]["origen"] == "nhtsa"
    assert doc["clases"]["sedan_compacto"]["frontal"]["n_tests"] == 6
    result = e2.main(csv_path, tmp_path / "results", tmp_path / "stiff2.json")
    payload = json.loads(result.read_text(encoding="utf-8"))
    assert payload["name"] == "e2_barrier"
    assert len(payload["pruebas_usadas"]) == 6


def test_tabla_de_rigidez_versionada_se_reproduce_desde_el_csv(tmp_path: Path) -> None:
    """La tabla que usa el solver sale exactamente de E2 (frontal) y E2 lateral y trasera sobre
    los CSV versionados, en cualquier orden."""
    from croquis_eval import e2_mdb

    tests, _ = e2.load_tests(e2.CSV_PATH)
    mdb, _ = e2_mdb.load_tests(e2_mdb.CSV_PATH)
    for order in ("frontal_primero", "lateral_primero"):
        out = tmp_path / f"{order}.json"
        if order == "lateral_primero":
            out.write_text(json.dumps({"clases": {}}), encoding="utf-8")
            e2_mdb.write_stiffness_zones(e2_mdb.evaluate(mdb), out)
            e2.write_stiffness_table(e2.evaluate(tests), out)
        else:
            e2.write_stiffness_table(e2.evaluate(tests), out)
            e2_mdb.write_stiffness_zones(e2_mdb.evaluate(mdb), out)
        doc = json.loads(out.read_text(encoding="utf-8"))
        assert doc["parametros"]["b0_kmh"] == e2.B0_KMH
        assert out.read_bytes() == e2.STIFFNESS_PATH.read_bytes(), order


def test_el_solver_usa_la_rigidez_medida() -> None:
    from croquis_solver.stiffness import stiffness_for

    doc = json.loads(e2.STIFFNESS_PATH.read_text(encoding="utf-8"))
    for clase, zonas in doc["clases"].items():
        if "frontal" not in zonas:
            continue
        entry = stiffness_for(clase, "frontal")
        assert entry.origen == "nhtsa"
        assert entry.n_tests == zonas["frontal"]["n_tests"] >= e2.MIN_TESTS_PER_CLASS
        assert math.isclose(entry.stiffness.a, zonas["frontal"]["a_n_m"])
    # Lateral y trasera desde las pruebas de barrera móvil (E2 lateral y trasera).
    for zona in ("lateral", "trasera"):
        entry = stiffness_for("sedan_mediano", zona)
        assert entry.origen == "nhtsa"
        assert entry.n_tests == doc["clases"]["sedan_mediano"][zona]["n_tests"]
        assert len(entry.samples) == entry.n_tests
    # Una clase sin pruebas suficientes en la zona usa el respaldo.
    assert stiffness_for("suv_grande", "trasera").origen == "supuesto"
    assert stiffness_for("motocicleta", "frontal").origen == "supuesto"
