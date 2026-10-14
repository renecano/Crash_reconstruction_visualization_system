import itertools

from hypothesis import given
from hypothesis import strategies as st

from croquis_extraction.glossary import find_terms, glossary_version
from croquis_extraction.text import fold, load_json


def test_plegado_quita_acentos_y_baja_a_minusculas() -> None:
    assert fold("Frené en la AVENIDA Ñandú, ¡ÚLTIMO!") == "frene en la avenida nandu, ¡ultimo!"


@given(st.text())
def test_plegado_conserva_la_longitud(text: str) -> None:
    assert len(fold(text)) == len(text)


@given(st.text())
def test_plegado_es_idempotente(text: str) -> None:
    assert fold(fold(text)) == fold(text)


def test_glosario_encuentra_expresiones_mexicanas_con_su_cita() -> None:
    text = "Se me cerró una camioneta y el tráiler se pasó el alto"
    terms = {t.id: t for t in find_terms(text)}
    assert {"se_me_cerro", "camioneta", "trailer", "se_paso_el_alto"} <= set(terms)
    for t in terms.values():
        assert text[t.start : t.end] == t.texto
    assert terms["se_me_cerro"].ambiguo
    assert terms["se_me_cerro"].pregunta


def test_glosario_prefiere_la_coincidencia_mas_larga() -> None:
    terms = find_terms("el señor iba cruzando la calle")
    assert [t.id for t in terms] == ["peaton"]
    assert terms[0].texto == "el señor iba cruzando"


def test_glosario_no_coincide_dentro_de_otra_palabra() -> None:
    assert not [t for t in find_terms("la motocicletas, remoto") if t.id == "moto"]


@given(st.text(alphabet="abcdefghijklmnopqrstuvwxyzáéíóúñ ,.", max_size=200))
def test_coincidencias_sin_traslapes_y_ordenadas(text: str) -> None:
    terms = find_terms(text)
    for a, b in itertools.pairwise(terms):
        assert a.end <= b.start
    for t in terms:
        assert text[t.start : t.end] == t.texto


def test_entradas_del_glosario_bien_formadas() -> None:
    data = load_json("glosario.json")
    assert glossary_version() == data["version"]
    ids = [e["id"] for e in data["entradas"]]
    assert len(ids) == len(set(ids))
    for e in data["entradas"]:
        assert e["patrones"], e["id"]
        assert e["significado"], e["id"]
        for ef in e["efectos"]:
            assert set(ef) == {"campo", "valor"}, e["id"]
        if e.get("ambiguo"):
            assert e.get("pregunta"), f"{e['id']}: ambigua sin pregunta"
        for p in e["patrones"]:
            assert p == fold(p), f"{e['id']}: patrón sin plegar {p!r}"
