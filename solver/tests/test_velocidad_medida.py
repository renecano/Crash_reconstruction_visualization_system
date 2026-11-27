"""La velocidad que midió un instrumento (cámara, GPS, tacógrafo) es una restricción dura (René,
2026-11-27): la inversión no la ajusta y ajusta lo demás a ella."""

from __future__ import annotations

import copy

from croquis_scene_schema import load_fixture
from croquis_solver import inversion as inv


def _con_medida(kmh: float) -> dict:
    spec = copy.deepcopy(load_fixture("lateral_interseccion"))
    a = spec["vehiculos"][0]
    a["velocidad_previa"] = {
        "valor": kmh,
        "unidad": "km/h",
        "fuente": "usuario",
        "confianza": 0.9,
        "medida": True,
        "nota": "Medida por la cámara.",
    }
    return spec


def test_la_velocidad_medida_no_es_una_incognita() -> None:
    spec = _con_medida(50.0)
    ev = inv.evidence_from_spec(spec)
    nombres = [p.name for p in inv.parameters(inv.with_marks(spec, ev), ev)]
    vid = spec["vehiculos"][0]["id"]
    assert f"velocidad:{vid}" not in nombres
    # Los demás siguen libres.
    assert any(n.startswith("velocidad:") for n in nombres)


def test_la_inversion_la_respeta_y_ajusta_lo_demas() -> None:
    spec = _con_medida(50.0)
    res = inv.invert(spec, samples=4)
    vid = spec["vehiculos"][0]["id"]
    assert f"velocidad:{vid}" not in res.best.values
    assert all(e.param.name != f"velocidad:{vid}" for e in res.estimates)
