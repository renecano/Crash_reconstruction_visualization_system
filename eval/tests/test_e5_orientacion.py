"""Dónde está DPD1 según los reportes de NHTSA (E5, ADR 0032)."""

from __future__ import annotations

from croquis_eval.e5_orientacion import statement_side, verdict

PROFILE = (0.145, 0.383, 0.459, 0.427, 0.390, 0.166)  # prueba 10050 (DPD1–DPD6, m)


def test_reads_the_maximum_crush_sentence() -> None:
    text = (
        "The maximum static crush was 459 mm at DPD 3 on the left side o f the vehicle’s\n"
        "centerline."
    )
    assert statement_side(text) == (3, "left")
    assert statement_side("Post-test maximum crush was 312 mm at DPD-5 on the right side") == (
        5,
        "right",
    )
    assert statement_side("No crush data in this report.") is None


def test_verdict() -> None:
    # 10050: el máximo está en DPD3 y el reporte dice «left» → DPD1 a la izquierda.
    assert verdict(3, "left", PROFILE) == "izquierda"
    # Mismo máximo, pero el reporte dijera «right» → lo contradice.
    assert verdict(3, "right", PROFILE) == "derecha"
    # El DPD citado no es el máximo del perfil: no concluye.
    assert verdict(2, "left", PROFILE) == "no_concluye"
    # Máximo empatado en el centro (DPD3 = DPD4): no dice de qué lado está.
    assert verdict(3, "left", (0.1, 0.2, 0.3, 0.3, 0.2, 0.1)) == "no_concluye"
    assert verdict(9, "left", PROFILE) == "no_concluye"
