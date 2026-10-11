"""Rellena ``inicio``/``fin`` de cada evidencia buscando ``texto`` dentro de ``meta.relato``.

Herramienta de desarrollo para escribir fixtures a mano sin contar caracteres:
    uv run python packages/scene-schema/scripts/fix_offsets.py \
        "packages/scene-schema/fixtures/*.json"

Si un ``texto`` no aparece literalmente en el relato, falla y lo reporta (la prueba de fixtures
también lo exige). Si aparece más de una vez, usa la primera ocurrencia después de la última
evidencia ya resuelta, lo que respeta el orden natural del relato.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def walk(node: Any, relato: str, cursor: list[int], problems: list[str], path: str) -> None:
    if isinstance(node, dict):
        if {"inicio", "fin", "texto"} <= set(node) and isinstance(node["texto"], str):
            texto: str = node["texto"]
            idx = relato.find(texto, cursor[0])
            if idx < 0:
                idx = relato.find(texto)
            if idx < 0:
                problems.append(f"{path}: no aparece en el relato: {texto!r}")
                return
            node["inicio"] = idx
            node["fin"] = idx + len(texto)
            cursor[0] = max(cursor[0], idx)
            return
        for k, v in node.items():
            walk(v, relato, cursor, problems, f"{path}/{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            walk(v, relato, cursor, problems, f"{path}/{i}")


def fix_file(path: Path) -> list[str]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    relato = doc.get("meta", {}).get("relato")
    if not isinstance(relato, str):
        return [f"{path.name}: meta.relato ausente"]
    problems: list[str] = []
    walk(doc, relato, [0], problems, "")
    if not problems:
        text = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
        path.write_text(text, encoding="utf-8", newline="\n")
    return problems


def main(argv: list[str]) -> int:
    rc = 0
    for arg in argv:
        for p in sorted(Path().glob(arg)) or [Path(arg)]:
            problems = fix_file(p)
            for msg in problems:
                sys.stderr.write(f"{p.name} {msg}\n")
            rc |= 1 if problems else 0
            if not problems:
                sys.stdout.write(f"{p.name}: offsets actualizados\n")
    return rc


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
