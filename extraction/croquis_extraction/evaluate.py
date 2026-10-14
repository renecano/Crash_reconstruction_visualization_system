"""Puntuación de E1 (PLAN §5.3): hechos extraídos contra los hechos de referencia.

Solo cuentan los hechos que el relato afirma (referencia con cita) y lo que el método dice haber
sacado del relato (`fuente: relato`); lo supuesto no suma ni resta. Por campo se acumulan aciertos
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

from croquis_extraction.facts import NUMERIC, SCALAR_FIELDS, TOLERANCE, VEHICLE_FIELDS, Fact, Facts

EQUIV: dict[tuple[str, str], frozenset[str]] = {
    ("clase", "suv_o_pickup"): frozenset({"suv_compacta", "suv_grande", "pickup"}),
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
        keys = sorted(set(self.tp) | set(self.fp) | set(self.fn))
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
        tp = sum(self.tp.values())
        fp = sum(self.fp.values())
        fn = sum(self.fn.values())
        p = tp / (tp + fp) if tp + fp else math.nan
        r = tp / (tp + fn) if tp + fn else math.nan
        micro = 2 * p * r / (p + r) if p == p and r == r and p + r else 0.0
        macro = statistics.fmean([v["f1"] for v in per.values()]) if per else 0.0
        return {
            "f1_micro": _r(micro),
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


def _match_vehicles(ref: Facts, pred: Facts) -> list[tuple[int | None, int | None]]:
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


def score_story(ref: Facts, pred: Facts) -> Score:
    sc = Score(stories=1)
    for key in SCALAR_FIELDS:
        sc.add(key, ref.escalares.get(key), pred.escalares.get(key))
    rset = Counter(str(d.valor) for d in ref.dispositivos if _stated(d))
    pset = Counter(str(d.valor) for d in pred.dispositivos if _stated(d))
    inter = rset & pset
    sc.tp["dispositivos"] += sum(inter.values())
    sc.fp["dispositivos"] += sum((pset - rset).values())
    sc.fn["dispositivos"] += sum((rset - pset).values())
    pairs = _match_vehicles(ref, pred)
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
    proles = Counter(str(p["rol"].valor) for p in pred.personas if _stated(p.get("rol")))
    inter = rroles & proles
    sc.tp["persona.rol"] += sum(inter.values())
    sc.fp["persona.rol"] += sum((proles - rroles).values())
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
