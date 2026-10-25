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
   - salta si el ΔV de la reconstrucción queda por debajo del p10 de ese mínimo, y solo si la evidencia fija la velocidad del vehículo;
   - usa la misma regla de cruce de p10–p90 que `dano_vs_velocidad`, sin umbral nuevo.
5. **La reconstrucción contra el reporte** (`reconstruccionContraCesvi`) va en el paso 6, sobre el 3D y en el dictamen. Cada velocidad del reporte se pone junto a la que mide lo mismo que pueda medir el solver:
   - el EBS, con la velocidad previa;
   - los restos, con la velocidad de V1 al salir del impacto.

   Cada fila lleva su diferencia en km/h y en %, una línea de por qué los métodos no coinciden y, si salta la bandera, el aviso con sus números.

## Resultado (medido, `eval/results/axa_diagnostico.json`)

**Antes y después:**

- Antes del arreglo, V2 daba 41.01 km/h con 4 muestras, con los tres errores.
- Después, V2 da 43.39 km/h con 4 muestras y no queda ningún error.

**Lo que ve el perito** (la reconstrucción completa de la app):

| Método del reporte               | CESVI      | Croquis    | Diferencia             |
| -------------------------------- | ---------- | ---------- | ---------------------- |
| Deformación (EBS)                | 63.15 km/h | 43.34 km/h | −19.81 km/h (−31.37 %) |
| Restos (V1 al salir del impacto) | 60.27 km/h | 39.83 km/h | −20.44 km/h (−33.91 %) |

**Lo que queda es de método y de datos, no de error:**

- **El 63.15 no es la velocidad a la que circulaba V2.** Es la equivalencia de barrera de su energía de deformación, √(2E/m), con la masa de V2 sola. El 60.27 es la velocidad de V1 al salir del impacto, deslizando juntos con a = 0.9. El solver calcula la velocidad a la que circulaba V2, por momento y trayectorias, con llantas que ruedan después del impacto (arrastre de 0.35 de la fricción).
- **Faltan datos en el reporte:** la masa de V1 (se usa la típica de su clase, 1890 kg) y el reposo de V2 (supuesto: detrás de V1, tocándolo, que es el supuesto del método de los restos).
- **El ajuste no alcanza la deformación.** Con la deformación del reporte (225.45 kJ), la velocidad de cierre debe ser al menos 84.71 km/h; en el ajuste es de 4.7 km/h, con un residuo de `dano_minimo` de −2.38σ, y salta la bandera.
- **No es un mínimo local:**
  - desde un arranque compatible con la deformación (V2 a 84.71 km/h, V1 detenido), el ajuste llega a V2 84.14 km/h y V1 0.66 km/h, con costo 9.86;
  - desde el arranque por omisión, el costo es 2.82.

  Con la restitución y las llantas que ruedan del solver, un cierre que alcanza la deformación separa a los vehículos y deja a V2 lejos del reposo supuesto. El supuesto que pesa es ese reposo, que el reporte no da.

**Por qué no se cambian los pesos:**

- La posición final pesa con σ = 1 m (el supuesto de la inversión para posiciones declaradas).
- El daño pesa con la σ del error del modelo calibrado con CISS.
- Cambiar uno de los dos para que gane la deformación sería ajustar para que cuadre. Lo honesto es mostrar el conflicto y que el perito revise el supuesto.

## Consecuencias

- Las 13 escenas canónicas no cambian, salvo `version_resultado`: ninguna tiene la deformación de un solo vehículo.
- Hay dos escenas nuevas de la inversión, con su resultado de Python como referencia de la paridad TS:
  - `fixtures/inversion/alcance_un_dano`, con un costado y un frente medidos, perfil y rigidez;
  - `fixtures/inversion/axa_alcance`, con la bandera.
- **Pendiente** (en PROGRESS, «Endurecimiento pendiente»):
  - con V2 en reposo en el punto de impacto (una variante del diagnóstico, no la de la demo), el ajuste de menor costo deja a V2, que va detrás, más lento que V1 (27.32 contra 41.66 km/h);
  - en un alcance, el que golpea tiene que ir más rápido: falta esa restricción en la inversión.
