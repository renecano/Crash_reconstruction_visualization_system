# ADR 0045 — Sistema de diseño, portada de lanzamiento y sitio bilingüe (F11a)

- **Estado:** aceptado (2026-10-20).
- **Contexto:**
  - **El pedido:** PLAN §11 (experiencia, diseño e historia) y la regla 7 de CLAUDE.md: la marca aprobada de `assets/brand/` en todo el sitio, una portada de lanzamiento donde todo lo que se ve lo calcula el sistema, el flujo guiado, las demás páginas en el mismo sistema y en dos idiomas, y las metas de §11.6.
  - **El plan previo:** `docs/design/plan.md`, con la revisión contra lo genérico, antes de construir (§11.7).
  - **Lo que había:** páginas funcionales con estilos por omisión de Tailwind, solo en español.

## Decisión

### 1. La marca, tal cual

- **Tokens:** `assets/brand/tokens.json` es la fuente. `scripts/tokens.mjs` genera `src/styles/tokens.css` (`--marca-*`, `--efecto-*`) y copia los SVG de la marca a `public/marca/` byte a byte. `--check` falla en CI si algo se desfasa.
- **El logotipo nunca se redibuja:** los componentes `Logotipo` y `Simbolo` muestran los SVG. «CROQUIS» nunca se escribe con la fuente.
- **Íconos:** `scripts/iconos.mjs` rasteriza `favicon.svg` y `app-icon.svg` con Chromium (PNG de 16 a 512, uno enmascarable, `favicon.ico` y el manifiesto de la PWA). Guarda el SHA-256 de los SVG de origen, porque los PNG pueden variar algunos bytes entre sistemas.
- **Tipografía:** Anybody variable, autoalojada con `@fontsource-variable/anybody` (ancho 50–150 % y peso 100–900). Las cifras van con `tnum`.

### 2. Roles de color, no colores sueltos

- **Roles:** `sistema.css` define roles (`--fondo`, `--superficie`, `--texto`, `--texto-2`, `--texto-3`, `--linea`, `--accion`, `--evidencia`) y Tailwind los expone como utilidades (`bg-superficie`, `text-texto-2`…). Los componentes no usan colores sueltos.
- **Amarillo vial solo para acciones de la persona** (botón principal, foco, deslizadores). **Naranja marcaje solo para evidencia que marca el sistema** (citas del relato, punto de impacto). Nada más los usa: el punto «en curso» del progreso y los bordes de error son neutros.
- **Hipótesis del visor:** dejan el naranja (era de evidencia) y quedan concreto claro, azul y violeta, distinguibles con daltonismo común. Son colores de datos, no de marca.
- **El croquis 2D usa el papel del parte** (`COLORES_CROQUIS`: papel, tinta, evidencia y acción de la marca), en el editor y en sus exportaciones.
- **Vidrio:** los paneles sobre la escena 3D usan el efecto `vidrio-oscuro` de los tokens, con desenfoque de fondo.

### 3. Sitio bilingüe

- **Rutas:** grupos `app/(es)` (`<html lang="es-MX">`) y `app/(en)/en`. El cuerpo de cada página vive una sola vez en `src/paginas/*.tsx` y recibe `lang`.
- **Textos:** diccionarios globales tipados (`i18n/es.ts`, `en.ts`) y, por componente, `textos(es, en)` con `useTextos` en el navegador y `textosEn` en el servidor.
- **Lo que el sistema escribe en español** (avisos del solver, mensajes de consistencia, preguntas y validaciones) se traduce con plantillas en `lib/mensajes.ts`. Una prueba las recorre sobre los resultados canónicos y los 220 relatos de desarrollo: ningún mensaje queda sin traducir.
- **Datos de las páginas:** `build-paginas.mjs` genera los textos de historia y recorrido como `{ es, en }` desde `eval/results`; las cifras son las mismas.
- **Lo que se queda en español, marcado con `lang="es-MX"`:** los relatos de Relatos-MX y el cuestionario SUS de `/e9`. Este último es el instrumento del protocolo, y cambiarlo cambiaría la medición.
- **Exportaciones en inglés:** la leyenda, la atribución de OSM y la palabra de la semilla van en inglés. `LegendInfo.etiquetaSemilla` hace que las PNG, el video, el glTF y el croquis del PDF ya no lleven «semilla».

### 4. La portada (PLAN §11.3)

- **Técnica de «mundo por scroll»:**
  - el scroll es el tiempo del viaje;
  - la cámara recorre una curva Catmull-Rom con una pose por capítulo y se asienta a la mitad de cada uno (`linger`);
  - el suavizado no depende de los cuadros por segundo;
  - todo es determinista (`components/portada/camara.ts`, con pruebas de propiedades).
