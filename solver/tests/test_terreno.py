"""Terreno (C3, W5): pruebas analíticas de cada efecto y de que un plano da el resultado de hoy."""

from __future__ import annotations

import copy
import math
from typing import Any

import pytest

from croquis_scene_schema import load_fixture
from croquis_solver import montecarlo
from croquis_solver.models import Body2D, G, State2D
from croquis_solver.postimpact import WheelConfig, integrate
from croquis_solver.preimpact import (
    SpeedProfile,
    StraightPath,
    braking_deceleration,
    skid_distance,
)
from croquis_solver.reconstruct import reconstruct
from croquis_solver.terrain import (
    BUMP_CONTACT,
    BUMP_ENERGY,
    Bump,
    ReliefMesh,
    Terrain,
    brake_profile,
    pose_on,
)

JsonObj = dict[str, Any]
MU = 0.6
V0 = 20.0  # m/s
WHEELBASE = 2.6
CG = 1.2
BODY = Body2D.from_dimensions(1400.0, 4.4, 1.8)
WHEELS = WheelConfig.four_wheels(WHEELBASE, 1.5, CG, locked=True)
PATH = StraightPath((0.0, 0.0), 0.0, 400.0)


def plano_inclinado(pendiente: float, hacia_y: float = 0.0) -> Terrain:
    """Una malla de 10 m que sube `pendiente` (m/m) hacia +X y `hacia_y` hacia +Y."""
    nx, ny, paso = 60, 12, 10.0
    x0, y0 = -100.0, -60.0
    alturas = tuple(
        pendiente * (x0 + i * paso) + hacia_y * (y0 + j * paso)
        for j in range(ny)
        for i in range(nx)
    )
    return Terrain((), (), (), ReliefMesh(x0, y0, paso, nx, ny, alturas))


def zona(mu: float) -> JsonObj:
    return {
        "superficies": [
            {
                "id": "zona",
                "tipo": "terraceria",
                "poligono": [
                    {"x": -500, "y": -50},
                    {"x": 500, "y": -50},
                    {"x": 500, "y": 50},
                    {"x": -500, "y": 50},
                ],
                "friccion": {"valor": mu, "fuente": "usuario", "confianza": 0.9},
                "procedencia": {"fuente": "usuario", "confianza": 0.9},
            }
        ]
    }


def frenado(terrain: Terrain, mu: float = MU, v0: float = V0) -> float:
    """Distancia de frenado a fondo desde el origen sobre `PATH`, con el terreno."""
    prof = brake_profile(PATH, v0, 0.0, 1.0, terrain, mu, 1.0, 0.0, CG, WHEELBASE)
    assert prof.stops
    return prof.ss[-1]


# ---- gravedad: el frenado en pendiente constante coincide con la fórmula -------------------------


@pytest.mark.parametrize("pendiente", [0.08, -0.08, 0.02, -0.15])
def test_frenado_previo_en_pendiente_coincide_con_la_formula(pendiente: float) -> None:
    formula = skid_distance(V0, braking_deceleration(MU, grade_percent=100.0 * pendiente))
    assert frenado(plano_inclinado(pendiente)) == pytest.approx(formula, rel=1e-9)


@pytest.mark.parametrize("pendiente", [0.08, -0.08])
def test_deslizamiento_posterior_en_pendiente_como_la_formula(pendiente: float) -> None:
    formula = skid_distance(V0, braking_deceleration(MU, grade_percent=100.0 * pendiente))
    r = integrate(BODY, State2D(vx=V0), WHEELS, MU, terrain=plano_inclinado(pendiente), dt=0.001)
    assert r.stopped
    # El mismo margen que el integrador tiene en plano contra v²/(2·μ·g).
    plano = integrate(BODY, State2D(vx=V0), WHEELS, MU, dt=0.001)
    margen = abs(plano.distance - skid_distance(V0, MU * G)) / plano.distance + 2e-3
    assert r.distance == pytest.approx(formula, rel=margen)


def test_cuesta_abajo_se_llega_mas_lejos_y_cuesta_arriba_menos() -> None:
    plano = integrate(BODY, State2D(vx=V0), WHEELS, MU).distance
    sube = integrate(BODY, State2D(vx=V0), WHEELS, MU, terrain=plano_inclinado(0.06)).distance
    baja = integrate(BODY, State2D(vx=V0), WHEELS, MU, terrain=plano_inclinado(-0.06)).distance
    assert sube < plano < baja


def test_la_pendiente_de_lado_desvia_hacia_abajo() -> None:
    # El terreno sube hacia +Y: un vehículo que rueda libre hacia +X se va hacia −Y.
    libres = WheelConfig.four_wheels(WHEELBASE, 1.5, CG, locked=False)
    r = integrate(
        BODY, State2D(vx=10.0), libres, MU, terrain=plano_inclinado(0.0, 0.05), rolling_drag=0.2
    )
    assert r.trajectory.y[-1] < -0.05


