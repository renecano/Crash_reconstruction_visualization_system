"""E2 — Impacto contra barrera: coeficientes de rigidez CRASH3 por clase y su error de predicción.

Datos: pruebas frontales a 0° contra barrera plana rígida de la Vehicle Crash Test Database de
NHTSA (``data/processed/nhtsa/vtb_tests.csv``, generado por ``croquis-data nhtsa``).

Método (Campbell/CRASH3 según lo resume Kodsi et al., Accident Reconstruction Journal 2017, citando
a Jean): con velocidad de impacto v, restitución e, aplastamiento medio C̄ = media(DPD1…DPD6) y
ancho dañado L (ancho del vehículo en barrera plena):

    ΔV = v (1 + e),  b1 = (ΔV − b0) / C̄,  A = m b0 b1 / L,  B = m b1² / L

con b0 (velocidad sin daño permanente) de 8 km/h y e = 0.1 (valores de la literatura citados por
Kodsi et al.). Por clase se reporta la mediana y la dispersión de A y B.

Evaluación (dejar uno fuera dentro de cada clase): predecir el aplastamiento medio a partir de la
velocidad y la velocidad a partir del aplastamiento con los coeficientes de la clase, y comparar
con lo medido. Línea base ingenua: un solo modelo lineal global ΔV = c·C̄ sin clase ni masa
(ajuste por mínimos cuadrados sobre todas las pruebas) y la regla de Emori "1 mph por pulgada".

Salidas: ``eval/results/e2_barrier.json`` y ``solver/croquis_solver/data/stiffness_classes.json``.
"""

from __future__ import annotations

import csv
import json
import statistics
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from croquis_eval.results import RESULTS_DIR, write_result
from croquis_solver.crash3 import KGF_PER_CM2_TO_N_PER_M2, KGF_PER_CM_TO_N_PER_M

CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "nhtsa" / "vtb_tests.csv"
STIFFNESS_PATH = (
    Path(__file__).resolve().parents[2]
    / "solver"
    / "croquis_solver"
    / "data"
    / "stiffness_classes.json"
)

B0_KMH = 8.0  # velocidad sin daño permanente (literatura: 5–11 km/h)
RESTITUTION = 0.1  # barrera frontal (literatura: 0.03–0.2)
SPEED_RANGE_KMH = (40.0, 65.0)
MIN_MODEL_YEAR = 1995
EMORI_KMH_PER_M = 1.609344 / 0.0254  # 1 mph por pulgada ≈ 63.3 km/h por metro
MIN_TESTS_PER_CLASS = 5


@dataclass(frozen=True)
class BarrierTest:
    test_no: int
    clase: str
    model_year: int
    make: str
    model: str
    mass_kg: float
    width_m: float
    length_m: float
    speed_ms: float
    crush_avg_m: float
    crush_max_m: float

    @property
    def delta_v(self) -> float:
        return self.speed_ms * (1.0 + RESTITUTION)

    @property
    def b1(self) -> float:
        return (self.delta_v - B0_KMH / 3.6) / self.crush_avg_m

    @property
    def a_n_m(self) -> float:
        return self.mass_kg * (B0_KMH / 3.6) * self.b1 / self.width_m

    @property
    def b_n_m2(self) -> float:
        return self.mass_kg * self.b1 * self.b1 / self.width_m


def classify(body_type: str, length_m: float) -> str | None:
    """Mapea el tipo de carrocería de NHTSA a las clases del contrato (ver docs/data.md)."""
    b = (body_type or "").upper()
    if "PICKUP" in b or "PICK-UP" in b:
        return "pickup"
    if "BUS" in b:
        return "autobus"
    if "VAN" in b:
        return "van"
    if "TRUCK" in b or "CHASSIS" in b:
        return "camion_unitario"
    if "UTILITY" in b or "SUV" in b or "MPV" in b or "CROSSOVER" in b:
        return "suv_compacta" if length_m < 4.75 else "suv_grande"
    if "HATCHBACK" in b or "3 DOOR" in b or "5 DOOR" in b or "3-DOOR" in b or "5-DOOR" in b:
        return "hatchback"
    if any(
        k in b
        for k in ("SEDAN", "4 DOOR", "2 DOOR", "COUPE", "CONVERTIBLE", "WAGON", "4-DOOR", "2-DOOR")
    ):
        return "sedan_compacto" if length_m < 4.55 else "sedan_mediano"
    return None


