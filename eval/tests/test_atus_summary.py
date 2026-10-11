from __future__ import annotations

import json
from pathlib import Path

import polars as pl

from croquis_eval.atus_summary import build_summary, main


def _write(dirpath: Path, name: str, df: pl.DataFrame) -> None:
    df.write_csv(dirpath / f"atus_{name}.csv")


def _fixture(tmp_path: Path) -> Path:
    p = tmp_path / "processed"
    p.mkdir()
    _write(
        p,
        "total",
        pl.DataFrame(
            {
                "anio": [2021, 2024, 2025],
                "accidentes": [100, 200, 220],
                "muertos": [10, 20, 18],
                "heridos": [50, 60, 70],
            }
        ),
    )
    tipos = [
        "Colisión con vehículo automotor",
        "Colisión con motocicleta",
        "Volcadura",
        "Colisión con peatón (atropellamiento)",
        "Colisión con ciclista",
    ]
    _write(
        p,
        "tipo",
        pl.DataFrame(
            {
                "anio": [2024] * 5 + [2025] * 5,
                "clave": tipos * 2,
                "accidentes": [120, 40, 20, 15, 5, 121, 50, 25, 16, 8],
                "muertos": [5, 8, 4, 3, 0, 4, 9, 3, 2, 0],
                "heridos": [10] * 10,
            }
        ),
    )
    _write(
        p,
        "entidad",
        pl.DataFrame(
            {
                "anio": [2025, 2025, 2025],
                "clave": [9, 15, 19],
                "nombre": ["Ciudad de México", "México", "Nuevo León"],
                "accidentes": [80, 70, 70],
                "muertos": [5, 9, 4],
                "heridos": [20, 20, 30],
            }
        ),
    )
    roles = ["conductor", "pasajero", "peaton", "ciclista", "otro", "no_especificado"]
    _write(
        p,
        "victimas",
        pl.DataFrame(
            {
                "anio": [2024] * 6 + [2025] * 6,
                "rol": roles * 2,
                "muertos": [10, 3, 5, 1, 1, 0, 8, 4, 6, 0, 0, 0],
                "heridos": [10] * 12,
            }
        ),
    )
    return p


def test_build_summary_calcula_cambios_y_ranking(tmp_path: Path) -> None:
    s = build_summary(_fixture(tmp_path))
    assert s["ultimo_anio"]["anio"] == 2025
    assert s["ultimo_anio"]["accidentes"] == 220
    assert s["ultimo_anio"]["cambio_accidentes_vs_anterior_pct"] == 10.0
    assert s["ultimo_anio"]["cambio_muertos_vs_anterior_pct"] == -10.0
    assert s["estado_de_mexico"]["lugar_por_muertos_ultimo_anio"] == 1
    assert s["tendencias"]["colision_con_motocicleta"]["cambio_pct"] == 25.0
    assert s["tendencias"]["peatones_muertos"] == {"ultimo": 6, "anterior": 5, "cambio_pct": 20.0}
    top = s["distribucion_tipo_ultimo_anio"][0]
    assert top["tipo"] == "Colisión con vehículo automotor"
    assert top["participacion"] == round(121 / 220, 4)
    assert s["referencia_plan"]["accidentes_2021"] == 100


def test_main_escribe_resultado(tmp_path: Path) -> None:
    out = main(_fixture(tmp_path), results_dir=tmp_path / "results")
    doc = json.loads(out.read_text(encoding="utf-8"))
    assert doc["name"] == "atus_summary"
    assert doc["ultimo_anio"]["accidentes"] == 220
