"""Migraciones del contrato entre versiones de esquema (PLAN §4.2).

Espejo de ``packages/scene-schema/src/migrate.ts``: mismo registro, misma semántica, mismos
documentos de prueba (``fixtures/migrations/``).
"""

from __future__ import annotations

import copy
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, cast

from croquis_scene_schema import SCHEMA_VERSION

JsonObj = dict[str, Any]
_SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def parse_semver(v: str) -> tuple[int, int, int]:
    m = _SEMVER.match(v)
    if not m:
        msg = f"Versión de esquema inválida: {v}"
        raise ValueError(msg)
    a, b, c = (int(x) for x in m.groups())
    return a, b, c


def compare_versions(a: str, b: str) -> int:
    pa, pb = parse_semver(a), parse_semver(b)
    return (pa > pb) - (pa < pb)


@dataclass(frozen=True)
class Migration:
    desde: str
    hasta: str
    descripcion: str
    aplicar: Callable[[JsonObj], JsonObj]


MIGRATIONS: list[Migration] = []


@dataclass
class MigrationResult:
    doc: JsonObj
    desde: str
    hasta: str
    aplicadas: list[str]


def _version_of(doc: object) -> str:
    if not isinstance(doc, dict):
        msg = "El documento no es un objeto."
        raise ValueError(msg)
    meta = cast(JsonObj, doc).get("meta")
    v = cast(JsonObj, meta).get("version_esquema") if isinstance(meta, dict) else None
    if not isinstance(v, str):
        msg = "El documento no declara meta.version_esquema."
        raise ValueError(msg)
    parse_semver(v)
    return v


def migrate_escena(
    doc: object,
    registry: list[Migration] | None = None,
    target: str = SCHEMA_VERSION,
) -> MigrationResult:
    """Lleva un documento a la versión vigente.

    No valida el resultado; eso lo hace ``validate_dict``.
    """
    reg = MIGRATIONS if registry is None else registry
    desde = _version_of(doc)
    if compare_versions(desde, target) > 0:
        msg = (
            f"La escena usa la versión {desde}, más nueva que la soportada ({target}). "
            "Actualiza Croquis."
        )
        raise ValueError(msg)
    current: JsonObj = copy.deepcopy(doc)  # type: ignore[arg-type]
    version = desde
    aplicadas: list[str] = []
    while compare_versions(version, target) < 0:
        step = next((m for m in reg if m.desde == version), None)
        if step is None:
            msg = f"No hay migración registrada desde la versión {version}."
            raise ValueError(msg)
        current = step.aplicar(copy.deepcopy(current))
        meta: JsonObj = dict(cast(JsonObj, current.get("meta", {})))
        meta["version_esquema"] = step.hasta
        current["meta"] = meta
        aplicadas.append(f"{step.desde}→{step.hasta}")
        version = step.hasta
    return MigrationResult(doc=current, desde=desde, hasta=version, aplicadas=aplicadas)
