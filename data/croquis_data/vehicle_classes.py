"""Construye la tabla de rangos por clase de vehículo que usa el validador semántico.

Entrada: ``data/vehicles/models_raw.json`` (fichas técnicas de fabricantes, una fila por modelo,
con URL y fecha de consulta; ver ``data/SOURCES.md``).
Salida: ``packages/scene-schema/vehicle_classes.json`` (compartida por TS y Python).

Reglas, explícitas para que nadie confunda medición con supuesto:

* Si una clase tiene fichas con el dato, el rango es ``[min × margen_bajo, max × margen_alto]``
  y el típico es la mediana. Para la masa, el tope es el mayor entre ``max × 1.35`` y el mayor
  peso bruto vehicular (PBV) publicado: un vehículo cargado puede pesar hasta su PBV.
  Origen del campo: ``ficha`` (o ``secundaria`` si todas las filas son de fuente secundaria).
* Si una clase NO tiene fichas con el dato, se usa un valor de respaldo de ``SUPUESTOS`` y el
  campo queda marcado ``supuesto``. Si solo se conoce el PBV, la masa queda ``derivado_pbv``.
* ``velocidad_max_kmh`` nunca sale de una ficha: es un tope de plausibilidad del validador para
  detectar relatos físicamente imposibles. Está marcado ``supuesto`` en todas las clases.
"""

from __future__ import annotations

import json
import statistics
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[1]
MODELS_PATH = DATA_DIR / "vehicles" / "models_raw.json"
OUT_PATH = DATA_DIR.parent / "packages" / "scene-schema" / "vehicle_classes.json"

CLASES = [
    "sedan_compacto",
    "sedan_mediano",
    "hatchback",
    "suv_compacta",
    "suv_grande",
    "pickup",
    "van",
    "microbus_combi",
    "autobus",
    "camion_unitario",
    "tractocamion",
    "motocicleta",
    "bicicleta",
    "scooter",
]

MARGEN_MASA = (0.75, 1.35)
MARGEN_DIM = (0.90, 1.10)

# Campo de salida → (campo de entrada, factor de conversión a la unidad de salida).
CAMPOS = {
    "masa_kg": ("masa_vacio_kg", 1.0),
    "largo_m": ("largo_mm", 0.001),
    "ancho_m": ("ancho_mm", 0.001),
    "alto_m": ("alto_mm", 0.001),
    "distancia_entre_ejes_m": ("distancia_entre_ejes_mm", 0.001),
}

# Topes de plausibilidad (km/h). Diseño del validador, no mediciones.
VELOCIDAD_MAX_KMH = {
    "sedan_compacto": 220,
    "sedan_mediano": 240,
    "hatchback": 220,
    "suv_compacta": 210,
    "suv_grande": 210,
    "pickup": 200,
    "van": 180,
    "microbus_combi": 150,
    "autobus": 120,
    "camion_unitario": 130,
    "tractocamion": 130,
    "motocicleta": 230,
    "bicicleta": 70,
    "scooter": 120,
}

# Respaldo para clases sin fichas suficientes. Rangos deliberadamente amplios; cada uso queda
# marcado como "supuesto" en la tabla y se documenta en data/SOURCES.md.
SUPUESTOS: dict[str, dict[str, tuple[float, float]]] = {
    "autobus": {
        "masa_kg": (8000, 16000),
        "largo_m": (9.0, 14.0),
        "ancho_m": (2.4, 2.6),
        "alto_m": (2.9, 3.6),
        "distancia_entre_ejes_m": (4.5, 7.0),
    },
    "tractocamion": {
        "masa_kg": (6000, 12000),
        "largo_m": (6.0, 9.0),
        "ancho_m": (2.3, 2.6),
        "alto_m": (3.3, 4.2),
        "distancia_entre_ejes_m": (4.0, 6.3),
    },
    "bicicleta": {
        "masa_kg": (8, 25),
        "largo_m": (1.6, 1.95),
        "ancho_m": (0.5, 0.75),
        "alto_m": (0.9, 1.25),
        "distancia_entre_ejes_m": (0.95, 1.2),
    },
    "scooter": {
        "masa_kg": (10, 150),
        "largo_m": (1.0, 2.0),
        "ancho_m": (0.4, 0.8),
        "alto_m": (0.9, 1.35),
        "distancia_entre_ejes_m": (0.8, 1.5),
    },
}


def _round(x: float, step: float) -> float:
    return round(round(x / step) * step, 6)


