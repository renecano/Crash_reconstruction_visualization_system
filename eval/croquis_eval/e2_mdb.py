"""E2 lateral y trasera: rigidez CRASH3 desde pruebas de barrera móvil contra el vehículo.

Datos: pruebas ``ITV`` de la Vehicle Crash Test Database de NHTSA
(``data/processed/nhtsa/itv_tests.csv``, generado por ``croquis-data nhtsa --config ITV``):

- **Lateral:** FMVSS 214 y NCAP lateral. La barrera móvil deformable de NHTSA (≈ 1,368 kg, cara de
  panal de aluminio) avanza con las ruedas oblicuas a 27° contra el costado detenido.
- **Trasera:** FMVSS 301. Barrera móvil rígida plana (≈ 1,800 kg) contra toda la parte trasera, o
  la deformable de NHTSA sin avance oblicuo.

Método, la inversa exacta de cómo usa la rigidez el solver (``croquis_solver.inversion``):

1. Energía total con momento en una dimensión y restitución cero, como ``delta_v_pair``:
   E = ½ μ v², μ = m_v m_b / (m_v + m_b).
2. Parte de la barrera. Una barrera rígida no absorbe nada. La deformable absorbe la fracción que
   calculó Johnson (2011) en 70 pruebas laterales de NHTSA con el aplastamiento registrado de su
   cara: 13.6 % en promedio (de 2.49 % a 49.1 %). NHTSA (WinSMASH) supone 5 %; Johnson muestra que
   esa suposición infla la rigidez lateral y que WinSMASH sobreestima el ΔV de los costados. La API
   no trae el aplastamiento de la cara, así que la fracción no puede salir de cada prueba.
3. Energía del vehículo, (1 − f)·E, con el perfil medido (DPD1–DPD6), su largo de daño y la
   corrección (1 + tan²θ) por la dirección de la fuerza, como ``crash3.crush_energy``. Los
   coeficientes van en la forma de WinSMASH: A = d0·d1, B = d1², G = d0²/2, con d0 fijo por zona
   (las pruebas son a una sola velocidad y no permiten ajustarlo):
   - lateral: d0 = 63.3 √N, el valor de NHTSA (Prasad 1991, citado por Sharma et al. 2007 y
     Johnson 2011);
   - trasera: el umbral de daño de Prasad, un choque a 16 km/h contra la misma barrera
     (G·L = ½ μ v0²).
4. d1 se despeja por bisección: la energía crece con d1.

Se probó primero repartir la energía por equilibrio de fuerzas, con la rigidez de la cara que midió
Johnson contra un muro rígido. Daba a la barrera una mediana de 54 % en las pruebas laterales,
incompatible con lo que se calcula con el aplastamiento real de la cara: sobre el largo de daño, que
incluye el daño inducido, el modelo lineal exagera la fuerza del costado. Se descartó antes de mirar
E3. Como sensibilidad se reportan también los coeficientes con el 5 % de NHTSA.

Evaluación (dejar uno fuera por clase): con la mediana de las demás pruebas de la clase, predecir
el ΔV del vehículo en la prueba con el mismo cálculo del solver. Alternativa simple: el respaldo
genérico marcado ``supuesto`` que el solver usaba para estas zonas. La validación contra el mundo
real es E3 (EDR de CISS), que no se usa para ajustar nada.

Salidas: ``eval/results/e2_mdb.json`` y las zonas ``lateral`` y ``trasera`` de
``solver/croquis_solver/data/stiffness_classes.json``.
"""

from __future__ import annotations

import csv
import json
import math
import statistics
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from croquis_eval.e2_barrier import STIFFNESS_PATH, TABLE_HEADER, classify
from croquis_eval.results import RESULTS_DIR, write_result
from croquis_solver.crash3 import (
    KGF_PER_CM2_TO_N_PER_M2,
    KGF_PER_CM_TO_N_PER_M,
    Stiffness,
    crush_energy,
    delta_v_pair,
)
from croquis_solver.inversion import pdof_offset
from croquis_solver.stiffness import FALLBACK

CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "nhtsa" / "itv_tests.csv"

