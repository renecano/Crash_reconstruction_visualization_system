"""W8 · T3.3 (ADR 0136): ¿la reversa movió algo que ya había visto CESVI?

Compara, número por número, las mediciones del cierre de T3.2 (`eval/results/w8/despues/`, el solver
de `main` antes de T3.3) con las mismas mediciones después de T3.3 (`eval/results/w8/t3_3/`, que
escribe `node eval/w8_comparar.mjs t3_3`): AXA como la app con 20 semillas, la inversión en las 205
narraciones de prueba de CESVI, la E-R4 de prueba y las carambolas de prueba.

    python eval/w8_t3_3_comparar.py  → eval/results/w8/t3_3_comparacion.json

No cuentan la fecha, el commit, la etiqueta ni los tiempos de cómputo.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any, cast

RAIZ = Path(__file__).resolve().parent.parent
ANTES = RAIZ / "eval/results/w8/despues"
DESPUES = RAIZ / "eval/results/w8/t3_3"
SALIDA = RAIZ / "eval/results/w8/t3_3_comparacion.json"
ARCHIVOS = (
    "axa_rango_estable.json",
    "cesvi_r4_inversion.json",
    "e_r4_prueba.json",
    "carambolas_prueba.json",
)
# Lo que cambia de una corrida a otra sin que cambie ningún resultado.
SIN_CONTAR = {"generated_at", "git_commit", "fecha", "etiqueta", "commit", "name"}


def _es_tiempo(clave: str) -> bool:
    return (
        clave == "ms"
        or clave.startswith(("ms_", "tiempo", "duracion"))
        or clave.endswith(("_ms", "_s", "_min"))
    )


def diferencias(a: Any, b: Any, ruta: str, out: list[dict[str, Any]], numeros: list[int]) -> None:
    if isinstance(a, dict) and isinstance(b, dict):
        da = cast("dict[str, Any]", a)
        db = cast("dict[str, Any]", b)
        for k in sorted(set(da) | set(db)):
            if k in SIN_CONTAR or _es_tiempo(k):
                continue
            if k not in da or k not in db:
                out.append({"ruta": f"{ruta}/{k}", "antes": k in da, "despues": k in db})
            else:
                diferencias(da[k], db[k], f"{ruta}/{k}", out, numeros)
    elif isinstance(a, list) and isinstance(b, list):
        la = cast("list[Any]", a)
        lb = cast("list[Any]", b)
        if len(la) != len(lb):
            out.append({"ruta": ruta, "antes": f"{len(la)} elementos", "despues": f"{len(lb)}"})
            return
        for i, (x, y) in enumerate(zip(la, lb, strict=True)):
            diferencias(x, y, f"{ruta}/{i}", out, numeros)
    elif isinstance(a, bool) or isinstance(b, bool) or not isinstance(a, int | float):
        if a != b:
            out.append({"ruta": ruta, "antes": a, "despues": b})
    else:
        numeros[0] += 1
        if not isinstance(b, int | float) or a != b:
            out.append({"ruta": ruta, "antes": a, "despues": b})


def main() -> None:
    archivos: dict[str, Any] = {}
    for nombre in ARCHIVOS:
        a = json.loads((ANTES / nombre).read_text(encoding="utf-8"))
        b = json.loads((DESPUES / nombre).read_text(encoding="utf-8"))
        difs: list[dict[str, Any]] = []
        numeros = [0]
        diferencias(a, b, "", difs, numeros)
        archivos[nombre] = {
            "numeros_comparados": numeros[0],
            "diferencias": len(difs),
            "primeras": difs[:20],
        }
    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    doc = {
        "fuente": "eval/w8_t3_3_comparar.py",
        "commit": commit,
        "antes": "eval/results/w8/despues (cierre de T3.2)",
        "despues": "eval/results/w8/t3_3",
        "archivos": archivos,
        "sin_cambio": all(x["diferencias"] == 0 for x in archivos.values()),
    }
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
