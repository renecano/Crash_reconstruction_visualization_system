"""Inversión (PLAN §6.1.10): de la evidencia a velocidades, con distribución y no un solo número.

Dos piezas:

1. **ΔV desde el daño (CRASH3).** Con el perfil de aplastamiento medido (o una profundidad y un
   ancho declarados) se calcula la energía absorbida con los coeficientes A y B de la clase. La
   rigidez es lo más incierto, así que se muestrea con las pruebas de NHTSA de la clase
   (bootstrap: A y B salen de la misma pendiente y van juntos). Entre dos vehículos el ΔV sale de la
   energía total y la conservación de momento (velocidad común, como CRASH3); contra un objeto
   rígido, de la velocidad equivalente de barrera con restitución en [0, 0.2]. E3 lo valida contra
   el EDR de casos reales de CISS.
2. **Velocidades y ángulos desde la evidencia.** Las velocidades previas de los vehículos en
   movimiento (y su rumbo inicial cuando nadie lo declaró y hay posiciones finales) se ajustan con
   mínimos cuadrados robustos (SciPy `least_squares`, pérdida `soft_l1`) para que el solver
   reproduzca la evidencia declarada: posiciones y rumbos finales, marcas de frenado (fijan la
   distancia de frenado antes del impacto), distancia de proyección y ΔV del daño declarado.
   Con el jacobiano en el mejor ajuste se ve qué parámetros fija la evidencia (aproximación de
   Laplace); los que no, se informan así en vez de dar un intervalo que solo reflejaría los
   límites de búsqueda. El ajuste se repite con entradas perturbadas con semilla (fricción, masas
   y la propia evidencia dentro de su incertidumbre) y devuelve percentiles. Si ni el mejor ajuste
   reproduce algo declarado, eso queda como inconsistencia (ver `consistency`).
"""

from __future__ import annotations

import copy
import json
import math
import random
import statistics
from collections.abc import Sequence
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from typing import Any

from croquis_solver import dmath, friction, linalg
from croquis_solver.crash3 import crush_energy, delta_v_barrier, delta_v_pair, uniform_crush_energy
from croquis_solver.lsq import least_squares_soft_l1
from croquis_solver.stiffness import sample_stiffness, stiffness_for, zona_from_cdc_side

JsonObj = dict[str, Any]
KMH = 3.6
MASS_SPREAD = 0.05  # ±5 % de masa (ocupantes y carga no medidos; supuesto)
RESTITUTION_RIGID = (0.0, 0.2)  # barrera rígida: rango de la literatura usado en E2
SIGMA_POSITION_M = 1.0  # incertidumbre de una posición final declarada (supuesto)
SIGMA_THROW_M = 1.5  # incertidumbre de una distancia de proyección declarada (supuesto)
# Incertidumbre del largo de unas marcas de después del impacto (supuesto, como la proyección: un
# largo que da el relato, no una medición con cinta).
SIGMA_SLIDE_M = 1.5
SPEED_BOUNDS_KMH = (0.0, 200.0)
STATED = ("relato", "usuario")
CALIBRATION_PATH = Path(__file__).resolve().parent / "data" / "inversion_calibration.json"


@cache
def model_sigma() -> float:
    """Dispersión del error del modelo de daño (log ΔV), calibrada con CISS dev (E3).

    Sin calibración, 0: el intervalo solo refleja la rigidez y la masa.
    """
    if not CALIBRATION_PATH.exists():
        return 0.0
    data: JsonObj = json.loads(CALIBRATION_PATH.read_text(encoding="utf-8"))
    return float(data.get("sigma_log_dv", 0.0))


# --- 1. ΔV desde el daño ------------------------------------------------------------------------


@dataclass(frozen=True)
class Damage:
    """Daño de un vehículo en un impacto. PDOF en grados, 0 = de frente, sentido horario (CDC)."""

    clase: str
    masa_kg: float
    plano: str  # F, B, L o R
    pdof_deg: float
    perfil_m: tuple[float, ...]  # perfil C1–Cn (n ≥ 2) o una sola profundidad uniforme
    ancho_m: float


def pdof_offset(plano: str, pdof_deg: float) -> float:
    """Ángulo entre la fuerza y la normal del plano dañado, en (−180, 180]."""
    normal = {"F": 0.0, "R": 90.0, "B": 180.0, "L": 270.0}[plano]
    d = (pdof_deg - normal + 180.0) % 360.0 - 180.0
    return d if d != -180.0 else 180.0


def _energy(d: Damage, a: float, b: float) -> float:
    from croquis_solver.crash3 import Stiffness

    k = Stiffness(a, b)
    off = pdof_offset(d.plano, d.pdof_deg)
    profile = list(d.perfil_m)
    if not profile:
        msg = "El daño necesita al menos una profundidad"
        raise ValueError(msg)
    if len(profile) >= 2:
        return crush_energy(profile, d.ancho_m, k, off)
    return uniform_crush_energy(profile[0], d.ancho_m, k)


