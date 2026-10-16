from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, cast

import pytest
from jsonschema import Draft202012Validator

from croquis_scene_schema import (
    FIXTURES_DIR,
    SCHEMA_VERSION,
    EscenaSpec,
    list_fixtures,
    load_fixture,
    load_schema,
    schema_errors,
    validate_dict,
)

EXPECTED = [
    "alcance",
    "frontal_curva",
    "glorieta",
    "interseccion_toluca",
    "lateral_interseccion",
    "motociclista",
    "nocturno_lluvia",
    "objeto_fijo_arbol",
    "peaton_cruce",
    "poste",
    "volcadura",
]

JsonObj = dict[str, object]
JsonList = list[object]


def _evidencias(node: object, out: list[JsonObj]) -> None:
    if isinstance(node, list):
        for v in cast(JsonList, node):
            _evidencias(v, out)
    elif isinstance(node, dict):
        obj = cast(JsonObj, node)
        if {"inicio", "fin", "texto"} <= set(obj):
            out.append(obj)
            return
        for v in obj.values():
            _evidencias(v, out)


def _child(node: object, key: str) -> object:
    if isinstance(node, list):
        return cast(JsonList, node)[int(key)]
    return cast(JsonObj, node)[key]


def _apply(doc: JsonObj, case: JsonObj) -> JsonObj:
    doc = copy.deepcopy(doc)
    ruta = cast(str, case["ruta"])
    parts = ruta[1:].split("/")
    node: object = doc
    for p in parts[:-1]:
        node = _child(node, p)
    key = parts[-1]
    op = case["op"]
    if isinstance(node, list):
        arr = cast(JsonList, node)
        i = int(key)
        if op == "remove":
            del arr[i]
        elif op == "set":
            arr[i] = case["valor"]
        else:
            raise ValueError("repeat solo aplica a arreglos referidos por ruta")
        return doc
    obj = cast(JsonObj, node)
    if op == "remove":
        del obj[key]
    elif op == "set":
        obj[key] = case["valor"]
    else:
        first = cast(JsonList, obj[key])[0]
        obj[key] = [copy.deepcopy(first) for _ in range(cast(int, case["veces"]))]
    return doc


def test_schema_es_draft_2020_12_valido_y_versionado() -> None:
    schema = load_schema()
    Draft202012Validator.check_schema(schema)
    assert schema["$defs"]["Meta"]["properties"]["version_esquema"]["const"] == SCHEMA_VERSION
    assert schema_errors({})  # un documento vacío no es una escena


def test_escenas_canonicas_con_ids_unicos() -> None:
    names = list_fixtures()
    assert names == EXPECTED
    ids = {load_fixture(n)["meta"]["id"] for n in names}
    # Las diez de F1 y la de Toluca con vía de OpenStreetMap (F8, ADR 0023).
    assert len(ids) == 11


@pytest.mark.parametrize("name", EXPECTED)
def test_fixture_valida_en_jsonschema_y_pydantic(name: str) -> None:
    doc = load_fixture(name)
    assert schema_errors(doc) == []
    spec = validate_dict(doc)
    assert isinstance(spec, EscenaSpec)
    assert spec.meta.sintetico is True


@pytest.mark.parametrize("name", EXPECTED)
def test_pydantic_ida_y_vuelta_no_pierde_datos(name: str) -> None:
    doc = load_fixture(name)
    spec = EscenaSpec.model_validate(doc)
    dumped = json.loads(spec.model_dump_json(exclude_unset=True))
    assert dumped == doc


@pytest.mark.parametrize("name", EXPECTED)
def test_evidencias_citan_el_relato_literalmente(name: str) -> None:
    doc = load_fixture(name)
    relato = cast(str, cast(JsonObj, doc["meta"])["relato"])
    found: list[JsonObj] = []
    _evidencias(doc, found)
    assert len(found) > 5
    for e in found:
        inicio, fin, texto = cast(int, e["inicio"]), cast(int, e["fin"]), cast(str, e["texto"])
        assert fin > inicio
        assert relato[inicio:fin] == texto


@pytest.mark.parametrize("name", EXPECTED)
def test_todo_campo_de_relato_trae_evidencia(name: str) -> None:
    doc = load_fixture(name)
    faltantes: list[str] = []

    def walk(node: object, path: str) -> None:
        if isinstance(node, list):
            for i, v in enumerate(cast(JsonList, node)):
                walk(v, f"{path}/{i}")
        elif isinstance(node, dict):
            obj = cast(JsonObj, node)
            if obj.get("fuente") == "relato" and not obj.get("evidencia"):
                faltantes.append(path)
            for k, v in obj.items():
                walk(v, f"{path}/{k}")

    walk(doc, "")
    assert faltantes == []


def _invalid_cases() -> list[JsonObj]:
    raw = (FIXTURES_DIR / "invalid" / "cases.json").read_text(encoding="utf-8")
    data = cast(JsonObj, json.loads(raw))
    return cast(list[JsonObj], data["casos"])


@pytest.mark.parametrize("case", _invalid_cases(), ids=lambda c: cast(str, c["nombre"]))
def test_casos_invalidos_compartidos_se_rechazan(case: JsonObj) -> None:
    doc = _apply(cast(JsonObj, load_fixture("alcance")), case)
    assert schema_errors(doc), case["nombre"]
    with pytest.raises(ValueError, match="EscenaSpec inválida"):
        validate_dict(doc)


def test_fixtures_dir_apunta_al_paquete_compartido() -> None:
    assert (Path(FIXTURES_DIR) / "alcance.json").exists()


def test_load_fixture_devuelve_dict_tipado() -> None:
    doc: dict[str, Any] = load_fixture("alcance")
    assert doc["meta"]["id"] == "fx-alcance-tollocan"
