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
4. **Imagen fija en el inicio, sin video.** No existe un video de autos de noche en la portada: las tomas eran 3D hechas para ella. Se quitan del repositorio (siguen en el historial).
5. **Capturas reales** de la app (`e2e/capturas-portada.spec.ts`), de día y de noche, con narraciones de ejemplo inventadas. En AVIF, que el service worker no precarga, y sin el optimizador de imágenes de Vercel.
6. **Las cifras,** solo del índice único, con el formateador único y su límite al lado. Una prueba falla si un texto trae otro dígito, el nombre de la app escrito o algo de AXA.
7. **La carpeta sigue llamándose `components/portada-v3`:** `formato.test.ts` y `logo.test.ts` la vigilan por su nombre, y `packages/cesvi` es de otro frente.

## Consecuencias

- `demo/portada/grabar-tomas.mjs` ya no alimenta la portada.
- Si cambia la app, se rehacen las capturas con los dos comandos que dice el encabezado del spec.
