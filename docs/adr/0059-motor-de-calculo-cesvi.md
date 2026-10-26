# ADR 0059 — Motor de cálculo de CESVI y su reproducción (E-C1)

- **Estado:** aceptado (2026-10-21).
- **Contexto:** C1 de `docs/cesvi/PLAN-CESVI.md`. El prototipo ya tenía McHenry de 2, 4 y 6 medidas, EBS, velocidad por desplazamiento y la comparación de velocidades (`metodo.ts`, ADR 0048).
  - **Lo que pide el plan:** cada método que aparece en el corpus, con su fórmula sustituida, sus unidades y su fuente.
  - **Rigidez:** la del dictamen, la de la tabla de CESVI o la de NHTSA marcada como tal.
  - **E-C1:** recalcular todo dictamen que imprime entradas y resultado, sin ajustes.

## Decisión

### Qué métodos entran

Entran los que usan los dictámenes, no una lista de libro. Se ubicaron leyendo los 53 dictámenes que imprimen cálculos (abajo).

- **`calculos.ts`, una función por fórmula impresa:**
  - **Frenado y derrape:**
    - frenado por huellas √(Vf² + 2·μ·g·d);
    - derrape con fricción equivalente μ' = μ·Σ sen θ/n;
    - frenado con arrastre, cuando solo frena parte de la masa: √(2·μ·g·d·m_frena/m_total).
  - **Curva:**
    - velocidad crítica en curva en las dos formas: la completa, con el denominador 1 − μ·e, y la que imprimen los dictámenes de CESVI, 11.27·√(R·(tan α + μ)), es decir √(g·R·(μ + e)) con g = 9.8;
    - radio por cuerda y flecha, R = C²/8M + M/2;
    - velocidad de vuelco √(g·d·R/h), y fuerza centrípeta.
  - **Caída:** tiro parabólico y tiempo de caída.
  - **Energía:**
    - trabajo de la fricción μ·m·g·d;
    - velocidad por una o varias energías;
    - energía cinética.
  - **Distancias:**
    - de reacción, V·(tr + ta);
    - de frenado, V²/2ag;
    - por energía disipada.
  - **Cantidad de movimiento:** colineal (despeja V1), en el plano (despeja las dos rapideces de entrada) y velocidad común colineal o perpendicular.
  - **Comparación con un umbral o una prueba de choque citada.**
- **Umbrales y pruebas de choque.** Croquis no fija ninguno. `data/cesvi/calculos/referencias.json` guarda los que citan los dictámenes, con los ids que los citan:
  - **Bolsas de aire:** 25 km/h, citado en 5 dictámenes; 20 km/h en 1; 35 km/h en 1.
  - **Pruebas de choque:** la de CESVI a 15 km/h en 6; IIHS a 64.4 km/h en 3; otras en 1 cada una.
  - El perito elige o escribe el suyo (`compararConUmbral`).
- **Rigidez por vehículo** (`rigidez.ts`):
  - **Orden:** perito, dictamen, tabla de CESVI (cuando René la consiga), y la mediana de la clase en E2.
  - **Si la clase no tiene pruebas,** el respaldo genérico de E2 va marcado como «supuesto», no como NHTSA.
  - **Siempre** dice de dónde salió.
- **Fórmulas sustituidas** (`formulas.ts`): frenado, curva, radio, tiro parabólico, trabajo de fricción y cantidad de movimiento, como las de McHenry, EBS y desplazamiento del prototipo.

### E-C1: cómo se reproduce sin ajustar

- **Universo:** 53 dictámenes, los que imprimen una fórmula (raíz, «raíz cuadrada» o «= x km/h | m/s | kJ | J») o tienen en el corpus un cálculo con resultado en velocidad o energía.
  - **De ellos,** 39 tienen cálculos que se pueden transcribir. Los otros 14 solo citan umbrales o pruebas de choque, o comparan daños a ojo.
