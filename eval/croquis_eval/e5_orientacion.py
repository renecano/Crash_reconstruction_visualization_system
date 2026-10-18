"""Orden de los puntos de aplastamiento en NHTSA (E5, F10, ADR 0032): ¿dónde está DPD1?

Croquis pone C1 en el extremo izquierdo del frente y la parte trasera, y en el delantero de los
costados. NHTSA no documenta el orden de DPD1–DPD6 en su API, pero sus reportes lo dicen en una
frase como «the maximum static crush was 459 mm at DPD 3 on the left side of the vehicle's
centerline». Si el máximo de la prueba cae en DPD1–DPD3 y el reporte dice «left», DPD1 está a la
izquierda (y viceversa).

Se leen los reportes de una muestra con semilla de pruebas **de desarrollo** (nunca del test), se
busca esa frase y se cuenta cuántas coinciden con DPD1 a la izquierda. Los reportes se guardan en
``data/raw/nhtsa/reportes/`` (sin versionar). Uso: ``uv run croquis-eval e5-orientacion``.
"""

from __future__ import annotations

import json
import random
import re
from collections import Counter
from pathlib import Path
from typing import Any, cast

import httpx

from croquis_eval.e5_casos import ROOT, Caso, nhtsa_cases, nhtsa_test_no
from croquis_eval.e5_particion import is_test
from croquis_eval.results import write_result

SEED = 20261017
REPORTS_DIR = ROOT / "data" / "raw" / "nhtsa" / "reportes"
MEDIA_DIR = ROOT / "data" / "raw" / "nhtsa" / "media"
PER_TYPE = 12

_STATEMENT = re.compile(
    r"crush[^.]{0,80}?\bDPD\s*-?\s*(\d)\b[^.]{0,80}?\b(left|right)\b", re.IGNORECASE
)


def statement_side(text: str) -> tuple[int, str] | None:
    """(número de DPD, lado) de la frase del aplastamiento máximo, o None."""
    m = _STATEMENT.search(text.replace("\n", " "))
    return (int(m.group(1)), m.group(2).lower()) if m else None


def verdict(dpd: int, side: str, profile: tuple[float, ...]) -> str:
    """«izquierda» si la frase confirma DPD1 a la izquierda, «derecha» si lo contradice, o
    «no_concluye» (el DPD citado no es el máximo, o está en el centro)."""
    if dpd < 1 or dpd > 6 or profile[dpd - 1] < max(profile) - 1e-6:
        return "no_concluye"
    if dpd in (3, 4) and abs(profile[2] - profile[3]) < 1e-6:
        return "no_concluye"
    first_half = dpd <= 3
    return "izquierda" if first_half == (side == "left") else "derecha"


def _report(client: httpx.Client, test_no: int) -> Path | None:
    path = REPORTS_DIR / f"v{test_no}R.pdf"
    if path.exists():
        return path
    media_path = MEDIA_DIR / f"media_{test_no}.json"
    if not media_path.exists():
        return None
    media = cast(dict[str, Any], json.loads(media_path.read_text(encoding="utf-8")))
    reports = [r for r in cast(list[dict[str, Any]], media.get("reports") or []) if r.get("media")]
    if not reports:
        return None
    r = client.get(str(reports[0]["media"]), timeout=180, follow_redirects=True)
    r.raise_for_status()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path.write_bytes(r.content)
    return path


def _text(path: Path, pages: int = 12) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return " ".join((p.extract_text() or "") for p in reader.pages[:pages])


def check(per_type: int = PER_TYPE) -> dict[str, Any]:
    rng = random.Random(SEED)
    out: dict[str, Any] = {}
    with httpx.Client(headers={"User-Agent": "croquis-eval/0.1"}) as client:
        for tipo in ("frontal", "frontal_desplazado", "poste", "alcance", "lateral"):
            pool: list[Caso] = [c for c in nhtsa_cases() if c.tipo == tipo and not is_test(c)]
            rng.shuffle(pool)
            counts: Counter[str] = Counter()
            read = 0
            for c in pool:
                if read >= per_type:
                    break
                n = nhtsa_test_no(c.id)
                path = _report(client, n) if n is not None else None
                if path is None:
                    continue
                read += 1
                try:
                    text = _text(path)
                except Exception:  # PDF truncado o dañado: se cuenta y se borra para reintentarlo
                    counts["reporte_ilegible"] += 1
                    path.unlink(missing_ok=True)
                    continue
                st = statement_side(text)
                counts["sin_frase" if st is None else verdict(*st, c.perfil_m)] += 1
            out[tipo] = {"reportes_leidos": read, **counts}
    return {
        "semilla": SEED,
        "muestra": "pruebas de desarrollo (ADR 0032), hasta 12 reportes por tipo",
        "por_tipo": out,
        "nota": (
            "«reporte_ilegible»: el PDF descargado está dañado o truncado. "
            "«izquierda»: la frase del aplastamiento máximo confirma DPD1 a la izquierda; "
            "«derecha»: lo contradice; «no_concluye»: el DPD citado no es el máximo o está al "
            "centro; «sin_frase»: el reporte no trae la frase en sus primeras páginas."
        ),
    }


def main() -> Path:
    return write_result("e5_orientacion", check(), seed=SEED)
