"""Glosario de español mexicano (PLAN §5.1, paso 4): encuentra expresiones en el relato.

Cada coincidencia trae la entrada del glosario, su posición y el fragmento literal del relato, así
que puede citarse como evidencia. Las entradas ambiguas traen la pregunta que conviene hacer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import cache
from typing import Any

from croquis_extraction.text import fold, load_json


@dataclass(frozen=True)
class Term:
    id: str
    start: int
    end: int
    texto: str
    efectos: tuple[dict[str, Any], ...]
    ambiguo: bool
    pregunta: str | None


@cache
def _compiled() -> list[tuple[dict[str, Any], re.Pattern[str]]]:
    out: list[tuple[dict[str, Any], re.Pattern[str]]] = []
    for e in load_json("glosario.json")["entradas"]:
        alts = "|".join(f"(?:{p})" for p in e["patrones"])
        out.append((e, re.compile(rf"(?<![a-z0-9])(?:{alts})(?![a-z0-9])", re.ASCII)))
    return out


def _prompt_n(prompt: str) -> int:
    """Número de una versión del prompt (`extraccion_v4` → 4)."""
    return int(prompt.rsplit("_v", 1)[1])


def glossary_version(prompt: str | None = None) -> str:
    """Versión del glosario; para un prompt anterior a sus últimas entradas, la que vio ese prompt
    (`version_por_prompt`), así su huella no cambia (ADR 0043)."""
    g = load_json("glosario.json")
    if prompt is not None and prompt in g.get("version_por_prompt", {}):
        return str(g["version_por_prompt"][prompt])
    return str(g["version"])


def glossary_entries(prompt: str | None = None) -> list[dict[str, Any]]:
    """Entradas del glosario; con un prompt, solo las que ese prompt conoce (las que tienen
    `desde` entran en esa versión y las siguientes). La línea base de reglas usa todas."""
    out: list[dict[str, Any]] = []
    for e in load_json("glosario.json")["entradas"]:
        desde = e.get("desde")
        if prompt is None or desde is None or _prompt_n(prompt) >= _prompt_n(str(desde)):
            out.append(e)
    return out


def find_terms(text: str) -> list[Term]:
    """Coincidencias del glosario, sin traslapes: gana la más larga y luego la primera."""
    folded = fold(text)
    found: list[Term] = []
    for e, rx in _compiled():
        for m in rx.finditer(folded):
            found.append(
                Term(
                    id=str(e["id"]),
                    start=m.start(),
                    end=m.end(),
                    texto=text[m.start() : m.end()],
                    efectos=tuple(e["efectos"]),
                    ambiguo=bool(e.get("ambiguo", False)),
                    pregunta=e.get("pregunta"),
                )
            )
    found.sort(key=lambda t: (t.start, -(t.end - t.start), t.id))
    chosen: list[Term] = []
    for t in sorted(found, key=lambda t: (-(t.end - t.start), t.start, t.id)):
        if all(t.end <= c.start or t.start >= c.end for c in chosen):
            chosen.append(t)
    return sorted(chosen, key=lambda t: (t.start, t.id))
