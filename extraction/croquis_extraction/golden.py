"""Salidas doradas para la paridad del port TS (`packages/extraction`) con la referencia Python.

`packages/extraction/fixtures/golden.json` guarda, para cada texto del corpus (Relatos-MX
completo más casos difíciles escritos aquí), la redacción de PII y las coincidencias del
glosario, y el plegado de los bloques Unicode que importan. Las posiciones van en puntos de código
(las de Python); el port TS las convierte desde UTF-16.

`packages/extraction/fixtures/pipeline.golden.json` guarda, para cada relato de Relatos-MX (dev y
test, contrafactuales y repeticiones) y cada método (reglas y las respuestas grabadas de Claude
Haiku y Sonnet), lo que produce el pipeline de referencia sobre el texto redactado: la EscenaSpec
(sin `meta.relato`, que es el mismo texto), las cuentas de la conversión y las del verificador. Es
la prueba de que el pipeline TS da los mismos resultados que el de Python, y por eso de que E1
sigue vigente.

`croquis-extraction golden check` falla si algún archivo no coincide con lo que produce el código
actual.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from croquis_extraction import baseline, relatos_mx
from croquis_extraction.claude_client import (
    LLMError,
    facts_from_output,
    load_recording,
    prompt_fingerprint,
)
from croquis_extraction.glossary import find_terms, glossary_version
from croquis_extraction.pii import pii_version, redact
from croquis_extraction.spec_builder import build_spec
from croquis_extraction.text import fold
from croquis_extraction.verify import verify_spec

GOLDEN = relatos_mx.ROOT / "packages" / "extraction" / "fixtures" / "golden.json"
PIPELINE = relatos_mx.ROOT / "packages" / "extraction" / "fixtures" / "pipeline.golden.json"
MODELS = ("claude-haiku-5-5", "claude-sonnet-5-5")

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
    "el chavo se llama kevin armendariz; kevin dijo que no vio. Iba por Lázaro Cárdenas en León",
    "El asegurado, Eleuterio Vargas Ocampo, dejó el 686 214 77 09; en San Luis llovía",
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


def _without_story(spec: dict[str, Any]) -> dict[str, Any]:
    meta = {k: v for k, v in spec["meta"].items() if k != "relato"}
    return {**spec, "meta": meta}


def pipeline_case(method: str, key: str, raw: str) -> dict[str, Any] | None:
    """Lo que produce el pipeline de referencia para un relato (None si no hay grabación)."""
    text = redact(raw).text
    out: dict[str, Any] = {"metodo": method, "clave": key}
    if method == "reglas":
        spec = baseline.extract_spec(text, key)
    else:
        try:
            rec = load_recording(method, key, text)
        except LLMError:
            return None
        facts, conv = facts_from_output(rec["salida"], text)
        spec = build_spec(facts, text, spec_id=key, origen="escrito", sintetico=False)
        out["conversion"] = {
            "citas": conv.citas,
            "sin_cita_literal": conv.sin_cita_literal,
            "valores_invalidos": conv.valores_invalidos,
            "preguntas": conv.preguntas,
        }
    verified, vs = verify_spec(spec, text)
    out["spec"] = _without_story(spec)
    out["verificador"] = {
        "revisados": vs.revisados,
        "corregidos": vs.corregidos,
        "degradados": vs.degradados,
    }
    if verified != spec:
        out["spec_verificada"] = _without_story(verified)
    return out


def pipeline_inputs() -> list[tuple[str, str]]:
    """(clave, texto sin redactar) de cada relato, contrafactual y repetición de Relatos-MX."""
    out: list[tuple[str, str]] = []
    for split in ("dev", "test"):
        items = relatos_mx.load_split(split)
        out.extend((it["id"], it["texto"]) for it in items)
        out.extend((it["id"] + "-rep", it["texto"]) for it in items)
    out.extend((c["id"], c["texto"]) for c in relatos_mx.load_split("contrafactuales"))
    return out


def build_pipeline_text() -> str:
    cases: list[dict[str, Any]] = []
    for key, raw in pipeline_inputs():
        for method in ("reglas", *MODELS):
            if method == "reglas" and key.endswith("-rep"):
                continue  # las reglas son deterministas: la repetición es el mismo caso
            c = pipeline_case(method, key, raw)
            if c is not None:
                cases.append(c)
    payload = {
        "version_glosario": glossary_version(),
        "huella_prompt": prompt_fingerprint(),
        "casos": cases,
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"


def _write_one(path: Path, text: str, check: bool) -> bool:
    if check:
        return path.exists() and path.read_text(encoding="utf-8") == text
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    return True


def write(check: bool = False, path: Path = GOLDEN, pipeline: Path = PIPELINE) -> bool:
    """Escribe (o verifica) los archivos dorados. Devuelve True si estaban al día."""
    ok = _write_one(path, build_text(), check)
    return _write_one(pipeline, build_pipeline_text(), check) and ok
