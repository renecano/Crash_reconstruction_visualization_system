"""La regla «lo medido pesa más que lo supuesto» (ADR 0091): antes y después en las escenas
canónicas y la paridad Python/TS.

- **Escenas canónicas:** la inversión de cada una con el código de antes de la regla (los
  resultados guardados en el commit `ANTES`) contra la de ahora (los de `fixtures/resultados`):
  velocidades y rumbos estimados, si cambian y qué claves nuevas trae el resultado.
- **Paridad:** `croquis-solver reconstruct --check` (los resultados guardados son los que da la
  referencia Python) y las pruebas de paridad del port TS (escenas canónicas y de la inversión).

    uv run python eval/inversion_prioridad.py
      → eval/results/inversion_prioridad.json
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parents[1]
ANTES = "8ab9271"  # main antes del diagnóstico de AXA y de la regla
RESULTADOS = "packages/scene-schema/fixtures/resultados"
SALIDA = RAIZ / "eval/results/inversion_prioridad.json"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=RAIZ, capture_output=True, check=True, text=True, encoding="utf-8"
    ).stdout


def estimaciones(inv: dict[str, Any]) -> dict[str, Any]:
    return {
        f"{p['parametro']}:{p['vehiculo']}": (
            p["estimacion"]["mejor"] if p.get("estimacion") else "no la fija"
        )
        for p in inv.get("parametros", [])
    }


def escenas() -> list[dict[str, Any]]:
    filas: list[dict[str, Any]] = []
    for f in sorted((RAIZ / RESULTADOS).glob("*.json")):
        antes = json.loads(git("show", f"{ANTES}:{RESULTADOS}/{f.name}"))
        ahora = json.loads(f.read_text(encoding="utf-8"))
        ia, ib = antes.get("inversion", {}), ahora.get("inversion", {})
        sin_nuevas = {k: v for k, v in ib.items() if k in ia}
        a = {k: v for k, v in antes.items() if k != "version_resultado"}
        b = {k: v for k, v in ahora.items() if k not in ("version_resultado",)}
        b["inversion"] = sin_nuevas
        filas.append(
            {
                "escena": f.stem,
                "evidencia": ib.get("evidencia", []),
                "estimaciones_antes": estimaciones(ia),
                "estimaciones_despues": estimaciones(ib),
                "resultado_igual_salvo_claves_nuevas": a == b,
                "claves_nuevas_en_la_inversion": sorted(set(ib) - set(ia)),
                "claves_nuevas_en_el_resultado": sorted(set(ahora) - set(antes)),
            }
        )
    return filas


def paridad() -> dict[str, Any]:
    check = subprocess.run(
        ["uv", "run", "croquis-solver", "reconstruct", "--check"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    ts = subprocess.run(
        "pnpm exec vitest run src/parity.test.ts src/inversion-un-dano.test.ts",
        cwd=RAIZ / "packages/solver-ts",
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=True,
    )
    texto = re.sub(r"\x1b\[[0-9;]*m", "", ts.stdout)
    m = re.search(r"Tests\s+(\d+) passed(?: \((\d+)\))?", texto)
    fallas = re.search(r"(\d+) failed", texto)
    return {
        "python_reconstruct_check_ok": check.returncode == 0,
        "ts_pruebas_de_paridad": {
            "pasaron": int(m.group(1)) if m else 0,
            "fallaron": int(fallas.group(1)) if fallas else 0,
            "ok": ts.returncode == 0,
        },
    }


def main() -> int:
    filas = escenas()
    doc = {
        "name": "inversion_prioridad",
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git("rev-parse", "--short", "HEAD").strip(),
        "antes": ANTES,
        "descripcion": (
            "La regla «lo medido pesa más que lo supuesto» (ADR 0091): la inversión de las 13 "
            "escenas canónicas antes y después, y la paridad Python/TS."
        ),
        "escenas": filas,
        "escenas_con_estimaciones_iguales": sum(
            f["estimaciones_antes"] == f["estimaciones_despues"] for f in filas
        ),
        "escenas_con_resultado_igual_salvo_claves_nuevas": sum(
            f["resultado_igual_salvo_claves_nuevas"] for f in filas
        ),
        "paridad": paridad(),
    }
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    resumen = {k: v for k, v in doc.items() if k != "escenas"}
    sys.stdout.write(json.dumps(resumen, ensure_ascii=False, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
