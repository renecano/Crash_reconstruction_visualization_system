# ADR 0067 — Croquis contra los dictámenes de CESVI: E-R4 y la página de reproducción (R4)

- **Estado:** aceptado (2026-10-22).
- **Contexto:** R4 de `docs/cesvi/PLAN-CESVI.md` pide medir, sobre la prueba congelada, si Croquis llega a lo que concluyó CESVI cuando solo recibe la descripción sin conclusiones. Se compara contra líneas base simples y se publica una página con el dictamen y la reconstrucción lado a lado.

## Decisión

- **La entrada de Croquis:** la narración sin conclusiones de cada dictamen (R0, `narraciones.jsonl`).
  - Claude la lee a escena con la misma lectura de «Caso nuevo» (R1, `SISTEMA_ESCENA`), por la API de lotes.
  - Las lecturas se guardan en `data/cesvi/r4/lecturas.jsonl`, ya que las narraciones están redactadas, para medir sin API.
- **Lo que se compara** (`packages/cesvi/src/dictamenes-r4.ts`) contra lo que concluyó CESVI (R0):
  - **Modalidad:** Croquis la infiere de la escena y de la narración (`modalidadInferida`):
    - **La cara de contacto de cada vehículo** suma por cada daño 1 punto, 2 más si la deformación entra por esa cara y lo que pesa su magnitud.
    - **Un vehículo solo:**
      - vuelco narrado → volcadura;
      - objeto declarado por la lectura, o dicho golpeado («contra un poste») → objeto fijo (un camellón o un poste que solo están en la vía no cuentan);
      - salida narrada → salida del camino;
      - golpe por detrás → alcance.
    - **Dos o más vehículos:**
      - frente contra parte posterior → alcance;
      - frente contra frente → frontal, salvo que uno también traiga la parte posterior dañada (alcance con empuje);
      - un costado → lateral;
      - parte posterior con una reversa narrada → reversa.
    - **Nunca infiere «otra»:** en los dictámenes es una clase de casos variados (valoraciones, daños que no corresponden y otros), no una configuración física. Por eso se reporta también la exactitud sobre las modalidades físicas, sin «otra», con su propia línea base.
  - **Zonas de contacto:** vehículo y cara, y el tercio cuando los dos lo dicen. Se miden la exhaustividad (cuántas de CESVI tiene Croquis) y la precisión.
  - **Secuencia de impactos:** los participantes de cada impacto en orden. Si la narración no la dice, Croquis toma la única posible (los dos vehículos entre sí, o el vehículo contra el objeto que golpeó) y la marca como inferida.
  - **Velocidades:** las que calcula la verificación CESVI (EBS con las medidas, la masa y la rigidez de la narración) contra las del dictamen calculadas por deformación, con error absoluto y porcentaje.
  - **Posiciones finales:** si Croquis tiene la posición final descrita de cada vehículo que describe CESVI.
- **Líneas base del plan,** tomadas de los dictámenes de desarrollo: la modalidad más frecuente («otra»), la más frecuente de las físicas («alcance») y la velocidad promedio por deformación (61.62 km/h).
- **Desarrollo antes que prueba:**
  - **Ajuste:** las reglas se ajustaron solo con 80 dictámenes de desarrollo (orden del SHA-256 de `r4:<id>`).
  - **Congelado:** las reglas se congelaron en un commit (f389c4f) antes de medir la prueba.
  - **Prueba:** los 205 se midieron una sola vez.
- **La página** `/cesvi/reproduccion`:
  - **La lista:** el resumen de E-R4 y los casos de la prueba que Croquis reconstruye.
  - **Cada caso** (`/cesvi/reproduccion/[id]`, generado al construir):
    - la narración que recibió Croquis;
    - lo que concluyó CESVI, con sus citas;
    - lo que obtuvo Croquis, con lo que coincide y lo que no;
    - la reconstrucción en 2D (`Croquis`) y 3D (`VisorEscena`), calculada en el navegador.
  - **Datos:** los genera `medir prueba` en `data/cesvi/r4/pagina.json` y solo se leen en el servidor.

## Resultados (`eval/results/cesvi_r4_reproduccion_prueba.json`, prueba congelada, 2026-10-22)

- **Lectura y reconstrucción:**
  - **Lectura:** 205 de 205, y 202 escenas son válidas contra el contrato.
  - **Reconstrucción:** 205 de 205 se reconstruyen en 3D, con mediana de 359 ms.
  - **Costo de las lecturas:** 2.6738 USD la prueba y 1.0022 USD el desarrollo, con lotes.
- **Modalidad** (190 con modalidad concluida):
  - **Todas:** Croquis 34.2 % (65), y la línea base que siempre dice «otra», 35.3 % (67). Croquis no gana porque no infiere «otra», que son 67 de los 190.
  - **Modalidades físicas** (123, sin «otra»): Croquis 52.8 % (65), contra 37.4 % (46) de la línea base que siempre dice «alcance».
  - **Por modalidad:**

    | Modalidad         | Aciertos de Croquis |
    | ----------------- | ------------------- |
    | alcance           | 34 de 46            |
    | lateral           | 17 de 25            |
    | frontal           | 4 de 6              |
    | objeto fijo       | 6 de 17             |
    | salida del camino | 2 de 10             |
    | volcadura         | 2 de 10             |
    | reversa           | 0 de 9              |

  - **Sin inferir:** 36.
- **Zonas de contacto** (152 dictámenes):
  - **Exhaustividad:** 69.2 % (216 de 312).
  - **Precisión:** 59.7 % (216 de 362).
  - **Tercio:** 11 de 11 donde los dos lo dicen.
- **Secuencia** (135 dictámenes):
  - **Primer impacto:** 63.7 % (86).
  - **Secuencia completa:** 49.6 % (67).
  - **Mismo número de impactos:** 51.1 % (69).
- **Velocidades:** 5 del dictamen por deformación, y Croquis no calcula ninguna, porque esas narraciones no traen las medidas C y L ni la masa. La línea base de 61.62 km/h se equivoca en una mediana de 11.72 km/h (23.48 %).
- **Posiciones finales** (46 dictámenes): Croquis tiene 53.4 % (31 de 58).

## Límites

- **Reversa:** Croquis no acierta ninguna (0 de 9). Las narraciones rara vez dicen la maniobra, y el solver no reconstruye un vehículo que retrocede (pendiente desde R2).
- **Objeto fijo y salida del camino:** se confunden cuando la narración no dice qué se golpeó.
- **Velocidades:** no se pueden medir con estas narraciones. Cuando el perito da las medidas, la verificación CESVI las calcula (C1).
- **La reconstrucción de la página** usa la disposición genérica (supuesto), porque los dictámenes no traen posiciones medidas. La física no fija velocidades, y la página lo dice.
- **Las posiciones finales** se comparan por presencia, no por su texto.

## Consecuencias

- **R5** (cargar un dictamen) puede usar la misma comparación.
- **La página** sirve para la demo con CESVI: lo que analizaron ellos y lo que reconstruye Croquis, con lo que coincide y lo que no, sin esconder lo segundo.
