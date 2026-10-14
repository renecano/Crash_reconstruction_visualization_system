"""Salidas doradas para la paridad del port TS (`packages/relato`) con la referencia Python.

`packages/relato/fixtures/golden.json` guarda, para cada texto del corpus (Relatos-MX completo más
casos difíciles escritos aquí), la redacción de PII y las coincidencias del glosario, y el plegado
de los bloques Unicode que importan. Las posiciones van en puntos de código (las de Python); el
port TS las convierte desde UTF-16. `croquis-extraction golden check` falla si el archivo no
coincide con lo que produce el código actual.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from croquis_extraction import relatos_mx
from croquis_extraction.glossary import find_terms, glossary_version
from croquis_extraction.pii import pii_version, redact
from croquis_extraction.text import fold

GOLDEN = relatos_mx.ROOT / "packages" / "relato" / "fixtures" / "golden.json"

# Bloques donde el plegado debe coincidir carácter por carácter: latín, puntuación general y los
# espacios Unicode (Python y el motor de JS comparten estos datos de Unicode desde hace años).
FOLD_RANGES = ((0x20, 0x7E), (0xA0, 0x24F), (0x1E00, 0x1EFF), (0x2000, 0x206F), (0x3000, 0x3000))

EDGE_CASES = (
    "Me llamo Brenda Ruiz y mi tel es 722 123 4567",
    "El señor Luis Hernández García iba en la calle Miguel Hidalgo",
    "placas MXA-123-B, correo ana.p@gmail.com",
    "Placas: 123-ABC; PLACA número XYZ1234 y las placas del carro eran nuevas",
    "juan perez me chocó y maria lopez lo vio",
    "Vivo en Morelos NÚMERO 245 int 3, mi número 722 000 0000",
    "Mi CURP es PERA800101HMCRZN09 y el RFC ÑEPA800101AB1",
    "el teléfono +52 55 1234 5678 o (722) 123-4567 o 722.123.4567",
    "Rosa iba conmigo. La luz estaba en rojo y doña Rosa López bajó.",
    "en la esquina de Benito Juárez con Miguel Hidalgo, colonia Guadalupe",
    "Iba\u00a0a\u202f60\u3000por Tollocan\ufeff con Ana\u2003María Pérez",
    "😀 Me llamo Ana Pérez 🚗 y mis placas son ABC-12-34 🙏",
    "Se me cerró un camión; el tráiler se pasó el alto. LLOVÍA y había TOPE",
    "el chofer Ramírez dijo que mi esposa Lupita iba de copiloto",
    "No. 12 de la calle 5 de Mayo # 34B depto 2",
    "MI NOMBRE ES JOSÉ LUIS y frené a fondo",
    "",
)


def case(text: str) -> dict[str, Any]:
    r = redact(text)
    return {
        "texto": text,
        "redaccion": r.text,
        "tramos": [[s.kind, s.start, s.end] for s in r.spans],
        "glosario": [[t.id, t.start, t.end] for t in find_terms(text)],
    }


def corpus() -> list[str]:
    texts: list[str] = list(EDGE_CASES)
    items = relatos_mx.load_all()
    for it in items:
        texts.append(relatos_mx.render(it["texto"]).text)
        texts.extend(c["texto"] for c in relatos_mx.counterfactuals(it))
    seen: set[str] = set()
    out: list[str] = []
    for t in texts:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def build_text() -> str:
    chars = "".join(chr(c) for a, b in FOLD_RANGES for c in range(a, b + 1))
    payload = {
        "version_pii": pii_version(),
        "version_glosario": glossary_version(),
        "plegado": {"entrada": chars, "salida": fold(chars)},
        "casos": [case(t) for t in corpus()],
    }
    return json.dumps(payload, ensure_ascii=False, indent=1) + "\n"


def write(check: bool = False, path: Path = GOLDEN) -> bool:
    """Escribe (o verifica) el archivo dorado. Devuelve True si estaba al día."""
    text = build_text()
    if check:
        return path.exists() and path.read_text(encoding="utf-8") == text
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    return True
