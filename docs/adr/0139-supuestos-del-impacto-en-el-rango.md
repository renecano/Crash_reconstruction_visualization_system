# ADR 0139 · Tanda 3 · La restitución, la razón de impulso y el arrastre entran al rango

- **Estado:** aceptado (2026-11-15). En rama hasta el visto bueno de René (regla de W8: mueve rangos que ve CESVI).
- **Fecha:** 2026-11-15
- **Frente:** W (solver Python y port TS, con paridad)
- **Relacionados:** auditoría del 2026-11-15 (hallazgo C5, punto 9 del plan), ADR 0091 (supuestos declarados), ADR 0100 (el rango no depende del muestreo), ADR 0131 (los supuestos del tope, en su propio hipercubo).

## Contexto

El solver fijaba tres supuestos en un solo valor: la restitución entre vehículos (0.1), la razón de impulso (0.4) y el arrastre después del impacto (0.35 de la fricción llanta–pavimento). El muestreo del rango sorteaba la fricción, la masa y la evidencia, pero no estos tres. La auditoría lo marcó como crítico (C5): son supuestos que dominan el resultado y un perito contrario puede preguntar por qué el rango los deja fijos.

## Decisión

1. **Los nominales no cambian.** El mejor ajuste se calcula con 0.1, 0.4 y 0.35, como siempre: ninguna velocidad central se mueve.
2. **El Monte Carlo y la inversión sortean los tres en su rango,** uniforme:

   | Supuesto                                           | Nominal | Rango       | De dónde sale el rango                                                                                                                                                                                                                                                                 |
   | -------------------------------------------------- | ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Restitución entre vehículos                        | 0.1     | 0 a 0.3     | Brach, Brach y Pongetti (2014), SAE 2014-01-0469: 0 ≤ e ≤ 0.3 (media 0.13) en 40 pruebas contra barrera y 0 ≤ e ≤ 0.2 (media 0.06) en 9 entre vehículos. El nominal queda entre las dos medias                                                                                         |
   | Razón de impulso (impulso tangencial entre normal) | 0.4     | 0.29 a 0.49 | **Supuesto declarado.** La literatura no tabula un rango absoluto. Se arma con dos mediciones: razón crítica de 0.40 a 0.51 en cuatro pruebas frontales oblicuas (Cormier et al. 2021, SAE 2021-01-0896) por 72 % a 96 % de la crítica en los choques que deslizan (Brach et al. 2014) |
   | Arrastre después del impacto, como fracción de μ   | 0.35    | 0.3 a 0.5   | Fricke (2010), _Traffic Crash Reconstruction_: factores de arrastre después del impacto entre 0.3 y 0.5 de la fricción                                                                                                                                                                 |

3. **Van en un hipercubo latino aparte y de diseño fijo** (3 dimensiones), como los supuestos del tope. Los sorteos de los demás campos son los de siempre, y el rango sigue sin depender de la semilla de la escena (T3.1).
4. **El resultado los declara:** `parametros.restitucion_vehiculo_vehiculo`, `relacion_impulso_tangencial` y `arrastre_post_impacto` llevan ahora `rango` y `fuente` (el contrato ya los permitía: no cambia), y `incertidumbre.campos` los lista. La tabla de supuestos declarados que ve el perito, y la del dictamen, dicen los tres con su rango y su fuente.
5. **Python es la referencia; el port TS da lo mismo.** La paridad pasa en las 14 escenas canónicas, las de inversión y las de choque intermedio.

## Sobre la razón de impulso

El plan pedía sortear los tres. Para la razón de impulso no encontré un rango absoluto publicado: las mediciones la dan como fracción de la razón crítica de cada choque, y un trabajo reciente dice que no son valores tabulados que se puedan consultar. Inventar un rango iría contra la regla de no escribir números sin fuente. Se optó por armarlo con dos mediciones publicadas y declararlo como supuesto, con su justificación a la vista. Solo pesa cuando los vehículos deslizan uno contra otro; en un alcance centrado (AXA) el contacto es de adherencia y casi no cambia el resultado.

Si René prefiere dejarla fija y mostrar solo su sensibilidad, es quitar una de las tres dimensiones.

## Antes y después

AXA, como la reconstruye la app (32 simulaciones, 20 semillas; `eval/results/t3/axa_rango_estable_antes.json` contra `eval/results/axa_rango_estable.json`):

| AXA                              | Antes               | Después             | Como se lee en pantalla (enteros, ADR 0138) |
| -------------------------------- | ------------------- | ------------------- | ------------------------------------------- |
| V2 (B), antes del impacto        | 56.87 (54.79–78.39) | 56.87 (55.11–78.06) | 57 km/h (55–78), igual                      |
| V1 (A), antes del impacto        | 14.98 (0.80–16.45)  | 14.98 (1.04–21.38)  | 15 km/h (1–16) → 15 km/h (1–21)             |
| Hipótesis                        | 2                   | 2                   | —                                           |
| Movimiento entre las 20 semillas | 0 km/h              | 0 km/h              | —                                           |

El rango de V2 casi no se mueve: en la hipótesis visible su velocidad la fija la deformación medida, no el tramo después del impacto. El de V1 sí se ensancha hacia arriba.

## Consecuencias

- Se regeneraron los resultados de referencia (14 escenas, inversión, choque intermedio) y los paquetes caso-3d.
- **Falta medir en la computadora del colaborador** (pesado): la E-R4 (205 narraciones de prueba y 459 de desarrollo) y las carambolas con el solver nuevo. Sus cifras publicadas son de modalidad y de reproducción del método, que no dependen del rango; se confirma con la corrida.
- La escena «AXA con agentes» (N4 de la auditoría) se regenera al final de la tanda, con la inversión ya definitiva.

## Addendum (2026-11-15): visto bueno de René, con dos cambios

René aprobó la tanda y pidió dos cambios antes de fusionar:

1. **El nombre de la hipótesis visible.** Ya no se llama «Cuadra con el daño medido»: la misma pantalla dice que queda en el borde bajo de lo que pide la deformación (en AXA, 30 km/h de cambio de velocidad contra al menos 30–90; 34 % de la energía de la mediana). Se llama **«La más cercana al daño medido»** en Reconstrucción, Contra CESVI, Presentar, el dictamen (PDF y Word), el mensaje del solver (Python y TS) y el índice de cifras (`axa.hipotesis_visible`). Sigue siendo la más cercana: la otra, «Cuadra con el reposo supuesto», da a B un cambio de velocidad de 3 km/h y no alcanza la banda. Esa conserva su nombre, porque sí cuadra con el reposo (queda a 0.2 m).
2. **El límite de cobertura, a la vista.** Cuando hay un rango, los límites de la reconstrucción (y con ellos el dictamen) dicen cuántas veces el p10–p90 contuvo la velocidad verdadera en los casos fabricados, contra el 80 % esperado. La cifra sale del índice único (`cobertura.rango` en `eval/results/cifras.json`): hoy, la corrida reducida (82 de 116, 70.7 %). Cuando llegue la de 200 casos por escena (`eval/results/t3_cobertura.json`), `node eval/cifras.mjs` la toma y el texto cambia solo; el verificador falla si el índice no se regeneró.

**La razón de impulso se queda sorteada** (0.29 a 0.49) como supuesto declarado.

Las descripciones de `resultado.schema.json` y `caso3d.schema.json` todavía dicen «cuadra con el daño medido»: son archivos compartidos y se corrigen en el PR `chore:` que sigue.
