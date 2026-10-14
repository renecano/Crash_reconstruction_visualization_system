"""Línea base de reglas: casos escritos aquí (no son de Relatos-MX) y propiedades generales."""

from typing import Any

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from croquis_extraction import baseline
from croquis_extraction.evaluate import hallucinated_fields
from croquis_scene_schema import schema_errors
from croquis_scene_schema.check import check_escena, errores_de


def _vals(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v.valor for k, v in d.items()}


def test_narrador_con_modelo_velocidad_y_otro_que_se_cierra() -> None:
    f = baseline.extract_facts(
        "Iba en mi Aveo como a 50 por Tollocan y una camioneta blanca se me cerró, le pegué "
        "por detrás. No alcancé a frenar."
    )
    assert f.narrador_vehiculo == 0
    assert _vals(f.vehiculos[0]) == {
        "clase": "sedan_compacto",
        "velocidad_kmh": 50.0,
        "frenado": False,
    }
    assert _vals(f.vehiculos[1]) == {
        "clase": "suv_o_pickup",
        "color": "blanca",
        "maniobra": "cambio_carril",
    }
    assert f.escalares["evento.tipo"].valor == "impacto_vehiculo_vehiculo"


def test_tercera_persona_va_al_otro_vehiculo() -> None:
    f = baseline.extract_facts(
        "Un taxi se pasó a mi carril y me pegó. Yo iba en mi moto a unos sesenta kilómetros por "
        "hora, con casco."
    )
    assert f.narrador_vehiculo == 0
    assert f.vehiculos[0]["clase"].valor == "motocicleta"
    assert f.vehiculos[0]["velocidad_kmh"].valor == 60.0
    assert f.vehiculos[1]["maniobra"].valor == "cambio_carril"
    assert _vals(f.personas[0]) == {"rol": "motociclista", "vehiculo": 0, "casco": True}


def test_atropello_narrado_por_testigo() -> None:
    f = baseline.extract_facts(
        "El conductor del camión frenó pero dejó marcas de 15 metros y atropelló a un señor que "
        "iba cruzando; lo aventó como 8 metros. Eran las 11 de la noche y llovía."
    )
    assert f.narrador_vehiculo is None
    assert _vals(f.vehiculos[0]) == {"clase": "camion_o_autobus", "frenado": True}
    assert f.escalares["evento.tipo"].valor == "impacto_vehiculo_persona"
    assert f.escalares["evidencias.marcas_m"].valor == 15.0
    assert f.escalares["evidencias.distancia_proyeccion_m"].valor == 8.0
    assert f.escalares["entorno.clima"].valor == "lluvia"
    assert [p["rol"].valor for p in f.personas] == ["peaton"]


def test_peaton_que_narra() -> None:
    f = baseline.extract_facts("Yo iba cruzando la calle y un taxi me atropelló.")
    assert f.narrador_vehiculo is None
    assert [p["rol"].valor for p in f.personas] == ["peaton"]
    assert f.escalares["evento.tipo"].valor == "impacto_vehiculo_persona"


def test_alcance_zonas_y_velocidad_cualitativa() -> None:
    f = baseline.extract_facts(
        "Iba manejando muy despacio en la glorieta, frené y aun así le di un alcance al Tsuru de "
        "enfrente. Traía el cinturón puesto."
    )
    assert f.vehiculos[0]["velocidad_kmh"].valor == 8.0
    assert f.vehiculos[0]["frenado"].valor is True
    assert {k: z.valor for k, z in f.zonas.items()} == {0: "F", 1: "B"}
    assert f.escalares["lugar.tipo_via"].valor == "glorieta"
    assert f.personas[0]["cinturon"].valor is True


def test_choque_contra_objeto_sin_nombrar_el_vehiculo_propio() -> None:
    f = baseline.extract_facts(
        "Choqué contra un poste. Iba a 80 en carretera, de noche sin alumbrado."
    )
    assert f.narrador_vehiculo == 0
    assert f.vehiculos[0]["velocidad_kmh"].valor == 80.0
    assert f.escalares["evento.tipo"].valor == "impacto_vehiculo_objeto"
    assert f.escalares["evento.objeto"].valor == "poste"
    # Lo específico ("sin alumbrado") gana a lo ambiguo ("de noche").
    assert f.escalares["entorno.iluminacion"].valor == "noche_sin_alumbrado"


def test_numeros_que_no_son_velocidad() -> None:
    f = baseline.extract_facts("Choqué a las 10:30, iba a 3 cuadras de mi casa con mis dos hijos.")
    assert all("velocidad_kmh" not in v for v in f.vehiculos)


def test_la_hora_da_la_iluminacion() -> None:
    f = baseline.extract_facts("Eran como las 9 de la noche cuando choqué con el taxi.")
    assert f.escalares["entorno.iluminacion"].valor == "noche"


_WORDS = [
    "iba",
    "en",
    "mi",
    "carro",
    "Aveo",
    "a",
    "60",
    "y",
    "un",
    "taxi",
    "se",
    "me",
    "cerró",
    "frené",
    "no",
    "alcancé",
    "a",
    "frenar",
    "camioneta",
    "por",
    "detrás",
    "le",
    "pegué",
    "llovía",
    "de",
    "noche",
    "semáforo",
    "glorieta",
    "poste",
    "moto",
    "señor",
    "cruzando",
    "atropelló",
    "metros",
    "15",
    "marcas",
    "casco",
    "cinturón",
    "volteó",
    ".",
    ",",
    "Yo",
    "el",
    "camión",
    "Tsuru",
    "alcance",
    "blanca",
    "lado",
    "derecho",
    "Choqué",
    "contra",
]


@settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(st.lists(st.sampled_from(_WORDS), min_size=1, max_size=40))
def test_nunca_inventa_citas_y_la_spec_es_valida(words: list[str]) -> None:
    text = " ".join(words)
    spec = baseline.extract_spec(text, "propiedad-1")
    total, bad = hallucinated_fields(spec, text)
    assert bad == 0, total
    assert schema_errors(spec) == []
    assert errores_de(check_escena(spec)) == []
