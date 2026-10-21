# ADR 0048 — El método de cálculo de CESVI y la discrepancia del dictamen A2010930

- **Estado:** aceptado (2026-10-20).
- **Contexto:** el prototipo para CESVI (`docs/cesvi/PROTOTIPO.md`, Hito 1) reproduce el dictamen A2010930 con su método y sus números. El dictamen imprime todos los datos de entrada del cálculo de McHenry y sus resultados, pero la energía no sale de esos datos.

## Decisión

### 1. El método, en `packages/cesvi`

- **McHenry de 2, 4 y 6 medidas, en una sola función:** las tres fórmulas del dictamen son la integral ∫ (A·C + ½·B·C² + A²/2B) dL con C lineal entre medidas equiespaciadas. Cada tramo de ancho L/(n−1) aporta A/2·(Ci + Ci+1) + B/6·(Ci² + Ci·Ci+1 + Ci+1²) + A²/2B; sumados, los extremos cuentan una vez y las medidas interiores dos. Una prueba lo compara con `crushEnergy` del solver.
- **La de 6 medidas va en su forma de libro.** La impresa tiene tres erratas evidentes: 2·C6 en lugar de C6, 2·C6² en lugar de C6², y «C2·C3·C3·C4» en lugar de C2·C3 + C3·C4. Con un perfil uniforme, la forma de libro da L·(A·C + B·C²/2 + A²/2B), lo que exige la integral; la impresa no.
- **Unidades:** el dictamen imprime A y B en «N/m» y la energía en «Julios», pero divide entre la masa en toneladas. Eso solo es consistente con A en kN/m, B en kN/m² y la energía en kJ, y así se muestran. Queda como pregunta para CESVI.
- **EBS** = √(2·E/m), **velocidad por desplazamiento** = √(2·a·g·D) y **comparación de velocidades**: la diferencia se mide respecto a la mayor. El umbral de «diferencia significativa» lo fija el perito; el dictamen no dice qué criterio usa, y el 10 % con que abre la página no es de CESVI.
- **La reproducción** compara cada número del reporte con el de Croquis, con su diferencia absoluta y en porcentaje. Un número coincide si da el del reporte con sus decimales, redondeando o truncando. El reporte trunca la EBS en m/s: √(2·220.1900228/1.431083) = 17.542093, que redondeado es 17.5421 y truncado, 17.5420.
- **La segunda opinión** usa la rigidez de pickups de E2 (pruebas frontales de NHTSA) con el mismo perfil de deformación. El intervalo es la EBS con los coeficientes de cada prueba, del percentil 10 al 90, sin azar. Va aparte y no reemplaza el cálculo de CESVI.

### 2. La discrepancia de la energía: se muestra, no se ajusta

- **Lo que pasa:** con la fórmula impresa y los datos impresos, la energía es 225.4541194 kJ contra 220.1900228 del reporte (+2.3907 %), y la velocidad de impacto es 63.90 km/h contra 63.15 (+1.19 %). Partiendo de la energía del reporte, Croquis da sus 63.15 km/h.
- **Las causas que se probaron** (`eval/cesvi_discrepancia.mjs`, resultado en `eval/results/cesvi_discrepancia.json`). Una explicación cuenta como exacta solo si da los 7 decimales impresos:
  - **Redondeo de las C impresas** (±0.005 m): la energía queda entre 222.8683067 y 228.0562028 kJ y no contiene la del reporte.
  - **Un dígito mal leído en L, A o B:** el más cercano, L = 1.649, da 220.1147678.
  - **Una o dos C distintas,** con la precisión impresa: ninguna a menos de 0.01 kJ.
  - **Variantes de la fórmula** (pesos, productos vecinos, término A²/2B, L/3 o L/4): la más cercana queda a 0.0129313 kJ.
  - **Resultado:** ninguna explicación exacta.
- **Lectura:** la energía del reporte no sale de sus datos impresos ni de un error de lectura o de redondeo; lo probable es que se calculara con datos que el reporte no imprime. La interfaz muestra los dos resultados y la explicación, y la lista de preguntas para CESVI pide el PDF original o la hoja de cálculo.

## Consecuencias

- **Pruebas:** `packages/cesvi` reproduce los números del dictamen. `caso.test.ts` busca cada cita del caso en el lote cuando el lote está en la máquina; en CI, donde no está por diseño, esa prueba se salta y lo dice.
- **Los siguientes casos** (33002049 y 6011-00229-7) no imprimen L, A ni B; hay que pedírselos a CESVI.
