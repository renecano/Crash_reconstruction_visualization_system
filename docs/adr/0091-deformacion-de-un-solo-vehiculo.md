# ADR 0091 — La deformación de un solo vehículo en la inversión (diagnóstico de AXA)

- **Estado:** aceptado (2026-10-24).
- **Contexto:**
  - En AXA A2010930, el caso de la demo para CESVI, la reconstrucción daba V2 a 41.01 km/h y el reporte dice 63.15 km/h (−35.1 %). René pidió diagnosticarlo antes de seguir: entradas, sensibilidad y métodos, y corregir lo que fuera error, sin ajustar nada para que salga 63.15.
  - El diagnóstico está en `eval/cesvi_axa_diagnostico.mts`. Su resultado está en `eval/results/axa_diagnostico.json`, y el del código anterior, en `axa_diagnostico_antes.json`.

## Lo que se encontró

Tres errores, con el código de 8ab9271:

1. **Medidas de deformación duplicadas.** La lectura grabada pone las C y L del frente de la Tacoma también en su costado derecho. La escena mandaba las dos al solver. El reporte mide una sola deformación por vehículo, la del McHenry de cuatro medidas.
2. **Perfil incompleto.** Al solver llegaba solo la profundidad máxima (0.96 m) como deformación pareja en todo el ancho, y no el perfil C1–C4 (0.96, 0.86, 0.52 y 0.20 m). La rigidez tampoco llegaba: el solver usaba la de la clase (NHTSA E2, frente de pickup), que con el mismo perfil da 586.97 kJ: 2.6 veces los 225.45 kJ del reporte.
3. **La deformación no entraba a la inversión.** El ΔV por daño solo se usaba si los dos vehículos tenían su deformación medida. El reporte mide solo la de V2, así que la velocidad de cierre quedaba libre: 4.7 km/h con 0.96 m de deformación.

## Decisión

1. **Contrato 2.1.0** (aditivo; la migración no cambia documentos):
   - `danos_declarados[].perfil_aplastamiento`: el perfil C1–Cn, de 2 a 6 medidas, con unidad y fuente;
   - `danos_declarados[].rigidez`: A en N/m y B en N/m², con su fuente.
2. **La escena del expediente** (`especDeExpediente`):
   - manda una sola deformación por vehículo: la de la cara del primer impacto o, si el reporte no la dice, la primera. Si había más, lo dice en los límites;
   - la manda con su perfil completo y con la rigidez del reporte. La rigidez de un dictamen con A < 1000 está en kN/m y kN/m² (ADR 0048), así que se multiplica por 1000.
3. **La inversión**, en Python y en el port TS con paridad:
   - usa el perfil y la rigidez declarados. Con la rigidez fija, solo se muestrean la masa (±5 %) y el error del modelo calibrado con CISS;
   - entre varios daños medidos de un vehículo, usa el de la cara del contacto;
   - si solo un vehículo del par tiene la deformación medida, su energía es una **cota inferior** de la del choque (la del otro solo la subiría). Su ΔV entra como evidencia `dano_minimo:<id>` con un residuo que solo cuenta por debajo, `min(0, ΔV − p50)/σ`.
   - **No se inventa la energía del otro vehículo.** Se probó repartirla por la razón de rigideces B (equilibrio de fuerzas). Con las rigideces de clase daba energías y ΔV fuera de toda escala, y se descartó; no quedó como evaluación.
4. **Bandera `dano_no_alcanzado`** en la consistencia (resultado 1.10.0):
   - salta si el ΔV de la reconstrucción queda por debajo del p10 de ese mínimo, y solo si la evidencia fija la velocidad del vehículo (con la regla del punto 6, por más de la escala de la restricción).