# Fracción de la energía que absorbe la cara de la barrera deformable de NHTSA en las pruebas
# laterales: promedio de 70 pruebas con el aplastamiento de la cara medido (Johnson 2011, cap. 5;
# mínimo 2.49 %, máximo 49.1 %). NHTSA usa 5 % (Prasad 1991): se reporta como sensibilidad.
MDB_ENERGY_FRACTION = 0.136
NHTSA_MDB_ENERGY_FRACTION = 0.05
SIDE_D0 = 63.3  # √N, NHTSA para costados (Prasad 1991; Sharma et al. 2007)
REAR_ONSET_KMH = 16.0  # umbral de daño trasero de Prasad (1990), contra la barrera de la prueba
MIN_MODEL_YEAR = 1995
MIN_TESTS_PER_CLASS = 5
D1_MAX = 1.0e5  # √N/m; muy por encima de cualquier vehículo (E2: d1 frontal ~ 700–1,500)
# Valores centinela de la base de NHTSA (dato no medido) y largo de daño mínimo plausible.
SENTINEL_MM = 9000.0
MIN_DAMAGE_LENGTH_M = 0.5


def from_d(d0: float, d1: float) -> Stiffness:
    """Coeficientes CRASH3 desde los de WinSMASH: A = d0·d1, B = d1² (G = d0²/2)."""
    return Stiffness(d0 * d1, d1 * d1)


def barrier_fraction(deformable: bool, fraction: float = MDB_ENERGY_FRACTION) -> float:
    return fraction if deformable else 0.0


@dataclass(frozen=True)
class Split:
    d1: float
    energia_total_j: float
    energia_vehiculo_j: float
    energia_barrera_j: float

    @property
    def fraccion_barrera(self) -> float:
        return self.energia_barrera_j / self.energia_total_j


def solve_d1(
    energy_total_j: float,
    d0: float,
    profile_m: Sequence[float],
    width_m: float,
    offset_deg: float,
    deformable: bool,
    fraction: float = MDB_ENERGY_FRACTION,
    tol: float = 1e-6,
) -> Split | None:
    """El d1 con el que el vehículo absorbe su parte de `energy_total_j` (None si no hay
    solución: el umbral G ya supera esa energía, o haría falta una rigidez absurda)."""
    eb = barrier_fraction(deformable, fraction) * energy_total_j
    ev = energy_total_j - eb

    def vehicle(d1: float) -> float:
        return crush_energy(profile_m, width_m, from_d(d0, d1), offset_deg)

    lo, hi = 1e-9, D1_MAX
    if vehicle(lo) >= ev or vehicle(hi) < ev:
        return None
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if vehicle(mid) < ev:
            lo = mid
        else:
            hi = mid
        if hi - lo < tol * max(1.0, hi):
            break
    return Split(0.5 * (lo + hi), energy_total_j, ev, eb)


def reduced_mass(m1: float, m2: float) -> float:
    return m1 * m2 / (m1 + m2)


def rear_d0(mass_kg: float, barrier_kg: float, width_m: float) -> float:
    """d0 trasero de Prasad: G·L = ½ μ v0² con v0 = 16 km/h contra la barrera de la prueba."""
    g_per_m = 0.5 * reduced_mass(mass_kg, barrier_kg) * (REAR_ONSET_KMH / 3.6) ** 2 / width_m
    return math.sqrt(2.0 * g_per_m)


def predicted_delta_v(
    k: Stiffness,
    profile_m: Sequence[float],
    width_m: float,
    offset_deg: float,
    deformable: bool,
    mass_kg: float,
    barrier_kg: float,
) -> float:
    """ΔV (m/s) del vehículo con el cálculo del solver: su energía más la de la barrera (la misma
    fracción del total) y momento en 1-D."""
    ev = crush_energy(profile_m, width_m, k, offset_deg)
    return delta_v_pair(ev / (1.0 - barrier_fraction(deformable)), mass_kg, barrier_kg)[0]


# --- Pruebas ------------------------------------------------------------------------------------

# Barrera deformable de FMVSS 214 (1,368 kg nominales), la de las pruebas de Johnson (2011).
MDB_MASS_RANGE_KG = (1340.0, 1400.0)
SIDE_CRAB_DEG = (26.0, 27.0)
# Barrera rígida plana de FMVSS 301 (4,000 lb ≈ 1,814 kg).
RIGID_MASS_RANGE_KG = (1750.0, 1850.0)
PLANE_BY_IMPACT_ANGLE = {90.0: "R", 270.0: "L", 180.0: "B"}
ZONE_BY_PLANE = {"R": "lateral", "L": "lateral", "B": "trasera"}
NORMAL_BY_PLANE = {"R": 90.0, "L": 270.0, "B": 180.0}


