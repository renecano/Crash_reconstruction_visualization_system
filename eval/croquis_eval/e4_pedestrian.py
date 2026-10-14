"""E4: proyección de peatones, velocidad desde la distancia y distancia desde la velocidad.

Datos (`data/e4/throw_cases.csv`, ver `data/SOURCES.md`): 18 casos publicados de acceso abierto con
velocidad de impacto medida y distancia total de proyección:

* 7 impactos escenificados del IPTM con un Ford Crown Victoria contra un maniquí (Becker, Reade y
  Scurlock 2016, arXiv:1512.00790, tabla 3; μ medido en el sitio = 0.511);
* 5 pruebas con maniquí de Eubanks y Haight (SAE 921591) y 6 casos reales de Randles et al.
  (SAE 2001-01-0171), reproducidos en Batista (2008, arXiv:0803.2402, tablas 1 y 2).

La prueba 69 de Eubanks y Haight se hizo con el vehículo sin frenar: el cuerpo no se separa del
vehículo como supone Searle, así que queda fuera de las métricas principales y se reporta aparte.

Métodos comparados:

* **Croquis**: lo que hace el solver. Velocidad: intervalo de la inversión de Searle con el rango
  de fricción cuerpo–suelo (o la medida si existe) y el factor de proyección 0.9–1.0; estimación
  puntual invirtiendo el modelo completo con θ = 10° y factor 0.9. Distancia: modelo completo con
  la velocidad medida y banda de Searle.
* **Searle sola** (la alternativa de PLAN §8): la velocidad mínima de Searle con la fricción
  nominal (estimación puntual) y su intervalo [v_min, v_max] sin factor de proyección ni rango de
  fricción.
* **Wood (1988)** como referencia adicional: Searle máxima con corrección de masas.
"""

from __future__ import annotations

import csv
import math
import statistics
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from croquis_eval.results import write_result
from croquis_solver import friction, pedestrian
from croquis_solver.models import G
from croquis_solver.reconstruct import (
    DEFAULT_PERSON_MASS_KG,
    DEFAULT_STATURE_M,
    PEDESTRIAN_CG_HEIGHT_FACTOR,
    PEDESTRIAN_LAUNCH_ANGLE_DEG,
    PEDESTRIAN_PROJECTION_FACTOR,
)

DATA = Path(__file__).resolve().parents[2] / "data" / "e4" / "throw_cases.csv"
DEFAULT_VEHICLE_MASS_KG = 1500.0  # cuando la fuente no la da
MU_SAMPLES = 9


@dataclass(frozen=True)
class Case:
    fuente: str
    caso: str
    v_kmh: float
    d_m: float
    braking: bool
    mu: float | None
    stature: float
    m_person: float
    m_vehicle: float
    tipo: str


def load_cases(path: Path = DATA) -> list[Case]:
    out: list[Case] = []
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            out.append(
                Case(
                    fuente=row["fuente"],
                    caso=row["caso"],
                    v_kmh=float(row["v_impacto_kmh"]),
                    d_m=float(row["distancia_total_m"]),
                    braking=row["vehiculo_frena"] == "si",
                    mu=float(row["mu_medido"]) if row["mu_medido"] else None,
                    stature=float(row["estatura_m"]) if row["estatura_m"] else DEFAULT_STATURE_M,
                    m_person=float(row["masa_persona_kg"])
                    if row["masa_persona_kg"]
                    else DEFAULT_PERSON_MASS_KG,
                    m_vehicle=float(row["masa_vehiculo_kg"])
                    if row["masa_vehiculo_kg"]
                    else DEFAULT_VEHICLE_MASS_KG,
                    tipo=row["tipo"],
                )
            )
    return out


def mu_range(case: Case) -> tuple[float, float, float]:
    """(nominal, mínimo, máximo): el medido si existe; si no, la tabla del solver (asfalto)."""
    if case.mu is not None:
        return case.mu, case.mu, case.mu
    t = friction.pedestrian_friction("asfalto")
    return t.nominal, t.low, t.high


def _mus(lo: float, hi: float) -> list[float]:
    if hi <= lo:
        return [lo]
    return [lo + (hi - lo) * k / (MU_SAMPLES - 1) for k in range(MU_SAMPLES)]


def croquis_speed_interval(case: Case) -> tuple[float, float]:
    """Intervalo de velocidad del vehículo (km/h) que usa el solver para la distancia dada."""
    _, lo, hi = mu_range(case)
    h = PEDESTRIAN_CG_HEIGHT_FACTOR * case.stature
    ranges = [
        pedestrian.vehicle_speed_range_from_throw(
            case.d_m, m, h, (PEDESTRIAN_PROJECTION_FACTOR, 1.0)
        )
        for m in _mus(lo, hi)
    ]
    return 3.6 * min(r.v_min for r in ranges), 3.6 * max(r.v_max for r in ranges)