def _f(row: dict[str, str], key: str) -> float | None:
    v = row.get(key, "")
    try:
        return float(v) if v not in {"", "None"} else None
    except ValueError:
        return None


def load_tests(csv_path: Path = CSV_PATH) -> tuple[list[BarrierTest], dict[str, int]]:
    """Filtra las pruebas útiles y cuenta cuántas se descartan por cada criterio."""
    counts: dict[str, int] = {"total": 0, "usadas": 0}

    def drop(reason: str) -> None:
        counts[reason] = counts.get(reason, 0) + 1

    tests: list[BarrierTest] = []
    with csv_path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            counts["total"] += 1
            if (row.get("barrier_rigid") or "").upper() != "RIGID":
                drop("barrera_no_rigida")
                continue
            shape = (row.get("barrier_shape") or "").upper()
            is_flat = ("FLAT" in shape or "LOAD CELL" in shape) and not any(
                k in shape for k in ("OFFSET", "ANGLED", "POLE")
            )
            if not is_flat:
                drop("barrera_no_plana")
                continue
            if (_f(row, "barrier_angle_deg") or 0.0) != 0.0 or (
                _f(row, "impact_angle_deg") or 0.0
            ) != 0.0:
                drop("angulo_no_cero")
                continue
            if (_f(row, "offset_distance_mm") or 0.0) != 0.0:
                drop("con_desplazamiento")
                continue
            if (row.get("vehicle_modification") or "").upper() not in {"", "PRODUCTION VEHICLE"}:
                drop("vehiculo_modificado")
                continue
            speed = _f(row, "speed_kmh") or _f(row, "closing_speed_kmh")
            if speed is None or not (SPEED_RANGE_KMH[0] <= speed <= SPEED_RANGE_KMH[1]):
                drop("velocidad_fuera_de_rango")
                continue
            year = _f(row, "model_year")
            if year is None or year < MIN_MODEL_YEAR:
                drop("modelo_anterior_a_1995")
                continue
            mass = _f(row, "test_weight_kg")
            width = _f(row, "width_mm")
            length = _f(row, "length_mm")
            if not mass or not width or not length or mass <= 0 or width <= 0:
                drop("sin_masa_o_dimensiones")
                continue
            dpd = [_f(row, f"dpd{i}_mm") for i in range(1, 7)]
            if any(d is None or d <= 0 for d in dpd):
                drop("sin_perfil_de_dano")
                continue
            crush_avg = statistics.fmean([d for d in dpd if d is not None]) / 1000.0
            if crush_avg <= 0.05:
                drop("aplastamiento_implausible")
                continue
            clase = classify(row.get("body_type") or "", length / 1000.0)
            if clase is None:
                drop("carroceria_no_mapeada")
                continue
            tests.append(
                BarrierTest(
                    test_no=int(float(row["test_no"])),
                    clase=clase,
                    model_year=int(year),
                    make=row.get("make") or "",
                    model=row.get("model") or "",
                    mass_kg=mass,
                    width_m=width / 1000.0,
                    length_m=length / 1000.0,
                    speed_ms=speed / 3.6,
                    crush_avg_m=crush_avg,
                    crush_max_m=(_f(row, "max_crush_mm") or 0.0) / 1000.0,
                )
            )
            counts["usadas"] += 1
    return tests, counts


def _median_coeffs(tests: list[BarrierTest]) -> tuple[float, float]:
    return statistics.median(t.a_n_m for t in tests), statistics.median(t.b_n_m2 for t in tests)


def predict_crush(t: BarrierTest, a: float, b: float) -> float:
    """C̄ a partir de ΔV con coeficientes de clase aplicados a la masa y ancho de la prueba."""
    b1 = (b * t.width_m / t.mass_kg) ** 0.5
    b0 = a * t.width_m / (t.mass_kg * b1)
    return max((t.delta_v - b0) / b1, 0.0)


def predict_speed(t: BarrierTest, a: float, b: float) -> float:
    """Velocidad de impacto (m/s) a partir del aplastamiento medio medido."""
    b1 = (b * t.width_m / t.mass_kg) ** 0.5
    b0 = a * t.width_m / (t.mass_kg * b1)
    return (b0 + b1 * t.crush_avg_m) / (1.0 + RESTITUTION)


