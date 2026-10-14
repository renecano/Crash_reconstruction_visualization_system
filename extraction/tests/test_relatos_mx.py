import json
from pathlib import Path

import pytest

from croquis_extraction import relatos_mx


def test_render_quita_marcas_y_ubica_la_pii() -> None:
    r = relatos_mx.render(
        "Soy [[NOMBRE:Ana Pérez]], placas [[PLACA:ABC-123-D]]; {{sexo:una señora|un señor}} cruzaba"
    )
    assert r.text == "Soy Ana Pérez, placas ABC-123-D; una señora cruzaba"
    for p in r.pii:
        assert r.text[p["inicio"] : p["fin"]] == p["texto"]
    assert [p["tipo"] for p in r.pii] == ["NOMBRE", "PLACA"]


def test_variante_contrafactual_cambia_solo_su_grupo() -> None:
    markup = (
        "{{sexo:Ella|Él}} iba en {{vehiculo:su Aveo|su Jetta}} a 50; {{sexo:la señora|el señor}}"
    )
    assert relatos_mx.render(markup, "sexo").text == "Él iba en su Aveo a 50; el señor"
    assert relatos_mx.render(markup, "vehiculo").text == "Ella iba en su Jetta a 50; la señora"


def _item(**kw: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": "rmx-x001",
        "tipo": "vv",
        "registro": "breve",
        "split": "dev",
        "texto": "Choqué con {{edad:un joven|un abuelito}} en su moto, iba a 40.",
        "hechos": {
            "evento.tipo": ["impacto_vehiculo_vehiculo", "Choqué"],
            "vehiculos": [
                {"narrador": True, "velocidad_kmh": [40, "iba a 40"]},
                {"clase": ["motocicleta", "moto"]},
            ],
        },
    }
    base.update(kw)
    return base


def test_item_valido_no_tiene_problemas_y_genera_contrafactual() -> None:
    it = _item()
    assert relatos_mx.problems([it]) == []
    cfs = relatos_mx.counterfactuals(it)
    assert [c["id"] for c in cfs] == ["rmx-x001-cf-edad"]
    assert "abuelito" in cfs[0]["texto"]
    assert relatos_mx.build_item(it)["contrafactual"] == ["edad"]


def test_problemas_detecta_ids_repetidos_categorias_y_citas_falsas() -> None:
    bad_cita = _item(id="rmx-x002", hechos={"evento.tipo": ["impacto_vehiculo_vehiculo", "Volqué"]})
    probs = relatos_mx.problems(
        [
            _item(),
            _item(),
            _item(id="rmx-x003", tipo="otro"),
            _item(id="rmx-x004", registro="raro"),
            bad_cita,
        ]
    )
    joined = "\n".join(probs)
    assert "rmx-x001: id repetido" in joined
    assert "rmx-x003: tipo desconocido" in joined
    assert "rmx-x004: registro desconocido" in joined
    assert "rmx-x002:" in joined


def test_el_benchmark_del_repositorio_esta_completo_y_al_dia() -> None:
    items = relatos_mx.load_all()
    assert items
    assert relatos_mx.problems(items) == []
    assert relatos_mx.write(check=True) == []
    frozen = relatos_mx.frozen_hash()
    if frozen is not None:
        assert frozen == relatos_mx.split_hash()


def test_congelar_es_de_una_sola_vez(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    items = [_item(id="rmx-t001", split="test"), _item(id="rmx-d001", split="dev")]
    monkeypatch.setattr(relatos_mx, "load_all", lambda: items)
    monkeypatch.setattr(relatos_mx, "LOCK", tmp_path / "test.lock")
    assert relatos_mx.frozen_hash() is None
    h = relatos_mx.freeze()
    assert relatos_mx.frozen_hash() == h == relatos_mx.split_hash()
    lock = json.loads((tmp_path / "test.lock").read_text(encoding="utf-8"))
    assert lock["sha256"] == h
    assert lock["relatos"] == 1
    with pytest.raises(RuntimeError, match="ya está congelado"):
        relatos_mx.freeze()


def test_el_hash_solo_depende_del_contenido_fuente_del_test() -> None:
    a = [_item(id="rmx-t001", split="test"), _item(id="rmx-t002", split="test")]
    b = [*reversed(a), _item(id="rmx-d009", split="dev")]
    assert relatos_mx.split_hash(a) == relatos_mx.split_hash(b)
    changed = [_item(id="rmx-t001", split="test", texto="Choqué."), a[1]]
    assert relatos_mx.split_hash(changed) != relatos_mx.split_hash(a)


def test_salidas_doradas_del_port_ts_al_dia() -> None:
    from croquis_extraction import golden

    assert golden.write(check=True), "corre `uv run croquis-extraction golden build`"