@dataclass(frozen=True)
class Distribution:
    p10: float
    p50: float
    p90: float
    muestras: int

    def to_dict(self, nd: int = 3) -> JsonObj:
        return {
            "p10": round(self.p10, nd),
            "p50": round(self.p50, nd),
            "p90": round(self.p90, nd),
            "muestras": self.muestras,
        }

    def contains(self, x: float) -> bool:
        return self.p10 <= x <= self.p90


def distribution(values: Sequence[float]) -> Distribution:
    vals = sorted(values)
    if not vals:
        msg = "Sin muestras"
        raise ValueError(msg)
    if len(vals) == 1:
        return Distribution(vals[0], vals[0], vals[0], 1)
    q = statistics.quantiles(vals, n=10, method="inclusive")
    return Distribution(q[0], statistics.median(vals), q[-1], len(vals))


def delta_v_from_damage(
    own: Damage,
    other: Damage | None = None,
    *,
    rigid: bool = False,
    seed: int = 0,
    n: int = 200,
    sigma: float | None = None,
) -> Distribution:
    """ΔV (km/h) del vehículo `own` a partir del daño medido, con su distribución.

    `other` es el daño del otro vehículo (impacto entre dos); `rigid=True`, objeto rígido.
    `sigma` es el error del modelo en log ΔV (por omisión, el calibrado con CISS dev).
    """
    s_model = model_sigma() if sigma is None else sigma
    if other is None and not rigid:
        msg = "Entre dos vehículos hace falta el daño del otro (o usa rigid=True)"
        raise ValueError(msg)
    rng = dmath.Random(seed)
    own_k = sample_stiffness(stiffness_for(own.clase, zona_from_cdc_side(own.plano)), rng, n)
    oth_k = (
        sample_stiffness(stiffness_for(other.clase, zona_from_cdc_side(other.plano)), rng, n)
        if other is not None
        else []
    )
    out: list[float] = []
    for i in range(n):
        m1 = own.masa_kg * rng.uniform(1 - MASS_SPREAD, 1 + MASS_SPREAD)
        e1 = _energy(own, own_k[i].a, own_k[i].b)
        if other is not None:
            m2 = other.masa_kg * rng.uniform(1 - MASS_SPREAD, 1 + MASS_SPREAD)
            e2 = _energy(other, oth_k[i].a, oth_k[i].b)
            dv = delta_v_pair(e1 + e2, m1, m2)[0]
        else:
            dv = delta_v_barrier(e1, m1, rng.uniform(*RESTITUTION_RIGID))
        if s_model > 0:
            dv *= dmath.exp(rng.gauss(0.0, s_model))
        out.append(dv * KMH)
    return distribution(out)


# --- 2. Velocidades y ángulos desde la evidencia ------------------------------------------------

SIGMA_HEADING_DEG = 20.0  # incertidumbre de un rumbo final declarado (supuesto)
ANGLE_BOUND_DEG = 20.0  # desvío máximo que se ajusta al rumbo inicial no declarado (supuesto)
# Pasos de diferencias finitas y escalas de cada tipo de parámetro (km/h y grados).
JAC_STEP = {"velocidad": 1.0, "rumbo": 1.0}
# Distancia al límite de búsqueda por debajo de la cual el mejor ajuste "quedó en el límite", en las
# unidades del parámetro (km/h y grados). Con 1e-3, un ajuste que se pega al límite caía de un lado
# o del otro según el orden de las sumas del álgebra lineal en cada máquina; los resultados se
# reportan al centésimo, así que una décima es estar en el límite.
BOUND_TOL = {"velocidad": 0.1, "rumbo": 0.1}
SCALE = {"velocidad": 10.0, "rumbo": 10.0}
# Desviación local (Laplace) por encima de la cual la evidencia no fija el parámetro: el intervalo
# saldría de los límites de búsqueda y no de la evidencia, así que no se reporta.
IDENT_MAX = {"velocidad": 30.0, "rumbo": 15.0}
CHORD_ITER = 4  # iteraciones de cada reajuste perturbado (cuerda con el jacobiano del mejor)
FALLBACK_NFEV = 20  # ajuste completo de una muestra si la cuerda no mejora


def _stated(campo: JsonObj | None) -> bool:
    return campo is not None and campo.get("fuente") in STATED


def _stated_pose(pose: JsonObj | None) -> bool:
    if pose is None:
        return False
    proc: JsonObj = pose.get("procedencia") or {}
    return proc.get("fuente") in STATED


def _no_floats() -> dict[str, float]:
    return {}


