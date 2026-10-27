"""Inversión: ΔV desde el daño (CRASH3 con rigidez muestreada) y velocidades desde la evidencia."""

import copy
import dataclasses
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
    with pytest.raises(ValueError, match="daño o la masa del otro"):
        inv.delta_v_from_damage(_dmg(10))


def test_la_rigidez_del_reporte_reemplaza_a_la_de_la_clase() -> None:
    # AXA (dictamen CESVI): Tacoma, perfil C1–C4 = 0.96, 0.86, 0.52, 0.20 m, L = 1.689 m, A = 55.405
    # y B = 385.336 en kN/m y kN/m² (ADR 0048). Sin dispersión, la energía es la de McHenry.
    from croquis_solver.crash3 import Stiffness, crush_energy, delta_v_pair

    k = (55405.0, 385336.0)
    own = inv.Damage("pickup", 1431.083, "F", 0.0, (0.96, 0.86, 0.52, 0.20), 1.689, rigidez=k)
    e = crush_energy(own.perfil_m, own.ancho_m, Stiffness(*k))
    assert e / 1000 == pytest.approx(225.45, abs=0.01)
    d = inv.delta_v_from_damage(own, other_mass_kg=1890.0, seed=1, n=50, sigma=0.0)
    # Solo la masa varía (±5 %): la mediana es el ΔV de esa energía con las masas nominales.
    assert d.p50 == pytest.approx(delta_v_pair(e, 1431.083, 1890.0)[0] * inv.KMH, rel=0.05)


def test_la_deformacion_de_un_solo_vehiculo_entra_como_minimo() -> None:
    spec = load_fixture("alcance")
    spec["danos_declarados"][0].update(
        profundidad_aplastamiento={
            "valor": 0.3,
            "unidad": "m",
            "fuente": "usuario",
            "confianza": 0.9,
        },
        ancho_danado={"valor": 1.5, "unidad": "m", "fuente": "usuario", "confianza": 0.9},
    )
    costado = {
        "vehiculo_id": "veh-a",
        "zona": {"lado": "R"},
        "severidad": "leve",
        "profundidad_aplastamiento": {
            "valor": 0.9,
            "unidad": "m",
            "fuente": "usuario",
            "confianza": 0.9,
        },
        "ancho_danado": {"valor": 0.8, "unidad": "m", "fuente": "usuario", "confianza": 0.9},
        "procedencia": {"fuente": "usuario", "confianza": 0.9},
    }
    spec["danos_declarados"].insert(0, costado)
    ev = inv.evidence_from_spec(spec, 1)
    # veh-b no tiene su deformación medida: el daño de veh-a no se compara como ΔV exacto.
    assert ev.damage_dv == {}
    assert "dano_minimo:veh-a" in ev.labels()
    # Entre el costado (primero) y el frente, cuenta el de la cara del contacto (el frente, 0.3 m).
    solo_frente = copy.deepcopy(spec)
    solo_frente["danos_declarados"].pop(0)
    assert inv.evidence_from_spec(solo_frente, 1).damage_min == ev.damage_min


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


def test_la_deformacion_medida_es_una_banda_que_pesa_como_restriccion() -> None:
    # ADR 0091: dentro de p10–p90 no cuesta; fuera, la distancia al borde en σ por PRIORIDAD.
    d = inv.Distribution(30.0, 50.0, 80.0, 200)
    s = inv.damage_sigma(d)
    assert inv.damage_band(55.0, d, inv.PRIORIDAD) == 0.0
    assert inv.damage_band(20.0, d, inv.PRIORIDAD) == pytest.approx(-10.0 / s * inv.PRIORIDAD)
    assert inv.damage_band(90.0, d, 1.0) == pytest.approx(10.0 / s)
    # Un mínimo no tiene techo; activa, es la distancia al borde aunque esté dentro de la banda.
    assert inv.damage_band(90.0, d, 1.0, minimum=True) == 0.0
    assert inv.damage_band(31.0, d, 1.0, minimum=True, edge=-1.0) == pytest.approx(1.0 / s)


def test_solo_el_reposo_supuesto_a_proposito_entra_como_evidencia_blanda() -> None:
    spec = load_fixture("alcance")
    # Los reposos que pone la escena por omisión (fuente «supuesto») no entran.
    assert inv.evidence_from_spec(spec, 1).rest_assumed == {}
    spec["vehiculos"][0]["posicion_final_supuesta"] = True
    ev = inv.evidence_from_spec(spec, 1)
    assert set(ev.rest_assumed) == {"veh-a"}
    assert "reposo_supuesto:veh-a" in ev.labels()
    assert "reposo:veh-a" not in ev.labels()
    # Un reposo supuesto tiene PRIORIDAD veces la σ de uno declarado; en su hipótesis, la misma.
    assert ev.weight() == inv.PRIORIDAD
    assert dataclasses.replace(ev, assumed_as_data=True).weight() == 1.0


