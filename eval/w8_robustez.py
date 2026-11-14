"""W8 · T3.2 (ADR 0135, versión 2): prueba de robustez del criterio, no ajuste.

Con el mismo código, cada escena de referencia con evidencia se invierte dos veces: con el umbral
del criterio (Δχ² = 1, `HEADING_LR_MARGIN` = 0.5) y con Δχ² = 2.71 (el 90 % de un parámetro,
`HEADING_LR_MARGIN` = 1.355). Se informa en qué escenas cambia qué rumbos vuelven al del perito y
cuánto se mueven las velocidades. El criterio se queda en 1.

    uv run python eval/w8_robustez.py  → eval/results/w8/robustez.json
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any

from croquis_solver import inversion

RAIZ = Path(__file__).resolve().parents[1]
F = RAIZ / "packages/scene-schema/fixtures"
ESCENAS = (
    sorted(F.glob("*.json"))
    + sorted((F / "inversion").glob("*.json"))
    + sorted((F / "agentes").glob("*.json"))
    + sorted((F / "c1").glob("*.json"))
)
UMBRALES = {"chi2_1": 0.5, "chi2_2_71": 2.71 / 2}


JsonObj = dict[str, Any]


def resumen(spec: JsonObj) -> JsonObj:
    d = inversion.invert(spec).to_dict()
    out: JsonObj = {}
    for p in d["parametros"]:
        clave = f"{p['parametro']}:{p['vehiculo']}"
        e = p.get("estimacion")
        out[clave] = (
            {"mejor": e["mejor"], "p10": e.get("p10"), "p90": e.get("p90")}
            if p["identificable"] and e
            else {"identificable": False, "inicial": p["inicial"]}
        )
    return out


ESTADO = RAIZ / "eval/results/w8/robustez_estado.json"


def main() -> None:
    # Reanudable: cada escena se guarda en cuanto termina y al relanzar se salta.
    hechas: dict[str, JsonObj] = (
        json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {}
    )
    filas: list[JsonObj] = []
    for ruta in ESCENAS:
        clave = str(ruta.relative_to(F)).replace("\\", "/")
        if clave in hechas:
            filas.append(hechas[clave])
            continue
        spec = json.loads(ruta.read_text(encoding="utf-8"))
        if "vehiculos" not in spec or not spec.get("vehiculos"):
            continue
        if inversion.evidence_from_spec(spec).empty():
            continue
        t = time.time()
        por: dict[str, JsonObj] = {}
        for nombre, margen in UMBRALES.items():
            inversion.HEADING_LR_MARGIN = margen
            por[nombre] = resumen(spec)
        inversion.HEADING_LR_MARGIN = UMBRALES["chi2_1"]
        cambia = por["chi2_1"] != por["chi2_2_71"]
        fila: JsonObj = {
            "escena": str(ruta.relative_to(F)).replace("\\", "/"),
            "cambia": cambia,
            "s": round(time.time() - t, 1),
            **por,
        }
        sys.stdout.write(("CAMBIA " if cambia else "igual  ") + clave + "\n")
        sys.stdout.flush()
        filas.append(fila)
        hechas[clave] = fila
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(hechas, ensure_ascii=False), encoding="utf-8")
    salida = RAIZ / "eval/results/w8/robustez.json"
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(
        json.dumps(
            {
                "descripcion": "Criterio v2 del rumbo (ADR 0135) con Δχ² = 1 (el que vale) y "
                "con Δχ² = 2.71 (prueba de robustez), mismo código.",
                "cambian": [f["escena"] for f in filas if f["cambia"]],
                "escenas": filas,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
