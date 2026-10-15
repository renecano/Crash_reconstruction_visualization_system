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
    for split in relatos_mx.LOCKS:
        frozen = relatos_mx.frozen_hash(split)
        if frozen is not None:
            assert frozen == relatos_mx.split_hash(items, split)


def test_congelar_es_de_una_sola_vez(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    items = [_item(id="rmx-t001", split="test"), _item(id="rmx-d001", split="dev")]
    monkeypatch.setattr(relatos_mx, "load_all", lambda: items)
    monkeypatch.setattr(
        relatos_mx, "LOCKS", {"test": tmp_path / "test.lock", "ciss": tmp_path / "ciss.lock"}
    )
    assert relatos_mx.frozen_hash() is None
    h = relatos_mx.freeze()
    assert relatos_mx.frozen_hash() == h == relatos_mx.split_hash()
    lock = json.loads((tmp_path / "test.lock").read_text(encoding="utf-8"))
    assert lock["sha256"] == h
    assert lock["relatos"] == 1
    with pytest.raises(RuntimeError, match="ya está congelado"):
        relatos_mx.freeze()
    # Cada test tiene su candado: el de CISS no existe y una partición vacía no se congela.
    assert relatos_mx.frozen_hash("ciss") is None
    with pytest.raises(RuntimeError, match="vacía"):
        relatos_mx.freeze("ciss")


def _ficha(**hechos: object) -> dict[str, object]:
    return {
        "id": "rmx-c001",
        "tipo": "vv",
        "registro": "breve",
        "ciss": {"anio": 2024, "caseid": "2400001", "caso": "1-1-2024-001-01"},
        "hechos": {
            "evento.tipo": "impacto_vehiculo_vehiculo",
            "vehiculos": [{"narrador": True, "velocidad_kmh": 40}, {"clase": "motocicleta"}],
            **hechos,
        },
    }


def test_relato_ciss_debe_decir_los_hechos_de_su_ficha() -> None:
    it = _item(id="rmx-c001", split="ciss")
    ficha = _ficha()
    assert relatos_mx.ficha_problems(it, ficha) == []
    # Un valor distinto del de NHTSA: se rechaza y se dice dónde.
    otro = _ficha()
    otro["hechos"]["vehiculos"][0]["velocidad_kmh"] = 50  # type: ignore[index]
    probs = relatos_mx.ficha_problems(it, otro)
    assert any("vehiculos[0].velocidad_kmh: ficha 50, relato 40" in p for p in probs)
    # Un hecho de más o de menos tampoco pasa.
    extra = _ficha(**{"entorno.clima": "lluvia"})
    assert any("entorno.clima" in p for p in relatos_mx.ficha_problems(it, extra))
    # Sin ficha, con otro tipo o registro: problema.
    assert relatos_mx.ficha_problems(it, None) == ["rmx-c001: no hay ficha CISS con ese id"]
    assert relatos_mx.ficha_problems(it, {**ficha, "registro": "formal"})


def test_en_el_test_ciss_todo_hecho_lleva_cita() -> None:
    sin_cita = _item(
        id="rmx-c001",
        split="ciss",
        hechos={
            "evento.tipo": ["impacto_vehiculo_vehiculo"],
            "vehiculos": [
                {"narrador": True, "velocidad_kmh": [40, "iba a 40"]},
                {"clase": ["motocicleta", "moto"]},
            ],
        },
    )
    probs = relatos_mx.ficha_problems(sin_cita, _ficha())
    assert probs == ["rmx-c001: evento.tipo sin cita (en el test CISS todo hecho se cita)"]


def test_quitar_citas_da_la_forma_de_la_ficha() -> None:
    plain, uncited = relatos_mx.strip_citations(
        {
            "dispositivos": [["semaforo", "el semáforo"]],
            "zonas": {"0": ["F", "de frente"]},
            "lugar.tipo_via": ["recta", "en la recta"],
            "personas": [{"rol": ["conductor", "manejaba"], "vehiculo": 0}],
            "vehiculos": [{"narrador": True, "clase": ["pickup", "mi Hilux"]}],
        }
    )
    assert plain == {
        "dispositivos": ["semaforo"],
        "zonas": {"0": "F"},
        "lugar.tipo_via": "recta",
        "personas": [{"rol": "conductor", "vehiculo": 0}],
        "vehiculos": [{"narrador": True, "clase": "pickup"}],
    }
    assert uncited == []
    with pytest.raises(ValueError, match="se esperaba"):
        relatos_mx.strip_citations({"lugar.tipo_via": "recta"})


def test_el_hash_solo_depende_del_contenido_fuente_del_test() -> None:
    a = [_item(id="rmx-t001", split="test"), _item(id="rmx-t002", split="test")]
    b = [*reversed(a), _item(id="rmx-d009", split="dev")]
    assert relatos_mx.split_hash(a) == relatos_mx.split_hash(b)
    changed = [_item(id="rmx-t001", split="test", texto="Choqué."), a[1]]
    assert relatos_mx.split_hash(changed) != relatos_mx.split_hash(a)


def test_salidas_doradas_del_port_ts_al_dia() -> None:
    from croquis_extraction import golden

    assert golden.write(check=True), "corre `uv run croquis-extraction golden build`"
