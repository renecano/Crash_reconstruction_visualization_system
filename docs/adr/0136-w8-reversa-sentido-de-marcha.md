# ADR 0136 · W8 · T3.3: la reversa, con el sentido de marcha aparte del rumbo y de la maniobra

- **Estado:** aceptado (2026-11-14).
- **Fecha:** 2026-11-14
- **Frente:** W (W8, T3.3)
- **Relacionados:** ADR 0069 (R4b: el solver avanza en reversa con el frente en su lugar), ADR 0091 (supuestos declarados y restricción del alcance), ADR 0135 (T3.2).

## Contexto

Desde R4b, el vehículo cuya maniobra es «reversa» retrocede con el frente donde lo dejó el perito y pega con su parte posterior. El diagnóstico de T3.3 (`docs/progress/W.md`, «T3.3 · Diagnóstico»; `eval/results/w8/t3_3_reversa_antes.json`) encontró lo que faltaba, sobre el caso `cesvi-3a0125cb81` armado como en «Caso nuevo»:

1. La velocidad en reversa se suponía igual que hacia adelante: 40 km/h.
2. La inversión aceptaba cualquier velocidad en reversa sin avisar.
3. El contrato no separaba el sentido de marcha de la forma de la maniobra: no se podía retroceder dando vuelta, y la app perdía una de las dos cosas.
4. El resultado no decía quién iba en reversa.
5. Sin posiciones del perito, la disposición genérica ponía al que retrocede alejándose del otro (decisión 6).

En el corpus de CESVI, 52 de 671 reportes traen una reversa (modalidad o maniobra declarada).

## Decisión

### 1. Contrato: `sentido_marcha` (PR #219, aditivo y opcional)

- **Escena:** `vehiculos[].sentido_marcha`, con valor «adelante» o «reversa», fuente y confianza. Es aparte de `posicion_inicial.rumbo_deg` (hacia dónde mira el frente) y de `maniobra` (la forma del recorrido).
- **Expediente:** `maniobras[].sentido_marcha`, para una vuelta o un cambio de carril hechos en reversa.
- **Resultado:** `vehiculos[].sentido_marcha`, que solo va cuando es «reversa».
- `maniobra: "reversa"` sigue valiendo y quiere decir lo mismo que antes: la reversa recta. Un vehículo va en reversa si lo dice `sentido_marcha` o si su maniobra es «reversa».
- Sin subir versión, como en #191 y #194.

### 2. Solver (Python y port TS, con paridad)

- **Cualquier maniobra se puede recorrer en reversa.** La trayectoria se traza en el sentido de marcha (el rumbo del frente más 180°) y se envuelve en `ReversePath`, que ya existía: el vehículo la recorre con la parte posterior por delante.
- **Izquierda y derecha son las del conductor.** Al retroceder con el volante a la izquierda, la parte posterior se abre hacia la izquierda del conductor y el frente gira en sentido horario: es el mismo círculo de una vuelta a la izquierda hacia adelante, recorrido al revés. En el sentido de marcha, eso es una vuelta a la derecha; por eso el lado se invierte al trazar. Vale igual para el cambio de carril y para el aviso de «desvío lateral».
- **En una vía curva, la reversa sigue el carril** en su sentido de marcha, como ya lo hacía un vehículo que avanza. En una glorieta no: el carril tiene un solo sentido y el que retrocede va contra él, así que vale la geometría literal de la maniobra.
- **El resultado dice el sentido de marcha** del vehículo que llegó al impacto en reversa. Los demás resultados quedan byte por byte como estaban.
- **El alcance** (frente contra parte posterior) sigue sin aplicar su restricción de velocidades cuando alguno de los dos va en reversa, ahora con cualquiera de las dos formas de decirlo.
- **Lo que no cambia:** el choque, el daño, el movimiento posterior y la inversión. La reversa recta de antes da la misma trayectoria.

### 3. La velocidad en reversa que no dio el perito es un supuesto con fuente

- **Fuente:** NHTSA, DOT HS 811 024 (Mazzae, Barickman, Baldwin y Ranney, 2008), «On-Road Study of Drivers' Use of Rearview Video Systems»: 6 145 maniobras de reversa en uso real de 37 conductores. La tabla 10 da los cuantiles de la velocidad máxima de cada maniobra (6 037 maniobras). Registrada en `data/SOURCES.md`; los valores, en `packages/cesvi/src/data/reversa-nhtsa.json`.
- **Valor:** la mediana, 3.532 mph (5.68 km/h), con el p10–p90 como rango: 1.899 a 5.633 mph (3.06 a 9.07 km/h). El Monte Carlo sortea dentro de ese rango.
- **Por qué la velocidad máxima de la maniobra y no la media:** el choque interrumpe la maniobra en algún punto, y la máxima es la cota de lo que el conductor alcanza al retroceder. Es coherente con lo que supone el propio CESVI: 10 km/h en `cesvi-73aef4cf09`, que cae en el p95 de la tabla (6.275 mph, 10.10 km/h).
- **Dónde se aplica:** en `especDeExpediente` (el flujo de CESVI), solo si la velocidad no la dio el perito ni el relato. Va como `fuente: supuesto`, con la fuente en la nota, y aparece en los límites que lee el perito.
- **No se toca `buildSpec`** (el flujo de relatos de la v1 y sus evaluaciones congeladas): ahí un vehículo en reversa sin velocidad sigue con el valor por omisión. Queda en «Endurecimiento pendiente».

