"""Antes y después de un cambio de la inversión en los resultados versionados (endurecimiento).

Compara cada resultado de `packages/scene-schema/fixtures/resultados/` (escenas canónicas) y de
`fixtures/inversion/resultados/` con el de la base de la rama (`git merge-base HEAD origin/main`):

- las estimaciones de cada parámetro (mejor, p10, p90 y de dónde sale el rango);
- los rangos raros: de ancho cero (p10 = p90) y con el mejor fuera de su p10–p90;
- las banderas de consistencia.

Con un segundo argumento compara además E-R4 con la inversión: `cesvi_r4_inversion_<nombre>.json`
(`cesvi_r4_inversion.mts` con el código de la rama) contra `cesvi_r4_inversion_<anterior>.json`.

    uv run python eval/endurecimiento_inversion.py <nombre> [anterior]  → eval/results/<nombre>.json
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parents[1]
CARPETAS = (
    "packages/scene-schema/fixtures/resultados",
    "packages/scene-schema/fixtures/inversion/resultados",
)


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=RAIZ, capture_output=True, text=True, check=True, encoding="utf-8"
    ).stdout


def estimaciones(inv: dict[str, Any] | None) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for p in (inv or {}).get("parametros", []):
        e = p.get("estimacion")
        clave = f"{p['parametro']}:{p['vehiculo']}"
        out[clave] = (
            {
                "mejor": e["mejor"],
                "p10": e["p10"],
                "p90": e["p90"],
                "rango_por": e.get("rango_por", "muestras"),
            }
            if p.get("identificable") and e
            else "no identificable"
        )
    return out


def raros(est: dict[str, Any]) -> dict[str, list[str]]:
    ancho_cero: list[str] = []
    fuera: list[str] = []
    for k, e in est.items():
        if isinstance(e, str):
            continue
        d: dict[str, float] = {k2: v for k2, v in e.items() if isinstance(v, float | int)}
        if d["p90"] - d["p10"] <= 1e-9:
            ancho_cero.append(k)
        if not d["p10"] - 1e-9 <= d["mejor"] <= d["p90"] + 1e-9:
            fuera.append(k)
    return {"ancho_cero": ancho_cero, "mejor_fuera_del_rango": fuera}


def codigos(doc: dict[str, Any]) -> list[str]:
    consistencia: list[dict[str, Any]] = doc.get("consistencia", [])
    return [str(c["codigo"]) for c in consistencia]


def comparar_er4(nombre: str, anterior: str) -> dict[str, Any] | None:
    a_p = RAIZ / f"eval/results/cesvi_r4_inversion_{anterior}.json"
    b_p = RAIZ / f"eval/results/cesvi_r4_inversion_{nombre}.json"
    if not (a_p.exists() and b_p.exists()):
        return None
    a = json.loads(a_p.read_text(encoding="utf-8"))
    b = json.loads(b_p.read_text(encoding="utf-8"))
    da: list[Any] = a["detalle"]
    db: list[Any] = b["detalle"]
    return {
        "antes": {"archivo": a_p.name, "git_commit": a["git_commit"]},
        "despues": {"archivo": b_p.name, "git_commit": b["git_commit"]},
        "impactos_antes": a["impactos"],
        "impactos_despues": b["impactos"],
        "con_alguna_velocidad_fijada": [
            a["con_alguna_velocidad_fijada"],
            b["con_alguna_velocidad_fijada"],
        ],
        "detalle_igual": sum(x == y for x, y in zip(da, db, strict=True)),
        "narraciones": len(db),
    }


def main() -> int:
    nombre = sys.argv[1] if len(sys.argv) > 1 else "endurecimiento_inversion"
    anterior = sys.argv[2] if len(sys.argv) > 2 else None
    base = git("merge-base", "HEAD", "origin/main").strip()
    escenas: dict[str, Any] = {}
    totales = {"antes": {"ancho_cero": 0, "fuera": 0}, "despues": {"ancho_cero": 0, "fuera": 0}}
    for carpeta in CARPETAS:
        en_base = set(git("ls-tree", "-r", "--name-only", base, carpeta).splitlines())
        for ruta in sorted((RAIZ / carpeta).glob("*.json")):
            rel = f"{carpeta}/{ruta.name}"
            despues = json.loads(ruta.read_text(encoding="utf-8"))
            antes: dict[str, Any] = (
                json.loads(git("show", f"{base}:{rel}")) if rel in en_base else {}
            )
            ea, eb = estimaciones(antes.get("inversion")), estimaciones(despues.get("inversion"))
            ra, rb = raros(ea), raros(eb)
            for t, r in (("antes", ra), ("despues", rb)):
                totales[t]["ancho_cero"] += len(r["ancho_cero"])
                totales[t]["fuera"] += len(r["mejor_fuera_del_rango"])
            escenas[rel] = {
                "nueva": rel not in en_base,
                "estimaciones_iguales": ea == eb,
                "antes": ea,
                "despues": eb,
                "raros_antes": ra,
                "raros_despues": rb,
                "banderas": {
                    "antes": codigos(antes),
                    "despues": codigos(despues),
                },
            }
    doc = {
        "name": nombre,
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git("rev-parse", "--short", "HEAD").strip(),
        "base": git("rev-parse", "--short", base).strip(),
        "descripcion": (
            "Resultados versionados (escenas canónicas y de inversión) contra la base de la rama: "
            "estimaciones, rangos de ancho cero, mejores fuera de su p10–p90 y banderas."
        ),
        "totales": totales,
        "e_r4": comparar_er4(nombre, anterior) if anterior else None,
        "con_estimaciones_iguales": sum(e["estimaciones_iguales"] for e in escenas.values()),
        "total": len(escenas),
        "escenas": escenas,
    }
    salida = RAIZ / f"eval/results/{nombre}.json"
    salida.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    resumen = {k: doc[k] for k in ("git_commit", "base", "totales", "e_r4")}
    sys.stdout.write(json.dumps(resumen) + "\n")
    for k, e in escenas.items():
        if not e["estimaciones_iguales"] or e["banderas"]["antes"] != e["banderas"]["despues"]:
            sys.stdout.write(
                f"{Path(k).stem}: raros {e['raros_antes']} -> {e['raros_despues']}; "
                f"banderas {e['banderas']['antes']} -> {e['banderas']['despues']}\n"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
