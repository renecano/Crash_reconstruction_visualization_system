"""Puntuación de E1 (PLAN §5.3): hechos extraídos contra los hechos de referencia.

Solo cuentan los hechos que el relato afirma (referencia con cita) y lo que el método dice haber
sacado del relato (`fuente: relato`); lo supuesto no suma ni resta. Si la referencia trae el hecho
como inferencia de quien anotó (sin cita) y el método lo afirma con el mismo valor, tampoco cuenta:
no es un error dar con algo que el relato implica. Por campo se acumulan aciertos
(TP), afirmaciones de más (FP) y faltantes (FN); un valor equivocado cuenta como FP y FN. Los
números aciertan dentro de una tolerancia y además se reporta su error absoluto. Los valores
genéricos del relato ("camioneta", "llovía", "de noche", "en la esquina") aceptan cualquiera de sus
precisiones.
"""

from __future__ import annotations

import contextlib
import math
import statistics
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from croquis_extraction.facts import (
    ANNOTATED_ONLY,
    NUMERIC,
    SCALAR_FIELDS,
    TOLERANCE,
    VEHICLE_FIELDS,
    Fact,
    Facts,
)

EQUIV: dict[tuple[str, str], frozenset[str]] = {
    ("clase", "suv_o_pickup"): frozenset({"suv_compacta", "suv_grande", "pickup"}),
    ("clase", "camion_o_autobus"): frozenset({"autobus", "camion_unitario"}),
    ("entorno.clima", "lluvia"): frozenset({"lluvia_ligera", "lluvia_fuerte"}),
    ("entorno.iluminacion", "noche"): frozenset({"noche_con_alumbrado", "noche_sin_alumbrado"}),
    ("lugar.tipo_via", "interseccion"): frozenset({"interseccion_x", "interseccion_t"}),
    ("maniobra", "cambio_carril"): frozenset({"cambio_carril_izquierda", "cambio_carril_derecha"}),
}


def _stated(f: Fact | None) -> bool:
    return f is not None and f.fuente == "relato"


def values_match(key: str, ref: Any, pred: Any) -> bool:
    if key in NUMERIC:
        try:
            return abs(float(ref) - float(pred)) <= TOLERANCE.get(key, 0.0) + 1e-9
        except TypeError, ValueError:
            return False
    if ref == pred:
        return True
    r, p = str(ref), str(pred)
    return p in EQUIV.get((key, r), frozenset()) or r in EQUIV.get((key, p), frozenset())


def _counter() -> Counter[str]:
    return Counter()


def _errors() -> dict[str, list[float]]:
    return {}


# Semáforo peatonal (contrato 1.3.0, ADR 0043). Las anotaciones anteriores al tipo dicen
# `semaforo` aunque el relato hable del peatonal, y v1-v3 no pueden darlo: en la métrica común
# cuenta como `semaforo`, para que las versiones y los tests congelados sigan comparables. Aparte,
# `semaforo_peatonal` se mide con su etiqueta exacta solo donde la anotación ya conoce el tipo
# (dev), y no entra en el F1 micro ni en el macro.
DEVICE_COLLAPSE = {"semaforo_peatonal": "semaforo"}
NEW_TYPE_KEYS = frozenset({"semaforo_peatonal"})


