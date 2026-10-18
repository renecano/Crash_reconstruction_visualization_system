from __future__ import annotations

import json
import math

import pytest

from croquis_scene_schema import list_fixtures, load_fixture
from croquis_solver.contact import contact_offset
from croquis_solver.crash3 import crush_energy
from croquis_solver.models import rot
from croquis_solver.reconstruct import reconstruct
from croquis_solver.stiffness import stiffness_for

FIXTURES = list_fixtures()


@pytest.mark.parametrize("name", FIXTURES)
def test_reconstruye_cada_escena_canonica(name: str) -> None:
    spec = load_fixture(name)
    r = reconstruct(spec)
    assert r.escena_id == spec["meta"]["id"]
    assert r.t_inicio < 0 <= r.t_fin
    assert len(r.vehiculos) == len(spec["vehiculos"])
    for v in r.vehiculos:
        tr = v.trajectory
        assert len(tr) > 2
        assert all(math.isfinite(x) for x in tr.x)
        assert all(b > a for a, b in zip(tr.t, tr.t[1:], strict=False))  # tiempo creciente
        for i in range(1, len(tr)):  # continuidad: sin saltos mayores que v·dt (con holgura)
            dt = tr.t[i] - tr.t[i - 1]
            speed = max(math.hypot(tr.vx[i], tr.vy[i]), math.hypot(tr.vx[i - 1], tr.vy[i - 1]))
            jump = math.hypot(tr.x[i] - tr.x[i - 1], tr.y[i] - tr.y[i - 1])
            assert jump <= speed * dt * 1.5 + 0.05, (name, v.id, i)
        if v.involucrado:
            assert v.stopped, (name, v.id)
        assert v.delta_v_kmh >= 0
    tipos = [e.tipo for e in r.eventos]
    assert "reposo" in tipos
    assert [e.t for e in r.eventos] == sorted(e.t for e in r.eventos)
    assert not any("no llegó al reposo" in b for b in r.banderas), r.banderas


@pytest.mark.parametrize("name", FIXTURES)
def test_determinista_bit_a_bit(name: str) -> None:
    a = reconstruct(load_fixture(name)).to_json()
    b = reconstruct(load_fixture(name)).to_json()
    assert a == b
    json.loads(a)  # serializable


def test_impacto_vehiculo_vehiculo_conserva_momento() -> None:
    spec = load_fixture("lateral_interseccion")
    r = reconstruct(spec)
    ev = next(e for e in r.eventos if e.tipo == "impacto_vehiculo_vehiculo")
    assert ev.t == 0.0
    masses = {v["id"]: float(v["masa"]["valor"]) for v in spec["vehiculos"]}
    vehs = {v.id: v for v in r.vehiculos}
    # Impulsos iguales y opuestos: m_a·ΔV_a = m_b·ΔV_b exactamente.
    (ida, va), (idb, vb) = vehs.items()
    assert math.isclose(masses[ida] * va.delta_v_kmh, masses[idb] * vb.delta_v_kmh, rel_tol=1e-9)
    # El impulso reportado coincide con el cambio de velocidad de A en el instante del impacto.
    tr = va.trajectory
    i0 = next(i for i, t in enumerate(tr.t) if t >= -1e-9)
    j = ev.detalle["impulso_ns"]
    assert math.isclose(math.hypot(j[0], j[1]) / masses[ida] * 3.6, va.delta_v_kmh, rel_tol=1e-9)
    assert i0 + 1 < len(tr)
    for v in r.vehiculos:
        assert v.delta_v_kmh > 5
        assert v.pdof_hours is not None
        if v.crush_energy_j > 0:
            assert v.crush_width_m > 0
            assert max(v.crush_profile_m) > 0


def test_alcance_velocidades_y_dano() -> None:
    r = reconstruct(load_fixture("alcance"))
    a = next(v for v in r.vehiculos if v.rol == "A")
    b = next(v for v in r.vehiculos if v.rol == "B")
    assert 0 < a.v_impact_kmh < 50  # frenó antes de pegar
    assert b.v_impact_kmh == 0
    assert a.delta_v_kmh > 0
    assert b.delta_v_kmh > 0
    assert a.pdof_hours is not None
    assert abs(a.pdof_hours - 0.0) < 1.0  # frontal
    assert b.pdof_hours is not None
    assert abs(b.pdof_hours - 6.0) < 1.0  # trasero
    assert any(e.tipo == "inicio_frenado" and e.t < 0 for e in r.eventos)


