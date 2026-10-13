# ADR 0005 — Diseño del solver de referencia (F2)

- **Estado:** aceptado (2026-10-13, F2)
- **Contexto:** PLAN §6 pide un solver propio, determinista y explicable, con Python como referencia y un port TS con paridad (F9). F2 cubre los módulos 6.1.1–6.1.5 y 6.1.7 y la primera corrida de E2.

## Decisiones

1. **Python puro con `math`, sin numpy en el camino crítico.** Los cálculos son escalares y pequeños; escribirlos con `math` hace que el port TS sea línea a línea y que la paridad de E7 sea alcanzable a 1e-6. numpy y scipy quedan para evaluación y ajuste (F7).
2. **Impacto por impulso de cuerpos rígidos planos** (Brach; Kudlich–Slibar) con restitución de Newton y relación de impulso tangencial. Para evitar la ganancia de energía de la paradoja de Kane, el solver prueba candidatos (adherencia, deslizamiento con μ, μ/2, …, 0) y toma el primero que no gana energía. El resultado informa la fricción usada. Se descartó un modelo de fuerza-deformación continuo porque exige rigideces laterales que no tenemos medidas.
3. **Energía de deformación con CRASH3** y coeficientes por clase calculados en E2 desde pruebas frontales a 0° contra barrera rígida de NHTSA, mediana por clase. Solo hay coeficientes medidos para la zona frontal; lateral y trasera usan un respaldo genérico marcado `supuesto`, y cada vehículo reporta el `origen` de su rigidez.
4. **Tabla de rigidez generada y verificada.** `stiffness_classes.json` sale de `croquis-eval e2-barrier` sobre el CSV versionado `data/processed/nhtsa/vtb_tests.csv`; una prueba exige que la tabla versionada coincida byte a byte con la que produce E2. Las respuestas crudas de la API no se versionan.
5. **Post-impacto con modelo planar de 3 GDL** y fricción por llanta saturada (círculo de fricción), integración semi-implícita de Euler con paso fijo de 2 ms y salida cada 20 ms. El paso fijo garantiza determinismo bit a bit. Si el conductor no frenaba, las llantas ruedan con un arrastre de 0.35 μ (supuesto documentado en `docs/physics.md`); sin él, un vehículo que rueda libre recorre cientos de metros, cosa que no se observa tras un choque.
6. **t = 0 en el impacto principal.** Cada vehículo involucrado recorre su trayectoria previa para llegar al punto de impacto justo en t = 0; los no involucrados siguen a velocidad constante. Así el visor (F3) y la línea de tiempo comparten un origen claro.
7. **Valores nominales en F2, rangos en F7.** Toda cantidad incierta tiene rango y fuente en `friction.json` o en constantes con nota `supuesto`; F2 usa el nominal y registra la semilla. El Monte Carlo de F7 muestrea esos rangos sin cambiar las interfaces.
8. **Banderas en lenguaje llano y sin culpa.** El orquestador marca supuestos fuertes (frenado sin distancia, frenado que detendría antes del impacto, distancia de proyección incompatible) sin atribuir responsabilidad (PLAN §10).

## Consecuencias

- El port TS de F9 replica `models`, `impact`, `crash3`, `preimpact`, `postimpact`, `fixed_object`, `pedestrian` y `reconstruct` con las mismas constantes. Las pruebas de paridad compararán el JSON de `Reconstruction`.
- Mejorar las rigideces laterales y traseras exige otra fuente (pruebas de barrera deformable móvil o literatura); queda como pendiente en `docs/PROGRESS.md`.
- La inercia de guiñada usa la aproximación de placa rectangular hasta que F7 incorpore mediciones publicadas.
