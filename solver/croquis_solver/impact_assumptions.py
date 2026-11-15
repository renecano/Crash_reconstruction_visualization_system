"""Los tres supuestos del impacto, con su rango (auditoría del 2026-11-15, C5; ADR 0139).

El solver fijaba la restitución, la razón de impulso y el arrastre después del impacto en un solo
valor. Los tres dominan la velocidad que sale de la reconstrucción y ninguno entraba al rango. Aquí
están con su valor nominal (el de siempre: el mejor ajuste no cambia) y el rango en el que el Monte
Carlo y la inversión los sortean, cada uno con su fuente:

* **Restitución** entre vehículos: nominal 0.1; rango 0 a 0.3. Brach, Brach y Pongetti (2014),
  «Analysis of High-Speed Sideswipe Collisions Using Data from Small Overlap Tests», SAE Int. J.
  Trans. Safety 2(1), 2014-01-0469: 40 pruebas contra barrera dan 0 ≤ e ≤ 0.3 (media 0.13) y 9
  entre vehículos, 0 ≤ e ≤ 0.2 (media 0.06). El nominal queda entre las dos medias.
* **Razón de impulso** (impulso tangencial entre normal, tope de la fricción de contacto): nominal
  0.4; rango 0.29 a 0.49. La literatura no tabula un rango absoluto: la da como fracción de la razón
  crítica. Se arma con dos mediciones: la razón crítica fue de 0.40 a 0.51 en cuatro pruebas
  frontales oblicuas (Cormier, Funk, Beauchamp y Pentecost, 2021, «Pycrash», SAE 2021-01-0896) y, en
  los choques que deslizan, la razón queda entre 72 % y 96 % de la crítica (Brach et al. 2014).
  0.40 × 0.72 = 0.29 y 0.51 × 0.96 = 0.49. Es un **supuesto declarado**, con esa justificación.
* **Arrastre después del impacto**, como fracción de la fricción llanta–pavimento cuando las llantas
  no van bloqueadas: nominal 0.35; rango 0.3 a 0.5 (Fricke 2010, *Traffic Crash Reconstruction*).

Se sortean con un hipercubo latino aparte y de diseño fijo, como los supuestos del tope
(`terrain.bump_sampler`): los sorteos de los demás campos son los de siempre y el rango no depende
de la semilla de la escena (T3.1, ADR 0100). Los valores sorteados viajan en memoria en
`lugar["_supuestos_impacto"]`, que no es del contrato y nunca se guarda.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from croquis_solver import dmath
from croquis_solver.stratified import Draws, LatinHypercube

JsonObj = dict[str, Any]

# (nominal, mínimo, máximo)
RESTITUTION = (0.1, 0.0, 0.3)
IMPULSE_RATIO = (0.4, 0.29, 0.49)
POST_IMPACT_DRAG = (0.35, 0.3, 0.5)

RESTITUTION_SOURCE = (
    "Brach, Brach y Pongetti 2014 (SAE 2014-01-0469): 0 a 0.3 en 40 pruebas contra barrera, "
    "0 a 0.2 en 9 entre vehículos"
)
IMPULSE_RATIO_SOURCE = (
    "supuesto declarado: razón crítica de 0.40 a 0.51 en pruebas oblicuas (SAE 2021-01-0896) por "
    "72 % a 96 % de la crítica en choques que deslizan (SAE 2014-01-0469)"
)
POST_IMPACT_DRAG_SOURCE = "Fricke 2010: de 0.3 a 0.5 de la fricción llanta–pavimento"

IMPACT_SAMPLED = "_supuestos_impacto"
"""Llave en memoria de `lugar` con los tres valores sorteados; no es del contrato."""

IMPACT_DESIGN_SEED = 20_261_115
"""Semilla del diseño del hipercubo de los tres supuestos: fija, no la de la escena."""

IMPACT_NOTE = "supuesto con rango de la literatura; hipercubo aparte de diseño fijo"


@dataclass(frozen=True)
class ImpactAssumptions:
    """Los tres supuestos con los que se integra un impacto y lo que sigue."""

    restitution: float = RESTITUTION[0]
    impulse_ratio: float = IMPULSE_RATIO[0]
    drag_fraction: float = POST_IMPACT_DRAG[0]


def impact_assumptions(lugar: JsonObj) -> ImpactAssumptions:
    """Los supuestos de esta reconstrucción: los sorteados si los hay; si no, los nominales."""
    sampled: JsonObj = lugar.get(IMPACT_SAMPLED) or {}
    return ImpactAssumptions(
        float(sampled.get("restitucion", RESTITUTION[0])),
        float(sampled.get("razon_impulso", IMPULSE_RATIO[0])),
        float(sampled.get("arrastre", POST_IMPACT_DRAG[0])),
    )


def impact_sampler(samples: int) -> LatinHypercube | None:
    """El hipercubo aparte de los tres supuestos (3 dimensiones); None sin muestras."""
    if samples <= 0:
        return None
    return LatinHypercube(samples, 3, dmath.Random(IMPACT_DESIGN_SEED))


def sample_impact_assumptions(spec: JsonObj, draws: Draws) -> None:
    """Sortea los tres en su rango y los adjunta a `lugar` de `spec` (en sitio)."""
    restitucion = draws.uniform(RESTITUTION[1], RESTITUTION[2])
    razon = draws.uniform(IMPULSE_RATIO[1], IMPULSE_RATIO[2])
    arrastre = draws.uniform(POST_IMPACT_DRAG[1], POST_IMPACT_DRAG[2])
    spec["lugar"][IMPACT_SAMPLED] = {
        "restitucion": restitucion,
        "razon_impulso": razon,
        "arrastre": arrastre,
    }


__all__ = [
    "IMPACT_NOTE",
    "IMPACT_SAMPLED",
    "IMPULSE_RATIO",
    "IMPULSE_RATIO_SOURCE",
    "POST_IMPACT_DRAG",
    "POST_IMPACT_DRAG_SOURCE",
    "RESTITUTION",
    "RESTITUTION_SOURCE",
    "ImpactAssumptions",
    "impact_assumptions",
    "impact_sampler",
    "sample_impact_assumptions",
]
