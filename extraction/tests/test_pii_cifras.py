"""Auditoría del 2026-11-15, C1: con `conservar_cifras` (flujo de CESVI) el redactor no borra como
placa una palabra común junto a una cifra, y sigue borrando las placas. Espejo de
`packages/extraction/src/pii-cifras.test.ts`: los mismos casos, tomados de ese archivo."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from croquis_extraction.pii import redact

_TS = Path(__file__).resolve().parents[2] / "packages/extraction/src/pii-cifras.test.ts"


def _casos() -> list[tuple[str, str, str]]:
    """Los casos del archivo TS: cada renglón entre comillas dobles es una cadena JSON."""
    fuente = _TS.read_text(encoding="utf-8")
    cuerpo = fuente[fuente.index("export const CASOS") : fuente.index("describe(")]
    cadenas = [json.loads(m.group(0)) for m in re.finditer(r'"(?:[^"\\]|\\.)*"', cuerpo)]
    assert len(cadenas) % 3 == 0
    return [(cadenas[i], cadenas[i + 1], cadenas[i + 2]) for i in range(0, len(cadenas), 3)]


CASOS = _casos()


def test_hay_casos() -> None:
    assert len(CASOS) >= 6


@pytest.mark.parametrize(("texto", "con_cifras", "por_omision"), CASOS)
def test_conserva_las_cifras_y_borra_las_placas(
    texto: str, con_cifras: str, por_omision: str
) -> None:
    assert redact(texto, conservar_cifras=True).text == con_cifras
    # Sin la opción, como cuando se congeló Relatos-MX.
    assert redact(texto).text == por_omision


@pytest.mark.parametrize("texto", [c[0] for c in CASOS])
def test_es_idempotente(texto: str) -> None:
    una = redact(texto, conservar_cifras=True).text
    assert redact(una, conservar_cifras=True).text == una
