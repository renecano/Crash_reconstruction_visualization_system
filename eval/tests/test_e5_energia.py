"""Convención de energía de E2 y del solver (diagnóstico de desarrollo de E5, ADR 0033)."""

from __future__ import annotations

import dataclasses

from croquis_eval import e5_energia
from croquis_eval.e5_casos import Caso


def _caso(**kw: object) -> Caso:
    base = Caso(
        fuente="nhtsa",
        id="nhtsa:1",
        tipo="frontal",
        lado="F",
        clase="sedan_mediano",
        masa_kg=1500.0,
        largo_m=4.7,
        ancho_m=1.8,
        perfil_m=(0.4, 0.4, 0.4, 0.4, 0.4, 0.4),
        ancho_dano_m=1.5,
        centro_dano_m=None,
        velocidad_kmh=56.0,
        dv_kmh=None,
        anio=2005,
        detalle="LOAD CELL BARRIER",
        obstaculo="barrera_rigida",
    )
    return dataclasses.replace(base, **kw)  # pyright: ignore[reportArgumentType]


def test_crash3_energy_crushes_deeper_than_dissipated() -> None:
    (row,) = e5_energia.bias_rows([_caso()])
    # (1 + e)² > 1 − e²: con la energía de CRASH3 el perfil predicho es más profundo.
    assert row["crash3"] > row["disipada"] > 0


def test_summary_reports_signed_median_in_cm() -> None:
    rows = [
        {"medido": 0.40, "disipada": 0.35, "crash3": 0.41},
        {"medido": 0.50, "disipada": 0.44, "crash3": 0.50},
    ]
    s = e5_energia.summarize(rows)
    assert s == {
        "n": 2,
        "medido_medio_cm": 45.0,
        "sesgo_disipada_cm": -5.5,
        "sesgo_crash3_cm": 0.5,
    }


def test_only_valid_rigid_barrier_cases() -> None:
    assert e5_energia._valid(_caso())  # pyright: ignore[reportPrivateUsage]
    assert not e5_energia._valid(_caso(obstaculo="poste"))  # pyright: ignore[reportPrivateUsage]
    assert not e5_energia._valid(_caso(ancho_m=-0.01))  # pyright: ignore[reportPrivateUsage]