@dataclass(frozen=True)
class MdbTest:
    test_no: int
    zona: str
    clase: str
    model_year: int
    make: str
    model: str
    test_type: str
    mass_kg: float
    barrier_kg: float
    barrier: str  # "deformable" | "rigida"
    speed_ms: float
    plano: str
    offset_deg: float
    profile_m: tuple[float, ...]
    width_m: float
    d0: float
    d1: float
    a_n_m: float
    b_n_m2: float
    energia_total_j: float
    fraccion_barrera: float

    @property
    def deformable(self) -> bool:
        return self.barrier == "deformable"

    @property
    def delta_v_ms(self) -> float:
        """ΔV del vehículo con momento en 1-D y restitución cero (la convención del solver)."""
        return self.speed_ms * self.barrier_kg / (self.mass_kg + self.barrier_kg)


def _f(row: dict[str, str], key: str) -> float | None:
    v = row.get(key, "")
    try:
        return float(v) if v not in {"", "None"} else None
    except ValueError:
        return None


def _in(x: float | None, rng: tuple[float, float]) -> bool:
    return x is not None and rng[0] <= x <= rng[1]


def _barrier_kind(row: dict[str, str]) -> str | None:
    model = (row.get("model") or "").upper()
    mass = _f(row, "test_weight_kg")
    if (row.get("make") or "").upper() != "NHTSA":
        return None
    if "DEFORMABLE" in model and _in(mass, MDB_MASS_RANGE_KG):
        return "deformable"
    if "FLAT" in model and _in(mass, RIGID_MASS_RANGE_KG):
        return "rigida"
    return None


