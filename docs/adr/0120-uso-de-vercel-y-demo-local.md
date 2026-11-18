# ADR 0120 · Uso de Vercel: sin Blob en pruebas, menos despliegues, plan B y la demo local

- **Fecha:** 2026-11-17
- **Estado:** aceptada (el plan B, preparado y sin activar)
- **Pedido:** René, 2026-11-17. Vercel (Hobby) estaba en Deployment Storage 10.4/10 GB y Blob Data Transfer 8.8/10 GB, que subió 3.7 GB en dos días. Si Blob se pausa, el 3D no carga en la demo. Pidió también un modo demo local como respaldo.

## Decisión

### 1. Nada automático baja de Blob

- `e2e/base.ts` (con `e2e/sin-blob.ts`) es el `test` de todas las e2e. Cada contexto del navegador sirve desde la máquina lo que pediría a Blob:
  - el build de Unity, de `.cache/visor-unity/<huella>/`;
  - los modelos y los HDRI, de `apps/web/public/`. Son los mismos archivos: la huella es la de `recursos.json`.
- Lo que no tenga copia se corta y la prueba falla diciendo qué pidió.
- `blob-transferencia.spec.ts` mide justo la transferencia de Blob, así que solo corre con `CROQUIS_PERMITIR_BLOB=1`.
- La copia del build sale una sola vez de Blob, con `publicar-web.mjs --bajar <huella>`: es la única herramienta que usa el token. Después queda en el release de GitHub `visor-web-<huella>`, de donde la bajan `tools/unity/visor-local.mjs`, la RTX y la demo local.
- **El visor de escritorio** trae escrita la dirección de Blob de los modelos en `resources.assets`, en texto plano. `visor-local.mjs escritorio` la cambia por `http://127.0.0.1:47823/modelos/vehiculos/`:
  - mismo largo, rellenado con espacios que el JSON admite, así que el archivo no cambia de tamaño ni de estructura;
  - `servir-modelos` sirve esa carpeta mientras corre el paso.
- **El build web** trae la misma dirección dentro del `.data`, que va comprimido: no se puede cambiar sin recompilar Unity. Por eso, cuando el manifiesto trae `modelos`, la página reescribe esas peticiones antes de que Unity las haga: `src/lib/visor-unity/modelos-locales.ts` envuelve `fetch` y `XMLHttpRequest`, y `medir-e6.html` hace lo mismo en línea.

### 2. Menos despliegues: «Ignored Build Step»

- `apps/web/vercel.json` → `ignoreCommand: node ../../tools/vercel/construir.mjs`.
- Compara con `VERCEL_GIT_PREVIOUS_SHA` y cancela el build si ningún archivo cambiado va al sitio.
- La lista de lo que no despliega está escrita explícitamente; lo desconocido sí despliega.
- De `eval/results` solo despliegan los archivos que nombra el código del sitio. Una prueba comprueba que nada de lo que lee la web quede en la lista de lo que no despliega.
- El flujo «Producción = main» usa la misma regla para no esperar un despliegue que no va a llegar.
- Según Vercel, un build cancelado cuenta como despliegue para los límites de cantidad, pero no guarda salida.

### 3. Despliegues más chicos

- `scripts/podar-estaticos.mjs` quita las seis variantes de MapLibre que Turbopack copia y nadie pide (5.3 MB).
- Sin internet se comprobó que el mapa solo pide el CSS.
- `.vercelignore` no ayuda: en los despliegues desde git lo que se guarda es la salida del build, no el código fuente.
- Lo que más pesa son las funciones (34.1 MB). La librería de física (Rapier, 4.4 MB) y otras del navegador terminan en el código del servidor; sacarlas exige tocar cómo se importan en las páginas, y queda pendiente.

### 4. Plan B

- Si el manifiesto del sitio tiene `"base": "/"`, el paso `recursos.mjs preparar` del build:
  - copia el build de Unity del release de GitHub a `public/visor-unity/local/`;
  - deja en el despliegue los modelos y los HDRI.
- `visor-local.mjs plan-b activar|desactivar` cambia solo el manifiesto.
- Suma 109.6 MB por despliegue (`despliegue_peso.json`). El 3D sale entonces de Fast Data Transfer, que va en 7.4 de 100 GB.

### 5. Demo local

- `CORRER-DEMO-LOCAL.bat` → `tools/demo-local/demo-local.ps1`:
  - instala dependencias y prepara el visor con el modelo local;
  - compila con `CROQUIS_VISOR=local`, solo si cambió algo;
  - toma la llave de Claude solo del `.env.local` y sirve en `localhost:3000`.
- `CROQUIS_VISOR=local` agrega una reescritura `beforeFiles` del manifiesto al de `public/visor-unity/local/`.
- `e2e/demo-local.spec.ts` lo comprueba con la red de afuera cortada en el navegador. El paquete de la RTX corre la misma comprobación.

### 6. El peso real de un despliegue (René, 2026-11-17, tarde)

- René vio en Vercel 5 despliegues de producción que ocupaban 10.82 GB: unos 2 GB cada uno, no los 67 MB que daba `despliegue_peso.mjs`. Ese script medía el `next build` local, sin contar las páginas prerenderizadas ni la forma en que Vercel arma las funciones.
- **La medición nueva** es la salida de `vercel build` en Linux (`tools/vercel/peso-salida.mjs`, `.github/workflows/peso-despliegue.yml`). Cuenta lo estático, las páginas prerenderizadas y los archivos que cada función nombra en `filePathMap`. El trabajo de CI falla si el despliegue pasa de 200 MB o una función de 50 MB.
- **Lo que pesaba:** las 205 páginas de los reportes de CESVI se prerenderizaban al construir, cada una con sus datos (~1 MB). Eran 233.8 MB de páginas y 1,546 entradas de funciones, casi todas enlaces a la misma función de 26.8 MB.
- **El arreglo:** cada reporte se genera la primera vez que alguien lo abre y desde ahí queda en la caché. `generateStaticParams` devuelve una lista vacía, como indica la documentación de Next. Lo que ve el perito no cambia: la primera visita a un reporte tarda 0.6 s y las siguientes 0.01 s, medido en local.
- **Resultado** (`eval/results/peso_despliegue.json`):
  - el despliegue medido baja de 303.4 a 103.7 MB;
  - las páginas prerenderizadas, de 233.8 a 35.7 MB;
  - las entradas de funciones, de 1,546 a 316.
- **Lo que no se puede ver desde aquí:** la salida de antes medía 303.4 MB y Vercel reportaba unos 2 GB. Vercel contabiliza algo que `vercel build` no muestra. La vista Resources del siguiente despliegue, o el gráfico de Usage, dirán cuánto suma de verdad.
- **Con el plan B,** el despliegue sumaría los 109.6 MB del build de Unity y de los modelos: unos 213 MB, más que el límite de 200 MB del CI. Para usarlo habría que servir el build comprimido o dejar en el despliegue solo la versión «alta» de los modelos.

## Consecuencias

- Las mediciones de arranque del 3D ya no incluyen la descarga desde Blob: miden la máquina.
- Un build de Unity nuevo exige subir su copia al release (`visor-local.mjs empaquetar` y `gh release create`). Si no, la RTX y la demo local no lo encuentran y lo dicen.
- La precarga del build en cada navegador que abre un caso es hoy el mayor gasto de Blob. Cambiarla es decisión de producto y queda propuesta a René.
