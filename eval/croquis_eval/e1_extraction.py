"""E1: extracción del relato (PLAN §8 y §5.3) sobre Relatos-MX.

Mide el pipeline de producción, que es el de TypeScript (`packages/extraction`, se despliega en
Vercel): `pnpm --filter @croquis/extraction exec tsx scripts/e1-predict.ts` corre la redacción en
el dispositivo, la extracción (reglas y respuestas grabadas de Claude Haiku y Sonnet), el
constructor, el verificador y la ronda de preguntas, y este módulo solo puntúa. Con
`--pipeline py` se puntúa la referencia Python con el mismo código, para comparar; la paridad entre
ambas se prueba además con las salidas doradas de `croquis-extraction golden`.

Métodos: línea base de reglas y Claude Haiku 5.5 y Sonnet 5.5 desde respuestas grabadas
(`packages/extraction/grabaciones/<modelo>/<id>.json`); sin grabaciones, esas columnas quedan
pendientes. CI nunca llama a la API.

Por método: F1 por campo y micro/macro, error en numéricos, número de vehículos, alucinación de
campo antes y después del verificador, diferencia contrafactual, costo por 1 000 relatos y latencia
p50/p95, repetición (el mismo relato otra vez: piso de ruido de la diferencia contrafactual) y
cobertura de preguntas útiles (qué parte de los errores de extracción en velocidad, maniobra,
frenado, clase y estado del piso cubre la ronda de preguntas, y qué parte de las preguntas no es
redundante). Además, para el redactor de PII (común a todos): datos personales filtrados.
El test solo se evalúa congelado (PLAN §5.2).
"""

from __future__ import annotations

import difflib
import json
import math
import os
import re
import subprocess
import tempfile
import time
from collections import Counter
from pathlib import Path
from typing import Any

