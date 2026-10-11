from __future__ import annotations

import json
from typing import Any

from croquis_data import vehicle_classes as vc


def _row(clase: str, **kw: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "clase": clase,
        "marca": "M",
        "modelo": "X",
        "anio": 2026,
        "masa_vacio_kg": None,
        "pbv_kg": None,
        "largo_mm": None,
        "ancho_mm": None,
        "alto_mm": None,
        "distancia_entre_ejes_mm": None,
        "fuente_url": "https://example.test",
        "fuente_tipo": "oficial",
        "fecha_consulta": "2026-10-10",
        "notas": "",
    }
    base.update(kw)
    return base


def test_rangos_con_margen_mediana_y_tope_por_pbv() -> None:
    models = [
        _row(
            "sedan_compacto",
            masa_vacio_kg=1000,
            pbv_kg=1500,
            largo_mm=4400,
            ancho_mm=1700,
            alto_mm=1500,
            distancia_entre_ejes_mm=2600,
        ),
        _row(
            "sedan_compacto",
            masa_vacio_kg=1200,
            pbv_kg=1700,
            largo_mm=4600,
            ancho_mm=1760,
            alto_mm=1480,
            distancia_entre_ejes_mm=2650,
        ),
        _row(
            "sedan_compacto",
            masa_vacio_kg=1100,
            largo_mm=4500,
            ancho_mm=1740,
            alto_mm=1470,
            distancia_entre_ejes_mm=2620,
        ),
    ]
    doc = vc.build_classes(models, generated_at="2026-10-10", clases_incluidas=["sedan_compacto"])
    c = doc["clases"]["sedan_compacto"]
    assert c["masa_kg"] == [750, 1700]  # 1000*0.75 ; max(1200*1.35=1620, PBV 1700)
    assert c["largo_m"] == [3.96, 5.06]
    assert c["tipico"]["masa_kg"] == 1100
    assert c["tipico"]["largo_m"] == 4.5
    assert c["origen"]["masa_kg"] == "ficha"
    assert c["origen"]["velocidad_max_kmh"] == "supuesto"
    assert c["n_modelos"] == 3
    assert c["n_modelos_completos"] == 3
    assert c["velocidad_max_kmh"] == vc.VELOCIDAD_MAX_KMH["sedan_compacto"]


def test_sin_fichas_usa_supuestos_y_lo_marca() -> None:
    doc = vc.build_classes([], generated_at="2026-10-10", clases_incluidas=["autobus"])
    bus = doc["clases"]["autobus"]
    assert bus["origen"]["masa_kg"] == "supuesto"
    assert bus["masa_kg"] == list(vc.SUPUESTOS["autobus"]["masa_kg"])
    assert bus["n_modelos"] == 0
    # Con PBV pero sin tara: tope = PBV y origen derivado.
    doc2 = vc.build_classes(
        [_row("autobus", pbv_kg=14515, largo_mm=10300)],
        generated_at="2026-10-10",
        clases_incluidas=["autobus"],
    )
    bus2 = doc2["clases"]["autobus"]
    assert bus2["origen"]["masa_kg"] == "derivado_pbv"
    assert bus2["masa_kg"][1] == 16000  # el supuesto superior ya cubre el PBV
    assert bus2["origen"]["largo_m"] == "ficha"
    assert bus2["largo_m"] == [9.27, 11.33]


def test_fuente_secundaria_se_distingue() -> None:
    doc = vc.build_classes(
        [_row("bicicleta", masa_vacio_kg=15, fuente_tipo="secundaria")],
        generated_at="2026-10-10",
        clases_incluidas=["bicicleta"],
    )
    assert doc["clases"]["bicicleta"]["origen"]["masa_kg"] == "secundaria"


def test_tabla_versionada_esta_al_dia() -> None:
    assert vc.MODELS_PATH.exists()
    assert vc.OUT_PATH.exists(), "Corre `uv run croquis-data vehicles build`"
    assert vc.check(), "Corre `uv run croquis-data vehicles build`"
    doc = json.loads(vc.OUT_PATH.read_text(encoding="utf-8"))
    assert set(doc["clases"]) == set(vc.CLASES)
    for clase, c in doc["clases"].items():
        for key in vc.CAMPOS:
            lo, hi = c[key]
            assert lo < hi, (clase, key)
            assert lo <= c["tipico"][key] <= hi, (clase, key)


def test_clase_sin_fichas_ni_respaldo_falla_claramente() -> None:
    import pytest

    with pytest.raises(ValueError, match="Sin fichas ni respaldo"):
        vc.build_classes([], clases_incluidas=["sedan_compacto"])
