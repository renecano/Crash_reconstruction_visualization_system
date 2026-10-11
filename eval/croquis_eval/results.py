"""Escritura uniforme de resultados en ``eval/results``.

Cada resultado lleva fecha, commit, versión del paquete y la semilla usada, para que
cualquier cifra del README pueda rastrearse hasta el script que la produjo.
"""

import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

RESULTS_DIR = Path(__file__).resolve().parents[1] / "results"


def git_commit() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True
        )
    except OSError, subprocess.CalledProcessError:
        return None
    return out.stdout.strip() or None


def write_result(
    name: str,
    payload: dict[str, Any],
    *,
    seed: int | None = None,
    results_dir: Path = RESULTS_DIR,
) -> Path:
    """Guarda ``payload`` como ``<name>.json`` con metadatos de procedencia. Devuelve la ruta."""
    results_dir.mkdir(parents=True, exist_ok=True)
    doc = {
        "name": name,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "git_commit": git_commit(),
        "seed": seed,
        **payload,
    }
    path = results_dir / f"{name}.json"
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def read_result(name: str, *, results_dir: Path = RESULTS_DIR) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((results_dir / f"{name}.json").read_text(encoding="utf-8"))
    return data
