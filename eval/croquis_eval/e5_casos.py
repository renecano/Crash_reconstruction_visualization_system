"""Casos de E5 (F10): pruebas de NHTSA y vehículos de CISS con aplastamiento medido.

Un caso es un vehículo con su perfil de aplastamiento medido en seis puntos (C1–C6 o DPD1–DPD6),
el largo del daño L y el centro del daño D, más lo necesario para reproducirlo en Croquis: clase,
masa, cara dañada y la velocidad (NHTSA) o el ΔV del EDR (CISS). Aquí también se fija el tipo de
impacto con reglas escritas antes de medir (ADR 0032):

- NHTSA, vehículo contra barrera (VTB):
  - poste o luminaria → «poste»;
  - barrera desplazada (EEVC u offset ≠ 0) o barrera en ángulo → «frontal_desplazado»;
  - barrera rígida plana o de celdas de carga, de frente → «frontal».

  Los atenuadores y las barreras «OTHER» quedan fuera: no se sabe cómo se deforman.
- NHTSA, impactor contra vehículo (ITV):
  - costado → «lateral»;
  - FMVSS 301 → «alcance»;
  - barrera móvil oblicua de 15° contra el frente → «frontal_desplazado».

  Las filas de la barrera móvil (``body_type`` «NOT APPLICABLE») no son vehículos.
- CISS:
  - objeto angosto (poste o árbol) → «poste»;
  - frente con daño repartido en toda la cara (zona horizontal D) → «frontal»;
  - el resto del frente → «frontal_desplazado»;
  - costados → «lateral»;
  - parte trasera → «alcance».
"""

from __future__ import annotations

import csv
import json
import re
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from croquis_eval.e2_barrier import classify

ROOT = Path(__file__).resolve().parents[2]
VTB_CSV = ROOT / "data" / "processed" / "nhtsa" / "vtb_tests.csv"
ITV_CSV = ROOT / "data" / "processed" / "nhtsa" / "itv_tests.csv"
CISS_CSV = ROOT / "data" / "processed" / "ciss" / "e3_vehiculos.csv"
MEDIA_DIR = ROOT / "data" / "raw" / "nhtsa" / "media"

TIPOS = ("frontal", "frontal_desplazado", "lateral", "alcance", "poste")
LADOS = ("F", "B", "L", "R")
CISS_DEV_YEARS = frozenset(range(2017, 2022))  # como E3: 2017–2021 desarrollo, 2022–2024 test


@dataclass(frozen=True)
class Caso:
    fuente: str  # "nhtsa" o "ciss"
    id: str
    tipo: str
    lado: str  # F, B, L o R
    clase: str
    masa_kg: float
    largo_m: float | None
    ancho_m: float | None
    perfil_m: tuple[float, float, float, float, float, float]  # C1–C6 medidos
    ancho_dano_m: float  # L
    centro_dano_m: float | None  # D en el marco de la fuente (ver docs/data.md)
    velocidad_kmh: float | None  # NHTSA: velocidad de la prueba
    dv_kmh: float | None  # CISS: ΔV del EDR
    anio: int | None
    detalle: str  # barrera, configuración o contacto
    # Vehículo (marca, modelo y año) para que el mismo auto no caiga en desarrollo y en test.
    vehiculo: str = ""


def _f(row: dict[str, str], key: str) -> float | None:
    v = (row.get(key) or "").strip()
    try:
        return float(v) if v not in {"", "None", "null"} else None
    except ValueError:
        return None


def _side(damage_index: str) -> str | None:
    s = (damage_index or "")[2:3].upper()
    return s if s in LADOS else None


def nhtsa_vtb_tipo(row: dict[str, str]) -> str | None:
    shape = (row.get("barrier_shape") or "").upper()
    offset = _f(row, "offset_distance_mm") or 0.0
    angle = _f(row, "barrier_angle_deg") or 0.0
    if "POLE" in shape or "LUMINARE" in shape or "LUMINAIRE" in shape:
        return "poste"
    if shape in {"", "OTHER", "IMPACT ATTENUATOR"} or "ATTENUATOR" in shape:
        return None
    if "OFFSET" in shape or offset != 0.0 or "ANGLED" in shape or angle != 0.0:
        return "frontal_desplazado"
    if "BARRIER" in shape:
        return "frontal"
    return None


def nhtsa_itv_tipo(row: dict[str, str], lado: str) -> str | None:
    test = (row.get("test_type") or "").upper()
    if lado in {"L", "R"}:
        return "lateral"
    if lado == "B" and "301" in test:
        return "alcance"
    if lado == "F" and "RMDB" in test:
        return "frontal_desplazado"
    return None


