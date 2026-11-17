# ADR 0119 · El tráiler: una escena inventada con datos del solver, música en código y tomas del 3D en la RTX

- **Fecha:** 2026-11-16
- **Estado:** aceptada
- **Pedido:** René, 2026-11-16: un tráiler de 22 a 30 s, 100 % original, en 1920×1080, 3840×2160 y 1080×1920. Aprobó el storyboard versión 2 («más épico», sin la mancha negra del impacto) y pidió construirlo.
- **Base:** ADR 0118 (Remotion, texturas en código y tomas 4K del 3D).

## Decisión

- **Una sola rejilla de pulsos para la imagen y la música** (`apps/trailer/src/ritmo.json`): 120 pulsos por minuto y 30 cuadros por segundo.
  - Todo corte cae en un múltiplo de medio segundo.
  - Los cortes más rápidos van en sextos de pulso, que son 5 cuadros exactos. Un cuarto de pulso serían 3.75 cuadros: no se usa para cortar.
- **Todo lo que se ve sobre la hoja sale de una escena inventada de referencia y de su Resultado**, los dos versionados (`packages/scene-schema/fixtures/nocturno_lluvia.json` y `fixtures/resultados/`): un alcance de noche con lluvia.
  - `tools/trailer/datos-caso.mts` escribe `apps/trailer/src/datos/caso.json`: la calle, las trayectorias, el impacto, los restos, las posiciones finales y las citas del relato.
  - Las simulaciones son el Monte Carlo del solver (`monteCarlo`, con `alMuestra`), con la semilla del Resultado. El número que aparece en pantalla es el de las simulaciones que resultaron válidas.
  - El script se niega a correr con una escena que no esté marcada como sintética. Nada de AXA ni de casos reales.
  - El storyboard hablaba de «la carambola»; se usa esta escena porque es la que tiene noche, lluvia y una toma del 3D ya probada.
- **La hoja se dibuja en un lienzo con una cámara propia** (`camara.ts`, `hoja.ts`): la misma cámara va de la vista de plano al vuelo a ras de la hoja, y la onda del impacto dobla la cuadrícula. Sin imágenes.
- **El mismo componente sirve para los tres formatos.** En vertical, la calle corre de abajo hacia arriba y los rótulos salen a los lados.
- **La música se compone en código** (`tools/trailer/musica.mjs`): senos, ruido con semilla y filtros sencillos, sobre la misma rejilla. No usa grabaciones, muestras ni melodías de terceros, así que no hay licencia que revisar.
  - La pista que René había elegido era el audio del video de referencia y no tenía licencia: no se usa (`D:\Croquis-trailer\LICENCIA-MUSICA.txt`).
- **Las tipografías son las de la app** (Instrument Serif, Instrument Sans y Geist Mono, SIL OFL 1.1), de sus paquetes `@fontsource`. El logotipo final es el de `assets/brand` (símbolo de `marca.json` y la palabra del SVG maestro, letra por letra).
- **Las tomas del 3D se graban en la computadora con tarjeta de video**, con el visor de escritorio del release `rtx-t4` y su modo foto: no hace falta un build nuevo de Unity.
  - `tools/trailer/tomas-rtx.mjs` genera el plan: seis huecos, cada uno una secuencia de cuadros a 3840×2160 en ultra.
  - Las corre `tools/colaborador/desde-release.ps1 -Paso trailer` (un paso más de la tanda 4) y las deja en un zip en el Escritorio. No van a git.
- **Un hueco sin toma no se rellena.** La escena de papel sigue, y el archivo sale con «-sin-3d» en el nombre. Con `--previo` se aceptan las fotos de prueba a 720p para revisar el ritmo; ese archivo sale con «-previo».

## Consecuencias

- El tráiler terminado necesita las tomas de la RTX. Hasta que lleguen solo hay previos.
- En la laptop de René no se carga Unity para esto.
- Cambiar la música o un corte es cambiar `ritmo.json`: la imagen y el sonido se mueven juntos.
- Si se muestra otra cifra, tiene que salir de `datos/caso.json`.
