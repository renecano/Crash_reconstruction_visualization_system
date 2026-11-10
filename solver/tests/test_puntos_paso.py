"""C1 (W3): los puntos de paso y el punto inicial del choque como evidencia de la inversión."""

import copy
import math
from typing import Any

import pytest

from croquis_scene_schema import load_fixture
from croquis_solver import inversion as inv
from croquis_solver.reconstruct import reconstruct

DEL_PERITO = {"fuente": "usuario", "confianza": 0.9}


def _sin_reposo(spec: dict[str, Any]) -> dict[str, Any]:
    """La escena sin posiciones finales: lo único declarado será lo que ponga la prueba."""
    out: dict[str, Any] = copy.deepcopy(spec)
    out["evidencias"] = [e for e in out["evidencias"] if e.get("tipo") != "posicion_final"]
    for v in out["vehiculos"]:
        v.pop("posicion_final", None)
        v.pop("posicion_final_supuesta", None)
    return out


def _muestra_despues(r: Any, vid: str, fraccion: float) -> tuple[float, float, float]:
    """(t, x, y) de la trayectoria de `vid` a esa fracción del tramo posterior al impacto."""
    tr = next(v for v in r.vehiculos if v.id == vid).trajectory
    despues = [k for k, t in enumerate(tr.t) if t > 0.0]
    k = despues[int(len(despues) * fraccion)]
    return tr.t[k], tr.x[k], tr.y[k]


def _punto(
    pid: str, orden: int, x: float, y: float, *, precision: float = 0.5, t_s: float | None = None
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": pid,
        "orden": orden,
        "posicion": {"x": x, "y": y},
        "precision_m": precision,
        "procedencia": dict(DEL_PERITO),
    }
    if t_s is not None:
        out["t_s"] = t_s
    return out


def test_el_punto_mas_cercano_y_la_posicion_en_un_instante() -> None:
    xs, ys, ts = [0.0, 10.0, 10.0], [0.0, 0.0, 10.0], [0.0, 1.0, 2.0]
    assert inv.closest_on_path(xs, ys, 4.0, 3.0) == (4.0, 0.0)
    # Más allá del final de un tramo, su extremo; y del lado del segundo tramo, sobre él.
    assert inv.closest_on_path(xs, ys, 12.0, 6.0) == (10.0, 6.0)
    assert inv.closest_on_path(xs, ys, -5.0, -1.0) == (0.0, 0.0)
    assert inv.position_at(ts, xs, ys, 0.5) == (5.0, 0.0)
    assert inv.position_at(ts, xs, ys, 1.5) == (10.0, 5.0)
    assert inv.position_at(ts, xs, ys, -3.0) == (0.0, 0.0)
    assert inv.position_at(ts, xs, ys, 9.0) == (10.0, 10.0)


def test_la_evidencia_lee_los_puntos_de_paso_declarados() -> None:
    spec = _sin_reposo(load_fixture("lateral_interseccion"))
    a = spec["vehiculos"][0]
    a["puntos_paso"] = [
        _punto("pp-2", 2, 3.0, 4.0, t_s=1.5),
        _punto("pp-1", 1, 1.0, 2.0, precision=0.8),
        {**_punto("pp-3", 3, 9.0, 9.0), "procedencia": {"fuente": "supuesto", "confianza": 0.5}},
    ]
    sin_precision = _punto("pp-4", 4, 5.0, 5.0)
    del sin_precision["precision_m"]
    a["puntos_paso"].append(sin_precision)
    ev = inv.evidence_from_spec(spec, 1)
    # Por su orden; el supuesto no es evidencia; sin precisión vale la de una posición medida.
    assert [w.id for w in ev.waypoints] == ["pp-1", "pp-2", "pp-4"]
    assert ev.waypoints[0] == inv.Waypoint("pp-1", a["id"], 1.0, 2.0, 0.8, None)
    assert ev.waypoints[1].t_s == 1.5
    assert ev.waypoints[2].sigma == inv.SIGMA_POSITION_M
    assert not ev.empty()
    assert ev.labels()[-3:] == ["paso:pp-1", "paso:pp-2", "paso:pp-4"]
    # Con puntos de paso también se ajusta el rumbo de llegada de quien no lo tiene declarado.
    assert any(p.kind == "rumbo" for p in inv.parameters(spec, ev))


def test_sin_puntos_de_paso_ni_punto_marcado_la_evidencia_no_cambia() -> None:
    for nombre in ("alcance", "lateral_interseccion", "poste"):
        ev = inv.evidence_from_spec(load_fixture(nombre), 1)
        assert ev.waypoints == ()
        # El punto de impacto del relato guía la geometría, pero no es una medición.
        assert ev.impact_point is None
        assert not any(e.startswith(("paso:", "punto_inicial:")) for e in ev.labels())


