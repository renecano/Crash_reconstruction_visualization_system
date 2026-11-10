# Bitácora del frente W · Web y física

Plan: `docs/cesvi/PLAN-CESVI.md` §3.4. Reglas: `CLAUDE.md`. ADR del bloque 0130–0169.

## Estado

- **Desde el 2026-11-09, el Claude Code de René lleva también este frente,** porque aquí no se había subido nada. Si eres el Claude Code del compañero: antes de empezar una fase, revisa la tabla de abajo y `git fetch`; si la fase ya está tomada, sigue con la siguiente y anótala aquí.
- **Hechas:** W1 (#187), W2 (#188) y W3 (#192), en `main`. El contrato de W4 (`Expediente.objetos`) también (#194).
- **Fase actual:** W4 ampliada (C2 y «Corregir después»), en `feat/w4-corregir`.
- **Siguiente paso:** cerrar W4 (e2e en verde, PR y fusión) y seguir con W4b («Menos ruido visual»). Antes de W5, Claude Code de René se detiene y le avisa a René (2026-11-10).

## Fases tomadas

| Fase                                                         | Quién               | Rama               | Estado                       |
| ------------------------------------------------------------ | ------------------- | ------------------ | ---------------------------- |
| W1 · Dictamen (O2)                                           | Claude Code de René | `feat/w1-dictamen` | En `main` (#187)             |
| W2 · El hecho (O1 y O5)                                      | Claude Code de René | `feat/w2-hecho`    | En `main` (#188)             |
| W3 · C1: punto inicial, choques intermedios y puntos de paso | Claude Code de René | `feat/w3-puntos`   | En `main` (#192)             |
| W4 · C2 y «Corregir después»                                 | Claude Code de René | `feat/w4-corregir` | En curso desde el 2026-11-10 |

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

## W3 · Punto inicial, choques intermedios y puntos de paso (C1)

Decisiones en el ADR 0130. Contrato en el PR #191 (ya en `main`).

### Qué se hizo

- **Solver, Python y TS con paridad:**
  - los puntos de paso entran a la inversión como residuo (lo que le falta a la trayectoria para tocar el punto, entre su precisión; con `t_s`, también la posición en ese instante);
  - el punto inicial del choque entra como evidencia medida cuando lo marcó el perito;
  - con esa evidencia también se ajustan los rumbos de llegada;
  - un choque intermedio contra un objeto ocurre contra el objeto marcado, en el lugar marcado: el objeto es un cuerpo inmóvil en la integración de después del impacto. Si la trayectoria no llega, sale un aviso.
- **`packages/cesvi`:** el primer golpe, los puntos de paso y los choques intermedios del expediente llegan a la escena del solver. Un impacto posterior contra un objeto con su punto ya no se descarta.
- **Escena fácil:** después de los vehículos, «¿Dónde fue el primer golpe?», «¿Chocó contra algo más?» y «¿Sabes por dónde pasó?», una a la vez, con mensajes de éxito, alerta si el punto queda lejos del choque, marcas en el mapa y sus líneas en el resumen.

### Evidencia

- **Inversión con puntos de paso** (`fixtures/inversion/resultados/lateral_puntos_paso.json`, escena sintética de `eval/w3_fixtures.py`): las velocidades verdaderas eran 55 y 35 km/h; arrancando de 45 y 40, la inversión estima 55.0 y 35.02 km/h y pasa por los cuatro puntos con residuos menores a 0.01 σ.
- **Choque intermedio** (`fixtures/c1/resultados/alcance_muro.json`): el vehículo golpeado choca contra el muro marcado a los 1.374 s.
- **Pruebas corridas en la laptop, una suite a la vez:**
  - `uv run pytest solver/tests/test_inversion.py solver/tests/test_puntos_paso.py solver/tests/test_consistency.py`: 50 en verde.
  - `uv run pytest solver/tests/test_choque_intermedio.py`: 4 en verde.
  - `vitest` de `solver-ts`: `puntos-paso.test.ts` (6) y `choque-intermedio.test.ts` (4), los dos con paridad contra Python.
  - `vitest` de `cesvi`: `reconstruccion.test.ts` y `reconstruccion-c1.test.ts`, 31 en verde.
  - `vitest` de la web: `escena-facil.test.ts` y `escena-facil-c1.test.ts`, 27 en verde.
  - `vitest` de `scene-schema`: 175 en verde; `generate:check` al día.
- **Sin correr en la laptop:**
  - la comprobación de todos los resultados guardados (`croquis-solver reconstruct --all --check`) tarda más de 9 min aquí y se cortó por tiempo, sin fallo: la corre CI;
  - la e2e de W3 y las e2e existentes que tocan la escena fácil: las corre CI; en la laptop, cuando René cierre el navegador.

### Decisiones que conviene saber

- **La pregunta del principio, «¿Dónde fue el choque?», se queda.** La del primer golpe va después de los vehículos, como pide el plan, y afina el punto del primer contacto.
- **Las tres preguntas no bloquean «Siguiente»,** y una escena que llega completa (un dictamen importado) no las hace sola: quedan en el avance.
- **El punto de impacto del relato no se volvió evidencia.** Solo el que marca el perito. Por eso ningún caso existente cambia de números.
- **Las e2e que colocan los vehículos a mano** contestan las tres con lo que no agrega evidencia (`contestarC1` en `ayuda-recorrido.ts`): sus cifras no cambian.

### Pendiente

- Guardar con el caso las respuestas «No sé» y «No» de las tres preguntas (hoy se guarda lo marcado, que está en el expediente).
- El `rumbo_deg` de un punto de paso todavía no entra a la inversión.
- En el visor, el marcador `punto_inicial` todavía no se emite: el primer golpe se dibuja con el punto de impacto que da el solver (`primer_golpe`).
- W4: mover, quitar y cambiar lo marcado tocándolo en el mapa. Hoy se corrige desde el avance («Cambiar») y con «Deshacer».

### Resumen para René

- **Qué quedó:** en la escena fácil, después de colocar los vehículos, Croquis pregunta dónde fue el primer golpe, si chocó contra algo más y por dónde pasó. Lo que marcas entra a la reconstrucción como evidencia medida, en el navegador (TS) igual que en la referencia de Python.
- **Cómo probarlo:** caso nuevo con la narración de ejemplo, coloca los dos vehículos y contesta las tres preguntas (por ejemplo, el Camaro contra un poste y un punto de paso). En la reconstrucción, «Evidencia usada» debe decir «punto del primer golpe que marcó el perito», «punto de paso 1 de V2» y «lugar del choque intermedio (impacto 2)».
- **Qué necesito de ti:** cuando cierres el navegador, avísame para correr la e2e de W3 en la laptop. En CI corre con cada push.

## W4 · Objetos que se mueven (C2) y «Corregir después»

Plan: PLAN-CESVI §3.4. Contrato: #194 (`Expediente.objetos[]`, `ObjetoExpediente`).

### Qué se hizo

- **Objetos del lugar** (`packages/cesvi/src/objetos.ts`):
  - agregar, mover, girar, cambiar de tamaño y quitar;
  - empalmes con cajas orientadas contra los vehículos en reposo y contra otros objetos, con la propuesta para separarlos;
  - `especDeExpediente` los lleva a `entorno.objetos`, con medidas típicas como supuesto o con las del perito como dato suyo.
- **Corregir después** (`apps/web/src/lib/escena-facil.ts`):
  - mover y quitar el primer golpe, los choques intermedios y los puntos de paso;
  - las líneas del resumen saben a qué pregunta regresar.
- **En la escena fácil:**
  - con la escena lista, «Cambiar algo» abre «Corregir la escena» con la paleta (poste, pared, árbol, barrera, guarnición, señal, vehículo estacionado);
  - tocar algo ya colocado lo selecciona y lo deja arrastrar. Los controles grandes son girar ±15°, más grande o más chico, «Cambiar», «Cambiar por dónde venía» y «Quitar»;
  - si un objeto queda encima de algo, sale la alerta con «Separarlos / Así está bien»;
  - cada línea de «¡La escena está lista!» lleva «Cambiar»;
  - «Deshacer» y «Rehacer» quedan siempre a la vista.
- **Al soltar se recalcula:** `useReconstruccion` recalcula solo 0.7 s después del último cambio, si ya había una reconstrucción. La escena muestra «Recalculando la reconstrucción…» o «Reconstrucción al día».

### Pruebas

- `packages/cesvi/src/objetos.test.ts` (9): edición, empalmes y lo que llega a la `EscenaSpec`.
- `apps/web/src/lib/escena-facil-w4.test.ts` (4): corregir el primer golpe, un choque intermedio y los puntos de paso, con su efecto en la `EscenaSpec`, y el resumen.
- `apps/web/e2e/escena-corregir.spec.ts` (`@flujo`): mover el poste de un choque intermedio cambia el resultado, y corregir la dirección del Jetta ya colocado también.

### Resumen para René (W4)

**Qué quedó.** Con la escena lista, «Cambiar algo» abre «Corregir la escena»:

- **Tocar algo ya colocado** lo selecciona: un coche en reposo, el primer golpe, un choque intermedio, un punto de paso o un objeto.
- **Lo seleccionado** se arrastra y tiene botones grandes: girar ±15°, más grande o más chico, «Cambiar», «Cambiar por dónde venía» y «Quitar».
- **La paleta** agrega objetos del lugar: poste, pared, árbol, barrera, guarnición, señal y vehículo estacionado.
- **En el resumen**, cada línea lleva «Cambiar».
- **«Deshacer» y «Rehacer»** quedan siempre a la vista.
- **Al soltar,** la reconstrucción se recalcula sola y la escena dice «Reconstrucción al día».

**Cómo probarlo.**

1. En `/cesvi`, abre un caso nuevo con la narración de ejemplo y coloca la escena.
2. En «¡La escena está lista!», pulsa «Cambiar algo».
3. Toca el poste o un coche y arrástralo, o agrega una barrera desde la paleta.

**Capturas** (`docs/cesvi/w4/`):

1. el resumen con «Cambiar»;
2. el panel para corregir;
3. el poste seleccionado;
4. el poste movido y recalculado;
5. una barrera agregada;
6. el Jetta seleccionado.

**Qué necesito de ti.** Nada para seguir. Si algo de la corrección no te convence, márcalo sobre las capturas.

### Decisiones que conviene saber

- **Solo se arrastra el vehículo en reposo.** El del impacto se corrige con su pregunta («Cambiar»), porque de él dependen el choque y las flechas de llegada.
- **Los objetos de la paleta no chocan solos:** están en la escena (el 3D los dibuja y tapan la vista), pero el solver solo choca contra el objeto de un choque intermedio que marcó el perito (W3).
- **Un tramo** (pared, barrera, guarnición) se coloca a lo largo de la calle más cercana; el tamaño cambia su largo. En un poste, un árbol o una señal, cambia el grosor.

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
