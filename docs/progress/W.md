# Bitácora del frente W · Web y física

Plan: `docs/cesvi/PLAN-CESVI.md` §3.4. Reglas: `CLAUDE.md`. ADR del bloque 0130–0169.

## Estado

- **Desde el 2026-11-09, el Claude Code de René lleva también este frente,** porque aquí no se había subido nada. Si eres el Claude Code del compañero: antes de empezar una fase, revisa la tabla de abajo y `git fetch`; si la fase ya está tomada, sigue con la siguiente y anótala aquí.
- **Hechas:** W1 (#187), W2 (#188), W3 (#192), W4 (#195, con su contrato #194), W4b (#196), W5 (#199, #200), W6 (#201) y W7 (#206), en `main`.
- **Fase actual:** W8 (T3.2, T3.3 y T3.5), en Opus por pedido de René (2026-11-12), con cuidado extra.
- **Siguiente paso:** T3.2 implementado según el ADR 0135 pero **detenido**: dos escenas de referencia empeoran sin razón física por dos huecos del criterio; espera que René apruebe el ajuste del criterio (ver «T3.2 · Primera implementación (ADR 0135) y alto»).

## Fases tomadas

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
| W8 · Números defendibles (T3.2, T3.3, T3.5)                  | Claude Code de René | `feat/w8-numeros`                        | Diagnóstico de T3.2    |

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
