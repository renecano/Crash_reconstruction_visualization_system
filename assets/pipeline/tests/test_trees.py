"""Árboles impostores de Poly Haven (T1.3b, ADR 0099): especies, lock y archivos versionados."""

from __future__ import annotations

import json

from croquis_assets import trees


def test_especies_unicas_y_con_modelo() -> None:
    especies = [a.especie for a in trees.ARBOLES]
    assert len(set(especies)) == len(especies)
    assert {"jacaranda", "fresno", "pirul"} <= set(especies)
    assert len({a.polyhaven_id for a in trees.ARBOLES}) == len(especies)
    assert all(a.alto_m > 3 for a in trees.ARBOLES)


def test_el_lock_fija_blend_y_texturas_de_cada_especie() -> None:
    lock = json.loads(trees.LOCK.read_text(encoding="utf-8"))
    for a in trees.ARBOLES:
        e = lock[a.polyhaven_id]
        assert e["blend"]["url"].endswith("_1k.blend")
        assert len(e["blend"]["md5"]) == 32
        assert e["texturas"], a.polyhaven_id


def test_los_archivos_versionados_coinciden_con_el_manifiesto() -> None:
    assert trees.check() == []


def test_el_manifiesto_trae_licencia_medidas_y_tarjetas() -> None:
    m = json.loads(trees.MANIFIESTO.read_text(encoding="utf-8"))
    for especie, e in m["especies"].items():
        assert e["modelo"]["licencia"] == "CC0 1.0"
        assert e["modelo"]["url"].startswith("https://polyhaven.com/a/")
        assert set(e["archivos"]) == {"frente_diff", "frente_nor", "planta_diff", "planta_nor"}
        # Unos cientos de KB por especie (René, 2026-11-03), no megabytes.
        assert sum(a["bytes"] for a in e["archivos"].values()) < 1_500_000, especie
        md = e["medidas"]
        assert 0 < md["copa_desde_m"] < md["alto_m"]
        assert md["ancho_m"] > 1
        assert md["alto_m"] > 1
