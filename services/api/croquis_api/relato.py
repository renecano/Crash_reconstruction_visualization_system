"""Rutas del relato (PLAN §5.1): extracción, preguntas, respuestas y reconstrucción.

El navegador redacta los datos personales antes de enviar el relato (`@croquis/relato`); aquí se
vuelve a redactar como defensa en profundidad. La extracción usa Claude solo si hay llave y queda
presupuesto del día (con límite de peticiones por hora); si no, la línea base de reglas. En las dos
rutas el mismo constructor produce la EscenaSpec y el verificador revisa la evidencia.
"""

from __future__ import annotations

import hashlib
import threading
import time
from collections import deque
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from croquis_api.settings import get_settings
from croquis_extraction import baseline, questions
from croquis_extraction.claude_client import LLMError, extract, facts_from_output
from croquis_extraction.glossary import find_terms
from croquis_extraction.pii import redact
from croquis_extraction.spec_builder import build_spec
from croquis_extraction.verify import verify_spec
from croquis_scene_schema import schema_errors
from croquis_solver.reconstruct import reconstruct

router = APIRouter()
MAX_TEXT = 5000

JsonObj = dict[str, Any]


class RateLimiter:
    """Ventana deslizante de una hora por cliente (en memoria: un solo proceso)."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] > 3600:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True


limiter = RateLimiter()


class ExtraerIn(BaseModel):
    texto: str = Field(min_length=1, max_length=MAX_TEXT, description="Relato ya redactado")
    metodo: Literal["auto", "reglas", "claude"] = "auto"


class Termino(BaseModel):
    id: str
    texto: str
    inicio: int
    fin: int
    ambiguo: bool
    pregunta: str | None


class Verificador(BaseModel):
    revisados: int
    corregidos: int
    degradados: int


class ExtraerOut(BaseModel):
    spec: JsonObj
    texto: str
    metodo: Literal["reglas", "claude"]
    motivo: str | None = None
    redacciones_servidor: int
    verificador: Verificador
    glosario: list[Termino]
    preguntas: list[JsonObj]


class ResponderIn(BaseModel):
    spec: JsonObj
    texto: str | None = Field(default=None, max_length=MAX_TEXT)
    respuestas: dict[str, Any] = Field(default_factory=dict)
    contestadas: list[str] = Field(default_factory=list)


class ResponderOut(BaseModel):
    spec: JsonObj
    aplicadas: list[str]
    preguntas: list[JsonObj]


class ReconstruirIn(BaseModel):
    spec: JsonObj


def _valid(spec: JsonObj) -> None:
    errs = schema_errors(spec)
    if errs:
        raise HTTPException(status_code=422, detail={"esquema": errs[:10]})


def _claude_spec(text: str, spec_id: str) -> JsonObj:
    import anthropic

    settings = get_settings()
    rec = extract(
        text,
        spec_id,
        settings.croquis_llm_model,
        mode="live",
        client=anthropic.Anthropic(api_key=settings.anthropic_api_key),
        budget=settings.croquis_llm_daily_budget_usd,
    )
    facts, _ = facts_from_output(rec["salida"], text)
    return build_spec(facts, text, spec_id=spec_id, origen="escrito", sintetico=False)


@router.post("/relato/extraer", response_model=ExtraerOut)
def extraer(body: ExtraerIn, request: Request) -> ExtraerOut:
    red = redact(body.texto)
    text = red.text
    spec_id = "relato-" + hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
    settings = get_settings()
    metodo: Literal["reglas", "claude"] = "reglas"
    motivo: str | None = None
    spec: JsonObj | None = None
    wants_claude = body.metodo == "claude" or (body.metodo == "auto" and settings.llm_enabled)
    if wants_claude and not settings.llm_enabled:
        motivo = "Claude no está configurado en este servidor; se usó la línea base de reglas."
    elif wants_claude:
        client = request.client.host if request.client else "anon"
        if not limiter.allow(client, settings.croquis_llm_rate_limit_per_hour):
            motivo = "Límite de peticiones por hora alcanzado; se usó la línea base de reglas."
        else:
            try:
                spec = _claude_spec(text, spec_id)
                metodo = "claude"
            except LLMError as e:
                motivo = f"Claude no respondió ({e}); se usó la línea base de reglas."
    if spec is None:
        spec = baseline.extract_spec(text, spec_id)
    spec, stats = verify_spec(spec, text)
    terms = [
        Termino(
            id=t.id,
            texto=t.texto,
            inicio=t.start,
            fin=t.end,
            ambiguo=t.ambiguo,
            pregunta=t.pregunta,
        )
        for t in find_terms(text)
    ]
    return ExtraerOut(
        spec=spec,
        texto=text,
        metodo=metodo,
        motivo=motivo,
        redacciones_servidor=len(red.spans),
        verificador=Verificador(
            revisados=stats.revisados, corregidos=stats.corregidos, degradados=stats.degradados
        ),
        glosario=terms,
        preguntas=[p.to_dict() for p in questions.ask(spec, text)],
    )


@router.post("/relato/responder", response_model=ResponderOut)
def responder(body: ResponderIn) -> ResponderOut:
    _valid(body.spec)
    text = redact(body.texto).text if body.texto else None
    spec, aplicadas = questions.apply_answers(body.spec, body.respuestas)
    _valid(spec)
    answered = frozenset(body.contestadas) | frozenset(body.respuestas)
    return ResponderOut(
        spec=spec,
        aplicadas=aplicadas,
        preguntas=[p.to_dict() for p in questions.ask(spec, text, answered=answered)],
    )


@router.post("/reconstruir")
def reconstruir(body: ReconstruirIn) -> JsonObj:
    _valid(body.spec)
    try:
        return reconstruct(body.spec).to_dict()
    except (ValueError, KeyError, ArithmeticError) as e:
        raise HTTPException(status_code=422, detail=f"La escena no se pudo reconstruir: {e}") from e
