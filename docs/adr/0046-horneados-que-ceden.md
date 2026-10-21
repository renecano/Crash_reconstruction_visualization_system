# ADR 0046 — Horneados que ceden el hilo principal; la precompilación de materiales, descartada

- **Estado:** aceptado (2026-10-20).
- **Contexto:**
  - **El síntoma:** al medir F11a con Lighthouse (celular, CPU 4×), la portada dejaba de responder varios segundos después de cargar, mientras armaba su escena 3D. Lighthouse terminaba algunas corridas con PAGE_HUNG o «Target closed».
  - **El perfil:** dos trabajos largos en una sola tarea cada uno:
    - los horneados con Rapier (restos, ragdolls y volcaduras), que avanzan la simulación en un bucle sin pausas;
    - la construcción de los materiales de nodos de three.js en el primer cuadro.
  - **Lo que no es parte del criterio:** el TBT. Las metas de §11.6 (LCP, CLS, accesibilidad y carga) se cumplen antes de que la escena se arme, y el cuadro fijo de cada capítulo cubre ese tiempo (ADR 0045 §4). Aun así, una página que no responde en un celular es un defecto.

## Decisión

### 1. Los horneados ceden el hilo principal

- **Cómo:** `cedente()` (`packages/viewer/src/ceder.ts`) devuelve una pausa cuando pasaron 8 ms desde la última; los bucles de `bakeDebris`, `bakeRagdoll` y `bakeRollover` la esperan al inicio de cada paso. Usa `scheduler.yield()` si existe y, si no, `setTimeout(0)`.
- **Por qué no cambia nada:** solo cambia cuándo corre cada paso, no qué calcula. Cada horneado tiene su propio mundo de Rapier, así que dos horneados intercalados no se tocan. E8 (determinismo entre navegadores) sigue comparando los resultados.

### 2. La precompilación de materiales se midió y se descartó

- **Lo que se probó:**
  - compilar el grafo de escena con `compileAsync` de three.js (que cede el hilo entre objetos) antes de montarlo, incluyendo lo oculto y lo que la cámara aún no ve;
  - una segunda pasada al llegar los restos, las personas y las texturas.
- **Cómo se midió:** `eval/f11_tareas_largas.mjs`, con la portada en celular y CPU 4×, un navegador nuevo por corrida y las variantes en orden alterno. El interruptor de diagnóstico `__croquisDiag.sinPrecompilar` existió solo para esta comparación, en el commit 9442473.
- **Resultado de la primera pasada** (`eval/results/f11_tareas_largas_precompilacion.json`, mediana de 3 corridas; la segunda pasada no llegó a medirse, ver abajo):

  | Variante        | Tarea más larga             | Bloqueo total | Escena lista |
  | --------------- | --------------------------- | ------------- | ------------ |
  | Precompilada    | 4,602 ms (de 4,377 a 6,671) | 18,827 ms     | 28,486 ms    |
  | Sin precompilar | 5,524 ms (de 5,139 a 8,494) | 17,666 ms     | 24,653 ms    |

- **Lectura:** las corridas de las dos variantes se enciman. La precompilación no reduce el bloqueo total y retrasa la escena. Además, la segunda pasada hizo fallar las pruebas e2e de la portada: después de quedar lista, la escena tenía un cuadro de varios segundos.
- **Decisión:** no se precompila. El código es más simple y no hay evidencia de que sirva.

## Consecuencias

- **Estado final** (`eval/results/f11_tareas_largas.json`, mediana de 3 corridas con la laptop conectada): la escena de la portada queda lista a los 30,247 ms con la CPU 4×. La tarea más larga dura 8,263 ms, hay 4 tareas de más de 1 s y el bloqueo total es de 21,827 ms.
- **Lo que queda, como límite registrado** (ADR 0045, «Límites»):
  - las tareas largas que quedan son la construcción del grafo de escena (en un `useMemo` de React) y los materiales del primer cuadro;
  - reducirlas pide mover la construcción del grafo a un worker o montarlo por partes. Es trabajo del visor, no de la portada, y no cambia ninguna meta de F11a.
- **E6:** el visor cambió solo en los horneados, que corren al cargar y no en cada cuadro. La medición de E6 después de F11a queda en «Bloqueado — necesita a René» de `docs/PROGRESS.md`, porque aquí el sistema cortó la corrida por falta de memoria.
