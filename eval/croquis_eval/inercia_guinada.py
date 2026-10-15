"""Inercia de guiñada medida: radio de giro por grupo de carrocería desde la base de NHTSA.

Datos: base de parámetros inerciales de vehículos ligeros de NHTSA (VRTC; impresa en Heydinger et
al., SAE 1999-01-1336), ``data/processed/nhtsa/inercia.csv`` (``croquis-data inercia build``).

Modelo: el radio de giro de guiñada es proporcional al largo total, k_z = c·L, con c la mediana
del grupo (auto, SUV, pickup, van), así que I_z = m·(c·L)². Es la forma que reporta Johnson
(2011) para autos con la misma base (29.1 % del largo).

Evaluación (dejar uno fuera por grupo): error relativo de $I_z$ con la mediana de los demás, contra
dos alternativas simples que no usan la base:

- la placa rectangular uniforme que usaba el solver, m·(L² + W²)/12, con el ancho como la vía
  media más 0.20 m (la base no trae el ancho; es un supuesto con poco peso: el largo domina);
- el índice dinámico igual a 1, I_z = m·a·b, con a y b las distancias del centro de masa a
  los ejes.

Filtros (contados): guiñada, masa, largo, centro de masa y vías medidos; sin lastre y con 0 o 1
ocupantes; sin estabilizadores laterales ("outriggers") ni lastre o instrumentación en los
comentarios; un vehículo repetido (año, nombre y VIN) cuenta una sola vez, el primero.

Salidas: ``eval/results/inercia_guinada.json`` y ``solver/croquis_solver/data/yaw_inertia.json``.
"""

from __future__ import annotations

import json
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from croquis_data.nhtsa_inercia import CSV_PATH, load
from croquis_eval.results import RESULTS_DIR, write_result

TABLE_PATH = (
    Path(__file__).resolve().parents[2] / "solver" / "croquis_solver" / "data" / "yaw_inertia.json"
)
GROUP_BY_BODY = {
    "2S": "auto",
    "2C": "auto",
    "4S": "auto",
    "3H": "auto",
    "5H": "auto",
    "SW": "auto",
    "CV": "auto",
    "MP": "suv",
    "PU": "pickup",
    "VN": "van",
}
GROUPS = ("auto", "suv", "pickup", "van")
# Clases del contrato que corresponden a cada grupo. Autobús, camiones y vehículos de dos ruedas no
# están en la base: siguen con la placa uniforme marcada como supuesto.
GROUP_BY_CLASS = {
    "sedan_compacto": "auto",
    "sedan_mediano": "auto",
    "hatchback": "auto",
    "suv_compacta": "suv",
    "suv_grande": "suv",
    "pickup": "pickup",
    "van": "van",
    "microbus_combi": "van",
}
WIDTH_OVER_TRACK_M = 0.20  # supuesto de la alternativa de la placa
MIN_PER_GROUP = 5  # con menos, el grupo no da coeficiente y sus clases usan la placa
EXCLUDED_COMMENTS = ("outrigger", "ballast", "instrument")


@dataclass(frozen=True)
class Vehicle:
    vehicle: str
    model_year: int
    body_type: str
    group: str
    mass_kg: float
    length_m: float
    wheelbase_m: float
    track_m: float
    cg_from_front_m: float
    yaw_kg_m2: float

    @property
    def k_over_length(self) -> float:
        return (self.yaw_kg_m2 / self.mass_kg) ** 0.5 / self.length_m

    def model(self, c: float) -> float:
        return self.mass_kg * (c * self.length_m) ** 2

    def plate(self) -> float:
        width = self.track_m + WIDTH_OVER_TRACK_M
        return self.mass_kg * (self.length_m**2 + width**2) / 12.0

    def dynamic_index_one(self) -> float:
        a = self.cg_from_front_m
        return self.mass_kg * a * (self.wheelbase_m - a)


def _f(row: dict[str, str], key: str) -> float | None:
    v = row.get(key, "")
    return float(v) if v else None


def load_vehicles(csv_path: Path = CSV_PATH) -> tuple[list[Vehicle], dict[str, int]]:
    counts: dict[str, int] = {"total": 0, "usados": 0}

    def drop(reason: str) -> None:
        counts[reason] = counts.get(reason, 0) + 1

    out: list[Vehicle] = []
    seen: set[tuple[str, str, str]] = set()
    for row in load(csv_path):
        counts["total"] += 1
        group = GROUP_BY_BODY.get(row["body_type"])
        if group is None:
            drop("carroceria_sin_grupo")
            continue
        yaw, mass, length = _f(row, "yaw_kg_m2"), _f(row, "mass_kg"), _f(row, "length_m")
        cg = _f(row, "cg_from_front_axle_m")
        tf, tr = _f(row, "track_front_m"), _f(row, "track_rear_m")
        if not (yaw and mass and length and cg and tf and tr):
            drop("sin_guinada_masa_largo_cg_o_vias")
            continue
        if row["occupants"] not in {"0", "1"} or row["ballast_n"] != "0":
            drop("con_lastre_u_ocupantes")
            continue
        if any(k in row["comment"].lower() for k in EXCLUDED_COMMENTS):
            drop("estabilizadores_lastre_o_instrumentacion")
            continue
        key = (row["model_year"], row["vehicle"], row["vin"])
        if key in seen:
            drop("medicion_repetida")
            continue
        seen.add(key)
        out.append(
            Vehicle(
                vehicle=row["vehicle"],
                model_year=int(row["model_year"]),
                body_type=row["body_type"],
                group=group,
                mass_kg=mass,
                length_m=length,
                wheelbase_m=float(row["wheelbase_m"]),
                track_m=(tf + tr) / 2.0,
                cg_from_front_m=cg,
                yaw_kg_m2=yaw,
            )
        )
        counts["usados"] += 1
    return out, counts


