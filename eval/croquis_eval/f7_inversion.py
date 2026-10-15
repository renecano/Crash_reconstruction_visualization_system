"""F7 en las escenas canónicas: qué fija la evidencia, qué banderas salen y cuánto tarda.

Por escena se corren Monte Carlo, la inversión y la consistencia del solver de referencia con la
semilla de la escena y se guardan los parámetros (identificables o no), las banderas y el tiempo de
cada paso en esta máquina. La comparación de identificabilidad repite la inversión de las escenas
contra objeto fijo sin la regla: todas las incógnitas libres en cada reestimación (ajuste completo),
para mostrar qué intervalo se reportaría sin ella.
"""

from __future__ import annotations

import os
import platform
import random
import time
from typing import Any

from croquis_eval.results import write_result
from croquis_scene_schema import list_fixtures, load_fixture
from croquis_solver.consistency import check_consistency
from croquis_solver.inversion import (
    distribution,
    evidence_from_spec,
    fit_evidence,
    invert,
    perturbed,
)
from croquis_solver.montecarlo import monte_carlo

JsonObj = dict[str, Any]
SAMPLES = 12  # reestimaciones de la inversión (igual que el resultado de las escenas)
NO_RULE_SCENES = ("poste", "objeto_fijo_arbol")


def scene(name: str) -> JsonObj:
    spec = load_fixture(name)
    seed = int(spec["meta"]["semilla"])
    t0 = time.perf_counter()
    monte_carlo(spec, seed=seed)
    t1 = time.perf_counter()
    inv = invert(spec, seed=seed, samples=SAMPLES)
    t2 = time.perf_counter()
    flags = check_consistency(spec, seed=seed, inversion=inv)
    t3 = time.perf_counter()
    t_mc, t_inv, t_cons = (round(b - a, 2) for a, b in ((t0, t1), (t1, t2), (t2, t3)))
    return {
        "escena": name,
        "semilla": seed,
        "segundos": {"monte_carlo": t_mc, "inversion": t_inv, "consistencia_sin_inversion": t_cons},
        "evidencia": inv.evidence,
        "parametros": [e.to_dict() for e in inv.estimates],
        "banderas": [f.to_dict() for f in flags],
    }


def without_identifiability(name: str) -> JsonObj:
    """Intervalo que saldría reestimando todo, aunque la evidencia no lo fije."""
    spec = load_fixture(name)
    seed = int(spec["meta"]["semilla"])
    ev = evidence_from_spec(spec, seed=seed)
    rng = random.Random(seed)
    values: dict[str, list[float]] = {}
    for _ in range(SAMPLES):
        pert = perturbed(spec, ev, rng)
        f = fit_evidence(pert.spec, pert.evidence, downed_mu=pert.downed_mu)
        for k, v in f.values.items():
            values.setdefault(k, []).append(v)
    return {
        "escena": name,
        "intervalos_sin_regla": {k: distribution(v).to_dict(1) for k, v in sorted(values.items())},
    }


def main() -> str:
    scenes = [scene(n) for n in list_fixtures()]
    payload = {
        "descripcion": "F7 en las 10 escenas canónicas: parámetros que fija la evidencia en la "
        "inversión, banderas de consistencia y tiempo de Monte Carlo, inversión y consistencia "
        "con el solver de referencia. Incluye el intervalo que daría la inversión sin la regla "
        "de identificabilidad en las escenas contra objeto fijo.",
        "maquina": {
            "sistema": platform.platform(),
            "procesador": platform.processor(),
            "nucleos_logicos": os.cpu_count(),
            "python": platform.python_version(),
        },
        "reestimaciones": SAMPLES,
        "escenas": scenes,
        "banderas_por_codigo": _count_flags(scenes),
        "segundos_max": {
            k: max(s["segundos"][k] for s in scenes)
            for k in ("monte_carlo", "inversion", "consistencia_sin_inversion")
        },
        "sin_regla_de_identificabilidad": [without_identifiability(n) for n in NO_RULE_SCENES],
    }
    return str(write_result("f7_inversion", payload))


def _count_flags(scenes: list[JsonObj]) -> dict[str, int]:
    out: dict[str, int] = {}
    for s in scenes:
        for f in s["banderas"]:
            out[f["codigo"]] = out.get(f["codigo"], 0) + 1
    return dict(sorted(out.items()))


__all__ = ["main", "scene", "without_identifiability"]
