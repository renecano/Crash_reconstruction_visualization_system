"""El primer contacto (revisión de la cadena, René 2026-11-24 y 25).

En un alcance o un roce lateral (los dos en el mismo sentido y a la misma velocidad), retroceder a
los dos en proporción a su velocidad no los separaba: el solver los dejaba encimados y la animación
los mostraba saltando. Ahora se retrocede solo al que alcanza.
"""

from types import SimpleNamespace
from typing import Any

from croquis_solver.preimpact import StraightPath
from croquis_solver.reconstruct import first_contact, overlap_depth


def _rect(x: float, largo: float, w: float) -> list[tuple[float, float]]:
    m = largo / 2
    return [(x + m, w / 2), (x + m, -w / 2), (x - m, -w / 2), (x - m, w / 2)]


def _cuerpo(length: float, width: float, v0: float) -> Any:
    return SimpleNamespace(body=SimpleNamespace(length=length, width=width), v0=v0)


def test_en_el_mismo_sentido_retrocede_solo_al_que_alcanza() -> None:
    a = StraightPath((-20.0, 0.0), 0.0, 40.0)
    b = StraightPath((-16.4, 0.0), 0.0, 40.0)
    s = first_contact([_cuerpo(4.4, 1.8, 10.0), _cuerpo(4.4, 1.8, 10.0)], [a, b], [20.0, 20.0])
    assert s[1] == 20.0
    assert s[0] < 19.3
    ra = _rect(-20.0 + s[0], 4.4, 1.8)
    rb = _rect(-16.4 + s[1], 4.4, 1.8)
    assert overlap_depth(ra, rb) <= 0.02


def test_un_choque_oblicuo_sigue_en_proporcion_a_la_velocidad() -> None:
    a = StraightPath((-20.0, 0.0), 0.0, 40.0)
    b = StraightPath((1.0, -20.0), 1.5707963267948966, 40.0)
    s = first_contact([_cuerpo(4.4, 1.8, 10.0), _cuerpo(4.4, 1.8, 10.0)], [a, b], [20.0, 20.0])
    assert s[0] < 20.0
    assert s[1] < 20.0
    assert abs((20.0 - s[0]) - (20.0 - s[1])) < 1e-6
