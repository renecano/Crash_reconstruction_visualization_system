"""Escenas de hipótesis de los conductores como agentes (R12a, ADR 0088).

Cada una es una escena canónica con `conductor` en algún vehículo. Se escriben en
``packages/scene-schema/fixtures/agentes/`` y sus resultados (el bloque `agentes`) los compara el
port TS en la prueba de paridad.

* ``alcance_frena_antes``: la escena `alcance`, con A frenando 0.5 s antes de lo que reconstruye la
  evidencia («¿y si A frenaba 0.5 s antes?»).
* ``alcance_volantea``: la misma escena, con A volanteando a la izquierda en vez de frenar.
* ``carambola_cadena``: la `carambola` con B y C en movimiento a 40 km/h en el mismo carril. C frena
  (lo dice el perito), B reacciona a C y A reacciona a B: la reacción en cadena.

    uv run croquis-solver agent-fixtures
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from croquis_scene_schema import FIXTURES_DIR, load_fixture, schema_errors

JsonObj = dict[str, Any]
AGENTS_DIR = FIXTURES_DIR / "agentes"
FUENTE = "usuario"  # la persona que usa Croquis: el perito que prueba la hipótesis


def _segundos(valor: float, nota: str | None = None) -> JsonObj:
    out: JsonObj = {"valor": valor, "unidad": "s", "fuente": FUENTE, "confianza": 0.9}
    if nota:
        out["nota"] = nota
    return out


def _decision(valor: str) -> JsonObj:
    return {"valor": valor, "fuente": FUENTE, "confianza": 0.9}


def _meta(spec: JsonObj, sufijo: str, titulo: str) -> None:
    spec["meta"]["id"] = f"{spec['meta']['id']}-{sufijo}"
    spec["meta"]["titulo"] = titulo


def alcance_frena_antes() -> JsonObj:
    spec = copy.deepcopy(load_fixture("alcance"))
    _meta(spec, "frena-antes", "Hipótesis: A frena 0.5 s antes (alcance)")
    a = next(v for v in spec["vehiculos"] if v["id"] == "veh-a")
    # La reconstrucción de `alcance` empieza a frenar en t = −0.650752 s.
    a["conductor"] = {
        "decision": _decision("frenar"),
        "instante_decision": _segundos(-1.150752, "0.5 s antes que la reconstrucción"),
    }
    return spec


def alcance_volantea() -> JsonObj:
    spec = copy.deepcopy(load_fixture("alcance"))
    _meta(spec, "volantea", "Hipótesis: A volantea a la izquierda en vez de frenar (alcance)")
    a = next(v for v in spec["vehiculos"] if v["id"] == "veh-a")
    a["conductor"] = {"decision": _decision("volantear_izquierda")}
    return spec


def carambola_cadena() -> JsonObj:
    spec = copy.deepcopy(load_fixture("carambola"))
    _meta(spec, "cadena", "Hipótesis: C frena y B y A reaccionan en cadena (carambola)")
    # Solo el impacto de A contra B: en movimiento, B y C no se tocan en la reconstrucción.
    spec["eventos"] = [
        e for e in spec["eventos"] if e["tipo"] in ("impacto_vehiculo_vehiculo", "reposo")
    ]
    spec["evidencias"] = [e for e in spec["evidencias"] if e.get("tipo") != "marcas_frenado"]
    for v in spec["vehiculos"]:
        if v["id"] == "veh-a":
            v.pop("frenado", None)
            v["conductor"] = {}
        else:
            v["maniobra"] = {"valor": "recto", "fuente": FUENTE, "confianza": 0.9}
            v["velocidad_previa"] = {
                "valor": 40,
                "unidad": "km/h",
                "fuente": FUENTE,
                "confianza": 0.9,
            }
        if v["id"] == "veh-b":
            v["conductor"] = {}
        if v["id"] == "veh-c":
            v["posicion_inicial"]["x"] = -14.0
            v["posicion_inicial"]["procedencia"] = {
                "fuente": FUENTE,
                "confianza": 0.9,
                "nota": "Delante de B en el mismo carril, con unos 15 m de separación.",
            }
            v["conductor"] = {
                "decision": _decision("frenar"),
                "instante_decision": _segundos(-2.5, "C frena de golpe"),
            }
    return spec


FIXTURES = {
    "alcance_frena_antes": alcance_frena_antes,
    "alcance_volantea": alcance_volantea,
    "carambola_cadena": carambola_cadena,
}


def write_all(directory: Path = AGENTS_DIR) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    for name, build in FIXTURES.items():
        spec = build()
        errors = schema_errors(spec)
        if errors:
            msg = f"La escena {name} no cumple el contrato: {errors[:3]}"
            raise ValueError(msg)
        path = directory / f"{name}.json"
        text = json.dumps(spec, ensure_ascii=False, indent=2) + "\n"
        path.write_text(text, encoding="utf-8", newline="\n")
        out.append(path)
    return out
