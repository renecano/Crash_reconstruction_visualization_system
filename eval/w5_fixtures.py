"""Arma la escena de referencia de terreno (C3, W5): la quinta de D1.

**`fixtures/terraceria_topes.json`.** El alcance canónico (`alcance`) llevado a un camino de
terracería mojada, con lo que el perito declara en «¿Cómo es el terreno?»:

- una zona ondulada en la llegada del vehículo que alcanza (10 cm de valle a cresta, cada 6 m);
- un tope antes del impacto, dentro del tramo de frenado, y otro después, en el camino del
  vehículo alcanzado. Los dos con las medidas del reductor circular de la NOM-034-SCT2/SEDATU-2022
  (tabla 38): 0.10 m de alto y 1.40 m de desarrollo;
- una zona de grava suelta después del impacto, con la fricción y el rango de `friction.json`.

Es sintética: prueba que el terreno cambia la reconstrucción y que Python y TS hacen lo mismo. No
reproduce un dictamen.

    uv run python eval/w5_fixtures.py
    pnpm exec prettier --write packages/scene-schema/fixtures/terraceria_topes.json
    uv run croquis-solver reconstruct --all
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from croquis_scene_schema import load_fixture
from croquis_solver import friction

FIXTURES = Path(__file__).resolve().parents[1] / "packages" / "scene-schema" / "fixtures"
DESTINO = FIXTURES / "terraceria_topes.json"
DEL_PERITO = {"fuente": "usuario", "confianza": 0.9}
# El carril de los dos vehículos va sobre y = −6 m; la vía se cubre de y = −10 a y = −2.
Y0, Y1 = -10.0, -2.0
TOPE_ALTO_M = 0.10
TOPE_LARGO_M = 1.40


def rect(x0: float, x1: float) -> list[dict[str, float]]:
    return [{"x": x0, "y": Y0}, {"x": x1, "y": Y0}, {"x": x1, "y": Y1}, {"x": x0, "y": Y1}]


def tope(id_: str, x: float) -> dict[str, Any]:
    return {
        "id": id_,
        "linea": [{"x": x, "y": Y0 + 0.5}, {"x": x, "y": Y1 - 0.5}],
        "alto_m": TOPE_ALTO_M,
        "largo_m": TOPE_LARGO_M,
        "procedencia": {
            **DEL_PERITO,
            "nota": "Reductor circular de la NOM-034-SCT2/SEDATU-2022, tabla 38.",
        },
    }


def armar() -> dict[str, Any]:
    spec: dict[str, Any] = copy.deepcopy(load_fixture("alcance"))
    spec["meta"]["id"] = "fx-terraceria-topes"
    spec["meta"]["titulo"] = "Alcance sobre terracería con ondulación y topes (C3, W5)"
    lugar = spec["lugar"]
    lugar["superficie"] = {
        "valor": "terraceria",
        "fuente": "usuario",
        "confianza": 0.9,
        "nota": "Escena sintética de terreno (W5): el alcance canónico sobre terracería.",
    }
    # Sin fricción declarada: vale la de la tabla para terracería mojada.
    lugar.pop("friccion", None)
    grava = friction.tire_friction("terraceria", "grava_suelta")
    lugar["terreno"] = {
        "relieve": {"fuente": "plano", "procedencia": {"fuente": "default", "confianza": 0.5}},
        "superficies": [
            {
                "id": "grava",
                "tipo": "grava",
                "poligono": rect(2.0, 40.0),
                "friccion": {
                    "valor": grava.nominal,
                    "rango": [grava.low, grava.high],
                    "fuente": "default",
                    "confianza": 0.5,
                    "nota": f"Tabla de fricción ({grava.fuente}).",
                },
                "procedencia": DEL_PERITO,
            }
        ],
        "ondulaciones": [
            {
                "id": "ondulado",
                "poligono": rect(-44.0, -16.0),
                "amplitud_m": 0.10,
                "longitud_onda_m": 6.0,
                "rumbo_deg": 0.0,
                "procedencia": DEL_PERITO,
            }
        ],
        "topes": [tope("tope-antes", -9.0), tope("tope-despues", 5.0)],
    }
    return spec


def main() -> None:
    DESTINO.write_text(json.dumps(armar(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