@dataclass(frozen=True)
class Evidence:
    """Lo declarado que el solver debe reproducir."""

    rest: dict[str, tuple[float, float]]  # vehículo → posición final (m)
    throw: dict[str, float]  # persona → distancia de proyección (m)
    damage_dv: dict[str, Distribution]  # vehículo → ΔV que implica el daño declarado (km/h)
    rest_heading: dict[str, float] = field(default_factory=_no_floats)  # vehículo → rumbo final (°)
    skid: dict[str, float] = field(default_factory=_no_floats)  # vehículo → marcas de frenado (m)
    # vehículo → largo de las marcas de después del impacto (m): lo que se desliza hasta el reposo.
    slide: dict[str, float] = field(default_factory=_no_floats)

    def empty(self) -> bool:
        return not (self.rest or self.throw or self.damage_dv or self.rest_heading or self.slide)

    def labels(self) -> list[str]:
        """Evidencia usada, en orden fijo (para el resultado y el visor)."""
        return (
            [f"reposo:{k}" for k in sorted(self.rest)]
            + [f"rumbo_final:{k}" for k in sorted(self.rest_heading)]
            + [f"marcas_frenado:{k}" for k in sorted(self.skid)]
            + [f"marcas_despues:{k}" for k in sorted(self.slide)]
            + [f"proyeccion:{k}" for k in sorted(self.throw)]
            + [f"dano:{k}" for k in sorted(self.damage_dv)]
        )


def _len_m(campo: JsonObj) -> float:
    v = float(campo["valor"])
    return v * {"m": 1.0, "cm": 0.01, "mm": 0.001, "km": 1000.0}.get(
        str(campo.get("unidad", "m")), 1.0
    )


def evidence_from_spec(spec: JsonObj, seed: int = 0, n_damage: int = 200) -> Evidence:
    """Evidencia declarada de la escena (solo lo que dice el relato o la persona usuaria)."""
    rest: dict[str, tuple[float, float]] = {}
    rest_heading: dict[str, float] = {}
    for v in spec["vehiculos"]:
        pf: JsonObj | None = v.get("posicion_final")
        if _stated_pose(pf) and pf is not None:
            rest[v["id"]] = (float(pf["x"]), float(pf["y"]))
            if pf.get("rumbo_deg") is not None:
                rest_heading[v["id"]] = float(pf["rumbo_deg"])
    throw: dict[str, float] = {}
    skid: dict[str, float] = {}
    slide: dict[str, float] = {}
    for e in spec.get("evidencias", []):
        stated = e.get("procedencia", {}).get("fuente") in STATED
        if (
            e.get("tipo") == "posicion_final"
            and e.get("vehiculo_id")
            and e.get("puntos")
            and stated
        ):
            p = e["puntos"][-1]
            rest[e["vehiculo_id"]] = (float(p["x"]), float(p["y"]))
        elif e.get("tipo") == "distancia_proyeccion" and _stated(e.get("longitud")):
            pid = e.get("persona_id") or next(
                (p["id"] for p in spec["personas"] if not p.get("vehiculo_id")), None
            )
            if pid:
                throw[pid] = _len_m(e["longitud"])
        elif (
            e.get("tipo") in ("marcas_frenado", "marcas_derrape")
            and e.get("vehiculo_id")
            and _stated(e.get("longitud"))
        ):
            # Contrato 1.1.0: sin fase, unas marcas de frenado son de antes del impacto y unas de
            # derrape no tienen fase conocida (no se usan).
            fase = e.get("fase") or ("antes_impacto" if e["tipo"] == "marcas_frenado" else None)
            if fase == "despues_impacto":
                slide[str(e["vehiculo_id"])] = _len_m(e["longitud"])
            elif fase == "antes_impacto" and e["tipo"] == "marcas_frenado":
                skid[str(e["vehiculo_id"])] = _len_m(e["longitud"])
    damage_dv: dict[str, Distribution] = {}
    by_id = {v["id"]: v for v in spec["vehiculos"]}
    declared = [
        d
        for d in spec.get("danos_declarados", [])
        if _stated(d.get("profundidad_aplastamiento")) and _stated(d.get("ancho_danado"))
    ]
    dmg: dict[str, Damage] = {}
    for d in declared:
        v = by_id.get(d["vehiculo_id"])
        if v is None:
            continue
        lado = str(d["zona"].get("lado", "F"))
        if lado not in ("F", "B", "L", "R"):
            continue
        masa = float(v["masa"]["valor"]) if v.get("masa") else _class_mass(str(v["clase"]["valor"]))
        dmg[v["id"]] = Damage(
            clase=str(v["clase"]["valor"]),
            masa_kg=masa,
            plano=lado,
            pdof_deg={"F": 0.0, "R": 90.0, "B": 180.0, "L": 270.0}[lado],
            perfil_m=(_len_m(d["profundidad_aplastamiento"]),),
            ancho_m=_len_m(d["ancho_danado"]),
        )
    event = next((e for e in spec.get("eventos", []) if str(e["tipo"]).startswith("impacto")), None)
    if event is not None:
        actors = [a for a in event.get("actores", []) if a in by_id]
        rigid = event["tipo"] == "impacto_vehiculo_objeto"
        for k, vid in enumerate(actors):
            if vid not in dmg:
                continue
            if rigid:
                damage_dv[vid] = delta_v_from_damage(
                    dmg[vid], rigid=True, seed=seed + k, n=n_damage
                )
            else:
                other = next((dmg[o] for o in actors if o != vid and o in dmg), None)
                if other is not None:
                    damage_dv[vid] = delta_v_from_damage(dmg[vid], other, seed=seed + k, n=n_damage)
    return Evidence(rest, throw, damage_dv, rest_heading, skid, slide)


