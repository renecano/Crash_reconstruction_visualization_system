# Ronda 2: para Fable

René repartió la ronda 2 (2026-11-16, mensaje «E. Orden de trabajo»):

- **Opus** hizo A2, A3, A4, A5 y A7, la pasada B (solo correcciones) y la planeación de C.
- **A ti te toca** A1, A6, la dirección visual de «salir de la caja» en las pantallas que toques y leer, probar y pulir las cinco narraciones en producción.

Esta nota es para que arranques sin releer la conversación.

## Estado

| Bloque                                              | Qué                                                      | Dónde                                                                           |
| --------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A (A2, A3, A4, A5, A7)                              | Hecho y probado                                          | PR #248 (`feat/ronda2-a`); evidencia en `docs/cesvi/ronda-2/evidencia/a/`       |
| B (pasada)                                          | Correcciones hechas                                      | PR #249 (`feat/ronda2-b`); la lista completa, en `docs/cesvi/ronda-2/pasada.md` |
| C (narraciones)                                     | Solo planeación: tabla y borradores. **No se gastó API** | `docs/cesvi/ronda-2/narraciones.md`                                             |
| A1, A6, dirección visual, narraciones en producción | **Para ti, sin empezar**                                 | abajo                                                                           |

## Lo que pidió René y que sigue en pie

- **A1 y A6: primero tres propuestas.** Antes de construir, René quiere tres propuestas para cada pantalla, distintas entre sí de verdad (no variaciones de lo mismo). Cada una con una maqueta o captura, el concepto en dos líneas y qué la hace memorable. Él elige y luego se construye.
  - Nada genérico de IA: ni gradientes morados, ni tarjetas con sombra suave y emojis, ni «✨ IA», ni textos de marketing.
  - Dentro del sistema de diseño: color de señal #FF5B2E, la tipografía y el logo actuales.
  - René pidió cargar «la skill de diseño de frontend». En esta sesión no hay una con ese nombre: las que hay son `artifact-design` (para páginas de Artifact) y `motionsites-web-builder` (para portadas). Revisa cuáles tienes tú.
- **A1, «Caso nuevo» (la primera pantalla del hecho):** que en 5 segundos se entienda qué hace Croquis, qué va a pasar paso a paso y qué botón tocar primero.
  - Hoy es `PasoCaso` (`apps/web/src/components/cesvi/caso/pasos.tsx`), que arma `recorrido-caso.tsx` con `actual === 0`.
  - Hoy tiene a la derecha un mapa con «El lugar aún no está marcado · Lo marcas en el paso 3», que ocupa media pantalla y no sirve en ese momento.
  - El encabezado dice «Acto 1 de 5 · El hecho · 1 de 2: El caso».
- **A6, la pantalla antes de «Reconstruir»:** decide si se quita (y el flujo sigue natural) o se vuelve una de las mejores pantallas de la app.
  - Hoy es `recorrido-caso.tsx` con `actual === 3` y sin resultado: `PanelReconstruccion` en `reconstruccion.tsx` más el mapa.
  - Muestra los marcadores encimados, el panel casi vacío y el aviso «A y B quedaron encimados» (antes decía «V1 y V2»).
  - Capturas: `capturas/antes/claro/19-nuevo-paso4-antes-de-reconstruir.jpg` y `37-axa-paso4-antes-de-reconstruir.jpg`.
- **Ningún número cambia.** Si algo mueve una cifra, para y avísale a René.
- **Accesibilidad:** contraste AA, teclado y movimiento reducido.
- **Ramas y PR por bloque**, con capturas antes y después. Pruebas unitarias mientras trabajas. Las e2e y el ensayo completo de la demo en producción van al final, una vez.
- **Al terminar, René quiere:**
  - qué cambió en cada pantalla;
  - las cinco narraciones con lo que muestra cada una;
  - qué decidiste sobre la pantalla de Reconstruir y por qué.

## Lo que la pasada encontró y pide rediseño (no corrección)

1. **El paso 1 del caso** (A1, arriba).
2. **La pantalla antes de Reconstruir** (A6, arriba).
3. **Presentar con 3D:** el degradado de la izquierda tapa parte del 3D: la leyenda del visor y una esquina del minimapa.
   - Opus puso la leyenda completa en la capa de la página («Reconstrucción ilustrativa · entorno procedural: no es el lugar real · el dictamen es del perito»).
   - La composición (cuánto ocupa el texto y cuánto el 3D) pide diseño.
4. **«Lado a lado» en Contra CESVI:** los controles del croquis pequeño («Todo», «Impacto», «+») se montan sobre el dibujo. Ver `capturas/antes/claro/40-axa-paso7.jpg`.
5. **Las dos hipótesis:**
   - Las tarjetas son estrechas, en letra monoespaciada, y su último renglón se corta al pie del panel.
   - Opus cambió «Costo del ajuste» por «Desajuste con la evidencia» y «V2» por «B · Tacoma». El acomodo sigue apretado.
