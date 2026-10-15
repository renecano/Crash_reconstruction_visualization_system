"""Inversión: ΔV desde el daño (CRASH3 con rigidez muestreada) y velocidades desde la evidencia."""

import copy
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_scene_schema import load_fixture
from croquis_solver import inversion as inv
from croquis_solver.reconstruct import reconstruct


def _dmg(
    depth_cm: float, clase: str = "sedan_compacto", plano: str = "F", pdof: float = 0.0
) -> inv.Damage:
    return inv.Damage(clase, 1300.0, plano, pdof, (depth_cm / 100.0,) * 6, 1.5)


@pytest.mark.parametrize(
    ("plano", "pdof", "offset"),
    [("F", 0, 0), ("F", 350, -10), ("R", 90, 0), ("R", 120, 30), ("B", 180, 0), ("L", 250, -20)],
)
def test_desfase_del_pdof_contra_la_normal_del_plano(
    plano: str, pdof: float, offset: float
) -> None:
    assert inv.pdof_offset(plano, pdof) == pytest.approx(offset)


def test_mas_aplastamiento_mas_delta_v() -> None:
    lo = inv.delta_v_from_damage(_dmg(10), rigid=True, seed=1, n=300, sigma=0.0)
    hi = inv.delta_v_from_damage(_dmg(30), rigid=True, seed=1, n=300, sigma=0.0)
    assert hi.p50 > lo.p50
    assert lo.p10 < lo.p50 < lo.p90


def test_momento_entre_dos_vehiculos() -> None:
    light = inv.Damage("sedan_compacto", 1000.0, "F", 0.0, (0.2,) * 6, 1.5)
    heavy = inv.Damage("suv_grande", 2500.0, "F", 0.0, (0.2,) * 6, 1.6)
    a = inv.delta_v_from_damage(light, heavy, seed=3, n=400, sigma=0.0)
    b = inv.delta_v_from_damage(heavy, light, seed=3, n=400, sigma=0.0)
    # m1·ΔV1 = m2·ΔV2: el ligero cambia más de velocidad (con la masa ±5 % y la rigidez muestreada).
    assert a.p50 / b.p50 == pytest.approx(2500 / 1000, rel=0.15)


def test_determinista_por_semilla_y_error_de_modelo_ensancha() -> None:
    d1 = inv.delta_v_from_damage(_dmg(20), rigid=True, seed=7, n=200, sigma=0.0)
    d2 = inv.delta_v_from_damage(_dmg(20), rigid=True, seed=7, n=200, sigma=0.0)
    assert d1 == d2
    wide = inv.delta_v_from_damage(_dmg(20), rigid=True, seed=7, n=200, sigma=0.5)
    assert (wide.p90 - wide.p10) > (d1.p90 - d1.p10)


def test_sin_otro_vehiculo_ni_objeto_es_error() -> None:
    with pytest.raises(ValueError, match="daño del otro"):
        inv.delta_v_from_damage(_dmg(10))


@settings(max_examples=25, deadline=None)
@given(st.floats(1.0, 60.0), st.sampled_from(["F", "B", "L", "R"]))
def test_delta_v_positivo_y_ordenado(depth_cm: float, plano: str) -> None:
    d = inv.delta_v_from_damage(_dmg(depth_cm, plano=plano), rigid=True, seed=0, n=50)
    assert 0 < d.p10 <= d.p50 <= d.p90


def test_la_calibracion_de_e3_existe_y_es_razonable() -> None:
    sigma = inv.model_sigma()
    assert 0.0 < sigma < 1.5


def _declare_rest(spec: dict[str, Any], speeds: dict[str, float]) -> dict[str, Any]:
    """Escena con posiciones finales declaradas = las que da el solver con `speeds`."""
    truth = inv.with_speeds(spec, list(speeds), list(speeds.values()))
    r = reconstruct(truth, dt=0.1)
    out: dict[str, Any] = copy.deepcopy(spec)
    # Solo cuenta la posición final que declara la prueba (el fixture trae la suya).
    out["evidencias"] = [e for e in out["evidencias"] if e.get("tipo") != "posicion_final"]
    vehs: list[dict[str, Any]] = out["vehiculos"]
    for v in vehs:
        rv = next(x for x in r.vehiculos if x.id == v["id"])
        v["posicion_final"] = {
            "x": rv.rest_pose[0],
            "y": rv.rest_pose[1],
            "rumbo_deg": rv.rest_pose[2],
            "procedencia": {"fuente": "usuario", "confianza": 0.9},
        }
    return out


def test_recupera_la_velocidad_desde_las_posiciones_finales() -> None:
    spec = load_fixture("lateral_interseccion")
    moving = inv.moving_vehicles(spec)
    truth = {vid: 55.0 if k == 0 else 35.0 for k, vid in enumerate(moving)}
    declared = _declare_rest(spec, truth)
    start = inv.with_speeds(declared, moving, [30.0] * len(moving))
    ev = inv.evidence_from_spec(start)
    assert set(ev.rest) == {v["id"] for v in spec["vehiculos"]}
    fit = inv.fit_evidence(start, ev, dt=0.1)
    for vid, kmh in truth.items():
        assert fit.speeds_kmh[vid] == pytest.approx(kmh, abs=3.0)
    assert max(abs(r) for r in fit.residuals.values()) < 1.0


def test_inversion_devuelve_distribucion_reproducible() -> None:
    spec = load_fixture("lateral_interseccion")
    moving = inv.moving_vehicles(spec)
    declared = _declare_rest(spec, dict.fromkeys(moving, 45.0))
    a = inv.invert(declared, seed=11, samples=3)
    b = inv.invert(declared, seed=11, samples=3)
    assert a.to_dict() == b.to_dict()
    for vid in moving:
        d = a.speeds[vid]
        assert d.p10 <= d.p50 <= d.p90
        assert d.muestras == 3


