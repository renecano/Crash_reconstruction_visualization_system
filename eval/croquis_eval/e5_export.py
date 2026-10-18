"""Exporta los casos de E5 para el reproductor en TypeScript (``eval/js/e5_dano.ts``).

Una línea JSON por caso, con todos los campos de ``Caso`` y si va a test según la partición
congelada (ADR 0032). El archivo se regenera; no se versiona. Uso:
``uv run croquis-eval e5-casos`` → ``eval/e5/casos.jsonl``.
"""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path

from croquis_eval.e5_casos import ROOT, ciss_cases, nhtsa_cases
from croquis_eval.e5_particion import check, is_test

CASES_PATH = ROOT / "eval" / "e5" / "casos.jsonl"


def export(path: Path = CASES_PATH) -> Path:
    if not check():
        raise SystemExit("La partición de E5 no coincide con la congelada (ADR 0032)")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for c in [*nhtsa_cases(), *ciss_cases()]:
            row = dataclasses.asdict(c) | {"test": is_test(c)}
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return path


def main() -> Path:
    return export()
