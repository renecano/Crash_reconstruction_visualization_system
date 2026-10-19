"""E9 (PLAN §8, F11): usabilidad con personas reales.

Lee las sesiones que descarga `/e9` (`data/e9/sesiones/e9-P01.json`, …; protocolo en
``docs/e9/protocolo.md``) y reporta por participante y en conjunto:

- **tiempo hasta la primera reconstrucción** (s), desde que empieza la sesión hasta que la escena
  propia queda lista en el visor 3D;
- **correcciones**: movimientos en el croquis y rondas de preguntas contestadas;
- **SUS** (Brooke, 1996; traducción propia, no validada).

PLAN pide al menos 5 personas. Sin sesiones no escribe nada: E9 sigue pendiente.

Uso: ``uv run croquis-eval e9`` → ``eval/results/e9.json``.
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path
from typing import Any, cast

from croquis_eval.e5_casos import ROOT
from croquis_eval.results import write_result

SESSIONS_DIR = ROOT / "data" / "e9" / "sesiones"
MIN_PEOPLE = 5
EVENTS = {
    "relato_enviado",
    "preguntas_respondidas",
    "croquis_abierto",
    "correccion_croquis",
    "reconstruccion_visible",
}
KEYS = {"version", "participante", "inicio", "eventos", "sus", "terminada"}


class SessionError(ValueError):
    pass


def sus_score(answers: list[int]) -> float:
    """Impares r − 1, pares 5 − r, suma × 2.5 (0–100)."""
    if len(answers) != 10 or any(not 1 <= a <= 5 for a in answers):
        raise SessionError("El SUS necesita diez respuestas del 1 al 5")
    return sum((a - 1) if i % 2 == 0 else (5 - a) for i, a in enumerate(answers)) * 2.5


def load(path: Path) -> dict[str, Any]:
    """Una sesión, validada: solo métricas (nunca texto del relato), terminada y con SUS."""
    doc = cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
    extra = set(doc) - KEYS
    if extra:
        raise SessionError(f"{path.name}: campos inesperados {sorted(extra)}")
    if doc.get("version") != 1 or "terminada" not in doc or "sus" not in doc:
        raise SessionError(f"{path.name}: sesión sin terminar o de otra versión")
    for e in cast(list[dict[str, Any]], doc["eventos"]):
        if set(e) != {"tipo", "t"} or e["tipo"] not in EVENTS:
            raise SessionError(f"{path.name}: evento inválido {e}")
    return doc


def summarize_session(doc: dict[str, Any]) -> dict[str, Any]:
    """El mismo resumen que `resumenE9` en la web (`apps/web/src/lib/e9.ts`)."""
    events = cast(list[dict[str, Any]], doc["eventos"])
    first = next((e for e in events if e["tipo"] == "reconstruccion_visible"), None)
    seconds = round((first["t"] - doc["inicio"]) / 100) / 10 if first else None
    return {
        "participante": doc["participante"],
        "segundos_hasta_primera_reconstruccion": seconds,
        "correcciones_croquis": sum(e["tipo"] == "correccion_croquis" for e in events),
        "rondas_de_preguntas": sum(e["tipo"] == "preguntas_respondidas" for e in events),
        "sus": sus_score(cast(list[int], doc["sus"])),
    }


def build(sessions_dir: Path = SESSIONS_DIR) -> dict[str, Any]:
    paths = sorted(sessions_dir.glob("e9-P*.json"))
    if not paths:
        raise SessionError(
            f"No hay sesiones en {sessions_dir}: E9 sigue pendiente (docs/e9/protocolo.md)"
        )
    rows = [summarize_session(load(p)) for p in paths]
    ids = [r["participante"] for r in rows]
    if len(set(ids)) != len(ids):
        raise SessionError("Hay participantes repetidos")
    reached = [
        r["segundos_hasta_primera_reconstruccion"]
        for r in rows
        if r["segundos_hasta_primera_reconstruccion"] is not None
    ]
    sus = [r["sus"] for r in rows]
    return {
        "descripcion": "E9: usabilidad con personas reales (tiempo hasta la primera "
        "reconstrucción, correcciones y SUS), desde las sesiones de /e9.",
        "protocolo": "docs/e9/protocolo.md",
        "personas": len(rows),
        "minimo_plan": MIN_PEOPLE,
        "cumple_minimo": len(rows) >= MIN_PEOPLE,
        "llegaron_a_una_reconstruccion": len(reached),
        "segundos_hasta_primera_reconstruccion_mediana": (
            statistics.median(reached) if reached else None
        ),
        "correcciones_croquis_mediana": statistics.median(r["correcciones_croquis"] for r in rows),
        "rondas_de_preguntas_mediana": statistics.median(r["rondas_de_preguntas"] for r in rows),
        "sus_media": round(statistics.fmean(sus), 1),
        "sus_mediana": statistics.median(sus),
        "sus_nota": "Traducción propia del SUS de Brooke (1996), no validada.",
        "por_persona": rows,
    }


def main(sessions_dir: Path = SESSIONS_DIR, out_dir: Path | None = None) -> Path:
    payload = build(sessions_dir)
    if out_dir is None:
        return write_result("e9", payload)
    return write_result("e9", payload, results_dir=out_dir)
