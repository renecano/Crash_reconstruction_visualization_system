# Bitácora del frente W · Web y física

Plan: `docs/cesvi/PLAN-CESVI.md` §3.4. Reglas: `CLAUDE.md`. ADR del bloque 0130–0169.

## Estado

- **Fase actual:** W1 (dictamen, O2). Es la primera y no depende de U0.
- **Siguiente paso:** W2.

## Lo que U deja dicho para W

Viene de U0 (ADR 0111). Vale cuando el PR de contrato 2.3.0 esté en `main`:

- **La evidencia del perito es `procedencia.fuente = "usuario"`,** no `"perito"`: el enum de la escena no tiene ese valor y `usuario` ya es lo que usa `DEL_PERITO`.
- **El solver no recibe la malla de relieve.** `lugar.terreno.relieve.malla_id` solo la cita, y la malla viaja en el paquete caso-3d. Para W5, decide cómo dársela al solver; si cambia el contrato, va en tu PR `contract:`.
- **Si agregas evidencia a la inversión (`paso:` en W3),** agrega también su etiqueta al `pattern` de `evidencia` en `resultado.schema.json`. Hay dos lugares.
- **`z`, `cabeceo` y `alabeo` del resultado van en radianes o metros,** y `cruce_tope` lleva su velocidad en `detalle.velocidad_cruce_kmh`. Están en el contrato: falta que el solver los produzca.
- **Si cambias el solver,** corre `pnpm --filter @croquis/scene-schema generate` para actualizar `fixtures/caso3d/`. `generate:check` no corre el solver en las 7 escenas de inversión y agentes.

## Necesito del otro frente

Nada por ahora.
