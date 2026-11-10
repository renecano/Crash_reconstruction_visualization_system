# Bitácora del frente W · Web y física

Plan: `docs/cesvi/PLAN-CESVI.md` §3.4. Reglas: `CLAUDE.md`. ADR del bloque 0130–0169.

## Estado

- **Desde el 2026-11-09, el Claude Code de René lleva también este frente,** porque aquí no se había subido nada. Si eres el Claude Code del compañero: antes de empezar una fase, revisa la tabla de abajo y `git fetch`; si la fase ya está tomada, sigue con la siguiente y anótala aquí.
- **Hechas:** W1 (#187) y W2 (#188), las dos en `main`.
- **Siguiente:** W3. No está tomada: no hay rama `feat/w3-*` ni código. Abajo, en «W3 · Lo que hay antes de empezar», está el mapa de lo que toca.

## Fases tomadas

| Fase                    | Quién               | Rama               | Estado           |
| ----------------------- | ------------------- | ------------------ | ---------------- |
| W1 · Dictamen (O2)      | Claude Code de René | `feat/w1-dictamen` | En `main` (#187) |
| W2 · El hecho (O1 y O5) | Claude Code de René | `feat/w2-hecho`    | En `main` (#188) |

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
- **Medido en producción el 2026-11-09** (Chromium, 1366 × 768, `321dc188`):
  - Citar dos veces deja un solo bloque, en velocidad y en supuestos.
  - **La primera descarga con el 3D recién abierto todavía tarda 8.5 s,** ahora con su aviso a la vista («Tomando las fotos del 3D y armando el archivo…»). Las siguientes tardan de 0.9 a 1.2 s.
  - **Pendiente para U6:** revisarlo otra vez cuando las fotos salgan de Unity con `capturar` (René, 2026-11-09).

## W2 · El hecho (O1 y O5)

Rama `feat/w2-hecho`, sobre la de W1.

- **O1, causa raíz:** la ruta y el botón solo pedían 20 caracteres. «gggg…» llegaba a Claude, la lectura volvía vacía y el recorrido dejaba continuar con una escena sin vehículos.
- **O5, causa raíz** (lectura real grabada de «una combi colisiona con un pickup lobo»): Claude sí identifica a los dos, pero la cita de la combi es la frase entera, «una combi colisiona con un pickup lobo». El relato marcaba toda la cita como vehículo A y ponía la letra al final, después de «lobo»; la combi parecía no tener letra.
- **Qué cambió:**
  - **Antes de leer:** `revisarRelato` mide palabras reconocibles, repetición, letras contra símbolos y palabras de enlace. Si no pasa, sale un mensaje con un ejemplo, no se llama a Claude y la ruta responde `relato_insuficiente`.
  - **Mínimo para reconstruir:** sin ningún vehículo leído, «Continuar» se bloquea y dice por qué. Si falta el otro actor, el impacto o el lugar, se puede seguir y el aviso va antes de las preguntas.
  - **Letras:** la marca va en la palabra con la que el relato nombra al vehículo, no en toda la cita, y se repite cada vez que aparece.
  - **Vocabulario mexicano** (`VOCABULARIO_VEHICULOS`): combi, pesero, micro, microbús, vocho, urvan, torton, rabón, tráiler, pipa, volteo, motoneta y taxi, con su clase de `vehicle_classes.json`. Si no hay clase exacta, entra la más cercana como supuesto declarado, en la tarjeta del vehículo y en el dictamen.
  - **Nombres comerciales:** «Lobo» se queda como texto del modelo.
- **Lo que mostraron las 6 lecturas reales** (`data/cesvi/grabaciones/relatos-w2/`, claude-sonnet-5-5; 0.041 USD las seis, más 0.023 USD de una primera grabación que salió con los acentos rotos y se descartó):
  - «vocho» llega como modelo, sin clase: ahora entra sedán compacto como supuesto.
  - «motoneta» llega como `scooter`, que en Croquis es el patín eléctrico: el vocabulario manda y pone motocicleta, como supuesto.
  - «taxi» llega como participante del impacto sin una sola fila propia: ahora recibe su mención y sedán compacto como supuesto.
- **Pruebas:** unitarias en `packages/cesvi/src/relato.test.ts` y en `apps/web/src/lib/hecho-letras.test.ts`, entre ellas el zócalo, «gggg…» y la ruta. El prompt no cambió: las grabaciones de antes siguen valiendo.
- **Límite:** el vocabulario es una lista cerrada. Una palabra que no esté («guayín», «troca») queda sin mención propia y su clase se pregunta, como antes.

## W3 · Lo que hay antes de empezar (leído el 2026-11-09, sin código todavía)

Se revisó el código para saber qué toca W3 (PLAN-CESVI §3.4). Nada de esto está hecho.

- **Contrato.** Lo único nuevo de C1 en la escena 2.3.0 es `vehiculos[].puntos_paso` (`PuntoPaso`: `posicion`, `precision_m`, `t_s`, `orden`). El primer golpe y los choques intermedios usan `eventos[]` con su `punto_impacto`, como antes. El expediente, que es lo que edita la escena fácil, no tiene dónde guardar puntos de paso ni objetos con posición: hace falta un PR `contract:` o guardarlos junto al caso.
- **Nadie lee `puntos_paso` salvo el visor** (`marcadoresDe`). El solver, `packages/cesvi` y la escena fácil no lo usan.
- **El punto del primer golpe no entra a la inversión.** Hoy solo fija el origen de la escena y guía la geometría del contacto (`resolve_contact`). Falta su residuo en `_residuals` (Python) y `residuals` (TS).
- **Los choques intermedios contra objetos se pierden dos veces:** `especDeExpediente` los descarta con un límite, y `_later_impacts` / `laterImpacts` solo aceptan pares de vehículos. Después del impacto principal no hay choque con `entorno.objetos`. Un objeto del impacto principal se coloca en un lugar fijo (6, −6), no donde se marcó.
- **Los rumbos solo son parámetros de la inversión si hay evidencia de reposo,** y una escena que solo tenga puntos de paso se saltaría el ajuste (`Evidence.empty()`).
- **Etiquetas de evidencia nuevas** (por ejemplo `paso:<id>`): van en los dos patrones de `resultado.schema.json` (Inversion e InversionAlternativa) y en `evidenciaEnPalabras`. La evidencia del perito lleva `procedencia.fuente = "usuario"`.
- **La escena fácil ya pregunta «¿Dónde fue el choque?» al principio,** antes de los vehículos. W3 lo pide después de colocarlos: hay que decidir si se mueve o se reutiliza.
- **La ayuda de las e2e (`colocarTodo`) avanza por el texto de la pregunta** y la usan 12 specs: toda pregunta nueva hay que enseñársela.
- **Paridad:** `perturbed()` rehace la evidencia en un orden fijo; agregar la de los puntos de paso cambia la secuencia de números al azar, igual en Python y en TS.
- **ADR:** el bloque de W (0130 a 0169) está vacío; el primero libre es el 0130.

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
