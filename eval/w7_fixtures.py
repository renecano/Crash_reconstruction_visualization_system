"""Arma la escena de paridad de W7 (T6.3: el orden de impactos a mano). Es sintética: prueba que
Python y TS hacen lo mismo, no reproduce un dictamen.

**`fixtures/c1/carambola_cuatro.json`.** La `carambola` canónica con un cuarto vehículo, D, detenido
delante de C a 40 cm. El hecho declara tres impactos: A alcanza a B, B golpea a C y C golpea a D.
Su reconstrucción de referencia va en `fixtures/c1/resultados/carambola_cuatro.json`.

Con el orden de los dos últimos al revés (el perito declara «C con D» antes que «B con C»), la
reconstrucción no cambia —cada impacto ocurre cuando sus contornos se tocan— y avisa que el orden
reconstruido es otro (`orden_impactos_distinto`). Esa variante la arman las pruebas con
`al_reves`.

    uv run python eval/w7_fixtures.py
    pnpm exec prettier --write packages/scene-schema/fixtures/c1
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from croquis_scene_schema import load_fixture
from croquis_solver.reconstruct import reconstruct

FIXTURES = Path(__file__).resolve().parents[1] / "packages" / "scene-schema" / "fixtures"
C1 = FIXTURES / "c1"
DEL_PERITO = {"fuente": "usuario", "confianza": 0.9}
SEPARACION_M = 0.4


def armar_carambola_cuatro() -> dict[str, Any]:
    spec: dict[str, Any] = copy.deepcopy(load_fixture("carambola"))
    spec["meta"]["id"] = "fx-carambola-cuatro"
    spec["meta"]["titulo"] = "Carambola de cuatro con el orden de impactos declarado (T6.3, W7)"
    c = next(v for v in spec["vehiculos"] if v["id"] == "veh-c")
    d = copy.deepcopy(c)
    d["id"] = "veh-d"
    d["rol"] = "D"
    largo = float(c["largo"]["valor"])
    d["posicion_inicial"]["x"] = round(float(c["posicion_inicial"]["x"]) + largo + SEPARACION_M, 3)
    d["posicion_inicial"]["procedencia"] = {
        **DEL_PERITO,
        "nota": "Detenido delante de C, a 40 cm.",
    }
    for o in d.get("ocupantes", []):
        o["id"] = f"{o['id']}-d"
    spec["vehiculos"].append(d)
    bc = next(e for e in spec["eventos"] if e["tipo"] == "segundo_impacto")
    cd = copy.deepcopy(bc)
    cd["id"] = "ev-impacto-3"
    cd["orden"] = int(bc["orden"]) + 1
    cd["actores"] = ["veh-c", "veh-d"]
    cd["descripcion"] = "C, empujado por B, pega con su frente en la parte trasera de D, detenido."
    cd["zonas_impacto"] = [
        {**z, "vehiculo_id": {"veh-b": "veh-c", "veh-c": "veh-d"}[z["vehiculo_id"]]}
        for z in bc["zonas_impacto"]
    ]
    cd["procedencia"] = dict(DEL_PERITO)
    reposo = next(e for e in spec["eventos"] if e["tipo"] == "reposo")
    reposo["actores"] = [*reposo["actores"], "veh-d"]
    reposo["orden"] = int(cd["orden"]) + 1
    spec["eventos"] = sorted([*spec["eventos"], cd], key=lambda e: int(e["orden"]))
    return spec


def al_reves(spec: dict[str, Any]) -> dict[str, Any]:
    """La misma escena con los dos impactos posteriores declarados en el otro orden."""
    otra = copy.deepcopy(spec)
    bc = next(e for e in otra["eventos"] if e["id"] == "ev-impacto-2")
    cd = next(e for e in otra["eventos"] if e["id"] == "ev-impacto-3")
    bc["orden"], cd["orden"] = cd["orden"], bc["orden"]
    otra["eventos"] = sorted(otra["eventos"], key=lambda e: int(e["orden"]))
    return otra


def _escribir(ruta: Path, doc: dict[str, Any], *, compacto: bool = False) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    texto = (
        json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
        if compacto
        else json.dumps(doc, ensure_ascii=False, indent=2)
    )
    ruta.write_text(texto + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    escena = armar_carambola_cuatro()
    _escribir(C1 / "carambola_cuatro.json", escena)
    _escribir(
        C1 / "resultados" / "carambola_cuatro.json", reconstruct(escena).to_dict(), compacto=True
    )
