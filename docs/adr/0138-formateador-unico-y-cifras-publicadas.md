# ADR 0138 · Tanda 3 · Un solo formateador y un solo índice de cifras

- **Estado:** aceptado (2026-11-15). En rama hasta el visto bueno de René (regla de W8: cambia lo que ve CESVI).
- **Fecha:** 2026-11-15
- **Frente:** W
- **Relacionados:** auditoría del 2026-11-15 (`docs/auditoria/2026-11-15-fable.md`, §3 y punto 12 del plan), ADR 0100 (el rango no depende del muestreo), ADR 0135 (AXA a dos hipótesis).

## Contexto

La auditoría encontró la misma cantidad escrita de formas distintas (N8: «56.9 km/h» y «15» en la comparación con la declaración, 56.87 y 14.98 en el resto), cifras en documentos que ya no eran las de `eval/results` (N2, N5, N6) y dos juegos de simulaciones sin rótulo (N3). René decidió (2026-11-15, decisión 5): la conclusión de la reconstrucción va en enteros con su rango; la tabla que reproduce el método de CESVI conserva dos decimales; un solo formateador.

## Decisión

### 1. Un solo formateador: `packages/cesvi/src/formato.ts`

Pantalla, PDF y Word escriben cada cifra con sus funciones. Tiene dos precisiones:

| Precisión        | Qué escribe                                                                                              | Cómo          |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ------------- |
| `reconstruccion` | Lo que concluye la reconstrucción física: velocidades, sus rangos y sus diferencias contra otra cifra    | Enteros       |
| `metodo`         | La tabla que reproduce el método de CESVI con los datos del reporte, y su comparación con lo que imprime | Dos decimales |

- **Por qué enteros:** el p10–p90 se mueve cerca de 1 km/h entre semillas (T3.1) y varios km/h con los supuestos. Dos decimales aparentaban una certeza que no hay.
- **Por qué dos decimales en el método:** así los escribe CESVI, y una diferencia de centésimas contra el reporte debe verse (regla permanente: toda diferencia con un reporte se muestra con su valor y su porcentaje).
- **El redondeo es el usual,** no hacia afuera: el borde del rango tiene ruido de muestreo del mismo tamaño que el redondeo, así que redondear hacia afuera no lo haría más cierto.
- **Solo cambia lo que se escribe.** Los cálculos, los atributos `data-*`, los JSON y `eval/results` conservan el número completo.
- **Los supuestos con fuente llevan los decimales de su fuente** (la reversa, 5.68 km/h, de 3.06 a 9.07): no son una conclusión de la reconstrucción.
- **Una diferencia entre la reconstrucción y una cifra del reporte** va en enteros, como la reconstrucción («−6 km/h (−10 %)»); la cifra del reporte se escribe como la imprime CESVI.
- **Vigilancia:** `formato.test.ts` falla si hay un `toFixed` fuera de `formato.ts` en el paquete, en las pantallas de `/cesvi`, en la portada o en lo de `apps/web/src/lib` que usa el paquete. La animación de la portada queda fuera: redondea posiciones de CSS, no cifras.

### 2. Las simulaciones, en el dato

`muestrasDe(r)` lee del resultado con cuántas simulaciones se calculó el rango y dice si son las de producción (32) o las de referencia (12). El dictamen lo escribe bajo la tabla de velocidades. `reconstruirExpediente` documenta que usa las de referencia y acepta las de producción.

### 3. Un índice de cifras publicadas: `eval/results/cifras.json`

`eval/cifras.mjs` lo genera desde `eval/results`: cada cifra con su valor, su denominador si es una tasa, sus simulaciones si es un rango, y el archivo y el campo de donde sale. Trae también la lista de cifras retiradas.

`eval/verificar_cifras.mjs` (solo lee; milisegundos) falla si el índice no está al día, si una cifra marcada en un documento vigente (`<!--cifra:clave-->…<!--/cifra-->`) no es la del índice, o si un documento vigente trae una cifra retirada sin «antes» o una fecha en la misma línea. Corre con las pruebas (`packages/cesvi/src/cifras.test.ts`), así que ya entra en CI.

Documentos vigentes: `README.md`, `docs/ESTADO.md`, `docs/physics.md`, `docs/data.md` y el bloque «Ahora» de `docs/PROGRESS.md`. `docs/cesvi/PLAN-CESVI.md` entra con un PR `chore:` propio, porque es un archivo compartido y hay que corregirle dos líneas.

## Lo que no se hizo

- **No se movió `eval/results/` a subcarpetas por fecha.** Muchos guiones y documentos apuntan a esas rutas. En su lugar, el índice dice cuáles archivos son los vigentes y el verificador detecta la cita de una cifra retirada.
- **Las capas de ingeniería del modo foto de Unity** escriben sus números en C#, fuera de este formateador. Se alinean cuando se rehagan las fotos (Tanda 2).

## Consecuencias

- AXA se lee «57 km/h (55–78)» donde decía «56.87 (54.79–78.39)». El número completo sigue en `eval/results/axa_rango_estable.json` y en el índice (`axa.v2.texto_completo`).
- Pruebas unitarias y e2e actualizadas al formato nuevo; las e2e toman lo esperado del mismo formateador.
