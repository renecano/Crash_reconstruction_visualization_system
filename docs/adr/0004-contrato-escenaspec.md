# ADR 0004 — Diseño del contrato EscenaSpec v1 y su generación

- **Estado:** aceptado (2026-10-10, F1)
- **Contexto:** PLAN §4 define `EscenaSpec` como el único contrato entre extracción, croquis, solver y visor, con procedencia por campo. CLAUDE.md exige que `escena.schema.json` sea la fuente única y que Zod y Pydantic se generen.

## Decisiones

1. **JSON Schema draft 2020-12 sin `allOf`, `if/then` ni `unevaluatedProperties`.** Cada tipo de campo (`CampoVelocidad`, `CampoLongitud`, `CampoClaseVehiculo`, …) se escribe completo y cerrado (`additionalProperties: false`). Es repetitivo, pero los dos generadores producen tipos planos y predecibles; las reglas que el esquema no expresa (evidencia obligatoria cuando `fuente = relato`, rangos por clase, superposición) viven en el **validador semántico** con paridad TS ↔ Python.
2. **Campos escalares envueltos** (`valor`, `unidad`, `rango`, `fuente`, `confianza`, `evidencia`, `nota`) tal como pide PLAN §4; los compuestos (`Pose2D`, objetos del entorno, daños, evidencias físicas) llevan una `procedencia` común para no multiplicar la anidación.
3. **Unidades de entrada flexibles, conversión en código.** El esquema admite `km/h`/`m/s`, `m`/`cm`/`mm`/`km`, `kg`/`t`/`lb`, `deg`/`rad`; `check.ts`/`check.py` convierten para comparar. La normalización completa a SI es parte del solver (F2).
4. **Zod se genera con un generador propio** (`scripts/generate.ts`, ~200 líneas) porque `json-schema-to-zod` 2.8.1 no resuelve `$ref` y devuelve `z.any()` para cada definición. El generador soporta exactamente el subconjunto del contrato y falla ante cualquier construcción nueva. Una prueba con fast-check (300 documentos mutados) exige que Ajv (referencia) y Zod coincidan en validez.
5. **Pydantic se genera con datamodel-code-generator 0.83** (`croquis_scene_schema_codegen`), Pydantic v2, `extra="forbid"`, literales para los enums, `AwareDatetime` para `creado`. El código generado se formatea con la configuración de ruff del repo y se verifica en CI (`--check`).
6. **Fixtures canónicas con relato.** Las 10 escenas traen `meta.relato` sintético y cada `evidencia` cita offsets reales; una herramienta (`scripts/fix_offsets.py`) los rellena y las pruebas los verifican. Lo que no tiene fragmento literal se marca `supuesto`, nunca `relato`.
7. **Ediciones del croquis marcan `fuente: usuario`, `confianza: 1`** y conservan la nota; la prueba de propiedad garantiza que solo cambian las rutas editadas y la escena sigue válida.
8. **Tabla de clases generada, no escrita.** `vehicle_classes.json` se construye desde `data/vehicles/models_raw.json` con reglas explícitas (márgenes, PBV como tope, respaldos marcados `supuesto`) y CI verifica que esté al día. El validador la usa por defecto; `{}` la desactiva.
9. **Versionado.** `meta.version_esquema` es `const` en el esquema; cambiar el contrato implica nueva versión, migración y fixtures regenerados.

## Consecuencias

- Añadir un campo = editar el JSON Schema, correr `pnpm --filter @croquis/scene-schema generate` y `uv run croquis-scene-schema-generate`, y actualizar fixtures/pruebas. CI falla si algo queda desincronizado.
- Las reglas semánticas tienen código estable (`E001`–`E015`, `W001`–`W003`) compartido entre lenguajes; añadir una regla exige añadir un caso en `fixtures/semantic/cases.json`.