@dataclass
class Score:
    tp: Counter[str] = field(default_factory=_counter)
    fp: Counter[str] = field(default_factory=_counter)
    fn: Counter[str] = field(default_factory=_counter)
    abs_err: dict[str, list[float]] = field(default_factory=_errors)
    vehicle_count_ok: int = 0
    stories: int = 0

    def add(self, key: str, ref: Fact | None, pred: Fact | None) -> None:
        rs, ps = _stated(ref), _stated(pred)
        if rs and ps:
            assert ref is not None
            assert pred is not None
            if values_match(key, ref.valor, pred.valor):
                self.tp[key] += 1
            else:
                self.fp[key] += 1
                self.fn[key] += 1
            if key in NUMERIC:
                with contextlib.suppress(TypeError, ValueError):
                    self.abs_err.setdefault(key, []).append(
                        abs(float(ref.valor) - float(pred.valor))
                    )
        elif rs:
            self.fn[key] += 1
        elif ps:
            assert pred is not None
            if ref is None or not values_match(key, ref.valor, pred.valor):
                self.fp[key] += 1

    def merge(self, other: Score) -> None:
        self.tp.update(other.tp)
        self.fp.update(other.fp)
        self.fn.update(other.fn)
        for k, v in other.abs_err.items():
            self.abs_err.setdefault(k, []).extend(v)
        self.vehicle_count_ok += other.vehicle_count_ok
        self.stories += other.stories

    def report(self) -> dict[str, Any]:
        all_keys = sorted(set(self.tp) | set(self.fp) | set(self.fn))
        keys = [k for k in all_keys if k not in NEW_TYPE_KEYS]
        per: dict[str, Any] = {}
        for k in keys:
            tp, fp, fn = self.tp[k], self.fp[k], self.fn[k]
            p = tp / (tp + fp) if tp + fp else math.nan
            r = tp / (tp + fn) if tp + fn else math.nan
            f1 = 2 * p * r / (p + r) if p == p and r == r and p + r else 0.0
            entry: dict[str, Any] = {
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "precision": _r(p),
                "exhaustividad": _r(r),
                "f1": _r(f1),
            }
            if self.abs_err.get(k):
                entry["error_absoluto_medio"] = _r(statistics.fmean(self.abs_err[k]))
            per[k] = entry
        macro = statistics.fmean([per[k]["f1"] for k in keys]) if keys else 0.0
        for k in [k for k in all_keys if k in NEW_TYPE_KEYS]:
            tp, fp, fn = self.tp[k], self.fp[k], self.fn[k]
            p = tp / (tp + fp) if tp + fp else math.nan
            r = tp / (tp + fn) if tp + fn else math.nan
            f1 = 2 * p * r / (p + r) if p == p and r == r and p + r else 0.0
            per[k] = {
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "precision": _r(p),
                "exhaustividad": _r(r),
                "f1": _r(f1),
            }
        tp = sum(self.tp[k] for k in keys)
        fp = sum(self.fp[k] for k in keys)
        fn = sum(self.fn[k] for k in keys)
        p = tp / (tp + fp) if tp + fp else math.nan
        r = tp / (tp + fn) if tp + fn else math.nan
        micro = 2 * p * r / (p + r) if p == p and r == r and p + r else 0.0
        # Sin los campos que solo anota parte de la referencia: compara versiones del prompt que
        # no los conocen (v1 y v2 no pueden dar la fase de las marcas).
        tp0 = tp - sum(self.tp[k] for k in ANNOTATED_ONLY)
        fp0 = fp - sum(self.fp[k] for k in ANNOTATED_ONLY)
        fn0 = fn - sum(self.fn[k] for k in ANNOTATED_ONLY)
        p0 = tp0 / (tp0 + fp0) if tp0 + fp0 else math.nan
        r0 = tp0 / (tp0 + fn0) if tp0 + fn0 else math.nan
        micro0 = 2 * p0 * r0 / (p0 + r0) if p0 == p0 and r0 == r0 and p0 + r0 else 0.0
        return {
            "f1_micro": _r(micro),
            "f1_micro_sin_campos_parciales": _r(micro0),
            "f1_macro": _r(macro),
            "precision_micro": _r(p),
            "exhaustividad_micro": _r(r),
            "numero_de_vehiculos_exacto": _r(self.vehicle_count_ok / self.stories)
            if self.stories
            else None,
            "por_campo": per,
        }


def _r(x: float) -> float | None:
    return None if x != x else round(x, 4)


