import json
from pathlib import Path

from croquis_eval.results import read_result, write_result


def test_write_result_agrega_procedencia(tmp_path: Path) -> None:
    p = write_result("e0_prueba", {"valor": 1.5}, seed=7, results_dir=tmp_path)
    assert p.name == "e0_prueba.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    assert doc["name"] == "e0_prueba"
    assert doc["seed"] == 7
    assert doc["valor"] == 1.5
    assert "generated_at" in doc
    assert read_result("e0_prueba", results_dir=tmp_path)["valor"] == 1.5
