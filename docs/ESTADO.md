# Estado de Croquis

**Fecha:** 2026-11-15. **Para:** quien retome el proyecto o quiera saber, en dos páginas, qué hay y qué falta.

Croquis reconstruye hechos de tránsito con física a partir de lo que narra el perito, para los peritos de CESVI México. El plan vigente es [`docs/cesvi/PLAN-CESVI.md`](cesvi/PLAN-CESVI.md) (v4). La auditoría del 2026-11-15 ([`docs/auditoria/2026-11-15-fable.md`](auditoria/2026-11-15-fable.md)) ordenó el trabajo en cinco tandas; este archivo dice en qué quedó cada una.

Las cifras de este archivo salen de `eval/results/`. Las marcadas están atadas al índice `eval/results/cifras.json` y las revisa `node eval/verificar_cifras.mjs`.

## Qué funciona hoy en producción

Sitio: <https://croquis-sage.vercel.app/cesvi>.

- **El flujo del perito, completo:** narrar, colocar en el mapa, reconstruir, ver en 3D, comparar con el reporte de CESVI y con la declaración de un conductor, y sacar el dictamen en PDF y Word.
- **El caso de AXA (A2010930):** V2 a <!--cifra:axa.v2-->57 km/h (55–78)<!--/cifra--> y V1 a <!--cifra:axa.v1-->15 km/h (1–21)<!--/cifra-->, con <!--cifra:axa.hipotesis-->2<!--/cifra--> hipótesis. La que se ve sin elegir se llama «<!--cifra:axa.hipotesis_visible-->La más cercana al daño medido<!--/cifra-->».
- **La reproducción de reportes:** los <!--cifra:er4.prueba-->205<!--/cifra--> de la prueba congelada se reconstruyen y se ven en 3D. La modalidad coincide con el título del reporte en <!--cifra:er4.modalidad_titulo-->91 de 156 (58.3 %)<!--/cifra-->.
- **El visor Unity en la web,** con edición en 3D que vuelve a correr el solver y con controles de reproducción (pausar, deslizador, ¼× ½× 1×, ir al impacto, ver todo, repetir). El visor de escritorio está en un release de GitHub.
- **La reversa:** quien retrocede sin velocidad dicha se reconstruye a <!--cifra:reversa.velocidad-->5.68 km/h (3.06–9.07)<!--/cifra-->, como supuesto con su fuente.
- **Lo que el perito lee sobre la confianza:** qué evidencia fija cada número, qué es supuesto, qué parte de la deformación medida explica la reconstrucción y que el rango contuvo la velocidad verdadera <!--cifra:cobertura.rango-->82 de 116 (70.7 %)<!--/cifra--> de las veces (lo esperado es cerca de 80 %).

## Qué está en el código y todavía no en producción

- **El daño del solver en el 3D** (U8, ADR 0117). El visor ya deforma la carrocería con el perfil de aplastamiento del resultado, y lo prueban `dotnet test` y las pruebas de Unity en modo batch. Falta compilar el build web y publicarlo: hasta entonces el 3D de producción muestra los vehículos sin deformar.

## Las cinco tandas de la auditoría