5. **La reconstrucción contra el reporte** (`reconstruccionContraCesvi`) va en el paso 6, sobre el 3D y en el dictamen. Cada velocidad del reporte se pone junto a la que mide lo mismo que pueda medir el solver:
   - el EBS, con la velocidad previa;
   - los restos, con la velocidad de V1 al salir del impacto.

   Cada fila lleva su diferencia en km/h y en %, una línea de por qué los métodos no coinciden y, si salta la bandera, el aviso con sus números.

6. **Regla: lo medido pesa más que lo supuesto** (pedida por René el 2026-10-24, general y no solo para AXA). Hay tres niveles, con un solo factor global `PRIORIDAD = 10`, nunca por caso:
   - **la deformación medida es una restricción:**
     - su ΔV no cuesta nada dentro de su banda p10–p90 (en un mínimo, desde p10);
     - fuera de la banda pesa `PRIORIDAD` veces su σ (`damage_band`);
   - **lo declarado** (relato o persona usuaria) es dato, con su σ de siempre;
   - **un reposo supuesto a propósito** (`vehiculos[].posicion_final_supuesta`, contrato 2.1.0) es evidencia blanda:
     - lo marca el perito en el paso 3 («Es un supuesto: el reporte no da dónde quedó»);
     - tiene `PRIORIDAD` veces la σ de uno declarado: ±10 m en lugar de ±1 m;
     - los reposos que la escena pone por omisión no llevan la marca y siguen sin entrar.

   Lo que hace falta para que la regla funcione:
   - **Arranques compatibles con la deformación.** Lejos de ella el ΔV casi no cambia con las velocidades y el ajuste se queda donde arranca. Por eso el ajuste también arranca desde la velocidad de cierre que implica la mediana del ΔV, con cada vehículo como el que alcanza, y se queda con el de menor costo (`damage_starts`).
   - **Jacobiano con la restricción activa.** Una restricción violada en el mejor ajuste es localmente una igualdad: su jacobiano se toma sin el recorte de la banda, para la σ local y para los reajustes con entradas perturbadas.
   - **El ajuste conjunto en el resultado.** Si la evidencia no fija algún parámetro, el ajuste con todo libre (`inversion.ajuste_completo`) queda en el resultado: es la reconstrucción que mejor cumple la evidencia, aunque no la fije.
   - **`dano_no_alcanzado` con la banda.** Salta si el ΔV queda por debajo de p10 por más de la escala de la restricción (σ/`PRIORIDAD`).

7. **Dos hipótesis, y el perito elige.** Si con la deformación como restricción un reposo supuesto queda a más de 3 m del de la reconstrucción, el daño y ese reposo no caben juntos. Los 3 m son el umbral de `reposo_inalcanzable`, 3σ de una posición declarada.
   - Salta `reposo_supuesto_vs_dano` (resultado 1.10.0).
   - El resultado trae la otra hipótesis, `inversion_reposo_supuesto`: «cuadra con el reposo supuesto», donde el supuesto pesa como dato y el daño sin prioridad.
   - El paso 4 muestra las dos con sus números: velocidades (fijadas o el mejor ajuste con su ±σ), dónde termina el vehículo respecto de su reposo supuesto y si alcanza la deformación.
   - Croquis no elige: mientras el perito no elija, se ve «cuadra con el daño medido» y el dictamen dice que falta su elección. Lo elegido pasa al paso 6, al 3D y al dictamen.
8. **Restos en el paso 6:** la velocidad de V1 al salir del impacto se toma de la reconstrucción con las velocidades ajustadas, la misma del 3D, y no de las trayectorias del resultado, que van con las velocidades de partida.

## Resultado (medido)

**Antes de todo** (`eval/results/axa_diagnostico_antes.json`, 8ab9271): V2 a 41.01 km/h, con los tres errores.

**Ahora** (`eval/results/axa_diagnostico.json`):

