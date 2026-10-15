# ADR 0014 — Rigidez trasera desde las pruebas FMVSS 301 con barrera rígida

- **Estado:** aceptado (2026-10-15; pendiente 2 de F7, zona trasera)
- **Contexto:** con ADR 0013 los costados salen de pruebas de NHTSA y la parte trasera sigue con el respaldo genérico `supuesto`. En el test de E3 ese respaldo sobreestimaba los traseros en 11.40 km/h. Las pruebas traseras modernas de FMVSS 301 (desde 2007, barrera deformable a 80 km/h con 70 % de traslape) no traen en la API masa, largo ni perfil del vehículo.

## Lo que se revisó en los reportes PDF de FMVSS 301 modernos

Se leyeron reportes de los tres laboratorios (pruebas 9596, 9643, 9644, 9700, 9701 y 9875):

- **Calspan:** trae el aplastamiento del vehículo en tres puntos (cambio de largo a la izquierda, al centro y a la derecha), el peso de prueba, la masa de la barrera y la velocidad medida.
- **KARCO:** trae el cambio de largo al centro y el total, y el aplastamiento máximo de la cara de la barrera por altura.
- **MGA:** no trae el aplastamiento del vehículo en el texto.
- Algunas pruebas de 2008 usan otra barrera (cara de 1,981 mm).
- **La cara de la barrera se lleva una parte grande de la energía.** En la prueba 9596 la cara se aplastó 329 de sus 383 mm de panal, cerca del fondo (Johnson 2011 lo sitúa en 70–80 %). Con ese aplastamiento, la parte de la barrera queda muy por encima del 13.6 % de los costados, y cerca del fondo el modelo lineal de la cara ya no vale.

Derivar la trasera de esos reportes encadenaría supuestos sin una fuente que los ate: perfiles de un solo punto o tres, la fracción de la barrera por prueba y su fondo.

## Decisiones

1. **Trasera desde las pruebas FMVSS 301 con barrera móvil rígida plana** (1,750–1,850 kg; la norma pide 1,814 ± 23 kg). Es la configuración anterior a 2007, contra toda la parte trasera.
   - La barrera no absorbe energía, así que la física es la de E2 frontal con el método de ADR 0013 (momento en 1-D con restitución cero, CRASH3 con PDOF, $d_0$ del umbral de Prasad a 16 km/h contra la barrera).
   - El perfil DPD1–DPD6 viene medido.
   - Quedan **136 pruebas** de modelos 1975–2004 en 6 clases con 5 o más pruebas.
2. **Las de barrera deformable no se usan en la trasera:** la parte de la cara es grande y no se conoce por prueba.
3. **Regla de decisión fijada antes de correr E3:** la trasera se adopta solo si baja el error de E3 en traseros del **dev** (2017–2021), frente al respaldo. El test (2022–2024) solo se reporta. En el dev pasó de 13.20 a **7.21 km/h** (sesgo de +7.47 a −1.47), así que se adoptó.

## Resultados (medidos)

- **E2 trasera** (`eval/results/e2_mdb.json`), dejar uno fuera por clase: ΔV con error medio de **4.57 km/h**, contra 33.94 km/h con el respaldo, que es mucho más rígido que cualquier parte trasera medida.
- **E3 en el test de CISS (2022–2024)** (`eval/results/e3_ciss.json`):
  - **Traseros:** 16.45 → **7.68 km/h**, sesgo +11.40 → −0.75, a ±10 km/h 53.5 % → **78.1 %**. WinSMASH: 7.26 km/h, sesgo +1.87, 80.1 %.
  - **En conjunto:** 10.30 → **8.85 km/h** (WinSMASH 8.19), sesgo +1.92 → −0.57.
  - **EDR ≥ 48 km/h:** 19.94 → 16.26 km/h (WinSMASH 17.54). El sesgo pasa de −5.19 a −11.90, todavía menor que el de WinSMASH (−14.37).
  - σ recalibrada en el dev: 0.4319. Cobertura del intervalo en el test: 81.5 %.

## Consecuencias y límites

- **Edad de la flota.** La rigidez trasera viene de vehículos de 1975–2004, y la de CISS 2017–2024 es más nueva: desde 2007 la norma exige un impacto trasero más severo. Que mejore tanto en el test no quita el límite: se declara en el README y en las notas de la tabla.
- Pocas pruebas en algunas clases: SUV compacta 8 y van 5. Autobús y SUV grande, con una prueba cada una, siguen con el respaldo.
- **Pendiente:** leer los reportes de Calspan, que son la mayoría, con su perfil de tres puntos, cuando haya una forma medida de repartir la energía con la barrera deformable. Por ejemplo, reportes con el aplastamiento de la cara, junto con una rigidez de la cara válida cerca del fondo. Queda en `docs/PROGRESS.md`.
