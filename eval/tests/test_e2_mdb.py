"""Rigidez lateral y trasera desde barrera móvil: la derivación es la inversa del solver."""

import csv
import json
import math
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_eval import e2_mdb as m
from croquis_solver.crash3 import crush_energy, delta_v_pair

SIDE = [0.0, 0.128, 0.129, 0.136, 0.056, 0.007]  # perfil lateral real (prueba 15477), m


def test_conversion_winsmash_a_crash3() -> None:
    k = m.from_d(63.3, 800.0)
    assert k.a == pytest.approx(63.3 * 800.0)
    assert k.b == pytest.approx(800.0**2)
    assert k.g == pytest.approx(63.3**2 / 2)


def test_barrera_rigida_recupera_d1_exacto() -> None:
    """Con barrera rígida, la energía que absorbe el vehículo con d1 dado se vuelve a despejar."""
    d1 = 900.0
    e = crush_energy(SIDE, 3.3, m.from_d(m.SIDE_D0, d1), 27.0)
    s = m.solve_d1(e, m.SIDE_D0, SIDE, 3.3, 27.0, deformable=False)
    assert s is not None
    assert s.d1 == pytest.approx(d1, rel=1e-6)
    assert s.energia_barrera_j == 0.0


def test_barrera_deformable_se_lleva_la_fraccion_medida() -> None:
    d1 = 900.0
    ev = crush_energy(SIDE, 3.3, m.from_d(m.SIDE_D0, d1), 27.0)
    total = ev / (1 - m.MDB_ENERGY_FRACTION)
    s = m.solve_d1(total, m.SIDE_D0, SIDE, 3.3, 27.0, deformable=True)
    assert s is not None
    assert s.d1 == pytest.approx(d1, rel=1e-6)
    assert s.fraccion_barrera == pytest.approx(m.MDB_ENERGY_FRACTION)
    # Con el 5 % de NHTSA el vehículo se queda con más energía: sale más rígido.
    s5 = m.solve_d1(total, m.SIDE_D0, SIDE, 3.3, 27.0, True, m.NHTSA_MDB_ENERGY_FRACTION)
    assert s5 is not None
    assert s5.d1 > s.d1


def test_sin_solucion_si_el_umbral_supera_la_energia() -> None:
    assert m.solve_d1(10.0, m.SIDE_D0, SIDE, 3.3, 0.0, deformable=True) is None


def test_el_dv_del_solver_reproduce_la_prueba() -> None:
    """Con la rigidez derivada, el cálculo del solver da el ΔV de momento 1-D de la prueba."""
    mv, mb, v = 1500.0, 1368.0, 62.0 / 3.6
    e = 0.5 * m.reduced_mass(mv, mb) * v * v
    for deformable in (True, False):
        s = m.solve_d1(e, m.SIDE_D0, SIDE, 3.3, 27.0, deformable=deformable)
        assert s is not None
        k = m.from_d(m.SIDE_D0, s.d1)
        dv = m.predicted_delta_v(k, SIDE, 3.3, 27.0, deformable, mv, mb)
        assert dv == pytest.approx(delta_v_pair(e, mv, mb)[0], rel=1e-6)
        assert dv == pytest.approx(v * mb / (mv + mb), rel=1e-6)


def test_d0_trasero_es_el_umbral_de_16_kmh() -> None:
    d0 = m.rear_d0(1500.0, 1800.0, 1.7)
    g_total = d0 * d0 / 2 * 1.7
    assert g_total == pytest.approx(0.5 * m.reduced_mass(1500.0, 1800.0) * (16 / 3.6) ** 2)


@settings(max_examples=60, deadline=None)
@given(
    e=st.floats(2e4, 3e5),
    off=st.floats(0.0, 40.0),
    deformable=st.booleans(),
)
def test_mas_energia_pide_mas_rigidez(e: float, off: float, deformable: bool) -> None:
    a = m.solve_d1(e, m.SIDE_D0, SIDE, 3.3, off, deformable)
    b = m.solve_d1(e * 1.1, m.SIDE_D0, SIDE, 3.3, off, deformable)
    if a is not None and b is not None:
        assert b.d1 > a.d1
        assert math.isfinite(b.d1)


