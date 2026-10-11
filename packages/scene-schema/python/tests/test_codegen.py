from croquis_scene_schema_codegen import OUT_PATH, render


def test_modelos_pydantic_generados_estan_al_dia() -> None:
    assert OUT_PATH.exists()
    current = OUT_PATH.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert current == render(), "Corre `uv run croquis-scene-schema-generate`"