def test_arbol_detiene_y_poste_concentra() -> None:
    arbol = reconstruct(load_fixture("objeto_fijo_arbol"))
    va = arbol.vehiculos[0]
    assert va.delta_v_kmh > 40
    # Tronco de 0.5 m a alta velocidad: el daño se propaga a 45° y puede abarcar todo el frente,
    # pero sigue concentrado al centro (forma de poste).
    assert va.crush_width_m <= 1.86
    assert max(va.crush_profile_m) > 0.2
    assert va.crush_profile_m[2] == va.crush_profile_m[3] == max(va.crush_profile_m)
    assert va.crush_profile_m[0] < 0.1 * max(va.crush_profile_m)
    poste = reconstruct(load_fixture("poste"))
    vp = poste.vehiculos[0]
    assert vp.crush_width_m < 1.86  # poste delgado: ancho dañado menor que el frente
    assert vp.crush_profile_m[2] == max(vp.crush_profile_m)  # forma de poste, centrada


def test_peaton_proyeccion_en_rango_de_searle() -> None:
    r = reconstruct(load_fixture("peaton_cruce"))
    p = next(x for x in r.personas if x.throw is not None)
    assert p.throw_distance_m is not None
    assert p.throw_range_m is not None
    lo, hi = p.throw_range_m
    assert lo <= p.throw_distance_m <= hi
    assert 3 < p.throw_distance_m < 40
    assert p.contact is not None
    assert p.contact["cabeza"] in {"cofre", "parabrisas"}
    v = r.vehiculos[0]
    assert v.delta_v_kmh < 5  # el peatón casi no frena al vehículo


def test_vehiculo_no_involucrado_sigue_su_camino() -> None:
    r = reconstruct(load_fixture("volcadura"))
    b = next(v for v in r.vehiculos if v.rol == "B")
    assert not b.involucrado
    assert not b.stopped
    assert b.delta_v_kmh == 0
    assert abs(b.trajectory.last().t - r.t_fin) <= r.dt + 1e-9


def test_perfil_de_dano_reporta_su_energia() -> None:
    spec = load_fixture("frontal_curva")
    r = reconstruct(spec)
    for v, sv in zip(r.vehiculos, spec["vehiculos"], strict=True):
        k = stiffness_for(sv["clase"]["valor"], "frontal").stiffness
        e = crush_energy(v.crush_profile_m, v.crush_width_m, k)
        assert math.isclose(e, v.crush_energy_j, rel_tol=1e-6, abs_tol=1e-6)
        assert v.stiffness_origen in {"nhtsa", "supuesto"}


VV_SCENES = [
    n
    for n in FIXTURES
    if any(e["tipo"] == "impacto_vehiculo_vehiculo" for e in load_fixture(n)["eventos"])
]


@pytest.mark.parametrize("name", VV_SCENES)
def test_zonas_cdc_se_tocan_en_el_impacto(name: str) -> None:
    """En t = 0 el punto de contacto de cada vehículo coincide con el punto de impacto."""
    spec = load_fixture(name)
    r = reconstruct(spec)
    assert r.punto_impacto is not None
    ev = next(e for e in spec["eventos"] if e["tipo"] == "impacto_vehiculo_vehiculo")
    zonas = {z["vehiculo_id"]: z.get("cdc") for z in ev.get("zonas_impacto", [])}
    for vid in ev["actores"][:2]:
        v = next(x for x in r.vehiculos if x.id == vid)
        tr = v.trajectory
        i0 = tr.t.index(0.0)
        off = rot(contact_offset(zonas.get(vid), v.length, v.width), tr.yaw[i0])
        cx, cy = tr.x[i0] + off[0], tr.y[i0] + off[1]
        gap = math.hypot(cx - r.punto_impacto[0], cy - r.punto_impacto[1])
        assert gap < 0.3, (name, vid, gap)


def test_impacto_excentrico_genera_giro() -> None:
    r = reconstruct(load_fixture("lateral_interseccion"))
    for v in r.vehiculos:
        i0 = v.trajectory.t.index(0.0)
        assert abs(v.trajectory.yaw_rate[i0 + 1]) > 0.05, v.id


