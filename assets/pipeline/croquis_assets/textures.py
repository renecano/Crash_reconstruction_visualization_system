"""Texturas PBR del entorno (F8e) a partir de Poly Haven (CC0 1.0).

Fuente: https://polyhaven.com, mapas de 1k en JPG de cada textura. Las URL y los MD5 salen de la
API pública (``api.polyhaven.com/files/<id>``) y quedan fijados en
``assets/pipeline/polyhaven.lock.json``: si Poly Haven cambia un archivo, la descarga falla en vez
de cambiar en silencio.

Qué hace el pipeline (determinista):

1. **Mapas.** Color (``diff``), normal en convención OpenGL (``nor_gl``) y rugosidad (``rough``).
2. **Tamaño.** De 1024 a 512 px con filtro Lanczos: con mosaicos de 2 a 6 m, 512 px dan entre
   1 y 1.2 cm por texel, de sobra para la distancia de la cámara, y la carga se mantiene dentro
   del presupuesto de E6 (≤ 8 MB al primer cuadro).
3. **Formato.** WebP con pérdida (calidad 82; 90 en las normales) con Pillow 12.3.0 y libwebp
   fijos, así que ``build`` reproduce los mismos bytes (``check``).

4. **Promedios.** Del WebP ya codificado: color medio en RGB lineal (``diff``) y rugosidad media
   (``rough``). El visor escala la textura para que su promedio sea el color y la rugosidad
   calibrados de cada material: la textura aporta detalle, no cambia el tono (ADR 0024).

Salida: ``apps/web/public/texturas/<nombre>_<mapa>.webp`` y ``texturas.json`` con el tamaño del
mosaico, el autor, la licencia, los promedios y el SHA-256 de cada archivo.

Uso: ``uv run croquis-assets textures download``, ``build`` y ``check``.
"""

from __future__ import annotations

import hashlib
import io
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = ROOT / "data" / "raw" / "polyhaven"
OUT_DIR = ROOT / "apps" / "web" / "public" / "texturas"
LOCK = ROOT / "assets" / "pipeline" / "polyhaven.lock.json"
API = "https://api.polyhaven.com/files/"
USER_AGENT = "Croquis/0.1 (reconstruccion ilustrativa; proyecto academico)"
SIZE = 512
MAPS = {"diff": "Diffuse", "nor_gl": "nor_gl", "rough": "Rough"}
QUALITY = {"diff": 82, "nor_gl": 90, "rough": 82}


@dataclass(frozen=True)
class Textura:
    nombre: str
    polyhaven_id: str
    autor: str
    mosaico_m: float
    uso: str


TEXTURAS = [
    Textura("asfalto", "asphalt_track", "Dimitrios Savva", 4.0, "Calzada"),
    Textura("concreto", "concrete_pavement", "Charlotte Baglioni", 2.0, "Banquetas y camellón"),
    Textura("pasto", "leafy_grass", "Charlotte Baglioni", 8.0, "Suelo fuera de la vía"),
    # Solo se carga en escenas con `grava_suelta`, dentro de las manchas de grava (ADR 0036).
    Textura("grava", "gravel_stones", "Amal Kumar", 2.0, "Grava suelta sobre la calzada"),
]


def _lock() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(LOCK.read_text(encoding="utf-8"))
    return data


def lock_from_api(client: httpx.Client | None = None) -> dict[str, Any]:
    """URL y MD5 de los mapas de 1k según la API de Poly Haven (para crear o renovar el lock)."""
    c = client or httpx.Client(timeout=60, headers={"User-Agent": USER_AGENT})
    out: dict[str, Any] = {}
    for t in TEXTURAS:
        files: dict[str, Any] = c.get(API + t.polyhaven_id).json()
        out[t.polyhaven_id] = {
            m: {
                "url": files[key]["1k"]["jpg"]["url"],
                "md5": files[key]["1k"]["jpg"]["md5"],
            }
            for m, key in MAPS.items()
        }
    return out


