"""Tanda 3 (ADR 0139): ¿qué movió sortear la restitución, la razón de impulso y el arrastre?

Compara, número por número, las mediciones del cierre de T3.3 (`eval/results/w8/t3_3/`, el solver de
`main` antes de la Tanda 3) con las mismas después (`eval/results/w8/t3/`, que escribe
`node eval/w8_comparar.mjs t3`): AXA como la app con 20 semillas, la inversión en las 205
narraciones de prueba de CESVI, la E-R4 de prueba y las carambolas de prueba.

Separa lo que cambió en dos clases, porque el cambio solo debe mover rangos:

- **de rango:** un percentil o un ancho (`p10`, `p50`, `p90`, `rango…`, `ancho…`, `sigma…`), o un
  dato que sale de las simulaciones;
- **central:** todo lo demás (el mejor ajuste, una modalidad, un conteo, una tasa).

    python eval/t3_comparar.py  → eval/results/w8/t3_comparacion.json

No cuentan la fecha, el commit, la etiqueta ni los tiempos de cómputo.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any

from w8_t3_3_comparar import ARCHIVOS, RAIZ, diferencias

ANTES = RAIZ / "eval/results/w8/t3_3"
DESPUES = RAIZ / "eval/results/w8/t3"
SALIDA = RAIZ / "eval/results/w8/t3_comparacion.json"

# El último tramo de la ruta dice si el número es de las simulaciones (un rango) o central.
_DE_RANGO = re.compile(
    r"/(p\d+|rango[^/]*|ancho[^/]*|sigma[^/]*|valores_kmh|muestras|validas|impacto|incertidumbre)(/|$)"
)


def _clase(ruta: str) -> str:
    return "de_rango" if _DE_RANGO.search(ruta) else "central"


def main() -> None:
    archivos: dict[str, Any] = {}
    for nombre in ARCHIVOS:
        a = json.loads((ANTES / nombre).read_text(encoding="utf-8"))
        b = json.loads((DESPUES / nombre).read_text(encoding="utf-8"))
        difs: list[dict[str, Any]] = []
        numeros = [0]
        diferencias(a, b, "", difs, numeros)
        centrales = [d for d in difs if _clase(str(d["ruta"])) == "central"]
        de_rango = [d for d in difs if _clase(str(d["ruta"])) == "de_rango"]
        archivos[nombre] = {
            "numeros_comparados": numeros[0],
            "diferencias": len(difs),
            "de_rango": len(de_rango),
            "centrales": len(centrales),
            "primeras_centrales": centrales[:20],
            "primeras_de_rango": de_rango[:8],
        }
    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    doc = {
        "fuente": "eval/t3_comparar.py",
        "commit": commit,
        "antes": "eval/results/w8/t3_3 (cierre de T3.3, antes de la Tanda 3)",
        "despues": "eval/results/w8/t3 (ADR 0139)",
        "archivos": archivos,
        "solo_cambian_rangos": all(x["centrales"] == 0 for x in archivos.values()),
    }
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                k: {c: v[c] for c in ("numeros_comparados", "diferencias", "de_rango", "centrales")}
                for k, v in archivos.items()
            },
            ensure_ascii=False,
            indent=1,
        )
    )
    print("solo_cambian_rangos:", doc["solo_cambian_rangos"])


if __name__ == "__main__":
    main()
