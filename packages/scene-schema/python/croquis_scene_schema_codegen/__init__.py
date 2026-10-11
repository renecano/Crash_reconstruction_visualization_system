"""Genera ``croquis_scene_schema/generated.py`` (Pydantic v2) desde ``escena.schema.json``.

Vive fuera del paquete ``croquis_scene_schema`` para poder correr antes de que exista
``generated.py``. Usa datamodel-code-generator y formatea con la configuración de ruff del repo.

Uso: ``uv run croquis-scene-schema-generate`` (escribe) o ``--check`` (falla si está
desactualizado). Los modelos generados nunca se editan a mano (CLAUDE.md, reglas técnicas).
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

PYTHON_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = PYTHON_DIR.parents[2]
SCHEMA_PATH = PYTHON_DIR.parent / "escena.schema.json"
OUT_PATH = PYTHON_DIR / "croquis_scene_schema" / "generated.py"
RUFF_CONFIG = REPO_ROOT / "pyproject.toml"

HEADER = (
    "# Generado por croquis_scene_schema_codegen a partir de escena.schema.json. "
    "NO EDITAR A MANO.\n"
    "# Regenera con `uv run croquis-scene-schema-generate`.\n"
)

CODEGEN_ARGS = [
    "--input-file-type",
    "jsonschema",
    "--output-model-type",
    "pydantic_v2.BaseModel",
    "--target-python-version",
    "3.14",
    "--target-pydantic-version",
    "2.12",
    "--use-annotated",
    "--field-constraints",
    "--use-standard-collections",
    "--use-union-operator",
    "--use-schema-description",
    "--use-field-description",
    "--use-title-as-name",
    "--enum-field-as-literal",
    "all",
    "--extra-fields",
    "forbid",
    "--strict-nullable",
    "--disable-timestamp",
    "--use-double-quotes",
    "--collapse-root-models",
    "--formatters",
    "ruff-format",
]


def render() -> str:
    """Corre datamodel-codegen a un archivo temporal y devuelve el código formateado."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "generated.py"
        cmd = [
            sys.executable,
            "-m",
            "datamodel_code_generator",
            "--input",
            str(SCHEMA_PATH),
            "--output",
            str(out),
            *CODEGEN_ARGS,
        ]
        subprocess.run(cmd, check=True)
        fmt = [
            sys.executable,
            "-m",
            "ruff",
            "format",
            "--quiet",
            "--config",
            str(RUFF_CONFIG),
            str(out),
        ]
        subprocess.run(fmt, check=True)
        sort_imports = [
            sys.executable,
            "-m",
            "ruff",
            "check",
            "--quiet",
            "--fix",
            "--select",
            "I",
            "--config",
            str(RUFF_CONFIG),
            str(out),
        ]
        subprocess.run(sort_imports, check=True)
        body = out.read_text(encoding="utf-8").replace("\r\n", "\n")
    return HEADER + body


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    code = render()
    if "--check" in args:
        current = ""
        if OUT_PATH.exists():
            current = OUT_PATH.read_text(encoding="utf-8").replace("\r\n", "\n")
        if current != code:
            sys.stderr.write(
                f"Desactualizado: {OUT_PATH}. Corre `uv run croquis-scene-schema-generate`.\n"
            )
            return 1
        sys.stdout.write("Pydantic generado al día.\n")
        return 0
    OUT_PATH.write_text(code, encoding="utf-8", newline="\n")
    sys.stdout.write(f"Escrito {OUT_PATH}\n")
    return 0
