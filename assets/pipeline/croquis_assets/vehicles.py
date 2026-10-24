"""Vehículos realistas de Sketchfab para R10 (ADR 0086), un modelo por clase.

Selección (tabla de candidatos en ``docs/PROGRESS.md``, R10): descargables, con licencia CC-BY 4.0
o CC0 verificada en el detalle de cada modelo antes de bajarlo, sin marca y sin copiar un modelo
real reconocible (regla 5). Lo que traiga logotipos, emblemas o placas con texto se quita en la
preparación con Blender, y se anota en ``LIMPIEZA`` de cada modelo.

Descarga: el API de Sketchfab (``/v3/models/<uid>`` para la licencia y ``/download`` para el
``.glb``, con enlaces que caducan en 300 s) con ``SKETCHFAB_API_TOKEN`` del entorno, que nunca se
escribe ni se imprime. Cada archivo queda fijado por su SHA-256 en
``assets/pipeline/sketchfab.lock.json``: si el autor cambia el modelo, la descarga falla en vez de
cambiar en silencio. Los originales van a ``data/raw/sketchfab/`` (fuera de git).

Se usa ``urllib`` y no ``httpx``: la protección del API de Sketchfab responde 202 sin cuerpo a
``httpx`` (por su huella TLS) y sí atiende a ``urllib``.

Uso: ``uv run croquis-assets vehicles download``.
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = ROOT / "data" / "raw" / "sketchfab"
LOCK = ROOT / "assets" / "pipeline" / "sketchfab.lock.json"
API = "https://api.sketchfab.com/v3"
LICENCIAS = {"by": "CC-BY 4.0", "cc0": "CC0 1.0"}


@dataclass(frozen=True)
class Modelo:
    clase: str
    uid: str
    nombre: str
    autor: str
    usuario: str

    @property
    def url(self) -> str:
        return f"https://sketchfab.com/3d-models/{self.uid}"

    @property
    def raw(self) -> Path:
        return RAW_DIR / f"{self.clase}.glb"


# Uno por clase del visor (vehicle-geometry.ts); las clases parecidas usan el de su forma.
MODELOS: tuple[Modelo, ...] = (
    Modelo(
        "sedan",
        "7fd6e15785fa4aa9bfd6e31eb7c97ba6",
        "Kiri '10",
        "Daniel Zhabotinsky",
        "DanielZhabotinsky",
    ),
    Modelo(
        "hatchback",
        "22abe5284d4c4b55920b8462eb24a8c1",
        "Sigil '07",
        "Daniel Zhabotinsky",
        "DanielZhabotinsky",
    ),
    Modelo(
        "suv",
        "2866efdfa943484391ef8313768e074d",
        "Urban '10",
        "Daniel Zhabotinsky",
        "DanielZhabotinsky",
    ),
    Modelo(
        "pickup",
        "3b3ac59245c44872b06ad85673be9643",
        "Lightbody '90 MD Pickup",
        "Daniel Zhabotinsky",
        "DanielZhabotinsky",
    ),
    Modelo(
        "camion",
        "3be03b6a43aa41898c9ca806b8787052",
        "LCT 3000 '07",
        "Daniel Zhabotinsky",
        "DanielZhabotinsky",
    ),
    # «Red motorcycle» (Chenzoss) se descartó al revisarlo: una sola malla con iluminación horneada,
    # el emblema azul y los colores de un modelo real (ver docs/PROGRESS.md, R10).
    Modelo("moto", "5bb654aed341477b8878f1e2ffd6fcd2", "Enduro bike", "Zaborchik", "Zaborchik"),
)


def _token() -> str:
    token = os.environ.get("SKETCHFAB_API_TOKEN", "")
    if not token:
        msg = "Falta SKETCHFAB_API_TOKEN en el entorno (.env.local)."
        raise RuntimeError(msg)
    return token


def verificar_licencia(detalle: dict[str, Any], m: Modelo) -> str:
    """La licencia del detalle del modelo, solo si es CC-BY o CC0 y el modelo es descargable."""
    licencia: dict[str, Any] = detalle.get("license") or {}
    slug = licencia.get("slug")
    if slug not in LICENCIAS:
        msg = f"{m.nombre}: licencia «{slug}» no permitida (solo CC-BY o CC0)"
        raise ValueError(msg)
    if not detalle.get("isDownloadable"):
        msg = f"{m.nombre}: ya no es descargable"
        raise ValueError(msg)
    if detalle.get("uid") != m.uid:
        msg = f"{m.nombre}: el detalle no corresponde al uid {m.uid}"
        raise ValueError(msg)
    return str(slug)


def _lock() -> dict[str, Any]:
    return json.loads(LOCK.read_text(encoding="utf-8")) if LOCK.exists() else {}


def _get(url: str, token: str | None = None) -> bytes:
    req = urllib.request.Request(url)
    if token:
        req.add_header("Authorization", f"Token {token}")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def download() -> list[Path]:
    """Baja el ``.glb`` de cada modelo, verifica su licencia y su SHA-256 contra el lock."""
    token = _token()
    lock = _lock()
    nuevo: dict[str, Any] = {}
    salidas: list[Path] = []
    for m in MODELOS:
        detalle = json.loads(_get(f"{API}/models/{m.uid}"))
        licencia = verificar_licencia(detalle, m)
        if not m.raw.exists():
            enlaces = json.loads(_get(f"{API}/models/{m.uid}/download", token))
            m.raw.parent.mkdir(parents=True, exist_ok=True)
            m.raw.write_bytes(_get(enlaces["glb"]["url"]))
        datos = m.raw.read_bytes()
        sha = hashlib.sha256(datos).hexdigest()
        previo = lock.get(m.clase)
        if previo and previo["sha256"] != sha:
            msg = f"{m.nombre}: el SHA-256 no coincide con el lock (¿cambió el modelo?)"
            raise ValueError(msg)
        nuevo[m.clase] = {
            "uid": m.uid,
            "nombre": m.nombre,
            "autor": m.autor,
            "licencia": LICENCIAS[licencia],
            "url": m.url,
            "sha256": sha,
            "bytes": len(datos),
            "caras": detalle.get("faceCount"),
        }
        salidas.append(m.raw)
    LOCK.write_text(
        json.dumps(nuevo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return salidas


# --- Preparación y optimización -------------------------------------------------------------------

PREPARADOS = RAW_DIR / "preparados"
OUT_DIR = ROOT / "apps" / "web" / "public" / "modelos" / "vehiculos"
MANIFIESTO = OUT_DIR / "vehiculos.json"
SCRIPT_BLENDER = ROOT / "assets" / "pipeline" / "blender" / "preparar_vehiculo.py"
BLENDER = os.environ.get(
    "CROQUIS_BLENDER", "D:/dev-cache/tools/blender/blender-5.2.3-windows-x64/blender.exe"
)
KTX_DIR = os.environ.get("CROQUIS_KTX_DIR", "D:/dev-cache/tools/ktx/bin")
# Las texturas de color, material y brillo van en ETC1S; las normales (si un modelo las trae), en
# UASTC, que conserva mejor su precisión.
SLOTS_ETC1S = (
    "{baseColorTexture,metallicRoughnessTexture,occlusionTexture,emissiveTexture,"
    "specularTexture,specularColorTexture,clearcoatTexture,clearcoatRoughnessTexture}"
)

# Las tres versiones de cada modelo: para alta y ultra; ligera para media (baja usa el vehículo
# paramétrico); y con WebP para Blender (R11), porque el video no puede leer KTX2.
VARIANTES: dict[str, list[list[str]]] = {
    "alta": [
        ["dedup"],
        ["prune"],
        ["uastc", "--slots", "normalTexture", "--resize", "1024", "--level", "2", "--zstd", "18"],
        ["etc1s", "--slots", SLOTS_ETC1S, "--resize", "1024", "--quality", "192"],
        ["draco"],
    ],
    "ligero": [
        ["dedup"],
        ["prune"],
        ["simplify", "--ratio", "0.5", "--error", "0.001"],
        ["uastc", "--slots", "normalTexture", "--resize", "512", "--level", "1", "--zstd", "18"],
        ["etc1s", "--slots", SLOTS_ETC1S, "--resize", "512", "--quality", "128"],
        ["draco"],
    ],
    "blender": [
        ["dedup"],
        ["prune"],
        ["webp"],
        ["draco"],
    ],
}
SUFIJO = {"alta": "", "ligero": "-ligero", "blender": "-blender"}


def _gltf_transform(paso: list[str], entrada: Path, salida: Path) -> None:
    import shutil
    import subprocess

    pnpm = shutil.which("pnpm")
    if not pnpm:
        msg = "Falta pnpm en el PATH (gltf-transform es dependencia de desarrollo del repo)."
        raise RuntimeError(msg)
    env = {**os.environ, "PATH": f"{os.environ.get('PATH', '')}{os.pathsep}{KTX_DIR}"}
    cmd = [pnpm, "exec", "gltf-transform", paso[0], str(entrada), str(salida), *paso[1:]]
    subprocess.run(cmd, cwd=ROOT, env=env, check=True, capture_output=True)


def preparar(m: Modelo) -> dict[str, Any]:
    """La limpieza y la estructura del visor, en Blender (``blender/preparar_vehiculo.py``)."""
    import subprocess

    PREPARADOS.mkdir(parents=True, exist_ok=True)
    glb = PREPARADOS / f"{m.clase}.glb"
    info = PREPARADOS / f"{m.clase}.json"
    cmd = [BLENDER, "-b", "--factory-startup", "-P", str(SCRIPT_BLENDER), "--"]
    subprocess.run(
        [*cmd, m.clase, str(m.raw), str(glb), str(info)], check=True, capture_output=True
    )
    return json.loads(info.read_text(encoding="utf-8"))


def optimizar(m: Modelo) -> dict[str, dict[str, Any]]:
    """Las tres versiones del modelo preparado, con su SHA-256 y su tamaño."""
    import tempfile

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    archivos: dict[str, dict[str, Any]] = {}
    for variante, pasos in VARIANTES.items():
        destino = OUT_DIR / f"{m.clase}{SUFIJO[variante]}.glb"
        with tempfile.TemporaryDirectory() as tmp:
            actual = PREPARADOS / f"{m.clase}.glb"
            for k, paso in enumerate(pasos):
                siguiente = destino if k == len(pasos) - 1 else Path(tmp) / f"{k}.glb"
                _gltf_transform(paso, actual, siguiente)
                actual = siguiente
        datos = destino.read_bytes()
        archivos[variante] = {
            "archivo": destino.name,
            "sha256": hashlib.sha256(datos).hexdigest(),
            "bytes": len(datos),
        }
    return archivos


def build() -> dict[str, Any]:
    """Prepara y optimiza los seis modelos y escribe ``vehiculos.json``."""
    lock = _lock()
    clases: dict[str, Any] = {}
    for m in MODELOS:
        fijado = lock.get(m.clase)
        if not fijado or hashlib.sha256(m.raw.read_bytes()).hexdigest() != fijado["sha256"]:
            msg = f"{m.nombre}: falta el original o no coincide con el lock; corre `download`."
            raise ValueError(msg)
        info = preparar(m)
        clases[m.clase] = {
            "modelo": {
                "nombre": m.nombre,
                "autor": m.autor,
                "usuario": m.usuario,
                "licencia": fijado["licencia"],
                "url": m.url,
            },
            "archivos": optimizar(m),
            "largo_m": info["largo_m"],
            "ancho_m": info["ancho_m"],
            "alto_m": info["alto_m"],
            "caras": info["caras"],
            "ruedas": info["ruedas"],
            "papeles": info["papeles"],
            "quitados": info["quitados"],
        }
    manifiesto = {
        "_generado_por": "uv run croquis-assets vehicles build",
        "marco": (
            "x al frente, y arriba, z a la derecha (−z izquierda); "
            "origen en el centro de la planta, sobre el piso"
        ),
        "clases": clases,
    }
    MANIFIESTO.write_text(
        json.dumps(manifiesto, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifiesto


def check() -> list[str]:
    """Que cada archivo del manifiesto exista y tenga el SHA-256 anotado (no necesita Blender)."""
    if not MANIFIESTO.exists():
        return [f"Falta {MANIFIESTO.name}"]
    manifiesto: dict[str, Any] = json.loads(MANIFIESTO.read_text(encoding="utf-8"))
    clases: dict[str, dict[str, Any]] = manifiesto["clases"]
    errores: list[str] = []
    for clase, c in clases.items():
        archivos: dict[str, dict[str, Any]] = c["archivos"]
        for variante, a in archivos.items():
            ruta = OUT_DIR / a["archivo"]
            if not ruta.exists():
                errores.append(f"{clase} {variante}: falta {a['archivo']}")
            elif hashlib.sha256(ruta.read_bytes()).hexdigest() != a["sha256"]:
                errores.append(f"{clase} {variante}: {a['archivo']} no coincide con el manifiesto")
    return errores