def _class_mass(clase: str) -> float:
    from croquis_solver.reconstruct import _classes  # pyright: ignore[reportPrivateUsage]

    tip: JsonObj = _classes().get(clase, {}).get("tipico", {})
    return float(tip.get("masa_kg", 1200.0))


def moving_vehicles(spec: JsonObj) -> list[str]:
    return [
        v["id"]
        for v in spec["vehiculos"]
        if v["maniobra"]["valor"] not in ("detenido", "estacionado")
    ]


def with_marks(spec: JsonObj, ev: Evidence) -> JsonObj:
    """Las marcas de frenado declaradas fijan la distancia de frenado antes del impacto.

    Son evidencia física: pesan más que una distancia de frenado que solo dice el relato. Solo una
    distancia que dio la persona usuaria se respeta tal cual.
    """
    if not ev.skid:
        return spec
    s = copy.deepcopy(spec)
    for v in s["vehiculos"]:
        length = ev.skid.get(v["id"])
        if length is None:
            continue
        fr: JsonObj = v.get("frenado") or {}
        prev: JsonObj = fr.get("distancia_antes_impacto") or {}
        if prev.get("fuente") == "usuario":
            continue
        fr["aplico"] = {"valor": True, "fuente": "relato", "confianza": 0.8}
        fr["distancia_antes_impacto"] = {
            "valor": length,
            "unidad": "m",
            "fuente": "relato",
            "confianza": 0.8,
        }
        v["frenado"] = fr
    return s


@dataclass(frozen=True)
class Param:
    """Incógnita del ajuste: velocidad previa (km/h) o rumbo inicial (°) de un vehículo."""

    kind: str  # "velocidad" | "rumbo"
    vehicle: str
    start: float
    lo: float
    hi: float
    declared: bool  # el valor de arranque lo dijo el relato o la persona usuaria

    @property
    def name(self) -> str:
        return f"{self.kind}:{self.vehicle}"


def parameters(spec: JsonObj, ev: Evidence) -> list[Param]:
    """Velocidad de cada vehículo en movimiento y, si hay posiciones finales declaradas, el rumbo
    inicial de los que no lo tienen declarado (±`ANGLE_BOUND_DEG`)."""
    out: list[Param] = []
    by_id = {v["id"]: v for v in spec["vehiculos"]}
    ids = moving_vehicles(spec)
    for vid in ids:
        vp: JsonObj = by_id[vid].get("velocidad_previa") or {}
        val = float(vp.get("valor", 40.0)) * (3.6 if vp.get("unidad") == "m/s" else 1.0)
        start = min(max(val, 5.0), SPEED_BOUNDS_KMH[1] - 1)
        out.append(Param("velocidad", vid, start, *SPEED_BOUNDS_KMH, _stated(vp or None)))
    if ev.rest or ev.rest_heading:
        for vid in ids:
            pose: JsonObj = by_id[vid]["posicion_inicial"]
            if _stated_pose(pose):
                continue
            h = float(pose["rumbo_deg"])
            out.append(Param("rumbo", vid, h, h - ANGLE_BOUND_DEG, h + ANGLE_BOUND_DEG, False))
    return out


def apply_values(spec: JsonObj, values: dict[str, float]) -> JsonObj:
    """Escena con las velocidades y rumbos de `values` ("velocidad:veh-a" → km/h, etc.)."""
    s = copy.deepcopy(spec)
    by_id = {v["id"]: v for v in s["vehiculos"]}
    for name, x in values.items():
        kind, vid = name.split(":", 1)
        if kind == "velocidad":
            by_id[vid]["velocidad_previa"] = {
                "valor": float(x),
                "unidad": "km/h",
                "fuente": "supuesto",
                "confianza": 0.5,
            }
        elif kind == "rumbo":
            by_id[vid]["posicion_inicial"]["rumbo_deg"] = max(-360.0, min(360.0, float(x)))
    return s


