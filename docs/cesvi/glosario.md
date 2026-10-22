# Glosario de Croquis para CESVI

Términos que Croquis usa con los peritos de CESVI. Mandan sobre cualquier texto que se vea en la aplicación, el PDF, el Word, el video y las maquetas.

## Reporte y dictamen (pedido por CESVI, 2026-10-22)

| Término                | Qué es                                                                                            | Ejemplos                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Reporte** (de CESVI) | El documento que CESVI ya hizo del caso, con su análisis y sus conclusiones.                      | «Croquis contra el reporte de CESVI», «Reproducción del reporte», «Cargar un reporte», «el reporte no da coordenadas». |
| **Dictamen**           | Lo que produce Croquis: el documento que el perito revisa, firma y descarga (paso 8, PDF y Word). | «Paso 8 · Dictamen», «Borrador del dictamen», «el dictamen es del perito».                                             |
| **Declaración**        | Lo que dice el conductor (su versión del hecho).                                                  | «Declaración del conductor A».                                                                                         |

- **Nunca** se escribe «dictamen de CESVI», «dictámenes de CESVI» ni «dictamen original» para el documento de CESVI: es el reporte.
  - La prueba `apps/web/src/lib/terminologia.test.ts` falla si alguno de esos textos (o «contra el dictamen», «reproducción del dictamen») aparece en la interfaz, en el código que arma el PDF y el Word, en el guion del video (voz y subtítulos) o en las maquetas.
  - `apps/web/src/lib/dictamen-cesvi.test.ts` revisa lo mismo en el dictamen del caso de ejemplo, ya armado.
  - **Excepción:** los prompts de Claude (`SISTEMA_*`) no se ven y están versionados. Cambiarlos invalidaría las evaluaciones medidas con ellos (E-R1, E-R4), así que se quedan. El de las consideraciones sí cambió (`consideraciones-v3`), porque su texto sale en el dictamen.
- **Los identificadores de código y los nombres de archivos de datos** pueden seguir diciendo `dictamen` (por ejemplo `dictamenes-r4.ts`, `data/cesvi/r4/`, `fuente: "dictamen"`): no se ven.
- **Los textos citados de un reporte** se copian tal como están, aunque digan «DICTAMEN TÉCNICO»: es la cita literal del documento de CESVI.
- **La narración que recibió Croquis**, en «Reproducción de reportes», se muestra tal como se le dio. En 46 de los 205 casos dice «el dictamen» para referirse al reporte de CESVI: la redactó Claude en R0 con el prompt congelado `narracion-cesvi-v1`. Cambiarla mostraría una entrada distinta de la que se midió en E-R4.
- **R4 y R5** se llaman «Croquis reproduce los reportes de CESVI» y «Cargar un reporte» (`PLAN-CESVI.md`).
