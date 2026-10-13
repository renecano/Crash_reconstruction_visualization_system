from __future__ import annotations

import copy

import pytest

from croquis_scene_schema import list_fixtures, list_results, load_result, result_errors
from croquis_solver.results_io import check_all, differences


def test_hay_un_resultado_versionado_por_escena() -> None:
    assert list_results() == list_fixtures()


def test_resultados_versionados_coinciden_con_el_solver() -> None:
    """Equivale a `croquis-solver reconstruct --check` (lo corre CI en Ubuntu y Windows)."""
    assert check_all() == {}


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
