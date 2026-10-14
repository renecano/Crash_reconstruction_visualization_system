"""Redacción de datos personales en el dispositivo (PLAN §5.1, paso 1; §10).

El texto que sale del dispositivo no lleva nombres, placas, teléfonos, correos, CURP, RFC ni
números de domicilio. Corre en el navegador (port TS en `packages/relato`, con paridad probada) y
aquí como referencia. Reemplaza cada dato por un marcador (`[NOMBRE]`, `[PLACA]`, …) y devuelve
los tramos para que la interfaz pueda mostrar el original solo en el dispositivo.

Patrones y pistas viven en `packages/relato/data/pii.json`, compartido con el port TS; se compilan
con `re.ASCII` para que `\\d`, `\\s`, `\\w` y `\\b` signifiquen lo mismo que en JS.

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
from typing import Any

from croquis_extraction.text import fold, load_json, normalize_spaces

MARKERS = ("NOMBRE", "PLACA", "TELEFONO", "CORREO", "CURP", "RFC", "NUMERO")

_WORD = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+")
_UPPER = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜÑ")


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


@dataclass(frozen=True)
class _Rules:
    patterns: tuple[tuple[dict[str, Any], re.Pattern[str]], ...]
    cues: re.Pattern[str]
    strong_cues: frozenset[str]
    cuts: frozenset[str]
    place_cues: frozenset[str]
    particles: frozenset[str]
    place_links: frozenset[str]
    place_preps: frozenset[str]
    place_prefixes: frozenset[str]


@cache
def _rules() -> _Rules:
    d = load_json("pii.json")
    pats = tuple((p, re.compile(p["regex"], re.ASCII)) for p in d["patrones"])
    cues = "|".join(re.escape(c) for c in sorted(d["pistas_nombre"], key=len, reverse=True))
    particles = frozenset(d["particulas"])
    return _Rules(
        patterns=pats,
        cues=re.compile(rf"(?<![a-z])({cues})[\s,]+", re.ASCII),
        strong_cues=frozenset(d["pistas_fuertes"]),
        cuts=frozenset(d["cortes_nombre"]),
        place_cues=frozenset(d["pistas_lugar"]),
        particles=particles,
        place_links=particles | frozenset(d["enlaces_lugar"]),
        place_preps=frozenset(d["preposiciones_lugar"]),
        place_prefixes=frozenset(d["prefijos_lugar"]),
    )


def pii_version() -> str:
    return str(load_json("pii.json")["version"])


@cache
def _names() -> tuple[frozenset[str], frozenset[str], frozenset[str]]:
    d = load_json("nombres.json")
    return frozenset(d["nombres"]), frozenset(d["ambiguos"]), frozenset(d["apellidos_frecuentes"])


def _is_cap(w: str) -> bool:
    return w[:1] in _UPPER


def _name_spans(text: str, folded: str) -> list[tuple[int, int]]:
    names, ambiguous, surnames = _names()
    rules = _rules()
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
            if _is_cap(w) and fold(w) not in rules.particles:
                j = k
                k += 1
            elif fold(w) in rules.particles and k + 1 < len(words) and _is_cap(words[k + 1][2]):
                k += 1
            else:
                break
        return j

    starts = {s: k for k, (s, _, _) in enumerate(words)}
    cue_starts: set[int] = set()
    for m in rules.cues.finditer(folded):
        if text[m.end() : m.end() + 1] in _UPPER:
            cue_starts.add(m.end())
            continue
        k = starts.get(m.end())
        if k is None:
            continue
        if m.group(1) in rules.strong_cues:
            # "se llama kevin armendariz": hasta tres palabras en minúsculas que no cortan.
            j = k
            while (
                j < len(words)
                and j - k < 3
                and fold(words[j][2]) not in rules.cuts
                and (j == k or text[words[j - 1][1] : words[j][0]].strip() == "")
            ):
                j += 1
            if j > k:
                spans.append((words[k][0], words[j - 1][1]))
        elif fold(words[k][2]) in names and fold(words[k][2]) not in ambiguous:
            # "mi primo jorge": un nombre del diccionario en minúsculas tras una pista.
            spans.append((words[k][0], words[k][1]))

    def after_place_cue(i: int) -> bool:
        """¿La palabra i (o la secuencia que la contiene) sigue a una pista de lugar?"""
        k = i - 1
        while k >= 0 and fold(words[k][2]) in rules.place_links:
            k -= 1
        while k >= 0 and _is_cap(words[k][2]) and fold(words[k][2]) not in rules.place_cues:
            k -= 1
            while k >= 0 and fold(words[k][2]) in rules.place_links:
                k -= 1
        return k >= 0 and fold(words[k][2]) in rules.place_cues

    def place_context(i: int) -> bool:
        """ "por Cuauhtémoc", "en León", "San Luis": la palabra nombra un lugar."""
        if fold(words[i][2]) in rules.place_prefixes:
            return True
        if i == 0:
            return False
        prev = fold(words[i - 1][2])
        return prev in rules.place_preps or (
            prev in rules.place_prefixes and _is_cap(words[i - 1][2])
        )

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
        elif after_place_cue(i) or place_context(i):
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


def redact(raw: str) -> Redaction:
    """Redacta datos personales; los tramos no se traslapan (gana el que empieza antes)."""
    text = normalize_spaces(raw)
    folded = fold(text)
    found: list[Span] = []
    for p, rx in _rules().patterns:
        view = folded if p["vista"] == "plegado" else text
        for m in rx.finditer(view):
            s, e = (m.start(1), m.end(1)) if m.lastindex else (m.start(), m.end())
            seg = raw[s:e]
            if p.get("mixto") and not (re.search(r"[0-9]", seg) and re.search(r"[A-Za-z]", seg)):
                continue
            if "digitos" in p and len(re.sub(r"[^0-9]", "", seg)) not in p["digitos"]:
                continue
            found.append(Span(str(p["tipo"]), s, e, seg))
    name_spans = _name_spans(text, folded)
    # Correferencia: un nombre ya detectado se redacta también donde aparece sin pista.
    for key in sorted({folded[s:e] for s, e in name_spans}, key=len, reverse=True):
        for m in re.finditer(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", folded):
            if (m.start(), m.end()) not in name_spans:
                name_spans.append((m.start(), m.end()))
    for s, e in name_spans:
        found.append(Span("NOMBRE", s, e, raw[s:e]))
    found.sort(key=lambda sp: (sp.start, -(sp.end - sp.start)))
    chosen: list[Span] = []
    for sp in found:
        if chosen and sp.start < chosen[-1].end:
            continue
        chosen.append(sp)
    out: list[str] = []
    pos = 0
    for sp in chosen:
        out.append(raw[pos : sp.start])
        out.append(f"[{sp.kind}]")
        pos = sp.end
    out.append(raw[pos:])
    return Redaction("".join(out), tuple(chosen))
