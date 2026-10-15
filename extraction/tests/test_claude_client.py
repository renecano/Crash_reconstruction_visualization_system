"""Cliente de Claude sin red: un doble del SDK con la misma forma (CI nunca llama a la API)."""

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from croquis_extraction import claude_client as cc
from croquis_extraction.spec_builder import build_spec
from croquis_scene_schema import schema_errors

TEXT = "Iba en mi Aveo como a 50 y una camioneta se me cerró; le pegué por detrás. Llovía."


def _h(campo: str, valor: str, cita: str, vehiculo: int = -1, persona: int = -1) -> dict[str, Any]:
    return {"campo": campo, "vehiculo": vehiculo, "persona": persona, "valor": valor, "cita": cita}


OUTPUT: dict[str, Any] = {
    "vehiculos": [{"narrador": True}, {"narrador": False}],
    "personas": [{"rol": "conductor", "cita": "Iba en mi Aveo", "vehiculo": 0}],
    "hechos": [
        _h("vehiculo.clase", "sedan_compacto", "Aveo", vehiculo=0),
        _h("vehiculo.velocidad_kmh", "50", "como a 50", vehiculo=0),
        _h("vehiculo.clase", "suv_o_pickup", "camioneta", vehiculo=1),
        _h("vehiculo.maniobra", "cambio_carril", "se me cerró", vehiculo=1),
        _h("vehiculo.zona_impacto", "F", "le pegué por detrás", vehiculo=0),
        _h("vehiculo.zona_impacto", "B", "le pegué por detrás", vehiculo=1),
        _h("evento.tipo", "impacto_vehiculo_vehiculo", "le pegué"),
        _h("entorno.clima", "lluvia", "Llovía"),
        # Cita inventada: baja a supuesto.
        _h("lugar.estado_superficie", "mojado", "el piso mojado"),
        # Valor fuera del contrato y vehículo inexistente: se descartan.
        _h("lugar.tipo_via", "calle", "Iba"),
        _h("vehiculo.color", "rojo", "Iba", vehiculo=5),
    ],
    "dispositivos": [],
    "preguntas": ["¿La camioneta venía en tu mismo sentido?"],
}


class FakeMessages:
    def __init__(self, response: Any) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return self.response


def fake_client(stop_reason: str = "end_turn", model: str = "claude-haiku-5-5") -> Any:
    resp = SimpleNamespace(
        content=[SimpleNamespace(type="text", text=json.dumps(OUTPUT, ensure_ascii=False))],
        stop_reason=stop_reason,
        stop_details=None,
        model=model,
        usage=SimpleNamespace(
            input_tokens=300,
            output_tokens=500,
            cache_creation_input_tokens=2500,
            cache_read_input_tokens=0,
        ),
        _request_id="req_prueba",
    )
    messages = FakeMessages(resp)
    beta_messages = FakeMessages(resp)
    return SimpleNamespace(messages=messages, beta=SimpleNamespace(messages=beta_messages))


def test_costo_con_la_tabla_de_precios() -> None:
    usage = {
        "input_tokens": 1_000_000,
        "output_tokens": 1_000_000,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
    }
    assert cc.cost_usd("claude-sonnet-5-5", usage) == pytest.approx(12.0)
    assert cc.cost_usd("claude-haiku-5-5", {"input_tokens": 1000, "output_tokens": 1000}) == (
        pytest.approx(0.0006)
    )
    with pytest.raises(cc.LLMError):
        cc.cost_usd("modelo-inexistente", usage)


def test_esquema_de_salida_sin_uniones_y_cerrado() -> None:
    schema = cc.output_schema()
    text = json.dumps(schema)
    assert "anyOf" not in text
    assert "oneOf" not in text

    def closed(o: Any) -> None:
        if isinstance(o, dict):
            d: dict[str, Any] = o  # pyright: ignore[reportUnknownVariableType]
            if d.get("type") == "object":
                assert d["additionalProperties"] is False
                assert set(d["required"]) == set(d["properties"])
            for v in d.values():
                closed(v)

    closed(schema)


