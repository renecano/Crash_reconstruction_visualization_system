"""Consistencia (PLAN §6.1.12): lo declarado que no cabe en ninguna solución física.

Cada bandera compara algo que dijo el relato o la persona usuaria con el rango físico posible
(con la fricción, la rigidez y las masas en sus rangos), no con un solo valor nominal: solo se
marca lo que no cabe ni en el extremo favorable. Los mensajes describen la discrepancia en
lenguaje llano y nunca atribuyen culpa ni intención (PLAN §10); la página del relato los convierte
en preguntas.

Banderas:

* `detenido_con_velocidad`: un vehículo "detenido" o "estacionado" con velocidad declarada.
* `marcas_vs_velocidad`: marcas de frenado más largas de lo que permite la velocidad declarada
  incluso con la fricción más baja de la superficie.
* `proyeccion_vs_velocidad`: la distancia de proyección declarada exige velocidades (Searle, con
  el rango de fricción cuerpo–suelo) que no se cruzan con el rango de velocidad declarado.
* `dano_vs_velocidad`: el ΔV que implica el aplastamiento declarado (CRASH3) no se cruza con el
  ΔV que resulta de las velocidades declaradas (Monte Carlo).
* `velocidad_vs_evidencia`: la velocidad declarada no se cruza con el intervalo p10–p90 que fija la
  evidencia física en la inversión (solo parámetros que la evidencia identifica y que no quedan en
  el límite de búsqueda).
* `reposo_inalcanzable`: ninguna velocidad entre 0 y 200 km/h (ni un rumbo inicial no declarado
  dentro de ±20°) lleva el vehículo a la posición final declarada (ajuste de la inversión con
  residuo mayor a 3 σ).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from croquis_scene_schema.red_vial import defaults as red_vial_defaults
from croquis_scene_schema.red_vial import outside_red_vial_m
from croquis_solver import friction, pedestrian
from croquis_solver.inversion import (
    SIGMA_POSITION_M,
    Evidence,
    Inversion,
    evidence_from_spec,
    fit_evidence,
    invert,
)
from croquis_solver.montecarlo import monte_carlo, ranges

JsonObj = dict[str, Any]
G = 9.80665
STATED = ("relato", "usuario")
REST_SIGMAS = 3.0
STOPPED_KMH = 5.0
PROJECTION_FACTOR = (0.8, 1.0)  # fracción de la velocidad del vehículo que recibe el peatón
CG_HEIGHT_M = 1.0


@dataclass(frozen=True)
class Inconsistency:
    codigo: str
    mensaje: str
    datos: JsonObj

    def to_dict(self) -> JsonObj:
        return {"codigo": self.codigo, "mensaje": self.mensaje, "datos": _rounded(self.datos)}


def _rounded(x: Any) -> Any:
    """Números a 2 decimales (km/h y m) para el resultado; listas y textos tal cual."""
    if isinstance(x, float):
        return round(x, 2)
    if isinstance(x, dict):
        d: JsonObj = x  # pyright: ignore[reportUnknownVariableType]
        return {k: _rounded(v) for k, v in d.items()}
    if isinstance(x, list):
        items: list[Any] = x  # pyright: ignore[reportUnknownVariableType]
        return [_rounded(v) for v in items]
    return x


def _stated(campo: JsonObj | None) -> bool:
    return campo is not None and campo.get("fuente") in STATED


def _kmh(campo: JsonObj) -> float:
    return float(campo["valor"]) * (3.6 if campo.get("unidad") == "m/s" else 1.0)


def _len_m(campo: JsonObj) -> float:
    v = float(campo["valor"])
    return v * {"m": 1.0, "cm": 0.01, "mm": 0.001, "km": 1000.0}.get(
        str(campo.get("unidad", "m")), 1.0
    )


def _name(v: JsonObj) -> str:
    return f"el vehículo {v['rol']}"


def _speed_range(spec: JsonObj, idx: int) -> tuple[float, float] | None:
    """Rango de la velocidad declarada del vehículo `idx` (el de Monte Carlo)."""
    for r in ranges(spec):
        if r.ruta == f"vehiculos.{idx}.velocidad_previa":
            return r.minimo, r.maximo
    return None


def check_stopped(spec: JsonObj) -> list[Inconsistency]:
    out: list[Inconsistency] = []
    for v in spec["vehiculos"]:
        vp: JsonObj | None = v.get("velocidad_previa")
        if (
            v["maniobra"]["valor"] in ("detenido", "estacionado")
            and _stated(v["maniobra"])
            and _stated(vp)
            and vp is not None
            and _kmh(vp) > STOPPED_KMH
        ):
            out.append(
                Inconsistency(
                    "detenido_con_velocidad",
                    f"Se dijo que {_name(v)} estaba {v['maniobra']['valor']} y también que iba "
                    f"a unos {_kmh(vp):.0f} km/h. ¿Cuál de los dos datos es el correcto?",
                    {"vehiculo": v["id"], "velocidad_kmh": _kmh(vp)},
                )
            )
    return out


def check_map(spec: JsonObj) -> list[Inconsistency]:
    """Con calles del mapa (ADR 0023): cada vehículo debe arrancar sobre la calzada de OSM. Si
    queda fuera de la calle más cercana más que la tolerancia, la plantilla paramétrica o la
    posición no representan el cruce real, y se pregunta por la posición."""
    red: JsonObj | None = spec["lugar"].get("red_vial")
    if not red:
        return []
    lane = spec["lugar"].get("ancho_carril")
    lane_m = _len_m(lane) if lane else None
    tol = float(red_vial_defaults()["tolerancia_fuera_m"])
    out: list[Inconsistency] = []
    for v in spec["vehiculos"]:
        pose: JsonObj | None = v.get("posicion_inicial")
        if pose is None:
            continue
        fuera = outside_red_vial_m((float(pose["x"]), float(pose["y"])), red["vias"], lane_m)
        if fuera > tol:
            out.append(
                Inconsistency(
                    "fuera_de_la_via_del_mapa",
                    f"La posición inicial de {_name(v)} queda a unos {fuera:.0f} m de la calle más "
                    "cercana del mapa. ¿Puedes revisar dónde estaba?",
                    {"vehiculo": v["id"], "distancia_m": fuera},
                )
            )
    return out


def check_marks(spec: JsonObj) -> list[Inconsistency]:
    out: list[Inconsistency] = []
    lugar = spec["lugar"]
    mu = friction.tire_friction(lugar["superficie"]["valor"], lugar["estado_superficie"]["valor"])
    by_id = {v["id"]: (i, v) for i, v in enumerate(spec["vehiculos"])}
    for e in spec.get("evidencias", []):
        if e.get("tipo") != "marcas_frenado" or not _stated(e.get("longitud")):
            continue
        if e.get("fase") == "despues_impacto":
            continue  # marcas de después del impacto: no hablan de la velocidad previa
        hit = by_id.get(str(e.get("vehiculo_id", "")))
        if hit is None:
            continue
        idx, v = hit
        if not _stated(v.get("velocidad_previa")):
            continue
        length = _len_m(e["longitud"])
        need_kmh = math.sqrt(2 * mu.low * G * length) * 3.6
        rng = _speed_range(spec, idx)
        top = rng[1] if rng else _kmh(v["velocidad_previa"])
        if top < need_kmh:
            out.append(
                Inconsistency(
                    "marcas_vs_velocidad",
                    f"Para dejar unos {length:.0f} m de marcas de frenado, {_name(v)} tendría que "
                    f"ir al menos a {need_kmh:.0f} km/h, aun con el piso más resbaloso posible; "
                    f"la velocidad indicada llega a {top:.0f} km/h. ¿Puedes confirmar el largo de "
                    "las marcas o la velocidad?",
                    {
                        "vehiculo": v["id"],
                        "marcas_m": length,
                        "minima_kmh": need_kmh,
                        "declarada_max_kmh": top,
                    },
                )
            )
    return out


def check_throw(spec: JsonObj) -> list[Inconsistency]:
    out: list[Inconsistency] = []
    event = next(
        (e for e in spec.get("eventos", []) if e["tipo"] == "impacto_vehiculo_persona"), None
    )
    if event is None:
        return out
    by_id = {v["id"]: (i, v) for i, v in enumerate(spec["vehiculos"])}
    car = next((by_id[a] for a in event.get("actores", []) if a in by_id), None)
    if car is None:
        return out
    idx, v = car
    if not _stated(v.get("velocidad_previa")):
        return out
    body = friction.pedestrian_friction(spec["lugar"]["superficie"]["valor"])
    rng = _speed_range(spec, idx) or (_kmh(v["velocidad_previa"]),) * 2
    for e in spec.get("evidencias", []):
        if e.get("tipo") != "distancia_proyeccion" or not _stated(e.get("longitud")):
            continue
        d = _len_m(e["longitud"])
        lo = pedestrian.vehicle_speed_range_from_throw(d, body.high, CG_HEIGHT_M, PROJECTION_FACTOR)
        hi = pedestrian.vehicle_speed_range_from_throw(d, body.low, CG_HEIGHT_M, PROJECTION_FACTOR)
        need_lo = min(lo.v_min, hi.v_min) * 3.6
        need_hi = max(lo.v_max, hi.v_max) * 3.6
        if rng[1] < need_lo or rng[0] > need_hi:
            out.append(
                Inconsistency(
                    "proyeccion_vs_velocidad",
                    f"Que la persona quedara a unos {d:.0f} m corresponde a velocidades de "
                    f"{need_lo:.0f} a {need_hi:.0f} km/h, y la velocidad indicada de {_name(v)} va "
                    f"de {rng[0]:.0f} a {rng[1]:.0f} km/h. ¿Puedes confirmar la distancia o la "
                    "velocidad?",
                    {"vehiculo": v["id"], "distancia_m": d, "rango_kmh": [need_lo, need_hi]},
                )
            )
    return out


def check_damage(spec: JsonObj, seed: int, samples: int) -> list[Inconsistency]:
    out: list[Inconsistency] = []
    ev = evidence_from_spec(spec, seed=seed)
    if not ev.damage_dv:
        return out
    if not all(_stated(v.get("velocidad_previa")) for v in spec["vehiculos"]):
        return out  # sin velocidades declaradas no hay contra qué comparar el daño
    mc = monte_carlo(spec, samples=samples, seed=seed)
    by_id = {v["id"]: v for v in spec["vehiculos"]}
    for vid, dmg in ev.damage_dv.items():
        sol = mc.vehiculos.get(vid, {}).get("delta_v_kmh")
        if sol is None:
            continue
        if sol.p90 < dmg.p10 or sol.p10 > dmg.p90:
            out.append(
                Inconsistency(
                    "dano_vs_velocidad",
                    f"El daño descrito en {_name(by_id[vid])} corresponde a un cambio de velocidad "
                    f"de {dmg.p10:.0f} a {dmg.p90:.0f} km/h, y con las velocidades indicadas sale "
                    f"de {sol.p10:.0f} a {sol.p90:.0f} km/h. ¿Puedes revisar las velocidades o "
                    "describir de nuevo el daño?",
                    {
                        "vehiculo": vid,
                        "dano_kmh": [dmg.p10, dmg.p90],
                        "velocidades_kmh": [sol.p10, sol.p90],
                    },
                )
            )
    return out


def check_rest(spec: JsonObj, seed: int) -> list[Inconsistency]:
    out: list[Inconsistency] = []
    ev = evidence_from_spec(spec, seed=seed)
    if not ev.rest:
        return out
    fit = fit_evidence(spec, Evidence(ev.rest, {}, {}))
    by_id = {v["id"]: v for v in spec["vehiculos"]}
    for vid in ev.rest:
        rx = fit.residuals.get(f"reposo:{vid}:x", 0.0)
        ry = fit.residuals.get(f"reposo:{vid}:y", 0.0)
        miss = math.hypot(rx, ry) * SIGMA_POSITION_M
        if miss > REST_SIGMAS * SIGMA_POSITION_M:
            out.append(
                Inconsistency(
                    "reposo_inalcanzable",
                    f"Con ninguna velocidad entre 0 y 200 km/h {_name(by_id[vid])} termina donde "
                    f"se indicó, aun llegando con otro ángulo: lo más cerca que llega queda a unos "
                    f"{miss:.0f} m. ¿La posición final es correcta, o el vehículo pegó con algo "
                    "más o cambió de dirección antes?",
                    {"vehiculo": vid, "distancia_minima_m": miss},
                )
            )
    return out


# Evidencia de la inversión en palabras llanas (para los mensajes).
_EVIDENCE_WORDS = {
    "reposo": "dónde quedó",
    "rumbo_final": "hacia dónde quedó orientado",
    "marcas_frenado": "las marcas de frenado",
    "proyeccion": "la distancia a la que quedó la persona",
    "dano": "el daño descrito",
}


def check_speed_evidence(spec: JsonObj, inv: Inversion) -> list[Inconsistency]:
    """Velocidad declarada fuera del intervalo que fija la evidencia física (inversión)."""
    out: list[Inconsistency] = []
    by_id = {v["id"]: (i, v) for i, v in enumerate(spec["vehiculos"])}
    kinds: list[str] = []
    for label in inv.evidence:
        k = label.split(":", 1)[0]
        if k not in kinds:
            kinds.append(k)
    words = [_EVIDENCE_WORDS[k] for k in kinds if k in _EVIDENCE_WORDS]
    if not words:
        return out
    said = words[0] if len(words) == 1 else ", ".join(words[:-1]) + " y " + words[-1]
    for e in inv.estimates:
        if e.param.kind != "velocidad" or e.dist is None or not e.identifiable or e.at_bound:
            continue
        hit = by_id.get(e.param.vehicle)
        if hit is None or not _stated(hit[1].get("velocidad_previa")):
            continue
        idx, v = hit
        rng = _speed_range(spec, idx)
        if rng is None or not (rng[1] < e.dist.p10 or rng[0] > e.dist.p90):
            continue
        frenado: JsonObj = v.get("frenado") or {}
        aplico: JsonObj = frenado.get("aplico") or {}
        braked = bool(aplico.get("valor")) or f"marcas_frenado:{v['id']}" in inv.evidence
        when = "antes de frenar" if braked else "antes del choque"
        out.append(
            Inconsistency(
                "velocidad_vs_evidencia",
                f"Por {said}, {_name(v)} iría a unos {e.dist.p10:.0f}–{e.dist.p90:.0f} km/h "
                f"{when}, y la velocidad indicada va de {rng[0]:.0f} a {rng[1]:.0f} km/h. "
                "¿Puedes confirmar la velocidad, o alguno de esos datos?",
                {
                    "vehiculo": v["id"],
                    "evidencia_kmh": [e.dist.p10, e.dist.p90],
                    "declarada_kmh": [rng[0], rng[1]],
                    "evidencia": list(inv.evidence),
                },
            )
        )
    return out


def check_consistency(
    spec: JsonObj,
    *,
    seed: int | None = None,
    samples: int = 32,
    inversion: Inversion | None = None,
    sampled: bool = True,
) -> list[Inconsistency]:
    """Todas las banderas de consistencia de la escena, en orden fijo. `inversion` evita repetir
    la inversión si ya se calculó con la misma semilla.

    Con `sampled=False` solo van las banderas que no muestrean (detenido con velocidad, marcas y
    proyección contra la velocidad): las de daño, reposo y velocidad contra evidencia necesitan
    Monte Carlo o la inversión, que llegan al solver TS en F9. Es el conjunto que reproduce hoy
    el pipeline TS y contra el que se prueba su paridad.
    """
    seed = int(spec["meta"]["semilla"]) if seed is None else seed
    basic = check_stopped(spec) + check_marks(spec) + check_throw(spec) + check_map(spec)
    if not sampled:
        return basic
    if inversion is None and not evidence_from_spec(spec, seed=seed).empty():
        inversion = invert(spec, seed=seed)
    return (
        basic
        + check_damage(spec, seed, samples)
        + check_rest(spec, seed)
        + (check_speed_evidence(spec, inversion) if inversion is not None else [])
    )


__all__ = ["Inconsistency", "check_consistency"]