- **La reconstrucción es la de la app:** la escena se arma igual que en el paso 6 (`apps/web/src/lib/axa-reconstruccion.ts`) y con su semilla, la de `especDeExpediente` con su identificador por omisión. La usan también el video de R11 y la medición con semillas.
- **La masa de V1** es la de su ficha técnica: 2,562.1 kg, el punto medio de la Silverado 2500 HD 2007 de cuatro puertas (data/SOURCES.md).
- **Entre paréntesis va el p10–p90** de las reestimaciones con entradas perturbadas.

1. **Con el reposo de V2 como dato** (sin la marca), la deformación ya pesa como restricción. El paso 6:

   | Método del reporte               | CESVI      | Croquis                  | Diferencia             |
   | -------------------------------- | ---------- | ------------------------ | ---------------------- |
   | Deformación (EBS)                | 63.15 km/h | 58.15 (56.48–60.17) km/h | −5.00 km/h (−7.92 %)   |
   | Restos (V1 al salir del impacto) | 60.27 km/h | 41.76 km/h               | −18.51 km/h (−30.71 %) |

2. **Con el reposo de V2 marcado como supuesto** (lo que es: el reporte no lo da), no caben juntos y hay dos hipótesis:

   | Hipótesis                     | V2                                               | V1 al salir del impacto       | V2 y su reposo supuesto | Deformación   |
   | ----------------------------- | ------------------------------------------------ | ----------------------------- | ----------------------- | ------------- |
   | Cuadra con el daño medido     | 63.17 (60.77–113.09) km/h (+0.02 km/h, +0.03 %)  | 38.87 km/h (−21.40, −35.51 %) | a 5.2 m                 | la alcanza    |
   | Cuadra con el reposo supuesto | 41.73 (40.86–54.06) km/h (−21.42 km/h, −33.92 %) | 41.54 km/h (−18.73, −31.08 %) | en él                   | no la alcanza |
   - Los porcentajes de V2 son contra el EBS de 63.15, y los de V1 contra los 60.27 de los restos.
   - En «cuadra con el daño medido», V1 va a 23.35 km/h antes del impacto.
   - En «cuadra con el reposo supuesto», V2 y V1 van casi a la misma velocidad antes del impacto (41.73 y 41.71 km/h): sin cierre no hay deformación.
   - El +0.03 % no se buscó, y no hay que leerlo como precisión: con otras semillas, la misma hipótesis da otra velocidad (siguiente sección).

**Lo que queda es de método y de datos, no de error:**

- **El 63.15 no es la velocidad a la que circulaba V2.** Es la equivalencia de barrera de su energía de deformación, √(2E/m), con la masa de V2 sola. El 60.27 es la velocidad de V1 al salir del impacto, deslizando juntos con a = 0.9. El solver calcula la velocidad a la que circulaba V2, por momento y trayectorias, con llantas que ruedan después del impacto (arrastre de 0.35 de la fricción).
- **Faltan datos en el reporte:**
  - el reposo de V2, que se le pide a CESVI junto con las huellas de frenado o arrastre (PROGRESS, «Bloqueado»);
  - la masa de V1, que se toma de su ficha técnica.
- **Con la deformación del reporte** (225.45 kJ) y esa masa, la velocidad de cierre debe ser al menos 79.78 km/h. El ajuste del reposo como dato no es un mínimo local: costo 8.18 desde el arranque por omisión, contra 25.2 desde el cierre mínimo.

## La semilla (René, 2026-10-25; `eval/results/axa_semillas.json`)

La escena del video daba V2 a 71.96 km/h y la app a 62.77, porque cada una tenía otra semilla. La portada promete «Siempre da lo mismo». La medición reconstruye AXA como la app (resultado completo de producción) con la semilla de la app y con otras 19:

- **Hipótesis:** 15 de 20 semillas dan dos hipótesis y 5, una sola.
- **«Cuadra con el daño medido» (V2), en las 19 semillas en que la evidencia lo fija:**
  - el p10–p90 entre semillas es de 63.15 a 91.64 km/h (28.49 km/h), con extremos de 62.03 a 151.84;
  - el ajuste es multimodal: con unas semillas queda cerca de 63 km/h (la de la app, la 4 y la 10), con la mayoría cerca de 75–77, y con dos (la 9 y la 11) en otra solución, con V1 detenido y V2 a unos 150 km/h.
