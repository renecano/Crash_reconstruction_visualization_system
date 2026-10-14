"""Utilidades de texto para el relato: plegado y datos compartidos con el port TS.

El plegado (minúsculas, sin acentos, ñ → n, espacios Unicode → " ") se hace carácter por carácter,
así que el texto plegado mide lo mismo que el original y una coincidencia en uno tiene exactamente
la misma posición en el otro: la evidencia se cita con el fragmento literal del relato.
"""

from __future__ import annotations

import json
import unicodedata
from functools import cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[2] / "packages" / "relato" / "data"


# Espacios fuera de ASCII: se vuelven " " (uno a uno) para que \s signifique lo mismo en Python
# (re con ASCII) y en JS. La lista es la misma en `packages/relato/src/text.ts`.
UNICODE_SPACES = frozenset(
    "\x1c\x1d\x1e\x1f\x85\xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007"
    "\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)


def normalize_spaces(text: str) -> str:
    """El texto con los espacios Unicode como " " (misma longitud)."""
    return "".join(" " if c in UNICODE_SPACES else c for c in text)


def fold_char(ch: str) -> str:
    """Un carácter en minúscula y sin diacríticos (siempre un carácter)."""
    if ch in UNICODE_SPACES:
        return " "
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
