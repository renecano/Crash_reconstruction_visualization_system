"""C1 (W3): choques intermedios contra el objeto que marcó el perito, después del primer impacto."""

import copy
import json
import math
from typing import Any

from croquis_scene_schema import FIXTURES_DIR, load_fixture
from croquis_solver.reconstruct import reconstruct

DEL_PERITO = {"fuente": "usuario", "confianza": 0.9}


def _m(valor: float) -> dict[str, Any]:
    return {"valor": valor, "unidad": "m", "fuente": "usuario", "confianza": 0.9}


def _con_muro(
    spec: dict[str, Any], vid: str, fraccion: float, *, lejos: float = 0.0
) -> dict[str, Any]:
    """El alcance con un muro atravesado en el camino de `vid` después del impacto.

    El muro va donde la trayectoria sin muro pasa a esa `fraccion` del tramo posterior, de frente
    al vehículo. Con `lejos`, se corre esos metros a un lado (el vehículo ya no lo alcanza)."""
    r = reconstruct(spec, dt=0.05)
    tr = next(v for v in r.vehiculos if v.id == vid).trajectory
    despues = [k for k, t in enumerate(tr.t) if t > 0.0]
    k = despues[int(len(despues) * fraccion)]
    rumbo = math.degrees(tr.yaw[k])
    lado = math.radians(rumbo + 90.0)
    out: dict[str, Any] = copy.deepcopy(spec)
    out["entorno"].setdefault("objetos", []).append(
        {
            "id": "muro-1",
            "tipo": "muro",
            "posicion": {
                "x": round(tr.x[k] + lejos * math.cos(lado), 2),
                "y": round(tr.y[k] + lejos * math.sin(lado), 2),
            },
            # A lo largo del muro: perpendicular al avance del vehículo.
            "rumbo_deg": round(rumbo + 90.0, 1),
            "largo": _m(6.0),
            "ancho": _m(0.2),
            "alto": _m(2.5),
            "procedencia": dict(DEL_PERITO),
        }
    )
    orden = max(int(e["orden"]) for e in out["eventos"]) + 1
    out["eventos"].append(
        {
            "id": "ev-muro",
            "orden": orden,
            "tipo": "impacto_vehiculo_objeto",
            "actores": [vid, "muro-1"],
            "procedencia": dict(DEL_PERITO),
        }
    )
    return out


def _golpeado(spec: dict[str, Any]) -> str:
    """El vehículo que más avanza después del impacto (en un alcance, el golpeado)."""
    r = reconstruct(spec, dt=0.05)
    return max(r.vehiculos, key=lambda v: v.distance_post_m).id


def test_el_choque_intermedio_ocurre_contra_el_objeto_marcado() -> None:
    base = load_fixture("alcance")
    vid = _golpeado(base)
    libre = reconstruct(base, dt=0.05)
    spec = _con_muro(base, vid, 0.5)
    r = reconstruct(spec, dt=0.05)
    choque = next(e for e in r.eventos if e.id == "ev-muro")
    # Ocurre después del primer impacto, contra ese objeto y ese vehículo.
    assert choque.tipo == "impacto_vehiculo_objeto"
    assert choque.actores == [vid, "muro-1"]
    assert choque.t > 0.0
    assert choque.detalle["energia_disipada_j"] > 0.0
    assert not any(a.codigo == "impacto_no_ocurre" for a in r.avisos)
    # El contacto está sobre el muro: a menos de su medio largo más el medio ancho del vehículo.
    muro = spec["entorno"]["objetos"][-1]["posicion"]
    px, py = choque.detalle["punto_m"]
    assert math.hypot(px - muro["x"], py - muro["y"]) < 3.0 + 1.2
    # El muro lo detiene: avanza menos que sin él, y no lo atraviesa.
    con = next(v for v in r.vehiculos if v.id == vid)
    sin = next(v for v in libre.vehiculos if v.id == vid)
    assert con.distance_post_m < sin.distance_post_m - 1.0
    rumbo = math.radians(spec["entorno"]["objetos"][-1]["rumbo_deg"] - 90.0)
    avance = (con.rest_pose[0] - muro["x"]) * math.cos(rumbo) + (
        con.rest_pose[1] - muro["y"]
    ) * math.sin(rumbo)
    assert avance < 0.0
    # Deja su daño: es su segundo impacto.
    assert [d.event_id for d in con.later_damage] == ["ev-muro"]
    # El otro vehículo no cambia de trayectoria por el muro.
    otro = next(v.id for v in r.vehiculos if v.id != vid)
    a = next(v for v in r.vehiculos if v.id == otro)
    b = next(v for v in libre.vehiculos if v.id == otro)
    assert math.hypot(a.rest_pose[0] - b.rest_pose[0], a.rest_pose[1] - b.rest_pose[1]) < 0.05


def test_si_el_vehiculo_no_llega_al_objeto_se_avisa() -> None:
    base = load_fixture("alcance")
    vid = _golpeado(base)
    spec = _con_muro(base, vid, 0.5, lejos=15.0)
    r = reconstruct(spec, dt=0.05)
    assert not any(e.id == "ev-muro" for e in r.eventos)
    aviso = next(a for a in r.avisos if a.codigo == "impacto_no_ocurre")
    assert aviso.datos == {"evento": "ev-muro", "vehiculos": [vid], "objeto": "muro-1"}
    # Sin choque, todo queda como sin el objeto.
    libre = reconstruct(base, dt=0.05)
    for v in r.vehiculos:
        w = next(x for x in libre.vehiculos if x.id == v.id)
        assert v.rest_pose == w.rest_pose


def test_sin_choques_intermedios_la_reconstruccion_no_cambia() -> None:
    for nombre in ("alcance", "carambola", "poste", "lateral_interseccion"):
        spec = load_fixture(nombre)
        a = reconstruct(spec, dt=0.05).to_dict()
        b = reconstruct(copy.deepcopy(spec), dt=0.05).to_dict()
        assert a == b


def test_la_escena_de_paridad_esta_al_dia() -> None:
    # `eval/w3_fixtures.py` la escribe; el port de TS se compara contra este resultado.
    c1 = FIXTURES_DIR / "c1"
    spec = json.loads((c1 / "alcance_muro.json").read_text(encoding="utf-8"))
    golden = json.loads((c1 / "resultados" / "alcance_muro.json").read_text(encoding="utf-8"))
    assert json.loads(json.dumps(reconstruct(spec).to_dict())) == golden
