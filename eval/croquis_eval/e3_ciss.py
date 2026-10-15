"""E3: ΔV reconstruido desde el daño medido contra el ΔV que registró el EDR (PLAN §8).

Datos: NHTSA CISS 2017–2024 (`data/processed/ciss/e3_vehiculos.csv`, ver `croquis_data.ciss`).
Para cada vehículo y evento con EDR válido y perfil de aplastamiento medido, Croquis estima el ΔV
con CRASH3 (`croquis_solver.inversion.delta_v_from_damage`): rigidez de la clase muestreada con las
pruebas de NHTSA, energía de los dos vehículos o del vehículo contra un objeto rígido, y percentiles
p10–p50–p90. La alternativa es lo que CISS publica: el ΔV de WinSMASH. Las dos se comparan contra
el EDR en los mismos casos ("comparar hacia arriba": WinSMASH es la herramienta de referencia de
NHTSA y el EDR es la medición).

Métricas: error absoluto medio y mediano, sesgo (error con signo), proporción a ±10 km/h, por rango
de ΔV del EDR, por plano de daño y por tipo de contacto; cobertura del intervalo p10–p90 de Croquis.
"""

from __future__ import annotations

import csv
import json
import statistics
from pathlib import Path
from typing import Any

from croquis_eval.results import write_result
from croquis_solver.inversion import CALIBRATION_PATH, Damage, delta_v_from_damage

CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "ciss" / "e3_vehiculos.csv"
SEED = 20261014
SAMPLES = 200
BINS = ((0.0, 16.0), (16.0, 32.0), (32.0, 48.0), (48.0, 1e9))
# Partición por año: el dev calibra la dispersión del modelo; el test solo se reporta.
DEV_YEARS = range(2017, 2022)
TEST_YEARS = range(2022, 2025)
TARGET_COVERAGE = 0.80  # intervalo p10–p90


def _damage(row: dict[str, str], prefix: str = "") -> Damage | None:
    raw = row.get(f"{prefix}perfil_cm") or ""
    if not raw or not row.get(f"{prefix}ancho_dano_cm") or not row.get(f"{prefix}masa_kg"):
        return None
    clase = row["clase"] if not prefix else row.get("otro_clase", "")
    if not clase:
        return None
    return Damage(
        clase=clase,
        masa_kg=float(row[f"{prefix}masa_kg"]),
        plano=row[f"{prefix}plano"],
        pdof_deg=float(row[f"{prefix}pdof"]),
        perfil_m=tuple(c / 100.0 for c in json.loads(raw)),
        ancho_m=float(row[f"{prefix}ancho_dano_cm"]) / 100.0,
    )


def estimate(row: dict[str, str], seed: int, sigma: float = 0.0) -> dict[str, float] | None:
    own = _damage(row)
    if own is None:
        return None
    if row["contacto"] == "objeto_rigido":
        d = delta_v_from_damage(own, rigid=True, seed=seed, n=SAMPLES, sigma=sigma)
    else:
        other = _damage(row, "otro_")
        if other is None:
            return None
        d = delta_v_from_damage(own, other, seed=seed, n=SAMPLES, sigma=sigma)
    return {"p10": d.p10, "p50": d.p50, "p90": d.p90}


def _stats(errs: list[float]) -> dict[str, Any]:
    if not errs:
        return {"n": 0}
    abs_e = [abs(e) for e in errs]
    return {
        "n": len(errs),
        "error_absoluto_medio_kmh": round(statistics.fmean(abs_e), 2),
        "error_absoluto_mediano_kmh": round(statistics.median(abs_e), 2),
        "sesgo_kmh": round(statistics.fmean(errs), 2),
        "a_10_kmh": round(sum(1 for e in abs_e if e <= 10) / len(errs), 4),
    }


def _bin(dv: float) -> str:
    for lo, hi in BINS:
        if lo <= dv < hi:
            return f"{int(lo)}-{int(hi)}" if hi < 1e8 else f"{int(lo)}+"
    return "?"


def load_rows(csv_path: Path, years: range) -> list[dict[str, str]]:
    return [r for r in csv.DictReader(csv_path.open(encoding="utf-8")) if int(r["anio"]) in years]


def coverage(rows: list[dict[str, str]], sigma: float) -> float:
    hit = n = 0
    for i, r in enumerate(rows):
        est = estimate(r, SEED + i, sigma)
        if est is None:
            continue
        n += 1
        hit += int(est["p10"] <= float(r["dv_edr_kmh"]) <= est["p90"])
    return hit / n if n else 0.0


