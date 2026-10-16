"""Extractos de OpenStreetMap vía Overpass para las escenas con ``ubicacion_real`` (F8d, ADR 0023).

Se pide cada ``way`` con etiqueta ``highway`` a menos de ``radio_m`` del punto, con sus nodos. La
respuesta cruda se guarda versionada en ``data/osm/<nombre>.overpass.json`` (es pequeña y la usan
las pruebas y la escena), con su SHA-256 en ``data/osm/manifest.json``. La conversión a
``lugar.red_vial`` está en TS (``packages/croquis-2d/src/osm.ts``), porque también la usa
producción.

Licencia: los datos son de OpenStreetMap, bajo la Open Database License (ODbL 1.0); ver
``data/osm/README.md`` y ``data/SOURCES.md``. Uso del servidor público de Overpass: User-Agent
propio, pocas consultas y espera creciente si responde 429 o 5xx (política del servidor: pausa
antes de reintentar; está saturado con frecuencia).

Uso: ``uv run croquis-data osm download [--nombre toluca_carranza_juarez]`` y
``uv run croquis-data osm check``.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[2]
OSM_DIR = ROOT / "data" / "osm"
MANIFEST = OSM_DIR / "manifest.json"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "Croquis/0.1 (reconstruccion ilustrativa de percances; proyecto academico)"
BACKOFF_S = (30, 60, 120, 240)


@dataclass(frozen=True)
class Extracto:
    nombre: str
    lat: float
    lon: float
    radio_m: int
    nodo_cruce: int | None
    descripcion: str


EXTRACTOS: dict[str, Extracto] = {
    "toluca_carranza_juarez": Extracto(
        "toluca_carranza_juarez",
        19.278975,
        -99.6539869,
        150,
        305269145,
        "Av. General Venustiano Carranza y Calle Benito Juárez García, Toluca, Estado de México",
    ),
}


def query(lat: float, lon: float, radio_m: int) -> str:
    """Consulta Overpass QL: calles a menos de ``radio_m`` del punto, con sus nodos."""
    return (
        f'[out:json][timeout:25];way(around:{radio_m},{lat},{lon})["highway"];'
        "out body;>;out skel qt;"
    )


def fetch(
    q: str,
    client: httpx.Client | None = None,
    sleep: Callable[[float], None] = time.sleep,
    backoff: tuple[int, ...] = BACKOFF_S,
) -> bytes:
    """Respuesta de Overpass; reintenta con espera creciente si el servidor está saturado."""
    own = client is None
    c = client or httpx.Client(timeout=90, headers={"User-Agent": USER_AGENT})
    try:
        for wait in (*backoff, None):
            r = c.post(OVERPASS_URL, data={"data": q})
            if r.status_code == 200 and r.content.lstrip().startswith(b"{"):
                return r.content
            if wait is None or not (r.status_code == 429 or r.status_code >= 500):
                msg = f"Overpass respondió {r.status_code}: {r.text[:200]}"
                raise RuntimeError(msg)
            sleep(wait)
        msg = "Overpass no respondió"
        raise RuntimeError(msg)
    finally:
        if own:
            c.close()


def _manifest() -> dict[str, Any]:
    if not MANIFEST.exists():
        return {}
    data: dict[str, Any] = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return data


def path_for(nombre: str) -> Path:
    return OSM_DIR / f"{nombre}.overpass.json"


def download(
    nombre: str, client: httpx.Client | None = None, sleep: Callable[[float], None] = time.sleep
) -> Path:
    ex = EXTRACTOS[nombre]
    q = query(ex.lat, ex.lon, ex.radio_m)
    raw = fetch(q, client, sleep)
    data = json.loads(raw)
    OSM_DIR.mkdir(parents=True, exist_ok=True)
    out = path_for(nombre)
    out.write_bytes(raw)
    man = _manifest()
    man[nombre] = {
        "descripcion": ex.descripcion,
        "lat": ex.lat,
        "lon": ex.lon,
        "radio_m": ex.radio_m,
        "nodo_cruce": ex.nodo_cruce,
        "url": OVERPASS_URL,
        "consulta": q,
        "datos_osm": data.get("osm3s", {}).get("timestamp_osm_base"),
        "descargado": datetime.now(UTC).strftime("%Y-%m-%d"),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "elementos": len(data.get("elements", [])),
    }
    MANIFEST.write_text(
        json.dumps(man, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return out


def check() -> list[str]:
    """Problemas: extractos del manifiesto que faltan o cuyo SHA-256 no coincide."""
    problems: list[str] = []
    for nombre, info in _manifest().items():
        p = path_for(nombre)
        if not p.exists():
            problems.append(f"{nombre}: falta {p.name}")
            continue
        if hashlib.sha256(p.read_bytes()).hexdigest() != info["sha256"]:
            problems.append(f"{nombre}: el SHA-256 no coincide con el manifiesto")
    return problems
