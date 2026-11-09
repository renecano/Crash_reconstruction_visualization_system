# Bitácora del frente W · Web y física

Plan: `docs/cesvi/PLAN-CESVI.md` §3.4. Reglas: `CLAUDE.md`. ADR del bloque 0130–0169.

## Estado

- **Desde el 2026-11-09, el Claude Code de René lleva también este frente,** porque aquí no se había subido nada. Si eres el Claude Code del compañero: antes de empezar una fase, revisa la tabla de abajo y `git fetch`; si la fase ya está tomada, sigue con la siguiente y anótala aquí.
- **Fase actual:** W1 (dictamen, O2).
- **Siguiente paso:** W2.

## Fases tomadas

| Fase               | Quién               | Rama               | Estado                       |
| ------------------ | ------------------- | ------------------ | ---------------------------- |
| W1 · Dictamen (O2) | Claude Code de René | `feat/w1-dictamen` | En curso desde el 2026-11-09 |

## W1 · Dictamen (O2)

Rama `feat/w1-dictamen`.

- **La nota original** (`docs/cesvi/entrante/notas-sugerencias-croquis-cesvi.pdf`): citar duplica; «Descargar el PDF» y «Exportar» no hacen nada; Word y `.croquis` sí descargan.
- **Causa raíz de las citas:** `insertarCita` pegaba el texto en el cursor cada vez, sin revisar si ya estaba.
- **Causa raíz del PDF,** reproducida en producción el 2026-11-09 con Chromium, a 1366 × 768:
  - **Con el 3D abierto,** la primera descarga tardó 9.1 s: las fotos del 3D esperan a que el visor termine de compilar. La segunda tardó 1.3 s.
  - **El único aviso,** «Armando el PDF…», quedaba 72 px abajo del borde de la pantalla (a 840 px en una ventana de 768).
  - Por eso el primer botón que se pulsa, el del PDF, parecía no hacer nada, y Word, pulsado después, sí.
  - **Sin el 3D abierto,** el PDF y el Word bajaron en menos de 1.5 s en Chromium, Firefox y WebKit: el archivo siempre fue válido.
- **Causa raíz de «Exportar»:** el botón de la barra solo lleva al acto del dictamen. Estando ya ahí, no hacía nada.
- **Qué cambió:**
  - **Citas:** `citarUnaVez` no duplica. Si la cita ya está, la resalta; si hay una anterior del mismo tipo, la reemplaza; y lo dice en un aviso.
  - **Fotos:** se toman al abrir el dictamen, no al pedir el archivo.
  - **Avisos:** el botón dice «Armando el PDF…» mientras trabaja, el estado va arriba de los botones y al terminar dice qué archivo se descargó.
  - **Descarga:** el enlace va dentro del documento y su dirección se libera al minuto, no al segundo.
  - **«Exportar»:** lleva a las descargas, deja el foco en el PDF y dice qué elegir. Sin reconstrucción, explica por qué no se puede.
- **Pruebas:** 4 unitarias de `citarUnaVez` y, en la e2e de AXA (`@flujo`): citar dos veces deja un bloque, «Exportar» responde, el PDF tiene al menos una página, el Word es un zip con `word/document.xml` y el aviso final queda a la vista.
- **Sin medir:** cuánto tarda ahora la primera descarga con el 3D abierto en producción. Se mide al desplegar.

## Lo que U deja dicho para W

Viene de U0 (ADR 0111). Vale cuando el PR de contrato 2.3.0 esté en `main`:

- **La evidencia del perito es `procedencia.fuente = "usuario"`,** no `"perito"`: el enum de la escena no tiene ese valor y `usuario` ya es lo que usa `DEL_PERITO`.
- **El solver no recibe la malla de relieve.** `lugar.terreno.relieve.malla_id` solo la cita, y la malla viaja en el paquete caso-3d. Para W5, decide cómo dársela al solver; si cambia el contrato, va en tu PR `contract:`.
- **Si agregas evidencia a la inversión (`paso:` en W3),** agrega también su etiqueta al `pattern` de `evidencia` en `resultado.schema.json`. Hay dos lugares.
- **`z`, `cabeceo` y `alabeo` del resultado van en radianes o metros,** y `cruce_tope` lleva su velocidad en `detalle.velocidad_cruce_kmh`. Están en el contrato: falta que el solver los produzca.
- **Si cambias el solver,** corre `pnpm --filter @croquis/scene-schema generate` para actualizar `fixtures/caso3d/`. `generate:check` no corre el solver en las 7 escenas de inversión y agentes.

- **`eval/unity_build.mjs` y `eval/results/unity_build.*` son del frente U** (pedido de René, 2026-11-07): W no los toca.

## Necesito del otro frente

Nada por ahora.
