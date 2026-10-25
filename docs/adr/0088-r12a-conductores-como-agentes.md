# ADR 0088 — R12a: los conductores como agentes

- **Estado:** aceptado (2026-10-24). Desarrolla la parte R12a del ADR 0084.
- **Contexto:**
  - **El solver reconstruye hacia atrás:** de la evidencia (posiciones, huellas, daños) saca dónde estaba cada vehículo, a qué velocidad y desde dónde frenó, con el impacto en t = 0. Nadie «decide» nada: el frenado sale de la evidencia o de un supuesto.
  - **Lo que pide PLAN-CESVI R12a:**
    - que cada conductor perciba, decida y actúe;
    - que el perito pruebe hipótesis («¿y si V2 frenaba 0.5 s antes?»);
    - que en una carambola cada conductor reaccione a los demás;
    - en Python y en TS, con paridad y semilla.

## Decisión

### 1. Qué simula y desde dónde

- **Una simulación hacia adelante** que empieza donde empieza la reconstrucción (t = −t_pre):
  - cada vehículo en movimiento es un agente sobre **su misma trayectoria** (recta, vuelta, cambio de carril) y con su velocidad en ese instante;
  - avanza con **paso fijo** (0.02 s, el de la reconstrucción) hasta que dos vehículos se tocan o hasta 3 s después del impacto reconstruido.
- **Con las decisiones de la reconstrucción** (frenar donde la reconstrucción frena), la simulación debe dar el mismo impacto. Es la prueba de consistencia de que los agentes no inventan otra física.
- **Con una hipótesis del perito,** da lo que cambia:
  - si hay contacto, cuándo, entre quiénes y a qué velocidades;
  - si no hay, la distancia mínima a la que quedaron.

### 2. Percibir → decidir → actuar, en cada paso

- **Percibir:**
  - cada agente mira el estado del **inicio del paso**: todos perciben lo mismo y actúan a la vez, así que el orden en que se recorren (por id) no cambia nada;
  - percibe al **vehículo de adelante:** el más cercano en su sentido de marcha cuyo ancho se traslapa con el suyo;
  - **lo ve** si la línea de vista no la tapa nada y está dentro de la visibilidad del clima (`visibility.py`, la misma geometría que el resto del solver). De noche, un vehículo con luces se ve; las luces de freno, también.
- **Decidir:**
  1. **lo que diga el perito** (`conductor.decision` en `conductor.instante_decision`);
  2. si el perito no dice nada, **lo que reconstruyó la evidencia:** frenar en el instante en que la reconstrucción empieza a frenar;
  3. **reaccionar:** si el de adelante empieza a frenar y el agente lo ve, frena cuando pasa su tiempo de reacción. Si ya tenía una decisión antes, se queda con la primera.
- **Actuar:**
  - **frenar** es desacelerar con lo que da la fricción (`braking_deceleration`, la misma de la reconstrucción, con ABS y pendiente);
  - **volantear** es desplazarse de lado un carril con la aceleración lateral que da la fricción (μ·g): la mitad del desplazamiento acelerando y la mitad frenando el movimiento lateral, sin frenar a la vez (toda la fricción va al lado);
  - **seguir** es mantener la velocidad.

### 3. El contrato (2.2.0)

- **`vehiculos[].conductor`, opcional:**
  - `tiempo_reaccion`: `CampoTiempo`, con fuente y rango como cualquier dato;
  - `decision`: `frenar`, `volantear_izquierda`, `volantear_derecha` o `seguir`, con fuente;
  - `instante_decision`: `CampoTiempo`, respecto del impacto reconstruido (negativo es antes).
- **Si nadie lo trae,** el resultado no cambia: el bloque `agentes` solo aparece cuando algún vehículo tiene `conductor`. Las escenas canónicas, sus resultados y el corpus de R4 dan lo mismo.
- **La migración de 2.1.0 a 2.2.0 no cambia los documentos.** Las escenas congeladas de Relatos-MX se validan después de migrar, como en 2.1.0. (El contrato iba a ser 2.1.0, pero esa versión la tomó el perfil de aplastamiento de ADR 0091.)

### 4. Los valores, con fuente

- **El tiempo de reacción por omisión** es el de percepción-reacción que el solver ya usa: 1.1 s, en un rango de 0.7 a 1.5 s (`solver/croquis_solver/data/friction.json`: Olson y Sivak 1986; Green 2000). Va como supuesto, con su rango.
- **El carril** que recorre un volantazo es el ancho de carril de la escena.
- **Ningún otro valor nuevo.**

### 5. Reproducible

- **Determinista:** paso fijo, estado del inicio del paso y orden por id.
- **Semilla:** el único azar es la sensibilidad al tiempo de reacción; se muestrea en su rango con la semilla de la escena (`meta.semilla`) y el generador que ya replica el port TS (`pyrandom`).
- **Python es la referencia y el port TS lo sigue,** con pruebas de paridad sobre escenas de hipótesis versionadas en `packages/scene-schema/fixtures/agentes/`.

## Resultados (`eval/r12a_agentes.py` → `eval/results/r12a_agentes.json`)

Cada escena de hipótesis contra la reconstrucción sin hipótesis (la línea base). Python y TS dan el mismo bloque `agentes` en las cuatro (`packages/solver-ts/src/agents.test.ts`).

| Escena                                         | Hipótesis                                                         | Línea base             | Qué muestra                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `axa_agentes` (AXA A2010930, reporte de CESVI) | contacto en t = 0.00 s, 39.82 km/h relativa                       | igual                  | sin hipótesis, los agentes reproducen la reconstrucción                                             |
| `alcance_frena_antes`                          | contacto en t = +0.29 s, 24.51 km/h relativa                      | t = 0.00 s, 38.51 km/h | frenar 0.5 s antes llega más tarde y 14.00 km/h más lento (−36.36 %)                                |
| `alcance_volantea`                             | contacto en t = −0.08 s, 50.99 km/h relativa                      | t = 0.00 s, 38.51 km/h | volantear sin frenar no pierde velocidad: el contacto es 12.48 km/h más rápido (+32.40 %)           |
| `carambola_cadena`                             | A contra B en t = −0.59 s, 24.38 km/h relativa (A 50.00, B 25.62) | t = 0.00 s, 10.00 km/h | C frena en −2.5 s; B lo ve y frena en −1.4 s; A ve a B y frenaría en −0.3 s, pero alcanza a B antes |

- **En la carambola, la reacción en cadena empeora el choque de atrás:** B frena con fuerza y A todavía no reacciona. Con el tiempo de reacción de A y B muestreado en su rango (64 muestras, semilla de la escena), la velocidad relativa va de 21.81 a 25.78 km/h (p10–p90), y en todas las muestras hay contacto.
- **El tiempo de reacción** de B y A es el supuesto típico (1.1 s, de 0.7 a 1.5 s), porque la escena no lo trae.

## Consecuencias

- **El perito** puede probar una hipótesis cambiando un dato de un conductor, y ver el resultado con su número: el contacto y sus velocidades, o que no hubo contacto.
- **La simulación de agentes no reemplaza la reconstrucción:** la acompaña. El daño, el después del impacto y el reposo siguen siendo los de la reconstrucción. Lo que cambia con una hipótesis es el contacto.
- **Límites:**
  - el volantazo es un cambio de carril idealizado (no hay modelo de llanta ni de estabilidad);
  - la reacción solo es a las luces de freno del de adelante. Un peatón que aparece o un vehículo que cruza se dejan para cuando haga falta (R12b o después).