def test_prompt_estable_incluye_glosario_y_valores() -> None:
    s = cc.system_prompt()
    assert "{GLOSARIO}" not in s
    assert "camion_o_autobus" in s
    assert cc.prompt_fingerprint() == cc.prompt_fingerprint()


def test_prompt_v2_agrega_la_tabla_de_modelos_y_graba_aparte(tmp_path: Path) -> None:
    v1, v2 = cc.system_prompt("extraccion_v1"), cc.system_prompt("extraccion_v2")
    assert "{MODELOS}" not in v2
    assert "- aveo → sedan_compacto" in v2
    assert "- aveo → sedan_compacto" not in v1
    assert cc.prompt_fingerprint("extraccion_v1") != cc.prompt_fingerprint("extraccion_v2")
    # v2 es el de producción (ADR 0012).
    assert cc.PROMPT_VERSION == "extraccion_v2"
    assert cc.system_prompt() == v2
    # Las grabaciones de v1 se quedan donde estaban; las de v2 van en su carpeta.
    assert cc.recording_path("claude-haiku-5-5", "k", tmp_path, "extraccion_v1") == (
        tmp_path / "claude-haiku-5-5" / "k.json"
    )
    assert (
        cc.recording_path("claude-haiku-5-5", "k", tmp_path)
        == cc.recording_path("claude-haiku-5-5", "k", tmp_path, "extraccion_v2")
        == tmp_path / "extraccion_v2" / "claude-haiku-5-5" / "k.json"
    )
    with pytest.raises(cc.LLMError, match="desconocida"):
        cc.system_prompt("extraccion_v9")


def test_conversion_a_hechos_degrada_y_descarta() -> None:
    facts, conv = cc.facts_from_output(OUTPUT, TEXT)
    assert facts.narrador_vehiculo == 0
    assert facts.vehiculos[0]["velocidad_kmh"].valor == 50.0
    assert facts.vehiculos[1]["maniobra"].valor == "cambio_carril"
    assert {k: z.valor for k, z in facts.zonas.items()} == {0: "F", 1: "B"}
    assert facts.escalares["lugar.estado_superficie"].fuente == "supuesto"
    assert "lugar.tipo_via" not in facts.escalares
    assert conv.sin_cita_literal == 1
    assert conv.valores_invalidos == 2
    assert conv.preguntas == ["¿La camioneta venía en tu mismo sentido?"]
    spec = build_spec(facts, TEXT, spec_id="claude-prueba")
    assert schema_errors(spec) == []


def test_grabar_y_reproducir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CROQUIS_LLM_DAILY_BUDGET_USD", "1")
    client = fake_client()
    rec = cc.extract(
        TEXT, "rmx-x001", "claude-haiku-5-5", mode="record", client=client, root=tmp_path
    )
    call = client.messages.calls[0]
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert rec["salida"] == OUTPUT
    assert rec["costo_usd"] == pytest.approx((300 * 0.1 + 500 * 0.5 + 2500 * 0.125) / 1e6)
    again = cc.extract(TEXT, "rmx-x001", "claude-haiku-5-5", mode="replay", root=tmp_path)
    assert again == rec
    with pytest.raises(cc.LLMError, match="otro texto"):
        cc.extract(TEXT + " Más.", "rmx-x001", "claude-haiku-5-5", mode="replay", root=tmp_path)
    with pytest.raises(cc.LLMError, match="Sin respuesta grabada"):
        cc.extract(TEXT, "rmx-x002", "claude-haiku-5-5", mode="replay", root=tmp_path)
    ledger = json.loads((tmp_path / "gasto.json").read_text(encoding="utf-8"))
    assert sum(ledger.values()) == pytest.approx(rec["costo_usd"])


