"""Utilidades de texto para el relato: plegado y datos compartidos con el port TS.

El plegado (minúsculas, sin acentos, ñ → n) se hace carácter por carácter, así que el texto plegado
mide lo mismo que el original y una coincidencia en uno tiene exactamente la misma posición en el
otro: la evidencia se cita con el fragmento literal del relato.
"""

from __future__ import annotations

import json
import unicodedata
from functools import cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[2] / "packages" / "relato" / "data"


def fold_char(ch: str) -> str:
    """Un carácter en minúscula y sin diacríticos (siempre un carácter)."""
    base = unicodedata.normalize("NFD", ch)[0]
    low = base.lower()
    return low if len(low) == 1 else base


def fold(text: str) -> str:
    """Texto plegado de la misma longitud que el original."""
    return "".join(fold_char(c) for c in text)


@cache
def load_json(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((DATA_DIR / name).read_text(encoding="utf-8"))
    return data
