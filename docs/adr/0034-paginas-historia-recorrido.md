# ADR 0034 — Páginas de historia y recorrido técnico: datos generados desde `eval/results/` (F11)

- **Estado:** aceptado (2026-10-18).
- **Contexto:** PLAN §11 pide una página de historia, con datos de ATUS «en el momento justo», y un recorrido técnico con las evaluaciones E1–E9 «con gráficas generadas desde `eval/results/`». La regla 3 de CLAUDE.md prohíbe escribir números que no salgan de un script de evaluación.

## Decisión

- **Generador:**
  - `apps/web/scripts/build-paginas.mjs` lee `eval/results/` y escribe `apps/web/src/data/historia.json` y `recorrido.json`.
  - Las páginas importan esos JSON. No llevan ningún número escrito a mano; las cifras de ATUS salen de `atus_summary.json`.
  - `pnpm --filter @croquis/web generate:check` corre en CI y falla si los datos no están al día con los resultados.
- **Gráficas:**
  - son barras horizontales en HTML y no SVG, para que se lean en el teléfono y con lector de pantalla;
  - la mejor barra se marca aunque no sea Croquis (E3: WinSMASH; E5: el perfil triangular en profundidad máxima);
  - cada evaluación enlaza su archivo de resultados.
- **Historia:**
  - **Personaje:** una persona ficticia vive la escena canónica de Toluca, con la vía de OpenStreetMap.
  - **Imágenes:** son capturas del visor en calidad alta con la GPU real (`scripts/capturas-historia.mjs`), con la leyenda y la atribución de OSM dentro del cuadro.
  - **Promesas:** el texto no promete más de lo medido. El redactor «intenta» tachar los datos personales y remite a E1, donde se mide cuánto se escapa.
- **Sin red:** las dos páginas y sus imágenes entran a la precarga del service worker (ADR 0030). Las imágenes se sirven sin el optimizador de Next para que el caché las tenga tal cual.

## Consecuencias

- **Si cambia una evaluación,** se corre `pnpm --filter @croquis/web paginas`; si no se corre, CI lo detecta.
- **La precarga pasa de 67 entradas a 80** (`eval/results/f9_precarga.json`). El desglose por biblioteca (`mib_por_modulo`) muestra que el crecimiento viene sobre todo de las exportaciones de F9 (pdfmake y Mediabunny), que llegaron después de la medición anterior. Las imágenes de la historia pesan poco.
