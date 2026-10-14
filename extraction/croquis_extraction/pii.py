"""Redacción de datos personales en el dispositivo (PLAN §5.1, paso 1; §10).

El texto que sale del dispositivo no lleva nombres, placas, teléfonos, correos, CURP, RFC ni
números de domicilio. Corre en el navegador (port TS en `packages/relato`, con paridad probada) y
aquí como referencia. Reemplaza cada dato por un marcador (`[NOMBRE]`, `[PLACA]`, …) y devuelve
los tramos para que la interfaz pueda mostrar el original solo en el dispositivo.

Nombres: diccionario de nombres de pila comunes (DataMX, CC0) con mayúscula, o después de una pista
("me llamo", "el señor", "mi esposa"…); se extiende a las palabras con mayúscula que siguen
(apellidos). En minúsculas solo si son dos nombres o nombre y apellido seguidos. Los nombres que
también son palabras comunes ("luz", "rosa", "cruz"…) necesitan otra palabra de nombre junto.
Los nombres de calles y lugares no se tocan: son parte del lugar del percance.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import cache

from croquis_extraction.text import fold, load_json

MARKERS = ("NOMBRE", "PLACA", "TELEFONO", "CORREO", "CURP", "RFC", "NUMERO")

_WORD = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+")
_CUES = re.compile(
    r"(?<![a-z])(?:me llamo|mi nombre es|se llama|se llamaba|el senor|la senora|la senorita|"
    r"el joven|la joven|don|dona|el licenciado|la licenciada|el ingeniero|la ingeniera|"
    r"el doctor|la doctora|el oficial|la oficial|el agente|la agente|el ajustador|la ajustadora|"
    r"mi esposo|mi esposa|mi hijo|mi hija|mi hermano|mi hermana|mi papa|mi mama|mi novio|"
    r"mi novia|mi amigo|mi amiga|mi companero|mi companera|mi primo|mi prima|mi tio|mi tia|"
    r"el chofer|la chofer|el conductor|la conductora)\s+"
)
# Palabras que anuncian un lugar: lo que sigue es nombre de calle, colonia, etc., no de persona.
_PLACE_CUES = {
    "calle",
    "avenida",
    "av",
    "ave",
    "boulevard",
    "bulevar",
    "blvd",
    "calzada",
    "colonia",
    "col",
    "carretera",
    "autopista",
    "periferico",
    "glorieta",
    "puente",
    "plaza",
    "parque",
    "esquina",
    "mercado",
    "escuela",
    "hospital",
    "iglesia",
    "privada",
    "cerrada",
    "andador",
    "callejon",
    "fraccionamiento",
    "barrio",
    "pueblo",
    "municipio",
    "ciudad",
    "estado",
    "entre",
    "metro",
    "estacion",
    "paseo",
    "circuito",
    "eje",
    "via",
    "camino",
    "libramiento",
    "prolongacion",
}
_PARTICLES = {"de", "del", "la", "las", "los", "y"}
# Conectores entre una pista de lugar y el nombre del lugar ("esquina con Miguel Hidalgo").
_PLACE_LINKS = _PARTICLES | {"con", "e", "esq", "y", "a", "en", "por", "sobre", "hacia"}
_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("CORREO", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("CURP", re.compile(r"\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b")),
    ("RFC", re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b")),
    (
        "TELEFONO",
        re.compile(
            r"(?<![\w])(?:\+?52[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{4}(?![\w])"
        ),
    ),
    (
        "PLACA",
        re.compile(
            r"(?i)(?<![\w])(?:[A-Z]{3}[\s-]?\d{3}[\s-]?[A-Z]|[A-Z]{3}[\s-]?\d{2}[\s-]?\d{2}|"
            r"\d{3}[\s-]?[A-Z]{3}|[A-Z]{2}[\s-]?\d{2}[\s-]?\d{3}|[A-Z]\d{2}[\s-]?[A-Z]{3}|"
            r"\d{2}[\s-]?[A-Z]{2}[\s-]?\d{2}|[A-Z]{3}[\s-]?\d{4})(?![\w])"
        ),
    ),
    (
        "PLACA",
        re.compile(
            r"(?i)(?<=placas)(?:\s+(?:de|con|numero|número|son|eran))?[\s:]*([A-Z0-9][A-Z0-9-]{2,9})"
        ),
    ),
    (
        "PLACA",
        re.compile(
            r"(?i)(?<=placa)(?:\s+(?:de|con|numero|número|es|era))?[\s:]*([A-Z0-9][A-Z0-9-]{2,9})"
        ),
    ),
    (
        "NUMERO",
        re.compile(
            r"(?i)(?:(?<![\w])(?:numero|número|num\.?|no\.|#)\s*\d{1,5}(?![\s.-]?\d)[A-Z]?"
            r"(?:\s*(?:int(?:erior)?\.?|depto\.?|departamento)\s*[A-Z0-9-]+)?)"
        ),
    ),
]


@dataclass(frozen=True)
class Span:
    kind: str
    start: int  # en el texto original
    end: int
    original: str


@dataclass(frozen=True)
class Redaction:
    text: str
    spans: tuple[Span, ...]

    def counts(self) -> dict[str, int]:
        out: dict[str, int] = dict.fromkeys(MARKERS, 0)
        for s in self.spans:
            out[s.kind] += 1
        return out


@cache
def _names() -> tuple[frozenset[str], frozenset[str], frozenset[str]]:
    d = load_json("nombres.json")
    return frozenset(d["nombres"]), frozenset(d["ambiguos"]), frozenset(d["apellidos_frecuentes"])


def _is_cap(w: str) -> bool:
    return w[:1].isupper()


def _name_spans(text: str) -> list[tuple[int, int]]:
    names, ambiguous, surnames = _names()
    folded = fold(text)
    words = [(m.start(), m.end(), m.group(0)) for m in _WORD.finditer(text)]
    spans: list[tuple[int, int]] = []

    def surname_like(w: str) -> bool:
        f = fold(w)
        return f in surnames or (len(f) >= 5 and f.endswith("ez"))

    def extend(i: int) -> int:
        """Último índice de la secuencia de nombre que empieza en i."""
        j = i
        k = i + 1
        while k < len(words) and k - i <= 5:
            w = words[k][2]
            gap = text[words[k - 1][1] : words[k][0]]
            if gap.strip() not in ("", "-"):
                break
            if _is_cap(w) and fold(w) not in _PARTICLES:
                j = k
                k += 1
            elif fold(w) in _PARTICLES and k + 1 < len(words) and _is_cap(words[k + 1][2]):
                k += 1
            else:
                break
        return j

    cue_starts = {m.end() for m in _CUES.finditer(folded) if text[m.end() : m.end() + 1].isupper()}

    def after_place_cue(i: int) -> bool:
        """¿La palabra i (o la secuencia que la contiene) sigue a una pista de lugar?"""
        k = i - 1
        while k >= 0 and fold(words[k][2]) in _PLACE_LINKS:
            k -= 1
        while k >= 0 and _is_cap(words[k][2]) and fold(words[k][2]) not in _PLACE_CUES:
            k -= 1
            while k >= 0 and fold(words[k][2]) in _PLACE_LINKS:
                k -= 1
        return k >= 0 and fold(words[k][2]).rstrip(".") in _PLACE_CUES

    def sentence_start(i: int) -> bool:
        before = text[: words[i][0]].rstrip()
        return before == "" or before[-1] in '.!?¡¿\n:;"«('

    i = 0
    while i < len(words):
        s, e, w = words[i]
        f = fold(w)
        nxt = words[i + 1][2] if i + 1 < len(words) else ""
        adjacent = i + 1 < len(words) and text[e : words[i + 1][0]].strip() == ""
        is_name = False
        if s in cue_starts and _is_cap(w):
            is_name = True
        elif after_place_cue(i):
            is_name = False
        elif _is_cap(w) and (
            (f in names and f not in ambiguous)
            or (f in ambiguous and not sentence_start(i))
            or (
                f in names
                and adjacent
                and _is_cap(nxt)
                and (fold(nxt) in names or surname_like(nxt))
            )
        ):
            is_name = True
        elif (
            not _is_cap(w)
            and f in names
            and f not in ambiguous
            and adjacent
            and (fold(nxt) in names or surname_like(nxt))
            and fold(nxt) not in ambiguous
        ):
            # Sin mayúsculas: "juan perez", "maria lopez".
            spans.append((s, words[i + 1][1]))
            i += 2
            continue
        if is_name:
            j = extend(i)
            spans.append((s, words[j][1]))
            i = j + 1
            continue
        i += 1
    return spans


def redact(text: str) -> Redaction:
    """Redacta datos personales; los tramos no se traslapan (gana el que empieza antes)."""
    found: list[Span] = []
    for kind, rx in _PATTERNS:
        for m in rx.finditer(text):
            if m.lastindex:
                s, e = m.start(1), m.end(1)
            else:
                s, e = m.start(), m.end()
            seg = text[s:e]
            mixed = re.search(r"\d", seg) and re.search(r"[A-Za-z]", seg)
            if kind == "PLACA" and not mixed and m.lastindex is None:
                continue
            if kind == "TELEFONO" and len(re.sub(r"\D", "", seg)) not in (10, 12):
                continue
            found.append(Span(kind, s, e, seg))
    for s, e in _name_spans(text):
        found.append(Span("NOMBRE", s, e, text[s:e]))
    found.sort(key=lambda sp: (sp.start, -(sp.end - sp.start)))
    chosen: list[Span] = []
    for sp in found:
        if chosen and sp.start < chosen[-1].end:
            continue
        chosen.append(sp)
    out: list[str] = []
    pos = 0
    for sp in chosen:
        out.append(text[pos : sp.start])
        out.append(f"[{sp.kind}]")
        pos = sp.end
    out.append(text[pos:])
    return Redaction("".join(out), tuple(chosen))
