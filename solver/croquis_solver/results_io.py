"""Resultados versionados de las escenas canónicas y su comparación con tolerancia.

Los resultados viven en ``packages/scene-schema/fixtures/resultados/<escena>.json`` y los usa el
visor sin solver en el navegador (el port TS llega en F9). Se regeneran con
``uv run croquis-solver reconstruct --all``; ``--check`` (y una prueba) exigen que coincidan con
lo que el solver calcula hoy. La comparación es numérica con tolerancia porque las funciones de
``libm`` pueden diferir en el último bit entre Windows y Linux; la estructura debe ser idéntica.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from croquis_scene_schema import (
    FIXTURES_DIR,
    RESULTS_DIR,
    list_fixtures,
    load_fixture,
    result_errors,
)
from croquis_solver.consistency import (
    Inconsistency,
    check_assumed_rest,
    check_consistency,
    check_damage_reach,
)
from croquis_solver.inversion import evidence_from_spec, invert
from croquis_solver.montecarlo import monte_carlo
from croquis_solver.reconstruct import reconstruct

REL_TOL = 1e-6
ABS_TOL = 1e-5
# La inversión usa álgebra lineal y optimizador propios (ADR 0027): ya no depende de BLAS. Lo único
# que cambia entre máquinas es el último bit de cos, sin, log y exp (gauss y el modelo de daño), que
# el optimizador puede amplificar hasta el último decimal reportado de un percentil. Esos bloques se
# comparan con una unidad de su resolución reportada, como E7 entre TS y Python. Estructura,
# booleanos (identificable, en el límite) y textos se siguen comparando exactos.
FIT_PREFIXES = ("/inversion", "/consistencia")
FIT_REL_TOL = 0.0
FIT_ABS_TOL = 0.011


# Escenas de la inversión que no son canónicas (ADR 0091): la deformación medida de un solo
# vehículo, con su perfil y su rigidez (AXA A2010930, del reporte de CESVI). Su resultado guarda la
# evidencia, la inversión y la bandera de daño no alcanzado.
INVERSION_DIR = FIXTURES_DIR / "inversion"
INVERSION_RESULTS_DIR = INVERSION_DIR / "resultados"


def inversion_fixtures() -> list[str]:
    return sorted(p.stem for p in INVERSION_DIR.glob("*.json"))


def with_assumed_rest_hypothesis(
    spec: dict[str, Any], flags: list[Inconsistency]
) -> dict[str, Any]:
    """La hipótesis «cuadra con el reposo supuesto», si el reposo supuesto no cabe con el daño."""
    if not any(f.codigo == "reposo_supuesto_vs_dano" for f in flags):
        return {}
    return {"inversion_reposo_supuesto": invert(spec, assumed_as_data=True).to_dict()}


def render_inversion(name: str) -> str:
    spec: dict[str, Any] = json.loads((INVERSION_DIR / f"{name}.json").read_text(encoding="utf-8"))
    seed = int(spec["meta"]["semilla"])
    ev = evidence_from_spec(spec, seed)
    inv = invert(spec)
    flags = check_damage_reach(spec, inv, seed) + check_assumed_rest(spec, inv, seed)
    doc = {
        "evidencia": ev.labels(),
        "dano_minimo": {k: d.to_dict() for k, d in sorted(ev.damage_min.items())},
        "inversion": inv.to_dict(),
        "consistencia": [i.to_dict() for i in flags],
        **with_assumed_rest_hypothesis(spec, flags),
    }
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"


def render(name: str) -> str:
    spec = load_fixture(name)
    doc = reconstruct(spec).to_dict()
    doc["incertidumbre"] = monte_carlo(spec).to_dict()
    inv = invert(spec)
    doc["inversion"] = inv.to_dict()
    flags = check_consistency(spec, inversion=inv)
    doc["consistencia"] = [f.to_dict() for f in flags]
    doc.update(with_assumed_rest_hypothesis(spec, flags))
    errors = result_errors(doc)
    if errors:
        msg = f"El resultado de {name} no cumple resultado.schema.json:\n" + "\n".join(errors[:10])
        raise ValueError(msg)
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"


def differences(expected: Any, actual: Any, path: str = "") -> list[str]:
    """Diferencias estructurales o numéricas fuera de tolerancia (lista vacía si coinciden)."""
    out: list[str] = []
    if isinstance(expected, bool) or isinstance(actual, bool):
        if expected != actual:
            out.append(f"{path}: {expected!r} ≠ {actual!r}")
    elif isinstance(expected, int | float) and isinstance(actual, int | float):
        fit = path.startswith(FIT_PREFIXES)
        rel, abs_ = (FIT_REL_TOL, FIT_ABS_TOL) if fit else (REL_TOL, ABS_TOL)
        if not math.isclose(float(expected), float(actual), rel_tol=rel, abs_tol=abs_):
            out.append(f"{path}: {expected} ≠ {actual}")
    elif isinstance(expected, dict) and isinstance(actual, dict):
        e_keys: set[str] = set(expected)  # pyright: ignore[reportUnknownArgumentType]
        a_keys: set[str] = set(actual)  # pyright: ignore[reportUnknownArgumentType]
        if e_keys != a_keys:
            out.append(f"{path}: claves {sorted(e_keys ^ a_keys)}")
        for k in sorted(e_keys & a_keys):
            out += differences(expected[k], actual[k], f"{path}/{k}")
    elif isinstance(expected, list) and isinstance(actual, list):
        if len(expected) != len(actual):  # pyright: ignore[reportUnknownArgumentType]
            out.append(f"{path}: longitud {len(expected)} ≠ {len(actual)}")  # pyright: ignore[reportUnknownArgumentType]
        else:
            for i, (a, b) in enumerate(zip(expected, actual, strict=True)):  # pyright: ignore[reportUnknownArgumentType, reportUnknownVariableType]
                out += differences(a, b, f"{path}/{i}")
    elif expected != actual:
        out.append(f"{path}: {expected!r} ≠ {actual!r}")
    return out


def write_all(results_dir: Path = RESULTS_DIR) -> list[Path]:
    results_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name in list_fixtures():
        path = results_dir / f"{name}.json"
        path.write_text(render(name), encoding="utf-8", newline="\n")
        written.append(path)
    INVERSION_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    for name in inversion_fixtures():
        path = INVERSION_RESULTS_DIR / f"{name}.json"
        path.write_text(render_inversion(name), encoding="utf-8", newline="\n")
        written.append(path)
    return written


def check_all(results_dir: Path = RESULTS_DIR) -> dict[str, list[str]]:
    """Escena → diferencias (solo las que no coinciden)."""
    bad: dict[str, list[str]] = {}
    for name in list_fixtures():
        path = results_dir / f"{name}.json"
        if not path.exists():
            bad[name] = ["falta el archivo"]
            continue
        expected = json.loads(path.read_text(encoding="utf-8"))
        diff = differences(expected, json.loads(render(name)))
        if diff:
            bad[name] = diff
    for name in inversion_fixtures():
        path = INVERSION_RESULTS_DIR / f"{name}.json"
        if not path.exists():
            bad[f"inversion/{name}"] = ["falta el archivo"]
            continue
        expected = json.loads(path.read_text(encoding="utf-8"))
        diff = differences(expected, json.loads(render_inversion(name)))
        if diff:
            bad[f"inversion/{name}"] = diff
    return bad