def with_speeds(spec: JsonObj, ids: list[str], speeds_kmh: Sequence[float]) -> JsonObj:
    return apply_values(spec, {f"velocidad:{v}": k for v, k in zip(ids, speeds_kmh, strict=True)})


def _wrap_deg(a: float) -> float:
    return (a + 180.0) % 360.0 - 180.0


@dataclass
class Fit:
    values: dict[str, float]  # parámetro → valor (km/h o grados)
    residuals: dict[str, float]  # nombre del residuo → valor en sigmas (con signo)
    cost: float
    success: bool

    @property
    def speeds_kmh(self) -> dict[str, float]:
        return {k.split(":", 1)[1]: v for k, v in self.values.items() if k.startswith("velocidad:")}

    @property
    def headings_deg(self) -> dict[str, float]:
        return {k.split(":", 1)[1]: v for k, v in self.values.items() if k.startswith("rumbo:")}


def _residuals(
    spec: JsonObj, ev: Evidence, dt: float, downed_mu: float | None = None
) -> dict[str, float] | None:
    from croquis_solver.reconstruct import reconstruct

    try:
        r = reconstruct(spec, dt=dt, downed_mu=downed_mu)
    except ValueError, KeyError, ArithmeticError:
        return None
    out: dict[str, float] = {}
    by_v = {v.id: v for v in r.vehiculos}
    for vid, (x, y) in sorted(ev.rest.items()):
        v = by_v.get(vid)
        if v is None:
            continue
        out[f"reposo:{vid}:x"] = (v.rest_pose[0] - x) / SIGMA_POSITION_M
        out[f"reposo:{vid}:y"] = (v.rest_pose[1] - y) / SIGMA_POSITION_M
    for vid, h in sorted(ev.rest_heading.items()):
        v = by_v.get(vid)
        if v is None:
            continue
        out[f"rumbo_final:{vid}"] = _wrap_deg(v.rest_pose[2] - h) / SIGMA_HEADING_DEG
    by_p = {p.id: p for p in r.personas}
    for pid, d in sorted(ev.throw.items()):
        p = by_p.get(pid)
        if p is None or p.throw is None:
            continue
        out[f"proyeccion:{pid}"] = (p.throw.throw_distance_m - d) / SIGMA_THROW_M
    for vid, d in sorted(ev.slide.items()):
        v = by_v.get(vid)
        if v is None:
            continue
        out[f"marcas_despues:{vid}"] = (v.distance_post_m - d) / SIGMA_SLIDE_M
    for vid, dist in sorted(ev.damage_dv.items()):
        v = by_v.get(vid)
        if v is None:
            continue
        sigma = max((dist.p90 - dist.p10) / 2.563, 1.0)  # p10–p90 de una normal ≈ 2.563 σ
        out[f"dano:{vid}"] = (v.delta_v_kmh - dist.p50) / sigma
    return out


class _Problem:
    """Residuos en función de los parámetros libres, con caché por punto (SciPy pide la función y
    luego el jacobiano en el mismo punto)."""

    def __init__(
        self,
        spec: JsonObj,
        ev: Evidence,
        params: list[Param],
        fixed: dict[str, float],
        dt: float,
        downed_mu: float | None = None,
    ) -> None:
        self.spec, self.ev, self.params, self.fixed, self.dt = spec, ev, params, fixed, dt
        self.downed_mu = downed_mu
        self.names: list[str] = []
        self._cache: dict[tuple[float, ...], list[float]] = {}

    def values(self, x: Sequence[float]) -> dict[str, float]:
        out = dict(self.fixed)
        out.update({p.name: float(v) for p, v in zip(self.params, x, strict=True)})
        return out

    def raw(self, x: Sequence[float]) -> dict[str, float] | None:
        return _residuals(apply_values(self.spec, self.values(x)), self.ev, self.dt, self.downed_mu)

    def __call__(self, x: Sequence[float]) -> list[float]:
        key = tuple(round(float(v), 9) for v in x)
        hit = self._cache.get(key)
        if hit is not None:
            return hit
        res = self.raw([float(v) for v in x])
        if res is None:
            out = [1e3] * max(len(self.names), 1)
        else:
            if not self.names:
                self.names.extend(sorted(res))
            out = [float(res.get(k, 1e3)) for k in self.names]
        self._cache[key] = out
        return out

    def jac(self, x: Sequence[float]) -> list[list[float]]:
        """Jacobiano (filas: residuos; columnas: parámetros) por diferencias hacia adelante con paso
        fijo por tipo (hacia atrás junto al límite)."""
        f0 = self(x)
        cols: list[list[float]] = []
        for k, p in enumerate(self.params):
            h = JAC_STEP[p.kind]
            if x[k] + h > p.hi:
                h = -h
            xk = [float(v) for v in x]
            xk[k] += h
            fk = self(xk)
            cols.append([(fk[i] - f0[i]) / h for i in range(len(f0))])
        return [[cols[k][i] for k in range(len(cols))] for i in range(len(f0))]