def test_trayectoria_del_peaton_es_coherente_con_searle() -> None:
    r = reconstruct(load_fixture("peaton_cruce"))
    p = next(x for x in r.personas if x.throw is not None)
    assert p.throw is not None
    tr = p.track
    assert r.punto_impacto is not None
    i0 = tr.t.index(0.0)
    assert math.isclose(tr.x[i0], r.punto_impacto[0], abs_tol=1e-9)
    assert math.isclose(tr.y[i0], r.punto_impacto[1], abs_tol=1e-9)
    moved = math.hypot(tr.x[-1] - tr.x[i0], tr.y[-1] - tr.y[i0])
    assert math.isclose(moved, p.throw.throw_distance_m, rel_tol=1e-6)
    assert math.isclose(tr.x[-1], p.throw.rest_position[0], abs_tol=1e-6)
    fases = [f.fase for f in tr.fases]
    assert fases[-3:] == ["vuelo", "deslizamiento", "reposo"]
    assert tr.t[0] == pytest.approx(r.t_inicio)
    assert tr.t[-1] == pytest.approx(r.t_fin)
    assert all(z >= 0 for z in tr.z)


def test_ocupantes_van_a_bordo_sin_trayectoria_propia() -> None:
    r = reconstruct(load_fixture("alcance"))
    a_bordo = [p for p in r.personas if p.vehiculo_id is not None]
    assert a_bordo
    assert all(len(p.track) == 0 for p in a_bordo)


def test_la_moto_caida_se_desliza_con_el_arrastre_medido() -> None:
    spec = load_fixture("motociclista")
    nominal = reconstruct(spec, dt=0.05)
    moto = next(v for v in nominal.vehiculos if v.clase == "motocicleta")
    assert nominal.parametros["friccion_moto_caida"]["valor"] == 0.45
    assert nominal.parametros["friccion_moto_caida"]["fuente"] == "peck"
    # Con más arrastre se desliza menos; con menos, más (v² / 2μg con el mismo arranque).
    alto = reconstruct(spec, dt=0.05, downed_mu=0.56)
    bajo = reconstruct(spec, dt=0.05, downed_mu=0.36)
    d = {
        r: next(v for v in x.vehiculos if v.id == moto.id).distance_post_m
        for r, x in (("alto", alto), ("bajo", bajo))
    }
    assert d["alto"] < moto.distance_post_m < d["bajo"]
    assert alto.parametros["friccion_moto_caida"]["valor"] == 0.56
    # El auto no cambia: el arrastre de la moto caída solo aplica a motos y scooters.
    auto = next(v for v in nominal.vehiculos if v.clase != "motocicleta")
    assert next(v for v in alto.vehiculos if v.id == auto.id).rest_pose == auto.rest_pose


def test_sin_moto_no_hay_arrastre_de_moto_caida() -> None:
    for name in list_fixtures():
        spec = load_fixture(name)
        if any(v["clase"]["valor"] in ("motocicleta", "scooter") for v in spec["vehiculos"]):
            continue
        assert "friccion_moto_caida" not in reconstruct(spec, dt=0.1).parametros, name


@pytest.mark.parametrize(
    ("lado", "zona", "forma", "fraccion"),
    [
        ("F", "D", "uniforme", 1.0),
        ("F", "L", "izquierda", 0.4),
        ("B", "Z", "derecha", 0.66),
        ("F", "C", "uniforme", 0.89),
        ("L", "D", "centro", 0.62),
        ("R", "P", "centro", 0.52),
        ("L", "Z", "uniforme", 0.37),
        ("R", "B", "uniforme", 0.21),
        ("L", "F", "izquierda", 0.4),
        ("L", "Y", "izquierda", 0.66),
        # Letra de la otra cara: conserva la regla original.
        ("F", "P", "centro", 0.4),
        ("L", "C", "centro", 0.4),
    ],
)
def test_crush_rules_by_face_and_zone(lado: str, zona: str, forma: str, fraccion: float) -> None:
    """Forma y ancho por cara y zona del CDC (ADR 0033)."""
    from croquis_solver.crash3 import TRIANGULAR_SHAPES
    from croquis_solver.models import Body2D
    from croquis_solver.reconstruct import (
        _crush_shape_and_width,  # pyright: ignore[reportPrivateUsage]
    )

    body = Body2D(1500.0, 2500.0, 4.5, 1.8)
    shape, width = _crush_shape_and_width({"lado": lado, "zona_horizontal": zona}, body)
    side = 1.8 if lado in {"F", "B"} else 4.5
    assert shape == TRIANGULAR_SHAPES[forma]
    assert width == pytest.approx(fraccion * side)
