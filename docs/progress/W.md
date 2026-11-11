# Bitácora del frente W · Web y física

Plan: `docs/cesvi/PLAN-CESVI.md` §3.4. Reglas: `CLAUDE.md`. ADR del bloque 0130–0169.

## Estado

- **Desde el 2026-11-09, el Claude Code de René lleva también este frente,** porque aquí no se había subido nada. Si eres el Claude Code del compañero: antes de empezar una fase, revisa la tabla de abajo y `git fetch`; si la fase ya está tomada, sigue con la siguiente y anótala aquí.
- **Hechas:** W1 (#187), W2 (#188), W3 (#192), W4 (#195, con su contrato #194) y W4b (#196), en `main`.
- **Fase actual:** W6 («Encuadre en 2D», O3), en `feat/w6-encuadre`. W5 está completa en `main` (#198, #199 y #200).
- **Siguiente paso:** con CI en verde, fusionar W6. Después, en el orden del plan: U5, U6, W7; antes de W8 o de una parte difícil de U5, avisar a René.

## Fases tomadas

| Fase                                                         | Quién               | Rama                                     | Estado                    |
| ------------------------------------------------------------ | ------------------- | ---------------------------------------- | ------------------------- |
| W1 · Dictamen (O2)                                           | Claude Code de René | `feat/w1-dictamen`                       | En `main` (#187)          |
| W2 · El hecho (O1 y O5)                                      | Claude Code de René | `feat/w2-hecho`                          | En `main` (#188)          |
| W3 · C1: punto inicial, choques intermedios y puntos de paso | Claude Code de René | `feat/w3-puntos`                         | En `main` (#192)          |
| W4 · C2 y «Corregir después»                                 | Claude Code de René | `feat/w4-corregir`                       | En `main` (#195)          |
| W4b · Menos ruido visual                                     | Claude Code de René | `feat/w4b-menos-ruido`                   | En `main` (#196)          |
| W5 · Terreno (C3 y O4)                                       | Claude Code de René | `feat/w5-terreno`, `feat/w5-terreno-web` | En `main` (#199, #200)    |
| W6 · Encuadre en 2D (O3)                                     | Claude Code de René | `feat/w6-encuadre`                       | En PR desde el 2026-11-10 |

## Datos personales fuera de `/api/cesvi` (René, 2026-11-10; ADR 0133)

- **Qué se hizo:** las cinco rutas (`escena`, `hecho`, `importar`, `declaracion`, `consideraciones`) redactan el texto con el `redact()` de `/relato` antes de llamar a Claude. `redact()` suma VIN, folios, pólizas y siniestros (`pii.json` 1.2.0, Python y TS con paridad). El navegador revisa las citas contra el mismo texto redactado; tras leer, la narración del caso queda redactada.
- **Lecturas grabadas:** ningún texto de origen grabado cambia al redactarlo (escenas, carambola, declaración, hecho A2010930, relatos de W2, reporte importado), así que no hubo que regrabar. `pipeline.golden.json` de Relatos-MX queda igual; `golden.json` solo cambia de versión y suma tres casos de los tipos nuevos.
- **Pruebas:** `apps/web/src/lib/redaccion.test.ts` (un texto con nombre y placa llega a la API sin ellos, en las cinco rutas, con un doble del cliente), `extraction/tests/test_pii.py` (los tipos nuevos y lo que no se redacta) y la paridad de `packages/extraction`.

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

## W4b · Menos ruido visual

Plan: PLAN-CESVI §3.4. El inventario, por pantalla, con qué se queda y qué se pliega, está en `docs/cesvi/w4b/inventario.md`.

### Qué se hizo

- **Reconstrucción:**
  - a primera vista quedan la velocidad con su rango, el método, el otro vehículo y lo que la fija;
  - el histograma, los percentiles (repetían el rango), la mediana (repetía al p50) y el estado del solver pasan a «Cómo se reparten las simulaciones».
- **Análisis:** cada supuesto muestra su valor y su rango; la justificación y la incertidumbre pasan a «Por qué».
- **Contra CESVI:**
  - la velocidad del reporte de CESVI sale una sola vez, arriba de las dos lecturas (antes salía en cada una);
  - «Por qué difieren» y la cuenta por restos van plegados.
- **Nada se borró:** todo sigue en la página (y en el dictamen), y las pruebas que leen esos datos siguen pasando.

### Capturas

`docs/cesvi/w4b/antes/` y `despues/`: el caso de AXA, de día (`claro-`) y de noche (`oscuro-`), pantalla por pantalla (`e2e/capturas-w4b.spec.ts`, a mano).

### Resumen para René (W4b)

**Qué quedó.** Reconstrucción, Análisis y Contra CESVI enseñan a primera vista solo lo que va en un dictamen de CESVI o lo que el perito decide ahí. Lo demás está a un clic, en «Ver detalle», «Por qué» o «Por qué difieren». El 63.15 de CESVI ya no sale dos veces.

**Cómo probarlo.** Abre AXA en `/cesvi`, reconstruye y recorre Reconstrucción, Análisis y Contra CESVI.

**Qué necesito de ti.** Que revises el inventario (`docs/cesvi/w4b/inventario.md`) con las capturas de antes y después. Lo que no te convenza se corrige.

## W5 · Terreno (C3 y O4)

Plan: PLAN-CESVI §3.4. Contrato: #198 (`Expediente.terreno` y los dos supuestos del tope en el resultado). Decisiones: ADR 0131. Física: `docs/physics.md`, «Terreno».

### Plan

- **Solver:** `terrain.py` como referencia y `terrain.ts` como port, con paridad en una escena nueva.
- **Relieve:** `/api/relieve` en TS, con la fuente verificada y medida.
- **Expediente y escena fácil:** `packages/cesvi/src/terreno.ts` y la pregunta «¿Cómo es el terreno?».
- **Dónde se ve:** perfil de elevación en Reconstrucción; zonas, topes y curvas de nivel en la maqueta.
- **Riesgo:** que un terreno plano cambie algún resultado. Se cuida con el camino de siempre cuando no hay terreno y con la regeneración de todas las referencias.

### Qué se hizo

- **Solver (Python y TS, con paridad):**
  - **gravedad** por la pendiente bajo las llantas, antes y después del impacto;
  - **fricción por zona**, con su rango en el Monte Carlo y en la inversión;
  - **topes** como arco de círculo, con pérdida de energía y de contacto como dos supuestos declarados con rango, y el evento `cruce_tope` con su velocidad;
  - **pose** sobre el terreno (`z`, `cabeceo`, `alabeo`);
  - **sin terreno, el camino de siempre:** al regenerar las 13 referencias anteriores, ninguna cambió.
- **Fuentes:**
  - topes: NOM-034-SCT2/SEDATU-2022, tabla 38;
  - pasto: Cenek, Jamieson y McLarin (llantas bloqueadas, seco y mojado), nuevo en `friction.json`;
  - lo demás de las zonas: las filas que ya tenía la tabla.
- **Relieve real** (`/api/relieve`, `apps/web/src/server/relieve.ts`):
  - primero el LiDAR de terreno del INEGI (5 m), por los Terrain Tiles de AWS; donde no hay, Copernicus GLO-30; si no responde, SRTM;
  - la malla lleva su fuente, el aviso de su licencia y su resolución de origen;
  - el PNG de los mosaicos se decodifica con código propio.
- **Expediente** (`packages/cesvi/src/terreno.ts` y `relieve.ts`): agregar, mover, girar, cambiar de tamaño, medir y quitar zonas, ondulaciones y topes; pedir el relieve; llevar todo a `lugar.terreno`; la malla en el marco de la escena y sus curvas de nivel.
- **Escena fácil:** la pregunta «¿Cómo es el terreno?» después de las de C1, el terreno dibujado en el mapa y sus controles en «Corregir la escena».
- **Reconstrucción:** el bloque «Terreno», con el perfil de elevación de cada vehículo, los cruces de tope y los supuestos.
- **Maqueta del caso:** zonas, ondulaciones con sus crestas, topes a su tamaño real y curvas de nivel.
- **Escena de referencia nueva:** `terraceria_topes` (alcance sobre terracería mojada, con ondulación, dos topes y una zona de grava). Es la escena canónica 14 y la quinta de D1.

### Evidencia

- **Escena de referencia** (`fixtures/resultados/terraceria_topes.json`, igual en Python y en TS):
  - el vehículo A cruza el primer tope a 47.61 km/h, 0.46 s antes del impacto, y llega al impacto a 42.33 km/h;
  - el vehículo B cruza el segundo tope a 17.06 km/h, 0.73 s después;
  - la fricción de la zona de grava entra al Monte Carlo en su rango, 0.35 a 0.60.
- **Relieve real** (`eval/js/w5_relieve.ts` → `eval/results/w5_relieve.json`, desde la laptop):

  | Lugar de prueba | Fuente que eligió                  | Desnivel en 600 m | Pendiente en el punto | Tiempo |
  | --------------- | ---------------------------------- | ----------------- | --------------------- | ------ |
  | Toluca, centro  | INEGI LiDAR                        | 59.28 m           | 1.1 %                 | 1.1 s  |
  | La Marquesa     | SRTM (Copernicus no llegó en 12 s) | 59.93 m           | 7.6 %                 | 12.5 s |
  | Mérida, centro  | INEGI LiDAR                        | 4.84 m            | 0.5 %                 | 0.5 s  |
  - Con Copernicus GLO-30, el centro de Mérida da 15.18 m de desnivel y 5.3 % de pendiente: son los edificios. Por eso el LiDAR de terreno va primero.
  - Copernicus tardó de 13 a 60 s desde la red de la laptop. Desde Vercel es otra cosa (abajo).

- **`/api/relieve` en producción** (`eval/w5_relieve_vercel.mjs` → `eval/results/w5_relieve_vercel.json`, commit `c8b03770`, 2026-11-10; tiempo total visto desde la laptop, dos URL nuevas por lugar):

  | Lugar de prueba | Fuente que eligió | Sin caché de la CDN (ms) | Con caché (ms) |
  | --------------- | ----------------- | ------------------------ | -------------- |
  | Toluca, centro  | INEGI LiDAR       | 463 y 189                | 83 y 86        |
  | La Marquesa     | Copernicus GLO-30 | 1287 y 488               | 74 y 75        |
  | Mérida, centro  | INEGI LiDAR       | 169 y 151                | 89 y 104       |
  - **Desde Vercel, Copernicus sí responde a tiempo:** en La Marquesa la cadena eligió Copernicus (desde la laptop, en 12 s no llegaba y quedaba SRTM). Los COG y la función están en AWS.
  - **La función estaba caliente** en esta corrida (justo antes se habían pedido esos lugares): el primer intento por lugar es lo más cercano a «sin nada guardado». Una función fría suma su arranque; no hay forma de forzarlo desde fuera.
  - **Con la CDN,** la malla llega en menos de 0.11 s.

### Pruebas

- `solver/tests/test_terreno.py` (16 funciones, 23 casos): el frenado en pendiente constante coincide con la fórmula; la distancia va con el inverso de la fricción de la zona; un tope quita la energía declarada; un terreno plano da el resultado de hoy.
- `packages/solver-ts/src/terreno.test.ts` (21): lo mismo en TS. `parity.test.ts` compara las 14 escenas con Python.
- `packages/cesvi/src/terreno.test.ts` y `relieve.test.ts` (19): la edición, lo que llega a la `EscenaSpec`, los cruces, el perfil y las curvas de nivel.
- `apps/web/src/server/relieve.test.ts` (15): la cadena de fuentes y el PNG, con mosaicos sintéticos (CI no sale a la red).
- `apps/web/e2e/escena-terreno.spec.ts` (`@flujo`): un tope, una zona ondulada, una zona de terracería y el relieve entran en la reconstrucción, y el tope se mide después.

### Resumen para René (W5)

**Qué quedó.** El terreno ya cambia los números de la reconstrucción.

- **Una pregunta nueva en la escena:** «¿Cómo es el terreno?». Si es pavimento liso, un botón y sigues. Si no, eliges terracería, grava, pasto, otra superficie, «Ondulado» o «Tope» y tocas el mapa donde está.
- **Cada cosa lleva su valor por omisión con fuente,** y lo puedes cambiar:
  - una zona lleva la fricción de la tabla para esa superficie, con su rango;
  - un tope lleva las medidas de la NOM-034 (tabla 38);
  - una zona ondulada lleva 0.10 m de alto y crestas cada 6 m como **supuesto**, y el resumen lo dice hasta que la mides.
- **«Usar el relieve real del lugar»** baja la pendiente del sitio. En ciudades con LiDAR del INEGI llega en un segundo.
- **En Reconstrucción** hay un bloque «Terreno»: la altura bajo cada vehículo a lo largo de su camino, a qué velocidad cruzó cada tope y qué supone Croquis al cruzarlo.
- **En la maqueta** se ven las zonas, los topes a su tamaño y las curvas de nivel.

**Cómo probarlo.**

1. En `/cesvi`, abre un caso nuevo con la narración de ejemplo y coloca la escena.
2. En «¿Cómo es el terreno?», elige «Tope» y toca el mapa en el camino de un vehículo. Marca también «Usar el relieve real del lugar».
3. Pulsa «Listo», ve a Reconstrucción y pulsa «Reconstruir». Baja hasta «Terreno».
4. Regresa a la escena, pulsa «Cambiar algo», toca el tope y cámbiale la altura: la reconstrucción se recalcula sola.

**Capturas** (`docs/cesvi/w5/`; el relieve de estas capturas es una malla de prueba, un plano de 5 %):

1. la pregunta «¿Cómo es el terreno?»;
2. el tope elegido, con los tres tipos de la norma;
3. un tope, una zona ondulada y una de terracería marcados;
4. el resumen con el terreno;
5. el bloque «Terreno» de Reconstrucción;
6. los cruces de tope y los supuestos;
7. el tope seleccionado para corregirlo.

**Lo que no hace, dicho claro.**

- **El relieve no ve lo chico:** una rampa de 2 m, el bombeo o un tope no salen del modelo de elevación. Se marcan a mano.
- **Fuera de las ciudades con LiDAR,** el relieve es de 30 m y puede tardar hasta 12 s la primera vez.
- **Los dos números del tope son supuestos** (cuánta energía y cuánto agarre se pierden), con su rango. No encontré una medición que los fije.
- **El visor de Unity todavía no recibe el relieve desde la web:** entra en U6.

**Qué necesito de ti.** Nada para seguir. Si conoces una medición del efecto de un tope en el frenado, sustituye a los dos supuestos.

### Decisiones que conviene saber

- **El orden de las fuentes del relieve cambió** respecto al plan (ADR 0131, punto 8): el LiDAR del INEGI va antes que Copernicus, por la medición de Mérida.
- **Los supuestos del tope entran al Monte Carlo y a la inversión** con un generador aparte (semilla derivada de la del caso): en `terraceria_topes` el rango p10–p90 de la velocidad al impacto de A se ensancha 0.98 km/h (+5.3 %), y las escenas sin topes no cambiaron ni un decimal (ADR 0131).
- **La pregunta del terreno no bloquea:** una escena que llega completa (un reporte importado, un caso guardado) no la hace sola; queda en el avance y en «Corregir la escena».
- **La maqueta, el 3D de la web y el bloque «Terreno» vuelven a simular** con las velocidades reconstruidas y el mismo relieve: por eso la velocidad de cruce de un tope es la de la reconstrucción y no la de la escena de partida.

### Pendiente

- **La fricción de una zona usa el estado «seco» para proponer el paso de ±0.05** en «Corregir»; el solver sí usa el estado del lugar.
- **Dibujar una zona con varios toques** (polígono libre): hoy es un rectángulo que se mueve, se gira y cambia de tamaño. El contrato ya acepta polígonos.
- **La volcadura, los peatones y los agentes reactivos** no ven el terreno (ADR 0131, «Límites»).

## W6 · Encuadre en 2D (O3)

Plan: PLAN-CESVI §3.4. Decisiones: ADR 0132.

### Plan

- **Lógica sin interfaz** (`apps/web/src/lib/vista-maqueta.ts`): «Ver todo», «Ir al impacto», acercar, alejar, desplazar, encajar entre los paneles y la escala gráfica, con su prueba unitaria.
- **La maqueta navegable** (`EscenaMaqueta`, propiedad `navegable`): en Reconstrucción y Análisis (la vista cenital de la etapa) y en el lado a lado de Contra CESVI.
- **Riesgo:** que el croquis del dictamen cambie según dónde dejó el perito la vista. Se evita: el dictamen y Presentar no navegan.

### Qué se hizo

- **«Ver todo» al abrir:** la caja de las trayectorias completas, los reposos, el impacto, la evidencia física, los puntos de paso, los objetos y los topes, encajada en lo que no tapan los paneles (pestañas, botones, leyenda y línea de tiempo).
- **«Ir al impacto»:** el encuadre de antes, también encajado.
- **Ratón, rueda y dedos:** la rueda acerca alrededor del puntero; arrastrar desplaza; dos dedos acercan alrededor de su punto medio. Límites: 6 m por lado como mínimo y 4 veces «Ver todo» como máximo; la escena nunca sale del todo de la pantalla.
- **Escala gráfica y norte** arriba a la derecha, junto a los botones; la escala es de 1, 2 o 5 por una potencia de 10.
- **Las letras guardan su tamaño en pantalla** al acercar; los trazos siguen a escala real.
- **En una maqueta angosta** (el lado a lado), los botones van en columna con nombres cortos.

### Pruebas

- `apps/web/src/lib/vista-maqueta.test.ts` (15): «Ver todo» contiene todo lo que importa en cinco escenas canónicas (alcance, carambola, peatón, terreno y árbol), cuenta la evidencia, los puntos de paso, los objetos y los topes, y no se deja comer por una zona de «todo el lugar»; «Ir al impacto» es el encuadre de antes; encajar deja la caja entera en el hueco; acercar deja quieto el punto del puntero y respeta sus límites; desplazar no cambia el tamaño; la escala gráfica.
- `apps/web/e2e/capturas-w6.spec.ts` (a mano, no `@flujo`): en el caso de AXA, «Ir al impacto» es más chico que «Ver todo», la rueda acerca, el arrastre desplaza sin cambiar el tamaño y «Ver todo» regresa a la vista inicial.

### Resumen para René (W6)

**Qué quedó.** La vista desde arriba del caso ya se recorre:

- **Abre con toda la escena a la vista,** sin que la tapen la línea de tiempo ni las pestañas.
- **«Ver todo» e «Ir al impacto»** arriba a la derecha, con «+» y «−».
- **La rueda del ratón acerca** donde está el puntero; **arrastrar** mueve la vista; en el celular, **dos dedos** acercan.
- **La escala gráfica y el norte** siempre a la vista.
- Vale en Reconstrucción, en Análisis (vista «Cenital») y en el lado a lado de Contra CESVI. El croquis del dictamen no cambia.

**Cómo probarlo.** En `/cesvi`, abre el caso de AXA, ve a Reconstrucción y pulsa «Reconstruir». En la vista cenital, usa la rueda, arrastra y prueba «Ir al impacto» y «Ver todo».

**Capturas** (`docs/cesvi/w6/`):

1. «Ver todo» al abrir;
2. «Ir al impacto»;
3. acercado con la rueda;
4. desplazado arrastrando;
5. el lado a lado de Contra CESVI.

**Qué necesito de ti.** Nada para seguir.

### Pendiente

- **El 3D** tiene su propio encuadre: es U4.
- **Teclado:** «+», «−», «Ver todo» e «Ir al impacto» son botones; las flechas del teclado todavía no desplazan la vista.

## Lo que U deja dicho para W

Viene de U0 (ADR 0111). Vale cuando el PR de contrato 2.3.0 esté en `main`:

- **La evidencia del perito es `procedencia.fuente = "usuario"`,** no `"perito"`: el enum de la escena no tiene ese valor y `usuario` ya es lo que usa `DEL_PERITO`.
- **El solver no recibe la malla de relieve.** `lugar.terreno.relieve.malla_id` solo la cita, y la malla viaja en el paquete caso-3d. Para W5, decide cómo dársela al solver; si cambia el contrato, va en tu PR `contract:`.
- **Si agregas evidencia a la inversión (`paso:` en W3),** agrega también su etiqueta al `pattern` de `evidencia` en `resultado.schema.json`. Hay dos lugares.
- **`z`, `cabeceo` y `alabeo` del resultado van en radianes o metros,** y `cruce_tope` lleva su velocidad en `detalle.velocidad_cruce_kmh`. Están en el contrato: falta que el solver los produzca.
- **Si cambias el solver,** corre `pnpm --filter @croquis/scene-schema generate` para actualizar `fixtures/caso3d/`. `generate:check` no corre el solver en las 7 escenas de inversión y agentes.

- **`eval/unity_build.mjs` y `eval/results/unity_build.*` son del frente U** (pedido de René, 2026-11-07): W no los toca.

## Necesito del otro frente

- **De W5 para U6:** pasar `Reconstruccion.relieve` a `armarCaso3d` al integrar `<VisorUnity>`, y publicar un build con el tope como arco (`TerrenoVista.cs`). Está anotado en `docs/progress/U.md`.
