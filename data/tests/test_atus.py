from __future__ import annotations

import json
import zipfile
from pathlib import Path

import httpx
import polars as pl
import pytest

from croquis_data import atus

HEADER = (
    "COBERTURA,CVEGEO,CVE_ENT,CVE_MUN,ANIO,MES,ID_HORA,ID_MINUTO,ID_DIA,DIASEMANA,URBANA,SUBURBANA,"
    "TIPACCID,AUTOMOVIL,CAMPASAJ,MICROBUS,PASCAMION,OMNIBUS,TRANVIA,CAMIONETA,CAMION,TRACTOR,"
    "FERROCARRI,MOTOCICLET,BICICLETA,OTROVEHIC,CAUSAACCI,CAPAROD,SEXO,ALIENTO,CINTURON,ID_EDAD,"
    "CONDMUERTO,CONDHERIDO,PASAMUERTO,PASAHERIDO,PEATMUERTO,PEATHERIDO,CICLMUERTO,CICLHERIDO,"
    "OTROMUERTO,OTROHERIDO,NEMUERTO,NEHERIDO,CLASACC,ESTATUS"
)


def _row(
    year: int,
    ent: str,
    tipo: str,
    *,
    hora: str = "08",
    autos: int = 1,
    motos: int = 0,
    victims: tuple[int, ...] = (0,) * 12,
    clase: str = "Sólo daños",
    dia: str = "Lunes",
) -> str:
    v = ",".join(str(x) for x in victims)
    return (
        f"Municipal,{ent}001,{ent},001,{year},03,{hora},15,02,{dia},Accidente en intersección,"
        f"Sin accidente en esta zona,{tipo},{autos},0,0,0,0,0,0,0,0,0,{motos},0,0,Conductor,"
        f"Pavimentada,Hombre,No,Sí,30,{v},{clase},Cifras Definitivas"
    )


def _cert_cero(year: int, ent: str) -> str:
    return (
        f"Municipal,{ent}002,{ent},002,{year},12,99,99,32,Certificado cero,Certificado cero,"
        f"Certificado cero,Certificado cero,0,0,0,0,0,0,0,0,0,0,0,0,0,Certificado cero,"
        f"Certificado cero,Certificado cero,Certificado cero,Certificado cero,99,"
        f"0,0,0,0,0,0,0,0,0,0,0,0,Certificado cero,Cifras Definitivas"
    )


def _legacy_header() -> str:
    return HEADER.replace("CVE_ENT", "ID_ENTIDAD").replace("CVE_MUN", "ID_MUNICIPIO")


@pytest.fixture
def atus_zip(tmp_path: Path) -> Path:
    # 2024: 3 accidentes (1 fatal con peatón muerto) + 1 certificado cero que NO cuenta.
    rows_2024 = [
        HEADER,
        _row(2024, "15", "Colisión con vehículo automotor", autos=2),
        _row(
            2024,
            "15",
            "Colisión con peatón (atropellamiento)",
            victims=(0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0),
            clase="Fatal",
        ),
        _row(2024, "09", "Volcadura", hora="22", victims=(0, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0)),
        _cert_cero(2024, "01"),
    ]
    # 2025 con encabezado antiguo (ID_ENTIDAD) para probar la compatibilidad.
    rows_2025 = [
        _legacy_header(),
        _row(2025, "15", "Colisión con motocicleta", autos=1, motos=1),
        _row(2025, "15", "Colisión con motocicleta", autos=0, motos=2),
        _row(2025, "09", "Colisión con vehículo automotor", autos=2),
        _row(2025, "09", "Colisión con vehículo automotor", autos=3),
    ]
    zpath = tmp_path / "atus.zip"
    with zipfile.ZipFile(zpath, "w") as zf:
        zf.writestr("conjunto_de_datos/atus_anual_2024.csv", "\n".join(rows_2024) + "\n")
        zf.writestr("conjunto_de_datos/atus_anual_2025.csv", "\n".join(rows_2025) + "\n")
        zf.writestr(
            "catalogos/tc_entidad.csv",
            "CVEGEO,CVE_ENT,NOM_ENTIDAD\n09,09,Ciudad de México\n15,15,México\n",
        )
    return zpath


def test_list_years(atus_zip: Path) -> None:
    assert list(atus.list_years(atus_zip)) == [2024, 2025]


def test_process_agrega_y_excluye_certificado_cero(atus_zip: Path, tmp_path: Path) -> None:
    out = tmp_path / "processed"
    written = atus.process(atus_zip, out)
    assert set(written) >= {"tipo", "entidad", "victimas", "vehiculos", "total", "hora"}

    total = atus.read_processed("total", out).sort("anio")
    assert total.get_column("accidentes").to_list() == [3, 4]
    assert total.get_column("muertos").to_list() == [2, 0]
    assert total.get_column("heridos").to_list() == [2, 0]

    tipo = atus.read_processed("tipo", out).filter(pl.col("anio") == 2025)
    moto = tipo.filter(pl.col("clave") == "Colisión con motocicleta").row(0, named=True)
    assert moto["accidentes"] == 2
    assert "Certificado cero" not in tipo.get_column("clave").to_list()

    ent = atus.read_processed("entidad", out).filter(pl.col("anio") == 2024)
    mex = ent.filter(pl.col("clave") == 15).row(0, named=True)
    assert mex["nombre"] == "México"
    assert mex["accidentes"] == 2
    assert mex["muertos"] == 1

    vict = atus.read_processed("victimas", out).filter(pl.col("anio") == 2024)
    peat = vict.filter(pl.col("rol") == "peaton").row(0, named=True)
    assert peat["muertos"] == 1
    pasa = vict.filter(pl.col("rol") == "pasajero").row(0, named=True)
    assert (pasa["muertos"], pasa["heridos"]) == (1, 2)

    veh = atus.read_processed("vehiculos", out).filter(pl.col("anio") == 2025)
    assert veh.filter(pl.col("vehiculo") == "MOTOCICLET").item(0, "involucrados") == 3
    assert veh.filter(pl.col("vehiculo") == "AUTOMOVIL").item(0, "involucrados") == 6


def test_process_por_anios_mezcla_con_lo_existente(atus_zip: Path, tmp_path: Path) -> None:
    out = tmp_path / "processed"
    atus.process(atus_zip, out)
    atus.process(atus_zip, out, years=[2025])  # reprocesar un año no duplica filas
    total = atus.read_processed("total", out)
    assert total.get_column("anio").to_list() == [2024, 2025]
    with pytest.raises(ValueError, match="no disponibles"):
        atus.process(atus_zip, out, years=[1990])


def test_download_verifica_tamano_y_escribe_manifest(tmp_path: Path) -> None:
    body = b"PK-fake-zip-" * 100

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, content=body, headers={"last-modified": "Fri, 28 Aug 2026 18:02:04 GMT"}
        )

    client = httpx.Client(transport=httpx.MockTransport(handler))
    rec = atus.download(
        tmp_path, url="https://example.test/atus.zip", expected_size=len(body), client=client
    )
    assert rec.size == len(body)
    assert rec.last_modified == "Fri, 28 Aug 2026 18:02:04 GMT"
    manifest = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["sha256"] == rec.sha256
    assert manifest["license"] == atus.ATUS_LICENSE_URL

    with pytest.raises(ValueError, match="Tamaño inesperado"):
        atus.download(
            tmp_path,
            url="https://example.test/atus.zip",
            expected_size=1,
            client=client,
            force=True,
        )
    assert not (tmp_path / atus.ZIP_NAME).with_suffix(".part").exists()