- **V1:** de 18.76 a 24.47 km/h (p10–p90 entre semillas).
- **El p10–p90 de la semilla de la app** (60.77–113.09 para V2; 0–25.65 para V1) cubre 17 de 19 semillas en V2 y 19 de 20 en V1. Las dos que quedan fuera son las de unos 150 km/h.
- **«Cuadra con el reposo supuesto»** casi no cambia: V2 entre 41.61 y 41.92 km/h.

**Decisión:**

- **Mismo caso, mismo resultado.** El video de R11, el diagnóstico y la app usan la misma construcción y la misma semilla. La promesa se cumple: con la misma semilla, el mismo resultado.
- **Rango donde va el número:** como la dispersión pasa de un par de km/h, cada velocidad de la reconstrucción va con su p10–p90:
  - en el paso 6, en la comparación con el reporte;
  - sobre el 3D;
  - en las tarjetas de las hipótesis, en lugar de la σ local, que con 2.9 km/h subestimaba la dispersión;
  - en el dictamen.
- **Pendiente** («Endurecimiento pendiente»): que el ajuste no dependa del modo en que cae, por ejemplo arrancando desde varios puntos o reportando los modos. Lo resuelve el multiarranque (sección siguiente).

**Antes y después de la regla, fuera de AXA:**

- **Escenas canónicas** (`eval/results/inversion_prioridad.json`): 13 de 13 dan las mismas estimaciones y el mismo resultado. Solo cambia `version_resultado`, y 5 traen la clave nueva `ajuste_completo`, porque en ellas la evidencia no fija algún parámetro.
- **Paridad:** Python al día y 19 pruebas de paridad TS en verde.
- **E-R4 con la inversión** (`cesvi_r4_inversion_antes.json` y `cesvi_r4_inversion_despues.json`, la prueba congelada de 205 narraciones):
  - el detalle es idéntico en los 205;
  - las narraciones no colocan a los vehículos en el mapa, así que la inversión solo tiene evidencia en 1 de ellas (unas marcas de frenado) y no fija ninguna velocidad;
  - los impactos coinciden igual que antes: mismo número en 71 de 135 (52.59 %) y primer impacto en 96 de 110 (87.27 %).
  - Nada empeora; tampoco mejora, porque sin posiciones la regla no tiene sobre qué actuar.

## Multiarranque determinista (René, 2026-10-25; `eval/results/axa_multiarranque.json`)

René: el resultado de AXA no puede depender de la semilla. Mostrar 63.17 km/h porque coincide con CESVI sería escoger semilla, cuando la mediana de 20 semillas era 75.48 y había soluciones en 150.

**Por qué cambiaba con la semilla.** Dos causas, medidas:

- **El ajuste se quedaba donde arrancaba.** Desde distintos arranques, la misma evidencia caía en mínimos distintos.
- **La evidencia se movía.** El ΔV del daño (la cota inferior de V2) salía de 200 muestras con la semilla de la escena. Su p10 iba de 27.25 a 32.08 km/h según la semilla; con 2000 muestras, de 28.87 a 30.34 (`eval/results/axa_ruido_dano.json`).

**Decisión (para todos los casos, Python y TS con paridad):**

- **Arranques fijos, los mismos siempre:**
  - el inicial;
  - los compatibles con la deformación;
  - 8 puntos de Halton sobre las velocidades, de 5 a 150 km/h.