| Tanda                            | Qué                                                                                                                    | Estado                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1 · Confianza inmediata          | Redactor que conserva las cifras, portada con la tasa completa, generados verificados en CI, dictamen                  | Hecha (#223 a #226)                                            |
| 3 · Números defendibles          | Formateador único, índice de cifras con verificador, supuestos del impacto en el rango, energía contra daño, cobertura | Hecha (#227 a #229). Falta la corrida completa del colaborador |
| 2 · Lo que el perito ve en el 3D | Daño del solver en Unity, controles de reproducción, leyenda siempre                                                   | Código hecho (#230). Faltan el build, las capturas y las fotos |
| 4 · Proceso y seguridad          | Páginas anteriores, encabezados, tope de gasto, protección de `main`, Dependabot                                       | Hecha (#231 a #233)                                            |
| 5 · Cierre (U7)                  | README, este archivo, `physics.md`, pruebas de reversa y de «Claude no disponible»                                     | En curso                                                       |

## Medido

| Qué                                                      | Resultado                                                                                                                                                                    | Archivo en `eval/results/`  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Paridad del solver TS con la referencia Python           | <!--cifra:paridad.numeros-->89,710<!--/cifra--> números en <!--cifra:paridad.escenas-->14<!--/cifra--> escenas, diferencia máxima <!--cifra:paridad.max_abs-->0<!--/cifra--> | `e7_parity.json`            |
| AXA, estabilidad entre 20 semillas                       | 0 km/h de diferencia en el mejor ajuste y en el rango                                                                                                                        | `axa_rango_estable.json`    |
| AXA, resultado completo en el navegador (laptop de 8 GB) | mediana de 5.1 s en tres corridas (2026-11-15)                                                                                                                               | `axa_tiempo_navegador.json` |
| Tanda 3 contra las referencias                           | solo cambian rangos; ningún mejor ajuste se mueve                                                                                                                            | `w8/t3_comparacion.json`    |
| Visor Unity web, nivel medio, Intel UHD, 1080p           | 64.7 y 62.1 fps en la escena de referencia; 59.6 y 56.3 en carambola                                                                                                         | `e6_unity_media.json`       |
| Reserva del tope de gasto por lectura                    | narración 0.37 USD; importar, 0.77 USD de mediana                                                                                                                            | `reserva_tope.json`         |

CI: cinco checks obligatorios (lint, tipos y pruebas de TS; Python en dos partes; `Croquis.Core`; e2e de los flujos principales en Chromium), con la regla de que el CI completo tarde menos de 10 minutos. Los builds de Unity no corren en CI.

## Qué falta, en orden

1. **Build web del visor con el daño,** publicarlo, y las capturas de AXA después del impacto. Con eso se arma el paquete de fotos del colaborador (15 del modo foto y el recorrido de día y de noche).
2. **La corrida del colaborador de la Tanda 3** (E-R4 completa, carambolas y cobertura con 200 casos). Al llegar la rama `resultados/t3-<fecha>`: `python eval/t3_comparar.py t3 t3_rtx` y `node eval/cifras.mjs`; la cifra de cobertura se actualiza sola.
3. **E8 de nuevo** (determinismo en tres navegadores): la última corrida es del 18 de octubre, anterior al hipercubo, al multiarranque y a la reversa. Es pesada: va en el paquete del colaborador.
4. **`eval/results/laboratorio_axa.json`:** lo escribe una e2e manual; se vuelve a correr antes de la demo.
5. **W9:** las relecturas grabadas y el prompt del corpus, con tope de 20 USD. Incluye rehacer el corpus con el redactor nuevo.
6. **Ensayo del guion de la demo** con CESVI.
7. **Lo menor:** fusionar los PR agrupados de Dependabot cuando lleguen en verde; volver obligatoria la política de contenido; lo demás está en `docs/PROGRESS.md`, «Endurecimiento pendiente».

## Bloqueado: necesita a René

| Qué                                                                                                                     | Para qué                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Decidir dónde se hace el build web de Unity: es pesado para la laptop, y publicarlo necesita el token que solo está ahí | Que el daño se vea en producción                                |
| Revisar el tope de gasto diario de Claude en Vercel (hoy 2 USD) contra las reservas medidas                             | Que no se niegue una lectura con presupuesto todavía disponible |
| Visto bueno para borrar las ramas remotas ya fusionadas                                                                 | Orden del repositorio                                           |
| Que el colaborador corra el paquete de la Tanda 3 (`CORRER-TANDA-EN-RTX.bat`)                                           | Cerrar la Tanda 3 con la corrida completa                       |

La tabla completa, con fechas, está en `docs/PROGRESS.md`, «Bloqueado — necesita a René».

## Límites que conviene tener presentes

- La narración manda: si no dice quién retrocedía o no trae el ancho dañado, Croquis no lo adivina.
- El rango no es una garantía (cobertura de arriba) y la rigidez por clase viene de pruebas de vehículos de Estados Unidos.
- Una volcadura se decide, pero su giro no se integra en el tiempo; el 3D la ilustra.
- `/cesvi` es público y no hay cuentas.

La lista completa está en el [README](../README.md), «Límites».

## Dónde está cada cosa

- **Bitácoras:** `docs/progress/U.md` (visor Unity, contratos, integración) y `docs/progress/W.md` (web y física). `docs/PROGRESS.md` es el índice y guarda la historia.
- **Decisiones:** `docs/adr/` (U del 0110 al 0129; W del 0130 al 0169).
- **Física:** `docs/physics.md`. **Datos:** `docs/data.md` y `data/SOURCES.md`. **IA responsable:** `docs/responsible-ai.md`.
- **Lo anterior a CESVI:** `docs/historial/`.