def test_sin_evidencia_no_cambia_nada() -> None:
    spec = load_fixture("alcance")
    ev = inv.evidence_from_spec(spec)
    fit = inv.fit_evidence(spec, ev)
    assert fit.cost == 0.0


def test_lo_que_la_evidencia_no_fija_no_se_reporta_como_intervalo() -> None:
    # Contra un poste el vehículo se detiene ahí a cualquier velocidad: el reposo no la fija.
    out = inv.invert(load_fixture("poste"), samples=3)
    speed = next(e for e in out.estimates if e.param.kind == "velocidad")
    assert not speed.identifiable
    assert speed.dist is None
    assert "estimacion" not in speed.to_dict()
    assert out.speeds == {}


def test_recupera_el_angulo_de_llegada_desde_la_pose_final() -> None:
    spec = load_fixture("lateral_interseccion")
    moving = inv.moving_vehicles(spec)
    a = moving[0]
    h0 = next(v for v in spec["vehiculos"] if v["id"] == a)["posicion_inicial"]["rumbo_deg"]
    truth = {f"velocidad:{v}": 45.0 for v in moving} | {f"rumbo:{a}": h0 + 8.0}
    shown = inv.apply_values(spec, truth)
    declared = _declare_rest(shown, dict.fromkeys(moving, 45.0))
    declared["vehiculos"][0]["posicion_inicial"]["rumbo_deg"] = h0  # se arranca del rumbo supuesto
    ev = inv.evidence_from_spec(declared)
    assert set(ev.rest_heading) == set(ev.rest)
    fit = inv.fit_evidence(declared, ev, dt=0.1)
    assert fit.headings_deg[a] == pytest.approx(h0 + 8.0, abs=2.0)
    for v in moving:
        assert fit.speeds_kmh[v] == pytest.approx(45.0, abs=4.0)


def test_las_marcas_fijan_la_distancia_de_frenado() -> None:
    spec = load_fixture("peaton_cruce")
    car = next(v for v in spec["vehiculos"] if v["maniobra"]["valor"] != "estacionado")
    car["frenado"] = {}
    ev = inv.evidence_from_spec(spec)
    assert ev.skid == {car["id"]: 5.0}
    marked = inv.with_marks(spec, ev)
    fr = next(v for v in marked["vehiculos"] if v["id"] == car["id"])["frenado"]
    assert fr["aplico"]["valor"] is True
    assert fr["distancia_antes_impacto"]["valor"] == 5.0
    # Una distancia que dio la persona usuaria se respeta.
    car["frenado"] = {"distancia_antes_impacto": {"valor": 3, "unidad": "m", "fuente": "usuario"}}
    kept = inv.with_marks(spec, ev)
    fr = next(v for v in kept["vehiculos"] if v["id"] == car["id"])["frenado"]
    assert fr["distancia_antes_impacto"]["valor"] == 3


def test_la_fase_decide_que_restringen_las_marcas() -> None:
    """Contrato 1.1.0: antes del impacto, frenado; después, lo que se desliza hasta el reposo."""
    spec = load_fixture("motociclista")
    moto = next(e for e in spec["evidencias"] if e["id"] == "evid-raspadura-moto")
    assert moto["fase"] == "despues_impacto"
    ev = inv.evidence_from_spec(spec)
    assert ev.slide == {moto["vehiculo_id"]: 6.0}
    assert f"marcas_despues:{moto['vehiculo_id']}" in ev.labels()
    assert not ev.empty()
    # Sin fase, unas marcas de derrape no se usan (fase desconocida).
    del moto["fase"]
    assert inv.evidence_from_spec(spec).slide == {}
    # Unas marcas de frenado sin fase son de antes del impacto (la convención de 1.0.0).
    peaton = load_fixture("peaton_cruce")
    frenado = next(e for e in peaton["evidencias"] if e["tipo"] == "marcas_frenado")
    del frenado["fase"]
    assert inv.evidence_from_spec(peaton).skid == {frenado["vehiculo_id"]: 5.0}
    frenado["fase"] = "despues_impacto"
    ev2 = inv.evidence_from_spec(peaton)
    assert ev2.skid == {}
    assert ev2.slide == {frenado["vehiculo_id"]: 5.0}


def test_residuo_de_las_marcas_de_despues_del_impacto() -> None:
    spec = load_fixture("motociclista")
    ev = inv.evidence_from_spec(spec)
    vid = next(iter(ev.slide))
    res = inv._residuals(spec, ev, 0.1)  # pyright: ignore[reportPrivateUsage]
    assert res is not None
    post = next(v for v in reconstruct(spec, dt=0.1).vehiculos if v.id == vid).distance_post_m
    assert res[f"marcas_despues:{vid}"] == pytest.approx((post - 6.0) / inv.SIGMA_SLIDE_M)


def test_estimacion_en_el_limite_se_marca() -> None:
    p = inv.Param("velocidad", "veh-a", 30.0, 0.0, 200.0, True)
    d = inv.Distribution(0.0, 0.0, 0.0, 3)
    assert inv.Estimate(p, 5.0, True, 0.0, d).to_dict()["en_limite"] is True
    assert inv.Estimate(p, 5.0, True, 40.0, d).to_dict()["en_limite"] is False
    # Un ajuste pegado al límite no depende del ruido numérico de la máquina.
    assert inv.Estimate(p, 5.0, True, p.lo + 0.004, d).at_bound
    assert inv.Estimate(p, 5.0, True, p.lo + 0.09, d).at_bound
    assert not inv.Estimate(p, 5.0, True, p.lo + 0.2, d).at_bound
