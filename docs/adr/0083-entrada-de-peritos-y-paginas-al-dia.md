# ADR 0083 — La entrada de los peritos, las páginas siempre al día y las fuentes con su nombre

- **Estado:** aceptado (2026-10-23).
- **Contexto:** René revisó producción y no vio el botón «Entrar a Croquis» en la portada, aunque V2-1 (ADR 0080) lo había desplegado.
  - **Lo que había en producción:** el botón estaba en el centro, como botón principal (comprobado con un navegador nuevo; `docs/PROGRESS.md` tiene la evidencia).
  - **Por qué no lo vio:** el service worker (ADR 0030) precargaba el HTML de las páginas de la demo y lo servía desde la caché. Una versión nueva del service worker espera a que se cierren todas las pestañas de la anterior. Quien ya había abierto Croquis veía la portada vieja después de un despliegue, aunque recargara.
  - **Además,** en las tarjetas de vehículo de `/cesvi` aparecía el identificador interno de la fuente (`dictamen_importado`) junto a la masa.

## Decisión

1. **«Entrar a Croquis» también en la barra de navegación**, como botón principal y antes de los demás enlaces (`nav-entrar`), en español y en inglés («Enter Croquis»). En la portada ya era el botón principal del centro y «Cuenta qué pasó», el secundario.
2. **El HTML de las páginas va primero a la red** (`src/sw.ts`):
   - las páginas salen de la precarga, que sirve primero desde la caché;
   - las navegaciones usan `NetworkFirst` sobre la caché `croquis-paginas`, con 5 s de espera; la copia guardada solo se usa sin internet o con la red muy lenta;
   - el CSS, el JavaScript, las fuentes y los modelos siguen precargados y con su revisión.
3. **Una versión nueva se activa sola** (`skipWaiting` y `clientsClaim`, pedido de René): toma las pestañas abiertas sin esperar a que se cierren.
   - **El riesgo** que había hecho esperar a la versión nueva (ADR 0030): una pestaña abierta con la versión anterior pide un trozo de JavaScript que la activación ya borró de la precarga y que el despliegue nuevo ya no sirve.
   - **Cómo se cubre:** al instalarse, el service worker copia lo estático de la versión anterior que no está en la suya (`/_next/static/`) a `croquis-estaticos-previos`. Lo que la precarga nueva no tiene se busca ahí antes de ir a la red. Cada instalación reemplaza esa copia, así que solo se guarda un despliegue anterior.
4. **La demo sigue abriendo sin red:**
   - las páginas de la demo se guardan en `croquis-paginas` al instalar el service worker;
   - una página visitada con red se guarda al visitarla y abre sin red;
   - una que no se guardó abre el inicio en su idioma.
5. **Las fuentes se dicen con su etiqueta legible:**
   - el distintivo `Fuente` de `/cesvi` usa el vocabulario compartido (`FUENTE` en `i18n/vocabulario.ts`, el mismo que usa el visor);
   - se agregaron las fuentes del expediente: «perito», «conductor», «del expediente», «del reporte» (`dictamen_importado`).

## Evidencia

- **Unitarias:** toda fuente del contrato (`Fuente` y `FuenteExpediente`) tiene etiqueta en los dos idiomas, sin guiones bajos. Si el contrato agrega una sin etiqueta, la prueba falla.
- **e2e:**
  - `@flujo` desde la portada, «Entrar a Croquis» llega a la lista de casos; también desde la barra y en inglés.
  - El flujo de AXA comprueba en los pasos 1 y 3 que cada fuente en pantalla dice su etiqueta y que ningún identificador interno con guion bajo aparece en el texto.
  - La prueba sin red ahora comprueba las dos cosas: una página visitada abre su copia y una no visitada abre el inicio en su idioma.

## Consecuencias

- **La transición desde el service worker anterior:** la primera recarga después del despliegue la atiende todavía el anterior, que sirve la portada precargada. Mientras tanto, la versión nueva se instala y se activa sola. En producción hicieron falta tres recargas en 71 s (`docs/PROGRESS.md`). Desde esta versión, el HTML llega siempre de la red.
- **Con red lenta** (más de 5 s), una página guardada abre su copia; sin copia, espera a la red.