# ---- fricción por zona: en terracería la distancia cambia según μ --------------------------------


def test_la_distancia_de_frenado_va_con_el_inverso_de_la_friccion() -> None:
    lugar_a = {"terreno": zona(0.4)}
    lugar_b = {"terreno": zona(0.7)}
    a = Terrain.from_spec(lugar_a)
    b = Terrain.from_spec(lugar_b)
    assert a is not None
    assert b is not None
    # La fricción del lugar (0.9) no cuenta dentro de la zona.
    assert frenado(a, mu=0.9) == pytest.approx(skid_distance(V0, 0.4 * G), rel=1e-9)
    assert frenado(a, mu=0.9) / frenado(b, mu=0.9) == pytest.approx(0.7 / 0.4, rel=1e-9)
    post_a = integrate(BODY, State2D(vx=V0), WHEELS, 0.9, terrain=a).distance
    post_b = integrate(BODY, State2D(vx=V0), WHEELS, 0.9, terrain=b).distance
    assert post_a / post_b == pytest.approx(0.7 / 0.4, rel=5e-3)


def test_fuera_de_la_zona_vale_la_friccion_del_lugar() -> None:
    lugar = {"terreno": zona(0.4)}
    lugar["terreno"]["superficies"][0]["poligono"] = [
        {"x": 10, "y": -5},
        {"x": 20, "y": -5},
        {"x": 20, "y": 5},
        {"x": 10, "y": 5},
    ]
    t = Terrain.from_spec(lugar)
    assert t is not None
    assert t.mu(15.0, 0.0, 0.7) == 0.4
    assert t.mu(25.0, 0.0, 0.7) == 0.7
    # La mitad del frenado cae en la zona resbalosa: llega más lejos que con 0.7 en todo.
    assert frenado(t, mu=0.7) > skid_distance(V0, 0.7 * G)


def test_el_monte_carlo_muestrea_la_friccion_de_cada_zona_en_su_rango() -> None:
    spec = load_fixture("terraceria_topes")
    campos = {c.ruta: c for c in montecarlo.ranges(spec)}
    grava = campos["lugar.terreno.superficies.0.friccion"]
    declarada = spec["lugar"]["terreno"]["superficies"][0]["friccion"]
    assert [grava.minimo, grava.maximo] == declarada["rango"]


# ---- topes ---------------------------------------------------------------------------------------


def test_el_tope_circular_de_la_norma_tiene_radio_de_dos_y_medio_metros() -> None:
    b = Bump.make("t", (0.0, -3.0), (0.0, 3.0), 0.10, 1.40)
    assert b.radius == pytest.approx(2.5)
    assert b.height_at(0.0, 0.0) == pytest.approx(0.10)
    assert b.height_at(0.7, 0.0) == pytest.approx(0.0, abs=1e-12)
    assert b.height_at(0.0, 3.5) == 0.0
    # Una rueda rígida deja de apoyar en la cresta a √(g·R).
    assert b.contact(math.sqrt(G * 2.5)) == pytest.approx(0.0, abs=1e-12)
    assert b.contact(0.0) == 1.0


def test_cruzar_un_tope_rodando_libre_quita_la_energia_declarada() -> None:
    tope = Bump.make("t", (10.0, -5.0), (10.0, 5.0), 0.10, 1.40)
    terreno = Terrain((), (), (tope,), None)
    libres = WheelConfig.four_wheels(WHEELBASE, 1.5, CG, locked=False)
    v0 = 3.0  # despacio: las llantas no despegan
    r = integrate(BODY, State2D(vx=v0), libres, MU, terrain=terreno, rolling_drag=0.0, t_max=6.0)
    v1 = r.trajectory.vx[-1]
    # Los dos ejes cruzan: en total, η·g·h por unidad de masa.
    assert v0 * v0 - v1 * v1 == pytest.approx(2.0 * BUMP_ENERGY[0] * G * 0.10, rel=0.02)


def test_frenar_sobre_un_tope_a_velocidad_alarga_el_frenado() -> None:
    tope = Bump.make("t", (5.0, -5.0), (5.0, 5.0), 0.10, 1.40)
    con = frenado(Terrain((), (), (tope,), None))
    sin = skid_distance(V0, MU * G)
    # A 70 km/h las llantas despegan: cada eje pierde κ de su agarre sobre el tope (1.40 m) y
    # mientras cae su altura (v·√(2h/g)); a cambio, el cruce le quita η·h/μ metros de frenado.
    v_cruce = math.sqrt(V0 * V0 - 2.0 * MU * G * 5.0)
    esperado = BUMP_CONTACT[0] * (1.40 + v_cruce * tope.flight_s) - BUMP_ENERGY[0] * 0.10 / MU
    assert con - sin == pytest.approx(esperado, rel=0.1)


