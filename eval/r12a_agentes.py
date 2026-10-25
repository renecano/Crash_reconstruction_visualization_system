"""R12a (ADR 0088): los conductores como agentes en las escenas de hipótesis, contra la
reconstrucción sin hipótesis (la línea base).

Por escena: si hay contacto, cuándo y con qué velocidad relativa, en la hipótesis y en la línea
base, y la decisión de cada conductor (quién frena, por qué y cuándo). Son los criterios de «Listo
cuando» del plan: un caso del corpus (AXA) que reproduce la reconstrucción, una hipótesis del
perito que cambia el resultado como dice la física y una carambola con la reacción en cadena.

    uv run python eval/r12a_agentes.py  → eval/results/r12a_agentes.json
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from croquis_solver import agent_fixtures
from croquis_solver.agents import simulate_drivers
from croquis_solver.reconstruct import reconstruct

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "eval/results/r12a_agentes.json"


def resumen(sim: dict[str, Any]) -> dict[str, Any]:
    if not sim["contacto"]:
        return {"contacto": False, "distancia_minima_m": sim["distancia_minima_m"]}
    return {
        "contacto": True,
        "t_s": sim["t"],
        "velocidad_relativa_kmh": sim["velocidad_relativa_kmh"],
    }


def main() -> int:
    escenas: dict[str, Any] = {}
    for nombre, construir in agent_fixtures.FIXTURES.items():
        spec = construir()
        res = simulate_drivers(spec, reconstruct(spec))
        assert res is not None
        d = res.to_dict()
        escenas[nombre] = {
            "titulo": spec["meta"]["titulo"],
            "hipotesis": resumen(d["resultado"]),
            "linea_base": resumen(d["linea_base"]),
            "igual_a_la_linea_base": d["resultado"] == d["linea_base"],
            "decisiones": {
                c["vehiculo"]: c.get("decision") for c in d["conductores"] if c.get("decision")
            },
            **({"sensibilidad": d["sensibilidad"]} if "sensibilidad" in d else {}),
        }
    doc = {
        "name": "r12a_agentes",
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=RAIZ, capture_output=True, text=True
        ).stdout.strip(),
        "descripcion": (
            "Los conductores como agentes (R12a) en las escenas de hipótesis: la hipótesis "
            "contra la reconstrucción sin ella, con la decisión de cada conductor."
        ),
        "escenas": escenas,
    }
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    sys.stdout.write(json.dumps(doc, ensure_ascii=False, indent=1)[:3000] + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
