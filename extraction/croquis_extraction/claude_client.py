"""Extracción con Claude (PLAN §5.1, paso 2): del relato redactado a hechos con cita.

Claude no produce la EscenaSpec completa ni geometría: produce hechos (`campo`, `valor`, `cita`)
con salida estructurada contra un esquema pequeño, y el mismo constructor determinista de la línea
base (`spec_builder`) los convierte en EscenaSpec. Así la comparación de E1 es justa y el modelo no
toca números físicos.

Modos (`CROQUIS_LLM_MODO`):

* `replay` (por omisión; el único que usa CI): lee la respuesta grabada en
  `extraction/grabaciones/<modelo>/<clave>.json`. Si no existe o el relato cambió, falla.
* `record`: llama a la API, guarda la respuesta y descuenta el gasto del tope diario.
* `live`: llama a la API sin grabar (la página del relato con llave configurada).

Tope de gasto: `CROQUIS_LLM_DAILY_BUDGET_USD` (PLAN §16.4); el gasto por día se lleva en
`extraction/grabaciones/gasto.json`. Precios por millón de tokens según la tabla oficial vigente
(registrada en docs/adr/0009-relato.md).
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import time
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from typing import Any

from croquis_extraction.facts import Fact, Facts
from croquis_extraction.glossary import glossary_version
from croquis_extraction.text import load_json

ROOT = Path(__file__).resolve().parents[2]
RECORDINGS = ROOT / "extraction" / "grabaciones"
LEDGER = RECORDINGS / "gasto.json"
PROMPT_FILE = ROOT / "extraction" / "prompts" / "extraccion_v1.md"
PROMPT_VERSION = "extraccion_v1"
SCHEMA_FILE = ROOT / "packages" / "scene-schema" / "escena.schema.json"
DEFAULT_MODEL = "claude-sonnet-5-5"
MODELS = ("claude-sonnet-5-5", "claude-haiku-5-5")
DEFAULT_EFFORT = "medium"
MAX_TOKENS = 16000

# USD por millón de tokens: entrada, salida, escritura de caché (5 min) y lectura de caché.
PRICES: dict[str, dict[str, float]] = {
    "claude-sonnet-5-5": {"input": 2.0, "output": 10.0, "cache_write": 2.5, "cache_read": 0.2},
    "claude-haiku-5-5": {"input": 0.1, "output": 0.5, "cache_write": 0.125, "cache_read": 0.01},
    # Modelos a los que puede caer la respaldo de rechazos del servidor (fallbacks="default").
    "claude-opus-5-5": {"input": 4.0, "output": 20.0, "cache_write": 5.0, "cache_read": 0.2},
}
# Haiku 5.5 cobra más por encima de 100 000 tokens de entrada.
HAIKU_LONG = {"input": 0.5, "output": 2.5, "cache_write": 0.625, "cache_read": 0.05}

SCALAR_CAMPOS = (
    "lugar.tipo_via",
    "lugar.superficie",
    "lugar.estado_superficie",
    "lugar.carriles_por_sentido",
    "entorno.clima",
    "entorno.iluminacion",
    "evento.tipo",
    "evento.objeto",
    "evidencias.marcas_m",
    "evidencias.distancia_proyeccion_m",
)
VEHICLE_CAMPOS = (
    "vehiculo.clase",
    "vehiculo.maniobra",
    "vehiculo.velocidad_kmh",
    "vehiculo.frenado",
    "vehiculo.color",
    "vehiculo.zona_impacto",
)
PERSON_CAMPOS = ("persona.cinturon", "persona.casco")
CAMPOS = SCALAR_CAMPOS + VEHICLE_CAMPOS + PERSON_CAMPOS
NUMERIC_CAMPOS = {
    "lugar.carriles_por_sentido",
    "evidencias.marcas_m",
    "evidencias.distancia_proyeccion_m",
    "vehiculo.velocidad_kmh",
}
BOOL_CAMPOS = {"vehiculo.frenado", "persona.cinturon", "persona.casco"}
EVENT_TYPES = (
    "impacto_vehiculo_vehiculo",
    "impacto_vehiculo_objeto",
    "impacto_vehiculo_persona",
    "volcadura",
    "derrape",
    "inicio_frenado",
    "arrastre",
)


class LLMError(RuntimeError):
    """La extracción con Claude no pudo completarse (sin grabación, rechazo, tope de gasto…)."""


class BudgetExceededError(LLMError):
    pass


@cache
def _schema_enum(defname: str, prop: str = "valor") -> tuple[str, ...]:
    s = json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))
    return tuple(s["$defs"][defname]["properties"][prop]["enum"])


@cache
def allowed_values() -> dict[str, tuple[str, ...]]:
    """Valores válidos por campo: los del contrato más los genéricos que acepta el constructor."""
    return {
        "lugar.tipo_via": (*_schema_enum("CampoTipoVia"), "interseccion"),
        "lugar.superficie": _schema_enum("CampoSuperficie"),
        "lugar.estado_superficie": _schema_enum("CampoEstadoSuperficie"),
        "entorno.clima": (*_schema_enum("CampoClima"), "lluvia"),
        "entorno.iluminacion": (*_schema_enum("CampoIluminacion"), "noche"),
        "evento.tipo": EVENT_TYPES,
        "evento.objeto": _schema_enum("ObjetoEntorno", "tipo"),
        "vehiculo.clase": (*_schema_enum("CampoClaseVehiculo"), "suv_o_pickup", "camion_o_autobus"),
        "vehiculo.maniobra": (*_schema_enum("CampoManiobra"), "cambio_carril"),
        "vehiculo.zona_impacto": _schema_enum("ZonaCDC", "lado"),
        "persona.rol": _schema_enum("CampoRolPersona"),
        "dispositivo.tipo": _schema_enum("Dispositivo", "tipo"),
    }


def output_schema() -> dict[str, Any]:
    """Esquema de la salida estructurada; sin uniones: lo opcional es una lista que puede faltar."""
    av = allowed_values()
    return {
        "type": "object",
        "properties": {
            "vehiculos": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"narrador": {"type": "boolean"}},
                    "required": ["narrador"],
                    "additionalProperties": False,
                },
            },
            "personas": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "rol": {"type": "string", "enum": list(av["persona.rol"])},
                        "cita": {"type": "string"},
                        "vehiculo": {"type": "integer"},
                    },
                    "required": ["rol", "cita", "vehiculo"],
                    "additionalProperties": False,
                },
            },
            "hechos": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "campo": {"type": "string", "enum": list(CAMPOS)},
                        "vehiculo": {"type": "integer"},
                        "persona": {"type": "integer"},
                        "valor": {"type": "string"},
                        "cita": {"type": "string"},
                    },
                    "required": ["campo", "vehiculo", "persona", "valor", "cita"],
                    "additionalProperties": False,
                },
            },
            "dispositivos": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "tipo": {"type": "string", "enum": list(av["dispositivo.tipo"])},
                        "cita": {"type": "string"},
                    },
                    "required": ["tipo", "cita"],
                    "additionalProperties": False,
                },
            },
            "preguntas": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["vehiculos", "personas", "hechos", "dispositivos", "preguntas"],
        "additionalProperties": False,
    }


def _values_doc() -> str:
    av = allowed_values()
    lines = ["Valores por campo (`valor` va como texto):"]
    for campo in CAMPOS:
        if campo in NUMERIC_CAMPOS:
            lines.append(f"- {campo}: número")
        elif campo in BOOL_CAMPOS:
            lines.append(f"- {campo}: true o false")
        elif campo == "vehiculo.color":
            lines.append(f"- {campo}: el color como lo dice el relato, en minúsculas y sin acento")
        else:
            lines.append(f"- {campo}: {', '.join(av[campo])}")
    lines.append(
        "En `hechos`, `vehiculo` es el índice del vehículo para los campos `vehiculo.*` y -1 para "
        "los demás; `persona` es el índice de la persona para `persona.*` y -1 para los demás. "
        "En `personas`, `vehiculo` es el índice del vehículo en que iba o -1."
    )
    return "\n".join(lines)


@cache
def system_prompt() -> str:
    """Prompt de sistema estable (se cachea): instrucciones, valores válidos y glosario."""
    lines: list[str] = []
    for e in load_json("glosario.json")["entradas"]:
        effects = ", ".join(f"{x['campo']}={x['valor']}" for x in e["efectos"])
        lines.append(f"- {e['significado']}" + (f" → {effects}" if effects else ""))
    gl = "\n".join(lines)
    base = PROMPT_FILE.read_text(encoding="utf-8").replace("{GLOSARIO}", gl)
    return base + "\n\n" + _values_doc() + "\n"


def prompt_fingerprint() -> str:
    """Huella del prompt y del esquema: una grabación solo vale para la misma huella."""
    payload = system_prompt() + json.dumps(output_schema(), sort_keys=True) + glossary_version()
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def cost_usd(model: str, usage: dict[str, int]) -> float:
    """Costo de una respuesta a partir de su `usage` (tokens) y la tabla de precios."""
    p = PRICES.get(model)
    if p is None:
        msg = f"Sin precio registrado para {model}"
        raise LLMError(msg)
    inp = usage.get("input_tokens", 0)
    cw = usage.get("cache_creation_input_tokens", 0)
    cr = usage.get("cache_read_input_tokens", 0)
    if model == "claude-haiku-5-5" and inp + cw + cr > 100_000:
        p = HAIKU_LONG
    total = (
        inp * p["input"]
        + usage.get("output_tokens", 0) * p["output"]
        + cw * p["cache_write"]
        + cr * p["cache_read"]
    )
    return round(total / 1e6, 8)


# --- Conversión de la salida a hechos -----------------------------------------------------------


def _str_list() -> list[str]:
    return []


@dataclass
class Conversion:
    citas: int = 0
    sin_cita_literal: int = 0  # la cita no aparece en el relato: el hecho baja a supuesto
    valores_invalidos: int = 0  # valor fuera de los permitidos o índice inexistente: se descarta
    preguntas: list[str] = field(default_factory=_str_list)


def _parse_value(campo: str, raw: str) -> Any:
    s = raw.strip().lower()
    if campo in NUMERIC_CAMPOS:
        m = re.search(r"-?\d+(?:[.,]\d+)?", s)
        if not m:
            return None
        v = float(m.group(0).replace(",", "."))
        return int(v) if campo == "lugar.carriles_por_sentido" else v
    if campo in BOOL_CAMPOS:
        return {"true": True, "si": True, "sí": True, "false": False, "no": False}.get(s)
    if campo == "vehiculo.color":
        return s or None
    canon = {v.lower(): v for v in allowed_values()[campo]}
    return canon.get(s)


def facts_from_output(out: dict[str, Any], text: str) -> tuple[Facts, Conversion]:
    """Hechos a partir de la salida de Claude; las citas que no están literal bajan a supuesto."""
    conv = Conversion(preguntas=[str(q) for q in out.get("preguntas", [])][:3])
    f = Facts()

    def fact(valor: Any, cita: str) -> Fact:
        conv.citas += 1
        if cita and cita in text:
            return Fact(valor, cita, "relato")
        conv.sin_cita_literal += 1
        return Fact(valor, None, "supuesto")

    for i, v in enumerate(out.get("vehiculos", [])):
        f.vehiculos.append({})
        if v.get("narrador") and f.narrador_vehiculo is None:
            f.narrador_vehiculo = i
    roles = set(allowed_values()["persona.rol"])
    for p in out.get("personas", []):
        if p.get("rol") not in roles:
            conv.valores_invalidos += 1
            continue
        d: dict[str, Fact] = {"rol": fact(p["rol"], str(p.get("cita", "")))}
        k = int(p.get("vehiculo", -1))
        if 0 <= k < len(f.vehiculos):
            d["vehiculo"] = Fact(k, None, "supuesto")
        f.personas.append(d)
    disp = set(allowed_values()["dispositivo.tipo"])
    for d in out.get("dispositivos", []):
        if d.get("tipo") in disp and all(x.valor != d["tipo"] for x in f.dispositivos):
            f.dispositivos.append(fact(d["tipo"], str(d.get("cita", ""))))
    for h in out.get("hechos", []):
        campo = str(h.get("campo", ""))
        if campo not in CAMPOS:
            conv.valores_invalidos += 1
            continue
        valor = _parse_value(campo, str(h.get("valor", "")))
        if valor is None:
            conv.valores_invalidos += 1
            continue
        cita = str(h.get("cita", ""))
        if campo in SCALAR_CAMPOS:
            if campo not in f.escalares:
                f.escalares[campo] = fact(valor, cita)
            continue
        if campo in VEHICLE_CAMPOS:
            k = int(h.get("vehiculo", -1))
            if not 0 <= k < len(f.vehiculos):
                conv.valores_invalidos += 1
                continue
            key = campo.split(".", 1)[1]
            if key == "zona_impacto":
                if k not in f.zonas:
                    f.zonas[k] = fact(valor, cita)
            elif key not in f.vehiculos[k]:
                f.vehiculos[k][key] = fact(valor, cita)
            continue
        k = int(h.get("persona", -1))
        if not 0 <= k < len(f.personas):
            conv.valores_invalidos += 1
            continue
        key = campo.split(".", 1)[1]
        if key not in f.personas[k]:
            f.personas[k][key] = fact(valor, cita)
    return f, conv


# --- Llamada, grabación y reproducción ----------------------------------------------------------


# Lo que se usa del SDK: `anthropic.Anthropic` (messages.create y beta.messages.create). Las
# pruebas inyectan un doble con la misma forma.
type ClientLike = Any


def _text_sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def recording_path(model: str, key: str, root: Path = RECORDINGS) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", key):
        msg = f"Clave de grabación inválida: {key!r}"
        raise LLMError(msg)
    return root / model / f"{key}.json"


def load_recording(model: str, key: str, text: str, root: Path = RECORDINGS) -> dict[str, Any]:
    path = recording_path(model, key, root)
    if not path.exists():
        msg = (
            f"Sin respuesta grabada para {model}/{key} (requiere ANTHROPIC_API_KEY y modo record)."
        )
        raise LLMError(msg)
    rec: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    if rec.get("texto_sha256") != _text_sha(text):
        msg = f"La grabación {model}/{key} es de otro texto; vuelve a grabarla."
        raise LLMError(msg)
    if rec.get("huella_prompt") != prompt_fingerprint():
        msg = f"La grabación {model}/{key} es de otra versión del prompt o del esquema."
        raise LLMError(msg)
    return rec


def _spent_today(ledger: Path) -> float:
    if not ledger.exists():
        return 0.0
    data = json.loads(ledger.read_text(encoding="utf-8"))
    return float(data.get(dt.date.today().isoformat(), 0.0))


def _charge(ledger: Path, usd: float) -> None:
    data: dict[str, float] = (
        json.loads(ledger.read_text(encoding="utf-8")) if ledger.exists() else {}
    )
    today = dt.date.today().isoformat()
    data[today] = round(data.get(today, 0.0) + usd, 8)
    ledger.parent.mkdir(parents=True, exist_ok=True)
    ledger.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def budget_usd() -> float:
    return float(os.environ.get("CROQUIS_LLM_DAILY_BUDGET_USD", "0") or 0)


def call_claude(
    client: ClientLike, text: str, model: str = DEFAULT_MODEL, effort: str = DEFAULT_EFFORT
) -> dict[str, Any]:
    """Una petición a la API con salida estructurada; devuelve el registro (sin escribirlo)."""
    if model not in PRICES:
        msg = f"Modelo no soportado: {model}"
        raise LLMError(msg)
    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": [
            {"type": "text", "text": system_prompt(), "cache_control": {"type": "ephemeral"}}
        ],
        "messages": [{"role": "user", "content": f"Relato:\n\n{text}"}],
        "output_config": {
            "effort": effort,
            "format": {"type": "json_schema", "schema": output_schema()},
        },
    }
    t0 = time.perf_counter()
    if model == "claude-sonnet-5-5":
        # Respaldo del servidor si los clasificadores declinan (el servidor elige el modelo).
        resp = client.beta.messages.create(
            **kwargs, betas=["server-side-fallback-2026-07-01"], fallbacks="default"
        )
    else:
        resp = client.messages.create(**kwargs)
    latency_ms = (time.perf_counter() - t0) * 1000
    if resp.stop_reason == "refusal":
        msg = f"El modelo declinó la petición ({getattr(resp, 'stop_details', None)})."
        raise LLMError(msg)
    if resp.stop_reason == "max_tokens":
        msg = "La respuesta se truncó en max_tokens."
        raise LLMError(msg)
    body = next((b.text for b in resp.content if b.type == "text"), "")
    salida: dict[str, Any] = json.loads(body)
    u = resp.usage
    usage = {
        "input_tokens": int(u.input_tokens or 0),
        "output_tokens": int(u.output_tokens or 0),
        "cache_creation_input_tokens": int(getattr(u, "cache_creation_input_tokens", 0) or 0),
        "cache_read_input_tokens": int(getattr(u, "cache_read_input_tokens", 0) or 0),
    }
    served = str(resp.model)
    return {
        "modelo": model,
        "modelo_respuesta": served,
        "prompt": PROMPT_VERSION,
        "huella_prompt": prompt_fingerprint(),
        "esfuerzo": effort,
        "texto_sha256": _text_sha(text),
        "salida": salida,
        "usage": usage,
        "latencia_ms": round(latency_ms, 1),
        # Si el respaldo sirvió con un modelo sin precio registrado, se estima con el pedido.
        "costo_usd": cost_usd(served if served in PRICES else model, usage),
        "costo_estimado_con": served if served in PRICES else model,
        "request_id": getattr(resp, "_request_id", None),
        "grabado": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
    }


def extract(
    text: str,
    key: str,
    model: str = DEFAULT_MODEL,
    *,
    mode: str | None = None,
    client: ClientLike | None = None,
    root: Path = RECORDINGS,
    effort: str = DEFAULT_EFFORT,
) -> dict[str, Any]:
    """Registro de extracción para `text` (ya redactado) según el modo; ver el docstring."""
    mode = mode or os.environ.get("CROQUIS_LLM_MODO", "replay")
    if mode == "replay":
        return load_recording(model, key, text, root)
    if mode not in ("record", "live"):
        msg = f"Modo desconocido: {mode}"
        raise LLMError(msg)
    ledger = root / LEDGER.name
    cap = budget_usd()
    if cap <= 0 or _spent_today(ledger) >= cap:
        msg = (
            f"Tope de gasto diario alcanzado o sin configurar (CROQUIS_LLM_DAILY_BUDGET_USD={cap})."
        )
        raise BudgetExceededError(msg)
    if client is None:
        import anthropic

        client = anthropic.Anthropic()
    rec = call_claude(client, text, model, effort)
    _charge(ledger, float(rec["costo_usd"]))
    if mode == "record":
        path = recording_path(model, key, root)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(rec, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    return rec