def fit_evidence(
    spec: JsonObj,
    ev: Evidence,
    *,
    dt: float = 0.1,
    max_nfev: int = 40,
    start: dict[str, float] | None = None,
    free: set[str] | None = None,
    downed_mu: float | None = None,
) -> Fit:
    """Mejor ajuste (mínimos cuadrados robustos) de velocidades y rumbos a la evidencia.

    `start` cambia el punto de arranque; los parámetros fuera de `free` quedan fijos en él.
    """
    base = with_marks(spec, ev)
    params = parameters(base, ev)
    x_start = {p.name: p.start for p in params} | (start or {})
    free_params = [p for p in params if free is None or p.name in free]
    fixed = {n: v for n, v in x_start.items() if all(p.name != n for p in free_params)}
    prob = _Problem(base, ev, free_params, fixed, dt, downed_mu)
    x0 = [min(max(x_start[p.name], p.lo), p.hi) for p in free_params]
    if not free_params or ev.empty():
        res0 = _residuals(apply_values(base, x_start), ev, dt, downed_mu) or {}
        return Fit(x_start, res0, 0.0, True)
    first = prob(x0)
    if not prob.names:
        return Fit(x_start, {}, 0.0, True)
    x_best, cost, ok = _robust_least_squares(prob, x0, free_params, max_nfev)
    best = prob(x_best)
    del first
    return Fit(
        prob.values(x_best),
        {k: float(r) for k, r in zip(prob.names, best, strict=True)},
        cost,
        ok,
    )


def _robust_least_squares(
    prob: _Problem, x0: list[float], params: list[Param], max_nfev: int
) -> tuple[list[float], float, bool]:
    """Mínimos cuadrados con pérdida `soft_l1` y límites (optimizador propio, ADR 0027)."""
    sol = least_squares_soft_l1(
        prob,
        prob.jac,
        x0,
        [p.lo for p in params],
        [p.hi for p in params],
        [SCALE[p.kind] for p in params],
        max_nfev,
    )
    return sol.x, sol.cost, sol.success


def local_sigma(spec: JsonObj, ev: Evidence, fit: Fit, *, dt: float = 0.1) -> dict[str, float]:
    """Desviación local de cada parámetro en el mejor ajuste: √diag((JᵀJ)⁺) con los residuos en
    sigmas (aproximación de Laplace). Infinita si la evidencia no lo mueve."""
    base = with_marks(spec, ev)
    params = parameters(base, ev)
    if not params:
        return {}
    prob = _Problem(base, ev, params, {}, dt)
    x = [min(max(fit.values.get(p.name, p.start), p.lo), p.hi) for p in params]
    j = prob.jac(x)
    if not j or not prob.names:
        return {p.name: math.inf for p in params}
    return _laplace(j, params)


def _laplace(j: list[list[float]], params: list[Param]) -> dict[str, float]:
    jtj = linalg.matmul(linalg.transpose(j), j)
    cov = linalg.pinv(jtj, rcond=1e-10)
    out: dict[str, float] = {}
    for k, p in enumerate(params):
        acc = 0.0
        for row in j:
            acc += row[k] * row[k]
        col = math.sqrt(acc)
        var = cov[k][k]
        out[p.name] = math.inf if col < 1e-6 or var <= 0 else math.sqrt(var)
    return out


