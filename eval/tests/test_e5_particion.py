"""Partición congelada de E5 (ADR 0032): no se toca después de congelarla."""

from __future__ import annotations

import json
from collections import defaultdict

import pytest

from croquis_eval import e5_particion as part
from croquis_eval.e5_casos import Caso, nhtsa_cases


def test_frozen_file_matches_its_sha256() -> None:
    assert part.file_sha256() == part.FROZEN_SHA256


def test_current_data_reproduce_the_frozen_partition() -> None:
    # Si los datos o las reglas de los casos cambian, el test de E5 ya no sería el congelado.
    assert part.check()


def test_build_refuses_to_overwrite_the_frozen_partition() -> None:
    with pytest.raises(RuntimeError, match="congelada"):
        part.build()


def test_a_vehicle_never_falls_on_both_sides() -> None:
    sides: dict[str, set[bool]] = defaultdict(set)
    for c in nhtsa_cases():
        sides[c.vehiculo].add(part.is_test(c))
    assert all(len(s) == 1 for s in sides.values())


def _caso(fuente: str, vehiculo: str = "", anio: int | None = None) -> Caso:
    return Caso(
        fuente=fuente, id=f"{fuente}:{vehiculo}:{anio}", tipo="frontal", lado="F",
        clase="sedan_mediano", masa_kg=1500, largo_m=None, ancho_m=None,
        perfil_m=(0.1, 0.1, 0.1, 0.1, 0.1, 0.1), ancho_dano_m=1.5, centro_dano_m=0.0,
        velocidad_kmh=None, dv_kmh=None, anio=anio, detalle="", vehiculo=vehiculo,
    )  # fmt: skip


def test_rules_are_deterministic_and_close_to_the_target_fraction() -> None:
    cases = [_caso("nhtsa", f"MARCA|MODELO {i}|2010") for i in range(4000)]
    a = part.partition(cases)
    b = part.partition(list(reversed(cases)))
    assert a == b
    share = len(a["test"]) / len(cases)
    assert 0.37 < share < 0.43  # 0.4 ± 3 desviaciones estándar binomiales
    assert part.partition(cases, seed=1)["test"] != a["test"]
    assert part.is_test(_caso("ciss", anio=2022))
    assert not part.is_test(_caso("ciss", anio=2021))


def test_partition_file_lists_only_known_cases() -> None:
    frozen = json.loads(part.PARTITION_PATH.read_text(encoding="utf-8"))
    assert frozen["semilla"] == part.SEED
    assert frozen["test"] == sorted(set(frozen["test"]))
