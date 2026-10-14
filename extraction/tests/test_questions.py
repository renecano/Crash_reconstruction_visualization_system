"""Preguntas por contradicción, sensibilidad y ambigüedad sobre las escenas canónicas."""

import copy
import random
import re

from croquis_extraction import questions as q
from croquis_scene_schema import load_fixture
from croquis_solver.reconstruct import Aviso

BLAME = re.compile(r"(?i)culpa|culpable|responsable|irresponsable|imprudente|debió|deberías")


def test_proyeccion_contradictoria_se_pregunta_sin_culpar() -> None:
    # Marcas de 5 m y proyección de 12 m no caben con "como a 40": una sola pregunta lo cubre (la
    # de consistencia usa la proyección como evidencia; el aviso del solver sobre ella sobraría).
    spec = load_fixture("peaton_cruce")
    qs = q.ask(spec, spec["meta"]["relato"])
    assert qs[0].motivo == "contradiccion"
    assert qs[0].id.startswith("velocidad:")
    assert "distancia a la que quedó la persona" in qs[0].texto
    assert not any(p.id.startswith("proyeccion:") for p in qs)
    for p in qs:
        assert not BLAME.search(p.texto)


def test_aviso_de_proyeccion_sin_bandera_de_evidencia_se_pregunta() -> None:
    spec = load_fixture("peaton_cruce")
    car = next(v for v in spec["vehiculos"] if v["maniobra"]["valor"] != "estacionado")
    car["velocidad_previa"]["valor"] = 53  # cabe con la evidencia: no hay bandera de velocidad
    car["velocidad_previa"].pop("rango", None)
    qs = q.ask(spec, spec["meta"]["relato"])
    assert not any(p.id.startswith("velocidad:") and p.motivo == "contradiccion" for p in qs)


def test_maximo_tres_y_sin_temas_repetidos() -> None:
    for name in ("frontal_curva", "lateral_interseccion", "poste", "volcadura", "motociclista"):
        spec = load_fixture(name)
        qs = q.ask(spec, spec["meta"]["relato"])
        assert len(qs) <= q.MAX_QUESTIONS
        topics = [q.topic(p.id) for p in qs]
        assert len(topics) == len(set(topics)), name
        for p in qs:
            assert not BLAME.search(p.texto), p.texto


def test_sensibilidad_deterministica_con_semilla() -> None:
    spec = load_fixture("lateral_interseccion")
    a = [(c.pregunta.id, s, e) for c, s, e in q.sensitivity(spec, seed=7, n=4)]
    b = [(c.pregunta.id, s, e) for c, s, e in q.sensitivity(spec, seed=7, n=4)]
    assert a == b
    shares = [s for _, s, _ in a]
    assert abs(sum(shares) - 1.0) < 1e-6
    assert shares == sorted(shares, reverse=True)


def test_dato_afirmado_no_se_pregunta() -> None:
    spec = load_fixture("lateral_interseccion")
    ids = {c.pregunta.id for c in q.candidates(spec, random.Random(1))}
    assert "velocidad:veh-b" in ids
    stated = copy.deepcopy(spec)
    stated["vehiculos"][1]["velocidad_previa"]["fuente"] = "usuario"
    ids2 = {c.pregunta.id for c in q.candidates(stated, random.Random(1))}
    assert "velocidad:veh-b" not in ids2


def test_velocidad_que_domina_el_resultado_se_pregunta() -> None:
    spec = load_fixture("lateral_interseccion")
    ranked = q.sensitivity(spec, seed=3, n=4)
    speed = next((s, e) for c, s, e in ranked if c.pregunta.id == "velocidad:veh-b")
    assert speed[0] >= q.MIN_SHARE
    assert speed[1] >= q.MIN_EFFECT


def test_respuestas_previas_no_se_repiten() -> None:
    spec = load_fixture("peaton_cruce")
    first = q.ask(spec, spec["meta"]["relato"])
    again = q.ask(spec, spec["meta"]["relato"], answered=frozenset(p.id for p in first))
    assert not {p.id for p in first} & {p.id for p in again}


def test_narrador_en_segunda_persona() -> None:
    spec = load_fixture("poste")
    avisos = [Aviso("frenado_sin_distancia", "m", {"vehiculo": "veh-a"})]
    texto = q.from_avisos(spec, avisos)[0].texto
    assert texto.startswith("¿Desde dónde empezaste a frenar?")


def test_ambiguedad_del_glosario() -> None:
    qs = q.from_glossary("Se me cerró un camión en el cruce")
    assert any(p.id == "glosario:camion" for p in qs)
    assert all(p.motivo == "ambiguedad" for p in qs)


def test_respuestas_actualizan_la_escena_como_usuario() -> None:
    from croquis_scene_schema import schema_errors

    spec = load_fixture("lateral_interseccion")
    out, applied = q.apply_answers(
        spec,
        {
            "velocidad:veh-b": "como a 45",
            "frenado:veh-a": "no",
            "estado_superficie": "mojado",
            "maniobra:veh-b": "dio vuelta a la izquierda",
            "zonas_impacto": "frente",
            "frenado:veh-b": "no sé",
        },
    )
    assert set(applied) == {
        "velocidad:veh-b",
        "frenado:veh-a",
        "estado_superficie",
        "maniobra:veh-b",
    }
    b = out["vehiculos"][1]
    assert b["velocidad_previa"] == {
        "valor": 45.0,
        "unidad": "km/h",
        "fuente": "usuario",
        "confianza": q.USER_CONFIDENCE,
    }
    assert b["maniobra"]["valor"] == "vuelta_izquierda"
    assert out["vehiculos"][0]["frenado"]["aplico"]["valor"] is False
    assert out["lugar"]["estado_superficie"]["fuente"] == "usuario"
    assert spec["vehiculos"][1]["velocidad_previa"]["fuente"] != "usuario"  # no muta
    assert schema_errors(out) == []
    # Lo contestado ya no se vuelve a preguntar por sensibilidad.
    ids = {c.pregunta.id for c in q.candidates(out, random.Random(1))}
    assert "velocidad:veh-b" not in ids


def test_respuestas_fuera_de_rango_se_ignoran() -> None:
    spec = load_fixture("lateral_interseccion")
    _, applied = q.apply_answers(spec, {"velocidad:veh-b": "999", "clase:veh-b": "nave espacial"})
    assert applied == []


def test_inconsistencia_fisica_se_pregunta_primero() -> None:
    spec = load_fixture("alcance")
    b = spec["vehiculos"][1]
    b["maniobra"] = {"valor": "detenido", "fuente": "relato", "confianza": 0.9}
    b["velocidad_previa"] = {"valor": 40, "unidad": "km/h", "fuente": "usuario", "confianza": 0.9}
    qs = q.ask(spec)
    assert qs[0].motivo == "contradiccion"
    assert "detenido" in qs[0].texto
    assert not BLAME.search(qs[0].texto)
