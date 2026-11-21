# Bitácora del frente W · Web y física

Plan: `docs/cesvi/PLAN-CESVI.md` §3.4. Reglas: `CLAUDE.md`. ADR del bloque 0130–0169.

## Estado

- **Desde el 2026-11-09, el Claude Code de René lleva también este frente,** porque aquí no se había subido nada. Si eres el Claude Code del compañero: antes de empezar una fase, revisa la tabla de abajo y `git fetch`; si la fase ya está tomada, sigue con la siguiente y anótala aquí.
- **Hechas:** W1 (#187), W2 (#188), W3 (#192), W4 (#195, con su contrato #194), W4b (#196), W5 (#199, #200), W6 (#201), W7 (#206) y W8 (#215, #219 y #220), en `main`.
- **Fase actual:** ninguna en curso. W9 necesita la autorización de René para gastar API.
- **Siguiente paso:** W8 cerrada el 2026-11-15: T3.2 (#215), T3.3 (contrato #219 y #220, ADR 0136) y T3.5 (E-R4 v4, igual a la v3 más el eje de la reversa). Nada de eso movió AXA ni un caso que ya vio CESVI después de T3.2. Queda una decisión de René sobre la versión declarada (sección T3.3, «Para decidir»). W9 (T6.5 y T6.6) espera su autorización de gasto de API.

## Ronda 4, de la narración a la física y al 3D (René, 2026-11-18, noche): en curso

René probó Croquis en producción y en local: lo que dice la narración no llega a la física ni al 3D. Esto va antes de todo lo demás. Rama `feat/w-narracion-a-la-fisica`.

**Diagnóstico del punto 1 (velocidades bajas), medido con el solver TS:**

- **La lectura nunca extrae velocidades.** `SISTEMA_ESCENA` (`packages/cesvi/src/escena-narracion.ts`) no tiene campo de velocidad, así que «a exceso de velocidad», «rápido» o «a 80 km/h» se pierden.
- **El solver no tiene prior de velocidad.** `velocidad_previa` solo es el arranque del ajuste (40 km/h si nadie la dice; `inversion.py`, `parameters`).
- **Un auto contra un árbol, sin reposo:** sale 40 km/h, el arranque fijo, y «la evidencia no la fija».
- **El mismo choque con el reposo junto al árbol:** el ajuste se va al tope (200 km/h, σ local 62), y la pantalla lo esconde como no fijada.
- **Los cinco ejemplos y AXA** no narran velocidades. «Carril de baja velocidad» es nombre de carril y se excluye.
- **Pendiente:** reproducir los 20 km/h de René con una narración de Tollocan contra un árbol (punto 2, demo local).

**Hecho (rama `feat/w-narracion-a-la-fisica`, con commits y push):**

1. **Velocidad (ADR 0145).**
   - Detector con cita: cifras y descripciones respecto al límite de la vía (LGMSV, art. 49 fr. III, o el `maxspeed` de OSM).
   - Prior en el solver, Python y TS, con paridad (`arbol_velocidad_declarada`) y `fijada_por: "declarada"`.
   - Pregunta «¿A qué velocidad venía?» con «No sé».
   - Donde la evidencia no fija nada, la típica de la vía en vez del arranque de 40 km/h (`expedienteConTipicas`).
   - Medido (`eval/ronda4_narracion_fisica.mts`):

     | Caso                             | Antes                           | Después                             |
     | -------------------------------- | ------------------------------- | ----------------------------------- |
     | AXA                              | 57 (55–78)                      | 57 (55–78), igual                   |
     | Tollocan (el `.croquis` de René) | 40 km/h, el arranque, sin rango | 45 (31–59), fijada por lo declarado |

   - Las 14 escenas canónicas, sin cambios (`reconstruct --all --check`).
2. **Clase del vehículo.**
   - «Un sedán», «una camioneta», «un tracto», «un Tsuru», «una CR-V»: clase más cercana, como supuesto con cita.
   - Solo se pregunta si de verdad no la dice (prueba con varias formas en `relato.test.ts`).
3. **Lugar y sentido separados** (`lugar-narrado.ts`).
   - Solo el lugar va al buscador.
   - «Rumbo a …» es el sentido de llegada: cardinal, o el rumbo hacia el destino, que se busca aparte.
   - Medido con 20 frases al estilo de CESVI (`eval/results/ronda4_lugar_sentido.json`):

     |                  | Antes | Después |
     | ---------------- | ----- | ------- |
     | Vía correcta     | 2/20  | 17/20   |
     | Sentido correcto | 10/20 | 19/20   |

   - Los 3 fallos de vía son del buscador: Eje 6 Sur, Gonzalitos y Periférico Sur.
4. **Objeto del primer impacto.** Va frente a la cara de contacto. Antes quedaba en la plantilla (6, −6) y el solver desviaba al auto hacia él.
5. **Calles guardadas con el caso** (`caso.lugar.calles_del_mapa`). Sin calles, la dirección queda como «falta», sin flechas cardinales.
6. **Aviso de calles:** solo sin calles de ninguna fuente, una vez por lugar, informativo.
7. **Encimados.**
   - En el choque se dice en el momento, con «Separarlos» (tocándose por la cara de contacto) o «Así fue el contacto».
   - Un choque que no transfiere energía (ΔV < 2 km/h en los dos) se dice en el resultado y en pantalla.
   - Causa medida: uno detrás de otro con la misma velocidad supuesta da ΔV 0. Encimados en ángulo o de frente, el impacto sale completo.
8. **Pendiente, puente y curva** narrados, como condiciones con cita.
   - Una subida o bajada enciende el relieve real.
   - El puente se dibuja en el 3D: losa a nivel, parapetos y muros hasta el piso de abajo.
   - El suelo de la web y las vías de Unity llevan el mismo relieve y el mismo hundimiento.
9. **Unity (punto 5).**
   - Cámara lenta automática en el impacto.
   - La deformación crece en 0.12 s hasta la del solver.
   - Restos y vidrios; la marca del contacto se queda.
   - La cinematográfica encuadra el impacto.
   - Pruebas en Croquis.Core: 115/115.

**Para retomar (2026-11-18, 20:30):**

- **El build nuevo de Unity** (huella `3cce5c1caca88f96`) compiló y pasa sus 7 pruebas EditMode.
  - Ya está copiado en `.cache/visor-unity/3cce5c1caca88f96`.
  - El `apps/web/public/visor-unity/manifest.json` local apunta a él. Ese cambio no se sube: `git restore` lo regresa al publicado.
- **La medición del arranque quedó sin hacer.** Claude Code detuvo las tareas por falta de memoria (8 GB). La primera corrida ya había fallado al compilar la app en modo local.
- **Para medir:** con todo lo demás cerrado, `tools/demo-local/demo-local.ps1 -Despues arranque-3d -Salida eval/results/ronda4b_unity_arranque_<n>.json`, 3 corridas. Se compara contra `ronda4_unity_arranque_despues_*` (el 1.3.0 publicado).

**Siguiente:**

1. Medir el build de Unity antes de publicar.
2. Las seis narraciones (`docs/cesvi/ronda-4/narraciones-fisica.md`) y el caso encimado en la demo local, con capturas del 3D y la tabla.
3. El antes y después de los cinco ejemplos en el navegador.
4. El tráiler, cuando llegue `croquis-tomas-trailer.zip`.

## Ronda 4, La escena y el 2D (René, 2026-11-18): hecho (ADR 0144)

René eligió la propuesta 1 de La escena, con cambios, y la propuesta 2 del 2D, con la 1 como fondo opcional. Rama `feat/w-ronda4-escena`.

- **Las flechas por las calles reales (caso cesvi-cf708e9fed):**
  - Causa: antes del arreglo del User-Agent, Overpass contestaba 406; ahora tarda unos 35 s, y la pregunta llega antes.
  - Arreglo: las calles salen de las teselas del mapa (`overpassDeTeselas`). Cada tramo toma el nombre de la línea con nombre más cercana. Pruebas en `calles-teselas.test.ts`, con las teselas grabadas del lugar.
  - El recorrido (maqueta y 3D) también las usa.
- **La escena ya armada y revisada en una lista** (`proponerEscena`, `listaDeLaEscena`, `ListaEscena`):
  - Cada elemento lleva su estado (propuesto, listo o falta) y un «Por qué» concreto: la calle, el sentido y el daño en que se apoya.
  - Sin la barra de 6 pasos; «Ver la reconstrucción» va dentro del panel.
  - Las herramientas, arriba, con su tecla. Alinear (A) y voltear (F) sirven para lo que esté seleccionado.
  - El flujo de una pregunta a la vez sigue con `?escena=anterior`.
  - Capturas en `docs/cesvi/ronda-4/evidencia/escena/despues-*`.
- **El 2D de Reconstrucción como croquis de perito** (`croquisPericial`, `CroquisPericialVista`):
  - Girado con la vía del choque horizontal, y el norte girando con él. Encuadra el choque; «Ver todo» muestra lo demás.
  - La vía en negro sobre papel. A1/A2/A3 (y P1–P3) con líneas guía, sin encimarse.
  - Las referencias, plegables bajo el dibujo.
  - Interruptor «Color por velocidad».
  - Fondos: «Mapa» tenue y «Foto» con su ajuste.
  - El dictamen usa el mismo SVG.
  - Capturas en `docs/cesvi/ronda-4/evidencia/2d/despues-{axa,cf708}-{1..4}-*.jpg`, contra `antes-*`.
- **Ninguna cifra cambió:** el croquis solo dibuja el `Resultado`.
- **Pruebas:**
  - `croquis-pericial.test.ts` (6), `escena-propuesta.test.ts` y `seleccion-escena.test.ts`.
  - Las e2e `croquis-pericial.spec.ts`, `escena-lista.spec.ts` y `cesvi-caso.spec.ts` (4 en verde, en local).
- **Pendiente:** la medición con una persona la hace René en la segunda ronda, con la guía de 5 minutos (`docs/cesvi/ronda-4/guia-medicion-escena.md`).
- **Siguiente paso:** el PR, el CI y la verificación en producción.

## Ronda 4, punto 8: el acto «Versiones» (René, 2026-11-18; ADR 0143)

- **Decisión de René:** la propuesta 1 con la entrada de la 2 (`docs/cesvi/ronda-4/propuestas-hipotesis.md`).
- **Qué quedó:**
  - **El acto «Versiones»,** entre Reconstrucción y Análisis. A la izquierda, el escenario grande con la versión elegida punteada. A la derecha, la lista de declaraciones e hipótesis y «Qué cambia» en el lenguaje del perito. Abajo, los dos formularios.
  - **«Comparar con una versión»** bajo la cifra de Reconstrucción.
  - **La declaración y «Probar una hipótesis» se movieron:** ya no están en «Ver el detalle» ni en «Los números».
  - **El solver entrega las trayectorias del «¿y si…?»,** en Python y en TS, con paridad. Ninguna cifra cambia: en los cinco resultados de referencia de los agentes solo aparece el campo nuevo, y el índice de cifras pasa.
  - **Presentar** tiene su capítulo y **el dictamen** su sección «Versiones del caso», marcadas como declaración o como hipótesis.
  - **El 3D alterna** entre la reconstrucción y la versión (frente U, ADR 0123).
- **Pruebas:**
  - **Unitarias:**
    - `versiones-caso.test.ts` de `packages/cesvi`: el resultado dibujable, válido contra el contrato; lo que cambia, con el alcance de referencia; títulos y resúmenes.
    - `versiones-caso.test.ts` de la web: una declaración por conductor y el tope de hipótesis.
    - `dictamen-caso`, `presentar-lab` y `actos`.
    - Python: `test_agents.py` (las trayectorias llegan al contacto; sin contacto, cubren el horizonte).
  - **E2e:** `cesvi-caso.spec.ts` recorre el acto con la declaración (crucero) y con una hipótesis (carambola), y comprueba que Análisis ya no la lleva. En `cesvi.spec.ts` (AXA), la declaración ya escrita está en «Versiones».
- **Capturas:**
  - Antes: `docs/cesvi/ronda-4/evidencia/hipotesis/hoy-*.jpg`.
  - Después: `docs/cesvi/ronda-4/evidencia/versiones/despues-*.jpg` (`e2e/capturas-ronda4-versiones.spec.ts`, a mano).
- **Límite a la vista:** en algunos casos colocados a mano, los conductores sin la hipótesis no dan el impacto de la reconstrucción. En el crucero de ejemplo no se tocan. Un aviso lo dice junto a las tarjetas: la hipótesis se compara con «Sin ella».

## Ronda 4, bloque B: buscar el lugar y los nombres de las calles (René, 2026-11-18)

- **B5, «Buscar el lugar»:** siempre en México y primero dentro de lo que sabe el caso.
  - **La zona:** el municipio y el estado del caso o, si el perito escribe otro estado, los del texto; lo que escribe gana.
  - **Dónde se busca:** se ubica el área y la calle se busca dentro de su caja, con la zona escrita. El orden de las variantes: el texto, calle y colonia, la calle, la segunda calle y la colonia.
  - **Varias opciones**, cada una con municipio y estado, y primero las del municipio del caso. Nunca salta a la primera; sin la zona del caso, La escena tampoco salta al abrir.
  - **Medido** con 30 lugares de reportes de CESVI de 19 estados (`eval/ronda4_buscar_lugar.mts`, `eval/results/ronda4_buscar_lugar_{antes,despues}.json`):
    - con el municipio y el estado del caso, el primer resultado cae en el municipio correcto en 28 de 30 (antes, 27);
    - si el perito escribe «lugar, municipio, estado» sin la zona del caso, en 28 de 30 (antes, 6), y en el estado correcto en 30 de 30 (antes, 9).
  - **Lo que falla:** dos alcaldías de la Ciudad de México (Tláhuac e Iztacalco). Con eso, Nominatim alcanza y no hace falta cambiar de proveedor.
- **B6, los nombres de las calles al alejar:**
  - **En La escena**, los nombres van en tres capas por tipo de vía: las grandes desde el zoom 11, las medias desde el 12.5 y las locales desde el 14 (antes, todas desde el 15). Las grandes van encima, y MapLibre nunca encima dos nombres.
  - **En el mapa de positron**, las locales aparecen desde el 14 y las grandes desde el 11.
- **Capturas antes y después:** `docs/cesvi/ronda-4/evidencia/b/`.

## Ronda 4, bloque A: noche y lluvia, marca y modelo, peatones y ciclistas (René, 2026-11-18; ADR 0142)

- **A1, las condiciones del lugar:** la superficie, su estado, el clima y la luz salen de la narración (`condiciones.ts`, sin IA, con su frase literal) y van al expediente (`caso.condiciones`). La luz, de la hora del relato (`iluminacion.ts`).
  - **Cifras, con el visto bueno de René (2026-11-18):** «Carambola de noche con lluvia» pasa de 34 a 30 km/h (concreto mojado, μ 0.55); los otros cuatro ejemplos no cambian (`eval/results/ronda4_condiciones.json`).
  - **Las cifras que CESVI ya vio no cambian** (`eval/results/ronda4_cifras_estables.json`): AXA 57 km/h (55–78) en las 20 semillas, la modalidad contra el título (91 de 156) y las carambolas (20 de 31). La cobertura (70.9 %) no usa nada de lo que cambió.
- **A2, los nombres:** siempre marca y modelo («A · Mazda 3», «A · VW Jetta», «A · Chevrolet Silverado»).
- **A3, peatones y ciclistas:**
  - **En La escena** se colocan, mueven, giran, quitan y deshacen como un vehículo (`personas.ts`, `seleccion-escena.ts`). «Marcar dónde quedó» da la distancia de proyección.
  - **En el cálculo:** la persona del atropello entra como `impacto_vehiculo_persona` con su distancia de proyección. «Peatón» ya no se calcula como objeto fijo: si falta, La escena pide colocarlo.
  - **En el 2D de Reconstrucción:** la figura en cada instante, su recorrido punteado, el reposo reconstruido (círculo) y dónde quedó según lo marcó el perito (cruz).
  - **Si lo marcado no cabe en el rango reconstruido,** un límite lo dice con las dos cifras (`avisoDeProyeccion`).
  - **En el 3D de Unity** el peatón se ve de pie antes del impacto y tendido en su reposo, con su cámara «Peatón»; no hizo falta un build nuevo.
- **La barra de reproducción:** «Llegada», «Impacto» y «Reposo final» ya no se enciman en ventanas angostas (dos renglones cuando la línea es corta).
- **Pruebas:**
  - **Unitarias:** `condiciones`, `iluminacion`, `personas`, `personas-reconstruccion`, `seleccion-escena`, `maqueta` (personas) y `vehiculos-cesvi`.
  - **E2e:** `atropello.spec.ts` (nueva, de la narración a la reconstrucción), `escena-personas.spec.ts`, y `visor-marco.spec.ts` comprueba que las etiquetas no se enciman a 1280 px.
- **Capturas:** `docs/cesvi/ronda-4/evidencia/personas/` (La escena, el 2D y el 3D de Unity real) y `docs/cesvi/ronda-4/condiciones/`.
- **Pendiente:** el próximo build de Unity debe aceptar un rango de versiones de la escena (hoy solo «2.3.0»), para poder subir la versión del contrato.

- **Qué se puede hacer:** en el mapa de La escena se toca un coche, un objeto, una zona del terreno o una marca, y queda seleccionado, resaltado y con su nombre. Después se puede:
  - moverlo (arrastre o flechas);
  - girarlo con su anillo (o Q y E);
  - quitarlo (un coche vuelve a preguntar dónde quedó);
  - deshacer y rehacer, las veces que sea.

  Tocar en vacío o Esc quita la selección. «En la escena» los lista para elegirlos con el teclado.

- **Si la escena cambia después de reconstruir:** ya no se recalcula sola. Avisa y ofrece «Reconstruir de nuevo»; lo demás se queda.
- **Pruebas:** `seleccion-escena.test.ts`, `seleccion.test.tsx`, y las e2e `escena-corregir`, `escena-terreno` y `capturas-w4` al día.
- **Capturas antes y después:** `docs/cesvi/ronda-3/evidencia/escena/`.

| Fase                                                         | Quién               | Rama                                     | Estado                 |
| ------------------------------------------------------------ | ------------------- | ---------------------------------------- | ---------------------- |
| W1 · Dictamen (O2)                                           | Claude Code de René | `feat/w1-dictamen`                       | En `main` (#187)       |
| W2 · El hecho (O1 y O5)                                      | Claude Code de René | `feat/w2-hecho`                          | En `main` (#188)       |
| W3 · C1: punto inicial, choques intermedios y puntos de paso | Claude Code de René | `feat/w3-puntos`                         | En `main` (#192)       |
| W4 · C2 y «Corregir después»                                 | Claude Code de René | `feat/w4-corregir`                       | En `main` (#195)       |
| W4b · Menos ruido visual                                     | Claude Code de René | `feat/w4b-menos-ruido`                   | En `main` (#196)       |
| W5 · Terreno (C3 y O4)                                       | Claude Code de René | `feat/w5-terreno`, `feat/w5-terreno-web` | En `main` (#199, #200) |
| W6 · Encuadre en 2D (O3)                                     | Claude Code de René | `feat/w6-encuadre`                       | En `main` (#201)       |
| W7 · Endurecimiento (T6.2, T6.3, T6.4)                       | Claude Code de René | `feat/w7-endurecimiento`                 | En `main` (#206)       |
| W8 · Números defendibles (T3.2, T3.3, T3.5)                  | Claude Code de René | `feat/w8-numeros`, `feat/w8-reversa`     | En `main` (#215, #220) |

## W8 · Números defendibles (T3.2, T3.3, T3.5) (desde 2026-11-12)

Pedido de René (2026-11-12), en Opus y con cuidado extra:

- Empezar por T3.2 (el rumbo inicial de V2 pegado a +20°): **primero diagnosticar la causa y escribirla aquí, antes de cambiar el solver.**
- **Si un cambio mueve los números de AXA (71.56 km/h, rango 68.02–92.81) o de cualquier caso que ya vio CESVI, detenerse y darle el antes y el después con la razón, antes de fusionar.**
- Todo cambio en Python va también al port TS, con paridad. La E-R4 v4 corre con la cadena reanudable, por fuera de la sesión.

### Plan

1. **T3.2, diagnóstico** (`eval/t3_2_rumbo_axa.mts` → `eval/results/t3_2_rumbo_axa.json`, sin tocar el solver): el ajuste de hoy (qué parámetros quedan en el límite y con qué residuos), la geometría (dónde arranca V2 y qué mueve girar su rumbo) y el perfil del rumbo de V2 de −20° a +60° con lo demás reajustado. La causa, aquí.
2. **T3.2, arreglo** según la causa, en Python y en el port TS con paridad, medido en AXA y en los demás casos de CESVI y escenas de inversión (`rangos_inversion`). Si AXA o un caso de CESVI se mueve: alto y antes/después a René.
3. **T3.3, reversa:** `sentido_marcha` en el contrato (PR `contract:` aparte), solver Python y TS, la lectura lo marca; E-R4 mide la reversa (`cesvi-3a0125cb81`).
4. **T3.5, E-R4 v4** con la cadena reanudable fuera de la sesión; se publica junto a v1–v3.

Hay un intento anterior, del 4 de noviembre, en `origin/feat/t3-2-arrastre` (6f4b8516): cambiaba el modelo de arrastre, el pivote del rumbo y los priors a la vez y dejó la paridad en rojo con referencias a medio regenerar. No se retoma tal cual: primero el diagnóstico.

### T3.2 · Diagnóstico (2026-11-12, sin tocar el solver)

**Herramientas:** `eval/t3_2_rumbo_axa.mts` → `eval/results/t3_2_rumbo_axa.json` (el ajuste de hoy, el perfil del rumbo de V2 cada 5° y cada 1°, y el ajuste con el rumbo de V2 fijo sobre la vía) y `eval/t3_2_contacto_axa.mts` → `eval/results/t3_2_contacto_axa.json` (dónde queda el contacto al girar apenas el rumbo de V1). Escena de AXA como la arma la app (`axa-reconstruccion.ts`, `especDeExpediente`); en el solver, V2 es `veh-a` (el que alcanza) y V1, `veh-b`. Se corrió el port TS: es el que usa la app y da lo mismo que Python (paridad E7).

**Lo que se ve:**

1. **El ajuste de hoy:** V2 a 71.56 km/h con el rumbo inicial de V2 en 95.72°, es decir, 20° más que el de la vía (75.72°): justo en el límite (`ANGLE_BOUND_DEG = 20`). Costo 0.03.
2. **El costo contra el rumbo de V2 es muy irregular** (perfil cada 1°, con todo lo demás reajustado). Hay valles casi igual de buenos:

   | Giro del rumbo de V2 | Costo     | V2 (km/h) |
   | -------------------- | --------- | --------- |
   | −21° a −20°          | 0.03      | 71.4–71.5 |
   | −19° a −13°          | 7.7–9.7   | 92–147    |
   | −12°                 | 0.15      | 68.7      |
   | −11° a −1°           | 0.2–20    | 113–186   |
   | 0° (sobre la vía)    | 0.12      | 64.23     |
   | +1° a +8°            | 0.4–4.7   | 42–57     |
   | +9°                  | 0.15      | 68.0      |
   | +13° a +23°          | 0.03–0.17 | 71.4–77.2 |
   | +24° y +25°          | 6.5–6.6   | 95–101    |

   Entre 0° (0.12) y +20° (0.03), la diferencia de costo es un Δχ² de unos 0.2: la evidencia no prefiere uno sobre otro. −20° da lo mismo que +20° (V2 71.54 contra 71.56), en espejo. El valle de +13° a +23° tiene su fondo en +20° y +21°, y el límite lo corta en +20°: por eso «pegado a +20°».

3. **Con el rumbo de V2 fijo sobre la vía** (como lo colocó el perito), la inversión da V2 a 64.57 km/h (p10–p90 62.18–86.99), contra 71.56 (68.02–92.81) de hoy. El reporte de CESVI dice 63.15.

**La causa: el punto de contacto de un alcance casi en línea está mal condicionado.**

- El evento de AXA declara el punto de impacto (0, 0) y cada vehículo arranca 12 m antes de su posición de impacto, en el mismo rumbo. El solver busca el contacto con `resolveContact` (`contact.ts`, igual en `contact.py`): proyecta el punto declarado sobre las dos trayectorias y luego `refinePair` minimiza la distancia entre las dos zonas de impacto, sin nada que lo mantenga cerca del punto declarado.
- Cuando las dos trayectorias van exactamente en la misma línea, todas las posiciones a lo largo de ella tocan igual y el contacto se queda en el punto declarado. Con el menor ángulo entre ellas, `refinePair` corre por el valle hasta donde las dos líneas se cruzan, o hasta el principio de la trayectoria. `t3_2_contacto_axa.json`, con las velocidades de la app:

  | Giro del rumbo de V1 | Contacto       | Distancia al punto declarado | V2 en su pose inicial |
  | -------------------- | -------------- | ---------------------------- | --------------------- |
  | 0°                   | (0, 0)         | 0 m                          | 0.7 s antes           |
  | 0.01°                | (−1.42, −5.58) | 5.76 m                       | 0.3 s antes           |
  | 0.045°               | (−2.11, −8.27) | 8.54 m                       | 0.2 s antes           |
  | 1°                   | (−2.29, −9.01) | 9.29 m                       | 0.2 s antes           |

- Así, el rumbo que ajusta la inversión no mueve un poco el choque: lo cambia de lugar, de un alcance en el punto que marcó el perito a uno casi donde arrancan los vehículos, y con eso cambia lo que pasa después (giros y reposos). De ahí el perfil irregular, con saltos de costo de 0.03 a 15 en 1°.
- El parámetro de rumbo gira la pose inicial alrededor de su posición (`parameters` y `apply_values`): con 20° de giro, V2 llega al choque con 4 m de desplazamiento lateral en 12 m, cruzando un carril de MEX 15D. Eso no lo dice ninguna evidencia: es el valle que encontró el ajuste.

**En resumen:** el +20° no es un rumbo que la evidencia pida; es el fondo de un valle que aparece porque el contacto salta en cuanto las trayectorias dejan de ser exactamente paralelas, y el límite de ±20° lo corta ahí.

**Arreglos posibles** (por decidir; los dos mueven AXA):

1. **Contacto estable:** que `resolveContact` se quede, entre las posiciones donde las zonas se tocan, con la más cercana al punto declarado (en Python y en TS, con paridad). Es la causa de fondo y afecta a todo alcance casi en línea.
2. **Pivote del rumbo en el punto de impacto declarado:** que el rumbo no declarado gire la llegada alrededor del punto de impacto y no del arranque, para que cambie de dónde venía el vehículo y no dónde chocó (lo intentó `feat/t3-2-arrastre`, mezclado con otros cambios).

### T3.2 · Cuánto movería a AXA cada arreglo (experimento, sin cambiar el solver)

`eval/t3_2_opciones_axa.mts` → `eval/results/t3_2_opciones_axa.json`. Los arreglos están en `eval/t3_2_opciones.patch` (solo el port TS, detrás de una variable); se aplica, se mide y se quita: el solver de `main` no cambia. Resultado completo de producción, como la app. CESVI: V2 a 63.15 km/h.

| Opción                                                             | V2 mejor (p10–p90)  | V1 mejor (p10–p90) | Rumbo inicial de V2                     |
| ------------------------------------------------------------------ | ------------------- | ------------------ | --------------------------------------- |
| Hoy                                                                | 71.56 (68.02–92.81) | 25.32 (8.83–26.27) | 95.72°, en el límite                    |
| 1 · Contacto estable                                               | 76.38 (68.60–93.46) | 21.56 (6.60–25.47) | 92.70°, ya no en el límite              |
| 2 · Pivote en el punto de impacto                                  | 56.96 (53.53–76.72) | 15.09 (0.80–16.29) | la evidencia no lo fija (no se reporta) |
| 1 y 2                                                              | 56.87 (54.13–76.80) | 14.98 (0.57–16.25) | la evidencia no lo fija                 |
| Rumbo de V2 como lo colocó el perito (sobre la vía), sin ajustarlo | 64.57 (61.19–86.80) | 22.70 (4.76–24.55) | 75.72°, el del perito                   |

- **Hoy**, el rango de V2 (68.02–92.81) deja fuera los 63.15 de CESVI.
- **1 solo** quita el salto, pero el valle oblicuo sigue: V2 llega con 17° de desvío y sube a 76.38.
- **2** (con o sin 1) deja el choque donde lo marcó el perito y dice con honestidad que la evidencia no fija el rumbo de V2. Pero, como el rumbo queda libre sin que la evidencia lo fije, el ajuste lo usa para bajar el costo y V2 baja a 57 (−20 %).
- **Rumbo del perito:** V2 a 64.57 (61.19–86.80), con 63.15 dentro del rango (+2.2 %). Es lo que pasa si, cuando la evidencia no fija el rumbo, se deja el que colocó el perito en vez de ajustarlo.

**Mi recomendación:** 1 y 2 en el solver (Python y TS, con paridad), más una regla: si el rumbo inicial no declarado sale no identificable, se queda el que colocó el perito y se declara como supuesto. En AXA eso daría lo de la última fila (64.57); falta medirlo con el código final y en los demás casos.

**Detenido aquí (regla de René, 2026-11-12):** los tres caminos mueven AXA (de 71.56 a entre 56.9 y 76.4) y pueden mover otros casos de CESVI. Antes de implementarlo y fusionarlo, René elige; luego mido el antes y el después de los 13 casos de referencia y de los casos de CESVI con el código final.

### T3.2 · Primera implementación (ADR 0135) y alto (2026-11-12, noche)

René eligió «1 y 2» más la regla, con condiciones (2026-11-12). El ADR 0135 se escribió y se subió antes de cambiar el solver (`65b8811b`). La implementación (Python y TS, idénticos en AXA) está en `feat/w8-numeros` (`ad87f384`) **sin fusionar**.

**Mediciones** (`eval/w8_comparar.mjs` y `eval/w8_referencias.mjs` → `eval/results/w8/`):

- **AXA** (como la app, resultado completo de producción): V2 de 71.56 (68.02–92.81) a **56.87 (53.97–77.44)**; V1 de 25.32 a 14.98. El rumbo de V2 queda como supuesto (75.72°, el del perito). CESVI: 63.15, ahora dentro del rango; el error del mejor valor pasa de +13.3 % a −9.9 %.
- **E-R4 (prueba, 205 dictámenes), las 205 narraciones de CESVI por la inversión y las 33 carambolas de prueba:** no cambia nada (solo el tiempo de cómputo).
- **Escenas de referencia:** cambian 10 de 25 resultados (14 canónicas, 4 de inversión, 5 de agentes y 2 de C1):

  | Escena                 | Qué cambia                                                                                                            | Juicio                                     |
  | ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
  | `axa_alcance`          | V2 71.56 → 56.87; el rumbo de V2 deja el límite (supuesto del perito)                                                 | mejor                                      |
  | `axa_reposo_lejano`    | V2 64.28 → 56.89; el rumbo de V1 pasa a supuesto                                                                      | coherente con AXA                          |
  | `volcadura`            | el rumbo deja el límite de +20° (queda en −7.46°); la velocidad, 51.03 → 84.46 (el relato dice 90)                    | mejor                                      |
  | `frontal_curva`        | el contacto queda a 7.0 m del punto del relato (antes 10.2 m); el ΔV de A, 58.12 → 44.08                              | esperado (contacto)                        |
  | `nocturno_lluvia`      | el contacto queda a 3.1 m del punto del relato (antes 13.0 m), pero aparece «las zonas no se tocan»                   | error mío: la bandera no usa la tolerancia |
  | `glorieta`             | V-A deja el 0 km/h del límite (17.98); V-B ya no se fija; el rumbo final de A empeora (−2.87σ → −5.21σ)               | mixto                                      |
  | `lateral_interseccion` | V-A pasa de «no se fija» a 84.92 km/h (el relato dice 45); el rumbo final de B empeora (1.34σ → 3.54σ)                | **peor**                                   |
  | `interseccion_toluca`  | los dos rumbos pasan a supuesto; los residuos suben (reposo de A, −3.47σ; antes, menos de 0.3σ)                       | **peor, sin razón física**                 |
  | `motociclista`         | el rumbo de A (en el límite) pasa a supuesto; A queda en 0 km/h en el límite y las marcas de B, −3.94σ (antes −0.30σ) | **peor, sin razón física**                 |
  | `lateral_puntos_paso`  | cambios de centésimas                                                                                                 | igual                                      |

**Por qué empeoran** (el criterio del ADR 0135 tiene dos huecos; ninguno sale de AXA):

1. **Rumbos ligados:** el criterio prueba cada rumbo solo, con los demás libres. En `interseccion_toluca` cada uno, por separado, parece no fijado, porque el otro compensa. Pero devolver los dos a la vez al valor del perito empeora la evidencia (residuos de hasta 3.5σ).
2. **El límite cuenta como plano:** con el mejor valor en el límite, el lado que da hacia afuera no tiene espacio, y el ADR lo mide «hasta el límite», es decir, sin moverse, así que el costo no sube y el rumbo pasa por no fijado. En `motociclista` la evidencia empuja el rumbo de A más allá del límite, y volver al del perito rompe las marcas de B (3.94σ).

**Propuesta para René** (cambiar el criterio después de ver resultados: por eso no lo aplico sin su visto bueno): un rumbo vuelve al del perito **solo si la evidencia explica ese valor casi igual de bien**. Con ese rumbo, y los que ya volvieron, en el valor del perito, y lo demás reajustado, el costo debe subir menos de `MODE_MARGIN` (Δχ² de 1). Se prueban de uno en uno, del que menos sube al que más, y se detiene en el primero que no pasa. Es la prueba de razón de verosimilitudes en el valor del perito, que es justo lo que se quiere saber, y cubre los dos huecos. Además, corregir la bandera de `nocturno_lluvia`: no avisar si la distancia queda dentro de la tolerancia de la zona.

**Detenido aquí** (regla de René: «si algún caso empeora sin razón física, detente»). Falta, después de su respuesta: aplicar el criterio, volver a medir todo, la paridad E7, el tiempo en el navegador, cambiar la cifra de AXA en todas partes a la vez y el PR.

### T3.2 · Criterio v2, nueva medición y segundo alto (2026-11-13)

René aprobó la versión 2 del criterio (2026-11-12) con condiciones; quedaron escritas en el ADR 0135 (versión 1, qué falló, versión 2 y por qué no es un ajuste para AXA). Rama `feat/w8-numeros`, sin fusionar.

**Cambios desde la versión 1:** el criterio v2 (prueba de razón de verosimilitudes en el valor del perito, de uno en uno); el aviso «la evidencia empuja el rumbo fuera del rango permitido» en los límites de la reconstrucción (paso de Reconstrucción y dictamen) cuando un rumbo queda en ±20°; la bandera «las zonas no se tocan» ya no sale dentro de la tolerancia de la zona; y la semilla del hipercubo del rumbo supuesto es de diseño, fija. Con una derivada de la del caso, el rango de AXA se movía con la semilla (p10 de 53.97 a 55.77 en 20 semillas), contra T3.1.

**La discrepancia de AXA** (`eval/t3_2_discrepancia_axa.mts` → `eval/results/w8/discrepancia_axa_{solver_de_main,solver_nuevo}.json`). El experimento de ayer, «se deja el rumbo que colocó el perito», corrió sobre el solver de `main`, sin los arreglos 1 y 2:

| Solver                          | Rumbo de V2      | V2 (km/h)           | Rumbo de V1 ajustado | Choque en el mejor ajuste                  |
| ------------------------------- | ---------------- | ------------------- | -------------------- | ------------------------------------------ |
| `main` (el experimento de ayer) | el del perito    | 64.57 (61.19–86.80) | 75.77° (+0.05°)      | a 8.68 m del punto donde lo puso el perito |
| `main` (la app hoy)             | ajustado: 95.72° | 71.56 (68.02–92.81) | 87.16°               | a 12.03 m                                  |
| nuevo                           | el del perito    | 56.87               | 75.72°               | en el punto del perito (0 m)               |

Con el solver de `main`, 0.05° en el rumbo de V1 bastaban para que el contacto se corriera 8.68 m (arreglo 1): los 64.57 eran un choque en otro lugar. Con el contacto estable, el mismo «rumbo del perito» da 56.87, igual que la regla.

**AXA ahora tiene dos hipótesis** (`eval/w8_axa_hipotesis.mts` → `eval/results/w8/axa_hipotesis.json`, resultado completo de producción):

| Hipótesis                              | V2                      | V1                  | Reposo de V2         |
| -------------------------------------- | ----------------------- | ------------------- | -------------------- |
| Cuadra con el daño medido (sin elegir) | **56.87** (54.79–78.39) | 14.98 (0.80–16.45)  | a 3.9 m del supuesto |
| Cuadra con el reposo supuesto          | 34.44 (30.07–44.44)     | 29.90 (21.38–31.63) | a 0.2 m              |

- Antes había una sola (71.56), porque el contacto corrido 12 m dejaba que el daño y el reposo supuesto (método de restos) cupieran juntos. Con el choque donde lo puso el perito, el daño medido deja a V2 a 3.9 m de su reposo supuesto, y la consistencia lo dice: «Hay dos hipótesis… el perito elige» (ADR 0091).
- La de 56.87 es la que se ve sin elegir. CESVI: 63.15, dentro de su rango.
- En las 20 semillas, AXA da lo mismo: 56.87 (54.79–78.39) y dos hipótesis.

**Escenas de referencia** (`eval/results/w8/referencias.json`, contra `origin/main`): cambian 10 de 25. Con la versión 2:

- **`motociclista` ya no empeora:** el rumbo de A sigue en el límite (200°) y sale el aviso. A, de 36.79 a 42.19 km/h.
- **`volcadura` mejora:** el rumbo deja el límite (−7.46°); 84.46 km/h (el relato dice 90). Costo de 7.83 a 0.76.
- **`interseccion_toluca`, `lateral_interseccion` y `glorieta` siguen peor en costo** (Toluca 1.51 → 8.10; glorieta 3.09 → 4.57), pero ahora se sabe por qué (`eval/w8_choque_referencias.mts`):

  | Escena                 | Choque en el mejor ajuste, solver de `main` | Con el nuevo | Costo `main` → nuevo |
  | ---------------------- | ------------------------------------------- | ------------ | -------------------- |
  | `interseccion_toluca`  | a 5.27 m del punto del relato               | a 0.02 m     | 1.51 → 8.10          |
  | `lateral_interseccion` | a 5.37 m                                    | a 0.01 m     | 3.57 → 3.35          |
  | `glorieta`             | a 2.61 m                                    | a 0.06 m     | 3.09 → 4.57          |
  | `motociclista`         | a 9.32 m                                    | a 5.89 m     | 1.84 → 2.59          |
  | `volcadura`            | a 0.05 m                                    | a 0 m        | 7.83 → 0.76          |

  Los ajustes «buenos» de `main` lo eran porque corrían el choque de 2.6 a 9.3 m del punto que dice el relato. Con el choque fijo en ese punto, los reposos caben peor. En estas escenas el punto viene **del relato** (`procedencia: relato`), y el solver lo trata como guía, no como medición (solo el que marca el perito entra a la inversión, `impact_point_from_spec`). En AXA, en cambio, el punto sale de donde el perito colocó los vehículos.

- `frontal_curva` y `nocturno_lluvia` (sin inversión): el contacto queda más cerca del punto del relato (de 10.2 a 7.0 m y de 13.0 a 3.1 m). Ya sin la bandera falsa.

**Las demás mediciones:**

- **E-R4 (prueba, 205), las 205 narraciones de CESVI y las 33 carambolas:** no cambia nada.
- **Paridad:** E7, 89 549 números en las 14 escenas, diferencia máxima 0 (`eval/results/e7_parity.json`). Pruebas TS: 228 de 229. La que falla dice «AXA: una sola hipótesis» (`inversion-un-dano.test.ts`): es la expectativa que cambia con las dos hipótesis.
- **Robustez** (Δχ² = 2.71 contra 1, `eval/results/w8/robustez.json`): de 13 escenas con evidencia, solo cambia `lateral_interseccion`. Con 2.71, el rumbo de A vuelve al del perito y A queda en 84.92 en lugar de 98.78. El criterio se queda en 1.
- **Tiempo en el navegador** (`eval/results/w8/tiempo_navegador.json`, worker de producción en Chromium, mediana de 3): la reconstrucción, igual (57 → 54 ms; Unity carga con ella). **El resultado completo, de 5.51 a 12.96 s: pasa la meta de 10 s.** Cuesta el criterio (ajustes extra), la búsqueda rehecha y la segunda hipótesis.

**Segundo alto:** para que René decida (1) si acepta que AXA pase a dos hipótesis; (2) si el pivote y el contacto en el punto deben valer también cuando el punto viene del relato o solo cuando lo marcó o lo colocó el perito; y (3) que el resultado completo pase de 10 s (hay que optimizarlo antes de fusionar).

### T3.2 · Decisiones de René, medición final y cierre (2026-11-13)

**Decisiones (René, 2026-11-13), en el ADR 0135:**

- AXA con dos hipótesis: se ve sin elegir «cuadra con el daño medido» y la del reposo supuesto va como alternativa marcada como supuesto (decisión 8).
- El punto del choque se fija solo si lo dio el perito; si viene del relato, es una estimación, y un choque a más de 2 m de él se avisa (decisión 2).
- El tiempo se recorta sin cambiar números (decisión 9).

**Antes y después** (`eval/results/w8/`, contra `origin/main`):

- **AXA, como la app:** V2 de 71.56 (68.02–92.81) a **56.87 (54.79–78.39)**: −6.28 km/h, −9.94 % contra 63.15, que queda dentro del rango. V1 de 25.32 a 14.98. Alternativa con el reposo supuesto: V2 a 34.44 (30.07–44.44). En las 20 semillas da lo mismo.
- **Escenas de referencia:** cambian 6 de 25:
  - AXA y sus dos variantes;
  - `frontal_curva` y `nocturno_lluvia`, donde solo cambia el contacto (más cerca del punto del relato y sin la bandera falsa). Con el contacto a lo largo de las caras (la corrección del ADR 0135, decisión 1), las velocidades de impacto no cambian y:
    - `frontal_curva`: el choque queda a 7.0 m del punto del relato (antes 10.2 m); ΔV de A 58.12 → 44.08 km/h y de B 35.66 → 27.05 km/h.
    - `nocturno_lluvia`: a 10.5 m (antes 13.0 m; con la primera tolerancia, que dejaba el frente de A a 1.28 m a través del costado de B, eran 3.1 m); ΔV de A 22.34 → 22.09 y de B 10.40 → 10.28 km/h.
    - En las dos, el choque queda a más de 2 m del punto del relato, así que el perito ve el aviso.
  - `motociclista`, en una centésima del p10 de un rumbo que sigue en el límite, ahora con aviso.
- **Toluca, lateral y glorieta ya no empeoran:** dan lo mismo que en `main`. Su choque queda a 5.27, 5.37 y 2.61 m del punto del relato, y ahora se avisa.
- **E-R4 (prueba, 205), las 205 narraciones de CESVI y las 33 carambolas:** sin cambio.
- **Paridad E7:** 89 710 números, diferencia 0 (`eval/results/e7_parity.json`). Pruebas TS: 229 de 229 en el solver; en `packages/cesvi`, todas. Una prueba sube su tope de 20 a 60 s, porque la inversión ahora hace más trabajo: 19 s en la laptop.
- **Robustez** (Δχ² = 2.71 contra 1): no cambia ninguna escena.
- **Tiempo en el navegador:** igual que el worker de producción en las mismas condiciones (`eval/results/w8/tiempo_navegador_rondas.json`; mediana 12.15 s el de producción contra 12.91 s el nuevo en tres rondas alternadas). Ese día la laptop iba al doble de lento: el de producción daba 5.51 s en la mañana. El resultado completo llega sin números distintos: salida idéntica byte por byte en tres escenas.

**La cifra de AXA, en todas partes a la vez:** `eval/results/axa_rango_estable.json` (que leen las pruebas de la app y la e2e), las pruebas con la cifra de ejemplo, los comentarios, la escena de demostración, los paquetes caso-3d y la línea de estado de `PLAN-CESVI.md` y `PROGRESS.md`. La alternativa sale en Reconstrucción (con la marca «supuesto»), Contra CESVI (nota de la lectura física), Presentar (fila «Alternativa con el reposo supuesto (supuesto)») y el dictamen (tabla de hipótesis y nota de Contra CESVI).

**En CI (2026-11-14):**

- La tarea de Python pasó del límite de 10 minutos (la corrida 43552472991 se canceló en el 98 %; en `main` ya tardaba 8 min 48 s). Las pruebas más lentas en la laptop: las preguntas de extracción (281 s), la incertidumbre de los puntos de paso (233 s), el reposo inalcanzable (205 s) y los resultados versionados de glorieta y de las variantes de AXA (158–177 s). Ninguna se quitó: el PR `chore:` #216 reparte las 952 pruebas en dos tareas en paralelo (163 + 789).
- La e2e de la carambola esperaba que sin la hipótesis del conductor el primer contacto fuera V1 con V2. Con el solver final da V1 con V3 en −0.47 s, igual que en `main`, así que el aviso de «línea base distinta» (ADR 0088) sale como antes y la prueba vuelve a la versión de `main`.

**Tiempo en el navegador, sin cumplir la meta de ≤ 10 s:** en tres rondas alternadas con el worker de producción, el nuevo tardó lo mismo (12.91 contra 12.15 s de mediana), con la laptop al doble de lento que en la mañana. Los recortes de la decisión 9 dejan cada número igual (paridad 0), pero no muestran ≤ 10 s en esa medición. Pendiente en «Endurecimiento pendiente»: volver a medir con la laptop en estado normal (`tools/unity/medir-tiempo-solver.ps1`).

**Siguiente:** T3.3 (reversa). Antes, René cambia el modelo: «Listo para T3.3: cambia el modelo».

### T3.3 · Diagnóstico de la reversa (2026-11-14, sin tocar el solver)

**Herramienta:** `eval/t3_3_reversa.mts` → `eval/results/w8/t3_3_reversa_antes.json` (el «antes», con el solver de `main`, 75a86237). Corre el port TS, que es el de la app y da lo mismo que Python (paridad E7).

**El caso:** `cesvi-3a0125cb81` (Yecapixtla). El conductor de A (Grand Cherokee) declara que puso en marcha hacia atrás su vehículo sin ver a B (Sentra), que estaba detrás. La narración de R0 no trae esa dinámica, así que la reversa entra como la narraría el perito en «Caso nuevo»; las posiciones, como las pondría en el mapa (A mira al norte y B está detrás).

**Lo que se ve hoy:**

| Entrada                                       | Lo que arma la app                                | Lo que reconstruye                                                                                       |
| --------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1. La lectura de R0, sin dinámica             | Los dos «recto» a 40 km/h, uno detrás del otro    | No hay choque: ΔV 0 y aplastamiento 0. Es lo que anotó PROGRESS el 22 de octubre («las dos en 40 km/h»)  |
| 2. Con la reversa narrada                     | A en reversa a **40 km/h** (supuesto); B detenido | A se mueve hacia atrás (−11.11 m/s sobre su frente) y pega con su parte posterior: eso ya funciona (R4b) |
| 3. Con las posiciones de impacto              | A empieza 12 m delante del impacto                | Igual: ΔV 22 km/h en cada uno, 0.16 m de aplastamiento en A y B empujado 7.77 m                          |
| 4. Con reposos supuestos (B desplazado 0.5 m) | Lo mismo                                          | La inversión no fija nada y se queda en 40 km/h: B termina a 7.77 m, no a 0.5 m                          |
| 5. Con reposos medidos (B desplazado 6 m)     | Lo mismo                                          | La inversión da **34.73 km/h en reversa** (31.06–37.85) y no avisa nada                                  |

**Las causas, en orden de importancia:**

1. **La velocidad en reversa se supone igual que hacia adelante: 40 km/h.** Sale del valor por omisión de `buildSpec` para cualquier vehículo en movimiento. Con eso, la reversa de Yecapixtla deja 0.16 m de aplastamiento en la parte posterior de A, cuando el reporte describe «hundimiento de muy baja magnitud», y empuja a B casi 8 m.
   - El propio CESVI supone 10 km/h en reversa en `cesvi-73aef4cf09` («Considerando que la masa es de 8 toneladas y la velocidad de 10 km/h en reversa»).
   - Fuente publicada: NHTSA, DOT HS 811 024 (Mazzae, Barickman, Baldwin y Ranney, 2008), 6 145 maniobras de reversa en uso real de 37 conductores. La velocidad máxima de cada maniobra (tabla 10, 6 037 maniobras): mediana 3.532 mph (5.68 km/h), p10 1.899 mph (3.06 km/h), p90 5.633 mph (9.07 km/h), p95 6.275 mph (10.10 km/h) y máxima observada 14.291 mph (23.00 km/h).
2. **La inversión acepta cualquier velocidad en reversa** (busca de 0 a 200 km/h, como hacia adelante) y no dice cuándo el resultado queda por encima de lo que se ha observado en una reversa (entrada 5).
3. **El contrato no separa el sentido de marcha de la maniobra.** «Reversa» es un valor más de `maniobra`, junto a las vueltas y los cambios de carril, así que un vehículo no puede retroceder dando vuelta (salir en reversa de un cajón o de una cochera, el caso más común).
   - Si la narración dice las dos cosas, la app se queda con la primera y pierde la otra: «reversa, vira a la izquierda» queda como reversa recta, y «vira a la izquierda, reversa», como vuelta hacia adelante.
   - La escena rechaza `sentido_marcha` («must NOT have additional properties»).
   - El solver ya tiene la pieza (`ReversePath` envuelve cualquier trayectoria), pero solo se usa con la recta.
4. **El resultado no dice quién iba en reversa.** El 3D, el croquis y el dictamen solo lo pueden saber releyendo la escena.
5. **Los metros de reversa no se usan.** Si la narración dice «retrocedió 3 m», el vehículo igual arranca 12 m antes.

**En el corpus** (`data/cesvi/corpus/expedientes.jsonl`): de 671 reportes, 44 tienen la modalidad «reversa» y 50 traen una maniobra de reversa en alguna versión (52 con alguna de las dos). No es un caso raro.

**Lo que no es un defecto del solver:** en la E-R4, la reversa se queda en 0 de 9 porque la narración de R0 no dice que alguien retrocedía (ADR 0069). Eso no se arregla en el solver. Lo que sí se puede medir es si, dado quién retrocede según el propio reporte, Croquis reconstruye la reversa.

**Plan de T3.3** (ADR 0136):

1. **Contrato** (PR `contract:` aparte, aditivo y opcional, sin subir versión, como #191 y #194): `sentido_marcha` («adelante» o «reversa») en el vehículo de la escena, en la maniobra del expediente y en el vehículo del resultado. `maniobra: "reversa"` sigue valiendo: es la reversa recta.
2. **Solver, Python y TS con paridad:** la reversa sale de `sentido_marcha` o de la maniobra «reversa»; cualquier maniobra se puede recorrer en reversa (vueltas, cambio de carril y seguir el carril); el resultado dice el sentido de marcha; aviso si la velocidad en reversa pasa de la máxima observada.
3. **La app:** la velocidad en reversa que no dio el perito entra como supuesto con su fuente y su rango (mediana y p10–p90 de NHTSA); la reversa con vuelta llega a la escena; los metros narrados fijan dónde arranca.
4. **La lectura lo marca** sin cambiar el prompt (no se gasta API): una vuelta cuya cita habla de reversa queda con `sentido_marcha: "reversa"`.
5. **E-R4 mide la reversa:** en los reportes de reversa, con quién retrocede según el reporte, cuántos reconstruyen al que retrocede.
6. **Antes y después** de las escenas de referencia, AXA, la E-R4 de prueba y las carambolas. Si AXA o un caso que ya vio CESVI se mueve: alto.

### T3.3 · Qué se hizo, medición y cierre (2026-11-14)

Decisiones: ADR 0136. Contrato: #219 (en `main`). Rama: `feat/w8-reversa`.

**Qué se hizo:**

- **Contrato:** `sentido_marcha` («adelante» o «reversa») en el vehículo de la escena, en la maniobra del expediente y en el vehículo del resultado. Aditivo y opcional. `maniobra: "reversa"` sigue siendo la reversa recta.
- **Solver (Python y TS):** cualquier maniobra se recorre en reversa (vueltas, cambio de carril y seguir el carril de una curva), con la izquierda y la derecha del conductor. El resultado dice quién llegó en reversa. No cambia el choque, el daño, el movimiento posterior ni la inversión.
- **La velocidad en reversa que no dio el perito** es un supuesto con fuente: 5.68 km/h, con rango de 3.06 a 9.07 (mediana y p10–p90 de la velocidad máxima de 6 037 maniobras de reversa en uso real; NHTSA, DOT HS 811 024). Antes eran 40 km/h, como cualquier vehículo que avanza. El perito lo lee en los límites.
- **Aviso** cuando una reversa sale más rápida que la más rápida de las medidas (23 km/h). No es un tope: la inversión sigue buscando en todo el rango.
- **La reversa con vuelta** llega a la escena en cualquier orden, y la lectura la marca sin cambiar el prompt (dos filas de maniobra del mismo vehículo, o una vuelta cuya cita dice que iba en reversa).
- **Sin posiciones del perito, quien retrocede llega de espaldas al otro.** Lo encontró la medición sobre los reportes: la disposición genérica supone que todos avanzan, y el que retrocedía se alejaba del otro. Ahora se suponen las caras de contacto que falten (la parte posterior del que retrocede; el primer daño del otro) y se voltea al que se alejaría.
- **La versión declarada** lleva su propio sentido de marcha. Su velocidad no cambia (ver «Para decidir»).

**Antes y después en el caso `cesvi-3a0125cb81`** (`eval/results/w8/t3_3_reversa_antes.json` contra `eval/results/t3_3_reversa.json`; A retrocede y B está detenido detrás):

| Medida                                    | Antes                | Después                                    |
| ----------------------------------------- | -------------------- | ------------------------------------------ |
| Velocidad de A en reversa                 | 40 km/h (supuesto)   | 5.68 km/h (supuesto con fuente, 3.06–9.07) |
| ΔV de cada vehículo                       | 22 km/h              | 3.12 km/h                                  |
| Aplastamiento medio en la parte posterior | 0.16 m               | menos de 0.005 m                           |
| Recorrido de B después del golpe          | 7.77 m               | 0.16 m                                     |
| El resultado dice que A iba en reversa    | No                   | Sí                                         |
| Reversa con vuelta en la escena           | Se pierde una de dos | Se conservan las dos                       |
| Con reposos medidos a 6 m (34.73 km/h)    | Sin aviso            | Aviso: pasa de la más rápida medida        |

El reporte describe en A un «hundimiento de muy baja magnitud» y dice que en una reversa el desplazamiento sería mínimo: el después cabe con eso; el antes, no.

**La reversa en los reportes de CESVI** (`eval/cesvi_r4_reversa.mts` → `eval/results/cesvi_r4_reversa.json`). A la lectura grabada de la narración de R0 (la misma de la E-R4, sin API) se le agrega un solo dato que esa narración no trae: quién retrocede, según las maniobras que C0 leyó en el reporte. Son 50 reportes; no se ajustó nada con ninguna de las dos particiones.

| Partición  | Vehículos que retroceden | Reconstruidos retrocediendo | Con daño posterior en el reporte | De esos, el golpe queda en su parte posterior |
| ---------- | ------------------------ | --------------------------- | -------------------------------- | --------------------------------------------- |
| Desarrollo | 38 (37 medidos)          | 37                          | 26                               | 21 (antes de la disposición nueva: 4)         |
| Prueba     | 12                       | 12                          | 12                               | 9 (antes: 0)                                  |

- El «antes» de la última columna es con el solver y la velocidad ya cambiados, pero con la disposición genérica de siempre (`eval/results/w8/cesvi_r4_reversa_sin_disposicion.json`).
- Uno de desarrollo no se mide: la narración no trae al vehículo que retrocede.
- Los que no quedan en la parte posterior son, sobre todo, casos donde el otro vehículo tiene el daño en un costado y la disposición genérica lo pone cruzando.
- La modalidad «reversa» de la E-R4 sigue en 0 de 9: la narración de R0 no dice que alguien retrocedía (ADR 0069). Esto no la cambia ni pretende cambiarla.

**Lo que ya vio CESVI no se movió** (`eval/w8_t3_3_comparar.py` → `eval/results/w8/t3_3_comparacion.json`, contra lo medido al cierre de T3.2):

- AXA como la app, 20 semillas: 206 números, 0 diferencias. Sigue en 56.87 km/h (54.79–78.39).
- La inversión en las 205 narraciones de prueba: 646 números, 0 diferencias.
- E-R4 de prueba: 2 358 números, 0 diferencias.
- Carambolas de prueba: 181 números, 0 diferencias.
- Escenas de referencia (`croquis-solver reconstruct --all`): solo cambia `reversa`, y solo por el campo nuevo `sentido_marcha` en el vehículo A.
- Paridad E7: 89 710 números, diferencia 0.

Como nada de eso se movió, no hubo alto antes de fusionar.

**Pruebas:** `solver/tests/test_reversa.py` (8) y las demás del solver en Python, en verde; `packages/solver-ts/src/reversa.test.ts` (6); `packages/scene-schema/src/sentido-marcha.test.ts` (3); `packages/cesvi/src/reversa.test.ts` (16) y las 404 de `packages/cesvi`.

**Decidido por René (2026-11-15):** una reversa declarada sin velocidad va a la velocidad medida de una reversa (5.68 km/h); el detalle, en «La reversa en la versión declarada».

**Pendiente** (en «Endurecimiento pendiente»): el arranque desde detenido (los metros de reversa no cambian la velocidad), el flujo de relatos de la v1, un campo propio en el prompt y las luces de reversa en el 3D.

### Resumen para René (T3.3)

- **Qué quedó:** si el perito narra que un vehículo retrocedía, Croquis lo reconstruye a la velocidad de una reversa y no a 40 km/h, también si retrocedía dando vuelta, y lo dice en el resultado. Si la evidencia pide una reversa más rápida que cualquiera de las medidas, avisa.
- **Cómo probarlo:** en «Caso nuevo», narrar «El vehículo A retrocedía y golpeó con su parte posterior el frente del vehículo B, que estaba detenido». En Reconstrucción, los límites dicen la velocidad supuesta y su fuente, y el 3D muestra a A llegando de espaldas.
- **Qué necesito de ti:** la decisión de arriba sobre la versión declarada. Lo demás no cambió ningún número de AXA ni de los casos de CESVI.
- **Siguiente:** T3.5 (abajo).

### T3.5 · E-R4 v4 (2026-11-15)

**Qué es la v4:** las mismas lecturas grabadas (`escena-narracion-v2`) y las mismas reglas de la v3 (R4d, ADR 0076), medidas con el solver de hoy: C1, C3, T3.1, T3.2 y T3.3. Entre la v3 y la v4 no se ajustó ninguna regla y no se gastó API. Corrió como tarea de Windows, fuera de la sesión (`tarea-w8-t3-5`).

**Cómo se corre** (desde `packages/cesvi`):

```
pnpm exec tsx ../../eval/cesvi_r4_reproduccion.mts medir desarrollo
pnpm exec tsx ../../eval/cesvi_r4_reproduccion.mts medir prueba
pnpm exec tsx ../../eval/cesvi_r4c_titulo.mts medir desarrollo
pnpm exec tsx ../../eval/cesvi_r4c_titulo.mts medir prueba
pnpm exec tsx ../../eval/cesvi_r4_reversa.mts
pnpm exec tsx ../../eval/cesvi_r4_reproduccion.mts comparar
```

**Dónde queda:** `eval/results/cesvi_r4_v4_reproduccion_{desarrollo,prueba}.json` y, lado a lado con v1–v3, `eval/results/cesvi_r4_v4_comparacion.json`. Los resultados de v1, v2 y v3 se quedan como se publicaron.

**Resultado:**

- **La v4 da lo mismo que la v3 en todos los ejes de la E-R4,** en desarrollo (459 narraciones) y en la prueba (205): modalidad, zonas, secuencia, velocidades y posiciones finales, fila por fila. Es lo esperado: esos ejes salen de la lectura, las reglas y la verificación de CESVI, no de la física que cambió.
  - Prueba: modalidad 80 de 190 (42.1 %) contra 35.3 % de «siempre otra»; modalidades físicas 74 de 123 (60.2 %) contra 37.4 % de «siempre alcance».
  - Contra el título del reporte (`eval/results/cesvi_r4c_titulo_prueba.json`): 91 de 156 (58.3 %) contra 37.2 % de la regla simple.
  - Las 205 de la prueba se reconstruyen y se pueden ver en 3D, igual que en la v3.
- **Lo nuevo de la v4 es el eje de la reversa** (`eval/results/cesvi_r4_reversa.json`, sección T3.3): dado quién retrocede según el reporte, el golpe queda en la parte posterior en 21 de 26 (desarrollo) y 9 de 12 (prueba) de los que tienen daño posterior. La modalidad «reversa» sigue en 0 de 9, porque la narración de R0 no la dice.
- **La inversión en las 205 narraciones y las carambolas** no cambiaron con T3.3 (`eval/results/w8/t3_3_comparacion.json`).

**La página y la portada toman la v4:** `/cesvi/reproduccion` y la portada de CESVI leen `data/cesvi/r4/pagina.json` y la v4 de `cesvi_r4c_titulo_prueba.json` al compilar. Las cifras que muestran son las mismas de antes. En `pagina.json` cambian la fecha y la clase de un vehículo en 4 de los 205 casos (`cesvi-2a83292792`, `cesvi-928c1a7646`, `cesvi-9b2fc2ffc7` y `cesvi-f9de9836d6`), que la lectura de hoy sí reconoce.

**D5 del plan:** T3.2, T3.3 y T3.5 están en `eval/results/`, y la portada toma de ahí sus cifras. El README no cita cifras de CESVI; se revisa en U7.

### La reversa en la versión declarada (2026-11-15)

René aceptó la decisión 7 del ADR 0136: una reversa declarada sin velocidad va a la velocidad medida de una reversa (5.68 km/h, de 3.06 a 9.07), no a la de la reconstrucción de ese vehículo.

**Hecho** (rama `feat/w8-reversa-declarada`; René pidió fusionarla después de la Tanda 1 de la auditoría):

- `especDeclarada` (`packages/cesvi/src/comparacion-declarada.ts`) y sus pruebas (`reversa.test.ts`, 21 pruebas).
- **Antes y después en AXA** (`eval/w8_reversa_declarada.mts`; `eval/results/w8/reversa_declarada_antes.json` contra `eval/results/w8_reversa_declarada.json`). El conductor de A declara «me paré, reversié unos metros cuando llegó la camioneta y me impactó»:

  | Versión declarada de AXA              | Antes                    | Después                          |
  | ------------------------------------- | ------------------------ | -------------------------------- |
  | Velocidad de A en reversa             | 15 km/h (reconstrucción) | 5.68 km/h (supuesto, 3.06–9.07)  |
  | Velocidad de cierre                   | 71.9 km/h                | 62.58 km/h                       |
  | ΔV de A y de B                        | 28.34 y 50.75 km/h       | 24.67 y 44.17 km/h               |
  | Reposo de A, lejos del reconstruido   | 34.8 m                   | 31.9 m                           |
  | Reposo de B, lejos del reconstruido   | 37.1 m                   | 35.1 m                           |
  | Filas de «Qué cambia entre versiones» | 2 no coinciden, 4 sí     | Las mismas: ningún estado cambia |
  | Sugerencia                            | «No alcanzan para decir» | La misma                         |

- **El 56.87 de AXA no se mueve:** la reconstrucción física es idéntica en ese guion, y con la medición de la app (`eval/axa_rango_estable.mts`, 20 semillas, `eval/results/w8/declarada/axa_rango_estable.json`) da 56.87 km/h (54.79–78.39) en las 20, igual que al cierre de T3.3.

**Cierre:** la decisión 7 del ADR 0136 quedó actualizada y la fila de «Bloqueado» de `docs/PROGRESS.md`, retirada. La versión declarada no entra en la E-R4 ni en las carambolas (`especDeclarada` solo la usa `comparacion-declaracion.tsx`), así que no hizo falta volver a medirlas.

### Resumen para René (W8)

- **Qué quedó:** W8 completa.
  - T3.2 (ADR 0135): AXA en 56.87 km/h (54.79–78.39) con dos hipótesis.
  - T3.3 (ADR 0136): la reversa se reconstruye a la velocidad de una reversa, también con vuelta, y avisa si la evidencia pide más de lo que se ha medido.
  - T3.5: la E-R4 v4 publicada junto a v1–v3; da lo mismo que la v3 y añade el eje de la reversa.
- **Cómo probarlo:** `/cesvi/reproduccion` (mismas cifras, medición del 2026-11-15) y, en «Caso nuevo», una narración con un vehículo que retrocede.
- **Qué necesito de ti:** la decisión sobre la velocidad de una reversa en la versión declarada (sección T3.3, «Para decidir»).
- **Siguiente:** W9 necesita tu autorización de gasto de API antes de empezar (T6.5 y T6.6). Mientras, sigue lo que no dependa de eso.

## W7 · Endurecimiento (T6.2, T6.3, T6.4) (2026-11-11)

Decisiones: ADR 0134. Rama `feat/w7-endurecimiento`.

### Plan

- **T6.4:** retomar `fix/agentes-orden-impactos` (commit `c8c8a08`, sin pruebas): escena de prueba donde el orden importa, pruebas en Python y TS, paridad.
- **T6.3:** que el orden que declare el perito llegue al solver (el primer impacto ya sale de `orden`), que el solver diga si reconstruye otro, y la pregunta en la interfaz.
- **T6.2:** la versión declarada en la maqueta y en el croquis del mapa.
- **Riesgo:** sin Playwright, la interfaz de T6.2 y T6.3 queda sin ver; por eso la lógica va en funciones puras con pruebas.

### Qué se hizo

- **T6.4 · Agentes:** los pares cuyo impacto el hecho narra después del primero no se buscan antes de él. Escena nueva `fixtures/agentes/carambola_orden` (una fila detenida con C tocando a B): el primer contacto es el de A con B y los agentes reproducen la reconstrucción. Los cuatro resultados de agentes que ya estaban no cambian.
- **T6.3 · Solver:** aviso `orden_impactos_distinto` si los impactos posteriores ocurren en otro orden que el declarado, con los dos órdenes. No fuerza el orden. Escena de paridad `fixtures/c1/carambola_cuatro` (`eval/w7_fixtures.py`).
- **T6.3 · Interfaz:** `packages/cesvi/src/orden-impactos.ts`. Si la narración de una carambola no dice el orden, Croquis lo pregunta con las formas de ordenar los impactos (dos o tres); la respuesta reordena el expediente y el primero pasa a ser el origen de la reconstrucción. La pregunta se cierra al contestarla o con «No sé». Sin cambio de contrato.
- **T6.2 · Croquis 2D:** `versionDeclaradaEnMaqueta` (`apps/web/src/lib/maqueta.ts`) y `posicionesDeclaradasEnTiempo` (`packages/cesvi`). En la maqueta, la versión declarada va punteada sobre la reconstrucción, con su nombre y su línea en la leyenda; en el mapa, un marcador hueco por vehículo. Solo donde difiere de la reconstruida.

### Evidencia (2026-11-11, en la laptop; solo pruebas unitarias)

- `uv run pytest -q solver/tests/test_agents.py`: 9 en verde. `solver/tests/test_orden_impactos.py`: 5 en verde. `ruff` y `pyright` limpios en lo tocado.
- `packages/solver-ts`: `agents.test.ts` 7 en verde (paridad con Python en las cinco escenas de agentes); `orden-impactos.test.ts` 4 en verde (paridad en `carambola_cuatro`).
- `packages/cesvi`: la suite completa, 36 archivos y 381 pruebas en verde antes de T6.2; `declarada-croquis.test.ts`, 5 en verde. `tsc` y eslint limpios.
- `apps/web`: la suite completa, 66 archivos y 407 pruebas en verde; `tsc` y eslint limpios en lo tocado.
- Los resultados versionados del solver que revisé (`carambola`, `alcance`, `poste`, `lateral_interseccion`, `motociclista` y los de agentes) no cambian.

### e2e (en la CI, 2026-11-11)

René ocupaba la laptop, así que las e2e se verificaron en la CI del PR:

- **Flujo principal** (`cesvi-caso.spec.ts`, `@flujo`): pasa con la comprobación de T6.2 (la versión declarada en la maqueta y su línea en la leyenda). La primera corrida falló más adelante, en el PDF del dictamen: la prueba se quedaba en «Maqueta» y el dictamen toma sus tres cuadros del 3D abierto; ahora regresa al 3D.
- **Orden de impactos** (`orden-impactos.spec.ts`): no lleva `@flujo`. Para correrla sin la laptop se le puso la marca en un commit (corrida 43131070883: 10 e2e en verde, una más que la anterior) y se le quitó después.
- **Lo que la CI encontró además:** faltaba el paquete caso-3d de `carambola_orden` y dos pruebas contaban 22 paquetes (ahora 23).

### Pendientes

- **El marcador de la versión declarada en el croquis del mapa** no tiene e2e: depende del instante en que quede el reloj (en el impacto las dos versiones coinciden y no se dibuja). Tiene prueba unitaria; falta verlo a mano.
- **Con cuatro o más impactos entre vehículos** no se pregunta el orden: queda el leído.

### Resumen para René

- **Qué quedó:** en una carambola, si tu narración no dice qué chocó primero, Croquis te lo pregunta y usa tu orden; si la física da otro orden, lo avisa. Las hipótesis de los conductores ya no «chocan» antes de tiempo a dos coches detenidos en fila. Y la versión declarada de un conductor ya se ve también en la maqueta y en el mapa, punteada sobre la reconstrucción.
- **Cómo probarlo (cuando esté desplegado):** en «Caso nuevo», escribe «Un tráiler invade el carril contrario en la autopista y choca de frente contra una urvan; atrás venía un rabón que alcanza a la urvan» y lee la narración: sale la pregunta del orden. Para la versión declarada, abre AXA, reconstruye, compara la declaración y cambia a «Maqueta».
- **Qué necesito de ti:** nada.

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

## Auditoría del 2026-11-15 · Tanda 1 (confianza inmediata)

Plan aprobado por René el 2026-11-15 (`docs/auditoria/2026-11-15-fable.md`, sección 5): Tanda 1 → 3 → 2 → 4 → 5. Las pruebas pesadas van en la computadora del colaborador; en la laptop solo unitarias, paridad, lint y tipos.

### Qué se hizo

- **Logo en todos lados (#223, decisión 6):** la transición entre actos dibujaba el logo anterior; ahora lee `assets/brand/marca.json`. El nombre de la apertura de la portada es el logo (`palabra.svg`) y no texto. El PDF y el Word del dictamen llevan el logotipo en la cabecera. Los colores del logo son tokens del sistema y la señal es una sola, `#FF5B2E` (`lab-impacto` valía `#FF5A1F`). `logo.test.ts` falla si algo dibuja el logo fuera de la fuente única.
- **Redactor (C1):** con la opción `conservarCifras` (TS) o `conservar_cifras` (Python), una palabra común junto a una cifra ya no se borra como placa: «con 1450 kg», «250 mts», «del 2010», el año tras un mes en mayúsculas («AGOSTO DEL 2019») y el modelo «Ram 2500». La usan las rutas de `/api/cesvi` (`textoParaClaude`) y `redactar` del corpus. Sin la opción el redactor hace lo mismo que antes: las grabaciones de Relatos-MX se indexan por el texto redactado y siguen valiendo. Addendum en el ADR 0133.
- **Portada (C3):** la tasa de modalidad va completa, «91 de 156», con su denominador (los reportes que dicen la modalidad en su título) y la regla simple sobre el mismo. Una prueba exige el «k de n» en los dos idiomas.
- **Generados de la web (I4):** `generate:check` vuelve a pasar: `recorrido.json` regenerado, `tokens.css` igual a su generador byte por byte, y la comprobación de la portada cubre solo la imagen para redes. Falta meterlo a `ci.yml` (PR `chore:` aparte, por ser archivo compartido).
- **Dictamen (I2):** cada cuadro del 3D lleva «Reconstrucción ilustrativa; el entorno es procedural: no es el lugar real.»; el pedido del Físico va en palabras y no con el código de la bandera; el lugar ya no une una oración con comas; la zona nombra sus partes («tercio», «vértice») y los valores del contrato llevan acento («de atrás hacia adelante»).
- **Repositorio público (C4):** resuelto por decisión de René; ADR 0137 y nota en la auditoría.

### Evidencia

- **Redactor, medido** (`eval/redactor_cifras.mts` → `eval/results/redactor_cifras.json`; solo conteos, ningún texto de los reportes):
  - En los 671 reportes crudos de CESVI las marcas `[PLACA]` bajan de 5,577 a 4,829: 748 cifras dejan de borrarse, en 240 reportes. Las más frecuentes: «del» (287), «ram» (270) y «con» (62).
  - En Relatos-MX (797 textos) las placas anotadas a mano se borran igual con la opción y sin ella: 96 de 98. Las marcas bajan de 114 a 101.
- **Portada:** `eval/results/cesvi_r4c_titulo_prueba.json` (v4): Croquis 91 de 156 (58.3 %); regla simple 58 de 156 (37.2 %); 205 reportes reconstruidos a ciegas.
- **Capturas del logo:** `docs/cesvi/logo/transiciones-antes/` y `transiciones-despues/` (`tools/demo/capturas-logo.mjs`).
  - Entrar a un caso: producción antes (`main` en 56565741) y después (d011595d).
  - Cambio de acto y apertura de la portada: el «después» es de producción; el «antes», del servidor local con los archivos anteriores, porque producción ya llevaba el cambio. La transición corta dura menos de 500 ms: la captura la detiene y fija la animación en cada instante.
- **Pruebas:** `packages/extraction` 862, `packages/cesvi` 404 y las de la web tocadas (logo, portada, dictamen), en verde; pytest del redactor y su espejo, en verde; lint y tipos de la web, de `packages/cesvi` y de `extraction`.

### Paquete del colaborador (decisión 8)

- **Qué es:** `CORRER-TANDA-EN-RTX.bat` (doble clic, sin preguntas ni llaves), `LEEME-TANDA-RTX.md` (3 pasos) y `tools/colaborador/tanda.ps1`, que corre los pasos de la tanda vigente (`tools/colaborador/tandas.json`) y sube los resultados a `resultados/<tanda>-<fecha>` sin tocar la copia de trabajo ni `main`.
- **La Tanda 1 no tiene nada pesado:** todo lo cubre el CI. Por eso la tanda vigente es la prueba de 2 minutos, que René pidió antes del primer paquete.
- **Probado en la laptop (2026-11-15):** el modo de prueba corrió completo en 0.4 min, con la subida a su rama (la rama de esa prueba se borró para no confundirla con la del colaborador). Falta que corra en la computadora del colaborador.

### Lo que no dibuja el logo (revisado)

La pantalla de carga de Unity y su plantilla WebGL solo dicen «Cargando el visor 3D…»; el visor y sus fotos llevan la leyenda ilustrativa, no el logo; la pantalla de inicio de Unity está apagada; no hay Lottie ni video del logo en la app.

### Pendiente

- **El corpus versionado se armó con el redactor anterior** (`data/cesvi/corpus`): la auditoría contó 193 marcas `[PLACA]` en los expedientes y 94 en las narraciones, casi todas cifras. Rearmarlo cambia las narraciones que mide la E-R4, así que va con la Tanda 3 y su regla de antes y después.
- **Los cuadros de la portada anterior** (`/publico`) quedaron desactualizados con los contratos 2.3.0. No se regeneran: la página se redirige en la Tanda 4 y ahí se retiran con su comprobación (`portada.mjs --check` completo).
- **El video publicado y el recorrido promocional** llevan el logo anterior: se rehacen con el paquete del colaborador al cerrar la Tanda 2 (decisión 9).
- **En desarrollo la transición de entrada no se monta** (el efecto corre dos veces con StrictMode). En producción sí; solo afecta a quien prueba en `pnpm dev`.

### Resumen para René (Tanda 1)

- **Qué quedó:** el logo sale de un solo archivo en todas partes (también en las transiciones, el PDF y el Word); el redactor ya no borra masas, distancias ni años antes de la lectura; la portada dice «91 de 156»; el dictamen avisa que el entorno del 3D no es el lugar real y ya no trae identificadores internos.
- **Cómo verlo:** las capturas de `docs/cesvi/logo/transiciones-antes/` contra `transiciones-despues/` (las que más importan: `transicion-entrar-al-caso-750ms.png` y `transicion-entre-actos-250ms.png`). En producción, abrir AXA y descargar el PDF.
- **Qué no se movió:** ningún número del solver ni de AXA; la Tanda 1 no toca la física.
- **Qué necesito de ti:** nada. Sigue la reversa declarada y después la Tanda 3, que se detiene con el antes y el después de AXA.

## Auditoría del 2026-11-15 · Tanda 3 (números defendibles)

**Estado: aprobada por René el 2026-11-15, con dos cambios que ya están hechos** (addendum del ADR 0139):

- La hipótesis visible se llama «La más cercana al daño medido» (antes «Cuadra con el daño medido») en todas las vistas, en el mensaje del solver y en el índice de cifras.
- El límite de cobertura del rango va en los límites que ve el perito y en el dictamen, con la cifra del índice único (hoy 82 de 116, 70.7 %; lo esperado es cerca de 80 %).
- La razón de impulso se queda sorteada (0.29 a 0.49) como supuesto declarado.

### Qué se hizo

- **Un solo formateador (punto 12, ADR 0138):** `packages/cesvi/src/formato.ts`. La conclusión de la reconstrucción va en enteros con su rango; la tabla que reproduce el método de CESVI conserva dos decimales. Pantalla, PDF y Word pasan por ahí: `formato.test.ts` falla si queda un `toFixed` fuera en el flujo de CESVI.
- **Un índice de cifras publicadas (punto 12):** `eval/cifras.mjs` genera `eval/results/cifras.json` (cada cifra con su valor, su denominador, sus simulaciones y el archivo y el campo de donde sale). `eval/verificar_cifras.mjs` falla si un documento vigente trae una cifra distinta o una retirada sin su fecha; corre con las pruebas (`cifras.test.ts`).
- **Las simulaciones, en el dato (N3):** cada rango dice de cuántas simulaciones sale (32 en la app, 12 en las evaluaciones); el dictamen lo escribe.
- **Los tres supuestos del impacto entran al rango (punto 9, ADR 0139):** restitución (0 a 0.3), razón de impulso (0.29 a 0.49) y arrastre después del impacto (0.3 a 0.5 de la fricción). Los nominales no cambian, así que el mejor ajuste no se mueve. Python y TS, con paridad en las 14 escenas.
- **La deformación medida contra la reconstrucción (punto 10):** en vez de «Alcanza la deformación medida», cada hipótesis dice el cambio de velocidad del vehículo, lo que pide su deformación (p10–p90 y mediana) y qué parte de la energía de la mediana explica (`packages/cesvi/src/dano-energia.ts`).
- **Cobertura sintética (punto 11):** `eval/t3_cobertura.mts` fabrica casos con velocidad verdadera conocida y mide si el p10–p90 la contiene.
- **De paso:** la escena «AXA con agentes» sale otra vez de su generador (N4) y la escena del video lleva el rango de la app (N3).

### Antes y después

**AXA, como la reconstruye la app** (32 simulaciones, 20 semillas; `eval/results/w8/t3_3/` contra `eval/results/w8/t3/`):

| AXA                       | Antes (en producción)                   | Después del solver  | Como se leerá en pantalla                                                                                                            |
| ------------------------- | --------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| V2 (B), antes del impacto | 56.87 km/h (54.79–78.39)                | 56.87 (55.11–78.06) | 57 km/h (55–78)                                                                                                                      |
| V1 (A), antes del impacto | 14.98 km/h (0.80–16.45)                 | 14.98 (1.04–21.38)  | 15 km/h (1–21)                                                                                                                       |
| Hipótesis                 | 2                                       | 2                   | 2                                                                                                                                    |
| Método de CESVI (tabla)   | 63.90 contra 63.15, +0.75 km/h, +1.19 % | igual               | igual, con dos decimales                                                                                                             |
| Deformación medida de B   | «Alcanza la deformación medida»         | —                   | «Queda en el borde bajo…: 30 km/h de cambio de velocidad contra al menos 30–90 (mediana 51). Es el 34 % de la energía de la mediana» |

**Las referencias** (`eval/results/w8/t3_comparacion.json`, de `eval/t3_comparar.py`):

| Medición                                   | Números comparados | Cambian          | De ellos, centrales |
| ------------------------------------------ | ------------------ | ---------------- | ------------------- |
| AXA, 20 semillas                           | 206                | 88 (percentiles) | 0                   |
| Inversión en las 205 narraciones de prueba | 646                | 0                | 0                   |
| E-R4, prueba                               | 2,358              | 0                | 0                   |
| Carambolas, prueba                         | 181                | 0                | 0                   |

Solo cambian rangos. Las cifras de la portada (91 de 156, 205, 671) no se mueven.

**Cobertura sintética, corrida reducida** (40 casos por escena, 116 velocidades; `eval/results/t3/cobertura_40.json`): el p10–p90 contuvo la velocidad verdadera el 62 % de las veces con los tres supuestos fijos (intervalo al 95 %: 53–70) y el 71 % con ellos sorteados (62–78). Lo esperado es cerca de 80 %. Mejora, y sigue corto: la corrida de 200 casos va en el paquete del colaborador para tener el intervalo más cerrado.

### Decisiones que conviene saber

- **La razón de impulso es un supuesto declarado.** No encontré un rango absoluto publicado; se arma con dos mediciones (ADR 0139). Si René prefiere dejarla fija, es quitar una dimensión.
- **El rango de V2 en AXA casi no cambió** (la auditoría esperaba que se ensanchara): en la hipótesis visible su velocidad la fija la deformación, no el tramo después del impacto. El de V1 sí se ensancha.
- **El redondeo a enteros es el usual,** no hacia afuera (ADR 0138).
- **`eval/results/` no se reorganizó por fechas:** el índice de cifras dice cuáles son las vigentes.

### Pendiente de esta tanda

- **Paquete del colaborador (PR #228):** una sola corrida de cerca de 1 hora con la E-R4 completa (desarrollo y prueba), las carambolas, las referencias y la cobertura de 200 casos. Al llegar `resultados/t3-<fecha>`: `python eval/t3_comparar.py t3 t3_rtx` debe dar cero diferencias contra lo medido en la laptop.
- **Capturas de AXA antes y después** (Reconstrucción, Contra CESVI, hipótesis, dictamen) y `eval/results/laboratorio_axa.json` (N5), con la e2e manual `laboratorio-axa.spec.ts`.
- **`docs/cesvi/PLAN-CESVI.md`** tiene dos líneas con el 71.56 en presente: van en un PR `chore:` propio (archivo compartido), que además lo mete al verificador.
- **El corpus con el redactor nuevo** cambia las narraciones, y las lecturas grabadas de la E-R4 son de las narraciones viejas: volver a leerlas gasta API. Va con W9 (tope de 20 USD).
- **Las capas de ingeniería del modo foto de Unity** escriben sus números en C#: se alinean con el formateador al rehacer las fotos (Tanda 2).

### Para retomar

Rama `fix/t3-cifras`. Lo último hecho: N4 y la escena de la demo regeneradas. Sigue: capturas de AXA antes y después, esta bitácora al día y esperar el visto bueno de René y el resultado del colaborador. Si René aprueba: marcar #227 como listo, esperar el CI del commit exacto y fusionar; después, el PR `chore:` de PLAN-CESVI.

## Auditoría del 2026-11-15 · Tanda 4 (proceso y seguridad)

**Estado (2026-11-15):** hecha. Páginas (#231), encabezados y tope de gasto (#232), protección de `main` y Dependabot agrupado. Verificado en producción el mismo día: los tres encabezados llegan, una petición que no es JSON recibe 415, una de otro origen 403 y `/publico` redirige a la portada.

### Qué se hizo

- **Páginas del producto anterior (I7, decisión 3 de René; #231).** `/demo`, `/relato`, `/visor`, `/croquis`, `/publico` e `/historia` redirigen a la portada en los dos idiomas (temporales; el código se conserva). `/recorrido` lleva un aviso de versión anterior. La portada y el encabezado y el pie viejos ya no enlazan a esas páginas. Manifiesto e imagen para redes sin «a partir de un relato». `robots.txt` deja fuera `/cesvi`, `/api/` y lo interno; `sitemap.xml` lista la portada.
- **Encabezados de seguridad (I6).** `next.config.ts` manda `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `Content-Security-Policy-Report-Only` en todas las rutas. La política solo reporta: no bloquea nada.
- **Tope de gasto con reserva (I1; ADR 0140).**
  - `conReserva` y `costoMaximoUsd` en `packages/extraction/src/server/budget.ts`; los usan `extract` (relato), `leerEscena`, `leerDeclaracion`, `leerDictamenImportado` (una reserva por lectura), `leerHecho` y `redactarConsideraciones`.
  - Una negativa, una respuesta truncada o un JSON inválido quedan cobrados (`LLMError.costoUsd`, `errorCobrado`).
  - El día del tope corta a la medianoche de `America/Mexico_City`.
  - `apps/web/src/server/pedido.ts`: `rechazoDePedido` (JSON y origen propio) y un límite por hora por ruta (`limitadorDe`; importar, la mitad).
  - Importar acepta hasta 100,000 caracteres (`MAX_REPORTE`; la ruta y la pantalla usan la misma constante).

### Medido

`cd packages/cesvi && pnpm exec tsx ../../eval/reserva_tope.mts` → `eval/results/reserva_tope.json` (sin llamar a la API; solo conteos y cifras):

| Lectura                                                  | Reserva (USD) |
| -------------------------------------------------------- | ------------- |
| Narración del tamaño máximo (12,000 caracteres)          | 0.37          |
| Importar un reporte, mediana de los 671                  | 0.77          |
| Importar un reporte, percentil 90                        | 0.82          |
| Importar el reporte más largo (77,430 caracteres)        | 1.09          |
| Importar un texto del tamaño máximo (100,000 caracteres) | 1.18          |

La reserva es una cota del costo, no el costo. Lo que cambia para el perito: una lectura se niega cuando lo gastado en el día más su reserva pasa del tope.

### Pruebas

- `packages/extraction/src/server/reserva.test.ts`: dos peticiones a la vez no pasan juntas del tope; lo pagado sin servir queda cobrado; un fallo sin costo devuelve la reserva; la cota; el día de México.
- `apps/web/src/server/pedido.test.ts`: JSON y origen; el host detrás del proxy; el límite por ruta.
- `apps/web/src/lib/paginas-anteriores.test.ts`: redirecciones, manifiesto, robots y mapa del sitio, encabezados.
- La e2e de la portada revisa que `/publico` lleve a la portada.

### Proceso (I5 e I8)

- **Ruleset «main protegida»** (GitHub, id 27338684): exige los cinco checks de CI (sin pedir que la rama esté al día), bloquea el force-push y el borrado de `main`. Se quita o edita en Settings → Rules.
- **Las ramas se borran solas al fusionar su PR** (`delete_branch_on_merge`). Las ramas `resultados/*` del colaborador no pasan por PR y no se tocan.
- **Alertas de seguridad de dependencias activadas.**
- **Dependabot agrupado** (`.github/dependabot.yml`): parches y versiones menores en un PR por ecosistema; las mayores, una por una. Los 11 PR sueltos que había los reemplaza Dependabot en su siguiente corrida.

### Pendientes

- Fusionar los PR agrupados de Dependabot cuando lleguen en verde (revisar antes `pnpm-workspace.yaml` y `allowBuilds`). El de `anthropic` 1.13 → 2.1 (Python) es una versión mayor: va aparte.
- Borrar las ramas remotas ya fusionadas: no se hizo. Borrar pide una lista explícita y el visto bueno de René.
- Lo anotado en `docs/PROGRESS.md`, «Endurecimiento pendiente» (política de contenido obligatoria, rutas sin uso, referencia en Python, precio de caché, límite por IP).

### Necesito de René

- Revisar `CROQUIS_LLM_DAILY_BUDGET_USD` en Vercel con las reservas de arriba (fila en «Bloqueado — necesita a René»).

## Auditoría del 2026-11-15 · Tanda 5 (cierre, con U7)

**Estado (2026-11-15):** hecho lo que no depende del build de Unity ni del colaborador. Falta el ensayo del guion de la demo y lo que está en `docs/ESTADO.md`, «Qué falta».

### Qué se hizo

- **README** (I7): el borrador de U7 puesto al día con las Tandas 1 a 4. Las cifras principales van marcadas y las revisa `eval/verificar_cifras.mjs`. Dice que el daño en el 3D está en el código y todavía no en el build publicado. El README anterior a CESVI pasó a `docs/historial/README-v1.md`.
- **`docs/ESTADO.md`** (I9): el estado en dos páginas. `docs/PROGRESS.md` apunta a él.
- **`docs/physics.md` §10–12** (I9): describe el método de hoy, comprobado contra el código: ajuste propio (`lsq.py`), multiarranque, banda del daño, dos hipótesis, hipercubo latino, las tres banderas que faltaban y la tolerancia de paridad vigente.
- **`docs/data.md`:** la tabla del embudo del corpus (671, 668, 664, 459 y 205) y de dónde sale cada denominador de la E-R4.
- **`docs/progress/U.md`:** el estado ya no se contradice.
- **Dos e2e nuevas** (I10; `apps/web/e2e/cesvi-reversa-y-sin-claude.spec.ts`, 13 s entre las dos en local):
  - un vehículo en reversa dice a qué velocidad se supone y de dónde sale el supuesto;
  - si Claude no está disponible, el perito lee el motivo y conserva su narración.

### Medido

- **E8 de nuevo** (`node eval/e8_determinism.mjs` → `eval/results/e8_determinism.json`, 2026-11-15): Chromium 156.0.8078.4, Firefox 157.0 y WebKit 27.2, 2 repeticiones. Resultado del solver idéntico en 14 de 14 escenas; horneado idéntico en 14 de 14. Criterio: cumple. La corrida anterior era del 18 de octubre, con 11 escenas.
- **Tiempo del resultado completo de AXA en el navegador** (`eval/axa_tiempo_navegador.mjs`): 5,232, 5,132 y 5,149 ms; mediana 5,149 ms. La medición de la mañana del mismo día, antes de la Tanda 3 y con otro guion, daba de 9.25 a 9.56 s; no se investigó la causa de la diferencia.

### Lo que se encontró

- **El guion de E8 estaba roto** desde que los recursos del visor pasaron a Blob (ADR 0107): el paquete del horneado leía `process.env` y no cargaba en el navegador. Se arregló el guion (define esas variables vacías y ahora reporta los errores de la página); el trabajo manual `completo.yml` usa el mismo guion.
- **Ningún reporte de los 205 que sirve la app trae una reversa en su expediente:** la lectura de la narración sin conclusiones no dice quién retrocedía (es el «0 de 9» de la E-R4). Por eso la e2e de reversa entra por «Caso nuevo», con la frase que escribiría el perito.

### Pendientes

- Ensayo del guion de la demo.
- `eval/results/laboratorio_axa.json` (e2e manual, antes de la demo).
- Estado por acto de `recorrido-caso.tsx` y `escena-facil.tsx` en hooks con pruebas (I10): no se hizo; el flujo lo protegen las e2e.

## Hallazgo del 2026-11-15 · El caso de ejemplo cambió de cifra con W8, y un mejor ajuste puede quedar fuera de su rango

**Estado:** medido y avisado en pantalla (ADR 0141). Queda una decisión para René.

### Cómo salió

Al comprobar el build nuevo del visor con la e2e del flujo completo (`visor-unity-real.spec.ts`), la cifra del caso de ejemplo con poste ya no era la del 12 de noviembre:

| Fecha                                                             | Lo que mostraba la app                              |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| 12 nov (`eval/results/u6_flujo_unity_produccion.json` de ese día) | A · Jetta 60.62 km/h, rango lineal 55.29–65.95      |
| 15 nov, producción                                                | B · Camaro 102 km/h, rango 72–99; A · Jetta 40 km/h |

### Qué cambio la movió

`eval/caso_poste_historia.mts` corre **la misma escena** (la que la app publicada le manda a su solver, `eval/results/caso_poste_escena.json`) con el solver de cuatro fechas. Resultado en `eval/results/caso_poste_historia.json`:

| Solver                                   | A · Jetta                   | B · Camaro            |
| ---------------------------------------- | --------------------------- | --------------------- |
| 12 nov, antes de W8 (`972a7260`)         | 60.62 (55.29–65.95, lineal) | 0 (0–6.10, lineal)    |
| 14 nov, tras W8 (`84c9d559`, ADR 0135)   | 40.40 (9.84–42.67)          | 102.07 (69.91–100.31) |
| 15 nov, antes de la Tanda 3 (`588a69b8`) | 40.40 (9.84–42.67)          | 102.07 (69.91–100.31) |
| Hoy, con los supuestos del impacto fijos | 40.40 (9.84–42.67)          | 102.07 (69.91–100.31) |
| Hoy                                      | 40.40 (9.11–39.69)          | 102.07 (71.68–99.05)  |

- **La cifra cambió con W8** (#215, ADR 0135): antes el solver ajustaba libremente los rumbos de llegada (70° y −16°) y encontraba a A en 60.62 con B detenido; desde W8, un rumbo que la evidencia no fija vuelve al que se colocó en el mapa, y la solución es otra.
- **La Tanda 3 no movió el mejor ajuste;** solo estrechó un poco los rangos.
- **El caso no cuadra bien con ninguna solución:** residuos de hasta 6.9 σ (7.5 antes de W8) y dos modos casi empatados (costo 19.0 y 20.35). Es un caso armado con toques de prueba, no un caso real; las posiciones finales que pone la prueba no se alcanzan.
- **En W8 no se reportó este caso** porque no está entre las referencias que se comparan (AXA, las 14 escenas canónicas, la E-R4 y las carambolas).

### Qué se hizo

- **El aviso** (ADR 0141): `packages/cesvi/src/mejor-fuera.ts`. Si el mejor ajuste queda más de 0.5 km/h fuera del p10–p90, va un límite con las dos cifras (pantalla y dictamen) y una nota junto a la cifra. Ningún número cambia.
- **Pruebas:** `mejor-fuera.test.ts` (incluye que AXA queda dentro) y `hoja-reconstruccion.test.tsx`.
- **Conteo** (`eval/mejor_fuera.mts` → `eval/results/mejor_fuera.json`): en los 205 reportes de la prueba, reconstruidos solo con su narración, ninguno tiene rango, así que el aviso no aparece ahí. Tardó 69 s.
- **La e2e con el Unity local** (`visor-unity-real.spec.ts`) no servía `StreamingAssets`, donde van los cielos desde U6: en modo local Unity caía al visor ligero. Se agregó la ruta. Contra Blob y contra producción la prueba pasa (52 s y 51 s).

### Decisión de René (2026-11-15) y lo medido

René pidió ofrecer la segunda solución como alternativa, como las dos hipótesis de AXA, solo si es físicamente válida y cuadra con la evidencia; si no, se queda el aviso. Medido con `eval/caso_poste_modos.mts` (`eval/results/caso_poste_modos.json`):

| Solución   | A · Jetta | B · Camaro | Impactos que ocurren                      | Residuo mayor               | Físicamente válida | Cuadra (≤ 3 σ) |
| ---------- | --------- | ---------- | ----------------------------------------- | --------------------------- | ------------------ | -------------- |
| La elegida | 40.40     | 102.07     | los 2 (entre vehículos y contra el poste) | 6.88 σ                      | sí                 | no             |
| La segunda | 33.73     | 27.10      | 1 (el Camaro ya no llega al poste)        | 6.69 σ (el punto del poste) | no                 | no             |

**Resultado:** la segunda no cumple; se queda el aviso. Antes y después, la pantalla es la misma: no hay nada que aprobar. No se agregó la regla general al solver: hoy ningún caso medido la activaría (AXA queda dentro de su rango; los 205 reportes no tienen rango), y agregarla toca el solver y su paridad antes de la demo. Si aparece un caso real que la necesite, se agrega con su antes y después.

### Lo que se le preguntó a René

1. **¿Te parece bien el aviso,** o prefieres que en estos casos se muestre la segunda solución como alternativa (hoy solo se ofrece si su costo queda a menos de 0.5 de la primera)? Lo segundo cambia lo que ve el perito.
2. **El caso de ejemplo con poste ya no da 60.62.** Si esa cifra se usó en alguna demo con CESVI, conviene saberlo antes de la siguiente.

## Carambolas medidas otra vez (2026-11-15; aprobado por René el mismo día)

- **Cifras:** en la prueba ocurren 20 de 31 impactos posteriores (antes decía 21 de 31); en desarrollo, 40 de 55 (antes 43 de 55). Las reconstruidas y en 3D no cambian (33 de 33 y 68 de 68). Van en el índice único (`carambolas.prueba`, `carambolas.desarrollo`), con las de antes como retiradas.
- **Causa:** el #119 (`c80e10e4`, 2026-10-24, ADR 0089), que deshace en 0.04 s el encimamiento de los contornos después de cada impacto con la caja sin deformar. En una carambola sin posiciones del perito, los vehículos de los impactos posteriores van en la trayectoria del que los golpea (supuesto); separar antes los contornos cambia si esa trayectoria los alcanza. Búsqueda binaria con el código de cada commit en su propio worktree e instalación: `412bf43e` y `25df0592` dan 21; `c80e10e4`, `1a5d5391` y `80df35f4` dan 20, con los mismos cinco casos (pierden su impacto posterior `3fb401796c`, `5becbd0fbb` y `cade1c89cb`; lo ganan `d646b64594` y `e9aed4ab5b`).
- **Por qué no se vio antes:** los archivos oficiales no se regeneraban desde el 2026-10-23; las comparaciones de W8 y de la Tanda 3 usaban sus propias copias en `eval/results/w8/`, que ya daban 20.
- **Medido en:** la corrida del colaborador del 2026-11-15 (`resultados/t3-2026-11-15`, RTX).

## W9 · T6.5: las relecturas de R12b, grabadas y medidas (2026-11-15)

**Estado:** hecho. T6.6 quedó medida y descartada (sección siguiente).

### Qué se hizo

- **La relectura ya no puede ser la misma petición.** La pizarra pedía releer cuando había números que no estaban escritos en su cita, pero solo le mandaba al Lector las citas no encontradas; si no había ninguna, la relectura era idéntica a la primera lectura. Ahora le dice también qué números se descartaron (`rechazosParaReleer`, `pizarra.ts`; `mensajeEscena`, `escena-narracion.ts`). Viajan en la misma lista que las citas, con su prefijo: el contrato de `/api/cesvi/escena` no cambia.
- **Grabadas:** las 12 relecturas que pide la E-R4 (2 de la prueba y 10 de desarrollo), en `data/cesvi/r4/relecturas-v2.jsonl`, con `eval/cesvi_r4_reproduccion.mts relecturas <tope> <partición>`, que no llama a la API si lo gastado más lo que puede costar la llamada pasa del tope. Costo real: 0.1845 USD.
- **La regla para usar una relectura cambió.** Antes se usaba si rechazaba menos datos; las relecturas rechazaban menos porque traían menos datos (perdían las caras de contacto). Ahora se usa solo si rechaza menos **y** no trae menos datos verificados.

### Medido (`eval/results/w9_relecturas.json`)

|                  | Regla de antes                                                                                                                     | Regla nueva    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Prueba (205)     | cambian 2 narraciones y 19 cifras; la modalidad contra la etiqueta baja de 80 a 79 de 190 (se pierde un «alcance» que estaba bien) | ninguna cambia |
| Desarrollo (459) | cambian 5 narraciones; 453 → 455 escenas válidas                                                                                   | ninguna cambia |

Con la regla nueva ninguna de las 12 relecturas se usa: todas traían menos datos verificados que la primera lectura. Ninguna cifra que ve CESVI cambia.

### Gasto de W9 (`eval/results/w9_gasto.json`)

0.538 USD de 20: las 12 relecturas (0.1845 USD, costo real de la API) y las 5 lecturas de la auditoría por la ruta de producción (0.3535 USD, estimadas con el máximo medido de una lectura porque su costo real no se registró).

### T6.6 y el corpus con el redactor nuevo: para René

- **T6.6:** los prompts del corpus (`SISTEMA_CORPUS`, 13 veces) y de la narración (`SISTEMA_NARRACION`, 11 veces) dicen «dictamen» donde CESVI dice «reporte». Son los prompts que usa en vivo la importación de un reporte.
- **Releer el corpus** con ese cambio y con el redactor nuevo (que ya no borra las cifras) cuesta, por lotes, unos 14.4 USD la lectura completa de los 671 reportes y 10.1 USD la de narraciones: 24.5 USD, más que lo que queda del tope (19.46 USD).
- **Lo que sí cabe:** solo la prueba congelada (205 reportes: unos 7.5 USD) y volver a leer sus narraciones a escena (unos 2.6 USD), en total unos 10.1 USD. Mueve cifras de la E-R4 que ve CESVI: va con su antes y después antes de fusionar.
- **Lo más barato:** cambiar solo la palabra en los prompts y medirlo en 20 reportes de la prueba (menos de 1 USD), sin rehacer el corpus.

## W9 · T6.6 (a): «reporte» en vez de «dictamen» en los prompts, medido (2026-11-15)

**Estado:** hecho. **(a) no mejora**, así que no se hace (b), como pidió René («si (a) no mejora, no hagas (b) y anótalo»). (c) no se hace. Los prompts de la app no cambian (siguen `corpus-cesvi-v4` y `narracion-cesvi-v1`); la variante con «reporte» vive solo en el script, para repetir la medición.

### Cómo se midió (`eval/t6_6_reporte.mts` → `eval/results/t6_6_reporte.json`)

- **El «antes»** son las lecturas guardadas con los prompts vigentes (con «dictamen»), del mismo modelo: no se pagaron otra vez. **El «después»** se leyó por lotes con los mismos prompts cambiando solo la palabra (también el encabezado «Reporte:»), sobre el mismo texto de entrada. Las dos se convierten con el código de hoy.
- **18 reportes, no 20:** con la entrada contada exacta, las 40 lecturas nuevas salían en unos 1.07 USD, más que el tope de 1 USD. Se mandaron por tandas con un candado (no se manda si lo gastado más lo estimado pasa de 1 USD): 10 y luego 8; los 2 últimos no cupieron. Son los 18 reportes que ya tenían lectura con el prompt vigente, primero los de la prueba congelada: 14 de la prueba y 4 de desarrollo (en la prueba solo hay 14 con esa lectura).
- **Costo real:** 0.8686 USD (0.4791 + 0.3895). Gasto de W9: 1.4066 de 20 USD.

### Medido (suma de los 18)

|                                                  | Con «dictamen» | Con «reporte» |
| ------------------------------------------------ | -------------- | ------------- |
| Corpus: datos                                    | 837            | 827           |
| Corpus: citas que no están en el reporte         | 13 de 464      | 7 de 457      |
| Corpus: números que no están escritos en su cita | 61 de 187      | 43 de 160     |
| Corpus: números verificados                      | 126            | 117           |
| Narración: citas que no están en el reporte      | 6 de 90        | 7 de 94       |
| Narración: velocidades que no están en su cita   | 3 de 18        | 4 de 22       |
| Narración: fugas de conclusiones                 | 0              | 0             |

- **Por reporte**, con la regla de T6.5 (mejor si rechaza menos y no trae menos números verificados): 6 mejores, 6 iguales y 6 peores.
- **Por qué no mejora:** rechaza menos porque trae menos números (160 contra 187), y trae 9 números verificados menos. La narración queda igual o un poco peor. Con una lectura por lado, el reparto 6 / 6 / 6 no se distingue del ruido del modelo.

## Ronda 4 · el humo de la t5b: Tollocan se queda en «calculando» (2026-11-20)

**Lo que mostró la t5b** (`resultados/t5b-repeticion-2026-11-20`, `tanda-03-humo.log`): AXA llega de La escena nueva al 3D de Unity; Tollocan (`data/cesvi/casos/tollocan-rene.croquis`) pasa de «arrancando» a «calculando» y, en 90 s, Playwright solo pudo leer la página 6 veces (todas en los primeros ~3 s). Al final ya no estaba `visor-unity`: a los 90 s sin «cargado», la web abrió el visor ligero.

**Lo que se sabe (sin Unity en la laptop):**

- Lo que Tollocan trae y AXA no es el escenario del mapa en vivo. AXA trae sus calles guardadas; los ejemplos corren con `sinRed`; Tollocan toma las calles y objetos de OpenStreetMap o de las teselas.
- Con lo de OpenStreetMap alrededor del impacto (`data/osm/tollocan_rene.overpass.json`, ODbL; Overpass rechazó la consulta automática y se usó la API principal), el paquete caso-3d de Tollocan tiene 38 vías, 620 lotes, 265 árboles y una calzada de 10 952 vértices. Pesa 622 KB y se arma en 1.3 s en node (`paquete-tollocan.test.ts`). El de AXA, en la misma prueba sin calles, 108 lotes en 28 ms. Ningún valor raro (NaN, lotes enormes, pisos absurdos).
- En WebGL, Unity corre en el hilo de la página: armar ese escenario es lo que más probablemente la trabó. **No está probado**: el humo nuevo lo confirma o lo descarta.

**Lo que se hizo** (commit `fd5b20ff`):

- Ninguna espera del 3D sin tope: el cálculo de la escena, 60 s; la confirmación de Unity, 45 s (antes 90); el relieve, 20 s. Pasado el tope, el visor ligero dice por qué, visible.
- Modo diagnóstico (`__croquisDiagnostico`): cada paso del visor y el paquete exacto que recibe Unity, en la consola.
- El humo (`e2e/humo-3d.spec.ts`): AXA, Tollocan y el ejemplo «Crucero de noche». Cada uno deja en `eval/results/humo/` su consola (con el log de Unity), el paquete 3D, una captura y su fila en `resumen.jsonl`; la traza, en `apps/web/test-results/`. Si Tollocan no llega, se repite sin el mapa en vivo.
- La t5b sube esas dos carpetas en el paso del humo; su tope pasa de 3 a 6 min (tres casos y la repetición).

**Siguiente paso:** con el resultado del humo, si Tollocan sin el mapa en vivo sí llega, el arreglo es armar en Unity el escenario por partes, unos cuadros a la vez, o ponerle un presupuesto. El presupuesto toca alta y ultra: se le pregunta a René antes.

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

### 2026-11-21 — Tabla de cifras de la ronda 4 para el visto bueno de René (#284)

- Medida sin navegador (`apps/web/src/lib/cifras-ronda4.test.ts`), producción 3257fa9f contra el #284: `eval/results/ronda4_cifras/{antes,despues}.json`. AXA sigue en 57 (55–78).
- Integrado al #284: masa por ficha del modelo (feat/w-velocidades-via) y 10 fichas más con su URL (`data/vehicles/masas_extra.json`); «VW» y «GM» como marcas.
- Bugs encontrados y corregidos: el aviso «casi no transfiere energía» leía la corrida de arranque (40 y 40 km/h) y salía en AXA y en el alcance; la receta del poste («el 3» no coincidía con «Mazda 3»), que movía la cifra publicada del poste.
- Buscador: cruce de dos vías con su geometría; si nada cuadra, pregunta (nunca el centro del municipio). 23 frases: `eval/results/ronda4_lugar_sentido_local.json`.
- Unity, lo narrado en el 3D: 5 de 7 (`eval/results/unity_narraciones/`); faltan la barrera de la bajada (sale «otro») y la curva (#286).
- Pendiente: visto bueno de René; si el #284 se fusiona sin medir carambolas, «91 de 156» y cobertura (dependen de masa y velocidad); el 66 del alcance en el navegador de la t5c no se reproduce sin navegador: la t6 guarda el .croquis de cada ejemplo.
