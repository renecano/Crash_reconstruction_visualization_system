"""Lo medido junto a lo calculado (René, 2026-11-26): con el daño medido en la cara del contacto, la
deformación se calcula con la rigidez del reporte y la forma y el ancho de lo medido; el resultado
lleva C1–C6 medidos, la energía que implican y la rigidez con su fuente."""

import copy
from typing import Any

import pytest

from croquis_scene_schema import load_fixture
from croquis_solver.crash3 import Stiffness, crush_energy
from croquis_solver.reconstruct import reconstruct


def _dano(spec: dict[str, Any], vid: str) -> dict[str, Any]:
    out = reconstruct(spec).to_dict()
    return next(v for v in out["vehiculos"] if v["id"] == vid)["dano"]


def _con_medido() -> dict[str, Any]:
    spec = copy.deepcopy(load_fixture("alcance"))
    spec["danos_declarados"][0] |= {
        "profundidad_aplastamiento": {
            "valor": 0.4,
            "unidad": "m",
            "fuente": "usuario",
            "confianza": 0.9,
        },
        "ancho_danado": {"valor": 1.5, "unidad": "m", "fuente": "usuario", "confianza": 0.9},
        "perfil_aplastamiento": {
            "valor": [0.4, 0.3, 0.2, 0.1],
            "unidad": "m",
            "fuente": "usuario",
            "confianza": 0.9,
        },
        "rigidez": {
            "a": 50000,
            "b": 400000,
            "fuente": "usuario",
            "confianza": 0.9,
            "nota": "Del reporte.",
        },
    }
    return spec


def test_con_la_rigidez_del_reporte_y_la_forma_de_lo_medido() -> None:
    d = _dano(_con_medido(), "veh-a")
    assert d["origen_rigidez"] == "reporte"
    assert d["rigidez"]["fuente"] == "reporte"
    assert d["rigidez"]["a_n_m"] == 50000
    assert d["ancho_m"] == 1.5
    assert d["medido_m"] == pytest.approx([0.4, 0.34, 0.28, 0.22, 0.16, 0.1])
    e = crush_energy([0.4, 0.34, 0.28, 0.22, 0.16, 0.1], 1.5, Stiffness(50000, 400000))
    assert d["energia_medida_j"] == pytest.approx(e, abs=0.01)
    assert d["perfil_m"][0] > d["perfil_m"][5]


def test_sin_medidas_la_rigidez_de_nhtsa_con_su_fuente() -> None:
    d = _dano(load_fixture("alcance"), "veh-b")
    assert d["rigidez"]["fuente"] == "nhtsa"
    assert "medido_m" not in d
