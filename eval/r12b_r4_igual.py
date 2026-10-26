"""R12b (ADR 0093): ¿la pizarra cambia los números de E-R4?

Compara E-R4 medido con la cadena de antes (`cesvi_r12b_r4_antes.json`, `main` sin pizarra) y con
la pizarra (`cesvi_r12b_r4_despues.json`), los dos con `cesvi_r4_reproduccion.mts medir prueba
<salida>` y las lecturas grabadas (sin API):

- el resumen, las escenas válidas y las reconstruidas en 3D;
- por narración: la comparación con lo que concluyó CESVI, si la escena es válida y la
  reconstrucción (sin el tiempo, que cambia en cada corrida);
- de la bitácora: en cuántas narraciones el Verificador de citas pidió releer y cuántos mensajes
  hay.

    uv run python eval/r12b_r4_igual.py  → eval/results/r12b_r4_igual.json
"""

from __future__ import annotations

import json
import statistics
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parents[1]
ANTES = RAIZ / "eval/results/cesvi_r12b_r4_antes.json"
DESPUES = RAIZ / "eval/results/cesvi_r12b_r4_despues.json"
SALIDA = RAIZ / "eval/results/r12b_r4_igual.json"


def sin_tiempo(f: dict[str, Any]) -> dict[str, Any]:
    r = f.get("reconstruccion")
    return {
        "escena_valida": f["escena_valida"],
        "comparacion": f["comparacion"],
        "reconstruccion": {k: v for k, v in r.items() if k != "ms"} if r else None,
    }


def main() -> int:
    a = json.loads(ANTES.read_text(encoding="utf-8"))
    b = json.loads(DESPUES.read_text(encoding="utf-8"))
    da = {f["id"]: f for f in a["detalle"]}
    db = {f["id"]: f for f in b["detalle"]}
    iguales = [i for i in da if i in db and sin_tiempo(da[i]) == sin_tiempo(db[i])]
    distintas = sorted(set(da) ^ set(db) | {i for i in da if i in db and i not in iguales})
    bitacoras: list[dict[str, Any]] = [f["bitacora"] for f in b["detalle"] if "bitacora" in f]
    doc = {
        "name": "r12b_r4_igual",
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=RAIZ, capture_output=True, text=True
        ).stdout.strip(),
        "descripcion": (
            "E-R4 (prueba congelada, lecturas grabadas) sin y con la pizarra de R12b: resumen, "
            "escenas, reconstrucciones y comparación por narración."
        ),
        "antes": {"archivo": ANTES.name, "fecha": a["fecha"]},
        "despues": {"archivo": DESPUES.name, "fecha": b["fecha"]},
        "narraciones": len(db),
        "resumen_igual": a["resumen"] == b["resumen"],
        "escenas_validas": [a["escenas_validas"], b["escenas_validas"]],
        "reconstruidas_en_3d": [a.get("reconstruidas_en_3d"), b.get("reconstruidas_en_3d")],
        "narraciones_iguales": len(iguales),
        "narraciones_distintas": distintas,
        "bitacora": {
            "relectura_pedida": sum(1 for x in bitacoras if x["relectura_pedida"]),
            "mensajes_mediana": statistics.median(x["mensajes"] for x in bitacoras)
            if bitacoras
            else None,
            "mensajes_max": max((x["mensajes"] for x in bitacoras), default=None),
        },
    }
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    sys.stdout.write(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