def test_la_escena_de_referencia_registra_los_cruces_con_su_velocidad() -> None:
    r = reconstruct(load_fixture("terraceria_topes")).to_dict()
    cruces = {e["id"]: e for e in r["eventos"] if e["tipo"] == "cruce_tope"}
    assert set(cruces) == {"tope-tope-antes-veh-a", "tope-tope-despues-veh-b"}
    antes = cruces["tope-tope-antes-veh-a"]
    assert antes["t"] < 0 < cruces["tope-tope-despues-veh-b"]["t"]
    v_impacto = next(v for v in r["vehiculos"] if v["id"] == "veh-a")["v_impacto_kmh"]
    # Va frenando: cruza el tope más rápido de lo que llega al impacto.
    assert antes["detalle"]["velocidad_cruce_kmh"] > v_impacto
    assert {"perdida_energia_tope", "perdida_contacto_tope"} <= set(r["parametros"])


# ---- pose en el terreno --------------------------------------------------------------------------


def test_la_pose_sale_del_plano_de_las_llantas() -> None:
    ruedas = WHEELS.positions
    sube = plano_inclinado(0.10)
    z, cabeceo, alabeo = pose_on(sube, ruedas, 5.0, 0.0, 0.0)
    assert z == pytest.approx(0.5)
    assert cabeceo == pytest.approx(math.atan(0.10))  # nariz arriba
    assert alabeo == pytest.approx(0.0, abs=1e-12)
    # De bajada (mirando a −X) el cabeceo cambia de signo.
    assert pose_on(sube, ruedas, 5.0, 0.0, math.pi)[1] == pytest.approx(-math.atan(0.10))
    # El terreno sube hacia +Y (la izquierda de quien mira a +X): el costado derecho queda abajo.
    assert pose_on(plano_inclinado(0.0, 0.10), ruedas, 0.0, 0.0, 0.0)[2] == pytest.approx(
        math.atan(0.10)
    )


def test_la_escena_de_referencia_lleva_z_cabeceo_y_alabeo() -> None:
    r = reconstruct(load_fixture("terraceria_topes")).to_dict()
    for v in r["vehiculos"]:
        tr = v["trayectoria"]
        assert len(tr["z"]) == len(tr["cabeceo"]) == len(tr["alabeo"]) == len(tr["t"])
    a = next(v for v in r["vehiculos"] if v["id"] == "veh-a")["trayectoria"]
    assert max(a["z"]) > 0.03  # pasa por la ondulación y por el tope
    assert max(abs(c) for c in a["cabeceo"]) > 0.01


# ---- un terreno plano da exactamente el resultado de hoy -----------------------------------------


@pytest.mark.parametrize("escena", ["alcance", "lateral_interseccion", "carambola", "poste"])
def test_un_terreno_plano_da_exactamente_el_resultado_de_hoy(escena: str) -> None:
    spec = load_fixture(escena)
    hoy = reconstruct(spec).to_json()
    # 1. El bloque de terreno vacío.
    vacio = copy.deepcopy(spec)
    vacio["lugar"]["terreno"] = {"superficies": [], "ondulaciones": [], "topes": []}
    assert reconstruct(vacio).to_json() == hoy
    # 2. Una malla de relieve plana, citada por la escena.
    con_malla = copy.deepcopy(spec)
    con_malla["lugar"]["terreno"] = {
        "relieve": {
            "fuente": "dem",
            "malla_id": "plana",
            "resolucion_m": 30,
            "procedencia": {"fuente": "default", "confianza": 0.5},
        }
    }
    malla = {
        "id": "plana",
        "origen": {"lat": 19.0, "lon": -99.0, "x": -150.0, "y": -150.0},
        "resolucion_m": 30.0,
        "ancho": 11,
        "alto": 11,
        "alturas_m": [0.0] * 121,
        "fuente": "prueba",
        "licencia": "prueba",
        "resolucion_nativa_m": 30.0,
    }
    assert reconstruct(con_malla, relieve=malla).to_json() == hoy


def test_sin_la_malla_que_cita_la_escena_se_avisa_y_se_reconstruye_en_plano() -> None:
    spec = load_fixture("alcance")
    hoy = reconstruct(spec)
    spec = copy.deepcopy(spec)
    spec["lugar"]["terreno"] = {
        "relieve": {
            "fuente": "dem",
            "malla_id": "falta",
            "procedencia": {"fuente": "default", "confianza": 0.5},
        }
    }
    r = reconstruct(spec)
    assert any(a.codigo == "relieve_sin_malla" for a in r.avisos)
    assert [v.v_impact_kmh for v in r.vehiculos] == [v.v_impact_kmh for v in hoy.vehiculos]


