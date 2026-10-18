"""Inventario de E5 (F10, PLAN §8): cuántos casos tienen el perfil de aplastamiento medido completo,
la posición del daño y, en NHTSA, una foto útil, por fuente y tipo de impacto. Es el tamaño de
muestra de E5 antes de medir nada.

Uso: ``uv run croquis-eval e5-inventario`` → ``eval/results/e5_inventario.json``. La lista de
multimedia de NHTSA se descarga antes con ``uv run croquis-data nhtsa media``.
"""

from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, cast

from croquis_data.nhtsa_ctd import damaged_side_photo
from croquis_eval.e5_casos import (
    CISS_DEV_YEARS,
    ITV_CSV,
    MEDIA_DIR,
    ROOT,
    TIPOS,
    VTB_CSV,
    Caso,
    ciss_cases,
    nhtsa_cases,
    nhtsa_test_no,
)
from croquis_eval.results import write_result

_NUMBERED = re.compile(r"^v\d+P\d+\.(jpe?g|png|tif)$", re.IGNORECASE)


def photo_status(caso: Caso, media_dir: Path = MEDIA_DIR) -> str:
    """Estado de las fotos de la prueba:

    - «foto_por_nombre»: una foto posterior de la cara dañada, reconocida por el nombre del archivo;
    - «fotos_numeradas»: fotos sin descripción (``v12345P004.jpg``); la vista de cada número está en
      la lista de fotografías del reporte PDF de la prueba, que se lee solo para la galería;
    - «sin_vista_de_la_cara»: fotos con nombre, pero ninguna posterior de esa cara;
    - «sin_fotos» y «sin_lista» (no se descargó la lista de multimedia).
    """
    n = nhtsa_test_no(caso.id)
    path = media_dir / f"media_{n}.json"
    if n is None or not path.exists():
        return "sin_lista"
    doc = cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
    photos = cast(list[dict[str, Any]], doc.get("photos") or [])
    if not photos:
        return "sin_fotos"
    if damaged_side_photo(photos, caso.lado):
        return "foto_por_nombre"
    if all(_NUMBERED.match(str(p.get("fileName", ""))) for p in photos):
        return "fotos_numeradas"
    return "sin_vista_de_la_cara"


CISS_2024_ZIP = ROOT / "data" / "raw" / "ciss" / "CISS_2024_CSV_files.zip"
_LOC_FB = re.compile(
    r"Begins (\d+)\s*cm (left|right) of (?:the )?center point, extending (left|right)", re.I
)
_LOC_LR = re.compile(
    r"Begins (\d+)\s*cm (forward|rear) of (front|rear) axle, extending (forward|rearward)", re.I
)


def _num(v: str | None) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def ciss_d_convention(zip_path: Path = CISS_2024_ZIP) -> dict[str, Any]:
    """Comprueba la convención de FIELDLD (D) contra la descripción textual FIELDLLOCATION de CISS
    2024: centro del daño reconstruido desde «empieza a X cm de … y se extiende hacia …» y L.

    Frente y parte trasera: desde el centro de la cara, + a la derecha. Costados: desde la mitad de
    la batalla (VEHSPEC.WHEELBASE), + hacia adelante."""
    if not zip_path.exists():
        return {"disponible": False}
    with zipfile.ZipFile(zip_path) as z:

        def table(name: str) -> list[dict[str, str]]:
            with z.open(name) as f:
                return list(csv.DictReader(io.TextIOWrapper(f, encoding="latin-1")))

        wheelbase = {
            (r["CASEID"], r["VEHNO"]): _num(r.get("WHEELBASE")) for r in table("VEHSPEC.csv")
        }
        fb = Counter[str]()
        lr = Counter[str]()
        for r in table("CDC.csv"):
            length, d = _num(r.get("FIELDL")), _num(r.get("FIELDLD"))
            if length is None or d is None or length in (777, 999) or d in (777, 999):
                continue
            text = r.get("FIELDLLOCATION") or ""
            if m := _LOC_FB.search(text):
                start = float(m.group(1)) * (-1 if m.group(2).lower() == "left" else 1)
                center = start + (length / 2 if m.group(3).lower() == "right" else -length / 2)
                fb["coincide" if abs(center - d) <= 2 else "no_coincide"] += 1
            elif m := _LOC_LR.search(text):
                wb = wheelbase.get((r["CASEID"], r["VEHNO"]))
                if wb is None or not 150 <= wb <= 700:
                    continue
                axle = wb / 2 if m.group(3).lower() == "front" else -wb / 2
                start = axle + float(m.group(1)) * (1 if m.group(2).lower() == "forward" else -1)
                center = start + (length / 2 if m.group(4).lower() == "forward" else -length / 2)
                lr[
                    "a_3_cm"
                    if abs(center - d) <= 3
                    else ("a_10_cm" if abs(center - d) <= 10 else "mas_de_10_cm")
                ] += 1
    return {
        "disponible": True,
        "frente_y_trasera": {"total": sum(fb.values()), **fb},
        "costados": {"total": sum(lr.values()), **lr},
    }