def match_vehicles(ref: Facts, pred: Facts) -> list[tuple[int | None, int | None]]:
    """Empareja vehículos: narrador con narrador y luego por similitud de clase y maniobra."""
    pairs: list[tuple[int | None, int | None]] = []
    used_r: set[int] = set()
    used_p: set[int] = set()
    if ref.narrador_vehiculo is not None and pred.narrador_vehiculo is not None:
        pairs.append((ref.narrador_vehiculo, pred.narrador_vehiculo))
        used_r.add(ref.narrador_vehiculo)
        used_p.add(pred.narrador_vehiculo)
    cands: list[tuple[float, int, int]] = []
    for i, rv in enumerate(ref.vehiculos):
        if i in used_r:
            continue
        for j, pv in enumerate(pred.vehiculos):
            if j in used_p:
                continue
            s = 0.0
            if (
                "clase" in rv
                and "clase" in pv
                and values_match("clase", rv["clase"].valor, pv["clase"].valor)
            ):
                s += 2
            if (
                "maniobra" in rv
                and "maniobra" in pv
                and values_match("maniobra", rv["maniobra"].valor, pv["maniobra"].valor)
            ):
                s += 1
            s -= 0.01 * abs(i - j)  # empate: el orden de aparición
            cands.append((s, i, j))
    for s, i, j in sorted(cands, reverse=True):
        if i in used_r or j in used_p:
            continue
        pairs.append((i, j))
        used_r.add(i)
        used_p.add(j)
        _ = s
    pairs += [(i, None) for i in range(len(ref.vehiculos)) if i not in used_r]
    pairs += [(None, j) for j in range(len(pred.vehiculos)) if j not in used_p]
    return pairs


def _devices(facts: Facts, stated: bool, collapse: bool) -> Counter[str]:
    out: Counter[str] = Counter()
    for d in facts.dispositivos:
        if _stated(d) == stated:
            v = str(d.valor)
            out[DEVICE_COLLAPSE.get(v, v) if collapse else v] += 1
    return out


def score_story(ref: Facts, pred: Facts, new_types: bool = False) -> Score:
    """Puntaje de un relato. `new_types`: la anotación ya conoce los tipos nuevos del contrato
    (el semáforo peatonal), así que también se miden con su etiqueta exacta (ADR 0043)."""
    sc = Score(stories=1)
    for key in SCALAR_FIELDS:
        if key in ANNOTATED_ONLY and key not in ref.escalares:
            continue
        sc.add(key, ref.escalares.get(key), pred.escalares.get(key))
    rset = _devices(ref, stated=True, collapse=True)
    rinf = _devices(ref, stated=False, collapse=True)
    pset = _devices(pred, stated=True, collapse=True)
    inter = rset & pset
    sc.tp["dispositivos"] += sum(inter.values())
    sc.fp["dispositivos"] += sum((pset - rset - rinf).values())
    sc.fn["dispositivos"] += sum((rset - pset).values())
    if new_types:
        for k in NEW_TYPE_KEYS:
            r = _devices(ref, stated=True, collapse=False)[k]
            ri = _devices(ref, stated=False, collapse=False)[k]
            p = _devices(pred, stated=True, collapse=False)[k]
            sc.tp[k] += min(r, p)
            sc.fp[k] += max(0, p - r - ri)
            sc.fn[k] += max(0, r - p)
    pairs = match_vehicles(ref, pred)
    for i, j in pairs:
        rv = ref.vehiculos[i] if i is not None else {}
        pv = pred.vehiculos[j] if j is not None else {}
        for key in VEHICLE_FIELDS:
            sc.add(key, rv.get(key), pv.get(key))
        rz = ref.zonas.get(i) if i is not None else None
        pz = pred.zonas.get(j) if j is not None else None
        sc.add("zona_impacto", rz, pz)
    stated_ref_vehicles = len(ref.vehiculos)
    sc.vehicle_count_ok += int(stated_ref_vehicles == len(pred.vehiculos))
    rroles = Counter(str(p["rol"].valor) for p in ref.personas if _stated(p.get("rol")))
    rinf = Counter(
        str(p["rol"].valor) for p in ref.personas if "rol" in p and not _stated(p.get("rol"))
    )
    proles = Counter(str(p["rol"].valor) for p in pred.personas if _stated(p.get("rol")))
    inter = rroles & proles
    sc.tp["persona.rol"] += sum(inter.values())
    extra = proles - rroles - rinf
    # Relatos-MX anota a quien narra, pasajeros, peatones y ciclistas; quien maneja otro vehículo
    # puede no estar anotado. Un conductor de más no es error mientras haya un vehículo para él.
    drivers = ("conductor", "motociclista")
    free_seats = max(0, len(pred.vehiculos) - sum(rroles[d] + rinf[d] for d in drivers))
    extra_drivers = sum(extra[d] for d in drivers)
    sc.fp["persona.rol"] += sum(v for k, v in extra.items() if k not in drivers)
    sc.fp["persona.rol"] += max(0, extra_drivers - free_seats)
    sc.fn["persona.rol"] += sum((rroles - proles).values())
    for key in ("cinturon", "casco"):
        rvals = [(str(p["rol"].valor), p[key]) for p in ref.personas if key in p and "rol" in p]
        pvals = [(str(p["rol"].valor), p[key]) for p in pred.personas if key in p and "rol" in p]
        for rol, rf in rvals:
            match = next((pf for prol, pf in pvals if prol == rol), None)
            sc.add(f"persona.{key}", rf, match)
            if match is not None:
                pvals = [(a, b) for a, b in pvals if b is not match]
        for _, pf in pvals:
            sc.add(f"persona.{key}", None, pf)
    return sc


