"""Contrato EscenaSpec (entrada) y esquema del resultado del solver (salida) en Python.

``escena.schema.json`` es la única fuente de verdad. ``generated.py`` se produce con
``uv run croquis-scene-schema-generate``; ``validate_dict`` valida contra el JSON Schema
(misma semántica que Ajv en TypeScript) y ``EscenaSpec`` es el modelo Pydantic tipado.
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError

from croquis_scene_schema.generated import EscenaSpec

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "escena.schema.json"
VEHICLE_CLASSES_PATH = Path(__file__).resolve().parents[2] / "vehicle_classes.json"
FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"

__all__ = [
    "FIXTURES_DIR",
    "RESULTS_DIR",
    "RESULT_SCHEMA_PATH",
    "RESULT_VERSION",
    "SCHEMA_PATH",
    "SCHEMA_VERSION",
    "VEHICLE_CLASSES_PATH",
    "EscenaSpec",
    "list_fixtures",
    "list_results",
    "load_fixture",
    "load_result",
    "load_result_schema",
    "load_schema",
    "load_vehicle_classes",
    "result_errors",
    "schema_errors",
    "validate_dict",
]


@cache
def load_schema() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    return data


SCHEMA_VERSION: str = load_schema()["$defs"]["Meta"]["properties"]["version_esquema"]["const"]


@cache
def _validator() -> Draft202012Validator:
    schema = load_schema()
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def _sort_key(e: ValidationError) -> tuple[list[str], str]:
    return [str(p) for p in e.path], e.message


def schema_errors(data: Any) -> list[str]:
    """Errores estructurales contra el JSON Schema como ``ruta: mensaje``, ordenados y estables."""
    found: list[ValidationError] = list(_validator().iter_errors(data))  # pyright: ignore[reportUnknownMemberType]
    return [
        f"/{'/'.join(str(p) for p in e.path)}: {e.message}" for e in sorted(found, key=_sort_key)
    ]


def validate_dict(data: Any) -> EscenaSpec:
    """Valida contra el JSON Schema y devuelve el modelo Pydantic. Lanza ``ValueError`` si falla."""
    errors = schema_errors(data)
    if errors:
        msg = "EscenaSpec inválida:\n" + "\n".join(errors[:20])
        raise ValueError(msg)
    return EscenaSpec.model_validate(data)


@cache
def load_vehicle_classes() -> dict[str, dict[str, Any]]:
    """Tabla de rangos por clase (generada por `croquis-data vehicles build`)."""
    doc: dict[str, Any] = json.loads(VEHICLE_CLASSES_PATH.read_text(encoding="utf-8"))
    clases: dict[str, dict[str, Any]] = doc["clases"]
    return clases


def list_fixtures() -> list[str]:
    return sorted(p.stem for p in FIXTURES_DIR.glob("*.json"))


def load_fixture(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIXTURES_DIR / f"{name}.json").read_text(encoding="utf-8"))
    return data


# ----------------------------------------------------------------------------------------------
# Resultado del solver (`resultado.schema.json`)
# ----------------------------------------------------------------------------------------------

RESULT_SCHEMA_PATH = Path(__file__).resolve().parents[2] / "resultado.schema.json"
RESULTS_DIR = FIXTURES_DIR / "resultados"


@cache
def load_result_schema() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(RESULT_SCHEMA_PATH.read_text(encoding="utf-8"))
    return data


RESULT_VERSION: str = load_result_schema()["properties"]["version_resultado"]["const"]


@cache
def _result_validator() -> Draft202012Validator:
    schema = load_result_schema()
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def result_errors(data: Any) -> list[str]:
    """Errores del documento de resultado contra su JSON Schema, como ``ruta: mensaje``."""
    found: list[ValidationError] = list(_result_validator().iter_errors(data))  # pyright: ignore[reportUnknownMemberType]
    return [
        f"/{'/'.join(str(p) for p in e.path)}: {e.message}" for e in sorted(found, key=_sort_key)
    ]


def list_results() -> list[str]:
    return sorted(p.stem for p in RESULTS_DIR.glob("*.json"))


def load_result(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((RESULTS_DIR / f"{name}.json").read_text(encoding="utf-8"))
    return data
