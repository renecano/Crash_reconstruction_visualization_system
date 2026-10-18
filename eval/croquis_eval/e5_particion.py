"""Partición de E5 en desarrollo y test (F10, ADR 0032), congelada antes de medir.

- **NHTSA:** por vehículo (marca, modelo y año), no por prueba. Un mismo auto suele tener varias
  pruebas (NCAP, FMVSS 208…) y, si cayera en los dos lados, lo que se ajusta en desarrollo se
  filtraría al test. Cada vehículo va a test si ``u < 0.4``, con u uniforme en [0, 1) sacada del
  SHA-256 de ``"{semilla}|{vehículo}"``.
- **CISS:** por año, como E3: 2017–2021 desarrollo y 2022–2024 test.

La lista del test se escribe una vez en ``eval/e5/particion.json`` y su SHA-256 queda en
``FROZEN_SHA256``. La prueba ``test_e5_particion.py`` falla si el archivo cambia o si los datos ya
no reproducen la misma partición. Uso: ``uv run croquis-eval e5-particion`` (``--check`` solo
verifica).
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from croquis_eval.e5_casos import CISS_DEV_YEARS, ROOT, TIPOS, Caso, ciss_cases, nhtsa_cases

SEED = 20261017
TEST_FRACTION = 0.4
PARTITION_PATH = ROOT / "eval" / "e5" / "particion.json"
# SHA-256 del archivo congelado. No se cambia: un test nuevo sería otra evaluación (ADR 0032).
FROZEN_SHA256: str = "2a894e0915db754fa484f0dc83b809389b134760b02e00ba7b8c4d9b784b0213"


def _frozen() -> bool:
    """¿Ya se congeló la partición? (``FROZEN_SHA256`` era "pendiente" antes de escribirla)."""
    return len(FROZEN_SHA256) == 64


def group_u(vehiculo: str, seed: int = SEED) -> float:
    """Número uniforme en [0, 1) que depende solo del vehículo y de la semilla."""
    h = hashlib.sha256(f"{seed}|{vehiculo}".encode()).hexdigest()
    return int(h[:13], 16) / 16**13


def is_test(caso: Caso, seed: int = SEED) -> bool:
    if caso.fuente == "nhtsa":
        return group_u(caso.vehiculo, seed) < TEST_FRACTION
    return caso.anio not in CISS_DEV_YEARS


def partition(cases: Iterable[Caso], seed: int = SEED) -> dict[str, Any]:
    cases = list(cases)
    test = sorted(c.id for c in cases if is_test(c, seed))
    test_set = set(test)

    def counts(fuente: str, in_test: bool) -> dict[str, int]:
        cnt = Counter(c.tipo for c in cases if c.fuente == fuente and (c.id in test_set) == in_test)
        return {t: cnt.get(t, 0) for t in TIPOS}

    return {
        "semilla": seed,
        "fraccion_test_nhtsa": TEST_FRACTION,
        "regla": (
            "NHTSA: por vehículo (marca|modelo|año), test si u < 0.4 con u del SHA-256 de "
            "'semilla|vehículo'; CISS: test los años 2022–2024 (como E3)."
        ),
        "conteos": {
            "nhtsa": {"desarrollo": counts("nhtsa", False), "test": counts("nhtsa", True)},
            "ciss": {"desarrollo": counts("ciss", False), "test": counts("ciss", True)},
        },
        "test": test,
    }


def serialize(payload: dict[str, Any]) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, indent=1) + "\n").encode("utf-8")


def file_sha256(path: Path = PARTITION_PATH) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def current() -> dict[str, Any]:
    return partition([*nhtsa_cases(), *ciss_cases()])


def build(path: Path = PARTITION_PATH) -> Path:
    """Escribe la partición. Solo se usa una vez; después, ``check``."""
    if path.exists() and _frozen():
        raise RuntimeError("La partición de E5 ya está congelada; no se reescribe (ADR 0032).")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(serialize(current()))
    return path


def check(path: Path = PARTITION_PATH) -> bool:
    """El archivo coincide con el SHA-256 congelado y los datos reproducen la misma partición."""
    return file_sha256(path) == FROZEN_SHA256 and path.read_bytes() == serialize(current())


def main(check_only: bool = False) -> Path:
    if check_only:
        if not check():
            raise SystemExit("La partición de E5 no coincide con la congelada")
        return PARTITION_PATH
    return build()
