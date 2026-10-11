from hypothesis import given
from hypothesis import strategies as st

from croquis_extraction.hashing import normalize_story, story_hash


def test_hash_estable_ante_saltos_de_linea_y_espacios_finales() -> None:
    a = "iba por Tollocan  \r\nse me cerró"
    b = "iba por Tollocan\nse me cerró\n"
    assert story_hash(a) == story_hash(b)


def test_hash_cambia_si_cambia_el_contenido() -> None:
    assert story_hash("iba a 40") != story_hash("iba a 60")


def test_formas_unicode_equivalentes_dan_el_mismo_hash() -> None:
    assert story_hash("cerró") == story_hash("cerró")


@given(st.text())
def test_normalizar_es_idempotente(text: str) -> None:
    once = normalize_story(text)
    assert normalize_story(once) == once
    assert len(story_hash(text)) == 64
