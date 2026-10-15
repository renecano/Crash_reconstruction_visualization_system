"""Valida un lote del test CISS de Relatos-MX sin tocar `build/` (para escribir lotes en paralelo).

Uso: `uv run python -m croquis_extraction.validate_ciss data/relatos-mx/fuente/ciss-01.toml`.
Imprime `OK <n>` y los conteos por tipo y registro, o cada problema: hechos distintos de la ficha,
hechos sin cita, citas que no están literal en el texto, specs inválidas.
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

from croquis_extraction import relatos_mx


def main(argv: list[str] | None = None) -> int:
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8")
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("Uso: python -m croquis_extraction.validate_ciss <archivo ciss-NN.toml>")
        return 2
    path = Path(args[0])
    items = relatos_mx.load_source(path)
    probs = relatos_mx.problems(items)
    probs += [f"{it['id']}: texto sin escribir" for it in items if "ESCRIBE AQUÍ" in it["texto"]]
    if probs:
        print("\n".join(probs))
        return 1
    print(f"OK {len(items)}")
    print("tipo:", dict(sorted(Counter(it["tipo"] for it in items).items())))
    print("registro:", dict(sorted(Counter(it["registro"] for it in items).items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
