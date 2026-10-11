from __future__ import annotations

import json
import math
from typing import Any, cast

import pytest

from croquis_scene_schema import FIXTURES_DIR, list_fixtures, load_fixture, schema_errors
from croquis_scene_schema.check import boxes_overlap, check_escena, errores_de

JsonObj = dict[str, Any]
SEMANTIC = cast(
    JsonObj, json.loads((FIXTURES_DIR / "semantic" / "cases.json").read_text(encoding="utf-8"))
)
CLASES = cast(dict[str, JsonObj], SEMANTIC["clases_de_prueba"])
CASOS = cast(list[JsonObj], SEMANTIC["casos"])


def _ruta_codigo(e: list[str]) -> tuple[str, str]:
    return e[1], e[0]


def _child(node: object, key: str) -> object:
    if isinstance(node, list):
        return cast(list[object], node)[int(key)]
    return cast(JsonObj, node)[key]


def _apply(doc: JsonObj, m: JsonObj) -> JsonObj:
    parts = cast(str, m["ruta"])[1:].split("/")
    node: object = doc
    for p in parts[:-1]:
        node = _child(node, p)
    key = parts[-1]
    if isinstance(node, list):
        arr = cast(list[object], node)
        if m["op"] == "remove":
            del arr[int(key)]
        else:
            arr[int(key)] = m["valor"]
        return doc
    obj = cast(JsonObj, node)
    if m["op"] == "remove":
        del obj[key]
    else:
        obj[key] = m["valor"]
    return doc


@pytest.mark.parametrize("name", list_fixtures())
def test_escenas_canonicas_sin_errores_semanticos(name: str) -> None:
    assert errores_de(check_escena(load_fixture(name), CLASES)) == []


@pytest.mark.parametrize("case", CASOS, ids=lambda c: cast(str, c["nombre"]))
def test_casos_compartidos_coinciden_con_typescript(case: JsonObj) -> None:
    doc = load_fixture(cast(str, case["base"]))
    for m in cast(list[JsonObj], case["mutaciones"]):
        doc = _apply(doc, m)
    assert schema_errors(doc) == []  # el esquema acepta; la semántica decide
    problemas = check_escena(doc, CLASES)
    errores = [[p.codigo, p.ruta] for p in problemas if p.severidad == "error"]
    advertencias = [[p.codigo, p.ruta] for p in problemas if p.severidad == "advertencia"]
    assert errores == sorted(cast(list[list[str]], case["errores"]), key=_ruta_codigo)
    assert advertencias == sorted(cast(list[list[str]], case["advertencias"]), key=_ruta_codigo)
    for p in problemas:
        assert "culpa" not in p.mensaje.lower()
        assert "responsable" not in p.mensaje.lower()


def test_sin_tabla_de_clases_omite_comprobaciones_por_clase() -> None:
    doc = load_fixture("alcance")
    doc["vehiculos"][0]["masa"] = {"valor": 8, "unidad": "t", "fuente": "usuario", "confianza": 1}
    assert "E006" in {p.codigo for p in check_escena(doc)}  # tabla por defecto
    assert "E006" not in {p.codigo for p in check_escena(doc, {})}


def _box(x: float, y: float, length: float, w: float, deg: float) -> list[tuple[float, float]]:
    th = math.radians(deg)
    c, s = math.cos(th), math.sin(th)
    local = [(length / 2, w / 2), (length / 2, -w / 2), (-length / 2, -w / 2), (-length / 2, w / 2)]
    return [(x + px * c - py * s, y + px * s + py * c) for px, py in local]


def test_boxes_overlap_detecta_traslape_y_separacion() -> None:
    assert boxes_overlap(_box(0, 0, 4, 2, 0), _box(3, 0, 4, 2, 0))
    assert not boxes_overlap(_box(0, 0, 4, 2, 0), _box(4.01, 0, 4, 2, 0))
    assert boxes_overlap(_box(0, 0, 4, 2, 0), _box(0, 2.5, 4, 2, 90))
    assert not boxes_overlap(_box(0, 0, 4, 2, 45), _box(5, 5, 4, 2, 45))
