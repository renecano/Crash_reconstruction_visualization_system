"""E1: extracción del relato (PLAN §8 y §5.3) sobre Relatos-MX.

Métodos: línea base de reglas (siempre) y Claude Haiku 5.5 y Sonnet 5.5 desde respuestas grabadas
(`packages/extraction/grabaciones/<modelo>/<id>.json`, ver `croquis_extraction.claude_client`); sin
grabaciones, esas columnas quedan pendientes (requieren `ANTHROPIC_API_KEY`, ver docs/PROGRESS.md).
CI nunca llama a la API. Las dos rutas terminan en el mismo constructor de EscenaSpec.

Por método: F1 por campo y micro/macro, error en numéricos, número de vehículos, alucinación de
campo antes y después del verificador, diferencia contrafactual, costo por 1 000 relatos y latencia
p50/p95, repetición (el mismo relato otra vez: piso de ruido de la diferencia contrafactual) y
cobertura de preguntas útiles (qué parte de los errores de extracción en velocidad,
maniobra, frenado, clase y estado del piso cubre la ronda de preguntas, y qué parte de las
preguntas no es redundante: una pregunta es redundante si el relato ya lo dijo y la extracción lo
sacó bien). Además, para el redactor de PII (común a todos): datos
personales filtrados.
El test solo se evalúa congelado (PLAN §5.2).
"""

from __future__ import annotations

import time
from collections import Counter
from typing import Any

from croquis_eval.results import write_result
from croquis_extraction import baseline, questions, relatos_mx
from croquis_extraction.claude_client import (
    MODELS,
    LLMError,
    facts_from_output,
    load_recording,
)
from croquis_extraction.evaluate import (
    Score,
    counterfactual_diff,
    error_topics,
    hallucinated_fields,
    pii_leaks,
    score_story,
    settled_topics,
)
from croquis_extraction.facts import Facts, facts_from_annotation, facts_from_spec
from croquis_extraction.pii import redact
from croquis_extraction.spec_builder import build_spec
from croquis_extraction.verify import verify_spec


def _pctl(xs: list[float], p: float) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    return round(s[min(len(s) - 1, int(p * (len(s) - 1) + 0.5))], 2)


class _Run:
    """Lo que un método produce para un relato."""

    def __init__(
        self, spec: dict[str, Any], citas: int, sin_cita: int, latency: float, cost: float
    ):
        self.spec = spec
        self.citas = citas
        self.sin_cita = sin_cita
        self.latency = latency
        self.cost = cost


def _run(name: str, rid: str, text: str) -> _Run | None:
    if name == "reglas":
        t0 = time.perf_counter()
        spec: dict[str, Any] = baseline.extract_spec(text, rid)
        latency = (time.perf_counter() - t0) * 1000
        total, bad = hallucinated_fields(spec, text)
        return _Run(spec, total, bad, latency, 0.0)
    try:
        rec = load_recording(name, rid, text)
    except LLMError:
        return None
    facts, conv = facts_from_output(rec["salida"], text)
    spec = build_spec(facts, text, spec_id=rid, origen="escrito", sintetico=False)
    return _Run(
        spec,
        conv.citas,
        conv.sin_cita_literal,
        float(rec.get("latencia_ms", 0.0)),
        float(rec.get("costo_usd", 0.0)),
    )


