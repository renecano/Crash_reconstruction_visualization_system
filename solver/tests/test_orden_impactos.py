"""T6.3 (W7): el orden de impactos declarado a mano en una carambola.

El solver no fuerza el orden de los impactos posteriores: cada uno ocurre cuando sus contornos se
tocan. Si el orden que sale no es el declarado, lo avisa con los dos órdenes.
"""

from __future__ import annotations

import copy
import json
from typing import Any

from croquis_scene_schema import FIXTURES_DIR, load_fixture, schema_errors
from croquis_solver.reconstruct import reconstruct

C1 = FIXTURES_DIR / "c1"


def _cuatro() -> dict[str, Any]:
    return json.loads((C1 / "carambola_cuatro.json").read_text(encoding="utf-8"))


def _al_reves(spec: dict[str, Any]) -> dict[str, Any]:
    """Los dos impactos posteriores declarados en el otro orden (como `eval/w7_fixtures.py`)."""
    otra = copy.deepcopy(spec)
    bc = next(e for e in otra["eventos"] if e["id"] == "ev-impacto-2")
    cd = next(e for e in otra["eventos"] if e["id"] == "ev-impacto-3")
    bc["orden"], cd["orden"] = cd["orden"], bc["orden"]
    otra["eventos"] = sorted(otra["eventos"], key=lambda e: int(e["orden"]))
    return otra


def test_la_escena_de_paridad_esta_al_dia() -> None:
    # `eval/w7_fixtures.py` la escribe; el port de TS se compara contra este resultado.
    spec = _cuatro()
    assert schema_errors(spec) == []
    golden = json.loads((C1 / "resultados" / "carambola_cuatro.json").read_text(encoding="utf-8"))
    assert json.loads(json.dumps(reconstruct(spec).to_dict())) == golden


def test_en_el_orden_declarado_no_hay_aviso() -> None:
    r = reconstruct(_cuatro())
    impactos = [e.id for e in r.eventos if e.id.startswith("ev-impacto")]
    assert impactos == ["ev-impacto", "ev-impacto-2", "ev-impacto-3"]
    assert not any(a.codigo == "orden_impactos_distinto" for a in r.avisos)
    assert not any(a.codigo == "impacto_no_ocurre" for a in r.avisos)


def test_con_el_orden_al_reves_se_avisa_con_los_dos_ordenes() -> None:
    r = reconstruct(_al_reves(_cuatro()))
    aviso = next(a for a in r.avisos if a.codigo == "orden_impactos_distinto")
    assert aviso.datos == {
        "declarado": ["ev-impacto-3", "ev-impacto-2"],
        "reconstruido": ["ev-impacto-2", "ev-impacto-3"],
    }
    assert aviso.mensaje == (
        "Los impactos después del primero ocurren en la reconstrucción en otro orden que el "
        "declarado. Declarado: C con D; B con C. Reconstruido: B con C; C con D."
    )
    assert aviso.mensaje in r.banderas


def test_declarar_otro_orden_no_cambia_la_fisica() -> None:
    # El aviso es lo único que cambia: los impactos ocurren cuando los contornos se tocan.
    a = reconstruct(_cuatro())
    b = reconstruct(_al_reves(_cuatro()))
    for va, vb in zip(a.vehiculos, b.vehiculos, strict=True):
        assert va.id == vb.id
        assert va.rest_pose == vb.rest_pose


def test_con_un_solo_impacto_posterior_no_hay_orden_que_revisar() -> None:
    r = reconstruct(load_fixture("carambola"))
    assert not any(a.codigo == "orden_impactos_distinto" for a in r.avisos)
