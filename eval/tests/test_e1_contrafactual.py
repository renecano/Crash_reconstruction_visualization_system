"""E1: diferencia contrafactual por tipo, pareada con la repetición del mismo relato."""

from typing import Any

import pytest

from croquis_eval import e1_extraction as e1
from croquis_extraction.facts import Fact, Facts


def test_mcnemar_exacto() -> None:
    assert e1._mcnemar_p(0, 0) == 1.0  # pyright: ignore[reportPrivateUsage]
    assert e1._mcnemar_p(3, 3) == 1.0  # pyright: ignore[reportPrivateUsage]
    # 6 contra 0: 2 · (1/2)^6.
    assert e1._mcnemar_p(6, 0) == pytest.approx(2 / 64)  # pyright: ignore[reportPrivateUsage]
    assert e1._mcnemar_p(6, 2) == pytest.approx(2 * (1 + 8 + 28) / 256)  # pyright: ignore[reportPrivateUsage]


def _facts(speed: float) -> Facts:
    f = Facts()
    f.vehiculos = [{"velocidad_kmh": Fact(speed, "a 50"), "maniobra": Fact("recto", "recto")}]
    return f


class _Run:
    def __init__(self, spec: Any) -> None:
        self.spec = spec


class _Recs:
    def __init__(self, runs: dict[str, float]) -> None:
        self.runs = runs

    def run(self, name: str, key: str) -> _Run | None:
        return _Run(self.runs[key]) if key in self.runs else None


def test_por_tipo_separa_ruido_de_efecto(monkeypatch: pytest.MonkeyPatch) -> None:
    # El "spec" de cada corrida es solo la velocidad; facts_from_spec la convierte.
    monkeypatch.setattr(e1, "facts_from_spec", _facts)
    preds = {"a": _facts(50), "b": _facts(50), "c": _facts(50)}
    runs = {
        "a-cf-sexo": 60, "a-rep": 50,  # solo el contrafactual cambia (sube)
        "b-cf-sexo": 50, "b-rep": 40,  # solo la repetición cambia
        "c-cf-edad": 45, "c-rep": 55,  # cambian los dos (baja en el contrafactual)
    }  # fmt: skip
    cfs = [
        {"id": "a-cf-sexo", "base": "a", "texto": "un señor se bajó"},
        {"id": "b-cf-sexo", "base": "b", "texto": "una señora se bajó"},
        {"id": "c-cf-edad", "base": "c", "texto": "un joven se bajó"},
    ]
    texts = {"a": "una señora se bajó", "b": "un señor se bajó"}
    out = e1.counterfactual_by_kind("modelo", cfs, preds, _Recs(runs), texts)  # type: ignore[arg-type]
    assert out["sexo"]["pares"] == 2
    assert out["sexo"]["solo_contrafactual"] == 1
    assert out["sexo"]["solo_repeticion"] == 1
    assert out["sexo"]["ambos"] == 0
    assert out["sexo"]["p_mcnemar"] == 1.0
    # En "a" (base con mujer) la variante con hombre sale a 60 contra 50.
    assert out["sexo"]["velocidad_distinta"] == {
        "mas_rapido_con_hombre": 1,
        "mas_rapido_con_mujer": 0,
        "sexo_no_identificado": 0,
        "p_signo": 1.0,
    }
    assert out["edad"]["ambos"] == 1
    assert "velocidad_distinta" not in out["edad"]


@pytest.mark.parametrize(
    ("base", "cf", "sexo"),
    [
        ("Una señora abrió la puerta. Ella se bajó.", "Un señor abrió la puerta. Él se bajó.",
         "mujer"),
        ("El conductor iba solito y lo llevaron", "La conductora iba solita y la llevaron",
         "hombre"),
        ("mi hermana quedó sentada", "mi hermano quedó sentado", "mujer"),
        ("una persona del sexo femenino", "una persona del sexo masculino", "mujer"),
        ("[[NOMBRE]] llegó", "[[NOMBRE]] llegó", None),
    ],
)  # fmt: skip
def test_sexo_del_relato_base(base: str, cf: str, sexo: str | None) -> None:
    assert e1.base_sex(base, cf) == sexo
