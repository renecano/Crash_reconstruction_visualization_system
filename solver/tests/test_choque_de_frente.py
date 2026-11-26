"""Choques de frente casi en la misma línea (René, 2026-11-25; aud-18 de la revisión de la cadena).

Con las dos trayectorias casi colineales, las líneas que recorren las zonas de contacto se cruzan
lejos del choque, cerca de la posición inicial de uno; el solver tomaba ese cruce como el contacto y
el que frenaba «chocaba» en su arranque, sin frenar. El contacto con un vehículo en movimiento
todavía en su posición inicial ya no se elige si hay otro.
"""

import copy
import json
import math
from pathlib import Path
from typing import Any

from croquis_solver.reconstruct import reconstruct

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "packages/scene-schema/fixtures/frente/choque-de-frente.json"
)


def _spec() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _al_impacto(spec: dict[str, Any], vid: str) -> tuple[float, float]:
    """(km/h al impacto, metros recorridos desde su posición inicial hasta el impacto)."""
    r = reconstruct(spec, dt=0.05)
    tr = next(v for v in r.vehiculos if v.id == vid).trajectory
    k = max(0, max(i for i, t in enumerate(tr.t) if t <= 1e-9))
    pos0 = next(v for v in spec["vehiculos"] if v["id"] == vid)["posicion_inicial"]
    return (
        math.hypot(tr.vx[k], tr.vy[k]) * 3.6,
        math.hypot(tr.x[k] - pos0["x"], tr.y[k] - pos0["y"]),
    )


def _alineado(spec: dict[str, Any]) -> dict[str, Any]:
    """B exactamente en la línea de A, de frente (180°)."""
    s = copy.deepcopy(spec)
    a = next(v for v in s["vehiculos"] if v["id"] == "veh-a")
    b = next(v for v in s["vehiculos"] if v["id"] == "veh-b")
    h = math.radians(a["posicion_inicial"]["rumbo_deg"])
    b["posicion_inicial"].update(
        x=14.0 * math.cos(h),
        y=14.0 * math.sin(h),
        rumbo_deg=a["posicion_inicial"]["rumbo_deg"] + 180.0,
    )
    a["posicion_inicial"].update(x=-12.0 * math.cos(h), y=-12.0 * math.sin(h))
    return s


def test_desfasado_el_que_frena_frena_antes_del_choque() -> None:
    v, recorrido = _al_impacto(_spec(), "veh-b")
    assert recorrido > 5.0  # no «choca» en su posición inicial
    assert v < 55.0  # 60 km/h y 9 m de frenado: llega más lento


def test_alineado_el_que_frena_frena_y_el_otro_no() -> None:
    s = _alineado(_spec())
    vb, rb = _al_impacto(s, "veh-b")
    va, ra = _al_impacto(s, "veh-a")
    assert rb > 5.0
    assert ra > 5.0
    assert vb < 55.0
    assert abs(va - 40.0) < 0.5


def test_sin_frenado_llegan_a_su_velocidad_y_avanzan() -> None:
    s = _spec()
    for v in s["vehiculos"]:
        v.pop("frenado", None)
    vb, rb = _al_impacto(s, "veh-b")
    assert rb > 5.0
    assert abs(vb - 60.0) < 0.5
