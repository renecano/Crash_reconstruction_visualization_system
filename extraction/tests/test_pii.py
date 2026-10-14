import itertools
import re

import pytest
from hypothesis import given
from hypothesis import strategies as st

from croquis_extraction.pii import MARKERS, redact


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (
            "Me llamo Brenda Ruiz y mi tel es 722 123 4567",
            "Me llamo [NOMBRE] y mi tel es [TELEFONO]",
        ),
        ("placas MXA-123-B, correo ana.p@gmail.com", "placas [PLACA], correo [CORREO]"),
        ("juan perez me chocó", "[NOMBRE] me chocó"),
        ("Vivo en Morelos número 245 int 3", "Vivo en Morelos [NUMERO]"),
        ("Mi CURP es PERA800101HMCRZN09", "Mi CURP es [CURP]"),
        ("RFC PERA800101AB1 del dueño", "RFC [RFC] del dueño"),
        ("el teléfono +52 55 1234 5678", "el teléfono [TELEFONO]"),
    ],
)
def test_redacta_cada_tipo_de_dato(text: str, expected: str) -> None:
    assert redact(text).text == expected


def test_nombre_con_pista_y_apellidos() -> None:
    r = redact("El señor Luis Hernández García iba en la calle Miguel Hidalgo")
    assert r.text == "El señor [NOMBRE] iba en la calle Miguel Hidalgo"
    assert r.spans[0].original == "Luis Hernández García"


def test_no_redacta_calles_ni_lugares() -> None:
    for text in (
        "en la esquina de Benito Juárez con Miguel Hidalgo",
        "sobre avenida José María Morelos",
        "en la colonia Guadalupe",
    ):
        assert redact(text).text == text


def test_nombres_que_son_palabras_comunes_no_se_redactan_solos() -> None:
    text = "La luz estaba en rojo y había una rosa en el parabrisas"
    assert redact(text).text == text


def test_numeros_que_no_son_datos_personales_se_quedan() -> None:
    text = "iba a 60 km/h y frené unos 12 metros antes, eran las 10:30"
    assert redact(text).text == text


def test_tramos_apuntan_al_original_y_cuentan_por_tipo() -> None:
    text = "Me llamo Ana López, placas ABC-12-34, tel 7221234567"
    r = redact(text)
    for sp in r.spans:
        assert text[sp.start : sp.end] == sp.original
    assert r.counts() == {**dict.fromkeys(MARKERS, 0), "NOMBRE": 1, "PLACA": 1, "TELEFONO": 1}


@given(st.text(max_size=300))
def test_tramos_ordenados_sin_traslapes(text: str) -> None:
    r = redact(text)
    for a, b in itertools.pairwise(r.spans):
        assert a.end <= b.start
    rebuilt: list[str] = []
    pos = 0
    for sp in r.spans:
        rebuilt.append(text[pos : sp.start] + f"[{sp.kind}]")
        pos = sp.end
    assert "".join(rebuilt) + text[pos:] == r.text


@given(
    st.from_regex(r"[A-Z]{3}-[0-9]{3}-[A-Z]", fullmatch=True),
    st.from_regex(r"[a-z]{3,8}@[a-z]{3,8}\.com", fullmatch=True),
    st.from_regex(r"722 [0-9]{3} [0-9]{4}", fullmatch=True),
)
def test_datos_generados_nunca_se_filtran(placa: str, correo: str, tel: str) -> None:
    text = f"Las placas eran {placa}, mi correo {correo} y mi número {tel}."
    out = redact(text).text
    for dato in (placa, correo, tel):
        assert dato not in out
    assert re.findall(r"\[(\w+)\]", out) == ["PLACA", "CORREO", "TELEFONO"]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("se llama kevin armendariz y me dio", "se llama [NOMBRE] y me dio"),
        ("El asegurado, Eleuterio Vargas Ocampo, manifiesta", "El asegurado, [NOMBRE], manifiesta"),
        ("mi primo jorge iba y jorge traía casco", "mi primo [NOMBRE] iba y [NOMBRE] traía casco"),
        ("el teléfono 686 214 77 09 y ya", "el teléfono [TELEFONO] y ya"),
        ("En el cruce con Cuauhtémoc el semáforo", "En el cruce con Cuauhtémoc el semáforo"),
        ("Bajando de San Cristóbal hacia Tuxtla", "Bajando de San Cristóbal hacia Tuxtla"),
        ("Iba por Lázaro Cárdenas en León", "Iba por Lázaro Cárdenas en León"),
    ],
)  # fmt: skip
def test_pistas_en_minusculas_correferencia_y_lugares(text: str, expected: str) -> None:
    assert redact(text).text == expected