def croquis_speed_point(case: Case, projection: float = PEDESTRIAN_PROJECTION_FACTOR) -> float:
    """Velocidad (km/h) cuya distancia nominal del solver es la medida (bisección)."""
    mu, _, _ = mu_range(case)
    h = PEDESTRIAN_CG_HEIGHT_FACTOR * case.stature

    def dist(v_ms: float) -> float:
        return pedestrian.searle_throw(projection * v_ms, mu, PEDESTRIAN_LAUNCH_ANGLE_DEG, h)

    lo, hi = 0.0, 80.0
    for _ in range(100):
        mid = 0.5 * (lo + hi)
        if dist(mid) < case.d_m:
            lo = mid
        else:
            hi = mid
    return 3.6 * 0.5 * (lo + hi)


def searle_alone(case: Case) -> tuple[float, float, float]:
    """Searle sola con μ nominal: (velocidad mínima, intervalo mínimo, intervalo máximo) km/h."""
    mu, _, _ = mu_range(case)
    h = PEDESTRIAN_CG_HEIGHT_FACTOR * case.stature
    r = pedestrian.searle_range(case.d_m, mu, h)
    return 3.6 * r.v_min, 3.6 * r.v_min, 3.6 * r.v_max


def wood(case: Case) -> float:
    mu, _, _ = mu_range(case)
    h = PEDESTRIAN_CG_HEIGHT_FACTOR * case.stature
    return 3.6 * pedestrian.wood_speed(case.d_m, mu, h, case.m_vehicle, case.m_person)


def croquis_distance(case: Case) -> tuple[float, float, float]:
    """Distancia nominal del solver y banda de Searle (m) para la velocidad medida."""
    mu, lo, hi = mu_range(case)
    h = PEDESTRIAN_CG_HEIGHT_FACTOR * case.stature
    launch = PEDESTRIAN_PROJECTION_FACTOR * case.v_kmh / 3.6
    d = pedestrian.searle_throw(launch, mu, PEDESTRIAN_LAUNCH_ANGLE_DEG, h)
    band = pedestrian.searle_distance_band(launch, lo, hi, h)
    return d, band.d_min, band.d_max


def searle_alone_distance(case: Case) -> float:
    """Distancia de Searle con θ = 0 (velocidad máxima ↔ distancia mínima) y μ nominal."""
    mu, _, _ = mu_range(case)
    h = PEDESTRIAN_CG_HEIGHT_FACTOR * case.stature
    v = case.v_kmh / 3.6
    return v * v / (2 * mu * G) + mu * h


@dataclass(frozen=True)
class CaseResult:
    fuente: str
    caso: str
    v_medida_kmh: float
    d_medida_m: float
    en_dominio: bool
    croquis_v_kmh: float
    croquis_intervalo_kmh: tuple[float, float]
    searle_v_kmh: float
    searle_intervalo_kmh: tuple[float, float]
    wood_v_kmh: float
    croquis_d_m: float
    croquis_banda_m: tuple[float, float]
    searle_d_m: float


def _metrics(errors: list[float], truth: list[float]) -> dict[str, float]:
    abs_e = [abs(e) for e in errors]
    return {
        "mae": round(statistics.fmean(abs_e), 3),
        "sesgo": round(statistics.fmean(errors), 3),
        "rmse": round(math.sqrt(statistics.fmean([e * e for e in errors])), 3),
        "mape_pct": round(
            100 * statistics.fmean([a / t for a, t in zip(abs_e, truth, strict=True)]), 2
        ),
        "max_abs": round(max(abs_e), 3),
    }