def load_tests(csv_path: Path = CSV_PATH) -> tuple[list[MdbTest], dict[str, int]]:
    """Empareja barrera y vehículo de cada prueba, filtra y deriva la rigidez de cada una."""
    by_test: dict[str, list[dict[str, str]]] = {}
    with csv_path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            by_test.setdefault(row["test_no"], []).append(row)
    counts: dict[str, int] = {"total": len(by_test), "usadas": 0}

    def drop(reason: str) -> None:
        counts[reason] = counts.get(reason, 0) + 1

    tests: list[MdbTest] = []
    for test_no, rows in sorted(by_test.items(), key=lambda kv: int(float(kv[0]))):
        barriers = [r for r in rows if (r.get("make") or "").upper() == "NHTSA"]
        others = [r for r in rows if r not in barriers]
        if len(barriers) != 1 or len(others) != 1:
            drop("no_es_barrera_contra_un_vehiculo")
            continue
        bar, veh = barriers[0], others[0]
        kind = _barrier_kind(bar)
        if kind is None:
            drop("barrera_no_estandar")
            continue
        plane = PLANE_BY_IMPACT_ANGLE.get(_f(veh, "impact_angle_deg") or -1.0)
        if plane is None:
            drop("angulo_de_impacto_no_estandar")
            continue
        zona = ZONE_BY_PLANE[plane]
        crab = _f(bar, "crabbed_angle_deg") or 0.0
        if zona == "lateral" and (kind != "deformable" or not _in(crab, SIDE_CRAB_DEG)):
            drop("lateral_no_fmvss214")
            continue
        if zona == "trasera" and crab != 0.0:
            drop("trasera_oblicua")
            continue
        if (veh.get("vehicle_modification") or "").upper() not in {"", "PRODUCTION VEHICLE"}:
            drop("vehiculo_modificado")
            continue
        year = _f(veh, "model_year")
        if year is None or year < MIN_MODEL_YEAR:
            drop("modelo_anterior_a_1995")
            continue
        speed = _f(bar, "speed_kmh") or _f(veh, "closing_speed_kmh")
        mass, bmass = _f(veh, "test_weight_kg"), _f(bar, "test_weight_kg") or 0.0
        length = _f(veh, "length_mm")
        if not speed or not mass or not length:
            drop("sin_velocidad_masa_o_largo")
            continue
        dpd = [_f(veh, f"dpd{i}_mm") for i in range(1, 7)]
        width_mm = _f(veh, "total_indentation_length_mm")
        if any(d is None for d in dpd) or not width_mm or width_mm <= 0:
            drop("sin_perfil_de_dano")
            continue
        if any((d or 0.0) >= SENTINEL_MM for d in dpd) or width_mm >= 10 * SENTINEL_MM:
            drop("valor_centinela_sin_medir")
            continue
        if width_mm / 1000.0 < MIN_DAMAGE_LENGTH_M:
            drop("largo_de_dano_implausible")
            continue
        # Un valor negativo es la lámina abombada hacia fuera: no hay aplastamiento ahí.
        profile = tuple(max(0.0, d or 0.0) / 1000.0 for d in dpd)
        if statistics.fmean(profile) <= 0.02:
            drop("aplastamiento_implausible")
            continue
        clase = classify(veh.get("body_type") or "", length / 1000.0)
        if clase is None:
            drop("carroceria_no_mapeada")
            continue
        pdof = _f(veh, "pdof_deg")
        if pdof is None:
            # Sin PDOF registrada: la del avance oblicuo de la barrera.
            pdof = NORMAL_BY_PLANE[plane] + (crab if plane == "L" else -crab)
        offset = abs(pdof_offset(plane, pdof))
        if offset > 45.0:
            drop("pdof_incoherente_con_el_plano")
            continue
        width = width_mm / 1000.0
        d0 = SIDE_D0 if zona == "lateral" else rear_d0(mass, bmass, width)
        v = speed / 3.6
        e_tot = 0.5 * reduced_mass(mass, bmass) * v * v
        split = solve_d1(e_tot, d0, profile, width, offset, kind == "deformable")
        if split is None:
            drop("sin_solucion_de_energia")
            continue
        k = from_d(d0, split.d1)
        tests.append(
            MdbTest(
                test_no=int(float(test_no)),
                zona=zona,
                clase=clase,
                model_year=int(year),
                make=veh.get("make") or "",
                model=veh.get("model") or "",
                test_type=veh.get("test_type") or "",
                mass_kg=mass,
                barrier_kg=bmass,
                barrier=kind,
                speed_ms=v,
                plano=plane,
                offset_deg=round(offset, 3),
                profile_m=profile,
                width_m=width,
                d0=round(d0, 4),
                d1=round(split.d1, 4),
                a_n_m=round(k.a, 1),
                b_n_m2=round(k.b, 1),
                energia_total_j=round(e_tot, 1),
                fraccion_barrera=round(split.fraccion_barrera, 4),
            )
        )
        counts["usadas"] += 1
    return tests, counts


# --- Evaluación ---------------------------------------------------------------------------------


def _predict(t: MdbTest, k: Stiffness) -> float:
    return predicted_delta_v(
        k, t.profile_m, t.width_m, t.offset_deg, t.deformable, t.mass_kg, t.barrier_kg
    )


def _median_k(tests: list[MdbTest]) -> Stiffness:
    return Stiffness(
        statistics.median(t.a_n_m for t in tests), statistics.median(t.b_n_m2 for t in tests)
    )


def _median_k_with(tests: list[MdbTest], fraction: float) -> Stiffness | None:
    """Mediana de la clase si la barrera deformable absorbiera `fraction` (sensibilidad)."""
    ks: list[Stiffness] = []
    for t in tests:
        s = solve_d1(
            t.energia_total_j, t.d0, t.profile_m, t.width_m, t.offset_deg, t.deformable, fraction
        )
        if s is not None:
            ks.append(from_d(t.d0, s.d1))
    if not ks:
        return None
    return Stiffness(statistics.median(k.a for k in ks), statistics.median(k.b for k in ks))


def _mad(values: list[float]) -> float:
    med = statistics.median(values)
    return statistics.median(abs(v - med) for v in values)


def _r(x: float | None, nd: int = 2) -> float | None:
    return None if x is None else round(x, nd)


def _kgf(k: Stiffness | None) -> dict[str, float] | None:
    if k is None:
        return None
    return {
        "a_kgf_cm": round(k.a / KGF_PER_CM_TO_N_PER_M, 2),
        "b_kgf_cm2": round(k.b / KGF_PER_CM2_TO_N_PER_M2, 2),
    }


