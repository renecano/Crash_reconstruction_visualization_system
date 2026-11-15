# Marca de Croquis

Guía de uso del logo y del sistema visual. Es la referencia fija para la app, el sitio, las exportaciones y los videos (ver `PLAN.md` §11.2). Los valores exactos están en `tokens.json`.

## Una sola fuente

Desde el 2026-11-15 (René) el logo es **el de la portada pública**, y sale de un solo archivo: `marca.json`. Antes, la portada dibujaba su marca y la app usaba otra (la C de tres rayas con una X).

- `marca.json`: la geometría del símbolo, los colores y cómo se escribe la palabra.
- `tools/make_brand.py`: genera de ahí todos los SVG de esta carpeta y `medidas.json` (el tamaño de cada uno). No se editan a mano.
- `pnpm --filter @croquis/web marca`: los copia tal cual a `apps/web/public/marca` y rehace los íconos y el favicon. `node apps/web/scripts/portada.mjs --solo-redes` rehace la imagen para redes.
- La portada (`portada-v3.tsx`) dibuja sus símbolos en línea, porque anima sus partes, leyendo la misma `marca.json`. El video (`demo/video/marca.mjs`) también.

Para regenerar: `uv run --no-project --with fonttools python -I assets/brand/tools/make_brand.py <Anybody variable .ttf>` (la fuente, de Google Fonts, SIL OFL 1.1).

## Qué significa

- **La C** es una trayectoria: el arco que recorre un vehículo. Por dentro lleva un arco punteado, como una raya de carril.
- **La mira** en la abertura es el punto de impacto, en el color de señal.
- **La escala de transportador** (solo en el símbolo con detalle) es la del croquis del perito: ángulos medidos.
- **La palabra CROQUIS** va en mayúsculas extendidas con espaciado amplio.

El logo cuenta lo que hace el producto (trayectoria, medida, punto de impacto) sin mostrar un choque. Es coherente con el principio "el espectáculo es la precisión, no la violencia".

## Archivos

| Archivo | Cuándo usarlo |
|---|---|
| `logotipo.svg` | Uso principal sobre fondos oscuros (barras de la app y del sitio, pies de página, exportaciones). |
| `logotipo-sobre-claro.svg` | Sobre papel o fondos claros (tema claro, hoja del dictamen). |
| `logotipo-efectos.svg` | Momentos de presentación: imagen para redes, video. Solo sobre oscuro y a más de 300 px de ancho. |
| `logotipo-integrado.svg`, `logotipo-integrado-sobre-claro.svg` | El símbolo hace de C. Para piezas de marca; no para la barra de navegación. |
| `logotipo-blanco.svg`, `logotipo-negro.svg` | Una sola tinta: impresión, fondos de foto, sellos. |
| `palabra.svg`, `palabra-sobre-claro.svg` | La palabra sola, cuando el símbolo se dibuja aparte (la cabecera de la portada). |
| `simbolo.svg`, `simbolo-sobre-claro.svg` | Cuando el nombre ya aparece cerca o falta espacio. |
| `simbolo-detalle.svg`, `simbolo-detalle-sobre-claro.svg` | Con la escala de transportador: aperturas y tamaños de 96 px en adelante. |
| `simbolo-efectos.svg` | Ícono grande en presentaciones. |
| `simbolo-blanco.svg`, `simbolo-negro.svg` | Una sola tinta. |
| `favicon.svg` | Favicon y tamaños de 16 a 32 px: sin detalle y con trazos engrosados para que se lea. |
| `app-icon.svg` | Maestro de 1024 px para los íconos de la app instalada (PWA) y Apple touch. |

## Construcción

Los valores exactos están en `marca.json`; esto los explica.

- **Símbolo** (lienzo de 64 × 64): arco de radio 20 centrado en (32, 32), abierto hacia la derecha, de grosor 7 (6.4 en el símbolo con detalle). Por dentro, un arco punteado de radio 14.5. La mira va en (52, 32): un círculo, tres rayas cortas y un punto.
- **Logotipo**: la letra mide 0.425 del símbolo, con las mayúsculas centradas en él y una separación de 0.3 del símbolo. Son las proporciones de la cabecera de la portada (símbolo de 40 px, letra de 17 px, separación de 12 px).
- **Letra**: Anybody a ancho 132, peso 650, espaciado 0.2 em, convertida a contornos.

## Espacio libre y tamaños mínimos

- Alrededor del logotipo, deja libre al menos la mitad de la altura del símbolo.
- Logotipo: mínimo 120 px de ancho en pantalla o 30 mm impreso.
- Símbolo: mínimo 24 px con `simbolo.svg`; de 16 a 23 px usa `favicon.svg`.

## Color

- La mira siempre es de color señal, salvo en las versiones de una tinta (todo blanco o todo negro). En el logo es el de la portada, #ff5a1f; el token `senal` del sistema de la app es #FF5B2E (ADR 0054). Son casi iguales y conviene dejar uno solo (pendiente, en la auditoría del 2026-11-15).
- Los trazos son el claro de la portada (#ece8df) sobre oscuro o tinta (#15181B) sobre claro.
- **El sistema es grafito, blanco y una sola señal:** la acción principal es un botón blanco con texto grafito; la señal solo marca el impacto, lo que falta o lo que difiere; los vehículos A y B tienen su color (#5AA9FF y #FFC24B) y no se usan para otra cosa.

## Luz y efectos

Las versiones con efectos usan:

- un degradado de faro en la pintura (de blanco a acero);
- un brillo de baliza en la X;
- una sombra que despega el símbolo del asfalto.

**Se usan solo en:** la apertura y el cierre de la portada, los íconos de la app, la imagen para redes y los videos.

**Nunca se usan:** en tamaños menores a 48 px, en texto corrido ni en impresos.

**La versión plana es la principal:** el logo tiene que funcionar siempre sin efectos.

## Tipografía

- **Interfaz:** Geist (SIL OFL 1.1), con el paquete `geist` de Vercel. Títulos en 600 con tracking negativo; cuerpo en 400–500, 15–17 px.
- **Cifras y rótulos:** Geist Mono (SIL OFL 1.1). Los rótulos van en mayúsculas con tracking 0.08 em («PASO 4 DE 8»).
- **Anybody** queda solo en el logotipo, convertida a contornos (ver Construcción).
- **El nombre CROQUIS nunca se escribe con la fuente:** se usa el SVG.

## No hacer

- Deformar, rotar, recortar o cambiar las proporciones del logo.
- Cambiar la X a otro color que no sea el de señal (o la tinta única de las versiones mono).
- Ponerlo sobre fondos con poco contraste o sobre fotos con mucho detalle sin un velo.
- Agregar efectos distintos a los descritos (biseles, contornos, degradados de colores).
- Recrear el logotipo escribiendo "CROQUIS" con la fuente.
- Imitar logotipos, tipografías o recursos de otras marcas.

## Atribución

Letra del logotipo derivada de **Anybody** © The Anybody Project Authors, bajo la licencia SIL Open Font License 1.1 (`fonts/OFL-Anybody.txt`). La licencia permite usar contornos derivados en un logotipo; la fuente no se redistribuye aquí.

## Regenerar

```bash
pnpm add -w -D @fontsource-variable/anybody   # si no está instalada
uv run --with fonttools --with brotli python -I assets/brand/tools/make_brand.py node_modules/@fontsource-variable/anybody/files/anybody-latin-standard-normal.woff2 assets/brand
```
