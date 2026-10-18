"""Inventario de E5: convención del centro del daño D en CISS y estado de las fotos de NHTSA."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from pathlib import Path

from croquis_eval import e5_inventario as inv
from croquis_eval.e5_casos import Caso


def _csv(rows: list[dict[str, str]]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue()


def test_ciss_d_convention_counts_matches(tmp_path: Path) -> None:
    cdc = [
        # Frente: empieza 80 cm a la izquierda y va a la derecha 160 → centro 0.
        {
            "CASEID": "1",
            "VEHNO": "1",
            "FIELDL": "160",
            "FIELDLD": "0",
            "FIELDLLOCATION": "Begins 80cm left of center point, extending right",
        },
        # Frente: empieza 20 cm a la derecha y va a la izquierda 100 → centro −30 (no −40).
        {
            "CASEID": "1",
            "VEHNO": "2",
            "FIELDL": "100",
            "FIELDLD": "-40",
            "FIELDLLOCATION": "Begins 20cm right of center point, extending left",
        },
        # Costado, batalla 270: empieza 64 cm detrás del eje delantero (135) y va hacia atrás 170
        # → centro 135 − 64 − 85 = −14; D = −16 (a 3 cm).
        {
            "CASEID": "2",
            "VEHNO": "1",
            "FIELDL": "170",
            "FIELDLD": "-16",
            "FIELDLLOCATION": "Begins 64cm rear of front axle, extending rearward",
        },
        # No medido: no cuenta.
        {
            "CASEID": "2",
            "VEHNO": "1",
            "FIELDL": "777",
            "FIELDLD": "777",
            "FIELDLLOCATION": "Not Measured",
        },
    ]
    spec = [{"CASEID": "2", "VEHNO": "1", "WHEELBASE": "270"}]
    path = tmp_path / "ciss.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("CDC.csv", _csv(cdc))
        z.writestr("VEHSPEC.csv", _csv(spec))
    out = inv.ciss_d_convention(path)
    assert out["frente_y_trasera"] == {"total": 2, "coincide": 1, "no_coincide": 1}
    assert out["costados"] == {"total": 1, "a_3_cm": 1}
    assert inv.ciss_d_convention(tmp_path / "no-hay.zip") == {"disponible": False}


def _caso(test_no: int, lado: str) -> Caso:
    return Caso(
        fuente="nhtsa", id=f"nhtsa:{test_no}", tipo="frontal", lado=lado, clase="sedan_mediano",
        masa_kg=1500, largo_m=4.6, ancho_m=1.8, perfil_m=(0.1, 0.1, 0.1, 0.1, 0.1, 0.1),
        ancho_dano_m=1.5, centro_dano_m=0.0, velocidad_kmh=56, dv_kmh=None, anio=2020,
        detalle="VTB",
    )  # fmt: skip


def test_photo_status(tmp_path: Path) -> None:
    def media(n: int, names: list[str]) -> None:
        doc = {"test_no": n, "photos": [{"fileName": x} for x in names], "reports": []}
        (tmp_path / f"media_{n}.json").write_text(json.dumps(doc), encoding="utf-8")

    media(1, ["Post-Test Front View.JPG"])
    media(2, ["v00002P001.jpg", "v00002P002.JPG"])
    media(3, ["Pre-Test Front View.JPG"])
    media(4, [])
    assert inv.photo_status(_caso(1, "F"), tmp_path) == "foto_por_nombre"
    assert inv.photo_status(_caso(2, "F"), tmp_path) == "fotos_numeradas"
    assert inv.photo_status(_caso(3, "F"), tmp_path) == "sin_vista_de_la_cara"
    assert inv.photo_status(_caso(4, "F"), tmp_path) == "sin_fotos"
    assert inv.photo_status(_caso(5, "F"), tmp_path) == "sin_lista"
