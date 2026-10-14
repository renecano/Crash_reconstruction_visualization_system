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

from croquis_scene_schema import RESULTS_DIR, list_fixtures, load_fixture, result_errors
from croquis_solver.montecarlo import monte_carlo
from croquis_solver.reconstruct import reconstruct

REL_TOL = 1e-6
ABS_TOL = 1e-5


def render(name: str) -> str:
    spec = load_fixture(name)
    doc = reconstruct(spec).to_dict()
    doc["incertidumbre"] = monte_carlo(spec).to_dict()
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
        if not math.isclose(float(expected), float(actual), rel_tol=REL_TOL, abs_tol=ABS_TOL):
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
    return bad
