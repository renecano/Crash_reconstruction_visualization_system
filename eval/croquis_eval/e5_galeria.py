"""Galería de E5 (PLAN E5 c, ADR 0032): fotos reales de pruebas de NHTSA junto a Croquis.

Muestra con semilla del **test** de NHTSA, estratificada por tipo de impacto, entre las pruebas que
Croquis reproduce y que tienen fotos. Para cada una se busca la foto posterior a la prueba de la
cara dañada:

- por el nombre del archivo, cuando el laboratorio la nombró («Post-Test Front View…»);
- en la lista de fotografías del reporte PDF, cuando las fotos vienen numeradas
  (``v10174P009.JPG`` ↔ «Photo No. 009 Post-Test Front View of Test Vehicle»).

Se descarga la foto original a ``data/raw/nhtsa/fotos/`` (sin versionar) y se guarda un derivado
reducido, sin metadatos, en ``docs/galeria-e5/fotos/``. El manifiesto con la fuente de cada foto va
a ``eval/results/e5_galeria.json``; los renders de Croquis los hace ``eval/js/e5_galeria.ts``.

La galería es cualitativa: no lleva números que no salgan del script de E5.

Uso: ``uv run croquis-eval e5-galeria``.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, cast

import httpx

from croquis_eval.e5_casos import ROOT, Caso, nhtsa_cases, nhtsa_test_no
from croquis_eval.e5_orientacion import MEDIA_DIR, _report  # pyright: ignore[reportPrivateUsage]
from croquis_eval.e5_particion import is_test
from croquis_eval.results import write_result

SEED = 20261017
PER_TYPE = 3
# Reportes que se leen como máximo por tipo para encontrar fotos numeradas (pesan varios MB).
MAX_REPORTS_PER_TYPE = 20
TIPOS = ("frontal", "frontal_desplazado", "lateral", "alcance", "poste")
PHOTOS_DIR = ROOT / "data" / "raw" / "nhtsa" / "fotos"
GALLERY_DIR = ROOT / "docs" / "galeria-e5"
DERIVED_WIDTH = 960
# Revisión visual (versionada): fotos cuya vista no es la que dice el reporte.
REVIEW_PATH = ROOT / "eval" / "e5" / "galeria_revision.json"
# Obstáculos que el reproductor de E5 reconstruye (ADR 0032); las demás pruebas se excluyen.
REPRODUCIBLE = {
    "barrera_rigida",
    "barrera_desplazada",
    "poste",
    "barrera_movil_deformable",
    "barrera_movil_rigida",
}

_CAPTION = re.compile(
    r"^\s*(?:Photo(?:graph)?\s*(?:No\.?|Number)?\s*)?(?:[A-Z]-)?(\d{1,3})\s*[-–:.]?\s*"
    r"(Post[- ]?Test\b.*)$",
    re.IGNORECASE | re.MULTILINE,
)
# Una vista del vehículo, no de un detalle, del maniquí o de la barrera.
_NOT_EXTERIOR = re.compile(
    r"dumm|impactor|underbody|under ?carriage|close|latch|barrier|mdb|pole|seat|interior|door|"
    r"engine|steering|airbag|windshield|occupant|fuel|hood|trunk|pedal|knee|head|torso|pelvis|"
    r"crs|child|restraint|target|overhead",
    re.IGNORECASE,
)


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z]+", text.lower()))


def view_rank(caption: str, side: str) -> int | None:
    """Qué tan bien muestra la vista la cara dañada: 0 de frente a la cara, 1 a tres cuartos; None
    si no la muestra o no es una vista exterior del vehículo."""
    if _NOT_EXTERIOR.search(caption) or "post" not in caption.lower():
        return None
    w = _words(caption)
    front = "front" in w or "frontal" in w
    rear = "rear" in w or "back" in w
    left, right = "left" in w or "driver" in w, "right" in w or "passenger" in w
    if side == "F":
        return 0 if front and not (left or right or rear) else (1 if front and not rear else None)
    if side == "B":
        return 0 if rear and not (left or right or front) else (1 if rear and not front else None)
    if side in {"L", "R"}:
        mine, other = (left, right) if side == "L" else (right, left)
        if not mine or other:
            return None
        return 0 if not (front or rear) else 1
    return None


def photo_list(text: str) -> list[tuple[int, str]]:
    """(número de foto, leyenda) de la lista de fotografías posteriores de un reporte."""
    seen: dict[int, str] = {}
    for m in _CAPTION.finditer(text):
        n = int(m.group(1))
        caption = re.sub(r"\s+[A-Z]\s*-\s*\d+\s*$", "", " ".join(m.group(2).split()))
        seen.setdefault(n, caption)
    return sorted(seen.items())


def from_report(text: str, side: str) -> tuple[int, str] | None:
    """La foto numerada que mejor muestra la cara dañada, según la lista del reporte."""
    ranked = [(r, n, cap) for n, cap in photo_list(text) if (r := view_rank(cap, side)) is not None]
    if not ranked:
        return None
    _, n, cap = min(ranked)
    return n, cap


def _numbered(photos: list[dict[str, Any]], test_no: int, n: int) -> dict[str, Any] | None:
    """El archivo de la foto número n: ``v10174P009.JPG`` o, en pruebas viejas, ``v04887P007.jpg``
    (el número de la prueba con ceros a la izquierda)."""
    name = re.compile(rf"^v0*{test_no}p0*{n}\.", re.IGNORECASE)
    for p in photos:
        if name.match(str(p.get("fileName", ""))):
            return p
    return None


def _valid(c: Caso) -> bool:
    return (
        c.obstaculo in REPRODUCIBLE
        and c.masa_kg > 0
        and 0 < c.ancho_dano_m <= 20
        and all(0 <= x <= 2 for x in c.perfil_m)
    )


def _order(c: Caso) -> str:
    return hashlib.sha256(f"{SEED}|{c.id}".encode()).hexdigest()


def _text(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


def _derive(original: Path, out: Path) -> None:
    """Derivado reducido y sin metadatos (EXIF) de la foto original."""
    from PIL import Image, ImageOps

    with Image.open(original) as im:
        img = ImageOps.exif_transpose(im).convert("RGB")
        if img.width > DERIVED_WIDTH:
            img = img.resize((DERIVED_WIDTH, round(img.height * DERIVED_WIDTH / img.width)))
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out, "JPEG", quality=82, optimize=True, progressive=True)


def _media(test_no: int) -> dict[str, Any] | None:
    path = MEDIA_DIR / f"media_{test_no}.json"
    if not path.exists():
        return None
    return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))


def rejected(path: Path = REVIEW_PATH) -> dict[str, str]:
    """Fotos rechazadas en la revisión visual, con el motivo."""
    if not path.exists():
        return {}
    doc = cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
    return cast(dict[str, str], doc.get("rechazadas") or {})


def find_photo(client: httpx.Client, c: Caso, counts: Counter[str]) -> dict[str, Any] | None:
    """Foto posterior de la cara dañada de la prueba: por nombre o por el reporte."""
    from croquis_data.nhtsa_ctd import damaged_side_photo

    n = nhtsa_test_no(c.id)
    media = _media(n) if n is not None else None
    photos = cast(list[dict[str, Any]], (media or {}).get("photos") or [])
    if n is None or not photos:
        return None
    named = damaged_side_photo(photos, c.lado)
    if named:
        return {"foto": named, "vista": str(named.get("fileName")), "por": "nombre"}
    if counts["reportes_leidos"] >= MAX_REPORTS_PER_TYPE:
        return None
    path = _report(client, n)
    if path is None:
        counts["sin_reporte"] += 1
        return None
    counts["reportes_leidos"] += 1
    try:
        text = _text(path)
    except Exception:  # PDF dañado o truncado: se cuenta y se borra para reintentarlo otra vez
        counts["reporte_ilegible"] += 1
        path.unlink(missing_ok=True)
        return None
    hit = from_report(text, c.lado)
    if hit is None:
        counts["sin_vista_de_la_cara"] += 1
        return None
    photo = _numbered(photos, n, hit[0])
    if photo is None:
        counts["foto_numerada_no_publicada"] += 1
        return None
    return {"foto": photo, "vista": hit[1], "por": "reporte"}


def _reviewed(found: dict[str, Any] | None, counts: Counter[str]) -> dict[str, Any] | None:
    if found is not None and str(found["foto"].get("fileName")) in rejected():
        counts["rechazada_en_revision_visual"] += 1
        return None
    return found


def build(per_type: int = PER_TYPE) -> dict[str, Any]:
    cases = [c for c in nhtsa_cases() if is_test(c) and _valid(c)]
    entries: list[dict[str, Any]] = []
    by_type: dict[str, Any] = {}
    with httpx.Client(headers={"User-Agent": "croquis-eval/0.1"}) as client:
        for tipo in TIPOS:
            pool = sorted((c for c in cases if c.tipo == tipo), key=_order)
            counts: Counter[str] = Counter()
            vehicles: set[str] = set()
            chosen = 0
            for c in pool:
                if chosen >= per_type:
                    break
                if c.vehiculo in vehicles:
                    continue
                counts["probadas"] += 1
                found = _reviewed(find_photo(client, c, counts), counts)
                if found is None:
                    if counts["reportes_leidos"] >= MAX_REPORTS_PER_TYPE:
                        break
                    continue
                n = nhtsa_test_no(c.id)
                photo = found["foto"]
                original = PHOTOS_DIR / str(photo["fileName"])
                if not original.exists():
                    r = client.get(str(photo["media"]), timeout=180, follow_redirects=True)
                    r.raise_for_status()
                    original.parent.mkdir(parents=True, exist_ok=True)
                    original.write_bytes(r.content)
                derived = GALLERY_DIR / "fotos" / f"v{n}.jpg"
                _derive(original, derived)
                vehicles.add(c.vehiculo)
                chosen += 1
                entries.append(
                    {
                        "id": c.id,
                        "prueba": n,
                        "tipo": tipo,
                        "lado": c.lado,
                        "clase": c.clase,
                        "anio": c.anio,
                        "detalle": c.detalle,
                        "vista": found["vista"],
                        "foto_hallada_por": found["por"],
                        "foto_url": photo["media"],
                        "foto_archivo": str(photo["fileName"]),
                        "foto_derivada": derived.relative_to(ROOT).as_posix(),
                        "render": f"docs/galeria-e5/croquis/v{n}.jpg",
                    }
                )
            by_type[tipo] = {"candidatas": len(pool), "elegidas": chosen, **counts}
    return {
        "descripcion": "Galería de E5 (PLAN E5 c, ADR 0032): muestra con semilla del test de "
        "NHTSA, estratificada por tipo, con la foto posterior de la cara dañada y su fuente.",
        "semilla": SEED,
        "por_tipo_objetivo": per_type,
        "max_reportes_por_tipo": MAX_REPORTS_PER_TYPE,
        "revision_visual": "eval/e5/galeria_revision.json",
        "por_tipo": by_type,
        "fotos": entries,
        "licencia": "NHTSA Vehicle Crash Test Database: datos públicos del gobierno de EE. UU.; "
        "se cita la prueba y la URL de cada foto (data/SOURCES.md).",
    }


def main() -> Path:
    return write_result("e5_galeria", build(), seed=SEED)
