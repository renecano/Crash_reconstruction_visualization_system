"""Árboles impostores (T1.3b, ADR 0099): modelos CC0 de Poly Haven horneados en Blender.

Cada especie es un modelo de Poly Haven (``.blend`` de 1k con sus texturas) que ``hornear_arbol.py``
dibuja en Blender con fondo transparente desde el frente y desde arriba, y guarda el color sin luz
(pase de color difuso), la normal (pase de normales) y el alfa. El visor arma con eso tarjetas
cruzadas (tres verticales y una horizontal), instanciadas: unos cientos de KB por especie en vez de
los 40–180 MB del modelo.

- ``download``: baja el ``.blend`` y sus texturas a ``data/raw/polyhaven-arboles`` (fuera de git) y
  verifica el MD5 fijado en ``assets/pipeline/polyhaven-arboles.lock.json``.
- ``build``: hornea en Blender (``CROQUIS_BLENDER``) y escribe los WebP y ``arboles.json`` en
  ``apps/web/public/arboles``. Acepta ``CROQUIS_ARBOLES_SOLO=jacaranda,...``.
- ``check``: que los archivos versionados coincidan con el manifiesto (sin Blender).

Licencia CC0 1.0 (Poly Haven); autores en ``arboles.json`` y en ``assets/ASSETS.md``.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = ROOT / "data" / "raw" / "polyhaven-arboles"
OUT_DIR = ROOT / "apps" / "web" / "public" / "arboles"
MANIFIESTO = OUT_DIR / "arboles.json"
LOCK = ROOT / "assets" / "pipeline" / "polyhaven-arboles.lock.json"
API = "https://api.polyhaven.com/files/"
USER_AGENT = "Croquis/0.1 (reconstruccion ilustrativa; proyecto academico)"
SCRIPT_BLENDER = ROOT / "assets" / "pipeline" / "blender" / "hornear_arbol.py"
BLENDER = os.environ.get(
    "CROQUIS_BLENDER", "D:/dev-cache/tools/blender/blender-5.2.3-windows-x64/blender.exe"
)
# Lado de la tarjeta del frente y de la planta (px) y calidad WebP.
SIZE_FRENTE = 1024
SIZE_PLANTA = 512
QUALITY = {"diff": 82, "nor": 88}


@dataclass(frozen=True)
class Arbol:
    especie: str
    polyhaven_id: str
    autores: str
    nombre_comun: str
    """Altura con la que se dibuja en el visor si la escena no la da (m)."""
    alto_m: float


# Especies comunes en México (mensaje de René, 2026-11-03). Poly Haven no tiene fresno, pirul ni
# palmera: el fresno usa un árbol pequeño de copa redonda, el pirul uno ancho y bajo de tronco
# retorcido; la palmera sigue procedural (ver ADR 0099).
ARBOLES: tuple[Arbol, ...] = (
    Arbol("jacaranda", "jacaranda_tree", "Rob Tuytel, Rico Cilliers", "jacaranda", 11.0),
    Arbol("fresno", "tree_small_02", "Rico Cilliers", "fresno", 12.0),
    Arbol("pirul", "island_tree_01", "Rob Tuytel, Rico Cilliers", "pirul", 8.0),
)


def _lock() -> dict[str, Any]:
    return json.loads(LOCK.read_text(encoding="utf-8")) if LOCK.exists() else {}


def lock_from_api(client: httpx.Client | None = None) -> dict[str, Any]:
    """URL y MD5 del ``.blend`` de 1k y de sus texturas, según la API de Poly Haven."""
    c = client or httpx.Client(timeout=60, headers={"User-Agent": USER_AGENT})
    out: dict[str, Any] = {}
    for a in ARBOLES:
        files: dict[str, Any] = c.get(API + a.polyhaven_id).json()
        blend = files["blend"]["1k"]["blend"]
        out[a.polyhaven_id] = {
            "blend": {"url": blend["url"], "md5": blend["md5"], "size": blend["size"]},
            "texturas": {
                rel: {"url": inc["url"], "md5": inc["md5"], "size": inc["size"]}
                for rel, inc in blend.get("include", {}).items()
            },
        }
    return out


def raw_dir(a: Arbol) -> Path:
    return RAW_DIR / a.polyhaven_id


def raw_blend(a: Arbol) -> Path:
    return raw_dir(a) / f"{a.polyhaven_id}_1k.blend"


def _fetch(c: httpx.Client, url: str, md5: str, dest: Path) -> None:
    if dest.exists() and hashlib.md5(dest.read_bytes()).hexdigest() == md5:
        return
    data = c.get(url).content
    if hashlib.md5(data).hexdigest() != md5:
        msg = f"{dest.name}: el MD5 no coincide con el lock"
        raise RuntimeError(msg)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)


def download(client: httpx.Client | None = None) -> list[Path]:
    """Baja el ``.blend`` y sus texturas fijados en el lock y verifica su MD5."""
    lock = _lock()
    if not lock:
        msg = f"Falta {LOCK.name}: créalo con `lock_from_api`"
        raise RuntimeError(msg)
    c = client or httpx.Client(
        timeout=600, headers={"User-Agent": USER_AGENT}, follow_redirects=True
    )
    out: list[Path] = []
    for a in ARBOLES:
        entry = lock[a.polyhaven_id]
        _fetch(c, entry["blend"]["url"], entry["blend"]["md5"], raw_blend(a))
        out.append(raw_blend(a))
        for rel, t in entry["texturas"].items():
            p = raw_dir(a) / rel
            _fetch(c, t["url"], t["md5"], p)
            out.append(p)
    return out


def hornear(a: Arbol) -> dict[str, Any]:
    """Dibuja el frente y la planta en Blender (color difuso, normal y alfa) y mide el árbol."""
    salida = RAW_DIR / "horneados" / a.especie
    salida.mkdir(parents=True, exist_ok=True)
    cmd = [BLENDER, "-b", "--factory-startup", "-P", str(SCRIPT_BLENDER), "--"]
    subprocess.run(
        [*cmd, str(raw_blend(a)), str(salida), str(SIZE_FRENTE), str(SIZE_PLANTA)],
        check=True,
        capture_output=True,
    )
    return json.loads((salida / "medidas.json").read_text(encoding="utf-8"))


def encode(png: bytes, mapa: str, size: int) -> bytes:
    """PNG RGBA de Blender a WebP RGBA del tamaño pedido."""
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    if img.width != size:
        img = img.resize((size, size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=QUALITY[mapa], method=6)
    return buf.getvalue()


def _medidas(a: Arbol) -> dict[str, Any]:
    p = RAW_DIR / "horneados" / a.especie / "medidas.json"
    return json.loads(p.read_text(encoding="utf-8"))


def build(solo: set[str] | None = None) -> dict[str, Any]:
    """Hornea (todas las especies, o ``solo`` esas) y escribe los WebP y ``arboles.json``."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    previo: dict[str, Any] = (
        json.loads(MANIFIESTO.read_text(encoding="utf-8")).get("especies", {})
        if MANIFIESTO.exists()
        else {}
    )
    especies: dict[str, Any] = {}
    for a in ARBOLES:
        if solo is not None and a.especie not in solo:
            if a.especie in previo:
                especies[a.especie] = previo[a.especie]
            continue
        medidas = hornear(a)
        horneados = RAW_DIR / "horneados" / a.especie
        archivos: dict[str, Any] = {}
        for vista, size in (("frente", SIZE_FRENTE), ("planta", SIZE_PLANTA)):
            for mapa in ("diff", "nor"):
                data = encode((horneados / f"{vista}_{mapa}.png").read_bytes(), mapa, size)
                name = f"{a.especie}_{vista}_{mapa}.webp"
                (OUT_DIR / name).write_bytes(data)
                archivos[f"{vista}_{mapa}"] = {
                    "archivo": name,
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "bytes": len(data),
                    "px": size,
                }
        especies[a.especie] = {
            "modelo": {
                "polyhaven": a.polyhaven_id,
                "autores": a.autores,
                "licencia": "CC0 1.0",
                "url": f"https://polyhaven.com/a/{a.polyhaven_id}",
            },
            "nombre_comun": a.nombre_comun,
            "alto_m": a.alto_m,
            # Proporciones del modelo horneado: ancho/alto del frente y dónde empieza la copa.
            "medidas": medidas,
            "archivos": archivos,
        }
    manifiesto = {
        "_generado_por": "uv run croquis-assets trees build",
        "_nota": "Árboles CC0 de Poly Haven horneados a tarjetas (ADR 0099); ver assets/ASSETS.md.",
        "especies": especies,
    }
    MANIFIESTO.write_text(
        json.dumps(manifiesto, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifiesto


def check() -> list[str]:
    """Que cada archivo del manifiesto exista y tenga el SHA-256 anotado (no necesita Blender)."""
    if not MANIFIESTO.exists():
        return [f"Falta {MANIFIESTO.name}"]
    m: dict[str, Any] = json.loads(MANIFIESTO.read_text(encoding="utf-8"))
    errores: list[str] = []
    for especie, e in m["especies"].items():
        for vista, a in e["archivos"].items():
            ruta = OUT_DIR / a["archivo"]
            if not ruta.exists():
                errores.append(f"{especie} {vista}: falta {a['archivo']}")
            elif hashlib.sha256(ruta.read_bytes()).hexdigest() != a["sha256"]:
                errores.append(f"{especie} {vista}: {a['archivo']} no coincide con el manifiesto")
    return errores