def calibrate(csv_path: Path = CSV_PATH, write: bool = True) -> dict[str, Any]:
    """σ del error del modelo (log ΔV) para que el intervalo p10–p90 cubra el 80 % en el dev."""
    rows = load_rows(csv_path, DEV_YEARS)
    lo, hi = 0.0, 1.5
    for _ in range(14):
        mid = (lo + hi) / 2
        if coverage(rows, mid) < TARGET_COVERAGE:
            lo = mid
        else:
            hi = mid
    sigma = round(hi, 4)
    doc = {
        "_generado_por": "uv run croquis-eval e3-ciss (eval/croquis_eval/e3_ciss.py)",
        "_nota": "Dispersión del error del ΔV desde el daño (log), calibrada para que el "
        "intervalo p10–p90 cubra el 80 % del ΔV del EDR en CISS 2017–2021 (dev). El test "
        "(2022–2024) no interviene.",
        "sigma_log_dv": sigma,
        "cobertura_dev": round(coverage(rows, sigma), 4),
        "anios_dev": [DEV_YEARS.start, DEV_YEARS.stop - 1],
        "semilla": SEED,
        "muestras_por_caso": SAMPLES,
    }
    if write:
        CALIBRATION_PATH.write_text(
            json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
        )
    return doc


def evaluate(
    csv_path: Path = CSV_PATH,
    years: range = TEST_YEARS,
    sigma: float = 0.0,
    limit: int | None = None,
) -> dict[str, Any]:
    rows = load_rows(csv_path, years)
    if limit is not None:
        rows = rows[:limit]
    estimable = comparables = 0
    groups: dict[str, dict[str, list[float]]] = {}
    covered = covered_n = 0
    all_croquis: list[float] = []

    def add(group: str, who: str, err: float) -> None:
        groups.setdefault(group, {"croquis": [], "winsmash": []})[who].append(err)

    for i, r in enumerate(rows):
        est = estimate(r, SEED + i, sigma)
        if est is None:
            continue
        estimable += 1
        edr = float(r["dv_edr_kmh"])
        err_c = est["p50"] - edr
        all_croquis.append(err_c)
        covered_n += 1
        covered += int(est["p10"] <= edr <= est["p90"])
        if not r["dv_winsmash_kmh"]:
            continue
        comparables += 1
        err_w = float(r["dv_winsmash_kmh"]) - edr
        plane = (
            "lateral" if r["plano"] in ("L", "R") else {"F": "frontal", "B": "trasero"}[r["plano"]]
        )
        for g in ("todos", f"edr_{_bin(edr)}_kmh", f"plano_{plane}", f"contacto_{r['contacto']}"):
            add(g, "croquis", err_c)
            add(g, "winsmash", err_w)
    comparison = {
        g: {"croquis": _stats(v["croquis"]), "winsmash": _stats(v["winsmash"])}
        for g, v in sorted(groups.items())
    }
    return {
        "anios": [years.start, years.stop - 1],
        "filas": len(rows),
        "estimables_por_croquis": estimable,
        "comparables_con_winsmash": comparables,
        "croquis_en_todos_los_estimables": _stats(all_croquis),
        "cobertura_intervalo_p10_p90": round(covered / covered_n, 4) if covered_n else None,
        "comparacion": comparison,
    }


def main(csv_path: Path = CSV_PATH) -> str:
    payload = {
        "descripcion": "E3: ΔV de Croquis desde el daño medido (CRASH3 con rigidez de NHTSA "
        "muestreada) y ΔV de WinSMASH, contra el ΔV del EDR, en NHTSA CISS 2017–2024.",
        "fuente": "data/processed/ciss/e3_vehiculos.csv (uv run croquis-data ciss build)",
        "metodo": {
            "muestras_por_caso": SAMPLES,
            "semilla": SEED,
            "dano": "perfil C1–C6 medido y Field L de CISS; energía CRASH3 con corrección por "
            "PDOF; entre dos vehículos con la energía de ambos y conservación de momento "
            "(velocidad común); contra objeto rígido con velocidad de barrera y restitución en "
            "[0, 0.2]",
            "rigidez": "frontal: bootstrap de las pruebas de barrera de NHTSA de la clase (E2); "
            "lateral: bootstrap de las pruebas FMVSS 214 y NCAP lateral de la clase (E2 lateral, "
            "ADR 0013); trasera: bootstrap de las pruebas FMVSS 301 con barrera rígida de la "
            "clase (ADR 0014); sin pruebas suficientes, respaldo genérico con pendiente en "
            "[0.7, 1.4] (supuesto)",
            "masa": "peso vacío de CISS + 75 kg por ocupante (mínimo 1), ±5 %",
            "edr": "ΔV máximo resultante (longitudinal y lateral) del evento ligado por "
            "CDCEVENT; solo longitudinal en frontales y traseros sin lateral reportado",
        },
    }
    cal = calibrate(csv_path)
    payload["calibracion"] = {k: v for k, v in cal.items() if not k.startswith("_")}
    payload["test"] = evaluate(csv_path, TEST_YEARS, cal["sigma_log_dv"])
    payload["dev"] = evaluate(csv_path, DEV_YEARS, cal["sigma_log_dv"])
    return str(write_result("e3_ciss", payload, seed=SEED))


__all__ = ["evaluate", "main"]
