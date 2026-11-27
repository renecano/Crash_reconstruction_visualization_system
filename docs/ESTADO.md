# Estado de Croquis

**Fecha:** 2026-11-15. **Para:** quien retome el proyecto o quiera saber, en dos páginas, qué hay y qué falta.

Croquis reconstruye hechos de tránsito con física a partir de lo que narra el perito, para los peritos de CESVI México. El plan vigente es [`docs/cesvi/PLAN-CESVI.md`](cesvi/PLAN-CESVI.md) (v4). La auditoría del 2026-11-15 ([`docs/auditoria/2026-11-15-fable.md`](auditoria/2026-11-15-fable.md)) ordenó el trabajo en cinco tandas; este archivo dice en qué quedó cada una.

Las cifras de este archivo salen de `eval/results/`. Las marcadas están atadas al índice `eval/results/cifras.json` y las revisa `node eval/verificar_cifras.mjs`.

## Qué funciona hoy en producción

Sitio: <https://croquis-sage.vercel.app/cesvi>.

- **El flujo del perito, completo:** narrar, colocar en el mapa, reconstruir, ver en 3D, comparar con el reporte de CESVI y con la declaración de un conductor, y sacar el dictamen en PDF y Word.
- **El caso de AXA (A2010930):** V2 a <!--cifra:axa.v2-->57 km/h (55–79)<!--/cifra--> y V1 a <!--cifra:axa.v1-->15 km/h (0–22)<!--/cifra-->, con <!--cifra:axa.hipotesis-->2<!--/cifra--> hipótesis. La que se ve sin elegir se llama «<!--cifra:axa.hipotesis_visible-->La más cercana al daño medido<!--/cifra-->».
- **La reproducción de reportes:** los <!--cifra:er4.prueba-->205<!--/cifra--> de la prueba congelada se reconstruyen y se ven en 3D. La modalidad coincide con el título del reporte en <!--cifra:er4.modalidad_titulo-->91 de 156 (58.3 %)<!--/cifra-->.
- **El visor Unity en la web,** con edición en 3D que vuelve a correr el solver, con controles de reproducción (pausar, deslizador, ¼× ½× 1×, ir al impacto, ver todo, repetir) y con el daño del solver en la carrocería después del impacto (U8, ADR 0117; build `e06bdd73b0ce3706`). El visor de escritorio está en un release de GitHub y es anterior al daño.
- **La reversa:** quien retrocede sin velocidad dicha se reconstruye a <!--cifra:reversa.velocidad-->5.68 km/h (3.06–9.07)<!--/cifra-->, como supuesto con su fuente.
- **Lo que el perito lee sobre la confianza:** qué evidencia fija cada número, qué es supuesto, qué parte de la deformación medida explica la reconstrucción y que el rango contuvo la velocidad verdadera <!--cifra:cobertura.rango-->410 de 578 (70.9 %)<!--/cifra--> de las veces (lo esperado es cerca de 80 %).

## Qué está en el código y todavía no en producción

- **El visor de escritorio con el daño.** El release de GitHub es anterior a U8: hay que compilarlo de nuevo para las fotos de promoción.

## Las cinco tandas de la auditoría