COLUMNS = [
    "test_no", "test_date", "test_type", "test_performer", "model_year", "make", "model",
    "body_type", "test_weight_kg", "curb_weight_kg", "length_mm", "width_mm",
    "cg_behind_front_axle_mm", "speed_kmh", "closing_speed_kmh", "impact_angle_deg", "pdof_deg",
    "crabbed_angle_deg", "barrier_rigid", "barrier_shape", "barrier_angle_deg",
    "pole_diameter_mm", "offset_distance_mm", "max_crush_mm", "dpd1_mm", "dpd2_mm", "dpd3_mm",
    "dpd4_mm", "dpd5_mm", "dpd6_mm", "total_indentation_length_mm", "damage_offset_mm",
    "damage_index", "vehicle_modification",
]  # fmt: skip


def _barrier(
    n: int, model: str, kg: float, kmh: float, crab: float, angle: float
) -> dict[str, object]:
    return {"test_no": n, "make": "NHTSA", "model": model, "test_weight_kg": kg,
            "speed_kmh": kmh, "crabbed_angle_deg": crab, "impact_angle_deg": angle,
            "pdof_deg": crab}  # fmt: skip


def _car(
    n: int, angle: float, pdof: float, dpd: list[int], length_l: int, **kw: object
) -> dict[str, object]:
    row: dict[str, object] = {
        "test_no": n, "test_type": "NEW CAR ASSESSMENT TEST", "model_year": 2015, "make": "X",
        "model": "Y", "body_type": "4 DOOR SEDAN", "test_weight_kg": 1600, "length_mm": 4800,
        "width_mm": 1800, "speed_kmh": 0, "impact_angle_deg": angle, "pdof_deg": pdof,
        "total_indentation_length_mm": length_l, "vehicle_modification": "PRODUCTION VEHICLE",
    }  # fmt: skip
    row.update({f"dpd{i + 1}_mm": d for i, d in enumerate(dpd)})
    row.update(kw)
    return row


def _write(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in COLUMNS})