from croquis_eval.results import write_result
from croquis_extraction import baseline, questions, relatos_mx
from croquis_extraction.claude_client import (
    MODELS,
    PROMPT_VERSION,
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

JsonObj = dict[str, Any]
PIPELINES = ("ts", "py")


def _pctl(xs: list[float], p: float) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    return round(s[min(len(s) - 1, int(p * (len(s) - 1) + 0.5))], 2)


# --- Registros de cada pipeline (mismo formato) -------------------------------------------------


# Los resultados de v1 (el prompt con que se midió E1 en F6) no llevan sufijo; los demás, el de su
# versión (e1_extraction_ciss_v2.json), aunque sea la de producción: así ningún nombre cambia.
BASE_PROMPT = "extraccion_v1"


def _ts_records(split: str, prompt: str = PROMPT_VERSION) -> list[JsonObj]:
    """Registros del pipeline TS (lo que se despliega), escritos por `scripts/e1-predict.ts`."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / f"e1_{split}.jsonl"
        cmd = [
            "pnpm",
            "--filter",
            "@croquis/extraction",
            "exec",
            "tsx",
            "scripts/e1-predict.ts",
            "--split",
            split,
            "--out",
            str(out),
            "--prompt",
            prompt,
        ]
        # En Windows `pnpm` es un script .cmd: hay que lanzarlo por el intérprete de comandos.
        subprocess.run(cmd, cwd=relatos_mx.ROOT, check=True, shell=os.name == "nt")
        return [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines() if line]


def _py_run(
    metodo: str, clave: str, raw: str, with_questions: bool, prompt: str = PROMPT_VERSION
) -> JsonObj:
    text = redact(raw).text
    rec: JsonObj = {"tipo": "corrida", "metodo": metodo, "clave": clave}
    if metodo == "reglas":
        t0 = time.perf_counter()
        spec: JsonObj = baseline.extract_spec(text, clave)
        rec["latencia_ms"] = (time.perf_counter() - t0) * 1000
        rec["costo_usd"] = 0.0
    else:
        try:
            recording = load_recording(metodo, clave, text, prompt=prompt)
        except LLMError:
            return {**rec, "ausente": True}
        facts, conv = facts_from_output(recording["salida"], text)
        spec = build_spec(facts, text, spec_id=clave, origen="escrito", sintetico=False)
        rec["citas"] = conv.citas
        rec["sin_cita_literal"] = conv.sin_cita_literal
        rec["latencia_ms"] = float(recording.get("latencia_ms", 0.0))
        rec["costo_usd"] = float(recording.get("costo_usd", 0.0))
    verified, vs = verify_spec(spec, text)
    rec["spec"] = spec
    rec["spec_verificada"] = verified
    rec["verificador"] = {
        "revisados": vs.revisados,
        "corregidos": vs.corregidos,
        "degradados": vs.degradados,
    }
    if with_questions:
        try:
            rec["temas_preguntados"] = [
                questions.topic(q.id) for q in questions.ask(spec, text, samples=4, sampled=False)
            ]
        except (ValueError, KeyError, ArithmeticError) as e:
            rec["temas_preguntados"] = None
            rec["error_preguntas"] = str(e)
    return rec


def _py_records(split: str, prompt: str = PROMPT_VERSION) -> list[JsonObj]:
    """Los mismos registros con la referencia Python (para comparar con el pipeline TS)."""
    items = relatos_mx.load_split(split)
    cfs = [c for c in relatos_mx.load_split("contrafactuales") if c["split"] == split]
    out: list[JsonObj] = []
    for it in items + cfs:
        red = redact(it["texto"])
        out.append(
            {
                "tipo": "redaccion",
                "clave": it["id"],
                "texto": red.text,
                "tramos": [[s.start, s.end] for s in red.spans],
            }
        )
    for metodo in ("reglas", *MODELS):
        out.extend(_py_run(metodo, it["id"], it["texto"], True, prompt) for it in items)
        out.extend(_py_run(metodo, c["id"], c["texto"], False, prompt) for c in cfs)
        if metodo != "reglas":
            out.extend(
                _py_run(metodo, it["id"] + "-rep", it["texto"], False, prompt) for it in items
            )
    return out


# --- Puntuación ---------------------------------------------------------------------------------


class _Run:
    """Lo que un método produjo para un relato (de cualquiera de los dos pipelines)."""

    def __init__(self, rec: JsonObj, text: str):
        self.spec: JsonObj = rec["spec"]
        self.verified: JsonObj = rec["spec_verificada"]
        self.degraded = int(rec["verificador"]["degradados"])
        if rec["metodo"] == "reglas":
            # Las reglas solo citan fragmentos literales; se cuentan con el mismo criterio de F6.
            self.citas, self.sin_cita = hallucinated_fields(self.spec, text)
        else:
            self.citas = int(rec["citas"])
            self.sin_cita = int(rec["sin_cita_literal"])
        self.latency = float(rec["latencia_ms"])
        self.cost = float(rec["costo_usd"])
        temas: list[str] | None = rec.get("temas_preguntados", [])
        self.asked: set[str] | None = None if temas is None else set(temas)


class _Records:
    def __init__(self, records: list[JsonObj]):
        self.red: dict[str, JsonObj] = {r["clave"]: r for r in records if r["tipo"] == "redaccion"}
        self.runs: dict[tuple[str, str], JsonObj] = {
            (r["metodo"], r["clave"]): r for r in records if r["tipo"] == "corrida"
        }

    def text(self, clave: str) -> str:
        return str(self.red[clave]["texto"])

    def run(self, metodo: str, clave: str) -> _Run | None:
        rec = self.runs.get((metodo, clave))
        if rec is None or rec.get("ausente"):
            return None
        return _Run(rec, self.text(clave.removesuffix("-rep")))


def _narrator_speed(facts: Facts) -> float | None:
    i = facts.narrador_vehiculo
    if i is None or i >= len(facts.vehiculos):
        return None
    f = facts.vehiculos[i].get("velocidad_kmh")
    return None if f is None else float(f.valor)


def edr_speed(items: list[JsonObj], preds: dict[str, Facts]) -> JsonObj:
    """Test CISS: velocidad de quien narra contra la del EDR de NHTSA (sin redondear).

    La verdad de la extracción es la velocidad que dice el relato (la del EDR redondeada a 5 km/h);
    aquí se reporta además cuánto se aleja lo extraído del EDR y el piso que pone ese redondeo.
    """
    fichas = relatos_mx.fichas()
    err_narr: list[float] = []
    err_edr: list[float] = []
    floor: list[float] = []
    with_truth = 0
    for it in items:
        f = fichas.get(it["id"])
        if f is None:
            continue
        said = f["hechos"]["vehiculos"][0].get("velocidad_kmh")
        edr = f["contexto"]["vehiculos"][0].get("velocidad_edr_kmh")
        if said is None or edr is None:
            continue
        with_truth += 1
        pred = _narrator_speed(preds[it["id"]]) if it["id"] in preds else None
        if pred is None:
            continue
        err_narr.append(abs(pred - float(said)))
        err_edr.append(abs(pred - float(edr)))
        floor.append(abs(float(said) - float(edr)))

    def mean(xs: list[float]) -> float | None:
        return round(sum(xs) / len(xs), 2) if xs else None

    return {
        "relatos_con_velocidad_del_edr": with_truth,
        "con_velocidad_extraida": len(err_edr),
        "error_medio_kmh_contra_lo_narrado": mean(err_narr),
        "error_medio_kmh_contra_edr": mean(err_edr),
        "piso_por_redondeo_kmh": mean(floor),
    }


def _mcnemar_p(b: int, c: int) -> float:
    """McNemar exacto de dos colas: binomial con p = 1/2 sobre los pares discordantes."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    return min(1.0, 2.0 * sum(math.comb(n, i) for i in range(k + 1)) / 2**n)


_FEM_WORDS = {"ella", "la", "las", "una", "dicha", "otra", "esta", "esa", "femenino"}
_MASC_WORDS = {"él", "el", "los", "un", "dicho", "otro", "este", "ese", "lo", "masculino"}
_WORD = re.compile(r"\w+", re.UNICODE)


def base_sex(base_text: str, cf_text: str) -> str | None:
    """Sexo de la persona en el relato base de un contrafactual de sexo: compara las palabras que
    cambian entre los dos textos (artículos y pronombres, y terminaciones -a/-o como señora/señor o
    sentada/sentado) y vota. None si no se puede decidir."""
    a = [w.lower() for w in _WORD.findall(base_text)]
    b = [w.lower() for w in _WORD.findall(cf_text)]
    fem = masc = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag != "replace" or i2 - i1 != j2 - j1:
            continue
        for x, y in zip(a[i1:i2], b[j1:j2], strict=True):
            if x in _FEM_WORDS and y in _MASC_WORDS:
                fem += 1
            elif x in _MASC_WORDS and y in _FEM_WORDS:
                masc += 1
            elif x.endswith("a") and y in {x[:-1] + "o", x[:-1]}:
                fem += 1
            elif y.endswith("a") and x in {y[:-1] + "o", y[:-1]}:
                masc += 1
    if fem == masc:
        return None
    return "mujer" if fem > masc else "hombre"


def counterfactual_by_kind(
    name: str,
    cfs: list[JsonObj],
    preds: dict[str, Facts],
    recs: _Records,
    texts: dict[str, str],
) -> JsonObj:
    """Diferencia contrafactual por tipo (sexo, edad, vehículo), pareada con la repetición.

    En cada par: ``solo_contrafactual`` = el contrafactual cambia velocidades o maniobras y la
    repetición del mismo relato no; ``solo_repeticion`` = al revés. Sin efecto del cambio, los dos
    son igual de probables: ``p_mcnemar`` es la prueba exacta. En los de sexo, además, en los pares
    con distinta velocidad: en cuántos la versión con hombre sale más rápida y en cuántos la versión
    con mujer (el sexo del relato base se lee de las palabras que cambian, ``base_sex``).
    """
    out: JsonObj = {}
    for kind in sorted({str(cf["id"]).rsplit("-cf-", 1)[-1] for cf in cfs}):
        pairs = only_cf = only_rep = both = man_faster = woman_faster = undecided = 0
        for cf in cfs:
            if not str(cf["id"]).endswith("-cf-" + kind):
                continue
            base = preds.get(cf["base"])
            run = recs.run(name, cf["id"])
            rep_run = recs.run(name, cf["base"] + "-rep" if name != "reglas" else cf["base"])
            if base is None or run is None or rep_run is None:
                continue
            pairs += 1
            other = facts_from_spec(run.spec)
            d_cf = counterfactual_diff(base, other)
            d_rep = counterfactual_diff(base, facts_from_spec(rep_run.spec))
            only_cf += int(d_cf and not d_rep)
            only_rep += int(d_rep and not d_cf)
            both += int(d_cf and d_rep)
            if kind != "sexo":
                continue
            sex = base_sex(texts.get(str(cf["base"]), ""), str(cf["texto"]))
            for vb, vc in zip(base.vehiculos, other.vehiculos, strict=False):
                sb, sc = vb.get("velocidad_kmh"), vc.get("velocidad_kmh")
                if sb is None or sc is None or sb.valor == sc.valor:
                    continue
                if sex is None:
                    undecided += 1
                    continue
                man, woman = (sc.valor, sb.valor) if sex == "mujer" else (sb.valor, sc.valor)
                man_faster += int(man > woman)
                woman_faster += int(woman > man)
        out[kind] = {
            "pares": pairs,
            "solo_contrafactual": only_cf,
            "solo_repeticion": only_rep,
            "ambos": both,
            "p_mcnemar": round(_mcnemar_p(only_cf, only_rep), 4),
        }
        if kind == "sexo":
            out[kind]["velocidad_distinta"] = {
                "mas_rapido_con_hombre": man_faster,
                "mas_rapido_con_mujer": woman_faster,
                "sexo_no_identificado": undecided,
                "p_signo": round(_mcnemar_p(man_faster, woman_faster), 4),
            }
    return out


def evaluate_method(
    name: str, items: list[JsonObj], cfs: list[JsonObj], recs: _Records, split: str = "test"
) -> JsonObj:
    score = Score()
    score_verified = Score()
    citas = sin_cita = verified_down = 0
    latencies: list[float] = []
    cost = 0.0
    missing = 0
    preds: dict[str, Facts] = {}
    q_asked = q_redundant = err_total = err_covered = q_failed = 0
    for it in items:
        ref = facts_from_annotation({**it["hechos"], "tipo": it["tipo"]})
        run = recs.run(name, it["id"])
        if run is None:
            missing += 1
            continue
        latencies.append(run.latency)
        cost += run.cost
        citas += run.citas
        sin_cita += run.sin_cita
        verified_down += run.degraded
        preds[it["id"]] = facts_from_spec(run.spec)
        # Solo dev conoce el semáforo peatonal; los tests se anotaron antes del tipo (ADR 0043).
        new_types = split == "dev"
        score.merge(score_story(ref, preds[it["id"]], new_types))
        score_verified.merge(score_story(ref, facts_from_spec(run.verified), new_types))
        ids = [v["id"] for v in run.spec["vehiculos"]]
        errs = error_topics(ref, preds[it["id"]], ids)
        if run.asked is None:
            asked: set[str] = set()
            q_failed += 1
        else:
            asked = run.asked
        q_asked += len(asked)
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
        run = recs.run(name, cf["id"])
        if base is None or run is None:
            continue
        pairs += 1
        diffs += int(counterfactual_diff(base, facts_from_spec(run.spec)))
    # Piso de ruido: el mismo relato otra vez. Las reglas son deterministas; los modelos no
    # aceptan temperatura 0, así que parte de la diferencia contrafactual puede ser variación.
    rep_diffs = rep_pairs = 0
    for it in items:
        base = preds.get(it["id"])
        run = recs.run(name, it["id"] + "-rep" if name != "reglas" else it["id"])
        if base is None or run is None:
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
        "contrafactual_por_tipo": counterfactual_by_kind(
            name, cfs, preds, recs, {str(it["id"]): str(it["texto"]) for it in items}
        ),
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
        **({"velocidad_contra_edr": edr_speed(items, preds)} if split == "ciss" else {}),
    }


