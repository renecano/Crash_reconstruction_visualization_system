"""E1 en el test CISS: velocidad extraída contra la del EDR de NHTSA."""

from typing import Any

import pytest

from croquis_eval import e1_extraction as e1
from croquis_extraction import relatos_mx
from croquis_extraction.facts import Fact, Facts


def _facts(speed: float | None) -> Facts:
    f = Facts()
    f.vehiculos = [{} if speed is None else {"velocidad_kmh": Fact(speed, "a 60")}]
    f.narrador_vehiculo = 0
    return f


def test_velocidad_contra_edr(monkeypatch: pytest.MonkeyPatch) -> None:
    fichas: dict[str, dict[str, Any]] = {
        "a": {"hechos": {"vehiculos": [{"velocidad_kmh": 65}]},
              "contexto": {"vehiculos": [{"velocidad_edr_kmh": 63.0}]}},
        "b": {"hechos": {"vehiculos": [{"velocidad_kmh": 40}]},
              "contexto": {"vehiculos": [{"velocidad_edr_kmh": 41.5}]}},
        # Sin velocidad narrada: no cuenta aunque el EDR la tenga.
        "c": {"hechos": {"vehiculos": [{}]},
              "contexto": {"vehiculos": [{"velocidad_edr_kmh": 30.0}]}},
    }  # fmt: skip
    monkeypatch.setattr(relatos_mx, "fichas", lambda: fichas)
    items = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    preds = {"a": _facts(60), "b": _facts(None), "c": _facts(30)}
    out = e1.edr_speed(items, preds)
    assert out == {
        "relatos_con_velocidad_del_edr": 2,
        "con_velocidad_extraida": 1,
        "error_medio_kmh_contra_lo_narrado": 5.0,
        "error_medio_kmh_contra_edr": 3.0,
        "piso_por_redondeo_kmh": 2.0,
    }
