"""Lectura de la base de parámetros inerciales de NHTSA (VRTC): filas reales del PDF."""

import pytest

from croquis_data import nhtsa_inercia as n

SPEC_ROWS = [
    # Comentario libre al final.
    "1987 Ford Thunderbird LX V119A 2 2C 1 Lt Ld R 2.637 1.499 1.486 1.37 17437 F "
    "Instrumented for handling testing",
    # Ocupantes N/A y lastre "GVWR".
    "1987 Chevrolet Astro Van V139C 1 VN   N/A  GVWR R 2.837 1.651 1.664 1.82 23451 F",
    # Peso N/A y sin tanque.
    "1997 Jeep Cherokee N/A TT MP 1 0 4 2.578 1.466 1.468 1.66 N/A",
    "1984 Audi Quattro 4000 V210 2 4S 0 0 4 2.520 1.389 1.405 1.35 12161 F",
]


@pytest.mark.parametrize("row", SPEC_ROWS)
def test_filas_de_especificaciones(row: str) -> None:
    m = n.SPEC_RE.match(row)
    assert m is not None
    assert m["drive"] in {"4", "F", "R"}


def test_campos_de_una_fila() -> None:
    m = n.SPEC_RE.match(SPEC_ROWS[0])
    assert m is not None
    assert (m["name"], m["vno"], m["type"], m["ballast"], m["wb"], m["w"]) == (
        "Ford Thunderbird LX",
        "V119A",
        "2C",
        "Lt Ld",
        "2.637",
        "17437",
    )
    assert m["comment"] == "Instrumented for handling testing"


@pytest.mark.parametrize(
    "row",
    [
        "WAUFB0850EA043532 19-Aug-88 #01 4.50",
        "1GNDM19W1WB157169",  # las de 1998 (VIMF) solo traen el VIN
        "N/A May 1988 #01 N/A",
        "1G8CT18BXE106859? 08-Aug-88 #01 N/A",
        "WPLB310-006833 26-Aug-88 #01 4.19",
    ],
)
def test_filas_de_vin(row: str) -> None:
    assert n.VIN_RE.match(row) is not None


def test_filas_numericas_completas_y_cortas() -> None:
    assert n.NUM_RE.match("1.298 0.736 3741 963 3973 168 0.973 1.122")
    assert n.NUM_RE.match("1.124 0.506 2328 404 2352 N/A 1.381")
    assert n.NUM_RE.match("N/A 1.025")  # cuenta para emparejar, sin columnas ubicables
    assert not n.NUM_RE.match("1.025")


def test_tipo_de_pagina_por_encabezado() -> None:
    assert n._page_kind(["Wheel- Track Width Roof"]) == "spec"  # pyright: ignore[reportPrivateUsage]
    assert n._page_kind(["CG Location (m) Moments of Inertia"]) == "num"  # pyright: ignore[reportPrivateUsage]
    assert n._page_kind(["Test Run Length", "VIN Date No. (m)"]) == "vin"  # pyright: ignore[reportPrivateUsage]
    assert n._page_kind(["otra cosa"]) == ""  # pyright: ignore[reportPrivateUsage]


@pytest.mark.skipif(
    not (n.RAW_DIR / n.PDF_NAME).exists(), reason="Sin el PDF crudo (croquis-data inercia download)"
)
def test_csv_versionado_al_dia_y_tablas_emparejadas() -> None:
    rows = n.parse(n.RAW_DIR / n.PDF_NAME)
    assert len(rows) == 495
    first = rows[0]
    assert (first.vehicle, first.yaw_kg_m2, first.length_m, first.vin) == (
        "Audi Quattro 4000",
        2352.0,
        4.5,
        "WAUFB0850EA043532",
    )
    assert n.build(check=True)
