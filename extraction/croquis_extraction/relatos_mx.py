"""Relatos-MX (PLAN §5.2): carga, construcción, verificación y congelamiento del benchmark.

Fuente: `data/relatos-mx/fuente/{dev,test}-*.toml`, un `[[relato]]` por caso con su texto y sus
hechos anotados (`[valor, "cita literal"]`). El texto admite dos marcas:

* `[[NOMBRE:Ana Pérez]]` (también PLACA, TELEFONO, CORREO, CURP, RFC, NUMERO): dato personal
  sintético. Se escribe tal cual en el relato y queda como verdad para medir la fuga de PII.
* `{{sexo:una señora|un señor}}` (grupos `sexo`, `edad`, `vehiculo`): ranura contrafactual. El
  relato canónico usa la primera opción; la variante de un grupo cambia todas sus ranuras a la
  segunda. La extracción de velocidades y maniobras no debe cambiar entre ambas.

Salida: `data/relatos-mx/build/{dev,test,contrafactuales}.jsonl` con el texto, la PII, los hechos y
la EscenaSpec de referencia (construida y validada). El test se congela con `freeze`: su hash queda
en `data/relatos-mx/test.lock` (sobre el contenido fuente, no sobre la spec construida) y no se
vuelve a tocar (PLAN §5.2).
"""

from __future__ import annotations

import hashlib
import json
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from croquis_extraction.facts import facts_from_annotation
from croquis_extraction.spec_builder import build_spec
from croquis_scene_schema import schema_errors
from croquis_scene_schema.check import check_escena, errores_de

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "relatos-mx"
SOURCE = DATA / "fuente"
BUILD = DATA / "build"
LOCK = DATA / "test.lock"
CATEGORIES = (
    "vv",
    "moto",
    "objeto",
    "volcadura",
    "peaton",
    "salida",
    "ciclista",
    "caida",
    "animal",
)
REGISTERS = ("coloquial", "formal", "faltas", "desordenado", "breve")
CF_GROUPS = ("sexo", "edad", "vehiculo")
PII_KINDS = ("NOMBRE", "PLACA", "TELEFONO", "CORREO", "CURP", "RFC", "NUMERO")
_PII = re.compile(r"\[\[(NOMBRE|PLACA|TELEFONO|CORREO|CURP|RFC|NUMERO):([^\]]+)\]\]")
_SLOT = re.compile(r"\{\{(sexo|edad|vehiculo):([^|}]*)\|([^}]*)\}\}")

JsonObj = dict[str, Any]


@dataclass(frozen=True)
class Rendered:
    text: str
    pii: tuple[JsonObj, ...]


def render(markup: str, variant: str | None = None) -> Rendered:
    """Texto final y PII verdadera; `variant` cambia las ranuras de ese grupo a la 2.ª opción."""

    def slot(m: re.Match[str]) -> str:
        return m.group(3) if m.group(1) == variant else m.group(2)

    text = _SLOT.sub(slot, markup.strip())
    pii: list[JsonObj] = []
    out: list[str] = []
    pos = 0
    for m in _PII.finditer(text):
        out.append(text[pos : m.start()])
        start = sum(len(s) for s in out)
        value = m.group(2)
        out.append(value)
        pii.append({"tipo": m.group(1), "texto": value, "inicio": start, "fin": start + len(value)})
        pos = m.end()
    out.append(text[pos:])
    return Rendered("".join(out), tuple(pii))


def load_source(path: Path) -> list[JsonObj]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    items: list[JsonObj] = data.get("relato", [])
    split = "test" if path.name.startswith("test") else "dev"
    for it in items:
        it["split"] = split
        it["archivo"] = path.name
    return items


def load_all() -> list[JsonObj]:
    items: list[JsonObj] = []
    for p in sorted(SOURCE.glob("*.toml")):
        items.extend(load_source(p))
    return items


def build_item(it: JsonObj) -> JsonObj:
    r = render(it["texto"])
    facts = facts_from_annotation({**it["hechos"], "tipo": it["tipo"]})
    spec = build_spec(facts, r.text, spec_id=it["id"], titulo=it.get("titulo"), origen="escrito")
    return {
        "id": it["id"],
        "split": it["split"],
        "tipo": it["tipo"],
        "registro": it["registro"],
        "texto": r.text,
        "pii": list(r.pii),
        "hechos": it["hechos"],
        "spec": spec,
        "contrafactual": sorted({g for g, _, _ in _SLOT.findall(it["texto"])}),
    }


