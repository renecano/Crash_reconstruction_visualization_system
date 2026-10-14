"""Banderas de consistencia: una prueba que la dispara y otra que no, por bandera."""

import copy
import re
from typing import Any

from croquis_scene_schema import load_fixture
from croquis_solver import consistency as cons
from croquis_solver.reconstruct import reconstruct

BLAME = re.compile(r"(?i)culpa|culpable|responsable|imprudente|debió|mintió|falso")
JsonObj = dict[str, Any]


def _relato(valor: float, unidad: str) -> JsonObj:
    return {
        "valor": valor,
        "unidad": unidad,
        "fuente": "relato",
        "confianza": 0.8,
        "evidencia": [{"inicio": 0, "fin": 1, "texto": "x"}],
    }


def _codes(spec: JsonObj) -> list[str]:
    flags = cons.check_consistency(spec, samples=12)
    for f in flags:
        assert not BLAME.search(f.mensaje), f.mensaje
    return [f.codigo for f in flags]


def test_detenido_con_velocidad() -> None:
    spec = load_fixture("alcance")
    b = spec["vehiculos"][1]
    b["maniobra"] = {"valor": "detenido", "fuente": "relato", "confianza": 0.9}
    b["velocidad_previa"] = _relato(40, "km/h")
    assert "detenido_con_velocidad" in _codes(spec)
    b["velocidad_previa"] = _relato(0, "km/h")
    assert "detenido_con_velocidad" not in _codes(spec)


def _with_marks(length_m: float, speed_kmh: float) -> JsonObj:
    spec = load_fixture("alcance")
    a = spec["vehiculos"][0]
    a["velocidad_previa"] = _relato(speed_kmh, "km/h")
    spec["evidencias"] = [e for e in spec["evidencias"] if e.get("tipo") != "marcas_frenado"]
    spec["evidencias"].append(
        {
            "id": "evid-marcas-prueba",
            "tipo": "marcas_frenado",
            "vehiculo_id": a["id"],
            "longitud": _relato(length_m, "m"),
            "procedencia": {"fuente": "relato", "confianza": 0.8},
        }
    )
    return spec


def test_marcas_largas_para_la_velocidad() -> None:
    assert "marcas_vs_velocidad" in _codes(_with_marks(45.0, 30.0))
    assert "marcas_vs_velocidad" not in _codes(_with_marks(8.0, 60.0))


def _with_throw(distance_m: float, speed_kmh: float) -> JsonObj:
    spec = load_fixture("peaton_cruce")
    car = next(v for v in spec["vehiculos"] if v["maniobra"]["valor"] not in ("estacionado",))
    car["velocidad_previa"] = _relato(speed_kmh, "km/h")
    for e in spec["evidencias"]:
        if e.get("tipo") == "distancia_proyeccion":
            e["longitud"] = _relato(distance_m, "m")
    return spec


def test_proyeccion_incompatible_con_la_velocidad() -> None:
    assert "proyeccion_vs_velocidad" in _codes(_with_throw(30.0, 15.0))
    assert "proyeccion_vs_velocidad" not in _codes(_with_throw(10.0, 40.0))


def _with_damage(depth_m: float, speed_kmh: float) -> JsonObj:
    spec = load_fixture("alcance")
    for v in spec["vehiculos"]:
        v["velocidad_previa"] = _relato(speed_kmh if v["rol"] == "A" else 0.0, "km/h")
    zones = {"veh-a": "F", "veh-b": "B"}
    spec["danos_declarados"] = [
        {
            "vehiculo_id": vid,
            "zona": {"lado": lado},
            "severidad": "severo",
            "profundidad_aplastamiento": _relato(depth_m, "m"),
            "ancho_danado": _relato(1.4, "m"),
            "procedencia": {"fuente": "relato", "confianza": 0.8},
        }
        for vid, lado in zones.items()
    ]
    return spec


def test_dano_grande_con_velocidad_baja() -> None:
    assert "dano_vs_velocidad" in _codes(_with_damage(0.6, 15.0))


def test_dano_compatible_no_se_marca() -> None:
    assert "dano_vs_velocidad" not in _codes(_with_damage(0.12, 45.0))


def _with_rest(dx: float) -> JsonObj:
    spec = load_fixture("lateral_interseccion")
    spec["evidencias"] = [e for e in spec["evidencias"] if e.get("tipo") != "posicion_final"]
    r = reconstruct(spec, dt=0.1)
    out = copy.deepcopy(spec)
    a = out["vehiculos"][0]
    ra = next(v for v in r.vehiculos if v.id == a["id"])
    a["posicion_final"] = {
        "x": ra.rest_pose[0] + dx,
        "y": ra.rest_pose[1],
        "rumbo_deg": 0.0,
        "procedencia": {"fuente": "usuario", "confianza": 0.9},
    }
    return out


def test_reposo_inalcanzable() -> None:
    assert "reposo_inalcanzable" in _codes(_with_rest(-90.0))
    assert "reposo_inalcanzable" not in _codes(_with_rest(0.0))


def _pedestrian_speed(kmh: float) -> JsonObj:
    spec = load_fixture("peaton_cruce")
    car = next(v for v in spec["vehiculos"] if v["maniobra"]["valor"] != "estacionado")
    car["velocidad_previa"] = _relato(kmh, "km/h")
    return spec


def test_velocidad_fuera_de_lo_que_fija_la_evidencia() -> None:
    # Marcas de 5 m y proyección de 12 m: la evidencia fija la velocidad antes de frenar.
    flags = cons.check_consistency(_pedestrian_speed(20.0), samples=12)
    hit = next(f for f in flags if f.codigo == "velocidad_vs_evidencia")
    assert "antes de frenar" in hit.mensaje
    assert "marcas de frenado" in hit.mensaje
    assert not BLAME.search(hit.mensaje)
    assert "velocidad_vs_evidencia" not in _codes(_pedestrian_speed(53.0))


def test_escenas_canonicas_sin_banderas() -> None:
    # La glorieta también queda limpia, pero su inversión tarda; la cubre la prueba de resultados.
    for name in ("alcance", "lateral_interseccion", "nocturno_lluvia", "poste"):
        assert _codes(load_fixture(name)) == [], name
