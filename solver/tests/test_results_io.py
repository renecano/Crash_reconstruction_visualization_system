from __future__ import annotations

import copy
import os

import pytest

from croquis_scene_schema import list_fixtures, list_results, load_result, result_errors
from croquis_solver.results_io import check_one, differences, result_targets


def test_hay_un_resultado_versionado_por_escena() -> None:
    assert list_results() == list_fixtures()


# Las referencias más lentas, de la más a la menos lenta (medido el 2026-11-27: 303, 171, 163, 90,
# 76 y 56 s en la laptop). CI las reparte entre dos trabajos con `CROQUIS_RESULTADOS=1/2` o `2/2`:
# cada lenta va al trabajo con menos carga y las demás se alternan. Sin la variable, todas.
_LENTAS = (
    "inversion/axa_reposo_lejano",
    "inversion/axa_alcance",
    "glorieta",
    "lateral_interseccion",
    "inversion/lateral_puntos_paso",
    "inversion/arbol_velocidad_declarada",
)
_COSTO_S = (303, 171, 163, 90, 76, 56)


def _de_esta_parte(targets: list[str]) -> list[str]:
    parte = os.environ.get("CROQUIS_RESULTADOS")
    if not parte:
        return targets
    k = int(parte.split("/")[0]) - 1
    carga = [0, 0]
    dueno: dict[str, int] = {}
    for t, c in zip(_LENTAS, _COSTO_S, strict=True):
        i = 0 if carga[0] <= carga[1] else 1
        dueno[t] = i
        carga[i] += c
    resto = [t for t in targets if t not in dueno]
    for j, t in enumerate(resto):
        dueno[t] = j % 2
    return [t for t in targets if dueno[t] == k]


@pytest.mark.parametrize("target", _de_esta_parte(result_targets()))
def test_resultados_versionados_coinciden_con_el_solver(target: str) -> None:
    """Equivale a `croquis-solver reconstruct --check`, un resultado por prueba para que CI los
    reparta entre procesos (`pytest -n auto`): con el multiarranque, juntos pasaban de 10 min."""
    assert check_one(target) == []


@pytest.mark.parametrize("name", list_fixtures())
def test_cada_resultado_cumple_su_esquema(name: str) -> None:
    doc = load_result(name)
    assert result_errors(doc) == []
    for v in doc["vehiculos"]:
        tr = v["trayectoria"]
        n = len(tr["t"])
        assert all(len(tr[k]) == n for k in tr), v["id"]
        assert tr["t"][0] == pytest.approx(doc["t_inicio"])
        assert tr["t"][-1] == pytest.approx(doc["t_fin"])
        assert 0.0 in tr["t"]


def test_el_esquema_rechaza_resultados_mal_formados() -> None:
    doc = load_result("alcance")
    sin_campo = copy.deepcopy(doc)
    del sin_campo["vehiculos"][0]["dano"]
    assert any("dano" in e for e in result_errors(sin_campo))
    extra = copy.deepcopy(doc)
    extra["vehiculos"][0]["culpable"] = True  # el resultado nunca asigna culpa
    assert result_errors(extra)
    perfil = copy.deepcopy(doc)
    perfil["vehiculos"][0]["dano"]["perfil_m"] = [0.1] * 5
    assert result_errors(perfil)


def test_differences_tolera_ruido_numerico_pero_no_cambios_de_estructura() -> None:
    a = {"x": [1.0, 2.0], "s": "a", "b": True}
    assert differences(a, {"x": [1.0 + 1e-9, 2.0], "s": "a", "b": True}) == []
    assert differences(a, {"x": [1.0, 2.1], "s": "a", "b": True})
    assert differences(a, {"x": [1.0], "s": "a", "b": True})
    assert differences(a, {"x": [1.0, 2.0], "s": "b", "b": True})
    assert differences(a, {"x": [1.0, 2.0], "s": "a", "b": False})
    assert differences(a, {"x": [1.0, 2.0], "s": "a"})


def test_tolerancia_del_ajuste_solo_en_inversion_y_consistencia() -> None:
    from croquis_solver.results_io import differences

    base = {"vehiculos": [{"v": 16.07}], "inversion": {"s": 16.07, "ok": True}}
    # Una unidad del último decimal reportado pasa en la inversión, no en el resto del solver.
    near = {"vehiculos": [{"v": 16.08}], "inversion": {"s": 16.08, "ok": True}}
    diffs = differences(base, near)
    assert diffs == ["/vehiculos/0/v: 16.07 ≠ 16.08"]  # el solver se compara exacto
    # Más que eso ya es una diferencia también en la inversión (antes, con BLAS, pasaba hasta 5 %).
    beyond = {"vehiculos": [{"v": 16.07}], "inversion": {"s": 16.13, "ok": True}}
    assert differences(base, beyond) == ["/inversion/s: 16.07 ≠ 16.13"]
    flipped = {"vehiculos": [{"v": 16.07}], "inversion": {"s": 16.07, "ok": False}}
    assert differences(base, flipped) == ["/inversion/ok: True ≠ False"]
    far = {"vehiculos": [{"v": 16.07}], "inversion": {"s": 18.0, "ok": True}}
    assert differences(base, far) == ["/inversion/s: 16.07 ≠ 18.0"]
