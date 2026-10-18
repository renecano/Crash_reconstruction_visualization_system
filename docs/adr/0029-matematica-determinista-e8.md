# ADR 0029 — Matemática determinista para E8: el mismo resultado en cualquier navegador (F9)

- **Estado:** aceptado (2026-10-17)
- **Criterio (PLAN §8, E8):** misma escena y semilla ⇒ igualdad exacta en Chromium, Firefox y WebKit. Abarca el resultado completo del solver TS y el horneado con Rapier del visor: restos, volcaduras y ragdolls.

## Contexto

- **Lo que no fija el estándar:** JavaScript deja a cada motor la precisión de `Math.sin`, `cos`, `tan`, `acos`, `atan`, `atan2`, `exp`, `log`, `hypot` y `pow` (y de `**` con exponente no entero).
- **Cómo difieren los motores:**
  - V8 (Chromium) usa fdlibm, salvo en `hypot`, que tiene algoritmo propio.
  - SpiderMonkey (Firefox) y JavaScriptCore (WebKit) usan otras implementaciones en parte.
- **Primera medición** (`eval/results/e8_determinism_antes_dmath.json`): con `Math` nativo, 8 de las 11 escenas canónicas daban el mismo resultado en los tres motores. En las otras tres, Firefox difería desde el sexto decimal de una trayectoria. La física lo arrastra hasta la energía disipada y los percentiles de la inversión.
- **Rapier ya era determinista:** el visor usa la compilación determinista (`@dimforge/rapier3d-deterministic-compat`). Pero lo que lo alimenta pasaba por `Math` del motor y por ayudantes de three.js con trigonometría (`setFromAxisAngle`, `applyAxisAngle`, `slerp`): posiciones, velocidades, cuaterniones y la calibración de los ragdolls.
  - En el ragdoll de la escena del motociclista, Firefox calculaba `k` y la distancia con un ulp de diferencia (`Math.hypot`).

## Decisión

1. **`dmath`** (`packages/solver-ts/src/dmath.ts`): port de fdlibm 5.3 a TypeScript con solo aritmética IEEE 754, exacta en cualquier motor (suma, resta, producto, división y raíz), y manejo de bits con arreglos tipados.
   - **Funciones:** `sin`, `cos`, `tan`, `atan`, `atan2`, `acos`, `exp` y `log`; `hypot` y `hypotN` con el algoritmo de V8 (máximo, escala y suma de Kahan); y `pow2` exacto.
   - **El caso especial de V8:** también se copia `exp(1) = e`.
   - **Consecuencia:** en V8 todo es igual a `Math`, bit a bit, así que lo que Chromium ya calculaba no cambia.
2. **`** 1.5`** pasa a `q·√q`; la potencia de dos de `ratioToDouble` se arma con sus bits; y la distancia a un segmento de `red-vial.ts` usa `√` en vez de `hypot`.
3. **`dthree`** (`packages/viewer/src/dthree.ts`): `quatFromAxisAngle`, `applyAxisAngle` y `slerp` con las fórmulas de three.js r186 sobre `dmath`.
   - **Rotaciones de Euler:** se quedan. Solo colocan objetos para el render, y el horneado no lee matrices de mundo.
4. **Una regla de ESLint lo protege:** en el solver y en los archivos del horneado del visor prohíbe las funciones de `Math` que dependen del motor, `**` no entero y los ayudantes trigonométricos de three.js.
5. **E8** (`eval/e8_determinism.mjs`):
   - **Qué corre:** empaqueta con esbuild el solver y el horneado del visor (`eval/e8_hornear_entry.mjs`), sin la app.
   - **Cómo lo compara:** cada navegador lo corre dos veces en un origen propio, servido con `page.route`. Se comparan los SHA-256 del resultado completo y de los cuadros horneados.
   - **Calidad:** también comprueba que el horneado sea el mismo en calidad baja y ultra.
   - **En CI:** un trabajo propio corre E8 con los tres navegadores y compara los hashes con el resultado versionado, medido en Windows. Así detecta diferencias entre sistemas operativos y un `eval/results` desactualizado.

## Evidencia

- **E8** (`eval/results/e8_determinism.json`): el resultado completo del solver es idéntico en 11 de 11 escenas, y el horneado (restos, volcaduras y ragdolls) en 11 de 11, en Chromium, Firefox y WebKit, con dos repeticiones cada uno. El horneado es el mismo en calidad baja, media y ultra.
- **Costo** (`eval/results/e8_costo_dmath.json`, en V8):
  - **Por llamada:** cada función cuesta más que la nativa; los nanosegundos de cada una están en el archivo.
  - **Solver completo:** con las 11 escenas tarda ×1.22 lo que tardaba con `Math` nativo.
  - **Resultado:** en V8 es idéntico, bit a bit, en las 11 escenas.
  - **Por qué no se nota:** el cálculo corre en el Web Worker (ADR 0028) y la prueba e2e confirma que el hilo principal no se bloquea.
- **Pruebas unitarias:**
  - **Bits exactos:** una tabla fija los bits de fdlibm para cada función, sin depender de la versión de Node.
  - **Propiedades:** a lo más 1 ulp de `Math` de V8, con fast-check.
  - **`dthree`:** igual a three.js, bit a bit, en V8.

## Alternativas descartadas

- **Reemplazar `Math` global** (monkey-patching) para que three.js también fuera determinista. Afecta a todo el código de terceros y a cada cuadro del render, y esconde la dependencia.
- **Comparar E8 con tolerancia.** PLAN §8 pide igualdad exacta, y en un sistema caótico (ragdolls, restos) un ulp puede crecer.
- **Aceptar el costo de rendimiento sin medirlo.** Se mide en `e8_costo_dmath.mjs` contra el commit anterior.

## Consecuencias

- **Código nuevo:** en el solver y en el horneado, la trigonometría va por `dmath` o `dthree`, y la regla de ESLint lo exige.
- **Cambios futuros:** si el solver o el horneado cambian, hay que volver a correr E8 y versionar su resultado. El trabajo de CI falla si los hashes no coinciden.
