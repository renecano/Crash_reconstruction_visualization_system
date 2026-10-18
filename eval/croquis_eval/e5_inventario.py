"""Inventario de E5 (F10, PLAN §8): cuántos casos tienen el perfil de aplastamiento medido completo,
la posición del daño y, en NHTSA, una foto útil, por fuente y tipo de impacto. Es el tamaño de
muestra de E5 antes de medir nada.

Uso: ``uv run croquis-eval e5-inventario`` → ``eval/results/e5_inventario.json``. La lista de
multimedia de NHTSA se descarga antes con ``uv run croquis-data nhtsa media``.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any, cast

from croquis_data.nhtsa_ctd import damaged_side_photo
from croquis_eval.e5_casos import (
    CISS_DEV_YEARS,
    MEDIA_DIR,
    TIPOS,
    Caso,
    ciss_cases,
    nhtsa_cases,
    nhtsa_test_no,
)
from croquis_eval.results import write_result


def photo_status(caso: Caso, media_dir: Path = MEDIA_DIR) -> str:
    """«con_foto», «sin_foto_util» (hay fotos pero ninguna posterior de esa cara),
    «sin_fotos» o «sin_lista» (no se descargó la lista de multimedia)."""
    n = nhtsa_test_no(caso.id)
    path = media_dir / f"media_{n}.json"
    if n is None or not path.exists():
        return "sin_lista"
    doc = cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
    photos = cast(list[dict[str, Any]], doc.get("photos") or [])
    if not photos:
        return "sin_fotos"
    return "con_foto" if damaged_side_photo(photos, caso.lado) else "sin_foto_util"


def _by_type(counter: Counter[str]) -> dict[str, int]:
    return {t: counter.get(t, 0) for t in TIPOS}


def inventory(media_dir: Path = MEDIA_DIR) -> dict[str, Any]:
    nhtsa = list(nhtsa_cases())
    ciss = list(ciss_cases())
    fotos: dict[str, Counter[str]] = {}
    for c in nhtsa:
        fotos.setdefault(photo_status(c, media_dir), Counter())[c.tipo] += 1
    return {
        "nhtsa": {
            "casos": len(nhtsa),
            "por_tipo": _by_type(Counter(c.tipo for c in nhtsa)),
            "con_centro_del_dano": _by_type(
                Counter(c.tipo for c in nhtsa if c.centro_dano_m is not None)
            ),
            "con_velocidad": _by_type(Counter(c.tipo for c in nhtsa if c.velocidad_kmh)),
            "fotos": {k: _by_type(v) for k, v in sorted(fotos.items())},
        },
        "ciss": {
            "casos": len(ciss),
            "por_tipo": _by_type(Counter(c.tipo for c in ciss)),
            "con_centro_del_dano": _by_type(
                Counter(c.tipo for c in ciss if c.centro_dano_m is not None)
            ),
            "desarrollo_2017_2021": _by_type(
                Counter(c.tipo for c in ciss if c.anio in CISS_DEV_YEARS)
            ),
            "test_2022_2024": _by_type(
                Counter(c.tipo for c in ciss if c.anio not in CISS_DEV_YEARS)
            ),
            "contra_vehiculo": sum(1 for c in ciss if c.detalle.startswith("vehiculo")),
            "contra_objeto_rigido": sum(1 for c in ciss if c.detalle.startswith("objeto")),
        },
        "notas": [
            "Un caso es un vehículo con C1–C6 (CISS) o DPD1–DPD6 (NHTSA), el largo del daño L, "
            "clase y masa; los tipos siguen las reglas de eval/croquis_eval/e5_casos.py.",
            "Foto útil: una foto posterior a la prueba de la cara dañada, reconocida por el nombre "
            "del archivo (croquis_data.nhtsa_ctd.damaged_side_photo).",
        ],
    }


def main() -> Path:
    return write_result("e5_inventario", inventory(), seed=None)