def _perfil(values: list[float | None], scale: float) -> tuple[float, ...] | None:
    if any(v is None for v in values):
        return None
    out = tuple(float(v) * scale for v in values if v is not None)
    if any(v < 0 for v in out) or max(out) <= 0:
        return None
    return out


def nhtsa_cases(vtb: Path = VTB_CSV, itv: Path = ITV_CSV) -> Iterator[Caso]:
    for path, config in ((vtb, "VTB"), (itv, "ITV")):
        if not path.exists():
            continue
        with path.open(encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                if (row.get("body_type") or "").strip().upper() == "NOT APPLICABLE":
                    continue
                lado = _side(row.get("damage_index", ""))
                if config == "VTB" and lado is None:
                    shape = (row.get("barrier_shape") or "").upper()
                    lado = "F" if "BARRIER" in shape and "POLE" not in shape else None
                if config == "ITV" and lado is None and "301" in (row.get("test_type") or ""):
                    lado = "B"
                if lado is None:
                    continue
                tipo = nhtsa_vtb_tipo(row) if config == "VTB" else nhtsa_itv_tipo(row, lado)
                perfil = _perfil([_f(row, f"dpd{i}_mm") for i in range(1, 7)], 0.001)
                largo_dano = _f(row, "total_indentation_length_mm")
                masa = _f(row, "test_weight_kg")
                length = _f(row, "length_mm")
                clase = classify(row.get("body_type", ""), (length or 0) / 1000)
                if tipo is None or perfil is None or largo_dano is None or largo_dano <= 0:
                    continue
                if masa is None or clase is None:
                    continue
                d = _f(row, "damage_offset_mm")
                yield Caso(
                    fuente="nhtsa",
                    id=f"nhtsa:{row['test_no']}",
                    tipo=tipo,
                    lado=lado,
                    clase=clase,
                    masa_kg=masa,
                    largo_m=length / 1000 if length else None,
                    ancho_m=(_f(row, "width_mm") or 0) / 1000 or None,
                    perfil_m=perfil,  # type: ignore[arg-type]
                    ancho_dano_m=largo_dano / 1000,
                    centro_dano_m=d / 1000 if d is not None else None,
                    velocidad_kmh=_f(row, "closing_speed_kmh") or _f(row, "speed_kmh"),
                    dv_kmh=None,
                    anio=int(_f(row, "model_year") or 0) or None,
                    detalle=f"{config}: {row.get('barrier_shape') or row.get('test_type') or ''}",
                    vehiculo="|".join(
                        (row.get(k) or "").strip().upper() for k in ("make", "model", "model_year")
                    ),
                )


_NARROW = {"poste", "arbol"}


def ciss_tipo(plano: str, zona: str, objeto: str) -> str | None:
    if objeto in _NARROW:
        return "poste"
    if plano == "F":
        return "frontal" if zona == "D" else "frontal_desplazado"
    if plano in {"L", "R"}:
        return "lateral"
    if plano == "B":
        return "alcance"
    return None


def ciss_cases(path: Path = CISS_CSV) -> Iterator[Caso]:
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            plano = row.get("plano", "")
            tipo = ciss_tipo(plano, row.get("zona_horizontal", ""), row.get("objeto", ""))
            perfil = _perfil(json.loads(row["perfil_cm"]), 0.01) if row.get("perfil_cm") else None
            largo_dano = _f(row, "ancho_dano_cm")
            masa = _f(row, "masa_kg")
            if tipo is None or perfil is None or largo_dano is None or masa is None:
                continue
            d = _f(row, "centro_dano_cm")
            largo = _f(row, "largo_cm")
            ancho = _f(row, "ancho_cm")
            yield Caso(
                fuente="ciss",
                id=f"ciss:{row['caseid']}:{row['vehno']}:{row['evento']}",
                tipo=tipo,
                lado=plano,
                clase=row["clase"],
                masa_kg=masa,
                largo_m=largo / 100 if largo else None,
                ancho_m=ancho / 100 if ancho else None,
                perfil_m=perfil,  # type: ignore[arg-type]
                ancho_dano_m=largo_dano / 100,
                centro_dano_m=d / 100 if d is not None else None,
                velocidad_kmh=None,
                dv_kmh=_f(row, "dv_edr_kmh"),
                anio=int(row["anio"]),
                detalle=row.get("contacto", "")
                + (f": {row['objeto']}" if row.get("objeto") else ""),
            )


_TEST_NO = re.compile(r"^nhtsa:(\d+)$")


def nhtsa_test_no(caso_id: str) -> int | None:
    m = _TEST_NO.match(caso_id)
    return int(m.group(1)) if m else None
