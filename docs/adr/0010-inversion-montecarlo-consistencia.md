# ADR 0010 — Inversión, Monte Carlo, consistencia e hipótesis (F7)

- **Estado:** aceptado (2026-10-14, F7)
- **Contexto:** PLAN §6.1.10–§6.1.12 pide estimar velocidades y ángulos desde daños, posiciones finales, marcas y proyección (con distribución), muestrear todos los campos con rango y marcar lo declarado que no cabe en ninguna solución física. PLAN §7.6 pide comparar dos o más hipótesis con fantasmas, y E3 compara contra el EDR y WinSMASH en NHTSA CISS.

## Decisiones

1. **E3 con CISS 2017–2024 y partición por año.** Se usan los CSV oficiales de NHTSA con candado SHA-256 (`croquis-data ciss download|build`). Los datos se reparten así:
   - **Desarrollo (2017–2021):** calibra la única constante libre, σ del error del modelo en log ΔV.
   - **Test (2022–2024):** solo se reporta.

   El objetivo de la calibración (que p10–p90 cubra el 80 % en dev) se fijó antes de mirar el test. En el test la cobertura da 81.7 %. **Actualizado (ADR 0013):** con la rigidez lateral de NHTSA, σ = 0.4658 y la cobertura en el test es 82.0 %.

2. **Rigidez muestreada en vez de un valor por clase.** La rigidez frontal sale del bootstrap de las pruebas de barrera de NHTSA de la clase. A y B vienen de la misma prueba y se muestrean juntas, porque están correlacionadas. Para la lateral y la trasera no hay pruebas en la tabla de E2: se usa el respaldo genérico con pendiente en [0.7, 1.4] y la fuente `supuesto`.
   - **Consecuencia medida en E3:** los traseros son el grupo más débil.
   - **Lo que no se hizo:** ajustar la rigidez lateral y trasera con el EDR de CISS, porque mezclaría validación y calibración.
   - **Pendiente:** obtenerla de las pruebas laterales (FMVSS 214) y traseras (FMVSS 301) de NHTSA, que son una fuente física independiente.
3. **Inversión con mínimos cuadrados robustos sobre el solver completo.** Cada evaluación es una reconstrucción completa: así la inversión hereda contacto, carril, objetos y post-impacto sin modelos aparte. SciPy `least_squares` con `soft_l1` resiste un dato declarado muy fuera.
   - **Sin CMA-ES:** PLAN lo permite si hace falta, y en las diez escenas el ajuste local converge. Queda como alternativa si aparecen escenas multimodales.
   - **Incógnitas:** velocidades y, con posiciones finales, el rumbo inicial no declarado (±20°).
   - **Residuos:** en sigmas, con σ supuestas y documentadas (`docs/physics.md` §10).
4. **Identificabilidad explícita.** Con el jacobiano del mejor ajuste (aproximación de Laplace) se decide qué fija la evidencia. Si un parámetro no queda fijado, el resultado lo dice ("la evidencia no basta") y no da un intervalo.
   - **Por qué:** sin esta regla, el p10–p90 de la velocidad sale de 0.8 a 200 km/h en el poste y de 0.2 a 200 km/h en el árbol, un intervalo que solo refleja los límites de búsqueda (`eval/results/f7_inversion.json`, `sin_regla_de_identificabilidad`).
   - **Estimaciones en el límite:** se marcan como `en_limite`.
5. **Distribución por reestimación con método de la cuerda.** Las 12 reestimaciones con entradas perturbadas arrancan del mejor ajuste y reutilizan su jacobiano: Gauss-Newton con pesos de `soft_l1` y pasos recortados. Si una muestra no mejora, se reajusta completa.
   - **Rendimiento:** reestimar desde cero cada muestra multiplicaba las reconstrucciones. Con la cuerda, la inversión más lenta de las diez escenas tarda 38.95 s (glorieta) en la laptop de referencia y Monte Carlo 10.16 s (frontal en curva), según `eval/results/f7_inversion.json` (`croquis-eval f7-inversion`).
   - **Muestras colapsadas:** una primera versión, sin recorte de paso ni respaldo, daba p10 = p90 en la glorieta. Se detectó y se corrigió.
6. **Monte Carlo uniforme con semilla**, con 64 muestras y una rejilla de 0.1 s. Los rangos dependen de la fuente del dato: lo que dice la persona usuaria se aprieta y lo supuesto se abre. Va en `resultado.incertidumbre` desde el esquema 1.3.0.
7. **Consistencia contra el rango y no contra el nominal.** Una bandera solo aparece si lo declarado no cabe ni con el extremo favorable de fricción, rigidez y masas. Hay seis códigos, un mensaje en llano que termina en pregunta y nunca culpa.
   - **En el relato:** la página convierte las banderas en las primeras preguntas de cada ronda.
   - **En el visor:** aparecen en "Datos que no cuadran".
8. **Resultado 1.4.0.** Se agregan `inversion` (parámetros, evidencia, percentiles, residuos) y `consistencia` (código, mensaje y datos con forma cerrada), ambos opcionales. Los fixtures los traen precalculados. La API los calcula con `POST /reconstruir {analisis: true}`, que tiene su propio límite por hora porque cuesta segundos de CPU (`CROQUIS_ANALYSIS_RATE_LIMIT_PER_HOUR`, 30 por omisión).
9. **Hipótesis en el visor.** El panel pide al servidor la misma escena con otra velocidad para un vehículo (`/reconstruir`) y la sobrepone como fantasmas translúcidos con el mismo reloj, hasta tres a la vez (azul, naranja, violeta). Muestra la diferencia contra la reconstrucción principal en velocidad al impacto, ΔV y posición final.
   - **Sin física en el visor:** el fantasma sigue la trayectoria que calculó el solver.
   - **Fuera de línea:** la versión sin servidor llega con el port TS en F9.

## Consecuencias

- **Reproducibilidad entre máquinas:** con la misma semilla, la inversión es reproducible en la misma máquina, pero no bit a bit entre máquinas. Es un ajuste iterativo con álgebra lineal (BLAS) cuyos núcleos cambian con el CPU, y CI en Ubuntu y Windows dio números distintos en décimas. Por eso `croquis-solver reconstruct --check` compara los bloques `inversion` y `consistencia` con 5 % de tolerancia relativa (sus percentiles salen de 12 reestimaciones, con mucha más incertidumbre estadística que eso). Estructura, booleanos y textos se comparan exactos, y el resto del resultado conserva 1e-6.

- Las marcas de frenado declaradas fijan la distancia de frenado en la inversión. Las de derrape no se usan, porque el contrato no dice si son anteriores o posteriores al impacto. Es un pendiente del contrato, registrado en `docs/PROGRESS.md`.
- El rumbo final declarado cuenta como evidencia (σ = 20°). En los fixtures, el rumbo final del relato es parte de la pose declarada. Si E9 muestra que las personas no lo dicen, habrá que separar su procedencia en el contrato.
- Solo existen en Python la inversión, Monte Carlo y la consistencia. El port TS (F9) debe reproducirlas con paridad o llamar al servidor; esto se decide en F9 con E7.