def raw_path(t: Textura, mapa: str) -> Path:
    return RAW_DIR / f"{t.polyhaven_id}_{mapa}_1k.jpg"


def download(client: httpx.Client | None = None) -> list[Path]:
    """Baja los JPG fijados en el lock a ``data/raw/polyhaven`` y verifica su MD5."""
    lock = _lock()
    c = client or httpx.Client(
        timeout=120, headers={"User-Agent": USER_AGENT}, follow_redirects=True
    )
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for t in TEXTURAS:
        for mapa in MAPS:
            entry = lock[t.polyhaven_id][mapa]
            p = raw_path(t, mapa)
            if not p.exists() or hashlib.md5(p.read_bytes()).hexdigest() != entry["md5"]:
                data = c.get(entry["url"]).content
                if hashlib.md5(data).hexdigest() != entry["md5"]:
                    msg = f"{t.polyhaven_id} {mapa}: el MD5 no coincide con el lock"
                    raise RuntimeError(msg)
                p.write_bytes(data)
            paths.append(p)
    return paths


def encode(raw: bytes, mapa: str) -> bytes:
    """De JPG de 1k a WebP de 512 px (la rugosidad en gris: WebP la guarda con R = G = B)."""
    img = Image.open(io.BytesIO(raw))
    img = img.convert("L" if mapa == "rough" else "RGB")
    img = img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=QUALITY[mapa], method=6)
    return buf.getvalue()


def _srgb_to_linear(v: int) -> float:
    c = v / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mean_of(data: bytes, mapa: str) -> list[float] | float | None:
    """Promedio del mapa codificado: RGB lineal del color, rugosidad (0-1) del canal rojo."""
    if mapa == "nor_gl":
        return None
    img = Image.open(io.BytesIO(data)).convert("RGB")
    n = img.width * img.height
    hist = img.histogram()  # 256 cuentas por canal, R, G y B seguidos
    if mapa == "rough":
        return round(sum(k * v for v, k in enumerate(hist[:256])) / 255 / n, 4)
    return [
        round(
            sum(k * _srgb_to_linear(v) for v, k in enumerate(hist[256 * c : 256 * c + 256])) / n, 4
        )
        for c in range(3)
    ]


def outputs() -> dict[str, bytes]:
    """Archivos de salida (ruta relativa a ``OUT_DIR`` → bytes), incluido el manifiesto."""
    files: dict[str, bytes] = {}
    manifest: dict[str, Any] = {
        "_nota": "Texturas PBR de Poly Haven (CC0 1.0); ver assets/ASSETS.md y ADR 0024.",
        "tamano_px": SIZE,
        "texturas": {},
    }
    for t in TEXTURAS:
        entry: dict[str, Any] = {
            "polyhaven": t.polyhaven_id,
            "autor": t.autor,
            "licencia": "CC0 1.0",
            "url": f"https://polyhaven.com/a/{t.polyhaven_id}",
            "mosaico_m": t.mosaico_m,
            "uso": t.uso,
            "archivos": {},
        }
        for mapa in MAPS:
            data = encode(raw_path(t, mapa).read_bytes(), mapa)
            name = f"{t.nombre}_{mapa}.webp"
            files[name] = data
            info: dict[str, Any] = {"archivo": name, "sha256": hashlib.sha256(data).hexdigest()}
            media = mean_of(data, mapa)
            if media is not None:
                info["media"] = media
            entry["archivos"][mapa] = info
        manifest["texturas"][t.nombre] = entry
    files["texturas.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    return files


def build() -> list[Path]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name, data in outputs().items():
        p = OUT_DIR / name
        p.write_bytes(data)
        written.append(p)
    return written


def check() -> list[str]:
    """Archivos que no coinciden byte a byte con lo que produce ``build``."""
    return [
        name
        for name, data in outputs().items()
        if not (OUT_DIR / name).exists() or (OUT_DIR / name).read_bytes() != data
    ]
