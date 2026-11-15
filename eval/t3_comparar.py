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
import sys
from pathlib import Path
from typing import Any, cast

# Lo mismo que eval/w8_t3_3_comparar.py: qué archivos, qué no se cuenta y cómo se recorre.
RAIZ = Path(__file__).resolve().parent.parent
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


# Por omisión, el antes y el después de la Tanda 3 en la laptop. Con argumentos, otras dos carpetas:
# `python eval/t3_comparar.py t3 t3_rtx` compara la laptop con la computadora del colaborador.
_A, _B = (sys.argv[1], sys.argv[2]) if len(sys.argv) >= 3 else ("t3_3", "t3")
ANTES = RAIZ / "eval/results/w8" / _A
DESPUES = RAIZ / "eval/results/w8" / _B
SALIDA = (
    RAIZ
    / "eval/results/w8"
    / ("t3_comparacion.json" if (_A, _B) == ("t3_3", "t3") else f"{_A}_contra_{_B}.json")
)

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
        "antes": f"eval/results/w8/{_A}",
        "despues": f"eval/results/w8/{_B}",
        "archivos": archivos,
        "solo_cambian_rangos": all(x["centrales"] == 0 for x in archivos.values()),
    }
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    resumen = {
        k: {c: v[c] for c in ("numeros_comparados", "diferencias", "de_rango", "centrales")}
        for k, v in archivos.items()
    }
    sys.stdout.write(json.dumps(resumen, ensure_ascii=False, indent=1) + "\n")
    sys.stdout.write(f"solo_cambian_rangos: {doc['solo_cambian_rangos']}\n")


if __name__ == "__main__":
    main()
