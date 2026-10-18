import math

import pytest

from croquis_data import ciss


@pytest.mark.parametrize(
    ("bodytype", "largo", "clase"),
    [
        (4, 440.0, "sedan_compacto"),
        (4, 490.0, "sedan_mediano"),
        (4, None, None),
        (5, None, "hatchback"),
        (14, None, "suv_compacta"),
        (15, None, "suv_grande"),
        (19, 460.0, "suv_compacta"),
        (20, None, "van"),
        (34, None, "pickup"),
        (66, None, None),  # tractocamión: fuera del alcance de E3
        (80, None, None),
    ],
)
def test_clase_desde_bodytype(bodytype: int, largo: float | None, clase: str | None) -> None:
    assert ciss.clase_ciss(bodytype, largo) == clase


def test_perfil_ignora_codigos_especiales() -> None:
    cdc = {"C1": "10", "C2": "20", "C3": "888", "C4": "888", "C5": "888", "C6": "999"}
    assert ciss.crush_profile(cdc) == [10.0, 20.0]
    assert ciss.crush_profile({"C1": "5", "C2": "888"}) is None
    six = {f"C{i}": str(i) for i in range(1, 7)}
    assert ciss.crush_profile(six) == [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]


def test_dv_del_edr_y_codigos() -> None:
    rows = [
        {"MAXDVLONG": "-30", "MAXDVLAT": "40", "FILEREC": "1"},
        {"MAXDVLONG": "-10", "MAXDVLAT": "997", "FILEREC": "1"},
    ]
    res, lon, lat, comp = ciss.edr_delta_v(rows, "F") or (0, 0, 0, "")
    assert math.isclose(res, 50.0)
    assert (lon, lat, comp) == (-30.0, 40.0, "long+lat")
    # Solo longitudinal: válido para frontal y trasero, no para lateral.
    only_long = [{"MAXDVLONG": "-25", "MAXDVLAT": "997", "FILEREC": "1"}]
    assert ciss.edr_delta_v(only_long, "B") == (25.0, -25.0, None, "solo_long")
    assert ciss.edr_delta_v(only_long, "L") is None
    # Registro incompleto o no válido: se descarta.
    assert ciss.edr_delta_v([{"MAXDVLONG": "-30", "MAXDVLAT": "0", "FILEREC": "0"}], "F") is None
    assert ciss.edr_delta_v([{"MAXDVLONG": "888", "MAXDVLAT": "888", "FILEREC": "1"}], "F") is None


def test_tabla_al_dia_si_hay_datos_crudos() -> None:
    if not all(ciss.zip_path(y).exists() for y in ciss.YEARS):
        pytest.skip("Sin los CSV de CISS en data/raw/ciss (uv run croquis-data ciss download)")
    assert ciss.build(check=True)


@pytest.mark.parametrize(
    ("location", "end"),
    [
        ("Begins 80cm left of center point, extending right", "izquierda"),
        ("Begins 20cm right of center point, extending left", "derecha"),
        ("Begins 62cm forward of front axle, extending rearward", "adelante"),
        ("Begins 43cm forward of rear axle, extending forward", "atras"),
        ("LFBC to RFBC", "izquierda"),
        ("rrbc to lrbc", "derecha"),
        ("BC to BC", ""),  # no dice el sentido
        ("LFBC to LFBC", ""),
        ("Unknown", ""),
        ("", ""),
    ],
)
def test_c1_end_reads_where_the_measurement_starts(location: str, end: str) -> None:
    assert ciss.c1_end(location) == end
