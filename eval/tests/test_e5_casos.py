"""Casos de E5: tipos de impacto y lectura de NHTSA y CISS (reglas del ADR 0032)."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from croquis_eval import e5_casos as e5


@pytest.mark.parametrize(
    ("shape", "offset", "angle", "tipo"),
    [
        ("LOAD CELL BARRIER", "0", "0", "frontal"),
        ("FLAT BARRIER", "", "0", "frontal"),
        ("POLE", "0", "0", "poste"),
        ("LUMINARE", "0", "0", "poste"),
        ("EEVC OFFSET BARRIER", "0", "0", "frontal_desplazado"),
        ("FLAT BARRIER", "450", "0", "frontal_desplazado"),
        ("FLAT ANGLED BARRIER", "0", "30", "frontal_desplazado"),
        ("IMPACT ATTENUATOR", "0", "0", None),
        ("OTHER", "0", "0", None),
        ("", "0", "0", None),
    ],
)
def test_vtb_tipo(shape: str, offset: str, angle: str, tipo: str | None) -> None:
    row = {"barrier_shape": shape, "offset_distance_mm": offset, "barrier_angle_deg": angle}
    assert e5.nhtsa_vtb_tipo(row) == tipo


def test_itv_tipo() -> None:
    assert e5.nhtsa_itv_tipo({"test_type": "NEW CAR ASSESSMENT TEST"}, "L") == "lateral"
    assert e5.nhtsa_itv_tipo({"test_type": "FMVSS 301 FUEL SYSTEM INTEGRITY"}, "B") == "alcance"
    assert (
        e5.nhtsa_itv_tipo({"test_type": "RMDB INTO FRONT 15 DEGREE STATIONARY VEHICLE"}, "F")
        == "frontal_desplazado"
    )
    assert e5.nhtsa_itv_tipo({"test_type": "BASELINE TEST"}, "B") is None


@pytest.mark.parametrize(
    ("plano", "zona", "objeto", "tipo"),
    [
        ("F", "D", "", "frontal"),
        ("F", "Y", "", "frontal_desplazado"),
        ("F", "L", "muro", "frontal_desplazado"),
        ("F", "D", "poste", "poste"),
        ("L", "P", "arbol", "poste"),
        ("R", "P", "", "lateral"),
        ("B", "D", "", "alcance"),
        ("T", "D", "", None),
    ],
)
def test_ciss_tipo(plano: str, zona: str, objeto: str, tipo: str | None) -> None:
    assert e5.ciss_tipo(plano, zona, objeto) == tipo


def _write(path: Path, rows: list[dict[str, str]]) -> None:
    cols = sorted({k for r in rows for k in r})
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def test_nhtsa_cases_converts_units_and_skips_barrier_rows(tmp_path: Path) -> None:
    base = {
        "test_no": "15703",
        "body_type": "4 DOOR SEDAN",
        "length_mm": "4600",
        "width_mm": "1800",
        "test_weight_kg": "1700",
        "speed_kmh": "56.3",
        "closing_speed_kmh": "",
        "damage_index": "12FDEW3",
        "barrier_shape": "LOAD CELL BARRIER",
        "offset_distance_mm": "0",
        "barrier_angle_deg": "0",
        "total_indentation_length_mm": "1500",
        "damage_offset_mm": "-50",
        "model_year": "2021",
        **{f"dpd{i}_mm": str(100 * i) for i in range(1, 7)},
    }
    rows = [base, base | {"test_no": "2", "body_type": "NOT APPLICABLE"}]
    _write(tmp_path / "vtb.csv", rows)
    cases = list(e5.nhtsa_cases(tmp_path / "vtb.csv", tmp_path / "no-hay.csv"))
    assert len(cases) == 1
    c = cases[0]
    assert (c.id, c.tipo, c.lado, c.clase) == ("nhtsa:15703", "frontal", "F", "sedan_mediano")
    assert c.perfil_m == pytest.approx((0.1, 0.2, 0.3, 0.4, 0.5, 0.6))
    assert (c.ancho_dano_m, c.centro_dano_m, c.velocidad_kmh) == (1.5, -0.05, 56.3)
    assert e5.nhtsa_test_no(c.id) == 15703


def test_ciss_cases_reads_profile_and_position(tmp_path: Path) -> None:
    row = {
        "anio": "2023",
        "caseid": "1-2",
        "vehno": "1",
        "evento": "1",
        "clase": "pickup",
        "masa_kg": "2300",
        "largo_cm": "580",
        "ancho_cm": "200",
        "plano": "L",
        "zona_horizontal": "P",
        "perfil_cm": json.dumps([0, 5, 20, 22, 8, 0]),
        "ancho_dano_cm": "180",
        "centro_dano_cm": "-30",
        "contacto": "vehiculo",
        "objeto": "",
        "dv_edr_kmh": "24.5",
    }
    _write(tmp_path / "ciss.csv", [row, row | {"perfil_cm": json.dumps([0, -1, 0, 0, 0, 0])}])
    cases = list(e5.ciss_cases(tmp_path / "ciss.csv"))
    assert len(cases) == 1  # el perfil con un valor negativo no es una medida válida
    c = cases[0]
    assert (c.tipo, c.lado, c.anio, c.dv_kmh) == ("lateral", "L", 2023, 24.5)
    assert c.perfil_m == pytest.approx((0, 0.05, 0.2, 0.22, 0.08, 0))
    assert (c.ancho_dano_m, c.centro_dano_m) == (1.8, -0.3)
    assert c.anio not in e5.CISS_DEV_YEARS