def test_carga_empareja_filtra_y_deriva(tmp_path: Path) -> None:
    side = [-8, 128, 129, 136, 56, 7]
    rear = [150, 160, 170, 170, 160, 150]
    rows = [
        # 1: FMVSS 214 válida (costado izquierdo).
        _barrier(1, "DEFORMABLE IMPACTOR", 1366, 62.0, 27, 270),
        _car(1, 270, 297, side, 3300),
        # 2: barrera de otra masa (no es la de Johnson).
        _barrier(2, "DEFORMABLE IMPACTOR", 1565, 62.0, 27, 270),
        _car(2, 270, 297, side, 3300),
        # 3: trasera con barrera rígida (FMVSS 301 hasta 2006).
        _barrier(3, "FLAT IMPACTOR", 1804, 48.0, 0, 180),
        _car(3, 180, 180, rear, 1700),
        # 4: vehículo modificado.
        _barrier(4, "DEFORMABLE IMPACTOR", 1366, 62.0, 27, 270),
        _car(4, 270, 297, side, 3300, vehicle_modification="MODIFIED VEHICLE"),
        # 5: lateral con avance de 19° (no es FMVSS 214).
        _barrier(5, "DEFORMABLE IMPACTOR", 1366, 62.0, 19, 270),
        _car(5, 270, 289, side, 3300),
        # 6: sin perfil de daño.
        _barrier(6, "DEFORMABLE IMPACTOR", 1366, 62.0, 27, 90),
        _car(6, 90, 63, [0, 0, 0, 0, 0, 0], 3300),
        # 7: valores centinela (no medidos).
        _barrier(7, "FLAT IMPACTOR", 1804, 48.0, 0, 180),
        _car(7, 180, 180, [9999] * 6, 99999),
        # 8: trasera con barrera deformable: la energía de la cara es desconocida.
        _barrier(8, "DEFORMABLE IMPACTOR", 1366, 80.0, 0, 180),
        _car(8, 180, 180, rear, 1300),
        # 9: trasera con barrera rígida de un modelo 1985: vale (no hay modernas completas).
        _barrier(9, "FLAT IMPACTOR", 1804, 48.0, 0, 180),
        _car(9, 180, 180, rear, 1700, model_year=1985),
        # 10: costado de un modelo 1985: no (hay de sobra desde 1995).
        _barrier(10, "DEFORMABLE IMPACTOR", 1366, 62.0, 27, 270),
        _car(10, 270, 297, side, 3300, model_year=1985),
    ]
    path = tmp_path / "itv.csv"
    _write(path, rows)
    tests, counts = m.load_tests(path)
    assert [t.test_no for t in tests] == [1, 3, 9]
    assert counts == {
        "total": 10,
        "usadas": 3,
        "trasera_con_barrera_deformable": 1,
        "modelo_anterior_al_minimo": 1,
        "valor_centinela_sin_medir": 1,
        "barrera_no_estandar": 1,
        "vehiculo_modificado": 1,
        "lateral_no_fmvss214": 1,
        "aplastamiento_implausible": 1,
    }
    side_t, rear_t, rear_old = tests
    assert (rear_old.zona, rear_old.model_year) == ("trasera", 1985)
    assert (side_t.zona, side_t.barrier, side_t.plano) == ("lateral", "deformable", "L")
    assert side_t.profile_m[0] == 0.0  # lámina abombada: sin aplastamiento
    assert side_t.offset_deg == pytest.approx(27.0)
    assert side_t.fraccion_barrera == pytest.approx(m.MDB_ENERGY_FRACTION, abs=1e-4)
    assert (rear_t.zona, rear_t.barrier, rear_t.fraccion_barrera) == ("trasera", "rigida", 0.0)
    # El cálculo del solver reproduce el ΔV de cada prueba con su propia rigidez.
    for t in tests:
        k = m.from_d(t.d0, t.d1)
        dv = m.predicted_delta_v(
            k, t.profile_m, t.width_m, t.offset_deg, t.deformable, t.mass_kg, t.barrier_kg
        )
        assert dv == pytest.approx(t.delta_v_ms, rel=1e-4)


def test_la_tabla_conserva_la_zona_frontal(tmp_path: Path) -> None:
    path = tmp_path / "rigidez.json"
    frontal = {"a_n_m": 1.0, "b_n_m2": 2.0, "origen": "nhtsa", "n_tests": 9}
    path.write_text(
        json.dumps(
            {"parametros": {"b0_kmh": 8.0}, "clases": {"sedan_mediano": {"frontal": frontal}}}
        ),
        encoding="utf-8",
    )
    zone = {"n": 6, "a_n_m": 3.0, "b_n_m2": 4.0, "muestras_ab": [[3, 4]]}
    small = {"n": 2, "a_n_m": 5.0, "b_n_m2": 6.0, "muestras_ab": [[5, 6]]}
    m.write_stiffness_zones(
        {
            "lateral": {"clases": {"sedan_mediano": zone, "pickup": small}},
            "trasera": {"clases": {}},
        },
        path,
    )
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert doc["clases"]["sedan_mediano"]["frontal"] == frontal
    assert doc["clases"]["sedan_mediano"]["lateral"]["n_tests"] == 6
    assert "pickup" not in doc["clases"]  # menos de 5 pruebas: respaldo en el solver
    assert list(doc)[:5] == [
        "_generado_por",
        "_fuente",
        "_nota",
        "parametros",
        "parametros_lateral_trasera",
    ]
