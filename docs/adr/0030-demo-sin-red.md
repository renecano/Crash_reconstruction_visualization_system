# ADR 0030 — Demo sin red con service worker (F9)

- **Estado:** aceptado (2026-10-17)
- **Criterio (PLAN §13, F9):** la demo funciona sin red.
  - **Qué abre sin red:** las escenas canónicas, sus resultados, los cuerpos de MakeHuman, los vehículos y las texturas quedan en caché; la demo abre y reconstruye sin conexión.
  - **La excepción:** la extracción con Claude es lo único que requiere red, y la interfaz lo dice.

## Decisiones

1. **Serwist 9.5.13** (`serwist` y `@serwist/turbopack`), la opción que cita la guía oficial de PWA de Next.js para Turbopack. Se usan versiones estables: el ejemplo oficial usa la preliminar 10.
   - **Cómo se genera:** Turbopack aún no admite plugins, así que el service worker se arma con esbuild en un Route Handler estático (`src/app/serwist/[path]/route.ts`) durante `next build` y se sirve en `/serwist/sw.js`.
2. **Qué se precarga:**
   - **Trozos de `next build`:** `.next/static/**`, es decir, JS, CSS y fuentes. Incluyen el solver, el visor, Rapier con su WASM y los resultados canónicos.
   - **Archivos de `public/`:** cuerpos `.glb`, texturas y el worker del solver.
   - **El HTML de las cuatro páginas**, con el commit desplegado como revisión.
   - **Límite por archivo:** se sube a 8 MiB. El trozo de Rapier pasa del límite por omisión de 2 MiB y quedaría fuera.
3. **Navegación:**
   - `/visor?escena=…` usa el HTML precargado de `/visor`, porque se ignoran los parámetros salvo `_rsc`.
   - Las peticiones RSC sin red fallan y Next navega con el documento.
   - Una ruta sin precargar abre el inicio.
   - `/api/*` no pasa por el service worker.
4. **El Web Worker del solver deja el arranque de Turbopack:**
   - **El problema:** ese arranque lee su configuración de la URL del script (`#params=…`), y un script servido desde la caché pierde esa parte. Sin red, la escena propia no se reconstruía («Missing worker bootstrap config»).
   - **La solución:** `scripts/build-worker.mjs` lo empaqueta con esbuild en `public/workers/reconstruct.js` antes de `next build` y `next dev`. Es una URL fija que se precarga como cualquier archivo.
5. **Registro:** después de `load` y con el navegador ocioso (`requestIdleCallback`), para que la precarga de la primera visita no compita con la carga ni con el horneado. Solo se registra en producción.
6. **Actualizaciones:** una versión nueva del service worker espera a que se cierren las pestañas de la anterior (`skipWaiting: false`). Así, una página abierta no pide trozos que la limpieza de la caché ya borró.
7. **Sin red, `/relato` lo dice:** el botón de entender el relato se desactiva y se ofrecen el visor y el croquis, que funcionan en el dispositivo.
8. **Pruebas:** en Playwright, `serviceWorkers: "block"` es el valor global, porque la documentación de Playwright advierte que `page.route` no ve lo que atiende un service worker. Solo `sin-red.spec.ts` lo permite.

## Evidencia

- **Prueba e2e** (`apps/web/e2e/sin-red.spec.ts`): instala el service worker, corta la red con `context.setOffline(true)` y recorre:
  - **el inicio;**
  - **el visor en calidad alta:** resultados canónicos, Rapier, el ragdoll calibrado con los cuerpos de MakeHuman y las texturas;
  - **el croquis con «Ver en 3D»:** la escena propia se reconstruye en el worker y llegan la inversión y la consistencia;
  - **el relato:** muestra el aviso y desactiva el botón.

  Ninguna petición de archivos de la app falla y no hay errores de página.

- **Precarga** (`node eval/f9_precarga.mjs` → `eval/results/f9_precarga.json`):
  - **Tamaño:** 67 entradas y 11.05 MB de archivos.
  - **Contenido:** 4 páginas, 48 archivos de `.next/static` y 15 de `public/`. El mayor es el trozo de Rapier.
  - **Nada queda fuera:** ningún trozo de JavaScript ni archivo de `public/` se queda sin precargar. El script falla si falta alguno.
- **Costo en E6** (`eval/e6_ab.mjs` con la variante `_serviceWorkers: "block"`, 5 rondas intercaladas, navegador nuevo por medición; `eval/results/e6_ab_sw_*.json`):
  - **Escenas:** las más justas del E6 oficial.
  - **Resultado:** la diferencia es «bloqueado menos con service worker»: negativa si el service worker cuesta. En media, el intervalo del 90 % incluye cero en los dos backends (sin costo medible). En baja con WebGPU, el service worker cuesta 0.10 ms por cuadro (85.5 contra 86.1 fps), muy por encima del piso de 30 fps de §7.8.

  | Caso                             | Con service worker | Bloqueado | Bloqueado − con SW, por cuadro (IC 90 %) |
  | -------------------------------- | ------------------ | --------- | ---------------------------------------- |
  | media, WebGL, `nocturno_lluvia`  | 75.2 fps           | 74.0 fps  | +0.22 ms (−0.31 a 0.77)                  |
  | media, WebGPU, `nocturno_lluvia` | 37.0 fps           | 37.8 fps  | −0.57 ms (−6.28 a 0.70)                  |
  | baja, WebGPU, `alcance`          | 85.5 fps           | 86.1 fps  | −0.10 ms (−0.98 a −0.05)                 |

- **WebGPU en media:** en esta sesión dio 37 fps con y sin service worker, menos que en el E6 oficial (57.3). El JavaScript es el mismo para los dos backends, y WebGL quedó por encima del E6 oficial (75.2 contra 70.9). Es variación de la GPU Intel, no del cambio. El modo automático elige el backend por medición (ADR 0006, 0026).

## Consecuencias

- **Primera visita:** descarga en segundo plano todo lo precargado, unos megabytes más que la carga inicial del visor.
- **Visitas siguientes:** abren desde la caché, con o sin red.
- **Si cambia lo que necesita la demo** (rutas, archivos de `public/` o el worker), la lista de precarga lo recoge sola desde los globs. Las páginas nuevas se agregan a `PAGINAS`.
