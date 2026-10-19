# ADR 0035 — Demo «Tú eres…»: relatos de ejemplo con la respuesta grabada de Claude, sin servidor (F11)

- **Estado:** aceptado (2026-10-18).
- **Contexto:** PLAN §11 pide una demo en la que el visitante:
  - escribe o elige un relato;
  - ve en vivo qué entendió la IA, campo por campo;
  - corrige el croquis, ve la reconstrucción y compara hipótesis.

  Los casos precargados deben correr sin servidor y con semilla.

## Decisión

- **Casos:** seis relatos del **dev** de Relatos-MX, uno por tipo: alcance, moto, objeto fijo, peatón, volcadura y ciclista.
  - **Nunca del test,** que sigue intacto.
  - **Contenido:** se eligieron sin contenido gráfico (PLAN §10).
  - **Etiqueta:** se presentan como relatos sintéticos escritos por agentes de IA.
- **Lo que entendió la IA:**
  - **De dónde sale:** de la respuesta **grabada** de Claude Sonnet con el prompt vigente. No se llama a la API.
  - **Por dónde pasa:** por el mismo pipeline TS de producción: redacción, constructor, verificador y primera ronda de preguntas.
  - **Script:** `pnpm --filter @croquis/extraction demo` lo hace y escribe `apps/web/src/data/demo.json`. CI corre `demo:check` para que no se desfase del pipeline ni de las grabaciones.
- **Rondas siguientes en el navegador:** aplicar respuestas y proponer preguntas es lógica pura y corre en el hilo principal sin servidor. Se movió a `src/lib/responder.ts`, que comparten la ruta del servidor y la demo, sin duplicar código.
- **Croquis, 3D e hipótesis:** se reutilizan el editor (`/croquis?fuente=relato`), la escena propia con el solver en el Web Worker (ADR 0028) y el panel de hipótesis del visor.
- **Sin red:** `/demo` entra a la precarga (ADR 0030) y la prueba `sin-red` la recorre.

## Consecuencias

- **Si cambian el pipeline, el prompt o las grabaciones,** `demo:check` falla en CI hasta que se regeneren los casos.
- **Escribir un relato propio** sigue en `/relato`, que necesita el servidor, porque Claude corre allí con la llave y el tope de gasto.
