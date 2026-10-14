from collections import Counter

from hypothesis import given
from hypothesis import strategies as st

from croquis_extraction.evaluate import (
    Score,
    counterfactual_diff,
    hallucinated_fields,
    pii_leaks,
    score_story,
    values_match,
)
from croquis_extraction.facts import Fact, Facts


def _veh(**kw: object) -> dict[str, Fact]:
    return {k: Fact(v, k) for k, v in kw.items()}


def test_equivalencias_aceptan_la_precision_del_valor_generico() -> None:
    assert values_match("clase", "suv_o_pickup", "pickup")
    assert values_match("clase", "pickup", "suv_o_pickup")
    assert values_match("entorno.iluminacion", "noche", "noche_con_alumbrado")
    assert not values_match("clase", "suv_o_pickup", "sedan_compacto")


def test_numeros_aciertan_dentro_de_la_tolerancia() -> None:
    assert values_match("velocidad_kmh", 50, 59.9)
    assert not values_match("velocidad_kmh", 50, 61)
    assert values_match("evidencias.marcas_m", 12, 13.5)
    assert not values_match("lugar.carriles_por_sentido", 2, 3)
    assert not values_match("velocidad_kmh", 50, "rápido")


def test_valor_equivocado_cuenta_como_falso_positivo_y_negativo() -> None:
    sc = Score()
    sc.add("entorno.clima", Fact("lluvia_ligera", "llovía"), Fact("niebla", "niebla"))
    assert (sc.tp["entorno.clima"], sc.fp["entorno.clima"], sc.fn["entorno.clima"]) == (0, 1, 1)


def test_lo_supuesto_no_suma_ni_resta() -> None:
    sc = Score()
    sc.add("entorno.clima", Fact("lluvia_ligera", None, "supuesto"), None)
    sc.add("entorno.clima", None, Fact("despejado", None, "default"))
    assert sum(sc.tp.values()) + sum(sc.fp.values()) + sum(sc.fn.values()) == 0


def test_prediccion_perfecta_da_f1_uno() -> None:
    ref = Facts(
        escalares={"evento.tipo": Fact("impacto_vehiculo_vehiculo", "le pegué")},
        dispositivos=[Fact("semaforo", "semáforo")],
        vehiculos=[_veh(clase="sedan_compacto", velocidad_kmh=50), _veh(clase="pickup")],
        narrador_vehiculo=0,
        personas=[{"rol": Fact("conductor", "iba")}],
        zonas={0: Fact("F", "por detrás"), 1: Fact("B", "por detrás")},
    )
    rep = score_story(ref, ref).report()
    assert rep["f1_micro"] == 1.0
    assert rep["f1_macro"] == 1.0
    assert rep["numero_de_vehiculos_exacto"] == 1.0


def test_emparejamiento_no_depende_del_orden_de_los_vehiculos() -> None:
    a = _veh(clase="motocicleta", maniobra="recto")
    b = _veh(clase="pickup", maniobra="vuelta_izquierda")
    ref = Facts(vehiculos=[a, b])
    pred = Facts(vehiculos=[b, a])
    assert score_story(ref, pred).report()["f1_micro"] == 1.0


def test_vehiculo_de_mas_y_de_menos() -> None:
    ref = Facts(vehiculos=[_veh(clase="sedan_compacto")])
    pred = Facts(vehiculos=[_veh(clase="sedan_compacto"), _veh(clase="autobus")])
    sc = score_story(ref, pred)
    assert sc.tp["clase"] == 1
    assert sc.fp["clase"] == 1
    assert sc.report()["numero_de_vehiculos_exacto"] == 0.0


@given(st.lists(st.tuples(st.booleans(), st.booleans(), st.booleans()), max_size=30))
def test_f1_entre_cero_y_uno(cases: list[tuple[bool, bool, bool]]) -> None:
    sc = Score()
    for has_ref, has_pred, same in cases:
        ref = Fact("a", "a") if has_ref else None
        pred = Fact("a" if same else "b", "b") if has_pred else None
        sc.add("entorno.clima", ref, pred)
    rep = sc.report()
    assert 0.0 <= rep["f1_micro"] <= 1.0
    total = sc.tp["entorno.clima"] + sc.fn["entorno.clima"]
    assert total == sum(1 for r, _, _ in cases if r)


def test_alucinacion_cuenta_citas_que_no_estan() -> None:
    spec = {
        "a": {"fuente": "relato", "evidencia": [{"texto": "iba a 40"}]},
        "b": [{"fuente": "relato", "evidencia": [{"texto": "a 90"}]}],
        "c": {"fuente": "relato"},
        "d": {"fuente": "supuesto"},
    }
    assert hallucinated_fields(spec, "yo iba a 40 por la lateral") == (3, 2)


def test_fuga_de_pii_por_tipo() -> None:
    pii = [{"tipo": "NOMBRE", "texto": "Brandon"}, {"tipo": "PLACA", "texto": "ABC-123-D"}]
    total, leaked, kinds = pii_leaks(pii, "[PLACA] y Brandon")
    assert (total, leaked, kinds) == (2, 1, Counter({"NOMBRE": 1}))


def test_contrafactual_solo_mira_velocidades_y_maniobras() -> None:
    base = Facts(vehiculos=[_veh(clase="sedan_compacto", velocidad_kmh=50, maniobra="recto")])
    same = Facts(vehiculos=[_veh(clase="pickup", velocidad_kmh=50.2, maniobra="recto")])
    faster = Facts(vehiculos=[_veh(clase="sedan_compacto", velocidad_kmh=70, maniobra="recto")])
    assert not counterfactual_diff(base, same)
    assert counterfactual_diff(base, faster)


def test_inferencia_de_la_referencia_no_castiga_al_que_la_afirma() -> None:
    sc = Score()
    sc.add("entorno.clima", Fact("lluvia_ligera", None, "supuesto"), Fact("lluvia", "llovía"))
    assert sum(sc.fp.values()) == 0
    sc.add("entorno.clima", Fact("lluvia_ligera", None, "supuesto"), Fact("niebla", "neblina"))
    assert sc.fp["entorno.clima"] == 1


def test_conductor_del_otro_vehiculo_no_es_error() -> None:
    ref = Facts(
        vehiculos=[_veh(clase="sedan_compacto"), _veh(clase="pickup")],
        personas=[{"rol": Fact("conductor", "iba")}],
    )
    pred = Facts(
        vehiculos=[_veh(clase="sedan_compacto"), _veh(clase="pickup")],
        personas=[{"rol": Fact("conductor", "iba")}, {"rol": Fact("conductor", "el chofer")}],
    )
    sc = score_story(ref, pred)
    assert sc.fp["persona.rol"] == 0
    pred.personas.append({"rol": Fact("conductor", "otro más")})
    assert score_story(ref, pred).fp["persona.rol"] == 1
