"""Cifras de INEGI ATUS que cita el README (PLAN §1).

Lee los agregados de ``croquis_data.atus.process`` y escribe ``eval/results/atus_summary.json``.
Ninguna cifra sobre accidentes en México debe escribirse a mano: sale de aquí.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import polars as pl

from croquis_data import atus
from croquis_eval.results import RESULTS_DIR, write_result

CVE_ESTADO_DE_MEXICO = 15
TIPO_MOTO = "Colisión con motocicleta"
TIPO_VOLCADURA = "Volcadura"
TIPO_PEATON = "Colisión con peatón (atropellamiento)"
TIPO_CICLISTA = "Colisión con ciclista"


def _pct(new: int, old: int) -> float | None:
    return None if old == 0 else round(100 * (new - old) / old, 2)


def _by_year(df: pl.DataFrame, col: str, value: str | int, field: str) -> dict[int, int]:
    sub = df.filter(pl.col(col) == value).select("anio", field).sort("anio")
    return {int(a): int(v) for a, v in sub.iter_rows()}


def build_summary(processed_dir: Path = atus.PROCESSED_DIR) -> dict[str, Any]:
    total = atus.read_processed("total", processed_dir).sort("anio")
    tipo = atus.read_processed("tipo", processed_dir)
    entidad = atus.read_processed("entidad", processed_dir)
    victimas = atus.read_processed("victimas", processed_dir)

    years = total.get_column("anio").to_list()
    latest, prev = int(years[-1]), int(years[-2])
    tot = {int(r["anio"]): r for r in total.iter_rows(named=True)}

    tipo_latest = tipo.filter(pl.col("anio") == latest).sort("accidentes", descending=True)
    acc_latest = int(tot[latest]["accidentes"])
    distribution = [
        {
            "tipo": r["clave"],
            "accidentes": int(r["accidentes"]),
            "muertos": int(r["muertos"]),
            "participacion": round(int(r["accidentes"]) / acc_latest, 4),
        }
        for r in tipo_latest.iter_rows(named=True)
    ]

    ent_latest = entidad.filter(pl.col("anio") == latest).sort("muertos", descending=True)
    ranking = [
        {
            "clave": int(r["clave"]),
            "entidad": r["nombre"],
            "muertos": int(r["muertos"]),
            "accidentes": int(r["accidentes"]),
        }
        for r in ent_latest.iter_rows(named=True)
    ]
    edomex_rank = next(i + 1 for i, r in enumerate(ranking) if r["clave"] == CVE_ESTADO_DE_MEXICO)

    moto = _by_year(tipo, "clave", TIPO_MOTO, "accidentes")
    volc = _by_year(tipo, "clave", TIPO_VOLCADURA, "accidentes")
    peat_acc = _by_year(tipo, "clave", TIPO_PEATON, "accidentes")
    cicl_acc = _by_year(tipo, "clave", TIPO_CICLISTA, "accidentes")
    peat_m = _by_year(victimas, "rol", "peaton", "muertos")
    pasa_m = _by_year(victimas, "rol", "pasajero", "muertos")
    cond_m = _by_year(victimas, "rol", "conductor", "muertos")
    cicl_m = _by_year(victimas, "rol", "ciclista", "muertos")

    return {
        "fuente": {
            "nombre": (
                "INEGI, Accidentes de Tránsito Terrestre en Zonas Urbanas y Suburbanas (ATUS), "
                "datos abiertos 1997–2025"
            ),
            "url": atus.ATUS_URL,
            "licencia": atus.ATUS_LICENSE_URL,
            "nota": (
                "Se excluyen los registros 'Certificado cero'. 'Muertos' son fallecidos en el "
                "lugar del accidente, como define ATUS."
            ),
        },
        "anios": {"primero": int(years[0]), "ultimo": latest, "n": len(years)},
        "ultimo_anio": {
            "anio": latest,
            "accidentes": acc_latest,
            "muertos": int(tot[latest]["muertos"]),
            "heridos": int(tot[latest]["heridos"]),
            "cambio_accidentes_vs_anterior_pct": _pct(acc_latest, int(tot[prev]["accidentes"])),
            "cambio_muertos_vs_anterior_pct": _pct(
                int(tot[latest]["muertos"]), int(tot[prev]["muertos"])
            ),
        },
        "anio_anterior": {
            "anio": prev,
            "accidentes": int(tot[prev]["accidentes"]),
            "muertos": int(tot[prev]["muertos"]),
            "heridos": int(tot[prev]["heridos"]),
        },
        "serie_anual": [
            {
                "anio": int(r["anio"]),
                "accidentes": int(r["accidentes"]),
                "muertos": int(r["muertos"]),
                "heridos": int(r["heridos"]),
            }
            for r in total.iter_rows(named=True)
        ],
        "distribucion_tipo_ultimo_anio": distribution,
        "entidades_por_muertos_ultimo_anio": ranking[:10],
        "estado_de_mexico": {
            "lugar_por_muertos_ultimo_anio": edomex_rank,
            "muertos_ultimo_anio": next(
                r["muertos"] for r in ranking if r["clave"] == CVE_ESTADO_DE_MEXICO
            ),
            "accidentes_ultimo_anio": next(
                r["accidentes"] for r in ranking if r["clave"] == CVE_ESTADO_DE_MEXICO
            ),
        },
        "tendencias": {
            "colision_con_motocicleta": {
                "ultimo": moto[latest],
                "anterior": moto[prev],
                "cambio_pct": _pct(moto[latest], moto[prev]),
            },
            "volcadura": {
                "ultimo": volc[latest],
                "anterior": volc[prev],
                "cambio_pct": _pct(volc[latest], volc[prev]),
            },
            "colision_con_peaton": {
                "ultimo": peat_acc[latest],
                "anterior": peat_acc[prev],
                "cambio_pct": _pct(peat_acc[latest], peat_acc[prev]),
            },
            "colision_con_ciclista": {
                "ultimo": cicl_acc[latest],
                "anterior": cicl_acc[prev],
                "cambio_pct": _pct(cicl_acc[latest], cicl_acc[prev]),
            },
            "peatones_muertos": {
                "ultimo": peat_m[latest],
                "anterior": peat_m[prev],
                "cambio_pct": _pct(peat_m[latest], peat_m[prev]),
            },
            "pasajeros_muertos": {
                "ultimo": pasa_m[latest],
                "anterior": pasa_m[prev],
                "cambio_pct": _pct(pasa_m[latest], pasa_m[prev]),
            },
            "conductores_muertos": {
                "ultimo": cond_m[latest],
                "anterior": cond_m[prev],
                "cambio_pct": _pct(cond_m[latest], cond_m[prev]),
            },
            "ciclistas_muertos": {
                "ultimo": cicl_m[latest],
                "anterior": cicl_m[prev],
                "cambio_pct": _pct(cicl_m[latest], cicl_m[prev]),
            },
        },
        "referencia_plan": {
            "nota": (
                "PLAN §1 citaba 340,415 accidentes en 2021; aquí la cifra recalculada desde el "
                "archivo vigente."
            ),
            "accidentes_2021": int(tot[2021]["accidentes"]) if 2021 in tot else None,
        },
    }


def main(processed_dir: Path = atus.PROCESSED_DIR, results_dir: Path = RESULTS_DIR) -> Path:
    return write_result("atus_summary", build_summary(processed_dir), results_dir=results_dir)