def _complete(model: dict[str, Any]) -> bool:
    return all(model.get(src) is not None for src, _ in CAMPOS.values())


def build_classes(
    models: list[dict[str, Any]],
    generated_at: str | None = None,
    clases_incluidas: list[str] | None = None,
) -> dict[str, Any]:
    """Devuelve el documento de la tabla de clases a partir de las filas de modelos."""
    clases: dict[str, Any] = {}
    for clase in clases_incluidas or CLASES:
        rows = [m for m in models if m.get("clase") == clase]
        entry: dict[str, Any] = {}
        origen: dict[str, str] = {}
        tipico: dict[str, float] = {}
        for out_key, (src_key, factor) in CAMPOS.items():
            vals = [float(m[src_key]) * factor for m in rows if m.get(src_key) is not None]
            step = 10 if out_key == "masa_kg" else 0.01
            if vals:
                lo_m, hi_m = MARGEN_MASA if out_key == "masa_kg" else MARGEN_DIM
                lo, hi = min(vals) * lo_m, max(vals) * hi_m
                if out_key == "masa_kg":
                    pbvs = [float(m["pbv_kg"]) for m in rows if m.get("pbv_kg") is not None]
                    if pbvs:
                        hi = max(hi, max(pbvs))
                tipos = {m.get("fuente_tipo") for m in rows if m.get(src_key) is not None}
                origen[out_key] = "ficha" if "oficial" in tipos else "secundaria"
                tipico[out_key] = _round(statistics.median(vals), step)
            else:
                fallback = SUPUESTOS.get(clase, {}).get(out_key)
                if fallback is None:
                    msg = f"Sin fichas ni respaldo para {clase}.{out_key}"
                    raise ValueError(msg)
                lo, hi = fallback
                if out_key == "masa_kg":
                    pbvs = [float(m["pbv_kg"]) for m in rows if m.get("pbv_kg") is not None]
                    if pbvs:
                        hi = max(hi, max(pbvs))
                        origen[out_key] = "derivado_pbv"
                    else:
                        origen[out_key] = "supuesto"
                else:
                    origen[out_key] = "supuesto"
                tipico[out_key] = _round((lo + hi) / 2, step)
            entry[out_key] = [_round(lo, step), _round(hi, step)]
        entry["velocidad_max_kmh"] = VELOCIDAD_MAX_KMH[clase]
        origen["velocidad_max_kmh"] = "supuesto"
        entry["tipico"] = tipico
        entry["origen"] = origen
        entry["n_modelos"] = len(rows)
        entry["n_modelos_completos"] = sum(1 for m in rows if _complete(m))
        entry["modelos"] = [
            f"{m.get('marca')} {m.get('modelo')} {m.get('anio') or ''}".strip() for m in rows
        ]
        clases[clase] = entry
    return {
        "_generado_por": (
            "uv run croquis-data vehicles build (data/croquis_data/vehicle_classes.py)"
        ),
        "_fuente": (
            "data/vehicles/models_raw.json — fichas técnicas de fabricantes; ver data/SOURCES.md"
        ),
        "_nota": (
            "Rangos de plausibilidad para el validador semántico, no especificaciones. "
            "'origen' indica por campo si sale de fichas ('ficha'/'secundaria'), si solo se conoce "
            "el PBV ('derivado_pbv') o si es un supuesto documentado ('supuesto'). "
            "velocidad_max_kmh es siempre un tope de diseño."
        ),
        "generado": generated_at or datetime.now(UTC).date().isoformat(),
        "clases": clases,
    }


def load_models(path: Path = MODELS_PATH) -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads(path.read_text(encoding="utf-8"))
    return data


def render(models_path: Path = MODELS_PATH) -> str:
    models = load_models(models_path)
    fecha = sorted({str(m.get("fecha_consulta")) for m in models if m.get("fecha_consulta")})
    doc = build_classes(models, generated_at=fecha[-1] if fecha else None)
    return json.dumps(doc, indent=2, ensure_ascii=False) + "\n"


def write(out_path: Path = OUT_PATH, models_path: Path = MODELS_PATH) -> Path:
    out_path.write_text(render(models_path), encoding="utf-8", newline="\n")
    return out_path


def check(out_path: Path = OUT_PATH, models_path: Path = MODELS_PATH) -> bool:
    current = (
        out_path.read_text(encoding="utf-8").replace("\r\n", "\n") if out_path.exists() else ""
    )
    return current == render(models_path)
