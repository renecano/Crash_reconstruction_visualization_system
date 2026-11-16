# Estado de Croquis

**Fecha:** 2026-11-15. **Para:** quien retome el proyecto o quiera saber, en dos páginas, qué hay y qué falta.

Croquis reconstruye hechos de tránsito con física a partir de lo que narra el perito, para los peritos de CESVI México. El plan vigente es [`docs/cesvi/PLAN-CESVI.md`](cesvi/PLAN-CESVI.md) (v4). La auditoría del 2026-11-15 ([`docs/auditoria/2026-11-15-fable.md`](auditoria/2026-11-15-fable.md)) ordenó el trabajo en cinco tandas; este archivo dice en qué quedó cada una.

Las cifras de este archivo salen de `eval/results/`. Las marcadas están atadas al índice `eval/results/cifras.json` y las revisa `node eval/verificar_cifras.mjs`.

## Qué funciona hoy en producción

Sitio: <https://croquis-sage.vercel.app/cesvi>.

- **El flujo del perito, completo:** narrar, colocar en el mapa, reconstruir, ver en 3D, comparar con el reporte de CESVI y con la declaración de un conductor, y sacar el dictamen en PDF y Word.
- **El caso de AXA (A2010930):** V2 a <!--cifra:axa.v2-->57 km/h (55–78)<!--/cifra--> y V1 a <!--cifra:axa.v1-->15 km/h (1–21)<!--/cifra-->, con <!--cifra:axa.hipotesis-->2<!--/cifra--> hipótesis. La que se ve sin elegir se llama «<!--cifra:axa.hipotesis_visible-->La más cercana al daño medido<!--/cifra-->».
- **La reproducción de reportes:** los <!--cifra:er4.prueba-->205<!--/cifra--> de la prueba congelada se reconstruyen y se ven en 3D. La modalidad coincide con el título del reporte en <!--cifra:er4.modalidad_titulo-->91 de 156 (58.3 %)<!--/cifra-->.
- **El visor Unity en la web,** con edición en 3D que vuelve a correr el solver, con controles de reproducción (pausar, deslizador, ¼× ½× 1×, ir al impacto, ver todo, repetir) y con el daño del solver en la carrocería después del impacto (U8, ADR 0117; build `e06bdd73b0ce3706`). El visor de escritorio está en un release de GitHub y es anterior al daño.
- **La reversa:** quien retrocede sin velocidad dicha se reconstruye a <!--cifra:reversa.velocidad-->5.68 km/h (3.06–9.07)<!--/cifra-->, como supuesto con su fuente.
- **Lo que el perito lee sobre la confianza:** qué evidencia fija cada número, qué es supuesto, qué parte de la deformación medida explica la reconstrucción y que el rango contuvo la velocidad verdadera <!--cifra:cobertura.rango-->82 de 116 (70.7 %)<!--/cifra--> de las veces (lo esperado es cerca de 80 %).

## Qué está en el código y todavía no en producción

- **El visor de escritorio con el daño.** El release de GitHub es anterior a U8: hay que compilarlo de nuevo para las fotos de promoción.

## Las cinco tandas de la auditoría

