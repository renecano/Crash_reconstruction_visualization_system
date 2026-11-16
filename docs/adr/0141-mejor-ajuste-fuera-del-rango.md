# ADR 0141 · Un mejor ajuste fuera de su rango se dice

- **Estado:** aceptado (2026-11-15)
- **Fecha:** 2026-11-15
- **Frente:** W (`packages/cesvi`, pantalla de la reconstrucción)
- **Relacionados:** ADR 0135 (rumbo que la evidencia no fija), ADR 0139 (supuestos del impacto en el rango), ADR 0100 (el rango no depende del muestreo), auditoría del 2026-11-15 (N15)

## Contexto

Al probar el build nuevo del visor, la pantalla del caso de ejemplo con poste mostró «B · Camaro 102 km/h, rango 72–99»: un mejor ajuste fuera de su propio rango, sin ninguna explicación. No es un error de cálculo. El mejor ajuste usa la evidencia y los supuestos en su valor nominal; el rango es el p10–p90 de las simulaciones, que los sortean dentro de su incertidumbre. Cuando la solución depende mucho de ellos, el nominal puede quedar fuera.

En ese caso hay dos soluciones casi empatadas (A 40 y B 102 km/h con costo 19.0; A 34 y B 27 con costo 20.4) y ninguna cuadra bien con los reposos (residuos de hasta 6.9 σ).

## Decisión

1. **No se cambia ningún número.** Ni el mejor ajuste ni el rango.
2. **Se dice.** Si el mejor ajuste de una velocidad queda más de 0.5 km/h fuera del p10–p90 de sus simulaciones (`mejorFueraDelRango`, `packages/cesvi/src/mejor-fuera.ts`), la reconstrucción lleva un límite con las dos cifras y con lo que conviene hacer, y la pantalla lo avisa junto a la cifra. El límite sale también en el dictamen, como los demás.
3. **La holgura de 0.5 km/h** es lo que el redondeo a enteros puede esconder: «57 (57–78)» no es un mejor ajuste fuera del rango.

## Consecuencias

- AXA no cambia: sus dos velocidades quedan dentro (56.87 en 55.11–78.06 y 14.98 en 1.04–21.38).
- En los 205 reportes de la prueba, reconstruidos solo con su narración, el aviso no aparece: ninguno tiene rango (`eval/results/mejor_fuera.json`). Aparece en casos que el perito coloca en el mapa.

## Lo que queda abierto

- **Si el rango debería mostrarse de otra forma en estos casos** (por ejemplo, ofrecer la segunda solución como alternativa aunque su costo quede a más de 0.5 de la primera). Eso sí movería lo que ve el perito y es decisión de René.
- **Qué tan seguido pasa en casos reales colocados.** Solo hay dos casos colocados medidos: AXA (dentro) y el de ejemplo con poste (fuera).
