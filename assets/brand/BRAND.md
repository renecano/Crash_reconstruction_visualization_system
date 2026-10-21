# Marca de Croquis

Guía de uso del logo y del sistema visual. Es la referencia fija para la app, el sitio, las exportaciones y los videos (ver `PLAN.md` §11.2). Los valores exactos están en `tokens.json`.

## Qué significa

- **La C** está hecha con tres rayas de pintura vial, como las líneas de carril. También se lee como la trayectoria de un vehículo.
- **La X de señal** en la abertura es como marcan los peritos el punto de impacto en un croquis.
- **El logotipo CROQUIS** va en mayúsculas extendidas con espaciado amplio: técnico, sobrio, de lanzamiento.

El logo cuenta lo que hace el producto (calle, trayectoria, punto de impacto) sin mostrar un choque. Es coherente con el principio "el espectáculo es la precisión, no la violencia".

## Archivos

| Archivo | Cuándo usarlo |
|---|---|
| `logotipo.svg` | Uso principal sobre fondos oscuros (barra del sitio, pies de página, exportaciones). |
| `logotipo-sobre-claro.svg` | Sobre papel o fondos claros. |
| `logotipo-efectos.svg` | Momentos de presentación: apertura de la portada, imagen para redes, video. Solo sobre oscuro y a más de 300 px de ancho. |
| `logotipo-integrado.svg`, `logotipo-integrado-sobre-claro.svg` | El símbolo hace de C. Para piezas de marca y la apertura; no para la barra de navegación. |
| `logotipo-blanco.svg`, `logotipo-negro.svg` | Una sola tinta: impresión, bordado, fondos de foto, sellos. |
| `simbolo.svg`, `simbolo-sobre-claro.svg` | Cuando el nombre ya aparece cerca o falta espacio (avatar, marca de agua en el visor). |
| `simbolo-efectos.svg` | Ícono grande en presentaciones. |
| `simbolo-blanco.svg`, `simbolo-negro.svg` | Una sola tinta. |
| `favicon.svg` | Favicon y tamaños de 16 a 32 px: trazos engrosados para que se lea. |
| `app-icon.svg` | Maestro de 1024 px para los íconos de la app instalada (PWA) y Apple touch. |
| `tools/make_brand.py` | Regenera todos los SVG a partir de la fuente; no editar los SVG a mano. |

## Construcción

- **Símbolo** (lienzo de 120 × 120): arco de radio 44 centrado en (60, 60), abierto 90° hacia la derecha, grosor 13, guiones de 52 con espacios de 25.6 (tres rayas exactas). La X mide 18 × 18, va centrada en (100, 60) con grosor 6 y puntas redondeadas.
- **Logotipo**: el símbolo mide unas 2.1 veces la altura de las mayúsculas, con las mayúsculas centradas en él y una separación de 0.27 veces el símbolo.
- **Letra del logotipo**: Anybody a ancho 150, peso 560, espaciado 0.16 em, convertida a contornos.

## Espacio libre y tamaños mínimos

- Alrededor del logotipo, deja libre al menos la mitad de la altura del símbolo.
- Logotipo: mínimo 120 px de ancho en pantalla o 30 mm impreso.
- Símbolo: mínimo 24 px con `simbolo.svg`; de 16 a 23 px usa `favicon.svg`.

## Color

- La X siempre es de color señal (#FF5B2E desde el 2026-10-21, ADR 0054; antes naranja marcaje #FF6A13), salvo en las versiones de una tinta (todo blanco o todo negro).
- Los trazos son blanco vial sobre oscuro o tinta sobre claro. El símbolo y el logotipo no cambiaron con el rediseño.
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
