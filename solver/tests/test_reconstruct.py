from __future__ import annotations

import json
import math

import pytest

from croquis_scene_schema import list_fixtures, load_fixture
from croquis_solver.crash3 import crush_energy
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
    assert va.crush_width_m < 1.86
    assert max(va.crush_profile_m) > 0.2
    poste = reconstruct(load_fixture("poste"))
    vp = poste.vehiculos[0]
    assert vp.crush_profile_m[2] == max(vp.crush_profile_m)  # forma de poste, centrada


def test_peaton_proyeccion_en_rango_de_searle() -> None:
    r = reconstruct(load_fixture("peaton_cruce"))
    p = r.personas[0]
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