6. **La tarjeta de daños en un caso sin medidas:**
   - Muestra «Calculando la energía y el Δv…» sin progreso y deja mucho vacío.
   - Opus quitó la fila de ceros: ahora dice «menos de 0.5 cm en todo el ancho».
7. **El mapa de «La escena»:**
   - La etiqueta de un vehículo («Jetta») queda debajo del coche.
   - «Choque» y las etiquetas se pisan cuando los coches están juntos.
8. **«Medir una distancia»:** Opus la hizo evidente (banda, línea en vivo, extremos, Esc). Si la dirección visual nueva lo pide, se puede llevar más lejos.

## Pendientes que no son de diseño

- **Pasar de «Daños» a «Los números» congela la página más de 15 s.**
  - En el recorrido automático, el clic en «Continuar a los números» se ejecuta y la página deja de responder: ni siquiera se puede capturar. Pasa igual en producción (`capturas/antes/claro/pasada.json`, fallas «paso 6»).
  - Sospecha: `reconstruccionContraCesvi` corre el solver en el hilo principal (`packages/cesvi/src/contra-metodos.ts` importa `reconstruct`).
  - Para medirlo y moverlo a un worker no se cambia ninguna cifra. Anotado en `docs/PROGRESS.md`, «Endurecimiento pendiente».
- **La huella SHA-256 del dictamen firmado se quedó, y René tiene que decidir.** Pidió quitar los hashes, pero el sello «Validado con la huella SHA-256» está en su diseño del dictamen (`docs/cesvi/rediseno/laboratorio/prompt-laboratorio.md`). El CLAUDE.md pide preguntarle antes de quitar algo que está en `docs/cesvi`. Opus solo cambió las palabras a «huella digital (SHA-256)».

## C: las narraciones

- **La tabla y los borradores:** `docs/cesvi/ronda-2/narraciones.md`. Son 4 nuevas más la del Jetta y el Camaro; entre las cinco cubren todo lo que pidió René.
- **Cómo carga hoy la app el ejemplo:** `recorrido-caso.tsx` importa `data/cesvi/grabaciones/escenas/cesvi-e814f085db.json`. El JSON tiene `id`, `modalidad_c0`, `version_prompt`, `modelo`, `uso`, `costo_usd`, `narracion` y `salida`; el botón usa `ejemplo.narracion`.
- **Lo que falta construir:**
  - el selector (cinco opciones, una línea cada una);
  - la grabación de cada lectura nueva en el mismo formato, para que CI y la demo la usen desde la caché sin llamar a Claude.
- **Gasto:**
  - Va contra W9: 1.41 de 20 USD (`eval/results/w9_gasto.json`); cada lectura nueva se anota ahí.
  - Una lectura costó 0.0288 USD en la mediana y 0.0734 USD como máximo (las 10 grabadas).
  - Cuatro narraciones con hasta tres lecturas cada una: peor caso, unos 0.90 USD.
- **Prueba de punta a punta de cada una, en producción:** lectura, preguntas, mapa, reconstrucción, 3D y dictamen.
  - Si una deja ver un límite del solver, se cambia por otra que luzca.
  - El límite no se esconde: queda documentado.
- **Riesgo conocido:** que la 2 dé de verdad dos hipótesis.

## Cómo tomar las capturas de antes y después

El recorrido de la ronda 2 es `apps/web/e2e/pasada-ronda2.spec.ts`. Recorre el caso nuevo, la importación, AXA, Presentar, el caso guardado, la carambola y la reproducción. Usa las lecturas grabadas, así que no gasta API, y no corre en CI.

```
# Antes, contra producción:
cd apps/web
CROQUIS_PASADA=antes CROQUIS_VARIANTE=claro CROQUIS_URL=https://croquis-sage.vercel.app \
  PLAYWRIGHT_BROWSERS_PATH='D:\dev-cache\ms-playwright' \
  pnpm exec playwright test -c playwright.produccion.config.ts e2e/pasada-ronda2.spec.ts
# Después, contra un build local (pnpm --filter @croquis/web build; luego pnpm start en apps/web):
CROQUIS_PASADA=despues CROQUIS_VARIANTE=oscuro CROQUIS_URL=http://localhost:3000 ...
```

- **Variantes:** `claro` y `oscuro` a 1440×900, y `chica` a 900×620.
- **Salida:** `docs/cesvi/ronda-2/capturas/<antes|despues>/<variante>/`, con `pasada.json` (texto visible, jerga encontrada y fallas).
- **Qué va a git:** las capturas no se versionan enteras. Solo las parejas de evidencia, en `docs/cesvi/ronda-2/evidencia/`.
- **En la laptop de René (8 GB):** un proceso pesado a la vez. El build tarda unos 1.5 min; cada variante del recorrido, unos 6 min.