# --- Multiarranque determinista (ADR 0091) --------------------------------------------------------


def _fit(cost: float, **speeds: float) -> inv.Fit:
    return inv.Fit({f"velocidad:{k}": v for k, v in speeds.items()}, {}, cost, True)


def test_los_arranques_son_fijos_y_dentro_de_los_limites() -> None:
    spec = load_fixture("lateral_interseccion")
    moving = inv.moving_vehicles(spec)
    declared = _declare_rest(spec, dict.fromkeys(moving, 45.0))
    ev = inv.evidence_from_spec(declared)
    params = inv.parameters(inv.with_marks(declared, ev), ev)
    starts = inv.multistart_starts(declared, ev, params)
    assert starts == inv.multistart_starts(declared, ev, params)
    assert starts[0] == {}
    scatter = starts[-inv.SCATTER_STARTS :]
    lo, hi = inv.SCATTER_SPEED_KMH
    # El primer punto de Halton es la mitad del intervalo en base 2 y un tercio en base 3.
    first = [scatter[0][f"velocidad:{v}"] for v in moving]
    assert first[0] == pytest.approx(lo + (hi - lo) / 2)
    assert first[1] == pytest.approx(lo + (hi - lo) / 3)
    assert all(lo <= x <= hi for s in scatter for x in s.values())


def test_agrupa_los_ajustes_por_modo_del_menor_costo_al_mayor() -> None:
    fits = [
        (_fit(0.3, a=70.0, b=20.0), 1),
        (_fit(0.1, a=72.0, b=21.0), 1),  # el mismo modo que el primero, más barato
        (_fit(2.0, a=150.0, b=0.0), 1),
        (_fit(0.2, a=79.0, b=19.0), 2),  # a más de MODE_TOL_KMH del primero: otro modo
    ]
    modes = inv._group(fits)  # pyright: ignore[reportPrivateUsage]
    assert [(m.fit.speeds_kmh["a"], m.starts) for m in modes] == [(72.0, 2), (79.0, 2), (150.0, 1)]


def test_el_modo_en_margen_se_marca_y_los_demas_no() -> None:
    modes = [
        inv.Mode(_fit(0.03, a=71.6), 4),
        inv.Mode(_fit(0.03 + inv.MODE_MARGIN, a=79.0), 1),
        inv.Mode(_fit(0.03 + inv.MODE_MARGIN + 0.01, a=150.0), 1),
    ]
    best = modes[0].fit
    d = inv.Inversion([], [], best, {}, modes=modes).to_dict()["multiarranque"]
    assert d["margen_costo"] == inv.MODE_MARGIN
    assert [(m["elegido"], m["en_margen"]) for m in d["modos"]] == [
        (True, False),
        (False, True),
        (False, False),
    ]


def test_la_solucion_elegida_no_depende_de_la_semilla() -> None:
    spec = load_fixture("lateral_interseccion")
    moving = inv.moving_vehicles(spec)
    declared = _declare_rest(spec, {moving[0]: 55.0, moving[1]: 35.0})
    a = inv.invert(declared, seed=11, samples=2)
    b = inv.invert(declared, seed=12, samples=2)
    assert a.best.values == b.best.values
    assert [m.to_dict(chosen=False, in_margin=False) for m in a.modes] == [
        m.to_dict(chosen=False, in_margin=False) for m in b.modes
    ]


# --- Rangos sin rarezas (ADR 0091) ------------------------------------------------------------


def test_sin_muestras_que_se_aparten_el_rango_es_el_lineal_dentro_de_los_limites() -> None:
    p = inv.Param("velocidad", "veh-a", 40.0, 0.0, 200.0, False)
    e = inv._estimate_of(p, 4.0, True, 2.0, [2.0, 2.0, 2.0])  # pyright: ignore[reportPrivateUsage]
    assert e.range_by == "laplace"
    assert e.dist is not None
    assert e.dist.p10 == 0.0  # recortado al límite
    assert e.dist.p90 == pytest.approx(2.0 + inv.Z_P90 * 4.0)
    assert e.to_dict()["estimacion"]["rango_por"] == "laplace"
    normal = inv._estimate_of(p, 4.0, True, 2.0, [1.0, 2.0, 3.0])  # pyright: ignore[reportPrivateUsage]
    assert normal.range_by == "muestras"
    assert "rango_por" not in normal.to_dict()["estimacion"]


def test_el_pulido_solo_baja_el_costo() -> None:
    spec = load_fixture("lateral_interseccion")
    moving = inv.moving_vehicles(spec)
    declared = _declare_rest(spec, {moving[0]: 55.0, moving[1]: 35.0})
    ev = inv.evidence_from_spec(declared)
    params = inv.parameters(inv.with_marks(declared, ev), ev)
    corto = inv.fit_evidence(declared, ev, max_nfev=2)
    pulido = inv._polish(declared, ev, corto, params, 0.1)  # pyright: ignore[reportPrivateUsage]
    assert pulido.cost <= corto.cost
