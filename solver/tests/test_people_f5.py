"""F5: banda de Searle, ocupantes, volcadura, objetos del entorno y visibilidad."""

from __future__ import annotations

import dataclasses
import itertools
import json
import math
from pathlib import Path
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_solver import occupant, rollover, visibility
from croquis_solver.models import G
from croquis_solver.pedestrian import searle_distance_band, throw_kinematics
from croquis_solver.reconstruct import reconstruct
from croquis_solver.scene_objects import hash01, scene_objects, tree_geometry

FIXTURES = Path(__file__).resolve().parents[2] / "packages" / "scene-schema" / "fixtures"


def load(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return data


# ---- banda de Searle -------------------------------------------------------------------------

speed = st.floats(min_value=1.0, max_value=25.0, allow_nan=False)
mu_lo = st.floats(min_value=0.3, max_value=0.8, allow_nan=False)
mu_span = st.floats(min_value=0.0, max_value=0.3, allow_nan=False)
cg = st.floats(min_value=0.0, max_value=1.2, allow_nan=False)
frac = st.floats(min_value=0.0, max_value=1.0, allow_nan=False)


@settings(max_examples=300, deadline=None)
@given(speed, mu_lo, mu_span, cg, frac, frac)
def test_toda_proyeccion_de_searle_cae_en_su_banda(
    v: float, lo: float, span: float, h: float, fm: float, fa: float
) -> None:
    hi = lo + span
    band = searle_distance_band(v, lo, hi, h)
    m = lo + fm * span
    theta = math.radians(fa * 2.0 * math.degrees(math.atan(m)))
    d = v * v * (math.cos(theta) + m * math.sin(theta)) ** 2 / (2 * m * G) + m * h
    assert band.contains(d, tol=1e-9 * max(1.0, d))
    assert band.d_min <= band.d_max


@settings(max_examples=300, deadline=None)
@given(speed, mu_lo, mu_span, cg, frac, frac)
def test_modelo_completo_cae_en_la_banda_donde_vale_la_forma_cerrada(
    v: float, lo: float, span: float, h: float, fm: float, fa: float
) -> None:
    hi = lo + span
    m = lo + fm * span
    theta = fa * math.degrees(math.atan(m))  # [0, atan μ]: la velocidad sobrevive al aterrizaje
    k = throw_kinematics(v, theta, h, m)
    if k.landing_speed <= 0:
        return
    band = searle_distance_band(v, lo, hi, h)
    # Con altura el modelo completo y la forma cerrada difieren en el término μ h: la forma
    # cerrada lo aproxima; se tolera esa diferencia.
    assert band.d_min - m * h - 1e-9 <= k.total_distance <= band.d_max + m * h + 1e-9


def test_banda_sin_altura_coincide_con_la_forma_cerrada() -> None:
    v, lo, hi = 10.0, 0.55, 0.75
    band = searle_distance_band(v, lo, hi, 0.0)
    assert band.d_min == pytest.approx(v * v / (2 * hi * G), rel=1e-12)
    assert band.d_max == pytest.approx(v * v * (1 + lo * lo) / (2 * lo * G), rel=1e-12)


def test_banda_con_altura_usa_el_minimo_convexo() -> None:
    v, h = 2.0, 1.0
    mu_star = v / math.sqrt(2 * G * h)  # ≈ 0.45
    band = searle_distance_band(v, 0.3, 0.6, h)
    assert band.d_min == pytest.approx(v * v / (2 * mu_star * G) + mu_star * h, rel=1e-12)


def test_banda_rechaza_rangos_invalidos() -> None:
    with pytest.raises(ValueError):
        searle_distance_band(5, 0.8, 0.5, 1.0)
    with pytest.raises(ValueError):
        searle_distance_band(-1, 0.5, 0.6, 1.0)


# ---- ocupantes -------------------------------------------------------------------------------

dv = st.floats(min_value=0.5, max_value=25.0, allow_nan=False)
crush = st.floats(min_value=0.0, max_value=1.2, allow_nan=False)
hours = st.floats(min_value=0.0, max_value=12.0, allow_nan=False)


@settings(max_examples=150, deadline=None)
@given(dv, crush, hours)
def test_pulso_integra_el_delta_v_y_dura_lo_acotado(d: float, c: float, h: float) -> None:
    p = occupant.pulse_for(d, c, h)
    assert p is not None
    assert occupant.T_MIN <= p.duration_s <= occupant.T_MAX
    n = 4000
    dt = p.duration_s / n
    area = sum(p.accel((k + 0.5) * dt) for k in range(n)) * dt
    assert area == pytest.approx(d, rel=1e-5)
    assert p.velocity_change(p.duration_s) == pytest.approx(d, rel=1e-12)
    assert math.hypot(*p.toward) == pytest.approx(1.0, rel=1e-12)


def test_direccion_del_ocupante_va_hacia_el_impacto() -> None:
    assert occupant.direction_from_pdof(12) == pytest.approx((1.0, 0.0), abs=1e-12)
    assert occupant.direction_from_pdof(3) == pytest.approx((0.0, -1.0), abs=1e-12)
    assert occupant.direction_from_pdof(9) == pytest.approx((0.0, 1.0), abs=1e-12)
    assert occupant.direction_from_pdof(6) == pytest.approx((-1.0, 0.0), abs=1e-12)


def test_sin_pulso_debajo_del_umbral() -> None:
    assert occupant.pulse_for(0.1, 0.2, 12) is None


@settings(max_examples=60, deadline=None)
@given(st.floats(min_value=3.0, max_value=20.0), crush)
def test_cinturon_reduce_el_desplazamiento_frontal(d: float, c: float) -> None:
    p = occupant.pulse_for(d, c, 12.0)
    assert p is not None
    belted = occupant.simulate(p, "conductor", True)
    free = occupant.simulate(p, "conductor", False)
    assert belted.max_displacement < free.max_displacement + 1e-12
    assert free.contact is not None
    assert free.contact.zona == "volante y tablero"
    assert free.max_displacement == pytest.approx(occupant.FLAIL_LONGITUDINAL_M, abs=5e-3)


def test_vuelo_libre_coincide_con_la_cinematica_de_michie() -> None:
    """Sin cinturón el ocupante toca el interior con la velocidad relativa acumulada."""
    p = occupant.pulse_for(15.0, 0.6, 12.0)
    assert p is not None
    m = occupant.simulate(p, "copiloto", False)
    assert m.contact is not None
    # Si el contacto ocurre después del pulso, la velocidad relativa es todo el ΔV.
    if m.contact.t_s > p.duration_s:
        assert m.contact.relative_speed == pytest.approx(15.0, rel=1e-3)
    else:
        assert m.contact.relative_speed == pytest.approx(p.velocity_change(m.contact.t_s), rel=2e-2)


def test_zonas_laterales_por_asiento() -> None:
    p = occupant.pulse_for(8.0, 0.3, 3.0)  # fuerza desde la derecha
    assert p is not None
    near = occupant.simulate(p, "copiloto", True)
    far = occupant.simulate(p, "conductor", True)
    assert near.contact is not None
    assert "derecho" in near.contact.zona
    assert far.contact is not None
    assert far.contact.zona == "consola central o asiento contiguo"
    rear = occupant.simulate(occupant.pulse_for(8.0, 0.3, 6.0) or p, "conductor", False)
    assert rear.contact is not None
    assert rear.contact.zona == "respaldo y cabecera"


def test_cinturon_no_declarado_da_dos_variantes() -> None:
    p = occupant.pulse_for(8.0, 0.3, 12.0)
    assert p is not None
    assert [m.belted for m in occupant.occupant_motions(p, "conductor", None)] == [True, False]
    assert [m.belted for m in occupant.occupant_motions(p, "conductor", False)] == [False]


# ---- volcadura -------------------------------------------------------------------------------


def test_velocidad_critica_y_energia() -> None:
    track, h, k2 = 1.6, 0.6, 0.5
    vc = rollover.critical_sliding_velocity(track, h, k2)
    ip = k2 + h * h + 0.25 * track * track
    omega = vc * h / ip
    dz = math.hypot(h, track / 2) - h
    assert 0.5 * ip * omega * omega == pytest.approx(G * dz, rel=1e-12)


@settings(max_examples=100, deadline=None)
@given(
    st.floats(min_value=1.3, max_value=2.0),
    st.floats(min_value=1.2, max_value=2.2),
    st.floats(min_value=0.0, max_value=15.0),
)
def test_criterio_de_tropiezo_es_monotono(width: float, height: float, v: float) -> None:
    track = 0.84 * width
    c = rollover.trip_check(track, width, height, v, "derecho")
    assert c.starts == (v >= c.critical_speed)
    taller = rollover.trip_check(track, width, height * 1.2, v, "derecho")
    assert taller.critical_speed < c.critical_speed  # más alto, más fácil de volcar
    assert c.ssf == pytest.approx(track / (2 * rollover.CG_HEIGHT_FRACTION * height))


def test_volcadura_declarada_sin_velocidad_lateral_se_marca() -> None:
    r = reconstruct(load("volcadura"))
    v = next(v for v in r.vehiculos if v.id == "veh-a")
    assert v.rollover is not None
    assert v.rollover.side == "derecho"
    assert any("se volcó" in b for b in r.banderas) == (not v.rollover.starts)
    assert any(e.tipo == "volcadura" for e in r.eventos)


# ---- objetos del entorno ---------------------------------------------------------------------


def test_hash_igual_al_del_visor() -> None:
    # Valores de referencia de hash01 en packages/viewer (FNV-1a sobre UTF-16).
    assert hash01("") == pytest.approx(0x811C9DC5 / 2**32)
    assert hash01("a") == pytest.approx(0xE40C292C / 2**32)


def test_arbol_con_altura_declarada_respeta_la_altura() -> None:
    t = tree_geometry(42, "x", 0.5, 10.0)
    assert t.copa_centro + t.copa_radio == pytest.approx(10.0)
    assert t.tronco_alto == pytest.approx(10.0 - 1.7 * t.copa_radio)
    free = tree_geometry(42, "x", 0.5, None)
    assert free.alto == pytest.approx(free.tronco_alto + 1.7 * free.copa_radio)


def test_objetos_de_las_escenas() -> None:
    objs = {o.id: o for o in scene_objects(load("peaton_cruce"))}
    camion = objs["camion-estacionado"]
    assert (camion.forma, camion.largo, camion.ancho, camion.alto) == ("caja", 7.5, 2.4, 3.2)
    arbol = scene_objects(load("objeto_fijo_arbol"))[0]
    assert arbol.forma == "arbol"
    assert arbol.alto == pytest.approx(10.0)
    assert arbol.radio == pytest.approx(0.25)


# ---- visibilidad -----------------------------------------------------------------------------


def _observer(x: float = 0.0, y: float = 0.0, yaw: float = 0.0) -> visibility.Observer:
    return visibility.Observer("obs", "sedan_compacto", [(x, y, yaw)], 4.4, 1.8, True)


def _person(x: float, y: float) -> visibility.Actor:
    return visibility.Actor("p", "persona", [(x, y, 0.0)], height=1.7)


def test_arbol_tapa_a_una_persona_detras_del_tronco() -> None:
    base = tree_geometry(1, "t", 0.6, 6.0)
    tree = dataclasses.replace(base, x=20.0, y=0.0)
    occ = visibility.object_occluders(tree)
    obs = visibility.Observer("obs", "sedan_compacto", [(0.0, -0.35, 0.0)], 4.4, 1.8, True)
    eye = obs.eye(0)
    # Persona en la prolongación de la línea ojo–tronco: el tronco (más alto que ella) la tapa.
    behind = (eye[0] + 2.0 * (20.0 - eye[0]), eye[1] + 2.0 * (0.0 - eye[1]))
    hidden = visibility.analyze_pair(
        obs, _person(*behind), occ, [], [0.0], night_unlit=False, met_visibility_m=None
    )
    assert hidden.visible == [False]
    assert hidden.causa == ["objeto:t"]
    # A 1.5 m del costado ya se ve.
    seen = visibility.analyze_pair(
        obs,
        _person(behind[0], behind[1] + 1.5),
        occ,
        [],
        [0.0],
        night_unlit=False,
        met_visibility_m=None,
    )
    assert seen.visible == [True]
    assert seen.fraccion == [1.0]


def test_muro_tapa_y_deja_asomar_la_cabeza() -> None:
    obs = visibility.Observer("obs", "sedan_compacto", [(0.0, 0.0, 0.0)], 4.4, 1.8, True)
    tall = [visibility.box_occluder("objeto:muro", 20.0, 0.0, 0.0, 0.3, 6.0, 2.5)]
    low = [visibility.box_occluder("objeto:barda", 20.0, 0.0, 0.0, 0.3, 6.0, 1.2)]
    a = visibility.analyze_pair(
        obs, _person(40.0, 0.0), tall, [], [0.0], night_unlit=False, met_visibility_m=None
    )
    b = visibility.analyze_pair(
        obs, _person(40.0, 0.0), low, [], [0.0], night_unlit=False, met_visibility_m=None
    )
    assert a.visible == [False]
    assert a.causa == ["objeto:muro"]
    assert b.visible == [True]
    assert 0 < b.fraccion[0] < 1


def test_la_vista_pasa_debajo_de_una_copa_alta_y_encima_de_un_auto_bajo() -> None:
    crown = visibility.Occluder(
        "objeto:c", "sphere", 10.0, 0.0, 3.0, 6.0, radius=1.5, zc=4.5, reach=1.5
    )
    eye = (0.0, 0.0, 1.08)
    assert not visibility.segment_blocked(crown, eye, (20.0, 0.0, 1.0))
    assert visibility.segment_blocked(crown, (0.0, 0.0, 4.5), (20.0, 0.0, 4.5))
    low_car = visibility.box_occluder("vehiculo:x", 10.0, 0.0, 0.0, 4.0, 1.8, 1.0)
    assert not visibility.segment_blocked(low_car, (0.0, 0.0, 2.33), (20.0, 0.0, 2.0))
    assert visibility.segment_blocked(low_car, eye, (20.0, 0.0, 0.6))


@settings(max_examples=200, deadline=None)
@given(
    st.floats(min_value=-30, max_value=30),
    st.floats(min_value=-30, max_value=30),
    st.floats(min_value=0, max_value=6.28),
)
def test_caja_simetrica_al_invertir_el_segmento(x: float, y: float, yaw: float) -> None:
    box = visibility.box_occluder("objeto:b", 0.0, 0.0, yaw, 3.0, 1.5, 2.0)
    a = (x, y, 1.0)
    b = (-x * 0.7 + 5, -y * 0.3 - 2, 1.2)
    assert visibility.segment_blocked(box, a, b) == visibility.segment_blocked(box, b, a)


def test_noche_sin_alumbrado_limita_por_los_faros() -> None:
    obs = _observer()
    near = visibility.analyze_pair(
        obs, _person(20.0, 0.0), [], [], [0.0], night_unlit=True, met_visibility_m=None
    )
    far = visibility.analyze_pair(
        obs, _person(50.0, 0.0), [], [], [0.0], night_unlit=True, met_visibility_m=None
    )
    side = visibility.analyze_pair(
        obs, _person(5.0, 15.0), [], [], [0.0], night_unlit=True, met_visibility_m=None
    )
    assert near.visible == [True]
    assert far.visible == [False]
    assert far.causa == ["noche"]
    assert side.visible == [False]
    assert side.causa == ["noche"]
    lit_car = visibility.Actor("v", "vehiculo", [(80.0, 0.0, math.pi)], 4.4, 1.8, 1.5, True)
    assert visibility.analyze_pair(
        obs, lit_car, [], [], [0.0], night_unlit=True, met_visibility_m=None
    ).visible == [True]


def test_clima_limita_la_distancia() -> None:
    res = visibility.analyze_pair(
        _observer(), _person(80.0, 0.0), [], [], [0.0], night_unlit=False, met_visibility_m=60.0
    )
    assert res.visible == [False]
    assert res.causa == ["clima"]


def test_visibilidad_en_la_escena_del_arbol() -> None:
    """Criterio de F5: el conductor ve el árbol durante toda la aproximación (vía despejada)."""
    r = reconstruct(load("objeto_fijo_arbol")).to_dict()
    pairs = [v for v in r["visibilidad"] if v["objetivo"] == "arbol-impacto"]
    assert len(pairs) == 1
    v = pairs[0]
    assert v["observador"] == "veh-a"
    assert v["altura_ojo_m"] == pytest.approx(1.40)  # pickup
    assert all(v["visible"])
    assert v["resumen"]["visible_toda_la_aproximacion"] is True
    assert v["resumen"]["distancia_al_verse_m"] > 50
    # La distancia al árbol baja de forma monótona hasta el impacto.
    d = v["distancia_m"]
    assert all(b <= a + 1e-9 for a, b in itertools.pairwise(d))


def test_visibilidad_con_otro_arbol_que_tapa_el_del_impacto() -> None:
    """Un segundo árbol frondoso entre el conductor y el del impacto lo tapa un tramo."""
    spec = load("objeto_fijo_arbol")
    r0 = reconstruct(spec).to_dict()
    v0 = next(v for v in r0["visibilidad"] if v["objetivo"] == "arbol-impacto")
    k = len(v0["t"]) // 3
    veh = next(x for x in r0["vehiculos"] if x["id"] == "veh-a")
    i = min(
        range(len(veh["trayectoria"]["t"])),
        key=lambda j: abs(veh["trayectoria"]["t"][j] - v0["t"][k]),
    )
    ex, ey = veh["trayectoria"]["x"][i], veh["trayectoria"]["y"][i]
    tx, ty = -8.4, 8.33
    mid = (ex + 0.5 * (tx - ex), ey + 0.5 * (ty - ey))
    blocker = json.loads(json.dumps(spec["entorno"]["objetos"][0]))
    blocker.update({"id": "arbol-tapa", "posicion": {"x": mid[0], "y": mid[1]}})
    blocker["alto"] = {"valor": 3.0, "unidad": "m", "fuente": "supuesto", "confianza": 0.5}
    blocker["diametro_tronco"] = {
        "valor": 1.5,
        "unidad": "m",
        "fuente": "supuesto",
        "confianza": 0.5,
    }
    spec["entorno"]["objetos"].append(blocker)
    r = reconstruct(spec).to_dict()
    v = next(v for v in r["visibilidad"] if v["objetivo"] == "arbol-impacto")
    assert v["visible"][k] is False
    assert v["causa"][k] == "objeto:arbol-tapa"
    assert "objeto:arbol-tapa" in v["resumen"]["limitado_por"]


def test_camion_estacionado_tapa_al_peaton() -> None:
    r = reconstruct(load("peaton_cruce")).to_dict()
    v = next(v for v in r["visibilidad"] if v["objetivo"] == "per-peaton")
    s = v["resumen"]
    assert s["oclusor_principal"] == "objeto:camion-estacionado"
    assert s["visible_al_impacto"] is True
    assert s["visible_toda_la_aproximacion"] is False
    assert 0 < s["tiempo_disponible_s"] < 3.0
    assert not v["visible"][0]


def test_reconstruccion_incluye_ocupantes_y_jinetes() -> None:
    r = reconstruct(load("motociclista")).to_dict()
    rider = next(p for p in r["personas"] if p["id"] == "per-b1")
    assert rider["proyeccion"]["banda_searle_m"][0] < rider["proyeccion"]["distancia_m"]
    assert rider["proyeccion"]["distancia_m"] < rider["proyeccion"]["banda_searle_m"][1]
    assert [f["fase"] for f in rider["fases"]][:2] == ["montado", "vuelo"]
    assert "ocupante" not in rider
    driver = next(p for p in r["personas"] if p["id"] == "per-a1")
    assert driver["ocupante"]["asiento"] == "conductor"
    assert len(driver["ocupante"]["variantes"]) == 2  # cinturón no declarado