- **Doce capítulos sobre la escena real de Toluca, de noche y con lluvia.** El ambiente se fuerza solo en la vista, como en el ADR 0020.
  - **La revelación:** el croquis se pinta sobre el asfalto (`buildCroquisPaint`) y la escena se levanta de él.
  - **«Impacta»:** el scroll recorre el tiempo del choque, con lecturas de telemetría, y el control de velocidad vuelve a resolver en el navegador.
  - **«Simula»:** muestra una hipótesis fantasma calculada al llegar.
  - **«Las pruebas»:** las cifras de `eval/results` como cotas de dibujo técnico, incluida la de E3, donde WinSMASH se equivoca menos, dicho tal cual. También el comparador de foto de NHTSA contra abolladura de Croquis.
- **El texto es del documento, no de la escena:**
  - cada capítulo es una sección real con su copia fija, y el scroll solo maneja la opacidad;
  - solo la copia visible recibe el puntero;
  - con teclado, enfocar algo de un capítulo lleva el scroll a ese capítulo.
- **Primero el cuadro, después el 3D:**
  - cada capítulo tiene un cuadro fijo (horizontal y vertical) que renderiza el visor real (`scripts/portada.mjs`, en calidad media: la que recibe un celular, para que el paso al 3D en vivo no sea un salto hacia abajo);
  - el cuadro viene en el HTML del servidor y el 3D se monta cuando la página está quieta y ya cargó el resultado;
  - con movimiento reducido no hay 3D ni suavizado: se ve el cuadro fijo de cada capítulo, y el control de velocidad sigue dando su resultado en cifras;
  - la leyenda ilustrativa y la atribución de OSM están siempre sobre la escena.
- **La imagen para redes** usa `logotipo-efectos.svg` tal cual sobre un cuadro renderizado de la escena, con la leyenda.

### 5. Rendimiento de carga (PLAN §11.6)

- **Three.js y Zod no van en el JavaScript inicial:**
  - los paquetes `@croquis/viewer`, `@croquis/scene-schema` y `@croquis/croquis-2d` se declaran `sideEffects: false`, después de verificar que ningún módulo hace nada al importarse;
  - `withSpeed` pasa a `lib/reconstruct-client.ts`;
  - la escena de Toluca llega validada dentro de `portada.json`;
  - el resultado se carga aparte.
- **CSS en el HTML** (`experimental.inlineCss`): el primer pintado no espera otra ida y vuelta de red.
- **`/cuenta` sale del servidor:** el paso se lee de la URL al montar y se cambia con `history.pushState`, que Next integra a su router. `useSearchParams` obligaba a dibujar el flujo solo en el navegador.
- **Nada salta al cargar (CLS):**
  - **La fuente no se precarga; el respaldo tiene sus medidas.** Precargarla evitaba que el texto se acomodara otra vez, pero retrasaba el primer pintado (con la fuente bloqueada, el FCP salía antes). En su lugar:
    - **«Anybody Respaldo»:** caras locales de Arial (o Arial Bold, Liberation Sans o Roboto) por rango de ancho y peso, con un `size-adjust` que iguala el ancho de Anybody en cada rol tipográfico. Se calculó con fontTools sobre textos del sitio y se ajustó midiendo en el navegador. Las métricas verticales son las de Anybody. El texto conserva sus renglones cuando llega la fuente.
    - **Los textos más anchos esperan a Anybody:** el lema y las letras de los capítulos, al 150 %. Ninguna fuente del sistema es tan ancha y tan baja: con su ancho, las letras del respaldo eran más altas que el interlineado del lema y los renglones se encimaban. Usan el mismo archivo con `font-display: block`, así que no se muestran hasta 3 s y mientras tanto ocupan lo que ocuparán.
    - **La fuente pesa menos:** `scripts/fuente.py` recorta los ejes a lo que usa el sitio (peso 400–800 y ancho 100–150 %), con las mismas formas en ese rango.
    - **El lema tiene renglones fijos:** en el celular, cada trozo («Cuenta lo / que pasó.») va en su renglón; en pantallas anchas, cada frase. El tamaño baja lo necesario para que el renglón más ancho quepa con Anybody.
    - **La leyenda del celular va en dos renglones:** la atribución de OSM ya no sigue a la leyenda en el mismo renglón, donde saltaba de un renglón a otro al cambiar la fuente.
  - **`/medicion` sale del servidor** igual que `/cuenta`: la configuración de la URL se lee al montar.
  - **`/visor` reserva su lugar:** sigue leyendo la URL con `useSearchParams`, porque sus controles viven ahí. Mientras se dibuja en el navegador, el hueco mide lo mismo que el selector de escena y el marco del visor, y el pie no salta.