- **Cada arranque, con pocas iteraciones** (6 evaluaciones). Se agrupan por modo, se afinan los 3 mejores con el ajuste completo y se queda el de menor costo.
- **Cuándo son modos distintos:** solo si hay una loma entre ellos, es decir, si el costo sube en algún punto de la recta que los une. Sin esto, una velocidad que la evidencia no fija (un valle plano) aparecía como varios «modos» con el mismo costo.
- **Hipótesis por modo:** un modo dentro de 0.5 de costo del mejor se presenta como hipótesis en el paso 4, con su costo y sus números. Con residuos chicos, el costo soft_l1 es ½ χ², así que 0.5 es un Δχ² de 1. Va en `inversion.multiarranque` y `inversion.alternativas` (resultado 1.12.0).
- **La evidencia ya no usa la semilla de la escena:** el ΔV por daño se estima con 2000 muestras y semilla fija (0). Es una propiedad de la evidencia, no de la escena.
- **El rango sale de las entradas alrededor de la solución elegida.** Cada muestra perturba las medidas, la fricción, las masas y el reposo supuesto, y se reajusta desde la solución elegida:
  - con una región de confianza de una escala por paso (10 km/h, 10°), para no saltar a otro modo. Antes, un paso sin límite llevaba algunas muestras de AXA al otro modo, con V1 detenido;
  - con conjunto activo: un parámetro en su límite que empuja hacia afuera se queda fijo y el paso se recalcula con los demás.
  - Si ninguna muestra se aparta de la solución (p10 = p90), la velocidad va sin paréntesis: un rango de ancho cero se leería como «sin incertidumbre».
- **La semilla de la escena** solo sortea esas muestras.

**AXA antes y después** (escena de la app, reposo de V2 supuesto):

|                             | Antes (`axa_semillas.json`, 6a0786c) | Después (9c9a82c)                                  |
| --------------------------- | ------------------------------------ | -------------------------------------------------- |
| V2 con la semilla de la app | 63.17 km/h (60.77–113.09)            | 71.56 km/h (63.19–95.96)                           |
| V1 con la semilla de la app | 23.35 km/h (0–25.65)                 | 25.32 km/h (3.73–27.03)                            |
| V2 en 20 semillas           | de 62.03 a 151.84 (mediana 75.48)    | 71.56 en las 20                                    |
| Hipótesis                   | dos en 15 semillas, una en 5         | una sola en las 20                                 |
| Modos de «daño medido»      | —                                    | uno, costo 0.0293, al que llegan 5 de 11 arranques |

- **Contra CESVI:** la solución elegida no es la de ~63.
  - Por deformación (EBS), V2 da 71.56 km/h contra 63.15 del reporte: **+8.41 km/h (+13.32 %)**.
  - Por restos, V1 al salir del impacto da 43.38 km/h contra 60.27: **−16.89 km/h (−28.02 %)**.
  - No se ajustó nada para coincidir.
- **Ya no hay dos hipótesis.** Con el mínimo global, V2 alcanza la deformación medida y termina a menos de 3 m de su reposo supuesto, así que la bandera `reposo_supuesto_vs_dano` ya no sale. Las dos hipótesis de antes venían de un ajuste atascado en un mínimo local.
- **El rumbo inicial de V2** queda en el límite de búsqueda (+20° sobre el que colocó el perito; `en_limite` en el resultado). La evidencia lo empuja hacia un ángulo de llegada más abierto que el de la vía.
- **Sensibilidad a la semilla de la evidencia:** con otras 4 semillas (2000 muestras), V2 va de 71.18 a 71.95 km/h.
- **El rango y el muestreo:** con 12 muestras, el p10–p90 de V2 cambia con la semilla de la escena. El p10 va de 59.35 a 72.56 km/h y el p90, de 79.81 a 98.51. Es ruido del muestreo de una distribución ancha (el reposo supuesto tiene σ de 10 m). Se queda en 12 muestras: duplicarlas alarga cada estimación sin estrechar mucho ese ruido.
- **Tiempo:**
  - **En el navegador** (`eval/results/axa_tiempo_navegador.json`: Chromium en esta laptop, Windows con 8 GB, el Web Worker de producción, mediana de 3 corridas):
    - la reconstrucción que dibuja el visor llega en 54 ms antes y después;
    - el resultado completo, de 7.13 s antes (el worker de producción) a 4.83 s después.
    - El multiarranque cuesta menos que las dos inversiones que reemplaza.
  - **En Node,** el resultado completo tarda 5.86 s. La mediana de 23.06 s que trae `axa_semillas.json` se midió en otra sesión, con otros procesos, y no es comparable.

