import copy
from typing import Any

import pytest

from croquis_extraction.facts import Fact, Facts, facts_from_annotation, facts_from_spec
from croquis_extraction.spec_builder import EvidenceError, build_spec
from croquis_extraction.verify import DOWNGRADED_CONFIDENCE, verify_spec
from croquis_scene_schema import schema_errors
from croquis_scene_schema.check import check_escena, errores_de

TEXT = (
    "Iba en mi Aveo como a 50 por la avenida con el piso mojado y una camioneta blanca se me "
    "cerró; le pegué por detrás. No alcancé a frenar. Había semáforo."
)
ANNOTATION: dict[str, Any] = {
    "tipo": "vv",
    "lugar.estado_superficie": ["mojado", "el piso mojado"],
    "evento.tipo": ["impacto_vehiculo_vehiculo", "le pegué por detrás"],
    "dispositivos": [["semaforo", "semáforo"]],
    "zonas": {"0": ["F", "le pegué por detrás"], "1": ["B", "le pegué por detrás"]},
    "vehiculos": [
        {
            "narrador": True,
            "clase": ["sedan_compacto", "Aveo"],
            "velocidad_kmh": [50, "como a 50"],
            "frenado": [False, "No alcancé a frenar"],
        },
        {
            "clase": ["suv_o_pickup", "camioneta"],
            "maniobra": ["cambio_carril", "se me cerró"],
            "color": ["blanca", "blanca"],
        },
    ],
    "personas": [{"rol": ["conductor", "Iba"], "vehiculo": 0}],
}


def _spec() -> dict[str, Any]:
    return build_spec(facts_from_annotation(ANNOTATION), TEXT, spec_id="prueba-1")


def test_anotacion_sin_cita_cuenta_como_supuesto() -> None:
    assert facts_from_annotation({"lugar.superficie": "asfalto"}).escalares[
        "lugar.superficie"
    ] == Fact("asfalto", None, "supuesto")
    f = facts_from_annotation(ANNOTATION)
    assert f.narrador_vehiculo == 0
    assert f.zonas == {0: Fact("F", "le pegué por detrás"), 1: Fact("B", "le pegué por detrás")}


def test_la_spec_construida_es_valida_en_esquema_y_semantica() -> None:
    spec = _spec()
    assert schema_errors(spec) == []
    assert errores_de(check_escena(spec)) == []


def test_evidencia_cita_el_fragmento_literal() -> None:
    spec = _spec()
    sup = spec["lugar"]["estado_superficie"]
    assert sup["fuente"] == "relato"
    ev = sup["evidencia"][0]
    assert TEXT[ev["inicio"] : ev["fin"]] == ev["texto"] == "el piso mojado"


def test_lo_no_dicho_nunca_sale_como_relato() -> None:
    spec = _spec()
    assert spec["entorno"]["clima"]["fuente"] == "default"
    assert spec["lugar"]["ancho_carril"]["fuente"] == "default"


def test_valor_generico_se_precisa_como_supuesto_con_nota() -> None:
    spec = _spec()
    clase = spec["vehiculos"][1]["clase"]
    assert clase["valor"] != "suv_o_pickup"
    assert clase["fuente"] == "supuesto"
    assert "camioneta" in clase["evidencia"][0]["texto"]
    assert "confírmalo" in clase["nota"]


def test_cita_inexistente_es_error_al_construir() -> None:
    bad = copy.deepcopy(ANNOTATION)
    bad["lugar.estado_superficie"] = ["mojado", "el pavimento encharcado"]
    with pytest.raises(EvidenceError):
        build_spec(facts_from_annotation(bad), TEXT, spec_id="x")


def test_semilla_deterministica_por_id() -> None:
    assert _spec() == _spec()
    other = build_spec(facts_from_annotation(ANNOTATION), TEXT, spec_id="prueba-2")
    assert other["meta"]["semilla"] != _spec()["meta"]["semilla"]


def test_ida_y_vuelta_de_hechos_conserva_lo_afirmado() -> None:
    back = facts_from_spec(_spec())
    assert back.narrador_vehiculo == 0
    v0 = back.vehiculos[0]
    assert v0["velocidad_kmh"].valor == pytest.approx(50.0)
    assert v0["velocidad_kmh"].stated
    assert v0["frenado"].valor is False
    assert back.escalares["evento.tipo"].valor == "impacto_vehiculo_vehiculo"
    assert back.zonas[0].valor == "F"
    assert back.zonas[1].valor == "B"
    assert [d.valor for d in back.dispositivos] == ["semaforo"]


def test_verificador_deja_intacta_una_spec_honesta() -> None:
    spec = _spec()
    out, stats = verify_spec(spec, TEXT)
    assert out == spec
    assert stats.revisados > 0
    assert stats.degradados == stats.corregidos == 0


def test_verificador_corrige_posiciones_y_degrada_citas_inventadas() -> None:
    spec = _spec()
    sup = spec["lugar"]["estado_superficie"]
    sup["evidencia"][0]["inicio"] += 3
    sup["evidencia"][0]["fin"] += 3
    spec["entorno"]["clima"] = {
        "valor": "lluvia_fuerte",
        "fuente": "relato",
        "confianza": 0.95,
        "evidencia": [{"inicio": 0, "fin": 15, "texto": "llovía a cántaros"}],
    }
    out, stats = verify_spec(spec, TEXT)
    assert stats.corregidos == 1
    assert stats.degradados == 1
    ev = out["lugar"]["estado_superficie"]["evidencia"][0]
    assert TEXT[ev["inicio"] : ev["fin"]] == "el piso mojado"
    clima = out["entorno"]["clima"]
    assert clima["fuente"] == "supuesto"
    assert clima["confianza"] == DOWNGRADED_CONFIDENCE
    assert "evidencia" not in clima
    assert "no aparece literal" in clima["nota"]
    assert spec["entorno"]["clima"]["fuente"] == "relato"  # no muta la entrada
    assert schema_errors(out) == []


def test_verificador_degrada_relato_sin_evidencia() -> None:
    spec = _spec()
    del spec["lugar"]["estado_superficie"]["evidencia"]
    out, stats = verify_spec(spec, TEXT)
    assert stats.degradados == 1
    assert out["lugar"]["estado_superficie"]["fuente"] == "supuesto"


def test_hechos_vacios_dan_spec_valida_con_valores_por_omision() -> None:
    spec = build_spec(Facts(tipo="vv"), "Choqué.", spec_id="relato-vacio")
    assert schema_errors(spec) == []
    assert len(spec["vehiculos"]) >= 1
