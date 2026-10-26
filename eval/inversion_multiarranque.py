"""Multiarranque determinista (ADR 0091): qué cambia en los resultados versionados contra `main`.

Compara cada resultado de `packages/scene-schema/fixtures/resultados/` (las escenas canónicas) y de
`fixtures/inversion/resultados/` con el de la base (`git merge-base HEAD origin/main`):

- por escena, las estimaciones de la inversión (mejor, p10 y p90 de cada parámetro identificable),
  los modos que encontró el multiarranque y si hay alternativas dentro del margen;
- qué otras partes del resultado cambian (fuera de la inversión y de `version_resultado`).

    uv run python eval/inversion_multiarranque.py  → eval/results/inversion_multiarranque.json
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "eval/results/inversion_multiarranque.json"
CARPETAS = (
    "packages/scene-schema/fixtures/resultados",
    "packages/scene-schema/fixtures/inversion/resultados",
)


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=RAIZ, capture_output=True, text=True, check=True, encoding="utf-8"
    ).stdout


def estimaciones(inv: dict[str, Any] | None) -> dict[str, Any]:
    if not inv:
        return {}
    out: dict[str, Any] = {}
    for p in inv.get("parametros", []):
        clave = f"{p['parametro']}:{p['vehiculo']}"
        e = p.get("estimacion")
        out[clave] = (
            {"mejor": e["mejor"], "p10": e.get("p10"), "p90": e.get("p90")}
            if p.get("identificable") and e
            else "no identificable"
        )
    return out


def otras_partes(a: dict[str, Any], b: dict[str, Any]) -> list[str]:
    fuera = {"version_resultado", "inversion", "inversion_reposo_supuesto"}
    return sorted(k for k in set(a) | set(b) if k not in fuera and a.get(k) != b.get(k))


def main() -> int:
    base = git("merge-base", "HEAD", "origin/main").strip()
    escenas: dict[str, Any] = {}
    nuevas: list[str] = []
    for carpeta in CARPETAS:
        for ruta in sorted((RAIZ / carpeta).glob("*.json")):
            rel = f"{carpeta}/{ruta.name}"
            despues = json.loads(ruta.read_text(encoding="utf-8"))
            if rel not in git("ls-tree", "-r", "--name-only", base, carpeta).splitlines():
                nuevas.append(rel)  # escena nueva: no hay antes con qué comparar
                continue
            antes = json.loads(git("show", f"{base}:{rel}"))
            ia: dict[str, Any] | None = antes.get("inversion")
            ib: dict[str, Any] = despues.get("inversion") or {}
            ea, eb = estimaciones(ia), estimaciones(ib)
            multi: dict[str, Any] = ib.get("multiarranque") or {}
            modos: list[dict[str, Any]] = multi.get("modos", [])
            escenas[rel] = {
                "estimaciones_iguales": ea == eb,
                "antes": ea,
                "despues": eb,
                "modos": [
                    {"costo": m["costo"], "arranques": m["arranques"], "en_margen": m["en_margen"]}
                    for m in modos
                ],
                "alternativas": len(ib.get("alternativas", [])),
                "reposo_supuesto": {
                    "antes": estimaciones(antes.get("inversion_reposo_supuesto")),
                    "despues": estimaciones(despues.get("inversion_reposo_supuesto")),
                }
                if "inversion_reposo_supuesto" in antes or "inversion_reposo_supuesto" in despues
                else None,
                "otras_partes_que_cambian": otras_partes(antes, despues),
                "banderas": {
                    "antes": [c["codigo"] for c in antes.get("consistencia", [])],
                    "despues": [c["codigo"] for c in despues.get("consistencia", [])],
                },
            }
    doc = {
        "name": "inversion_multiarranque",
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git("rev-parse", "--short", "HEAD").strip(),
        "base": git("rev-parse", "--short", base).strip(),
        "descripcion": (
            "Resultados versionados (escenas canónicas e inversión) con el multiarranque "
            "determinista contra la base: estimaciones, modos y qué otras partes cambian."
        ),
        "escenas": escenas,
        "nuevas": nuevas,
        "con_estimaciones_iguales": sum(e["estimaciones_iguales"] for e in escenas.values()),
        "total": len(escenas),
        "con_alternativas": sorted(k for k, e in escenas.items() if e["alternativas"]),
    }
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for k, e in escenas.items():
        estado = "iguales" if e["estimaciones_iguales"] else "CAMBIAN"
        sys.stdout.write(
            f"{Path(k).stem} {estado} | modos {len(e['modos'])} | alternativas "
            f"{e['alternativas']} | otras partes {e['otras_partes_que_cambian']}\n"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
