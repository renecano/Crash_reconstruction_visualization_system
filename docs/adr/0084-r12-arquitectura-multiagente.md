# ADR 0084 — R12: arquitectura multiagente reproducible

- **Estado:** propuesto (2026-10-23). Se empieza después de R11 (PLAN-CESVI R12).
- **Contexto:**
  - **El solver** reconstruye desde la evidencia (posiciones, huellas, daños), pero no modela qué hizo cada conductor antes del impacto. Probar «¿y si V2 frenaba 0.5 s antes?» hoy obliga al perito a cambiar datos a mano.
  - **Los módulos** (lectura con IA, validación, solver, método de CESVI, comparación, dictamen) van en una cadena fija. Ninguno puede rechazar un dato y pedir que se relea, ni pedir evidencia cuando la física no cuadra: eso lo hace el perito.

## Decisión

### R12a · Los conductores como agentes

1. **Por qué agentes:**
   - lo que decide un conductor depende de lo que percibe (visibilidad, luz, clima, los otros vehículos) y de su tiempo de reacción;
   - en una carambola, cada uno reacciona a lo que hacen los demás;
   - un modelo por agente expresa eso directamente, y una hipótesis del perito es cambiar un dato de un agente.
2. **Cada paso de tiempo:** percibir → decidir → actuar.
   - **Actuar** es frenar o volantear dentro de lo que permiten la fricción y el vehículo. La física sigue siendo la del solver.
   - **Decidir** usa reglas explícitas con parámetros que tienen fuente y rango, como cualquier dato del contrato. Los valores (tiempos de reacción, distancias de visibilidad) salen de fuentes registradas en `data/SOURCES.md`; ninguno se inventa.
3. **Cómo se mantiene reproducible:**
   - el paso de tiempo es fijo;
   - todos los agentes perciben el estado del inicio del paso y actúan a la vez, así que el orden no cambia el resultado (aun así, se recorren por id);
   - lo aleatorio (un tiempo de reacción muestreado en su rango para ver la sensibilidad) recibe semilla explícita;
   - va en el solver Python de referencia y en el port TS, con pruebas de paridad como hoy.

### R12b · Agentes especialistas con pizarra

1. **Por qué pizarra (blackboard):**
   - el expediente ya es el estado compartido, y cada dato lleva su fuente;
   - los especialistas actúan cuando aparece algo que les toca, en vez de esperar su turno en una cadena;
   - así se expresan la vuelta atrás (releer, preguntar) y los casos que no siguen el orden de siempre.
2. **El coordinador es código, no un LLM:**
   - en cada ciclo junta a los agentes cuyo disparador coincide con lo nuevo en la pizarra y los corre en un orden fijo de prioridad;
   - aplica sus entradas y mensajes, y repite hasta que nadie tiene nada que hacer;
   - los ciclos tienen tope, y cada dato tiene un máximo de relecturas, para que dos agentes no se reboten sin fin.
   - Que un LLM decida quién actúa se descarta: no sería determinista ni se podría auditar.
3. **La bitácora:**
   - cada mensaje lleva el ciclo, el agente, el tipo (propone, rechaza, pide) y los datos a los que se refiere;
   - va en la trazabilidad del dictamen, para que el perito vea por qué un dato se rechazó o se preguntó.
4. **Cómo se mantiene reproducible:**
   - las mismas entradas y las mismas respuestas del LLM dan la misma bitácora y el mismo dictamen;
   - la bitácora guarda la huella de cada respuesta del LLM, así un caso se puede volver a correr;
   - CI usa respuestas grabadas, como hoy.
5. **La IA no produce números físicos finales:**
   - el Lector y el Preguntador traducen lenguaje;
   - todo lo que proponen pasa por el Verificador de citas y el Validador;
   - solo el Físico y el Verificador CESVI calculan.

## Mientras tanto (hasta R12)

Lo que se construya no debe estorbar a R12:

- módulos con entradas y salidas explícitas, sin estado global;
- los datos del expediente con su fuente;
- todo lo aleatorio con semilla;
- el solver sin depender del orden de los vehículos.

## Consecuencias

- **R12a cambia el solver y el contrato:** paridad, regeneración de Zod y Pydantic, y la evaluación de R4 antes y después.
- **R12b reorganiza módulos que ya funcionan:** el criterio es que el corpus de R4 dé los mismos números (o mejores, medidos en `eval/`).
- **En producción todo corre en TS** (Vercel o el navegador), como hoy. Python queda como referencia.
