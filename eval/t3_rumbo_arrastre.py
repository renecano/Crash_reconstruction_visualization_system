"""T3.2 (ADR 0101): qué cambia en los resultados versionados con el rumbo que gira sobre el punto de
impacto, su residuo previo y el arrastre tras el impacto como incógnita.

Compara los resultados de referencia del árbol de trabajo (`packages/scene-schema/fixtures/
resultados` e `inversion/resultados`, 16 escenas) con los de una base de git (por omisión `main`):
por vehículo, qué fija la evidencia, cuántos parámetros quedan en su límite de búsqueda, el rumbo
inicial contra el que colocó el perito, el arrastre ajustado y las banderas de consistencia.

    uv run python eval/t3_rumbo_arrastre.py [base] → eval/results/t3_2_rumbo_arrastre.json
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parents[1]
FIXTURES = RAIZ / "packages" / "scene-schema" / "fixtures"
SALIDA = RAIZ / "eval" / "results" / "t3_2_rumbo_arrastre.json"


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, encoding="utf-8", cwd=RAIZ, check=True
    ).stdout


def _objetivos() -> list[Path]:
    return sorted((FIXTURES / "resultados").glob("*.json")) + sorted(
        (FIXTURES / "inversion" / "resultados").glob("*.json")
    )


def _resumen(doc: dict[str, Any]) -> dict[str, Any]:
    inv = doc.get("inversion") or {}
    params: list[dict[str, Any]] = inv.get("parametros") or []
    por_param: dict[str, Any] = {}
    for p in params:
        clave = f"{p['parametro']}:{p['vehiculo']}"
        est = p.get("estimacion")
        por_param[clave] = {
            "identificable": p["identificable"],
            "en_limite": p.get("en_limite", False),
            "inicial": p["inicial"],
            "mejor": est["mejor"] if est else None,
            "p10": est.get("p10") if est else None,
            "p90": est.get("p90") if est else None,
        }
    rumbos = [p for p in params if p["parametro"] == "rumbo_inicial" and p.get("estimacion")]
    return {
        "parametros": por_param,
        "fijados": sorted(k for k, v in por_param.items() if v["identificable"]),
        "en_limite": sorted(k for k, v in por_param.items() if v["en_limite"]),
        "desvio_rumbo_max_deg": max(
            (abs(p["estimacion"]["mejor"] - p["inicial"]) for p in rumbos), default=None
        ),
        "arrastres": {
            p["vehiculo"]: p["estimacion"]["mejor"]
            for p in params
            if p["parametro"] == "arrastre_post_impacto" and p.get("estimacion")
        },
        "banderas": [c["codigo"] for c in doc.get("consistencia") or []],
        "costo_mejor": (inv.get("multiarranque") or {}).get("modos", [{}])[0].get("costo"),
    }


def main(argv: list[str]) -> int:
    base = argv[1] if len(argv) > 1 else "main"
    escenas: dict[str, Any] = {}
    totales = {"antes": {"fijados": 0, "en_limite": 0}, "despues": {"fijados": 0, "en_limite": 0}}
    for path in _objetivos():
        rel = path.relative_to(RAIZ).as_posix()
        despues = _resumen(json.loads(path.read_text("utf-8")))
        try:
            antes = _resumen(json.loads(_git("show", f"{base}:{rel}")))
        except subprocess.CalledProcessError:
            antes = None
        escenas[rel] = {"antes": antes, "despues": despues}
        totales["despues"]["fijados"] += len(despues["fijados"])
        totales["despues"]["en_limite"] += len(despues["en_limite"])
        if antes:
            totales["antes"]["fijados"] += len(antes["fijados"])
            totales["antes"]["en_limite"] += len(antes["en_limite"])
    salida = {
        "name": "t3_2_rumbo_arrastre",
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": _git("rev-parse", "--short", "HEAD").strip(),
        "base": _git("rev-parse", "--short", base).strip(),
        "descripcion": (
            "Resultados versionados (13 escenas canónicas y 3 de inversión) contra la base: qué fija "
            "la evidencia, parámetros en su límite, desvío máximo del rumbo inicial respecto del que "
            "colocó el perito, arrastre ajustado y banderas (T3.2, ADR 0101)."
        ),
        "totales": totales,
        "escenas": escenas,
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(SALIDA)
    print(json.dumps(totales))
    for rel, e in escenas.items():
        a, d = e["antes"], e["despues"]
        if a and (
            a["fijados"] != d["fijados"]
            or a["en_limite"] != d["en_limite"]
            or a["banderas"] != d["banderas"]
        ):
            print(
                rel,
                "| fijados",
                a["fijados"],
                "->",
                d["fijados"],
                "| limite",
                a["en_limite"],
                "->",
                d["en_limite"],
                "| banderas",
                a["banderas"],
                "->",
                d["banderas"],
            )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