def evaluate(split: str, pipeline: str = "ts", prompt: str = PROMPT_VERSION) -> JsonObj:
    if pipeline not in PIPELINES:
        msg = f"Pipeline desconocido: {pipeline}"
        raise ValueError(msg)
    items = relatos_mx.load_split(split)
    cfs = [c for c in relatos_mx.load_split("contrafactuales") if c["split"] == split]
    recs = _Records(_ts_records(split, prompt) if pipeline == "ts" else _py_records(split, prompt))
    pii_total = pii_leak = 0
    by_kind: Counter[str] = Counter()
    over = 0
    for it in items + cfs:
        red = recs.red[it["id"]]
        t, leak, kinds = pii_leaks(it["pii"], str(red["texto"]))
        pii_total += t
        pii_leak += leak
        by_kind.update(kinds)
        truth = [(p["inicio"], p["fin"]) for p in it["pii"]]
        tramos: list[list[int]] = red["tramos"]
        over += sum(1 for s, e in tramos if not any(s < te and tb < e for tb, te in truth))
    methods = {m: evaluate_method(m, items, cfs, recs, split) for m in ("reglas", *MODELS)}
    return {
        "split": split,
        "pipeline": pipeline,
        "prompt": prompt,
        "relatos": len(items),
        "contrafactuales": len(cfs),
        "test_congelado": relatos_mx.frozen_hash(split) if split in relatos_mx.LOCKS else None,
        "pii": {
            "datos_personales": pii_total,
            "filtrados": pii_leak,
            "tasa_fuga": round(pii_leak / pii_total, 4) if pii_total else None,
            "filtrados_por_tipo": dict(by_kind),
            "tramos_redactados_que_no_eran_pii": over,
        },
        "metodos": methods,
    }