**Fuera de AXA** (`eval/results/inversion_multiarranque.json`, contra `main` fe89b08):

- **Escenas canónicas y de inversión:** 9 de 15 dan las mismas estimaciones. Ninguna trae alternativas dentro del margen.
- **Las 6 que cambian** encuentran un mínimo de menor costo que el de antes:
  - **`glorieta`:** antes no fijaba ninguna velocidad. Ahora, A a 0 km/h (en el límite) y B a 27.98, las dos sin rango: ninguna muestra se aparta de la solución, porque el costo tiene un quiebre ahí (contacto o no).
  - **`interseccion_toluca`:**
    - A pasa de 15.55 a 19.48 km/h, y B, que antes no se fijaba, da 24.41;
    - hay dos modos (costo 3.09 y 5.59);
    - el p10–p90 de B (2.15–22.15) queda por debajo de su mejor valor: con las entradas perturbadas, B baja.
  - **`lateral_interseccion`:**
    - el mejor ajuste (costo 3.49 contra 4.22 del otro modo) deja a B a 3.51 km/h, y la evidencia ya no fija a A (antes, 77.05);
    - pierde la bandera `velocidad_vs_evidencia`, porque ya no hay velocidad de A que contrastar con la declarada.
  - **`motociclista`:**
    - A pasa de 0 a 36.79 km/h; B sigue en 35.41;
    - el modo de antes (A detenido) tiene costo 3.55 contra 1.84;
    - gana una bandera `velocidad_vs_evidencia`.
  - **`volcadura`:** A pasa de 80.30 a 51.03 km/h y gana la bandera `velocidad_vs_evidencia`.
  - **`axa_alcance`:** V2 pasa de 65.67 a 71.56 km/h y pierde la bandera de las dos hipótesis, como la escena de la app.
- **Escena de prueba nueva, `fixtures/inversion/axa_reposo_lejano`:**
  - es AXA con el reposo supuesto de V2 30 m adelante, más allá del reposo medido de V1, cosa que la deformación no permite;
  - cubre en la paridad el camino de las dos hipótesis, que en AXA ya no sale.
- **E-R4 con la inversión** (`cesvi_r4_inversion_multiarranque.json` contra `cesvi_r4_inversion_despues.json`):
  - idéntico en las 205 narraciones;
  - los mismos impactos: el mismo número en 71 de 135 (52.59 %) y el primero en 96 de 110 (87.27 %).

## Consecuencias

- Las escenas nuevas de la inversión llevan su resultado de Python como referencia de la paridad TS:
  - `fixtures/inversion/alcance_un_dano`, con un costado y un frente medidos, perfil y rigidez;
  - `fixtures/inversion/axa_alcance`, con el reposo de V2 marcado como supuesto. Con el multiarranque, ese reposo cabe con la deformación y hay una sola hipótesis;
  - `fixtures/inversion/axa_reposo_lejano`, con un reposo supuesto que la deformación no permite, la bandera de las dos hipótesis y la otra hipótesis.
- **Pendiente** (en PROGRESS, «Endurecimiento pendiente»):
  - en un alcance, el que golpea tiene que ir más rápido: falta esa restricción en la inversión. «Cuadra con el reposo supuesto» deja a V2 y V1 casi a la misma velocidad;
  - la elección de hipótesis no se guarda con el caso: se pierde al recargar la página.
