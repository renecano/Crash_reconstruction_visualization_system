from __future__ import annotations

import copy
import json
from typing import Any, cast

import pytest

from croquis_scene_schema import FIXTURES_DIR, SCHEMA_VERSION, load_fixture, schema_errors
from croquis_scene_schema.migrate import (
    MIGRATIONS,
    Migration,
    compare_versions,
    migrate_escena,
)

JsonObj = dict[str, Any]


def _v090_a_100(doc: JsonObj) -> JsonObj:
    out = copy.deepcopy(doc)
    for v in cast(list[JsonObj], out.get("vehiculos", [])):
        if "velocidad" in v and "velocidad_previa" not in v:
            v["velocidad_previa"] = v.pop("velocidad")
    lugar = cast(JsonObj, out.setdefault("lugar", {}))
    lugar.setdefault("sentidos", {"valor": "doble_sentido", "fuente": "default", "confianza": 0.5})
    return out


TEST_REGISTRY = [
    Migration(
        "0.9.0", "1.0.0", "velocidad → velocidad_previa; lugar.sentidos por defecto", _v090_a_100
    ),
    *MIGRATIONS,
]


def _legacy() -> JsonObj:
    raw = (FIXTURES_DIR / "migrations" / "v0_9_0_alcance.json").read_text(encoding="utf-8")
    doc = cast(JsonObj, json.loads(raw))
    doc.pop("_descripcion", None)
    return doc


def test_escena_vigente_no_cambia() -> None:
    doc = load_fixture("alcance")
    r = migrate_escena(doc)
    assert r.aplicadas == []
    assert r.desde == SCHEMA_VERSION
    assert r.doc == doc
    assert r.doc is not doc


def test_encadena_migraciones_y_el_resultado_valida() -> None:
    doc = _legacy()
    assert schema_errors(doc)
    r = migrate_escena(doc, TEST_REGISTRY)
    assert r.aplicadas == [
        "0.9.0→1.0.0",
        "1.0.0→1.1.0",
        "1.1.0→1.2.0",
        "1.2.0→1.3.0",
        "1.3.0→2.0.0",
        "2.0.0→2.1.0",
        "2.1.0→2.2.0",
    ]
    assert schema_errors(r.doc) == []
    assert r.doc["meta"]["version_esquema"] == SCHEMA_VERSION


def test_falla_con_versiones_desconocidas_futuras_o_ausentes() -> None:
    with pytest.raises(ValueError, match=r"No hay migración registrada desde la versión 0\.9\.0"):
        migrate_escena(_legacy())
    futuro = load_fixture("alcance")
    futuro["meta"]["version_esquema"] = "9.0.0"
    with pytest.raises(ValueError, match="más nueva"):
        migrate_escena(futuro)
    with pytest.raises(ValueError, match="version_esquema"):
        migrate_escena({})
    with pytest.raises(ValueError, match="objeto"):
        migrate_escena(None)


def test_una_escena_1_0_0_migra_sin_cambios_a_la_vigente() -> None:
    """1.1.0 agrega evidencias[].fase, 1.2.0 la fuente mapa y lugar.red_vial y 1.3.0 el
    semáforo peatonal: un documento 1.0.0 conserva su significado."""
    actual = load_fixture("alcance")
    viejo = copy.deepcopy(actual)
    viejo["meta"]["version_esquema"] = "1.0.0"
    for e in viejo.get("evidencias", []):
        e.pop("fase", None)
    r = migrate_escena(viejo)
    assert r.aplicadas == [
        "1.0.0→1.1.0",
        "1.1.0→1.2.0",
        "1.2.0→1.3.0",
        "1.3.0→2.0.0",
        "2.0.0→2.1.0",
        "2.1.0→2.2.0",
    ]
    assert schema_errors(r.doc) == []
    assert r.doc["meta"] == actual["meta"]


def test_compare_versions() -> None:
    assert compare_versions("1.0.0", "1.0.0") == 0
    assert compare_versions("1.0.0", "1.1.0") < 0
    assert compare_versions("2.0.0", "1.9.9") > 0