def _chord_refit(prob: _Problem, x_best: list[float], j: list[list[float]]) -> Fit | None:
    """Reajuste barato de una muestra perturbada: Gauss-Newton con el jacobiano del mejor ajuste
    (método de la cuerda), pesos de la pérdida `soft_l1` (ρ'(z) = 1/√(1+z)), pasos recortados a la
    mitad si no mejoran y dentro de los límites. Cerca del mejor ajuste converge como el ajuste
    completo con unas cuantas reconstrucciones en vez de decenas. Devuelve `None` si ningún paso
    mejora (la muestra se reajusta completa)."""
    lo = [p.lo for p in prob.params]
    hi = [p.hi for p in prob.params]
    x = [float(v) for v in x_best]
    r = prob(x)

    def loss(v: Sequence[float]) -> float:
        # Σ (√(1 + v²) − 1) sin la cancelación para v chico (ver `lsq.soft_l1_cost`).
        acc = 0.0
        for e in v:
            z = e * e
            acc += z / (math.sqrt(1.0 + z) + 1.0)
        return acc

    accepted = 0
    for _ in range(CHORD_ITER):
        w = [1.0 / math.sqrt(math.sqrt(1.0 + e * e)) for e in r]  # raíz del peso IRLS de soft_l1
        a = [[w[i] * v for v in j[i]] for i in range(len(r))]
        step = linalg.lstsq(a, [-(r[i] * w[i]) for i in range(len(r))])
        moved = False
        for frac in (1.0, 0.5, 0.25):
            x_new = [min(max(x[k] + frac * step[k], lo[k]), hi[k]) for k in range(len(x))]
            r_new = prob(x_new)
            if loss(r_new) < loss(r):
                x, r, moved = x_new, r_new, True
                break
        if not moved:
            break
        accepted += 1
        big = 0.0
        for v in step:
            big = max(big, abs(v))
        if big < 0.05:
            break
    if accepted == 0:
        return None
    return Fit(
        prob.values(list(x)),
        {k: float(v) for k, v in zip(prob.names, r, strict=True)},
        loss(r),
        True,
    )


@dataclass(frozen=True)
class Perturbed:
    """Una reestimación: la escena y la evidencia sorteadas, y el arrastre de la moto caída."""

    spec: JsonObj
    evidence: Evidence
    downed_mu: float | None


def perturbed(spec: JsonObj, ev: Evidence, rng: random.Random) -> Perturbed:
    s = copy.deepcopy(spec)
    lugar = s["lugar"]
    mu = friction.tire_friction(lugar["superficie"]["valor"], lugar["estado_superficie"]["valor"])
    lugar["friccion"] = {
        "valor": rng.uniform(mu.low, mu.high),
        "fuente": "supuesto",
        "confianza": 0.5,
    }
    for v in s["vehiculos"]:
        base = float(v["masa"]["valor"]) if v.get("masa") else _class_mass(str(v["clase"]["valor"]))
        v["masa"] = {
            "valor": round(base * rng.uniform(1 - MASS_SPREAD, 1 + MASS_SPREAD), 1),
            "unidad": "kg",
            "fuente": "supuesto",
            "confianza": 0.5,
        }
    rest = {
        k: (x + rng.gauss(0, SIGMA_POSITION_M), y + rng.gauss(0, SIGMA_POSITION_M))
        for k, (x, y) in ev.rest.items()
    }
    heading = {k: h + rng.gauss(0, SIGMA_HEADING_DEG) for k, h in ev.rest_heading.items()}
    throw = {k: max(0.5, d + rng.gauss(0, SIGMA_THROW_M)) for k, d in ev.throw.items()}
    damage: dict[str, Distribution] = {}
    for k, d in ev.damage_dv.items():
        shift = rng.gauss(0, (d.p90 - d.p10) / 2.563)
        damage[k] = Distribution(d.p10 + shift, d.p50 + shift, d.p90 + shift, d.muestras)
    slide = {k: max(0.5, d + rng.gauss(0, SIGMA_SLIDE_M)) for k, d in ev.slide.items()}
    # Las marcas de frenado se miden con cinta: se toman tal cual (su incertidumbre entra por la
    # fricción).
    e = Evidence(rest, throw, damage, heading, dict(ev.skid), slide)
    downed_mu: float | None = None
    if any(str(v["clase"]["valor"]) in friction.DOWNED_SLIDE_CLASSES for v in s["vehiculos"]):
        md = friction.downed_motorcycle_friction(lugar["superficie"]["valor"])
        downed_mu = rng.uniform(md.low, md.high)  # al final: no mueve los sorteos de lo demás
    return Perturbed(s, e, downed_mu)


def _no_fits() -> list[Fit]:
    return []


@dataclass(frozen=True)
class Estimate:
    param: Param
    sigma_local: float
    identifiable: bool
    best: float | None
    dist: Distribution | None

    @property
    def at_bound(self) -> bool:
        """El mejor ajuste quedó en el límite de búsqueda: la evidencia lleva el parámetro fuera
        de lo que el modelo permite (se informa; no es un intervalo de la evidencia)."""
        p = self.param
        return self.best is not None and min(self.best - p.lo, p.hi - self.best) < BOUND_TOL[p.kind]

    def to_dict(self) -> JsonObj:
        p = self.param
        out: JsonObj = {
            "parametro": "velocidad_previa" if p.kind == "velocidad" else "rumbo_inicial",
            "vehiculo": p.vehicle,
            "unidad": "km/h" if p.kind == "velocidad" else "deg",
            "inicial": round(p.start, 2),
            "inicial_declarado": p.declared,
            "identificable": self.identifiable,
        }
        if math.isfinite(self.sigma_local):
            out["sigma_local"] = round(self.sigma_local, 2)
        if self.identifiable and self.best is not None and self.dist is not None:
            out["estimacion"] = {"mejor": round(self.best, 2), **self.dist.to_dict(2)}
            out["en_limite"] = self.at_bound
        return out