| Tanda                            | Qué                                                                                                                    | Estado                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1 · Confianza inmediata          | Redactor que conserva las cifras, portada con la tasa completa, generados verificados en CI, dictamen                  | Hecha (#223 a #226)                                                                       |
| 3 · Números defendibles          | Formateador único, índice de cifras con verificador, supuestos del impacto en el rango, energía contra daño, cobertura | Hecha (#227 a #229). Falta la corrida completa del colaborador                            |
| 2 · Lo que el perito ve en el 3D | Daño del solver en Unity, controles de reproducción, leyenda siempre                                                   | Hecha (#230 y el build publicado). Faltan las fotos de promoción y volver a medir los fps |
| 4 · Proceso y seguridad          | Páginas anteriores, encabezados, tope de gasto, protección de `main`, Dependabot                                       | Hecha (#231 a #233)                                                                       |
| 5 · Cierre (U7)                  | README, este archivo, `physics.md`, E8 de nuevo, pruebas de reversa y de «Claude no disponible»                        | Hecha, salvo el ensayo del guion de la demo                                               |

## Medido

| Qué                                                                     | Resultado                                                                                                                                                                    | Archivo en `eval/results/`  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Paridad del solver TS con la referencia Python                          | <!--cifra:paridad.numeros-->89,710<!--/cifra--> números en <!--cifra:paridad.escenas-->14<!--/cifra--> escenas, diferencia máxima <!--cifra:paridad.max_abs-->0<!--/cifra--> | `e7_parity.json`            |
| AXA, estabilidad entre 20 semillas                                      | 0 km/h de diferencia en el mejor ajuste y en el rango                                                                                                                        | `axa_rango_estable.json`    |
| AXA, resultado completo en el navegador (laptop de 8 GB)                | mediana de 5.1 s en tres corridas (2026-11-15)                                                                                                                               | `axa_tiempo_navegador.json` |
| El mismo resultado en Chromium, Firefox y WebKit (E8, 2026-11-15)       | idéntico bit a bit en 14 de 14 escenas, el solver y el horneado                                                                                                              | `e8_determinism.json`       |
| Tanda 3 contra las referencias                                          | solo cambian rangos; ningún mejor ajuste se mueve                                                                                                                            | `w8/t3_comparacion.json`    |
| Visor Unity web, nivel medio, Intel UHD, 1080p (build anterior al daño) | 64.7 y 62.1 fps en la escena de referencia; 59.6 y 56.3 en carambola                                                                                                         | `e6_unity_media.json`       |
| Build web publicado, con el daño (laptop, 20 Mbps)                      | 69.4 MB (31.2 con Brotli); arranca en 12.7 s y muestra el caso 8.9 s después                                                                                                 | `unity_build.json`          |
| Reserva del tope de gasto por lectura                                   | narración 0.37 USD; importar, 0.77 USD de mediana                                                                                                                            | `reserva_tope.json`         |

CI: cinco checks obligatorios (lint, tipos y pruebas de TS; Python en dos partes; `Croquis.Core`; e2e de los flujos principales en Chromium), con la regla de que el CI completo tarde menos de 10 minutos. Los builds de Unity no corren en CI.

## Qué falta, en orden

1. **Las fotos de promoción con el daño** (15 del modo foto, con el visor de escritorio recompilado, y el recorrido de día y de noche), y **volver a medir los fps** con el build publicado.
2. **La corrida del colaborador de la Tanda 3** (E-R4 completa, carambolas y cobertura con 200 casos). Al llegar la rama `resultados/t3-<fecha>`: `python eval/t3_comparar.py t3 t3_rtx` y `node eval/cifras.mjs`; la cifra de cobertura se actualiza sola.
3. **`eval/results/laboratorio_axa.json`:** lo escribe una e2e manual; se vuelve a correr antes de la demo.
4. **W9:** las relecturas grabadas y el prompt del corpus, con tope de 20 USD. Incluye rehacer el corpus con el redactor nuevo.
5. **Ensayo del guion de la demo** con CESVI.
6. **Lo menor:** fusionar los PR agrupados de Dependabot cuando lleguen en verde; volver obligatoria la política de contenido; lo demás está en `docs/PROGRESS.md`, «Endurecimiento pendiente».

## Bloqueado: necesita a René

| Qué                                                                                                                                                                                        | Para qué                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Revisar el tope de gasto diario de Claude en Vercel (hoy 2 USD) contra las reservas medidas                                                                                                | Que no se niegue una lectura con presupuesto todavía disponible |
| Decidir cómo se muestra un caso cuyo mejor ajuste queda fuera de su rango (hoy lleva un aviso, ADR 0141), y confirmar si el 60.62 km/h del caso de ejemplo con poste se usó en alguna demo | Que una cifra y su rango no parezcan contradecirse              |
| Visto bueno para borrar las ramas remotas ya fusionadas                                                                                                                                    | Orden del repositorio                                           |
| Que el colaborador corra el paquete de la Tanda 3 (`CORRER-TANDA-EN-RTX.bat`)                                                                                                              | Cerrar la Tanda 3 con la corrida completa                       |

La tabla completa, con fechas, está en `docs/PROGRESS.md`, «Bloqueado — necesita a René».

## Límites que conviene tener presentes

- La narración manda: si no dice quién retrocedía o no trae el ancho dañado, Croquis no lo adivina.
- El rango no es una garantía (cobertura de arriba) y la rigidez por clase viene de pruebas de vehículos de Estados Unidos.
- El mejor ajuste puede quedar fuera de su rango cuando la solución depende mucho de los supuestos; la app lo avisa con las dos cifras (ADR 0141). El caso de ejemplo con poste es así desde W8.
- Una volcadura se decide, pero su giro no se integra en el tiempo; el 3D la ilustra.
- `/cesvi` es público y no hay cuentas.

La lista completa está en el [README](../README.md), «Límites».

## Dónde está cada cosa

- **Bitácoras:** `docs/progress/U.md` (visor Unity, contratos, integración) y `docs/progress/W.md` (web y física). `docs/PROGRESS.md` es el índice y guarda la historia.
- **Decisiones:** `docs/adr/` (U del 0110 al 0129; W del 0130 al 0169).
- **Física:** `docs/physics.md`. **Datos:** `docs/data.md` y `data/SOURCES.md`. **IA responsable:** `docs/responsible-ai.md`.
- **Lo anterior a CESVI:** `docs/historial/`.