### 4. Aviso, no límite, cuando la reversa sale más rápida que lo medido

- La inversión sigue buscando la velocidad en todo su rango. Si la del vehículo en reversa (la que estima la evidencia o la que dio el perito) pasa de la maniobra más rápida de la tabla, 14.291 mph (23.00 km/h), la app lo dice en los límites: «conviene revisar el sentido de marcha y las posiciones finales».
- **Por qué no un límite de búsqueda:** 23 km/h es lo más rápido que se observó en uso normal, no lo más rápido que un vehículo puede retroceder. Un tope duro escondería justo el caso que le importa al perito: una evidencia que no cabe con una reversa. Es el razonamiento del dictamen A2010930, donde CESVI concluye que fue un alcance y no una reversa.
- **Por qué en la app y no en el solver:** es un criterio de plausibilidad para el perito, no física. Así no cambia el contrato de las inconsistencias ni la paridad.

### 5. La lectura lo marca sin cambiar el prompt

- El prompt de la narración ya deja poner varias filas de maniobra por vehículo. Si un vehículo trae «reversa» y una vuelta o un cambio de carril, o una vuelta cuya cita dice que iba en reversa, la maniobra queda con su forma y `sentido_marcha: "reversa"`.
- No se cambia el prompt ni se vuelve a leer nada: no se gasta API y las lecturas grabadas siguen valiendo.
- En la escena, de quien retrocede cuenta la forma (recta o vuelta) y no que antes estuviera detenido.

### 6. Sin posiciones del perito, quien retrocede llega de espaldas al otro

La medición sobre los reportes de CESVI (`eval/cesvi_r4_reversa.mts`) encontró un defecto que el caso de Yecapixtla no enseñaba: la disposición genérica, que se usa mientras el perito no coloca a los vehículos, supone que todos avanzan. Con alguien en reversa, casi siempre se alejaba del otro vehículo y el «choque» quedaba como el acercamiento máximo, a decenas de metros.

- **Caras de contacto supuestas.** Con alguien en reversa, si la narración no da las caras de contacto: quien retrocede toca con su parte posterior (salvo que sus daños estén solo en otra cara) y el otro, con la cara de su primer daño. Va en los límites que lee el perito.
- **Se voltea al que se aleja.** Si, retrocediendo, el vehículo se alejaría del otro (o del objeto), se le da la vuelta: queda en el mismo lugar y hace el mismo recorrido, con la parte posterior por delante. Su posición queda marcada como supuesto.
- Solo aplica sin posiciones del perito y con alguien en reversa. Con posiciones, manda lo que colocó el perito (R4b). Sin reversa, la disposición genérica no cambia.

### 7. La versión declarada

- La versión que declara un conductor (R7) lleva su propio sentido de marcha: si declara una reversa, va en reversa; si declara otra maniobra, no hereda la reversa de la evidencia.
- **Una reversa declarada sin velocidad va a la velocidad medida de una reversa** (5.68 km/h, de 3.06 a 9.07; la misma fuente de la decisión 3), no a la de la reconstrucción de ese vehículo. Decisión de René del 2026-11-15, con el antes y el después medidos en AXA, donde el conductor de A declara una reversa (`eval/results/w8/reversa_declarada_antes.json` contra `eval/results/w8_reversa_declarada.json`): la velocidad de A en la versión declarada pasa de 15 a 5.68 km/h y la de cierre, de 71.9 a 62.58 km/h; ninguna fila de «Qué cambia entre versiones» cambia de estado y la sugerencia es la misma. La reconstrucción física no se toca: AXA sigue en 56.87 km/h (54.79–78.39) en 20 semillas (`eval/results/w8/declarada/axa_rango_estable.json`). Si el conductor declara una velocidad, se usa la suya.

## Límites

- **El vehículo en reversa llega a velocidad constante.** No se modela el arranque desde detenido, así que los metros de reversa que diga la narración no cambian la velocidad. Queda en «Endurecimiento pendiente».
- **La fuente es de Estados Unidos**, con conductores en sus propios trayectos (cocheras, entradas y cajones). No hay una medición mexicana equivalente; se declara como supuesto.
- **En la E-R4, la modalidad «reversa» sigue sin poder identificarse** con la narración de R0, que no trae la dinámica (ADR 0069). Lo que se mide ahora es otra cosa: dado quién retrocede según el propio reporte, si Croquis reconstruye la reversa.