| Tanda                            | Qué                                                                                                                    | Estado                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1 · Confianza inmediata          | Redactor que conserva las cifras, portada con la tasa completa, generados verificados en CI, dictamen                  | Hecha (#223 a #226)                                                                       |
| 3 · Números defendibles          | Formateador único, índice de cifras con verificador, supuestos del impacto en el rango, energía contra daño, cobertura | Hecha (#227 a #229). Falta la corrida completa del colaborador                            |
| 2 · Lo que el perito ve en el 3D | Daño del solver en Unity, controles de reproducción, leyenda siempre                                                   | Hecha (#230 y el build publicado). Faltan las fotos de promoción y volver a medir los fps |
| 4 · Proceso y seguridad          | Páginas anteriores, encabezados, tope de gasto, protección de `main`, Dependabot                                       | Hecha (#231 a #233)                                                                       |
| 5 · Cierre (U7)                  | README, este archivo, `physics.md`, E8 de nuevo, pruebas de reversa y de «Claude no disponible», ensayo de la demo     | Hecha                                                                                     |

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

## El arranque del 3D de Unity, por partes (2026-11-16)

Desde el #250, Unity arranca cuando el perito abre el 3D, no en segundo plano: ningún cambio de paso deja tareas largas del paso 4 en adelante (`eval/results/pasos_hilo_despues_produccion.json`).

**Qué pasa al abrir el 3D.** AXA reconstruido, clic en «3D», en la laptop con GPU, en producción (`eval/results/unity_arranque.json`, `apps/web/e2e/medir-unity-arranque.spec.ts`). Milisegundos desde el clic:

| Etapa                                                 | Primera visita | Segunda visita (caché) |
| ----------------------------------------------------- | -------------- | ---------------------- |
| Cargador de Unity listo                               | 307            | 245                    |
| WebAssembly compilado                                 | 544            | 431                    |
| Motor de Unity listo                                  | 1,293          | 841                    |
| Solver del caso listo (en un worker)                  | 2,260          | 1,263                  |
| Caso cargado en Unity (escenario y modelos)           | 13,099         | 8,523                  |
| Primer cuadro                                         | 13,413         | 8,979                  |
| Tarea más larga del hilo principal                    | 6,547          | 3,508                  |
| Tareas de más de 100 ms                               | 7              | 6                      |
| Tiempo bloqueado (lo que pasa de 50 ms en cada tarea) | 10.6 s         | 6.3 s                  |

- **Descarga:** el `.wasm` tardó 3.9 s y el `.data`, 6.1 s en la primera visita; 3.5 y 5.6 s en la segunda (Blob no expone los bytes entre orígenes). Corren en paralelo y no bloquean la página.
- **Lo que traba la página es armar la escena del caso** dentro de Unity (escenario procedural y modelos): de 1.3 a 13.1 s en la primera visita. Corre en el hilo principal de la página porque Unity WebGL vive ahí. No es la descarga ni la compilación.

**Aislarlo en un iframe de otro dominio (estimación; no implementado).** Chrome, Edge y Firefox de escritorio ponen un iframe de otro sitio en su propio proceso. Su hilo principal es otro: el arranque y los cuadros de Unity ya no trabarían la página.

- **Qué habría que hacer:**
  1. **Una página anfitriona** con el cargador de Unity y un relevo de mensajes, publicada en otro sitio. `*.vercel.app` está en la lista de sufijos públicos, así que `croquis-3d.vercel.app` ya cuenta como otro sitio, pero es otro proyecto de Vercel y necesita la cuenta de René. La otra opción es servirla desde Blob, comprobando antes que Blob la sirva como HTML.
  2. **El puente** (`PuenteUnity`), por `postMessage`: `enviar`, `cargar` (el paquete del caso, de varios MB, va por clonado estructurado), los avisos de Unity (`tiempo`, `objetoEditado`, `puntoMarcado`, `error`), `capturar` (las fotos del dictamen) y `dormir`/`despertar`.
  3. **La edición en 3D y el teclado**, que ya caen en el iframe. Las barras de React siguen encima.
  4. **Las pruebas con el Unity falso** (`unity-falso.js`), con el relevo.
  5. **Medir antes y después** con `medir-pasos` y `medir-unity-arranque`.
- **Costo estimado:** 3 a 4 días de trabajo. Puente y relevo, 1 día; página anfitriona, publicación y caché, medio día; edición, fotos del dictamen y Presentar, 1 día; pruebas y medición, de medio a 1 día.
- **Riesgos:**
  - Un segundo proceso de navegador pesa de 150 a 300 MB más en una laptop de 8 GB.
  - Safari no aísla iframes en otro proceso: ahí seguiría igual que hoy.
  - La caché del build queda partida por sitio anfitrión, igual en cada visita, así que la segunda visita sigue sin bajar nada.

### Armado por partes: en pausa hasta después de la demo (René, 2026-11-18)

La rama `perf/unity-armado-por-partes-v2` arma la escena de Unity por partes, para que ninguna tarea trabe la página. Se midió en la laptop (i5-10210U con Intel UHD, mediana de 3 corridas) y no cumple la regla de 100 ms, así que no se publicó. Los datos están en `eval/results/unity_carga_perfil_antes_2026-11-17.json` y `..._despues_2026-11-17.json`, en esa rama.

| Carga                  | Hasta que se ve | Tarea más larga del hilo principal |
| ---------------------- | --------------- | ---------------------------------- |
| AXA en frío            | 17.4 → 18.4 s   | 10.0 → 4.5 s                       |
| Segundo caso (lateral) | 5.0 → 5.3 s     | 926 → 429 ms                       |
| AXA en caliente        | 1.10 → 1.47 s   | 549 → 156 ms                       |

**Qué atacar cuando se retome:**

1. **Los edificios** (`ent_edificios`): unos 8.4 s en frío, de 6.6 a 15.1 s del arranque. Es la parte más pesada.
   - **Opciones:** instanciar por lotes repartidos en varios cuadros; combinar mallas por manzana antes de construir el build; o bajar el detalle de lo que queda lejos de la cámara.
2. **Leer el paquete** (`leer_paquete`): sube de 0.7 a 1.6–1.8 s con el armado por partes. Hay que revisar si se lee dos veces.
3. **Medir la página completa** (el solver en paralelo con Unity) con `medir-pasos`, y repetir en la RTX antes de publicar.

## Gasto en Vercel Pro (desde el 2026-11-17)

René paga Pro: 20 USD al mes, con 20 USD de crédito de uso. Meta: no pasar de ese crédito. Precios de la documentación oficial de Vercel, consultada el 2026-11-17 ([precios](https://vercel.com/docs/pricing), [Deployment Storage](https://vercel.com/docs/deployment-storage), [Flat Rate CDN](https://vercel.com/docs/pricing/flat-rate-cdn), [Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing)). El uso es el de los últimos 30 días de las capturas de René; las cifras del despliegue nuevo hay que leerlas en el panel.

| Recurso                                       | Precio en Pro                                                                       | Uso conocido                                                                                                                                           | Estimado al mes                                                                                                     | Qué revisar cada semana                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Deployment Storage                            | 0.10 USD por GB-mes                                                                 | Antes: unos 2 GB por despliegue (10.82 GB con 5). Medido sobre `vercel build` tras #265: 103.7 MB por despliegue (`eval/results/peso_despliegue.json`) | Con 5 despliegues retenidos: unos 0.05 USD si Vercel confirma ~0.1 GB por despliegue; 1.08 USD si siguieran en 2 GB | Usage → Deployment Storage → Projects, y la pestaña Resources del último despliegue                        |
| Functions Storage                             | 0.10 USD por GB-mes, por región                                                     | 34.6 MB de funciones por despliegue (mismo archivo)                                                                                                    | Con 5 despliegues: unos 0.02 USD                                                                                    | Usage → Functions Storage                                                                                  |
| Blob: almacenamiento                          | 0.023 USD por GB-mes (iad1, ejemplo de Vercel)                                      | 322.9 MB (17 nov)                                                                                                                                      | Menos de 0.01 USD                                                                                                   | Usage → Blob                                                                                               |
| Blob: transferencia                           | Dentro de Flat Rate CDN (el nivel incluido en Pro: 1 TB y 1 M de peticiones al mes) | 8.8 GB en 30 días (17 nov)                                                                                                                             | 0 USD con Flat Rate CDN activado; sin él, 0.05 USD por GB en iad1: unos 0.44 USD                                    | Billing → Flat Rate CDN: que esté **activado**. Sin él, la transferencia se cobra por uso                  |
| Fast Data Transfer y CDN Requests             | Dentro de Flat Rate CDN                                                             | 7.4 GB (17 nov) y 258 K peticiones (15 nov)                                                                                                            | 0 USD con Flat Rate CDN                                                                                             | Usage → CDN                                                                                                |
| Fast Origin Transfer                          | Por uso (0.06 USD por GB en iad1, ejemplo de Vercel)                                | 1.83 GB (15 nov)                                                                                                                                       | Unos 0.11 USD                                                                                                       | Usage → CDN → Fast Origin Transfer                                                                         |
| Runtime Cache (lecturas de ISR)               | 0.40 a 0.64 USD por millón de lecturas                                              | 141 K lecturas (15 nov)                                                                                                                                | Unos 0.06 a 0.09 USD                                                                                                | Usage → Runtime Cache. Los reportes de CESVI se generan al pedirlos (#265): las escrituras subirán un poco |
| Funciones: Active CPU, memoria e invocaciones | Por uso; el precio varía por región y la página general no lo da                    | 28 min 50 s de Active CPU (15 nov)                                                                                                                     | Pendiente: leerlo en el panel                                                                                       | Usage → Functions                                                                                          |
| Builds                                        | Desde 0.0035 USD por minuto de CPU                                                  | Cada despliegue a producción; los que cancela el «Ignored Build Step» duran unos segundos                                                              | Pendiente: leerlo en el panel (Build CPU Minutes)                                                                   | Usage → Builds. Juntar los cambios del sitio sigue bajando este costo                                      |

**Total que sí se puede estimar hoy:** entre 0.3 y 1.8 USD al mes sobre los 20 del plan, según cuánto pese de verdad cada despliegue y si Flat Rate CDN está activado. Faltan las funciones y los builds, que solo da el panel; con el uso de noviembre no deberían acercarse al crédito. La API de Claude no es de Vercel: va aparte, con su tope diario (`/api/version`).

**Reglas de gasto (René, 2026-11-17), siguen en Pro:**

- Ninguna prueba, e2e ni medición baja nada de producción ni de Blob (`e2e/base.ts`).
- El «Ignored Build Step» sigue: solo despliega lo que toca el sitio.
- Retención corta de despliegues (la fija René en el panel).
- Los cambios del sitio se juntan para desplegar pocas veces.
- El plan B (Unity servido desde el despliegue) ya no hace falta: con Flat Rate CDN, la transferencia de Blob queda en la tarifa fija. Queda preparado y sin activar.
- Un build de Unity nuevo se publica en Blob solo cuando su medición cumple, en la laptop y en la RTX.

**Para René, una vez:** en Billing, confirmar que Flat Rate CDN esté activado y poner una alerta de Spend Management por debajo de 20 USD (por ejemplo, en 15).

## Uso de Vercel cuando era Hobby (hasta el 2026-11-17)

Capturas de René del 2026-11-17 (Deployment Storage, Blob Data Transfer y Fast Data Transfer) y del 2026-11-15 (el resto), últimos 30 días. Meta: por debajo de 70 % de cada límite, sobre todo en la semana de la demo.

| Métrica                  | Uso                          | Límite | %     | Meta (70 %) | De dónde sale                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------- | ------ | ----- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment Storage       | **10.49 GB** (17 nov, tarde) | 10 GB  | 105 % | 7 GB        | Vercel guardaba unos 2 GB por despliegue (5 despliegues = 10.82 GB, captura de René). Medido sobre la salida de `vercel build` (`eval/results/peso_despliegue.json`): de 303.4 MB a 103.7 MB, porque los 205 reportes de CESVI ya no se prerenderizan al construir (233.8 MB de páginas) y las entradas de funciones bajan de 1,546 a 316. Lo que borró René sigue contando durante su periodo de recuperación. El «Ignored Build Step» ya cancela los merges que no tocan el sitio |
| Blob Data Transfer       | **8.8 GB** (17 nov)          | 10 GB  | 88 %  | 7 GB        | Subió 3.73 GB del 15 al 17 de noviembre. Las pruebas y mediciones explican unos 0.49 GB (`eval/results/blob_gasto_estimado.json`, por actividad); el resto, unas 94 primeras visitas al 3D, lo explican la precarga del build en cada navegador que abre un caso (aunque no abra el 3D) y los tres builds de Unity publicados en esos dos días. Desde el 17 de noviembre ninguna prueba ni medición baja de Blob                                                                    |
| Blob Data Storage        | 322.9 MB (17 nov)            | 1 GB   | 32 %  | 700 MB      | Cuatro builds de Unity de unos 73 MiB, los modelos (26.4 MiB) y los HDRI (5.3 MiB) (`eval/results/blob_inventario.json`). El 16 de noviembre se borraron tres builds que no usaba nadie                                                                                                                                                                                                                                                                                             |
| Fast Origin Transfer     | 1.83 GB (15 nov)             | 10 GB  | 18 %  | 7 GB        | Las páginas y las rutas de la app                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Fast Data Transfer       | 7.4 GB (17 nov)              | 100 GB | 7 %   | 70 GB       | Lo que sirve el CDN del sitio. Con el plan B, el 3D también saldría de aquí                                                                                                                                                                                                                                                                                                                                                                                                         |
| CDN Requests             | 258 K (15 nov)               | 1 M    | 26 %  | 700 K       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ISR Reads                | 141 K (15 nov)               | 1 M    | 14 %  | 700 K       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Fluid Active CPU         | 28 m 50 s (15 nov)           | 4 h    | 12 %  | 2 h 48 m    | Las rutas de `/api`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CDN Request CPU          | 4 m 22 s (15 nov)            | 1 h    | 7 %   | 42 m        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Blob Advanced Operations | 242 (15 nov)                 | 2 K    | 12 %  | 1.4 K       | Subir builds y listar (cada `list` cuenta)                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Lo que cambió el 2026-11-17 (René; ADR 0120):**

- **Ninguna prueba, e2e, ensayo ni medición baja de Blob.** Todas las e2e usan `e2e/base.ts`, que sirve desde la máquina lo que pedirían a Blob: el build de Unity de la copia en `.cache/visor-unity/<huella>/` y los modelos y HDRI de `apps/web/public/`. Si algo no tiene copia, la prueba falla y dice qué pidió. La copia se bajó una vez de Blob (76.3 MB) y está en el release de GitHub `visor-web-64b29e877ba9c856`; de ahí la bajan la RTX y la demo local. `blob-transferencia.spec.ts` solo corre con `CROQUIS_PERMITIR_BLOB=1`.
- **La RTX tampoco:** los fps web se miden contra el sitio compilado en modo local, el arranque del 3D sirve el build de la copia, y el visor de escritorio pide los modelos a la propia máquina (`tools/unity/visor-local.mjs escritorio` y `servir-modelos`).
- **Menos despliegues:** `apps/web/vercel.json` tiene un `ignoreCommand` (`tools/vercel/construir.mjs`). Vercel cancela el build cuando el merge no toca nada del sitio: documentos, evaluaciones, pruebas, herramientas, Unity, Python o el tráiler. El flujo «Producción = main» usa la misma regla.
- **Despliegues más chicos:** `scripts/podar-estaticos.mjs` quita después del build las seis variantes de MapLibre que el sitio nunca pide (5.3 MB). Sin internet se comprobó que el mapa no las pide.
- **Plan B, preparado y sin activar:** el build de Unity y los modelos dentro del despliegue, sin Blob. Se conmuta con `node tools/unity/visor-local.mjs plan-b activar` (o `desactivar`), que solo cambia el manifiesto, más un merge a `main`. Suma 109.6 MB a cada despliegue (76.3 del build y 33.3 de los modelos y los HDRI que regresan), así que cada despliegue pesaría 176.6 MB. Antes de usarlo en serio, probarlo una vez en la rama `preview`.

**Capacidad del 3D:** con 7 GB al mes (la meta) caben unas 200 primeras visitas al 3D (7 GB ÷ 34.6 MB). Una segunda visita en el mismo navegador no baja nada de Blob. Publicar un build nuevo hace que cada visitante lo baje una vez más. Hoy la página empieza a bajar el build en cuanto alguien abre un caso, aunque no abra el 3D (`precarga.ts`): así el 3D abre más rápido, pero cada navegador nuevo gasta casi una visita. Bajarlo solo al llegar a «Reconstrucción» ahorraría transferencia a cambio de un 3D más lento la primera vez: es decisión de René.

**Lo que ya está bien:** el build va comprimido con Brotli por Blob y con `Cache-Control: public, max-age=31536000` en archivos con huella en el nombre; la segunda visita sale entera de la caché (medido). Blob no deja poner `immutable` (solo `max-age`), y no hace falta: la segunda visita ya es 0.

**Recortar el build sin bajar calidad:** ya está optimizado (código para tamaño, texturas comprimidas, variantes de shaders recortadas). Lo que queda es poco y con riesgo: las 10 texturas de grano de película de URP (unos 2.5 MB, el efecto está apagado) vienen de los recursos globales de URP y quitarlas exige tocar el paquete; subir el recorte de código de Medium a High podría ahorrar algo del wasm (9.3 MB con Brotli), pero puede romper la lectura de JSON por reflexión. Ninguno va antes de la demo.

**Reglas desde hoy:**

- Las mediciones con navegador nuevo (E6, tiempos de carga, primera visita) se hacen con el build local, no contra producción. `visor-unity-real.spec.ts` ya sirve el build local completo.
- No se publica un build de Unity nuevo en la semana de la demo, salvo una corrección.
- Menos merges a `main`: los cambios que solo tocan documentos se juntan.

**Revisión semanal (2 minutos):**

1. En Vercel, la página del equipo → **Usage**, últimos 30 días. Tómale captura.
2. Compara cada fila con la columna «Meta» de arriba. Si alguna pasa de su meta: Deployment Storage → aplica la retención de abajo y junta merges; Blob Data Transfer → ninguna medición con navegador nuevo contra producción esa semana; Blob Data Storage → `node tools/unity/publicar-web.mjs --inventario` y poda de builds viejos.
3. Pon la captura y los números en esta tabla, con la fecha.

**Propuestas que esperan el visto bueno de René** (detalle en `docs/PROGRESS.md`, «Bloqueado — necesita a René»):

- **Blob:** borrar cuatro builds de Unity que nada usa (`f12372a6c2d7742c`, `01fce868922703fd`, `dc9c30121a648d63`, `6337b65c1db3110f`; 284.5 MiB). Quedan el vigente (`e06bdd73b0ce3706`) y el anterior (`abbbeec49fbae3c6`). Blob pasaría a unos 177 MiB (19 %).
- **Despliegues:** acortar la retención en el panel. Vercel nunca borra el despliegue que tiene el dominio de producción, ni los 3 últimos de producción listos, ni los 3 últimos creados.

## Qué falta, en orden

1. **Las fotos de promoción con el daño** (15 del modo foto, con el visor de escritorio recompilado, y el recorrido de día y de noche), y **volver a medir los fps** con el build publicado.
2. **La corrida del colaborador de la Tanda 3** (E-R4 completa, carambolas y cobertura con 200 casos). Al llegar la rama `resultados/t3-<fecha>`: `python eval/t3_comparar.py t3 t3_rtx` y `node eval/cifras.mjs`; la cifra de cobertura se actualiza sola.
3. **`eval/results/laboratorio_axa.json`:** lo escribe una e2e manual; se vuelve a correr antes de la demo.
4. **W9:** las relecturas grabadas y el prompt del corpus, con tope de 20 USD. Incluye rehacer el corpus con el redactor nuevo.
5. **Ensayo de la demo: hecho** (2026-11-15, en producción; `docs/cesvi/demo/guion.md`, `eval/results/ensayo_demo.json`). Sus dos detalles quedaron corregidos: la nota del 3D dice qué velocidad es y nombra el vehículo como el panel (también en Presentar y el dictamen), y la leyenda del 3D cumple WCAG AA sobre cualquier fondo (build `d18f1f3aebbfe08c`).
6. **Lo menor:** fusionar los PR agrupados de Dependabot cuando lleguen en verde; volver obligatoria la política de contenido; lo demás está en `docs/PROGRESS.md`, «Endurecimiento pendiente».

## Bloqueado: necesita a René

| Qué                                                                           | Para qué                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------- |
| Visto bueno para borrar las ramas remotas ya fusionadas                       | Orden del repositorio                     |
| Que el colaborador corra el paquete de la Tanda 3 (`CORRER-TANDA-EN-RTX.bat`) | Cerrar la Tanda 3 con la corrida completa |

La tabla completa, con fechas, está en `docs/PROGRESS.md`, «Bloqueado — necesita a René».

## Límites que conviene tener presentes

- La narración manda: si no dice quién retrocedía o no trae el ancho dañado, Croquis no lo adivina.
- El rango no es una garantía (cobertura de arriba) y la rigidez por clase viene de pruebas de vehículos de Estados Unidos.
- El mejor ajuste puede quedar fuera de su rango cuando la solución depende mucho de los supuestos; la app lo avisa con las dos cifras (ADR 0141). En el caso de ejemplo con poste, la segunda solución no es físicamente válida ni cuadra con la evidencia (`eval/results/caso_poste_modos.json`), así que se queda el aviso.
- Una volcadura se decide, pero su giro no se integra en el tiempo; el 3D la ilustra.
- `/cesvi` es público y no hay cuentas.

La lista completa está en el [README](../README.md), «Límites».

## Dónde está cada cosa

- **Bitácoras:** `docs/progress/U.md` (visor Unity, contratos, integración) y `docs/progress/W.md` (web y física). `docs/PROGRESS.md` es el índice y guarda la historia.
- **Decisiones:** `docs/adr/` (U del 0110 al 0129; W del 0130 al 0169).
- **Física:** `docs/physics.md`. **Datos:** `docs/data.md` y `data/SOURCES.md`. **IA responsable:** `docs/responsible-ai.md`.
- **Lo anterior a CESVI:** `docs/historial/`.