def hallucinated_fields(spec: dict[str, Any], text: str) -> tuple[int, int]:
    """(campos con fuente relato, de ellos sin cita literal en el texto)."""
    total = 0
    bad = 0

    def walk(o: Any) -> None:
        nonlocal total, bad
        if isinstance(o, dict):
            d: dict[str, Any] = o  # pyright: ignore[reportUnknownVariableType]
            if d.get("fuente") == "relato":
                total += 1
                ev: list[dict[str, Any]] = d.get("evidencia") or []
                if not ev or any(e.get("texto", "") not in text for e in ev):
                    bad += 1
            for v in d.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:  # pyright: ignore[reportUnknownVariableType]
                walk(v)

    walk(spec)
    return total, bad


def pii_leaks(pii: list[dict[str, Any]], redacted: str) -> tuple[int, int, Counter[str]]:
    """(datos personales, filtrados, filtrados por tipo)."""
    leaked = [p for p in pii if p["texto"] in redacted]
    return len(pii), len(leaked), Counter(str(p["tipo"]) for p in leaked)


def counterfactual_diff(base: Facts, variant: Facts) -> bool:
    """¿Cambian las velocidades o maniobras extraídas entre el relato y su contrafactual?"""

    def sig(f: Facts) -> list[tuple[Any, Any]]:
        out: list[tuple[Any, Any]] = []
        for v in f.vehiculos:
            vel = v.get("velocidad_kmh")
            man = v.get("maniobra")
            out.append(
                (
                    round(float(vel.valor)) if _stated(vel) and vel is not None else None,
                    man.valor if _stated(man) and man is not None else None,
                )
            )
        return out

    return sig(base) != sig(variant)


# Errores que una pregunta puede corregir, con el mismo tema que usa `questions` (ver `_topic`).
_TOPIC_FIELDS = {
    "velocidad_kmh": "velocidad",
    "maniobra": "maniobra",
    "frenado": "frenado",
    "clase": "clase",
}


def error_topics(ref: Facts, pred: Facts, vehicle_ids: list[str]) -> set[str]:
    """Temas en los que la extracción falló (falta o valor distinto a lo que el relato afirma)."""
    return _topics(ref, pred, vehicle_ids, errors=True)


def settled_topics(ref: Facts, pred: Facts, vehicle_ids: list[str]) -> set[str]:
    """Temas que el relato afirma y la extracción ya sacó bien: preguntarlos es redundante."""
    return _topics(ref, pred, vehicle_ids, errors=False)


def _topics(ref: Facts, pred: Facts, vehicle_ids: list[str], *, errors: bool) -> set[str]:
    out: set[str] = set()
    for i, j in match_vehicles(ref, pred):
        if i is None or j is None or j >= len(vehicle_ids):
            continue
        rv, pv = ref.vehiculos[i], pred.vehiculos[j]
        for key, topic in _TOPIC_FIELDS.items():
            r = rv.get(key)
            if not _stated(r):
                continue
            assert r is not None
            p = pv.get(key)
            wrong = not _stated(p) or (p is not None and not values_match(key, r.valor, p.valor))
            if wrong == errors:
                out.add(f"{topic}:{vehicle_ids[j]}")
    r = ref.escalares.get("lugar.estado_superficie")
    p = pred.escalares.get("lugar.estado_superficie")
    if _stated(r) and r is not None:
        wrong = not _stated(p) or (p is not None and not values_match("x", r.valor, p.valor))
        if wrong == errors:
            out.add("estado_superficie:")
    return out
