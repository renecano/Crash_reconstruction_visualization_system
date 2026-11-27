# ADR 0125 — La portada usa el sistema de diseño de la app

- **Fecha:** 2026-11-24
- **Estado:** propuesto; se fusiona con el visto bueno de René
- **Sustituye a:** ADR 0092 (portada v3)

## Contexto

La portada v3 tenía su propio estilo (grafito, Anybody, cursor y huevos de pascua), mostraba cifras del caso de AXA y usaba de fondo tomas hechas para ella, una de AXA. No combinaba con /cesvi. René pidió que sea de la misma familia que la app.

## Decisión

1. **El sistema es el de la app, tal cual:** `data-diseno="laboratorio"`, `FUENTES_LABORATORIO`, `t-rotulo`, `cifra-protagonista`, `boton-principal`/`boton-continuar` y `transicion-acto`. No se cambió nada compartido; `portada-v3.css` solo compone y no trae colores propios.
2. **El tema es el del sistema,** con un script en línea antes de pintar (sin destello). No usa la preferencia guardada de /cesvi.
3. **HTML del servidor.** En el navegador solo corre `movimiento-portada.tsx`: entradas, cifras que cuentan, la línea con el punto naranja y la cortina con el logo al cambiar de sección. Sin JavaScript o con movimiento reducido todo se ve completo.
4. **Inicio: un fragmento del tráiler final, sobre una foto fija** (René, 2026-11-24). `scripts/portada-video.mjs` corta de 5 a 8 s sin audio, comprueba que pese menos de 3 MB, lo sube a Vercel Blob y anota su URL en `video.json`. Solo lo piden las pantallas anchas, con movimiento y sin ahorro de datos; lleva botón de pausa y se detiene fuera de la pantalla. El póster es la foto fija. Con `"url": null` queda solo la foto. Las tomas anteriores, 3D hechas para la portada, se quitan del repositorio (siguen en el historial).
5. **Capturas de la app en producción** (`e2e/capturas-portada.spec.ts`), con el flujo de hoy, de día y de noche, con un ejemplo inventado y sin marcos. Ninguna muestra una cifra de la reconstrucción (velocidad, rango, energía o Δv): depende de dónde se coloca cada vehículo y cambia con la física, así que queda fuera del recorte. En AVIF con respaldo WebP, sin el optimizador de imágenes de Vercel y fuera de la precarga del service worker.
6. **Las cifras,** solo del índice único, con el formateador único y su límite al lado. Una prueba falla si un texto trae otro dígito, el nombre de la app escrito o algo de AXA.
7. **La carpeta sigue llamándose `components/portada-v3`:** `formato.test.ts` y `logo.test.ts` la vigilan por su nombre, y `packages/cesvi` es de otro frente.

## Consecuencias

- `demo/portada/grabar-tomas.mjs` ya no alimenta la portada.
- Si cambia la app, se rehacen las capturas con los dos comandos que dice el encabezado del spec.