def test_la_inversion_pasa_por_el_punto_de_paso_dentro_de_su_incertidumbre() -> None:
    base = _sin_reposo(load_fixture("lateral_interseccion"))
    moving = inv.moving_vehicles(base)
    a = moving[0]
    h0 = next(v for v in base["vehiculos"] if v["id"] == a)["posicion_inicial"]["rumbo_deg"]
    # La verdad: `a` llegó 8° desviado de lo supuesto. El perito sabe por dónde pasó después.
    verdad = inv.apply_values(
        base, {f"velocidad:{v}": 45.0 for v in moving} | {f"rumbo:{a}": h0 + 8}
    )
    _, x, y = _muestra_despues(reconstruct(verdad, dt=0.1), a, 0.6)
    declarada = inv.with_speeds(base, moving, [45.0] * len(moving))
    next(v for v in declarada["vehiculos"] if v["id"] == a)["puntos_paso"] = [
        _punto("pp-a", 1, x, y, precision=0.5)
    ]
    ev = inv.evidence_from_spec(declarada, 1)
    antes = inv.fit_evidence(declarada, inv.Evidence({}, {}, {}), dt=0.1)
    assert antes.cost == 0.0  # sin evidencia no se mueve nada
    r0 = reconstruct(declarada, dt=0.1)
    tr0 = next(v for v in r0.vehiculos if v.id == a).trajectory
    cx, cy = inv.closest_on_path(tr0.x, tr0.y, x, y)
    # Con el rumbo supuesto, la trayectoria pasa a más de una precisión del punto.
    assert math.hypot(cx - x, cy - y) > 0.5
    fit = inv.fit_evidence(declarada, ev, dt=0.1)
    falta = math.hypot(fit.residuals["paso:pp-a:x"], fit.residuals["paso:pp-a:y"])
    # Ajustada, pasa por el punto dentro de su incertidumbre (residuo en σ).
    assert falta < 1.0
    assert fit.headings_deg[a] != pytest.approx(h0, abs=0.5)


def test_los_puntos_de_paso_con_hora_acercan_la_velocidad_a_la_verdadera() -> None:
    base = _sin_reposo(load_fixture("lateral_interseccion"))
    moving = inv.moving_vehicles(base)
    verdad = {vid: 55.0 if k == 0 else 35.0 for k, vid in enumerate(moving)}
    r = reconstruct(inv.with_speeds(base, list(verdad), list(verdad.values())), dt=0.1)
    declarada = inv.with_speeds(base, moving, [30.0] * len(moving))
    for k, vid in enumerate(moving):
        puntos: list[dict[str, Any]] = []
        for n, fraccion in enumerate((0.25, 0.75)):
            t, x, y = _muestra_despues(r, vid, fraccion)
            puntos.append(_punto(f"pp-{k}-{n}", n + 1, x, y, precision=0.5, t_s=t))
        next(v for v in declarada["vehiculos"] if v["id"] == vid)["puntos_paso"] = puntos
    ev = inv.evidence_from_spec(declarada, 1)
    fit = inv.fit_evidence(declarada, ev, dt=0.1)
    # Dónde estaba cada uno en dos instantes: el ajuste los cumple dentro de su incertidumbre.
    assert max(abs(v) for v in fit.residuals.values()) < 1.0
    # Y las velocidades de llegada, que arrancaron en 30 km/h, quedan cerca de las verdaderas.
    for vid, kmh in verdad.items():
        assert abs(fit.speeds_kmh[vid] - kmh) < abs(30.0 - kmh)
        assert fit.speeds_kmh[vid] == pytest.approx(kmh, abs=6.0)


def test_el_punto_inicial_que_marca_el_perito_es_evidencia() -> None:
    spec = _sin_reposo(load_fixture("lateral_interseccion"))
    evento = min(
        (e for e in spec["eventos"] if e["tipo"].startswith("impacto")), key=lambda e: e["orden"]
    )
    assert inv.impact_point_from_spec(spec) is None  # el del relato no cuenta
    r = reconstruct(spec, dt=0.1)
    assert r.punto_impacto is not None
    evento["punto_impacto"] = {"x": r.punto_impacto[0], "y": r.punto_impacto[1]}
    evento["procedencia"] = dict(DEL_PERITO)
    ev = inv.evidence_from_spec(spec, 1)
    assert ev.impact_point == (evento["id"], r.punto_impacto[0], r.punto_impacto[1])
    assert ev.labels()[-1] == f"punto_inicial:{evento['id']}"
    fit = inv.fit_evidence(spec, ev, dt=0.1)
    # Marcado donde ya ocurre el contacto, el ajuste lo cumple.
    assert abs(fit.residuals[f"punto_inicial:{evento['id']}:x"]) < 0.5
    assert abs(fit.residuals[f"punto_inicial:{evento['id']}:y"]) < 0.5


def test_la_incertidumbre_sortea_cada_punto_dentro_de_su_precision() -> None:
    spec = _sin_reposo(load_fixture("lateral_interseccion"))
    spec["vehiculos"][0]["puntos_paso"] = [_punto("pp-1", 1, 2.0, 3.0, precision=0.4, t_s=1.0)]
    ev = inv.evidence_from_spec(spec, 1)
    a = inv.invert(spec, seed=5, samples=3)
    b = inv.invert(spec, seed=5, samples=3)
    assert a.to_dict() == b.to_dict()
    assert "paso:pp-1" in a.to_dict()["evidencia"]
    assert ev.waypoints[0].sigma == 0.4