def test_sonnet_usa_respaldo_del_servidor(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CROQUIS_LLM_DAILY_BUDGET_USD", "1")
    client = fake_client(model="claude-sonnet-5-5")
    cc.extract(TEXT, "rmx-x003", "claude-sonnet-5-5", mode="live", client=client, root=tmp_path)
    call = client.beta.messages.calls[0]
    assert call["fallbacks"] == "default"
    assert call["betas"] == ["server-side-fallback-2026-07-01"]
    assert not (tmp_path / "claude-sonnet-5-5").exists()  # live no graba


def test_tope_de_gasto(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CROQUIS_LLM_DAILY_BUDGET_USD", "0")
    with pytest.raises(cc.BudgetExceededError):
        cc.extract(TEXT, "rmx-x004", mode="live", client=fake_client(), root=tmp_path)
    monkeypatch.setenv("CROQUIS_LLM_DAILY_BUDGET_USD", "0.000001")
    cc.extract(
        TEXT, "rmx-x004", "claude-haiku-5-5", mode="live", client=fake_client(), root=tmp_path
    )
    with pytest.raises(cc.BudgetExceededError):
        cc.extract(
            TEXT, "rmx-x004", "claude-haiku-5-5", mode="live", client=fake_client(), root=tmp_path
        )


def test_rechazo_y_truncado_son_errores(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CROQUIS_LLM_DAILY_BUDGET_USD", "1")
    for reason in ("refusal", "max_tokens"):
        with pytest.raises(cc.LLMError):
            cc.extract(
                TEXT,
                "rmx-x005",
                "claude-haiku-5-5",
                mode="live",
                client=fake_client(reason),
                root=tmp_path,
            )


def test_clave_invalida() -> None:
    with pytest.raises(cc.LLMError):
        cc.recording_path("claude-haiku-5-5", "../fuera")


def test_libro_de_gasto_no_pierde_cargos_con_grabadores_en_paralelo(tmp_path: Path) -> None:
    """Varios hilos cobrando a la vez: el total es exacto y no queda candado ni temporal."""
    import threading

    ledger = tmp_path / "gasto.json"
    charges = [0.001 * (i % 7 + 1) for i in range(200)]

    def work(part: list[float]) -> None:
        for usd in part:
            cc._charge(ledger, usd)  # pyright: ignore[reportPrivateUsage]

    threads = [threading.Thread(target=work, args=(charges[i::4],)) for i in range(4)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert cc._spent_today(ledger) == pytest.approx(sum(charges), abs=1e-6)  # pyright: ignore[reportPrivateUsage]
    assert sorted(x.name for x in tmp_path.iterdir()) == ["gasto.json"]


def test_candado_abandonado_se_recupera(tmp_path: Path) -> None:
    import os

    ledger = tmp_path / "gasto.json"
    lock = tmp_path / "gasto.json.lock"
    lock.write_text("", encoding="utf-8")
    old = lock.stat().st_mtime - cc.LOCK_STALE_S - 1
    os.utime(lock, (old, old))
    cc._charge(ledger, 0.5)  # pyright: ignore[reportPrivateUsage]
    assert cc._spent_today(ledger) == 0.5  # pyright: ignore[reportPrivateUsage]
    assert not lock.exists()


def test_candado_ocupado_en_windows_se_reintenta(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Abrir un candado que otro proceso está borrando da PermissionError en Windows: se espera
    y se reintenta en vez de perder el cargo."""
    import os

    real_open = os.open
    fails = iter([True, True])

    def flaky_open(path: str, flags: int, *args: int) -> int:
        if str(path).endswith(".lock") and next(fails, False):
            raise PermissionError(13, "Permission denied", str(path))
        return real_open(path, flags, *args)

    monkeypatch.setattr(os, "open", flaky_open)
    ledger = tmp_path / "gasto.json"
    cc._charge(ledger, 0.25)  # pyright: ignore[reportPrivateUsage]
    assert cc._spent_today(ledger) == 0.25  # pyright: ignore[reportPrivateUsage]
