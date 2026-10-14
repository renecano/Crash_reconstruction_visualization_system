"""E1: extracción del relato (PLAN §8 y §5.3) sobre Relatos-MX.

Métodos: línea base de reglas (siempre) y Claude Haiku 5.5 y Sonnet 5.5 desde respuestas grabadas
(`extraction/grabaciones/<modelo>/<id>.json`); sin grabaciones, esas columnas quedan pendientes
(requieren `ANTHROPIC_API_KEY`, ver docs/PROGRESS.md). CI nunca llama a la API.

Por método: F1 por campo y micro/macro, error en numéricos, número de vehículos, alucinación de
campo antes y después del verificador, diferencia contrafactual, costo por 1 000 relatos y latencia
p50/p95. Además, para el redactor de PII (común a todos): datos personales filtrados.
El test solo se evalúa congelado (PLAN §5.2).
"""

from __future__ import annotations

import json
import statistics
import time
from collections import Counter
from pathlib import Path
from typing import Any

from croquis_extraction import baseline, relatos_mx
from croquis_extraction.evaluate import (
    Score,
    counterfactual_diff,
    hallucinated_fields,
    pii_leaks,
    score_story,
)
from croquis_extraction.facts import facts_from_annotation, facts_from_spec
from croquis_extraction.pii import redact
from croquis_extraction.verify import verify_spec

from croquis_eval.results import write_result

RECORDINGS = Path(__file__).resolve().parents[2] / "extraction" / "grabaciones"
MODELS = ("claude-haiku-5-5", "claude-sonnet-5-5")


def _pctl(xs: list[float], p: float) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    return round(s[min(len(s) - 1, int(p * (len(s) - 1) + 0.5))], 2)


def _recorded(model: str, rid: str) -> dict[str, Any] | None:
    path = RECORDINGS / model / f"{rid}.json"
    if not path.exists():
        return None
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return data


def evaluate_method(
    name: str, items: list[dict[str, Any]], cfs: list[dict[str, Any]]
) -> dict[str, Any]:
    score = Score()
    score_verified = Score()
    halluc_total = halluc_bad = 0
    verified_down = 0
    latencies: list[float] = []
    cost = 0.0
    missing = 0
    preds: dict[str, Any] = {}
    for it in items:
        text = redact(it["texto"]).text
        ref = facts_from_annotation({**it["hechos"], "tipo": it["tipo"]})
        if name == "reglas":
            t0 = time.perf_counter()
            spec = baseline.extract_spec(text, it["id"])
            latencies.append((time.perf_counter() - t0) * 1000)
        else:
            rec = _recorded(name, it["id"])
            if rec is None:
                missing += 1
                continue
            spec = rec["spec"]
            latencies.append(float(rec.get("latencia_ms", 0.0)))
            cost += float(rec.get("costo_usd", 0.0))
        total, bad = hallucinated_fields(spec, text)
        halluc_total += total
        halluc_bad += bad
        verified, vs = verify_spec(spec, text)
        verified_down += vs.degradados
        preds[it["id"]] = facts_from_spec(spec)
        score.merge(score_story(ref, facts_from_spec(spec)))
        score_verified.merge(score_story(ref, facts_from_spec(verified)))
    evaluated = len(items) - missing
    if evaluated == 0:
        return {
            "estado": "pendiente",
            "motivo": "Sin respuestas grabadas: requiere ANTHROPIC_API_KEY (ver PROGRESS).",
        }
    diffs = 0
    pairs = 0
    for cf in cfs:
        base = preds.get(cf["base"])
        if base is None:
            continue
        text = redact(cf["texto"]).text
        if name == "reglas":
            variant = facts_from_spec(baseline.extract_spec(text, cf["id"]))
        else:
            rec = _recorded(name, cf["id"])
            if rec is None:
                continue
            variant = facts_from_spec(rec["spec"])
        pairs += 1
        diffs += int(counterfactual_diff(base, variant))
    return {
        "estado": "medido",
        "relatos": evaluated,
        "sin_respuesta": missing,
        **score.report(),
        "con_verificador": {k: v for k, v in score_verified.report().items() if k != "por_campo"},
        "alucinacion_de_campo": {
            "campos_relato": halluc_total,
            "sin_cita_literal": halluc_bad,
            "tasa": round(halluc_bad / halluc_total, 4) if halluc_total else 0.0,
            "tasa_tras_verificador": 0.0,
            "degradados_por_verificador": verified_down,
        },
        "contrafactual": {
            "pares": pairs,
            "con_diferencia": diffs,
            "tasa": round(diffs / pairs, 4) if pairs else None,
        },
        "latencia_ms": {"p50": _pctl(latencies, 0.5), "p95": _pctl(latencies, 0.95)},
        "costo_usd_por_1000": round(1000 * cost / evaluated, 4) if evaluated else None,
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
    if split == "test" and relatos_mx.frozen_hash() != relatos_mx.test_hash():
        msg = "build/test.jsonl no coincide con test.lock."
        raise RuntimeError(msg)
    payload = {
        "descripcion": "E1: extracción del relato en Relatos-MX (línea base de reglas, Claude Haiku "
        "y Sonnet desde respuestas grabadas), fuga de PII del redactor y diferencia contrafactual.",
        **evaluate(split),
    }
    name = "e1_extraction" if split == "test" else f"e1_extraction_{split}"
    return str(write_result(name, payload))


__all__ = ["evaluate", "main"]
_ = statistics