def test_el_perfil_sobre_terreno_sin_efectos_es_el_analitico() -> None:
    # Una zona con la misma fricción del lugar: la tabla debe dar lo mismo que la fórmula.
    t = Terrain.from_spec({"terreno": zona(MU)})
    assert t is not None
    decel = MU * G
    prof = brake_profile(PATH, V0, 30.0, decel, t, MU, 1.0, 0.0, CG, WHEELBASE)
    plano = SpeedProfile(V0, 30.0 / V0, decel)
    for tiempo in (0.5, 1.5, 2.0, 3.0, 4.2, 6.0):
        assert prof.speed(tiempo) == pytest.approx(plano.speed(tiempo), abs=1e-9)
        assert prof.distance(tiempo) == pytest.approx(plano.distance(tiempo), abs=1e-9)
    for s in (10.0, 30.0, 45.0, 60.0):
        assert prof.time_to_distance(s) == pytest.approx(plano.time_to_distance(s), abs=1e-9)
    assert prof.time_to_distance(200.0) is None
    assert prof.stop_time == pytest.approx(plano.stop_time, abs=1e-9)


# ---- los supuestos del tope en el Monte Carlo (W5, ADR 0131) -------------------------------------


def test_los_supuestos_del_tope_se_muestrean_con_un_generador_aparte() -> None:
    from croquis_solver import terrain as tr

    spec = load_fixture("terraceria_topes")
    # La semilla sale de la del caso y es la misma en TS (`terreno.test.ts`).
    assert tr.bump_seed(101) == 121_261_413
    assert tr.bump_seed(0) == 20_261_110
    lhs = tr.bump_sampler(spec, 64, 101)
    assert lhs is not None
    energias: list[float] = []
    contactos: list[float] = []
    for i in range(64):
        s = copy.deepcopy(spec)
        tr.sample_bump_assumptions(s, lhs.sample(i))
        sorteo = s["lugar"]["terreno"][tr.BUMP_SAMPLED]
        energias.append(sorteo["energia"])
        contactos.append(sorteo["contacto"])
        t = tr.Terrain.from_spec(s["lugar"])
        assert t is not None
        assert (t.bump_energy, t.bump_contact) == (sorteo["energia"], sorteo["contacto"])
    # Cubre su rango declarado, un estrato por muestra.
    assert tr.BUMP_ENERGY[1] <= min(energias) < 0.52
    assert 1.48 < max(energias) <= tr.BUMP_ENERGY[2]
    assert tr.BUMP_CONTACT[1] <= min(contactos) < 0.02
    assert 0.98 < max(contactos) <= tr.BUMP_CONTACT[2]
    # Sin sorteo, el terreno usa los nominales.
    nominal = tr.Terrain.from_spec(spec["lugar"])
    assert nominal is not None
    assert (nominal.bump_energy, nominal.bump_contact) == (tr.BUMP_ENERGY[0], tr.BUMP_CONTACT[0])


def test_una_escena_sin_topes_no_usa_el_generador_de_los_topes() -> None:
    from croquis_solver import terrain as tr

    for nombre in ("alcance", "carambola"):
        assert tr.bump_sampler(load_fixture(nombre), 64, 101) is None
    spec = load_fixture("alcance")
    rutas = [c.ruta for c in montecarlo.monte_carlo(spec, samples=8).campos]
    assert not any("tope" in r for r in rutas)


def test_el_monte_carlo_de_la_escena_con_topes_reporta_y_usa_sus_supuestos() -> None:
    from croquis_solver import terrain as tr

    spec = load_fixture("terraceria_topes")
    u = montecarlo.monte_carlo(spec, samples=8)
    rutas = [c.ruta for c in u.campos]
    assert rutas[-2:] == ["parametros.perdida_energia_tope", "parametros.perdida_contacto_tope"]
    # Los mismos sorteos de los demás campos que sin los supuestos: van en otro hipercubo.
    assert rutas[:-2] == [c.ruta for c in montecarlo.ranges(spec)]

    # Con η y κ en sus extremos, la velocidad al impacto cambia: el supuesto sí entra.
    def v_impacto(energia: float, contacto: float) -> float:
        s = copy.deepcopy(spec)
        s["lugar"]["terreno"][tr.BUMP_SAMPLED] = {"energia": energia, "contacto": contacto}
        return next(v.v_impact_kmh for v in reconstruct(s).vehiculos if v.id == "veh-a")

    assert v_impacto(tr.BUMP_ENERGY[1], tr.BUMP_CONTACT[1]) != v_impacto(
        tr.BUMP_ENERGY[2], tr.BUMP_CONTACT[2]
    )
