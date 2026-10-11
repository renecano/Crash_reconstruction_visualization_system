from __future__ import annotations

import json

import numpy as np
import pytest

from croquis_solver import friction


def test_toda_combinacion_del_contrato_tiene_rango() -> None:
    for sup in ["asfalto", "concreto", "adoquin", "empedrado", "terraceria"]:
        for est in ["seco", "mojado", "encharcado", "grava_suelta", "aceite", "lodo"]:
            r = friction.tire_friction(sup, est)
            assert 0 < r.low < r.nominal < r.high <= 1.0, (sup, est)
            assert r.fuente
            assert r.tipo in {"primaria", "secundaria", "supuesto"}


def test_mojado_no_supera_a_seco() -> None:
    for sup in ["asfalto", "concreto", "adoquin", "empedrado", "terraceria"]:
        assert (
            friction.tire_friction(sup, "mojado").nominal
            < friction.tire_friction(sup, "seco").nominal
        )


def test_muestreo_determinista_dentro_del_rango() -> None:
    r = friction.tire_friction("asfalto", "mojado")
    a = [r.sample(np.random.default_rng(7)) for _ in range(3)]
    b = [r.sample(np.random.default_rng(7)) for _ in range(3)]
    assert a == b
    assert all(r.low <= v <= r.high for v in a)
    assert r.clamp(5) == r.high
    assert r.clamp(0) == r.low


def test_peaton_y_parametros_humanos() -> None:
    assert friction.pedestrian_friction("asfalto").nominal == 0.66
    assert friction.pedestrian_friction("pasto").nominal == 0.79
    assert friction.pedestrian_friction("desconocida").tipo == "secundaria"
    prt = friction.perception_reaction_time()
    assert prt.low <= 1.1 <= prt.high
    assert friction.abs_peak_factor().tipo == "supuesto"


def test_desconocidos_fallan() -> None:
    with pytest.raises(KeyError):
        friction.tire_friction("hielo", "seco")
    with pytest.raises(KeyError):
        friction.tire_friction("asfalto", "nieve")


def test_json_declara_fuentes() -> None:
    raw = json.loads(friction.DATA_PATH.read_text(encoding="utf-8"))
    assert {"fricke", "mumford", "searle"} <= set(raw["fuentes"])
    assert set(friction.sources()) == set(raw["fuentes"])
