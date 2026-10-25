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

**Ahora** (`eval/results/axa_diagnostico.json`), con la masa de V1 de su ficha técnica (2,562.1 kg, punto medio de la Silverado 2500 HD 2007 de cuatro puertas; data/SOURCES.md):

1. **Con el reposo de V2 como dato** (sin la marca), la deformación ya pesa como restricción. El paso 6:

   | Método del reporte               | CESVI      | Croquis    | Diferencia            |
   | -------------------------------- | ---------- | ---------- | --------------------- |
   | Deformación (EBS)                | 63.15 km/h | 65.94 km/h | +2.79 km/h (+4.42 %)  |
   | Restos (V1 al salir del impacto) | 60.27 km/h | 42.77 km/h | −17.5 km/h (−29.04 %) |

2. **Con el reposo de V2 marcado como supuesto** (lo que es: el reporte no lo da), no caben juntos y hay dos hipótesis:

   | Hipótesis                     | V2                                | V1 al salir del impacto       | V2 y su reposo supuesto | Deformación   |
   | ----------------------------- | --------------------------------- | ----------------------------- | ----------------------- | ------------- |
   | Cuadra con el daño medido     | 62.77 km/h (−0.38 km/h, −0.60 %)  | 38.96 km/h (−21.31, −35.36 %) | a 5 m                   | la alcanza    |
   | Cuadra con el reposo supuesto | 41.9 km/h (−21.25 km/h, −33.65 %) | 41.68 km/h (−18.59, −30.84 %) | a 0.2 m                 | no la alcanza |

   Los porcentajes de V2 son contra el EBS de 63.15 y los de V1 contra los 60.27 de los restos. En «cuadra con el daño medido», V2 queda fijada (σ local de 2.48 km/h) y V1 va a 23.75 km/h antes del impacto. En «cuadra con el reposo supuesto», V2 y V1 van casi a la misma velocidad antes del impacto (41.9 y 41.82 km/h): sin cierre no hay deformación.

   El −0.60 % de «cuadra con el daño medido» no se buscó: sale de la regla, la ficha de V1 y los datos del reporte, sin ajustar nada a 63.15.

**Lo que queda es de método y de datos, no de error:**

- **El 63.15 no es la velocidad a la que circulaba V2.** Es la equivalencia de barrera de su energía de deformación, √(2E/m), con la masa de V2 sola. El 60.27 es la velocidad de V1 al salir del impacto, deslizando juntos con a = 0.9. El solver calcula la velocidad a la que circulaba V2, por momento y trayectorias, con llantas que ruedan después del impacto (arrastre de 0.35 de la fricción).
- **Faltan datos en el reporte:**
  - el reposo de V2, que se le pide a CESVI junto con las huellas de frenado o arrastre (PROGRESS, «Bloqueado»);
  - la masa de V1, que se toma de su ficha técnica.
- **Con la deformación del reporte** (225.45 kJ) y esa masa, la velocidad de cierre debe ser al menos 79.78 km/h. El ajuste del reposo como dato no es un mínimo local: costo 9.29 desde el arranque por omisión, contra 25.2 desde el cierre mínimo.

**Antes y después de la regla, fuera de AXA:**

- **Escenas canónicas** (`eval/results/inversion_prioridad.json`): 13 de 13 dan las mismas estimaciones y el mismo resultado. Solo cambia `version_resultado`, y 5 traen la clave nueva `ajuste_completo`, porque en ellas la evidencia no fija algún parámetro.
- **Paridad:** Python al día y 19 pruebas de paridad TS en verde.
- **E-R4 con la inversión** (`cesvi_r4_inversion_antes.json` y `cesvi_r4_inversion_despues.json`, la prueba congelada de 205 narraciones):
  - el detalle es idéntico en los 205;
  - las narraciones no colocan a los vehículos en el mapa, así que la inversión solo tiene evidencia en 1 de ellas (unas marcas de frenado) y no fija ninguna velocidad;
  - los impactos coinciden igual que antes: mismo número en 71 de 135 (52.59 %) y primer impacto en 96 de 110 (87.27 %).
  - Nada empeora; tampoco mejora, porque sin posiciones la regla no tiene sobre qué actuar.

## Consecuencias

- Las escenas nuevas de la inversión llevan su resultado de Python como referencia de la paridad TS:
  - `fixtures/inversion/alcance_un_dano`, con un costado y un frente medidos, perfil y rigidez;
  - `fixtures/inversion/axa_alcance`, con el reposo de V2 marcado como supuesto, la bandera de las dos hipótesis y la otra hipótesis.
- **Pendiente** (en PROGRESS, «Endurecimiento pendiente»):
  - en un alcance, el que golpea tiene que ir más rápido: falta esa restricción en la inversión. «Cuadra con el reposo supuesto» deja a V2 y V1 casi a la misma velocidad;
  - la elección de hipótesis no se guarda con el caso: se pierde al recargar la página.