- **Cómo se mide** (`eval/f11_portada.mjs`, decisión de medición):
  - **Configuración:** Lighthouse en modo celular con red 4G y CPU 4×, en el build de producción, 3 corridas por página. Espera hasta 120 s a que la página quede en reposo (la portada arma su escena 3D en tareas cortas durante varios segundos; con los 45 s por omisión, Lighthouse no alcanzaba a verla en reposo). Si Lighthouse no termina una corrida, se repite hasta 2 veces y la falla queda anotada en el resultado.
  - **El criterio se evalúa con la limitación aplicada** (`devtools`): Chrome recibe la red 4G de Lighthouse y se mide lo que pasa.
  - **La estimación de Lantern** (`simulate`, la de PageSpeed Insights) se reporta al lado. En estas páginas su LCP queda varias veces arriba del medido, porque suma al LCP los scripts que se piden al inicio aunque el LCP ya ocurrió.
  - **Verificación independiente:** se registraron las entradas de LCP en el navegador con las mismas condiciones de red y CPU. Hay una sola entrada, en el primer pintado, que coincide con la medición aplicada.
  - **Con la laptop conectada:** la CPU 4× se aplica encima del CPU real. Con batería y el modo de eficiencia de Windows, el CPU va mucho más lento y las cifras de la misma página salen varias veces peores, así que no se comparan. El script anota en cada corrida el `benchmarkIndex` de Lighthouse y si había corriente, y no mide con batería salvo con `--bateria`.

### 6. Accesibilidad

- **axe** (WCAG 2.2 A y AA, sin problemas serios ni críticos) en cada página, en los dos idiomas, en cada capítulo de la portada y en cada paso del flujo, en escritorio y en celular.
- **Lo que encontró y se corrigió:**
  - **El enlace de idioma:** su nombre accesible ahora es su texto visible, en su idioma (WCAG 2.5.3).
  - **El relato que se escribe en vivo:** ya no usa `aria-label` en un párrafo; el texto completo va para lectores de pantalla.
  - **Las tablas con desplazamiento:** se pueden enfocar con teclado y tienen nombre (`Desplazable`).
- **Ninguna página se desplaza de lado en el celular.** `:where(.grid) > * { min-width: 0 }` deja encoger a los hijos de las cuadrículas (el editor del croquis se desbordaba por el JSON y el selector de escena), y una prueba e2e lo vigila en cada página.

### 7. `/medicion`

- **Qué es:** PLAN §11.5 nombra la página pero no la define. Aquí es E6 en el navegador, para medir alta y ultra en la computadora de demo sin Node ni Playwright.
- **Método:** la lógica de `lib/medicion.ts`, la misma de `eval/lib/viewer-measure.mjs`:
  - el visor corre en un marco a pantalla completa con los parámetros de E6;
  - calentamiento, ventana de medición, tres repeticiones en orden alterno con pausa, mediana por fps promedio y reintentos por tirones externos.
- **Lo que difiere de E6, y queda en el resultado:**
  - **Vsync:** un navegador normal limita los cuadros a la frecuencia de la pantalla. La página la estima, marca las cifras topadas y explica cómo abrir Chrome sin tope.
  - **Caché:** el navegador conserva su caché entre escenas, así que la carga inicial solo vale en la primera medición.
- **El resultado versionado:** el JSON descargado se convierte en `eval/results/e6_demo.json` con `node eval/e6_navegador.mjs`, que no confía en el resumen de la página y vuelve a elegir la mediana de cada configuración.

## Consecuencias

- **Pruebas e2e nuevas:**
  - `portada`, `accesibilidad` y `capturas-diseno` (referencias visuales de cada capítulo y cada paso, en Linux);
  - un proyecto `movil` (Pixel 7) para la portada, el flujo, las páginas, E9 y la accesibilidad;
  - E9 verifica que el flujo nuevo anote los cinco eventos.
- **Los cuadros de la portada dependen de la cámara:** si cambian `camara.ts`, la escena, su resultado o el logotipo, `pnpm portada` los vuelve a generar y `generate:check` lo exige.
- **Límites:**
  - El TBT de la portada en el celular es alto mientras se arma la escena 3D. No es parte del criterio y el cuadro fijo cubre ese tiempo, pero la escena tarda en responder en equipos modestos. Los horneados ya ceden el hilo principal; lo que queda es la construcción del grafo de escena y de los materiales (ADR 0046, con sus cifras).
  - La estimación de Lantern no cumple la meta de LCP; queda reportada junto a la medición.
