"""E9: agregación de las sesiones de usabilidad (con sesiones sintéticas, solo para la prueba)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from croquis_eval import e9


def _session(pid: str, **kw: object) -> dict[str, object]:
    doc: dict[str, object] = {
        "version": 1,
        "participante": pid,
        "inicio": 1_000,
        "eventos": [
            {"tipo": "relato_enviado", "t": 31_000},
            {"tipo": "preguntas_respondidas", "t": 61_000},
            {"tipo": "correccion_croquis", "t": 80_000},
            {"tipo": "correccion_croquis", "t": 90_000},
            {"tipo": "reconstruccion_visible", "t": 123_400},
        ],
        "sus": [5, 1, 5, 1, 5, 1, 5, 1, 5, 1],
        "terminada": 300_000,
    }
    doc.update(kw)
    return doc


def _write(d: Path, doc: dict[str, object]) -> None:
    (d / f"e9-{doc['participante']}.json").write_text(json.dumps(doc), encoding="utf-8")


def test_sus_score_like_brooke() -> None:
    assert e9.sus_score([3] * 10) == 50
    assert e9.sus_score([5, 1] * 5) == 100
    assert e9.sus_score([1, 5] * 5) == 0
    with pytest.raises(e9.SessionError):
        e9.sus_score([6] * 10)


def test_session_summary_matches_the_web() -> None:
    # Mismo caso que apps/web/src/lib/e9.test.ts.
    assert e9.summarize_session(_session("P01")) == {
        "participante": "P01",
        "segundos_hasta_primera_reconstruccion": 122.4,
        "correcciones_croquis": 2,
        "rondas_de_preguntas": 1,
        "sus": 100,
    }


def test_build_aggregates_and_checks_the_minimum(tmp_path: Path) -> None:
    for i in range(1, 5):
        _write(tmp_path, _session(f"P0{i}"))
    _write(tmp_path, _session("P05", eventos=[], sus=[3] * 10))
    out = e9.build(tmp_path)
    assert out["personas"] == 5
    assert out["cumple_minimo"] is True
    assert out["llegaron_a_una_reconstruccion"] == 4
    assert out["segundos_hasta_primera_reconstruccion_mediana"] == 122.4
    assert out["sus_mediana"] == 100
    assert out["sus_media"] == 90.0


def test_no_sessions_means_pending(tmp_path: Path) -> None:
    with pytest.raises(e9.SessionError, match="pendiente"):
        e9.build(tmp_path)


@pytest.mark.parametrize(
    "bad",
    [
        {"texto": "iba por Tollocan"},  # nunca el relato
        {"eventos": [{"tipo": "otro", "t": 1}]},
        {"eventos": [{"tipo": "relato_enviado", "t": 1, "texto": "x"}]},
    ],
)
def test_rejects_sessions_with_text_or_unknown_events(
    tmp_path: Path, bad: dict[str, object]
) -> None:
    _write(tmp_path, _session("P01", **bad))
    with pytest.raises(e9.SessionError):
        e9.build(tmp_path)


def test_unfinished_session_is_rejected(tmp_path: Path) -> None:
    doc = _session("P01")
    del doc["terminada"]
    _write(tmp_path, doc)
    with pytest.raises(e9.SessionError):
        e9.build(tmp_path)