def counterfactuals(it: JsonObj) -> list[JsonObj]:
    groups = sorted({g for g, _, _ in _SLOT.findall(it["texto"])})
    out: list[JsonObj] = []
    for g in groups:
        r = render(it["texto"], variant=g)
        out.append(
            {
                "id": f"{it['id']}-cf-{g}",
                "base": it["id"],
                "grupo": g,
                "split": it["split"],
                "texto": r.text,
                "pii": list(r.pii),
            }
        )
    return out


def problems(items: list[JsonObj]) -> list[str]:
    """Todo lo que impide usar el benchmark: ids repetidos, citas que no están, specs inválidas."""
    out: list[str] = []
    seen: set[str] = set()
    for it in items:
        rid = it.get("id", "?")
        if rid in seen:
            out.append(f"{rid}: id repetido")
        seen.add(rid)
        if it.get("tipo") not in CATEGORIES:
            out.append(f"{rid}: tipo desconocido {it.get('tipo')}")
        if it.get("registro") not in REGISTERS:
            out.append(f"{rid}: registro desconocido {it.get('registro')}")
        try:
            b = build_item(it)
        except (ValueError, KeyError) as e:
            out.append(f"{rid}: {e}")
            continue
        errs = schema_errors(b["spec"])
        if errs:
            out.append(f"{rid}: esquema: {errs[0]}")
        sem = errores_de(check_escena(b["spec"]))
        if sem:
            out.append(f"{rid}: semántica: {sem[0].codigo} {sem[0].mensaje}")
    return out


def _jsonl(rows: list[JsonObj]) -> str:
    return "".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows)


def build_texts(items: list[JsonObj]) -> dict[str, str]:
    built = [build_item(it) for it in items]
    cfs = [c for it in items for c in counterfactuals(it)]
    return {
        "dev.jsonl": _jsonl([b for b in built if b["split"] == "dev"]),
        "test.jsonl": _jsonl([b for b in built if b["split"] == "test"]),
        "contrafactuales.jsonl": _jsonl(cfs),
    }


def write(check: bool = False) -> list[str]:
    """Escribe (o verifica) build/. Devuelve los archivos desactualizados."""
    texts = build_texts(load_all())
    stale: list[str] = []
    BUILD.mkdir(parents=True, exist_ok=True)
    for name, text in texts.items():
        path = BUILD / name
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(name)
        else:
            path.write_text(text, encoding="utf-8", newline="\n")
    return stale


def source_canonical(items: list[JsonObj], split: str = "test") -> str:
    """Contenido fuente de una partición (id, tipo, registro, texto con marcas y hechos) en JSON
    canónico. Es lo que se congela: no depende del constructor de specs ni del formato del TOML."""
    rows = [
        {k: it[k] for k in ("id", "tipo", "registro", "texto", "hechos")}
        for it in sorted(items, key=lambda x: str(x["id"]))
        if it["split"] == split
    ]
    return json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def split_hash(items: list[JsonObj] | None = None, split: str = "test") -> str:
    """SHA-256 del contenido fuente de la partición (por omisión, el test del repositorio)."""
    text = source_canonical(load_all() if items is None else items, split)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def freeze() -> str:
    """Congela el test (una sola vez): escribe test.lock con el hash de su contenido fuente."""
    if LOCK.exists():
        msg = "El test ya está congelado; no se vuelve a congelar (PLAN §5.2)."
        raise RuntimeError(msg)
    items = load_all()
    h = split_hash(items)
    n = sum(1 for it in items if it["split"] == "test")
    LOCK.write_text(
        json.dumps(
            {
                "sha256": h,
                "relatos": n,
                "contenido": "id, tipo, registro, texto y hechos de fuente/test-*.toml "
                "(JSON canónico)",
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return h


def frozen_hash() -> str | None:
    if not LOCK.exists():
        return None
    return str(json.loads(LOCK.read_text(encoding="utf-8"))["sha256"])


def load_split(split: str) -> list[JsonObj]:
    path = BUILD / f"{split}.jsonl"
    return [
        json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()
    ]


def stats(items: list[JsonObj]) -> JsonObj:
    by_cat: dict[str, dict[str, int]] = {}
    for it in items:
        d = by_cat.setdefault(it["tipo"], {"dev": 0, "test": 0})
        d[it["split"]] += 1
    regs: dict[str, int] = {}
    for it in items:
        regs[it["registro"]] = regs.get(it["registro"], 0) + 1
    return {
        "total": len(items),
        "por_tipo": by_cat,
        "por_registro": regs,
        "con_pii": sum(1 for it in items if _PII.search(it["texto"])),
        "con_contrafactual": sum(1 for it in items if _SLOT.search(it["texto"])),
    }