# Zona horizontal del CDC (4.º carácter) que dice de qué lado del centro está el daño.
_FB_ZONE_SIGN = {"L": -1, "R": 1}  # frente y parte trasera: izquierda o derecha
_LR_ZONE_SIGN = {"F": 1, "B": -1}  # costados: adelante o atrás


def nhtsa_d_convention() -> dict[str, Any]:
    """Comprueba el signo de ``damage_offset_mm`` (D) de NHTSA contra la zona horizontal del CDC.

    Hipótesis (ADR 0032): en el frente y la parte trasera D se mide desde el eje central, + a la
    derecha; en los costados, desde el CG, + hacia adelante. Si la hipótesis es buena, el daño en la
    zona izquierda (L) del frente da D < 0 y el de la zona delantera (F) de un costado, D > 0.
    Solo cuentan los casos con |D| > 20 mm (los de daño centrado no dicen nada del signo)."""
    out: dict[str, Counter[str]] = {"frente_y_trasera": Counter(), "costados": Counter()}
    for path in (VTB_CSV, ITV_CSV):
        with path.open(encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                di = (r.get("damage_index") or "").upper()
                d = _num(r.get("damage_offset_mm"))
                if len(di) < 4 or d is None or abs(d) <= 20:
                    continue
                cara, zona = di[2], di[3]
                if cara in ("F", "B") and zona in _FB_ZONE_SIGN:
                    key, expected = "frente_y_trasera", _FB_ZONE_SIGN[zona]
                elif cara in ("L", "R") and zona in _LR_ZONE_SIGN:
                    key, expected = "costados", _LR_ZONE_SIGN[zona]
                else:
                    continue
                out[key]["coincide" if (d > 0) == (expected > 0) else "no_coincide"] += 1
    return {k: {"total": sum(v.values()), **v} for k, v in out.items()}


def _by_type(counter: Counter[str]) -> dict[str, int]:
    return {t: counter.get(t, 0) for t in TIPOS}


def inventory(media_dir: Path = MEDIA_DIR) -> dict[str, Any]:
    nhtsa = list(nhtsa_cases())
    ciss = list(ciss_cases())
    fotos: dict[str, Counter[str]] = {}
    for c in nhtsa:
        fotos.setdefault(photo_status(c, media_dir), Counter())[c.tipo] += 1
    return {
        "nhtsa": {
            "casos": len(nhtsa),
            "por_tipo": _by_type(Counter(c.tipo for c in nhtsa)),
            "con_centro_del_dano": _by_type(
                Counter(c.tipo for c in nhtsa if c.centro_dano_m is not None)
            ),
            "con_velocidad": _by_type(Counter(c.tipo for c in nhtsa if c.velocidad_kmh)),
            "convencion_de_d": nhtsa_d_convention(),
            "fotos": {k: _by_type(v) for k, v in sorted(fotos.items())},
        },
        "ciss": {
            "casos": len(ciss),
            "por_tipo": _by_type(Counter(c.tipo for c in ciss)),
            "con_centro_del_dano": _by_type(
                Counter(c.tipo for c in ciss if c.centro_dano_m is not None)
            ),
            "desarrollo_2017_2021": _by_type(
                Counter(c.tipo for c in ciss if c.anio in CISS_DEV_YEARS)
            ),
            "test_2022_2024": _by_type(
                Counter(c.tipo for c in ciss if c.anio not in CISS_DEV_YEARS)
            ),
            "contra_vehiculo": sum(1 for c in ciss if c.detalle.startswith("vehiculo")),
            "contra_objeto_rigido": sum(1 for c in ciss if c.detalle.startswith("objeto")),
            "convencion_de_d_2024": ciss_d_convention(),
        },
        "notas": [
            "Un caso es un vehículo con C1–C6 (CISS) o DPD1–DPD6 (NHTSA), el largo del daño L, "
            "clase y masa; los tipos siguen las reglas de eval/croquis_eval/e5_casos.py.",
            "Fotos: la mayoría de los laboratorios sube las fotos numeradas (v12345P004.jpg), sin "
            "la vista en el nombre; la vista de cada número está en la lista de fotografías del "
            "reporte PDF, que se lee solo para la muestra de la galería (no se descargan todos).",
        ],
    }


def main() -> Path:
    return write_result("e5_inventario", inventory(), seed=None)