def evaluate(cases: list[Case]) -> dict[str, Any]:
    rows: list[CaseResult] = []
    for c in cases:
        ci = croquis_speed_interval(c)
        sv, s_lo, s_hi = searle_alone(c)
        d, b_lo, b_hi = croquis_distance(c)
        rows.append(
            CaseResult(
                c.fuente,
                c.caso,
                c.v_kmh,
                c.d_m,
                c.braking,
                round(croquis_speed_point(c), 3),
                (round(ci[0], 3), round(ci[1], 3)),
                round(sv, 3),
                (round(s_lo, 3), round(s_hi, 3)),
                round(wood(c), 3),
                round(d, 3),
                (round(b_lo, 3), round(b_hi, 3)),
                round(searle_alone_distance(c), 3),
            )
        )
    inside = [r for r in rows if r.en_dominio]
    v_true = [r.v_medida_kmh for r in inside]
    d_true = [r.d_medida_m for r in inside]

    def coverage(pairs: list[tuple[float, float]], truth: list[float]) -> float:
        hits = sum(1 for (lo, hi), t in zip(pairs, truth, strict=True) if lo <= t <= hi)
        return round(hits / len(truth), 4)

    summary = {
        "casos": len(rows),
        "casos_en_dominio": len(inside),
        "velocidad_desde_distancia_kmh": {
            "croquis": {
                **_metrics([r.croquis_v_kmh - r.v_medida_kmh for r in inside], v_true),
                "cobertura_intervalo": coverage([r.croquis_intervalo_kmh for r in inside], v_true),
                "ancho_medio_intervalo": round(
                    statistics.fmean([b - a for a, b in (r.croquis_intervalo_kmh for r in inside)]),
                    3,
                ),
            },
            "searle_sola": {
                **_metrics([r.searle_v_kmh - r.v_medida_kmh for r in inside], v_true),
                "cobertura_intervalo": coverage([r.searle_intervalo_kmh for r in inside], v_true),
                "ancho_medio_intervalo": round(
                    statistics.fmean([b - a for a, b in (r.searle_intervalo_kmh for r in inside)]),
                    3,
                ),
            },
            "wood": _metrics([r.wood_v_kmh - r.v_medida_kmh for r in inside], v_true),
        },
        "distancia_desde_velocidad_m": {
            "croquis": {
                **_metrics([r.croquis_d_m - r.d_medida_m for r in inside], d_true),
                "cobertura_banda": coverage([r.croquis_banda_m for r in inside], d_true),
            },
            "searle_sola": _metrics([r.searle_d_m - r.d_medida_m for r in inside], d_true),
        },
        "fuera_de_dominio": [asdict(r) for r in rows if not r.en_dominio],
    }
    by_source: dict[str, Any] = {}
    for src in sorted({r.fuente for r in inside}):
        sub = [r for r in inside if r.fuente == src]
        by_source[src] = {
            "casos": len(sub),
            "croquis_mae_kmh": _metrics(
                [r.croquis_v_kmh - r.v_medida_kmh for r in sub], [r.v_medida_kmh for r in sub]
            )["mae"],
            "searle_mae_kmh": _metrics(
                [r.searle_v_kmh - r.v_medida_kmh for r in sub], [r.v_medida_kmh for r in sub]
            )["mae"],
        }
    summary["por_fuente"] = by_source
    summary["calibracion_factor_proyeccion"] = projection_calibration(
        [c for c in cases if c.braking]
    )
    return {"resumen": summary, "casos": [asdict(r) for r in rows]}


FACTOR_GRID = [round(0.6 + 0.01 * k, 2) for k in range(61)]


def projection_calibration(cases: list[Case]) -> dict[str, Any]:
    """¿Conviene recalibrar el factor de proyección con estos datos? Óptimo dentro de la muestra y
    error fuera de muestra dejando un caso fuera (el ajuste se hace sin el caso evaluado)."""

    def mae(cc: list[Case], f: float) -> float:
        return statistics.fmean([abs(croquis_speed_point(c, f) - c.v_kmh) for c in cc])

    best = min(FACTOR_GRID, key=lambda f: mae(cases, f))
    loo: list[float] = []
    fitted: list[float] = []
    for i, c in enumerate(cases):
        train = cases[:i] + cases[i + 1 :]
        f = min(FACTOR_GRID, key=lambda x: mae(train, x))
        fitted.append(f)
        loo.append(abs(croquis_speed_point(c, f) - c.v_kmh))
    return {
        "factor_actual": PEDESTRIAN_PROJECTION_FACTOR,
        "mae_factor_actual_kmh": round(mae(cases, PEDESTRIAN_PROJECTION_FACTOR), 3),
        "factor_optimo_en_muestra": best,
        "mae_en_muestra_kmh": round(mae(cases, best), 3),
        "mae_dejando_uno_fuera_kmh": round(statistics.fmean(loo), 3),
        "factores_ajustados": [min(fitted), max(fitted)],
    }


def main() -> str:
    cases = load_cases()
    payload = {
        "descripcion": "E4: velocidad desde la distancia de proyección y distancia desde la "
        "velocidad, contra 18 casos publicados (Becker et al. 2016; Eubanks y Haight 1992 y "
        "Randles et al. 2001 vía Batista 2008). Alternativa: Searle sola.",
        "datos": str(DATA.relative_to(DATA.parents[2])).replace("\\", "/"),
        "parametros": {
            "factor_proyeccion": [PEDESTRIAN_PROJECTION_FACTOR, 1.0],
            "angulo_lanzamiento_deg": PEDESTRIAN_LAUNCH_ANGLE_DEG,
            "altura_cg_fraccion_estatura": PEDESTRIAN_CG_HEIGHT_FACTOR,
            "friccion_sin_medir": list(mu_range(cases[-1])),
            "masa_vehiculo_por_omision_kg": DEFAULT_VEHICLE_MASS_KG,
        },
        **evaluate(cases),
    }
    path = write_result("e4_pedestrian", payload)
    return str(path)


__all__ = ["evaluate", "load_cases", "main"]