- **Fichas** (`data/cesvi/calculos/fichas.json`): una por resultado impreso, con la fórmula, cada variable con su valor impreso, el resultado impreso y una cita corta.
  - **Las transcribieron** cuatro agentes de Claude Code con la instrucción de no recalcular ni corregir nada; las erratas se copian.
  - **Claude Code revisó** contra el texto cada ficha que no reproducía. Dos fichas se corrigieron porque copiaban el resultado ya redondeado a entero (64 y 46 km/h), cuando el dictamen imprime antes 64.4 km/h y 12.88 m/s.
- **Cada ficha dice qué función del motor la reproduce y con qué símbolos.**
  - **El mapeo sigue la fórmula impresa,** no la lectura que cuadra.
  - **Únicos factores permitidos:** conversiones de unidades de una lista cerrada (km/h↔m/s, cm, mm, kJ, t, lb) y el paso de grados a tan θ.
  - **Una constante impresa** («11.27», «× 30 %», «× 2») entra como número, con nota.
- **Reproduce** = a 0.5 % o menos del valor impreso.
  - **Si no reproduce,** el motivo es «redondeo» cuando la diferencia cabe en la última cifra impresa.
  - **Si no,** es el que se anota después de leer el texto: errata, fórmula distinta, dato no impreso u otro.
- **Las operaciones aritméticas** (sumas, productos, d/t) se cuentan aparte, para que no inflen la proporción de los métodos.
- **Las fichas de la partición de prueba se miden igual,** y se reportan aparte. Las pruebas unitarias del motor usan solo casos de desarrollo; los dos métodos que solo aparecen en prueba (frenado con arrastre y cantidad de movimiento colineal) se prueban con identidades físicas.

### Resultado (`eval/results/cesvi_reproduccion.json`)

- **Métodos:** 98 de 128 fichas se pudieron recalcular. 79 reproducen dentro de 0.5 % y 19 no.
  - **Por partición:** desarrollo 61 de 75; prueba 18 de 23.
- **Por qué no reproducen las 19:**
  - **Fórmula distinta (7):**
    - 6 en dos dictámenes casi idénticos: cantidad de movimiento en ángulo recto que no da los valores impresos con ninguna agrupación directa;
    - 1 que toma la fila de una tabla de velocidades en lugar de despejar.
  - **Erratas (5):**
    - tan(3) en radianes en lugar de grados (118.2 km/h);
    - dos curvas que imprimen tan α y no lo suman;
    - un radio con 4S² en la fórmula y 2S² en la cuenta;
    - ½·m·V sin el cuadrado.
  - **Redondeo (3):** una de ellas trunca en lugar de redondear.
  - **Otro (3):**
    - la discrepancia de energía del caso A2010930, sin explicar (ADR 0048);
    - dos desplazamientos cuya sustitución está partida en el PDF.
  - **Sin la sustitución (1).**
- **Sin recálculo (30):**
  - 16 por un dato que no se imprime: sobre todo McHenry hecho con un programa o con la fórmula como imagen (sin A, B ni L), y masas que no se escriben en la sustitución;
  - 6 por OCR ilegible;
  - 4 con una fórmula que usa datos que no define (un radio sin unidad que no es el calculado, g en ft/s² y un factor «a» sin definir);
  - 4 comparaciones sin un número que reproducir.
- **Aritmética:** 20 de 20.
- **Hallazgos para CESVI** (van como nota en su ficha):
  - un dictamen compara un momento en N·m contra otro con la masa en kg sin multiplicar por g;
  - otro duplica la velocidad «por la segunda ley de Newton» sin fórmula.

## Consecuencias

- **El motor cubre los métodos del corpus.** Lo que no reproduce está explicado ficha por ficha, sin ajustar nada para que cuadre.
- **La forma de la curva de CESVI (sin denominador) es la que se muestra en un caso de CESVI.** La completa queda disponible y la diferencia se ve en la prueba unitaria.
- **Pruebas en CI:** `packages/cesvi/src/calculos.test.ts`, con casos de desarrollo citados por ficha. E-C1 corre a mano:

  ```
  cd packages/cesvi && pnpm exec tsx ../../eval/cesvi_reproduccion.mts
  ```

- **La rigidez** sale del dictamen o, si no la da, de E2 (la de su clase), como supuesto declarado con su fuente. No se pide la tabla de CESVI: lo que el reporte no trae no existe (René, 2026-10-26; ADR 0091).