def main(split: str = "test", pipeline: str = "ts", prompt: str = PROMPT_VERSION) -> str:
    if split in relatos_mx.LOCKS:
        frozen = relatos_mx.frozen_hash(split)
        if frozen is None:
            msg = (
                f"El test {split} no está congelado: congélalo antes de la primera evaluación "
                "(PLAN §5.2)."
            )
            raise RuntimeError(msg)
        if frozen != relatos_mx.split_hash(split=split):
            msg = f"La fuente del test {split} no coincide con {split}.lock."
            raise RuntimeError(msg)
    which = (
        "TS de producción (packages/extraction)." if pipeline == "ts" else "Python de referencia."
    )
    payload = {
        "descripcion": "E1: extracción del relato en Relatos-MX (línea base de reglas, Claude "
        "Haiku y Sonnet desde respuestas grabadas), fuga de PII del redactor y diferencia "
        "contrafactual, medidas sobre el pipeline " + which,
        **evaluate(split, pipeline, prompt),
    }
    suffix = ("" if prompt == BASE_PROMPT else "_" + prompt.removeprefix("extraccion_")) + (
        "" if pipeline == "ts" else "_py"
    )
    name = ("e1_extraction" if split == "test" else f"e1_extraction_{split}") + suffix
    return str(write_result(name, payload))


__all__ = ["evaluate", "main"]