@dataclass
class Inversion:
    evidence: list[str]
    estimates: list[Estimate]
    best: Fit
    impact_speeds: dict[str, Distribution]
    fits: list[Fit] = field(default_factory=_no_fits)
    seed: int = 0

    @property
    def speeds(self) -> dict[str, Distribution]:
        """Velocidad previa estimada de cada vehículo que la evidencia fija."""
        return {
            e.param.vehicle: e.dist
            for e in self.estimates
            if e.param.kind == "velocidad" and e.dist is not None
        }

    def to_dict(self) -> JsonObj:
        return {
            "semilla": self.seed,
            "muestras": len(self.fits),
            "evidencia": self.evidence,
            "parametros": [e.to_dict() for e in self.estimates],
            "velocidad_impacto": [
                {"vehiculo": k, **d.to_dict(2)} for k, d in sorted(self.impact_speeds.items())
            ],
            "residuos": [
                {"nombre": k, "sigma": round(v, 3)} for k, v in sorted(self.best.residuals.items())
            ],
            "convergio": self.best.success,
        }


def invert(
    spec: JsonObj, *, seed: int | None = None, samples: int = 12, dt: float = 0.1
) -> Inversion:
    """Velocidades (y rumbos no declarados) que reproducen la evidencia, con percentiles sobre
    `samples` ajustes con entradas perturbadas. Lo que la evidencia no fija se informa así y queda
    en su valor inicial."""
    from croquis_solver.reconstruct import reconstruct

    seed = int(spec["meta"]["semilla"]) if seed is None else seed
    ev = evidence_from_spec(spec, seed=seed)
    params = parameters(with_marks(spec, ev), ev)
    best = fit_evidence(spec, ev, dt=dt)
    sigma = (
        local_sigma(spec, ev, best, dt=dt)
        if not ev.empty()
        else dict.fromkeys((p.name for p in params), math.inf)
    )
    ident = {p.name: sigma.get(p.name, math.inf) <= IDENT_MAX[p.kind] for p in params}
    free = {n for n, ok in ident.items() if ok}
    if free and len(free) < len(params):
        # Lo que la evidencia no fija vuelve a su valor inicial y se reajusta lo demás.
        start = {p.name: (best.values[p.name] if p.name in free else p.start) for p in params}
        best = fit_evidence(spec, ev, dt=dt, start=start, free=free)
    rng = dmath.Random(seed)
    fits: list[Fit] = []
    impacts: dict[str, list[float]] = {}
    free_params = [p for p in params if p.name in free]
    x_best = [best.values[p.name] for p in free_params]
    fixed = {n: v for n, v in best.values.items() if n not in free}
    j_best = (
        _Problem(with_marks(spec, ev), ev, free_params, fixed, dt).jac(x_best)
        if free_params
        else []
    )
    for _ in range(samples if free_params else 0):
        pert = perturbed(spec, ev, rng)
        s, e, dmu = pert.spec, pert.evidence, pert.downed_mu
        prob = _Problem(with_marks(s, e), e, free_params, fixed, dt, dmu)
        prob.names.extend(sorted(best.residuals))
        f = _chord_refit(prob, x_best, j_best) or fit_evidence(
            s, e, dt=dt, start=best.values, free=free, max_nfev=FALLBACK_NFEV, downed_mu=dmu
        )
        fits.append(f)
        try:
            r = reconstruct(apply_values(with_marks(s, e), f.values), dt=dt, downed_mu=dmu)
        except ValueError, KeyError, ArithmeticError:
            continue
        for v in r.vehiculos:
            impacts.setdefault(v.id, []).append(v.v_impact_kmh)
    estimates = [
        Estimate(
            p,
            sigma.get(p.name, math.inf),
            ident[p.name],
            best.values.get(p.name) if ident[p.name] else None,
            distribution([f.values[p.name] for f in fits]) if ident[p.name] and fits else None,
        )
        for p in params
    ]
    return Inversion(
        evidence=ev.labels(),
        estimates=estimates,
        best=best,
        impact_speeds={k: distribution(v) for k, v in impacts.items() if v},
        fits=fits,
        seed=seed,
    )


__all__ = [
    "Damage",
    "Distribution",
    "Estimate",
    "Evidence",
    "Fit",
    "Inversion",
    "Param",
    "apply_values",
    "delta_v_from_damage",
    "distribution",
    "evidence_from_spec",
    "fit_evidence",
    "invert",
    "local_sigma",
    "parameters",
    "pdof_offset",
    "perturbed",
    "with_marks",
    "with_speeds",
]