def evaluate(tests: list[MdbTest]) -> dict[str, Any]:
    zones: dict[str, Any] = {}
    for zona in ("lateral", "trasera"):
        rows_z = [t for t in tests if t.zona == zona]
        by_class: dict[str, list[MdbTest]] = {}
        for t in rows_z:
            by_class.setdefault(t.clase, []).append(t)
        per_class: dict[str, Any] = {}
        errs: list[float] = []
        errs_base: list[float] = []
        signed: list[float] = []
        signed_base: list[float] = []
        for clase, rows in sorted(by_class.items()):
            k_med = _median_k(rows)
            loo: list[float] = []
            base: list[float] = []
            if len(rows) >= MIN_TESTS_PER_CLASS:
                for i, t in enumerate(rows):
                    k = _median_k(rows[:i] + rows[i + 1 :])
                    e = (_predict(t, k) - t.delta_v_ms) * 3.6
                    eb = (_predict(t, FALLBACK) - t.delta_v_ms) * 3.6
                    loo.append(abs(e))
                    base.append(abs(eb))
                    signed.append(e)
                    signed_base.append(eb)
                errs += loo
                errs_base += base
            deformables = [t for t in rows if t.deformable]
            per_class[clase] = {
                "n": len(rows),
                "n_barrera_deformable": len(deformables),
                "a_n_m": round(k_med.a, 1),
                "b_n_m2": round(k_med.b, 1),
                **(_kgf(k_med) or {}),
                "muestras_ab": sorted([round(t.a_n_m), round(t.b_n_m2)] for t in rows),
                "a_mad_kgf_cm": round(_mad([t.a_n_m for t in rows]) / KGF_PER_CM_TO_N_PER_M, 2),
                "b_mad_kgf_cm2": round(_mad([t.b_n_m2 for t in rows]) / KGF_PER_CM2_TO_N_PER_M2, 2),
                "masa_media_kg": round(statistics.fmean(t.mass_kg for t in rows), 1),
                "aplastamiento_medio_mm": round(
                    1000 * statistics.fmean(statistics.fmean(t.profile_m) for t in rows), 1
                ),
                "sensibilidad_barrera_5_por_ciento": _kgf(
                    _median_k_with(rows, NHTSA_MDB_ENERGY_FRACTION)
                )
                if deformables
                else None,
                "mae_dv_kmh": _r(statistics.fmean(loo)) if loo else None,
                "respaldo_mae_dv_kmh": _r(statistics.fmean(base)) if base else None,
                "evaluada": len(rows) >= MIN_TESTS_PER_CLASS,
            }
        zones[zona] = {
            "n": len(rows_z),
            "por_barrera": {
                b: sum(1 for t in rows_z if t.barrier == b) for b in ("deformable", "rigida")
            },
            "global": {
                "n_evaluadas": len(errs),
                "mae_dv_kmh": _r(statistics.fmean(errs)) if errs else None,
                "sesgo_dv_kmh": _r(statistics.fmean(signed)) if signed else None,
                "respaldo_mae_dv_kmh": _r(statistics.fmean(errs_base)) if errs_base else None,
                "respaldo_sesgo_dv_kmh": _r(statistics.fmean(signed_base)) if signed_base else None,
            },
            "clases": per_class,
        }
    return zones


ZONE_NOTES = {
    "lateral": (
        "Mediana de pruebas FMVSS 214 y NCAP lateral (barrera deformable de NHTSA a 27°); "
        "d0 = 63.3 √N de NHTSA y 13.6 % de la energía en la barrera (Johnson 2011). E2 lateral."
    ),
    "trasera": (
        "Mediana de pruebas FMVSS 301 (barrera rígida plana o la deformable de NHTSA); umbral de "
        "daño de Prasad (16 km/h contra la barrera). La barrera deformable se lleva el 13.6 % "
        "medido en costados: en la trasera es un supuesto. E2 trasera."
    ),
}