def _stats(errs: list[float]) -> dict[str, float]:
    return {
        "error_relativo_medio": round(statistics.fmean(abs(e) for e in errs), 4),
        "sesgo_relativo": round(statistics.fmean(errs), 4),
    }


def evaluate(vehicles: list[Vehicle]) -> dict[str, Any]:
    groups: dict[str, Any] = {}
    all_model: list[float] = []
    all_plate: list[float] = []
    all_dyn: list[float] = []
    for g in GROUPS:
        rows = [v for v in vehicles if v.group == g]
        if len(rows) < MIN_PER_GROUP:
            groups[g] = {"n": len(rows)}
            continue
        model: list[float] = []
        plate: list[float] = []
        dyn: list[float] = []
        for i, v in enumerate(rows):
            others = rows[:i] + rows[i + 1 :]
            c = statistics.median(o.k_over_length for o in others)
            model.append(v.model(c) / v.yaw_kg_m2 - 1.0)
            plate.append(v.plate() / v.yaw_kg_m2 - 1.0)
            dyn.append(v.dynamic_index_one() / v.yaw_kg_m2 - 1.0)
        ratios = [v.k_over_length for v in rows]
        groups[g] = {
            "n": len(rows),
            "c_radio_de_giro_sobre_largo": round(statistics.median(ratios), 4),
            "desviacion": round(statistics.stdev(ratios), 4),
            "p10_p90": [
                round(statistics.quantiles(ratios, n=10)[0], 4),
                round(statistics.quantiles(ratios, n=10)[-1], 4),
            ],
            "modelo": _stats(model),
            "placa_uniforme": _stats(plate),
            "indice_dinamico_1": _stats(dyn),
        }
        all_model += model
        all_plate += plate
        all_dyn += dyn
    return {
        "grupos": groups,
        "global": {
            "n": len(all_model),
            **(
                {
                    "modelo": _stats(all_model),
                    "placa_uniforme": _stats(all_plate),
                    "indice_dinamico_1": _stats(all_dyn),
                }
                if all_model
                else {}
            ),
        },
    }


def write_table(report: dict[str, Any], path: Path = TABLE_PATH) -> Path:
    doc = {
        "_generado_por": (
            "uv run croquis-eval inercia-guinada (eval/croquis_eval/inercia_guinada.py)"
        ),
        "_fuente": (
            "NHTSA VRTC, Light Vehicle Inertial Parameter Database (Heydinger et al., SAE "
            "1999-01-1336) vía data/processed/nhtsa/inercia.csv; ver data/SOURCES.md"
        ),
        "_nota": (
            "Radio de giro de guiñada k = c·L por grupo (mediana); I = m·(c·L)². Las clases sin "
            "grupo usan la placa uniforme del solver (supuesto)."
        ),
        "grupos": {
            g: {
                "c": v["c_radio_de_giro_sobre_largo"],
                "desviacion": v["desviacion"],
                "n": v["n"],
            }
            for g, v in report["grupos"].items()
            if "c_radio_de_giro_sobre_largo" in v
        },
        "clases": dict(sorted(GROUP_BY_CLASS.items())),
    }
    path.write_text(
        json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    return path


def main(csv_path: Path = CSV_PATH, results_dir: Path = RESULTS_DIR) -> Path:
    vehicles, counts = load_vehicles(csv_path)
    report = evaluate(vehicles)
    write_table(report)
    payload = {
        "fuente": {
            "nombre": (
                "NHTSA VRTC, Light Vehicle Inertial Parameter Database (PDF métrico; Heydinger et "
                "al., SAE 1999-01-1336)"
            ),
            "archivo": str(csv_path.relative_to(csv_path.parents[3])),
        },
        "conteos": counts,
        "metodo": {
            "modelo": "k_z = c·L con c la mediana del grupo; I_z = m·(c·L)²",
            "evaluacion": "dejar-uno-fuera por grupo: error relativo de I_z",
            "alternativas": {
                "placa_uniforme": (
                    "m·(L² + W²)/12 con W = vía media + 0.20 m (supuesto; la base no trae el ancho)"
                ),
                "indice_dinamico_1": "m·a·b con a y b las distancias del CG a los ejes",
            },
            "grupos_por_carroceria": GROUP_BY_BODY,
            "grupos_por_clase": GROUP_BY_CLASS,
        },
        **report,
    }
    return write_result("inercia_guinada", payload, results_dir=results_dir)


__all__ = ["GROUP_BY_CLASS", "Vehicle", "evaluate", "load_vehicles", "main", "write_table"]
