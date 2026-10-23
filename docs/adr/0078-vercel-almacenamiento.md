# ADR 0078 — Almacenamiento de Vercel: solo main despliega, vistas previas viejas borradas

- **Estado:** aceptado (2026-10-23).
- **Contexto:**
  - Vercel marcaba 7.9 de 10 GB de Deployment Storage y 2.22 GB de Functions Storage; al pasar de 10 GB se bloquean los despliegues.
  - Cada push a cualquier rama (`feat/*`, `fix/*`, `docs/*`, `ci/*`, Dependabot) creaba un despliegue de vista previa. El proyecto tenía 269: 193 vistas previas y 76 de producción.

## Decisión

1. **Solo despliegan `main` (producción) y una rama `preview`** (`apps/web/vercel.json`, porque la Root Directory del proyecto es `apps/web`): `git.deploymentEnabled` con `"**": false`, `"main": true` y `"preview": true`.
   - Según la documentación de Vercel, si una rama cumple varias reglas basta una verdadera para desplegar.
   - **CI no depende de las vistas previas:** ningún workflow las usa y `main` no tiene checks obligatorios de Vercel.
2. **Se borraron 190 vistas previas** con la API de Vercel (la misma sesión que la CLI).
   - Se conservaron el despliegue de producción actual (alias `croquis-sage.vercel.app`) y las 3 vistas previas más recientes.
   - Quedan 79 despliegues: 76 de producción y 3 de vista previa. Producción respondió 200 después.
3. **Lo que no se sirve no entra a las funciones:** `outputFileTracingExcludes` en `next.config.ts` excluye datos, evaluaciones, la demo y su video, la documentación, el solver Python, las grabaciones, los fixtures y las pruebas.

## Medición de un despliegue (antes y después)

- **Cómo se midió:** de `next build`. Las funciones son la suma de los archivos de cada traza `.nft.json`, que es lo que Vercel empaqueta; los estáticos son `.next/static` más `public/`.
- **Por qué así:** `vercel build` no termina en Windows (EPERM al crear enlaces simbólicos; necesitaría el modo de desarrollador de la computadora).

|                                              | Antes (`main`) | Después  |
| -------------------------------------------- | -------------- | -------- |
| Funciones                                    | 36             | 36       |
| Archivos de las funciones (suma por función) | 141.5 MB       | 140.6 MB |
| Archivos únicos de las funciones             | 23.7 MB        | 23.5 MB  |
| `.next/static`                               | 21.2 MB        | 21.2 MB  |
| `public/`                                    | 7.6 MB         | 7.6 MB   |

**Lectura:**

- **El tamaño de cada despliegue casi no cambia:** los datos crudos (`data/`, `eval/`, grabaciones, fixtures, `demo/video`, corpus) ya no entraban a las funciones. La exclusión evita que entren después.
- **Lo que pesa son cosas que sí se usan:**
  - en las funciones, el código compilado de las páginas de `/cesvi` (8–9 MB cada una: MapLibre, pdfmake y sus fuentes, mediabunny y docx en los trozos de SSR);
  - en los estáticos, un módulo WebAssembly de 4.4 MB que se carga bajo demanda y los 205 casos de la reproducción (1.3 MB).
- **La palanca fue el número de despliegues:** de 269 a 79, y las ramas de trabajo ya no crean más.

## Pendiente

- **Las compilaciones de desarrollo de MapLibre** (`maplibre-gl-dev` y `maplibre-gl-worker-dev`, 3.7 MB) se copian a los estáticos porque MapLibre arma la URL de su worker con una plantilla. Quitarlas pide parchar MapLibre.
- **Los 75 despliegues de producción anteriores** también ocupan espacio. Una política de retención en Vercel (Settings → Deployment Retention) los borraría solos. Se deja a René porque quita la posibilidad de volver a versiones viejas.
- **Las bibliotecas que solo usa el navegador** (pdfmake, docx, mediabunny) podrían salir de los trozos de SSR cargándolas solo en el cliente.