def write_stiffness_zones(zones: dict[str, Any], path: Path = STIFFNESS_PATH) -> Path:
    """Agrega (o reemplaza) las zonas lateral y trasera en la tabla que escribe E2 frontal."""
    doc: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    clases: dict[str, Any] = doc.setdefault("clases", {})
    for entry in clases.values():
        for zona in ("lateral", "trasera"):
            entry.pop(zona, None)
    for zona, z in zones.items():
        for clase, c in z["clases"].items():
            if c["n"] < MIN_TESTS_PER_CLASS:
                continue
            clases.setdefault(clase, {})[zona] = {
                "a_n_m": c["a_n_m"],
                "b_n_m2": c["b_n_m2"],
                "origen": "nhtsa",
                "n_tests": c["n"],
                "nota": ZONE_NOTES[zona],
                "muestras_ab": c["muestras_ab"],
            }
    # Mismo orden de llaves que escribe e2-barrier: el archivo no depende del orden de ejecución.
    out: dict[str, Any] = {
        **TABLE_HEADER,
        "parametros": doc.get("parametros", {}),
        "parametros_lateral_trasera": {
            "d0_lateral_raiz_n": SIDE_D0,
            "umbral_trasero_kmh": REAR_ONSET_KMH,
            "fraccion_barrera_deformable": MDB_ENERGY_FRACTION,
            "anio_minimo": MIN_MODEL_YEAR,
        },
        "clases": {
            k: {z: v[z] for z in ("frontal", "lateral", "trasera") if z in v}
            for k, v in sorted(clases.items())
        },
    }
    path.write_text(
        json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    return path


def main(
    csv_path: Path = CSV_PATH,
    results_dir: Path = RESULTS_DIR,
    stiffness_path: Path = STIFFNESS_PATH,
) -> Path:
    tests, counts = load_tests(csv_path)
    zones = evaluate(tests)
    payload = {
        "fuente": {
            "nombre": (
                "NHTSA Vehicle Crash Test Database (API pública), pruebas de barrera móvil contra "
                "el vehículo (ITV)"
            ),
            "archivo": str(csv_path.relative_to(csv_path.parents[3])),
        },
        "filtros": {
            "lateral": (
                "barrera deformable de NHTSA (1,340–1,400 kg) con avance oblicuo de 26–27°, "
                "impacto a 90° o 270°"
            ),
            "trasera": (
                "impacto a 180° sin avance oblicuo: barrera rígida plana (1,750–1,850 kg) o la "
                "deformable de NHTSA"
            ),
            "vehiculo": (
                "de producción, modelo 1995 o posterior, DPD1–DPD6 medidos (sin centinelas) y "
                f"largo de daño ≥ {MIN_DAMAGE_LENGTH_M} m"
            ),
        },
        "conteos": counts,
        "metodo": {
            "energia_total": "½ μ v², momento en 1-D y restitución cero (como el solver)",
            "d0_lateral_raiz_n": SIDE_D0,
            "umbral_trasero_kmh": REAR_ONSET_KMH,
            "fraccion_barrera_deformable": MDB_ENERGY_FRACTION,
            "fraccion_barrera_fuente": (
                "Johnson (2011): promedio de 70 pruebas laterales de NHTSA con el aplastamiento de "
                "la cara medido (2.49–49.1 %); NHTSA supone 5 % (sensibilidad por clase). En "
                "las traseras con barrera deformable se usa la misma fracción: no hay medición "
                "(supuesto)"
            ),
            "evaluacion": (
                "dejar-uno-fuera por clase (≥ 5 pruebas): ΔV del vehículo con el cálculo del "
                "solver contra el de momento 1-D de la prueba; alternativa: respaldo 'supuesto'"
            ),
        },
        "zonas": {
            z: {
                **v,
                "clases": {
                    c: {kk: vv for kk, vv in cv.items() if kk != "muestras_ab"}
                    for c, cv in v["clases"].items()
                },
            }
            for z, v in zones.items()
        },
        "pruebas_usadas": [
            {k: v for k, v in asdict(t).items() if k != "profile_m"}
            | {"perfil_mm": [round(c * 1000) for c in t.profile_m]}
            for t in tests
        ],
    }
    write_stiffness_zones(zones, stiffness_path)
    return write_result("e2_mdb", payload, results_dir=results_dir)


__all__ = [
    "MdbTest",
    "Split",
    "barrier_fraction",
    "evaluate",
    "from_d",
    "load_tests",
    "main",
    "predicted_delta_v",
    "rear_d0",
    "solve_d1",
    "write_stiffness_zones",
]