def evaluate_method(
    name: str, items: list[dict[str, Any]], cfs: list[dict[str, Any]]
) -> dict[str, Any]:
    score = Score()
    score_verified = Score()
    citas = sin_cita = verified_down = 0
    latencies: list[float] = []
    cost = 0.0
    missing = 0
    preds: dict[str, Facts] = {}
    q_asked = q_redundant = err_total = err_covered = q_failed = 0
    for it in items:
        text = redact(it["texto"]).text
        ref = facts_from_annotation({**it["hechos"], "tipo": it["tipo"]})
        run = _run(name, it["id"], text)
        if run is None:
            missing += 1
            continue
        latencies.append(run.latency)
        cost += run.cost
        citas += run.citas
        sin_cita += run.sin_cita
        verified, vs = verify_spec(run.spec, text)
        verified_down += vs.degradados
        preds[it["id"]] = facts_from_spec(run.spec)
        score.merge(score_story(ref, preds[it["id"]]))
        score_verified.merge(score_story(ref, facts_from_spec(verified)))
        errs = error_topics(ref, preds[it["id"]], [v["id"] for v in run.spec["vehiculos"]])
        try:
            asked = {questions.topic(q.id) for q in questions.ask(run.spec, text, samples=4)}
        except ValueError, KeyError, ArithmeticError:
            asked: set[str] = set()
            q_failed += 1
        q_asked += len(asked)
        ids = [v["id"] for v in run.spec["vehiculos"]]
        q_redundant += len(asked & settled_topics(ref, preds[it["id"]], ids))
        err_total += len(errs)
        err_covered += len(errs & asked)
    evaluated = len(items) - missing
    if evaluated == 0:
        return {
            "estado": "pendiente",
            "motivo": "Sin respuestas grabadas: requiere ANTHROPIC_API_KEY (ver PROGRESS).",
        }
    diffs = pairs = 0
    for cf in cfs:
        base = preds.get(cf["base"])
        if base is None:
            continue
        run = _run(name, cf["id"], redact(cf["texto"]).text)
        if run is None:
            continue
        pairs += 1
        diffs += int(counterfactual_diff(base, facts_from_spec(run.spec)))
    # Piso de ruido: el mismo relato otra vez. Las reglas son deterministas; los modelos no
    # aceptan temperatura 0, así que parte de la diferencia contrafactual puede ser variación.
    rep_diffs = rep_pairs = 0
    for it in items:
        base = preds.get(it["id"])
        if base is None:
            continue
        text = redact(it["texto"]).text
        run = (
            _run(name, it["id"] + "-rep", text) if name != "reglas" else _run(name, it["id"], text)
        )
        if run is None:
            continue
        rep_pairs += 1
        rep_diffs += int(counterfactual_diff(base, facts_from_spec(run.spec)))
    return {
        "estado": "medido" if missing == 0 else "parcial",
        "relatos": evaluated,
        "sin_respuesta": missing,
        **score.report(),
        "con_verificador": {k: v for k, v in score_verified.report().items() if k != "por_campo"},
        "alucinacion_de_campo": {
            "citas": citas,
            "sin_cita_literal": sin_cita,
            "tasa": round(sin_cita / citas, 4) if citas else 0.0,
            # El constructor solo deja citas literales y el verificador lo comprueba.
            "degradados_por_verificador": verified_down,
            "tasa_tras_verificador": 0.0 if verified_down == 0 else None,
        },
        "contrafactual": {
            "pares": pairs,
            "con_diferencia": diffs,
            "tasa": round(diffs / pairs, 4) if pairs else None,
        },
        "repeticion": {
            "pares": rep_pairs,
            "con_diferencia": rep_diffs,
            "tasa": round(rep_diffs / rep_pairs, 4) if rep_pairs else None,
        },
        "preguntas": {
            "hechas": q_asked,
            "redundantes": q_redundant,
            "utiles": q_asked - q_redundant,
            "precision": round((q_asked - q_redundant) / q_asked, 4) if q_asked else None,
            "errores_preguntables": err_total,
            "errores_cubiertos": err_covered,
            "cobertura": round(err_covered / err_total, 4) if err_total else None,
            "rondas_fallidas": q_failed,
        },
        "latencia_ms": {"p50": _pctl(latencies, 0.5), "p95": _pctl(latencies, 0.95)},
        "costo_usd_por_1000": round(1000 * cost / evaluated, 4),
    }


def evaluate(split: str) -> dict[str, Any]:
    items = relatos_mx.load_split(split)
    cfs = [c for c in relatos_mx.load_split("contrafactuales") if c["split"] == split]
    pii_total = pii_leak = 0
    by_kind: Counter[str] = Counter()
    over = 0
    for it in items + cfs:
        red = redact(it["texto"])
        t, leak, kinds = pii_leaks(it["pii"], red.text)
        pii_total += t
        pii_leak += leak
        by_kind.update(kinds)
        truth = [(p["inicio"], p["fin"]) for p in it["pii"]]
        over += sum(1 for s in red.spans if not any(s.start < e and b < s.end for b, e in truth))
    methods = {"reglas": evaluate_method("reglas", items, cfs)}
    for m in MODELS:
        methods[m] = evaluate_method(m, items, cfs)
    return {
        "split": split,
        "relatos": len(items),
        "contrafactuales": len(cfs),
        "test_congelado": relatos_mx.frozen_hash(),
        "pii": {
            "datos_personales": pii_total,
            "filtrados": pii_leak,
            "tasa_fuga": round(pii_leak / pii_total, 4) if pii_total else None,
            "filtrados_por_tipo": dict(by_kind),
            "tramos_redactados_que_no_eran_pii": over,
        },
        "metodos": methods,
    }


def main(split: str = "test") -> str:
    if split == "test" and relatos_mx.frozen_hash() is None:
        msg = "El test no está congelado: congélalo antes de la primera evaluación (PLAN §5.2)."
        raise RuntimeError(msg)
    if split == "test" and relatos_mx.frozen_hash() != relatos_mx.split_hash():
        msg = "build/test.jsonl no coincide con test.lock."
        raise RuntimeError(msg)
    payload = {
        "descripcion": "E1: extracción del relato en Relatos-MX (línea base de reglas, Claude "
        "Haiku y Sonnet desde respuestas grabadas), fuga de PII del redactor y diferencia "
        "contrafactual.",
        **evaluate(split),
    }
    name = "e1_extraction" if split == "test" else f"e1_extraction_{split}"
    return str(write_result(name, payload))


__all__ = ["evaluate", "main"]
