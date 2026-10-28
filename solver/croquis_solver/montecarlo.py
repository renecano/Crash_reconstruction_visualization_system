"""Monte Carlo (PLAN §6.1.11): rangos antes que números falsos.

Cada campo incierto que usa el solver se muestrea (uniforme, con semilla explícita) y la escena se
reconstruye con cada muestra. El resultado lleva los percentiles p10–p50–p90 de la velocidad al
impacto, el ΔV, la posición final y la distancia recorrida después del impacto de cada vehículo, y
de la distancia de proyección de cada persona proyectada, más la lista de campos muestreados con su
rango: así se ve de dónde sale cada intervalo.

Rangos (cuando el campo no trae `rango` propio):

* Velocidad previa: ±5 % si la dio la persona usuaria, ±15 % si viene del relato ("como a 50") y
  ±30 % si es un supuesto o un valor por omisión.
* Masa: el rango de la clase (tabla de fichas técnicas) salvo que la persona usuaria la haya dado
  (±3 %).
* Fricción llanta–pavimento: el rango de la tabla para la superficie y su estado.
* Distancia de frenado antes del impacto: ±20 % del relato o ±40 % de un supuesto.

Los porcentajes son supuestos de este módulo y se documentan en docs/physics.md.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from croquis_solver import dmath, friction
from croquis_solver.inversion import Distribution, distribution

JsonObj = dict[str, Any]
DEFAULT_SAMPLES = 64
SAMPLE_DT = 0.1  # rejilla de salida gruesa: basta para velocidades, ΔV y reposo
SPEED_SPREAD = {"usuario": 0.05, "relato": 0.15}
SPEED_SPREAD_DEFAULT = 0.30
MASS_USER_SPREAD = 0.03
BRAKE_SPREAD = {"usuario": 0.10, "relato": 0.20}
BRAKE_SPREAD_DEFAULT = 0.40
# Parámetro del solver, no de la escena: el arrastre de una motocicleta caída (ADR 0017).
DOWNED_RUTA = "parametros.friccion_moto_caida"
DRAG_RUTA = "parametros.arrastre_post_impacto"


@dataclass(frozen=True)
class Sampled:
    ruta: str
    minimo: float
    maximo: float
    nota: str

    def to_dict(self) -> JsonObj:
        return {
            "ruta": self.ruta,
            "distribucion": "uniforme",
            "min": round(self.minimo, 6),
            "max": round(self.maximo, 6),
            "nota": self.nota,
        }


def _no_dists() -> dict[str, dict[str, Distribution]]:
    return {}


@dataclass
class Uncertainty:
    semilla: int
    muestras: int
    validas: int
    campos: list[Sampled]
    vehiculos: dict[str, dict[str, Distribution]] = field(default_factory=_no_dists)
    personas: dict[str, dict[str, Distribution]] = field(default_factory=_no_dists)

    def to_dict(self) -> JsonObj:
        def pct(d: Distribution) -> JsonObj:
            return {"p10": round(d.p10, 4), "p50": round(d.p50, 4), "p90": round(d.p90, 4)}

        return {
            "semilla": self.semilla,
            "muestras": self.muestras,
            "validas": self.validas,
            "campos": [c.to_dict() for c in self.campos],
            "vehiculos": [
                {"id": vid, **{k: pct(d) for k, d in sorted(ds.items())}}
                for vid, ds in self.vehiculos.items()
            ],
            "personas": [
                {"id": pid, **{k: pct(d) for k, d in sorted(ds.items())}}
                for pid, ds in self.personas.items()
            ],
        }


def _class_mass_range(clase: str) -> tuple[float, float] | None:
    from croquis_solver.reconstruct import _classes  # pyright: ignore[reportPrivateUsage]

    info: JsonObj = _classes().get(clase, {})
    rng: list[float] | None = info.get("masa_kg")
    return (float(rng[0]), float(rng[1])) if rng and len(rng) == 2 else None


def ranges(spec: JsonObj) -> list[Sampled]:
    """Campos que se muestrean y sus rangos (ver el docstring del módulo)."""
    out: list[Sampled] = []
    for i, v in enumerate(spec["vehiculos"]):
        quieto = v["maniobra"]["valor"] in ("detenido", "estacionado")
        vp: JsonObj | None = v.get("velocidad_previa")
        if vp and not quieto:
            val = float(vp["valor"])
            if vp.get("rango"):
                lo, hi = (float(x) for x in vp["rango"])
                nota = "rango declarado"
            else:
                f = str(vp.get("fuente", "default"))
                s = SPEED_SPREAD.get(f, SPEED_SPREAD_DEFAULT)
                lo, hi = max(0.0, val * (1 - s)), val * (1 + s)
                nota = f"±{s:.0%} ({f})"
            out.append(Sampled(f"vehiculos.{i}.velocidad_previa", lo, hi, nota))
        masa: JsonObj | None = v.get("masa")
        if masa and masa.get("fuente") == "usuario":
            val = float(masa["valor"])
            out.append(
                Sampled(
                    f"vehiculos.{i}.masa",
                    val * (1 - MASS_USER_SPREAD),
                    val * (1 + MASS_USER_SPREAD),
                    f"±{MASS_USER_SPREAD:.0%} (usuario)",
                )
            )
        elif masa and masa.get("rango"):
            lo, hi = (float(x) for x in masa["rango"])
            out.append(Sampled(f"vehiculos.{i}.masa", lo, hi, "rango declarado"))
        else:
            cr = _class_mass_range(str(v["clase"]["valor"]))
            if cr:
                out.append(Sampled(f"vehiculos.{i}.masa", cr[0], cr[1], "rango de la clase"))
        frenado: JsonObj = v.get("frenado") or {}
        dist: JsonObj | None = frenado.get("distancia_antes_impacto")
        if dist:
            val = float(dist["valor"])
            if dist.get("rango"):
                lo, hi = (float(x) for x in dist["rango"])
                nota = "rango declarado"
            else:
                f = str(dist.get("fuente", "default"))
                s = BRAKE_SPREAD.get(f, BRAKE_SPREAD_DEFAULT)
                lo, hi = max(0.0, val * (1 - s)), val * (1 + s)
                nota = f"±{s:.0%} ({f})"
            out.append(Sampled(f"vehiculos.{i}.frenado.distancia_antes_impacto", lo, hi, nota))
    lugar = spec["lugar"]
    fr: JsonObj | None = lugar.get("friccion")
    if fr and fr.get("fuente") == "usuario":
        val = float(fr["valor"])
        out.append(Sampled("lugar.friccion", val * 0.95, val * 1.05, "±5% (usuario)"))
    else:
        mu = friction.tire_friction(
            lugar["superficie"]["valor"], lugar["estado_superficie"]["valor"]
        )
        out.append(Sampled("lugar.friccion", mu.low, mu.high, f"tabla de fricción ({mu.fuente})"))
    if any(str(v["clase"]["valor"]) in friction.DOWNED_SLIDE_CLASSES for v in spec["vehiculos"]):
        md = friction.downed_motorcycle_friction(lugar["superficie"]["valor"])
        out.append(
            Sampled(DOWNED_RUTA, md.low, md.high, f"arrastre de la moto caída ({md.fuente})")
        )
    # Al final: no mueve los sorteos de lo demás (ADR 0091).
    out.append(
        Sampled(DRAG_RUTA, *friction.DRAG_FRACTION_RANGE, "arrastre después del impacto (supuesto)")
    )
    return out


def _set(spec: JsonObj, ruta: str, value: float) -> None:
    parts = ruta.split(".")
    node: Any = spec
    for p in parts[:-1]:
        node = node[int(p)] if p.isdigit() else node.setdefault(p, {})
    leaf = parts[-1]
    if leaf == "friccion":
        node[leaf] = {"valor": value, "fuente": "supuesto", "confianza": 0.5}
    elif leaf == "masa":
        node[leaf] = {"valor": value, "unidad": "kg", "fuente": "supuesto", "confianza": 0.5}
    else:
        node[leaf] = {**node[leaf], "valor": value}
        node[leaf].pop("rango", None)


def monte_carlo(
    spec: JsonObj, *, samples: int = DEFAULT_SAMPLES, seed: int | None = None, dt: float = SAMPLE_DT
) -> Uncertainty:
    """Percentiles de las salidas principales del solver sobre `samples` muestras con semilla."""
    from croquis_solver.reconstruct import reconstruct

    seed = int(spec["meta"]["semilla"]) if seed is None else seed
    rng = dmath.Random(seed)
    campos = ranges(spec)
    acc_v: dict[str, dict[str, list[float]]] = {}
    acc_p: dict[str, dict[str, list[float]]] = {}
    valid = 0
    for _ in range(samples):
        s = copy.deepcopy(spec)
        downed: float | None = None
        drag: float | None = None
        for c in campos:
            value = rng.uniform(c.minimo, c.maximo)
            if c.ruta == DOWNED_RUTA:
                downed = value
            elif c.ruta == DRAG_RUTA:
                drag = value
            else:
                _set(s, c.ruta, value)
        try:
            r = reconstruct(s, dt=dt, downed_mu=downed, drag_fraction=drag)
        except ValueError, KeyError, ArithmeticError:
            continue
        valid += 1
        for v in r.vehiculos:
            d = acc_v.setdefault(v.id, {})
            d.setdefault("v_impacto_kmh", []).append(v.v_impact_kmh)
            d.setdefault("delta_v_kmh", []).append(v.delta_v_kmh)
            d.setdefault("reposo_x_m", []).append(v.rest_pose[0])
            d.setdefault("reposo_y_m", []).append(v.rest_pose[1])
            d.setdefault("distancia_post_m", []).append(v.distance_post_m)
        for p in r.personas:
            if p.throw is not None:
                acc_p.setdefault(p.id, {}).setdefault("distancia_proyeccion_m", []).append(
                    p.throw.throw_distance_m
                )
    return Uncertainty(
        semilla=seed,
        muestras=samples,
        validas=valid,
        campos=campos,
        vehiculos={k: {m: distribution(xs) for m, xs in d.items()} for k, d in acc_v.items()},
        personas={k: {m: distribution(xs) for m, xs in d.items()} for k, d in acc_p.items()},
    )


__all__ = ["Sampled", "Uncertainty", "monte_carlo", "ranges"]