def evaluate(tests: list[BarrierTest]) -> dict[str, Any]:
    by_class: dict[str, list[BarrierTest]] = {}
    for t in tests:
        by_class.setdefault(t.clase, []).append(t)
    # Línea base global: ΔV = c·C̄ por mínimos cuadrados (sin intercepto, sin clase ni masa).
    num = sum(t.delta_v * t.crush_avg_m for t in tests)
    den = sum(t.crush_avg_m**2 for t in tests)
    c_global = num / den if den else 0.0
    per_class: dict[str, Any] = {}
    errs_model_speed: list[float] = []
    errs_base_speed: list[float] = []
    errs_emori_speed: list[float] = []
    errs_model_crush: list[float] = []
    errs_base_crush: list[float] = []
    for clase, rows in sorted(by_class.items()):
        a_med, b_med = _median_coeffs(rows)
        loo_speed: list[float] = []
        loo_crush: list[float] = []
        base_speed: list[float] = []
        base_crush: list[float] = []
        emori: list[float] = []
        if len(rows) >= MIN_TESTS_PER_CLASS:
            for i, t in enumerate(rows):
                others = rows[:i] + rows[i + 1 :]
                a, b = _median_coeffs(others)
                loo_speed.append(abs(predict_speed(t, a, b) - t.speed_ms) * 3.6)
                loo_crush.append(abs(predict_crush(t, a, b) - t.crush_avg_m) * 1000.0)
                base_speed.append(
                    abs(c_global * t.crush_avg_m / (1 + RESTITUTION) - t.speed_ms) * 3.6
                )
                base_crush.append(
                    abs(t.delta_v / c_global - t.crush_avg_m) * 1000.0 if c_global else 0.0
                )
                emori.append(abs(EMORI_KMH_PER_M * t.crush_avg_m - t.speed_ms * 3.6))
            errs_model_speed += loo_speed
            errs_base_speed += base_speed
            errs_emori_speed += emori
            errs_model_crush += loo_crush
            errs_base_crush += base_crush
        per_class[clase] = {
            "n": len(rows),
            "a_n_m": round(a_med, 1),
            "b_n_m2": round(b_med, 1),
            "a_kgf_cm": round(a_med / KGF_PER_CM_TO_N_PER_M, 2),
            "b_kgf_cm2": round(b_med / KGF_PER_CM2_TO_N_PER_M2, 2),
            "muestras_ab": sorted([round(t.a_n_m), round(t.b_n_m2)] for t in rows),
            "a_mad_kgf_cm": round(_mad([t.a_n_m for t in rows]) / KGF_PER_CM_TO_N_PER_M, 2),
            "b_mad_kgf_cm2": round(_mad([t.b_n_m2 for t in rows]) / KGF_PER_CM2_TO_N_PER_M2, 2),
            "masa_media_kg": round(statistics.fmean(t.mass_kg for t in rows), 1),
            "aplastamiento_medio_mm": round(
                1000 * statistics.fmean(t.crush_avg_m for t in rows), 1
            ),
            "mae_velocidad_kmh": round(statistics.fmean(loo_speed), 2) if loo_speed else None,
            "mae_aplastamiento_mm": round(statistics.fmean(loo_crush), 1) if loo_crush else None,
            "linea_base_mae_velocidad_kmh": round(statistics.fmean(base_speed), 2)
            if base_speed
            else None,
            "linea_base_mae_aplastamiento_mm": round(statistics.fmean(base_crush), 1)
            if base_crush
            else None,
            "emori_mae_velocidad_kmh": round(statistics.fmean(emori), 2) if emori else None,
            "evaluada": len(rows) >= MIN_TESTS_PER_CLASS,
        }
    return {
        "linea_base": {
            "descripcion": (
                "ΔV = c·C̄ global por mínimos cuadrados (sin clase ni masa) y regla de Emori "
                "1 mph/in"
            ),
            "c_kmh_por_m": round(c_global * 3.6, 2),
            "emori_kmh_por_m": round(EMORI_KMH_PER_M, 2),
        },
        "global": {
            "n_evaluadas": len(errs_model_speed),
            "mae_velocidad_kmh": round(statistics.fmean(errs_model_speed), 2)
            if errs_model_speed
            else None,
            "linea_base_mae_velocidad_kmh": round(statistics.fmean(errs_base_speed), 2)
            if errs_base_speed
            else None,
            "emori_mae_velocidad_kmh": round(statistics.fmean(errs_emori_speed), 2)
            if errs_emori_speed
            else None,
            "mae_aplastamiento_mm": round(statistics.fmean(errs_model_crush), 1)
            if errs_model_crush
            else None,
            "linea_base_mae_aplastamiento_mm": round(statistics.fmean(errs_base_crush), 1)
            if errs_base_crush
            else None,
        },
        "clases": per_class,
    }


