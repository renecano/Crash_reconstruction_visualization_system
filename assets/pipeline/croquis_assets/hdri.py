"""HDRI del cielo (T1.1 de PLAN-CESVI v3) a partir de Poly Haven (CC0 1.0).

Fuente: https://polyhaven.com, el ``.hdr`` (RGBE) de 1k de cada cielo. Las URL y los MD5 salen de
la API pública (``api.polyhaven.com/files/<id>``) y quedan fijados en
``assets/pipeline/polyhaven-hdri.lock.json``: si Poly Haven cambia un archivo, la descarga falla
en vez de cambiar en silencio.

Qué hace el pipeline (determinista):

1. **Descarga** el ``.hdr`` de 1k fijado en el lock a ``data/raw/polyhaven`` y verifica su MD5.
2. **Build** lo copia tal cual (sin recodificar: es HDR y el visor lo lee con ``HDRLoader``) a
   ``apps/web/public/hdri/<nombre>.hdr`` y escribe ``hdri.json`` con autor, licencia, URL, uso,
   bytes, SHA-256 y el azimut del punto más brillante del cielo (el sol del HDRI). 1k basta: el
   visor lo usa como luz de ambiente y reflejos (prefiltrado, borroso por diseño), nunca como fondo.
3. **Check** compara byte a byte lo versionado con lo que produce ``build``.

Qué cielo usa cada escena lo decide el visor (``sky.ts``) por el clima y la hora del hecho: de día
despejado, nublado o lluvia, amanecer o atardecer, y de noche. El sol y las sombras siguen saliendo
de la posición solar calculada; el HDRI se gira para que su sol caiga en el azimut del sol
calculado y solo aporta la luz de ambiente y los reflejos (ADR 0094).

Uso: ``uv run croquis-assets hdri download``, ``build`` y ``check``.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = ROOT / "data" / "raw" / "polyhaven"
OUT_DIR = ROOT / "apps" / "web" / "public" / "hdri"
LOCK = ROOT / "assets" / "pipeline" / "polyhaven-hdri.lock.json"
API = "https://api.polyhaven.com/files/"
USER_AGENT = "Croquis/0.1 (reconstruccion ilustrativa; proyecto academico)"
RESOLUCION = "1k"
# Un HDRI de 1k en RGBE pesa menos de 2 MB; más es señal de que el lock apunta a otra resolución.
MAX_BYTES = 2_000_000


@dataclass(frozen=True)
class Hdri:
    nombre: str
    polyhaven_id: str
    autor: str
    uso: str


HDRIS = [
    Hdri(
        "dia",
        "kloofendal_48d_partly_cloudy_puresky",
        "Greg Zaal, Jarod Guest",
        "Día despejado o con algunas nubes",
    ),
    Hdri(
        "nublado", "kloofendal_overcast_puresky", "Greg Zaal", "Nublado, lluvia, granizo y niebla"
    ),
    Hdri(
        "crepusculo",
        "belfast_sunset_puresky",
        "Dimitrios Savva, Greg Zaal, Jarod Guest",
        "Amanecer y atardecer",
    ),
    Hdri("noche", "dikhololo_night", "Greg Zaal", "Noche (estrellas y horizonte de campo)"),
]


def _lock() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(LOCK.read_text(encoding="utf-8"))
    return data


def lock_from_api(client: httpx.Client | None = None) -> dict[str, Any]:
    """URL y MD5 del ``.hdr`` de 1k según la API de Poly Haven (para crear o renovar el lock)."""
    c = client or httpx.Client(timeout=60, headers={"User-Agent": USER_AGENT})
    out: dict[str, Any] = {}
    for h in HDRIS:
        files: dict[str, Any] = c.get(API + h.polyhaven_id).json()
        entry = files["hdri"][RESOLUCION]["hdr"]
        out[h.polyhaven_id] = {"url": entry["url"], "md5": entry["md5"], "bytes": entry["size"]}
    return out


def raw_path(h: Hdri) -> Path:
    return RAW_DIR / f"{h.polyhaven_id}_{RESOLUCION}.hdr"


def download(client: httpx.Client | None = None) -> list[Path]:
    """Baja los ``.hdr`` fijados en el lock a ``data/raw/polyhaven`` y verifica su MD5."""
    lock = _lock()
    c = client or httpx.Client(
        timeout=120, headers={"User-Agent": USER_AGENT}, follow_redirects=True
    )
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for h in HDRIS:
        entry = lock[h.polyhaven_id]
        p = raw_path(h)
        if not p.exists() or hashlib.md5(p.read_bytes()).hexdigest() != entry["md5"]:
            data = c.get(entry["url"]).content
            if hashlib.md5(data).hexdigest() != entry["md5"]:
                msg = f"{h.polyhaven_id}: el MD5 no coincide con el lock"
                raise RuntimeError(msg)
            p.write_bytes(data)
        paths.append(p)
    return paths


def decode_rgbe(data: bytes) -> np.ndarray:
    """Decodifica un ``.hdr`` de Radiance (RGBE, con o sin la RLE nueva) a un arreglo
    (alto, ancho, 3) en flotante lineal. Solo lo que necesita el pipeline: orientación
    ``-Y h +X w``.
    """
    end = data.index(b"\n\n")
    header = data[:end].decode("ascii", "replace")
    if not header.startswith("#?RADIANCE"):
        msg = "No es un archivo Radiance HDR"
        raise ValueError(msg)
    rest = data[end + 2 :]
    nl = rest.index(b"\n")
    parts = rest[:nl].decode("ascii").split()
    if parts[0] != "-Y" or parts[2] != "+X":
        msg = f"Orientación no soportada: {' '.join(parts)}"
        raise ValueError(msg)
    h, w = int(parts[1]), int(parts[3])
    buf = np.frombuffer(rest[nl + 1 :], dtype=np.uint8)
    out = np.empty((h, w, 4), dtype=np.uint8)
    pos = 0
    for y in range(h):
        if w < 8 or w > 0x7FFF or buf[pos] != 2 or buf[pos + 1] != 2 or buf[pos + 2] & 0x80:
            # Sin RLE: w pixeles de 4 bytes.
            out[y] = buf[pos : pos + 4 * w].reshape(w, 4)
            pos += 4 * w
            continue
        if (int(buf[pos + 2]) << 8) | int(buf[pos + 3]) != w:
            msg = "Ancho de scanline inconsistente"
            raise ValueError(msg)
        pos += 4
        for c in range(4):
            x = 0
            while x < w:
                n = int(buf[pos])
                pos += 1
                if n > 128:
                    n -= 128
                    out[y, x : x + n, c] = buf[pos]
                    pos += 1
                else:
                    out[y, x : x + n, c] = buf[pos : pos + n]
                    pos += n
                x += n
    rgb = out[:, :, :3].astype(np.float64)
    e = out[:, :, 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return rgb * scale[:, :, None]


def sun_azimuth_deg(img: np.ndarray) -> float:
    """Azimut (desde el norte, horario, en grados) del punto más brillante del cielo del HDRI, con
    la convención de three.js para el mapa equirectangular: la columna u = 0.5 mira al este (+X) y
    u crece hacia el sur. El visor gira el HDRI para que ese punto caiga donde está el sol
    calculado.
    """
    lum = 0.2126 * img[:, :, 0] + 0.7152 * img[:, :, 1] + 0.0722 * img[:, :, 2]
    upper = lum[: lum.shape[0] // 2]  # solo el cielo (la mitad de arriba)
    cols = upper.sum(axis=0)
    u = (float(np.argmax(cols)) + 0.5) / cols.shape[0]
    return round((90.0 + (u - 0.5) * 360.0) % 360.0, 1)


def outputs() -> dict[str, bytes]:
    """Archivos de salida (ruta relativa a ``OUT_DIR`` → bytes), incluido el manifiesto."""
    files: dict[str, bytes] = {}
    manifest: dict[str, Any] = {
        "_nota": "HDRI de Poly Haven (CC0 1.0), sin recodificar; ver assets/ASSETS.md y ADR 0094.",
        "resolucion": RESOLUCION,
        "hdri": {},
    }
    for h in HDRIS:
        data = raw_path(h).read_bytes()
        if len(data) > MAX_BYTES:
            msg = f"{h.polyhaven_id}: {len(data)} bytes, más que el máximo de {MAX_BYTES}"
            raise RuntimeError(msg)
        name = f"{h.nombre}.hdr"
        files[name] = data
        manifest["hdri"][h.nombre] = {
            "polyhaven": h.polyhaven_id,
            "autor": h.autor,
            "licencia": "CC0 1.0",
            "url": f"https://polyhaven.com/a/{h.polyhaven_id}",
            "uso": h.uso,
            "archivo": name,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "azimut_sol_deg": sun_azimuth_deg(decode_rgbe(data)),
        }
    files["hdri.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
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
