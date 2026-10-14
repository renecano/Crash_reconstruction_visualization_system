"""Nombres de pila más comunes en México para el redactor de PII (PLAN §5.1).

Fuente: "Nombres más comunes en México" de DataMX (Codeando México), licencia CC0, versión de
febrero de 2015: 250 nombres de hombre y 250 de mujer con su frecuencia en una muestra aleatoria
de 100 000 personas del Registro de Personal Federalizado de la SEP (2012). Los apellidos no tienen
un conjunto abierto equivalente: el redactor los detecta por contexto (palabras con mayúscula que
siguen a un nombre o a una pista como "el señor"), por la terminación -ez y con los diez apellidos
más frecuentes que publica el INEGI (citados por la prensa; ver `data/SOURCES.md`).
"""

from __future__ import annotations

import csv
import hashlib
import json
import unicodedata
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw" / "nombres"
OUT = ROOT / "packages" / "relato" / "data" / "nombres.json"
DATASET = "https://datamx.io/dataset/nombres-mas-comunes-en-mexico"
BASE = "https://datamx.io/dataset/729c80e3-15d0-47fc-9cd3-3850a204ea7b/resource"
FILES = {
    "nombreshombre3.csv": (
        f"{BASE}/f652b517-e943-41d8-8b54-0866eb6986a5/download/nombreshombre3.csv",
        "dd04a6e2f81096158c4b4a55a8ea8c6c2d9e47ece112b01a1eb77ad5c6772af0",
    ),
    "nombresmujer3.csv": (
        f"{BASE}/04a9f6ca-b653-4c6e-8e99-8321df906370/download/nombresmujer3.csv",
        "c1b6f5b1eb1ccd6cb183fedd03637abb32c1797f47202fdd560a88d368f2c9a3",
    ),
}
# INEGI, apellidos más frecuentes (citado por Expansión, 2022, y otras notas; ver SOURCES.md).
APELLIDOS_FRECUENTES = [
    "hernandez",
    "garcia",
    "martinez",
    "lopez",
    "gonzalez",
    "perez",
    "rodriguez",
    "sanchez",
    "ramirez",
    "cruz",
]
# Nombres que también son palabras comunes en un relato de tránsito: no se redactan solos (solo
# con mayúscula y junto a otro nombre o apellido), para no borrar el relato.
AMBIGUOS = [
    "luz",
    "rosa",
    "sol",
    "angel",
    "angeles",
    "paz",
    "cruz",
    "mar",
    "esperanza",
    "flor",
    "rocio",
    "pilar",
    "consuelo",
    "socorro",
    "dolores",
    "jesus",
    "guadalupe",
    "rey",
    "reyes",
    "santos",
    "leon",
]


def fold(text: str) -> str:
    """Minúsculas sin acentos (ñ → n), carácter por carácter."""
    out = []
    for ch in text:
        base = unicodedata.normalize("NFD", ch)[0]
        out.append(base.lower())
    return "".join(out)


def download() -> list[str]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        for name, (url, sha) in FILES.items():
            path = RAW_DIR / name
            if not path.exists():
                r = client.get(url)
                r.raise_for_status()
                path.write_bytes(r.content)
            if hashlib.sha256(path.read_bytes()).hexdigest() != sha:
                errors.append(f"SHA-256 distinto: {name}")
    return errors


def _read(name: str) -> list[tuple[str, int]]:
    with (RAW_DIR / name).open(encoding="utf-8", newline="") as f:
        return [(fold(r["NOMBRE"].strip()), int(r["OCURRE"])) for r in csv.DictReader(f)]


def build_doc() -> dict[str, Any]:
    hombres = _read("nombreshombre3.csv")
    mujeres = _read("nombresmujer3.csv")
    names = sorted({n for n, _ in hombres + mujeres if n})
    return {
        "_generado_por": "uv run croquis-data nombres build (data/croquis_data/nombres.py)",
        "fuente": {
            "conjunto": DATASET,
            "licencia": "CC0 (Creative Commons Zero)",
            "descripcion": "250 nombres de hombre y 250 de mujer más comunes en una muestra de "
            "100 000 personas del Registro de Personal Federalizado de la SEP (2012), DataMX 2015",
            "sha256": {k: v[1] for k, v in FILES.items()},
        },
        "nombres": names,
        "ambiguos": sorted(AMBIGUOS),
        "apellidos_frecuentes": APELLIDOS_FRECUENTES,
    }


def build(check: bool = False) -> bool:
    doc = build_doc()
    text = json.dumps(doc, ensure_ascii=False, indent=1) + "\n"
    if check:
        return OUT.exists() and OUT.read_text(encoding="utf-8") == text
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    return True