def _mad(values: list[float]) -> float:
    med = statistics.median(values)
    return statistics.median(abs(v - med) for v in values)


TABLE_HEADER = {
    "_generado_por": (
        "uv run croquis-eval e2-barrier (frontal) y uv run croquis-eval e2-mdb (lateral y "
        "trasera); eval/croquis_eval/e2_barrier.py y e2_mdb.py"
    ),
    "_fuente": (
        "NHTSA Vehicle Crash Test Database vía data/processed/nhtsa/vtb_tests.csv e "
        "itv_tests.csv; ver data/SOURCES.md"
    ),
    "_nota": (
        "Frontal, lateral y trasera desde pruebas de NHTSA. Una clase sin pruebas suficientes en "
        "una zona usa el respaldo marcado 'supuesto' en el solver."
    ),
}


def write_stiffness_table(report: dict[str, Any], path: Path = STIFFNESS_PATH) -> Path:
    clases: dict[str, Any] = {}
    for clase, c in report["clases"].items():
        if c["n"] < MIN_TESTS_PER_CLASS:
            continue
        clases[clase] = {
            "frontal": {
                "a_n_m": c["a_n_m"],
                "b_n_m2": c["b_n_m2"],
                "origen": "nhtsa",
                "n_tests": c["n"],
                "nota": "Mediana de pruebas frontales a 0° contra barrera rígida (E2).",
                # Pares (A, B) de cada prueba: A y B salen de la misma pendiente b1, así que
                # se muestrean juntos (bootstrap) para la incertidumbre de la inversión (F7).
                "muestras_ab": c["muestras_ab"],
            }
        }
    # Las zonas lateral y trasera las escribe e2-mdb: se conservan.
    old: dict[str, Any] = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for clase, zonas in old.get("clases", {}).items():
        for zona in ("lateral", "trasera"):
            if zona in zonas:
                clases.setdefault(clase, {})[zona] = zonas[zona]
    doc: dict[str, Any] = {
        **TABLE_HEADER,
        "parametros": {
            "b0_kmh": B0_KMH,
            "restitucion": RESTITUTION,
            "velocidad_kmh": list(SPEED_RANGE_KMH),
            "anio_minimo": MIN_MODEL_YEAR,
        },
    }
    if "parametros_lateral_trasera" in old:
        doc["parametros_lateral_trasera"] = old["parametros_lateral_trasera"]
    doc["clases"] = {
        k: {z: v[z] for z in ("frontal", "lateral", "trasera") if z in v}
        for k, v in sorted(clases.items())
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    return path


def main(
    csv_path: Path = CSV_PATH,
    results_dir: Path = RESULTS_DIR,
    stiffness_path: Path = STIFFNESS_PATH,
) -> Path:
    tests, counts = load_tests(csv_path)
    report = evaluate(tests)
    payload = {
        "fuente": {
            "nombre": (
                "NHTSA Vehicle Crash Test Database (API pública), pruebas vehículo contra barrera"
            ),
            "archivo": str(csv_path.relative_to(csv_path.parents[3])),
        },
        "filtros": {
            "configuracion": (
                "VTB, barrera rígida plana (FLAT o LOAD CELL, sin OFFSET/ANGLED/POLE), ángulo 0°, "
                "sin desplazamiento, vehículo de producción"
            ),
            "velocidad_kmh": list(SPEED_RANGE_KMH),
            "anio_modelo_minimo": MIN_MODEL_YEAR,
            "perfil_de_dano": "DPD1–DPD6 presentes y > 0",
        },
        "conteos": counts,
        "metodo": {
            "b0_kmh": B0_KMH,
            "restitucion": RESTITUTION,
            "evaluacion": "dejar-uno-fuera por clase (clases con ≥ 5 pruebas)",
        },
        **report,
        # Los pares (A, B) por prueba ya van en "pruebas_usadas"; no se repiten por clase.
        "clases": {
            k: {kk: vv for kk, vv in v.items() if kk != "muestras_ab"}
            for k, v in report["clases"].items()
        },
        "pruebas_usadas": [
            asdict(t)
            | {
                "a_kgf_cm": round(t.a_n_m / KGF_PER_CM_TO_N_PER_M, 2),
                "b_kgf_cm2": round(t.b_n_m2 / KGF_PER_CM2_TO_N_PER_M2, 2),
            }
            for t in tests
        ],
    }
    write_stiffness_table(report, stiffness_path)
    return write_result("e2_barrier", payload, results_dir=results_dir)
