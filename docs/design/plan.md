# Plan de diseño de F11a

Estándar: `PLAN.md` §11. Marca: `assets/brand/BRAND.md` y `assets/brand/tokens.json`, que se usan tal cual. Este plan va antes de construir (§11.7, paso 1). La revisión contra lo genérico está al final (paso 2). Las decisiones se registran en el ADR 0045.

## 1. De dónde sale cada cosa

| Elemento | Fuente | Cómo llega al sitio |
| --- | --- | --- |
| Colores y efectos | `tokens.json` | Un script genera `apps/web/src/styles/tokens.css`. CI comprueba que esté al día; nada se copia a mano. |
| Logotipo, símbolo, favicon e ícono de app | SVG de `assets/brand/` | Se copian byte a byte a `public/marca/`, con una prueba de igualdad. El nombre no se escribe nunca con la fuente. |
| Íconos PNG, `favicon.ico` y manifiesto | `favicon.svg` y `app-icon.svg` | Script reproducible (`scripts/marca.mjs`) que los rasteriza con Chromium (Playwright). |
| Imagen para redes (1200 × 630) | `logotipo-efectos.svg` sobre un cuadro real del visor | El mismo script: renderiza la escena de Toluca de noche y con lluvia y le pone el logotipo encima. |
| Cuadro estático de la portada | Un cuadro real del visor | El mismo script, en 1920 × 1080 y 828 × 1792. Es la imagen LCP antes de que cargue el 3D. |
| Tipografía | `@fontsource-variable/anybody` 5.3.0 | Autoalojada. Solo los subconjuntos latino y latino extendido, con los ejes de ancho y peso. |

## 2. Tokens

### 2.1 Color

Los nombres de marca vienen de `tokens.json`. Cada uno tiene **un rol semántico**, y los componentes solo usan los roles:

| Rol | Token | Uso |
| --- | --- | --- |
| `--fondo` | asfalto-noche `#0B0D0F` | Fondo de página. En la portada, debajo de la escena real. |
| `--superficie` | asfalto-mojado `#171B1F` | Paneles y campos de formulario. |
| `--superficie-alta` | asfalto `#2A2D30` | Bordes, separadores y superficies sobre superficies. |
| `--texto` | blanco-vial `#F4F2EC` | Texto principal y trazos. |
| `--texto-2` | concreto-claro `#B7BCC1` | Texto secundario sobre oscuro (AA). |
| `--texto-3` | concreto `#8A8F94` | Solo texto grande o no esencial sobre `--superficie`. |
| `--accion` | amarillo-vial `#F2B705` | El botón principal y el foco. Nunca en el logo ni en adornos. |
| `--evidencia` | naranja-marcaje `#FF6A13` | Solo lo que el sistema marca como evidencia: citas, punto de impacto, banderas de inconsistencia y la X del logo. |
| Tema papel | papel `#EFEBE1` / tinta `#15181B` | El lienzo del croquis 2D y las exportaciones, como el parte de tránsito. |

**Contraste, por calcular y probar:** blanco-vial y concreto-claro sobre asfalto-noche y asfalto-mojado deben pasar AA. Concreto (`#8A8F94`) sobre asfalto-noche se usa solo en texto grande. Tinta sobre amarillo-vial en el botón principal debe pasar AA. Una prueba unitaria calcula los contrastes con la fórmula de WCAG a partir de `tokens.css`.

### 2.2 Tipografía: Anybody variable, una sola familia

Todos los tamaños vienen de una escala de tokens, con `clamp()` para pasar de celular a escritorio sin saltos. No hay tamaños sueltos.

| Token | Uso | Tamaño | `wdth` | `wght` | Interlínea | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| `--t-lanzamiento` | Frase de apertura y cierre | clamp(2.75rem, 7.5vw, 7rem) | 150 | 760 | 0.98 | 0.01em |
| `--t-capitulo` | Titular de cada capítulo | clamp(2.25rem, 5.5vw, 4.75rem) | 140 | 700 | 1.02 | 0.012em |
| `--t-letra` | La letra del capítulo (C, R, O…) | clamp(5rem, 14vw, 12rem) | 150 | 800 | 0.9 | 0 |
| `--t-titulo` | Título de página | clamp(1.9rem, 3.6vw, 3rem) | 125 | 650 | 1.08 | 0.01em |
| `--t-subtitulo` | Títulos de sección | 1.375rem | 112 | 600 | 1.2 | 0 |
| `--t-cuerpo` | Lectura | 1.0625rem (17 px) | 104 | 420 | 1.55 | 0 |
| `--t-interfaz` | Controles y etiquetas | 1rem | 104 | 480 | 1.4 | 0 |
| `--t-nota` | Fuentes y notas | 0.875rem | 100 | 420 | 1.45 | 0.005em |
| `--t-cota` | Lecturas y mediciones | según el contexto | 112 | 560 | 1.1 | 0.02em, `tabular-nums` (la fuente trae `tnum`) |

- **Medida:** la columna de lectura es de 64ch como máximo.
- **Mayúsculas:** mayúscula solo al inicio, en todo el sitio. No hay etiquetas en mayúsculas.

### 2.3 Espacio, retícula y forma

- **Espacio:** escala de 4 px (`--e-1` = 4 px … `--e-12` = 128 px).
- **Retícula:**
  - **Escritorio:** 12 columnas con margen de 6vw.
  - **Celular:** 4 columnas con margen de 20 px.
  - **Alineación:** el contenido se alinea a la izquierda; solo la apertura y el cierre de la portada se centran (§11.2).
- **La línea de carril:** una raya vertical discontinua de 2 px, con el patrón de la raya de carril de la NOM-034 (2.5 : 5), a la izquierda de la columna de texto.
  - **En las páginas:** es el ancla de la retícula. El texto empieza a 24 px de ella, y las cotas y anotaciones se apoyan en la misma línea.
  - **En la portada:** es una raya real de la escena, la de la calle principal, y la columna de texto se ancla a ella.
- **Forma:**
  - **Radios:** 2 px en controles y 4 px en paneles; no hay tarjetas redondeadas.
  - **Separadores:** líneas de 1 px de `--superficie-alta`.
  - **Paneles sobre la escena 3D:** el efecto «vidrio oscuro», con el filo de luz de 1 px que traen los tokens.

### 2.4 Efectos

Sale todo de `tokens.json`, y cada efecto tiene un solo lugar:

- **Botón principal:** el efecto `boton-principal`. Solo hay uno por pantalla.
- **Logotipo con efectos:** solo en la apertura y el cierre de la portada y en la imagen para redes, a más de 300 px de ancho.
- **`sombra-profunda`:** solo en el ícono de app y en los paneles que flotan sobre la escena 3D.
- **`luz-escena`:** el fondo de respaldo mientras la escena no carga.
- **Lo que no se usa:** degradados decorativos y efectos en texto corrido o por debajo de 48 px.

### 2.5 Movimiento

- **Las dos únicas animaciones:** una sola secuencia de apertura (los faros revelan la escena) y la cámara guiada por el scroll.
- **Todo lo demás:** cambios de estado de 120 ms, sin animaciones de entrada por sección.
- **Con `prefers-reduced-motion`:** los capítulos son cuadros fijos de la escena real, se avanza paso a paso y no hay lluvia animada.

## 3. Componentes

| Componente | Qué es | Notas |
| --- | --- | --- |
| `Encabezado` | Logotipo (`logotipo.svg`, ≥ 120 px) a la izquierda; navegación corta y cambio de idioma a la derecha. | En celular usa `simbolo.svg` (≥ 24 px), con el nombre de la marca como texto accesible. Fondo transparente sobre la escena y vidrio oscuro al hacer scroll. |
| `Pie` | Atribuciones (OSM y NHTSA), leyenda, enlaces y licencia. | `logotipo.svg`. |
| `BotonPrincipal` | Amarillo vial con su efecto. | El texto dice lo que pasa. |
| `BotonSecundario` | Borde de 1 px blanco vial, sin relleno. | |
| `Cota` | Una medición como línea de cota de dibujo técnico: extremos con tope, valor con `tabular-nums`, unidad y enlace a su evaluación. | Cada número del sitio se dibuja así o enlaza a su fuente. |
| `Cita` | Fragmento del relato que respalda un dato: subrayado naranja de 2 px y número de campo. | Solo evidencia. |
| `Lectura` | Telemetría: etiqueta pequeña, valor grande tabular e intervalo. | En el visor y en el capítulo I. |
| `PasosDelFlujo` | Los 4 pasos (Cuenta · ¿Qué falta? · Ubica · Simula) como tramos de carril: el actual es raya continua, los hechos discontinua sólida y los siguientes discontinua tenue. | Es una secuencia real y se puede regresar a cualquier paso. |
| `Leyenda` | «Reconstrucción ilustrativa… No es un peritaje.» | Siempre visible en el visor y en la portada desde el capítulo I. |
| `Estado` | Vacío, error y sin conexión: qué pasó y qué hacer. | Sin disculpas. |

## 4. La portada (§11.3)

- **Técnica:** «mundo por scroll» (skill `scroll-world`).
  - **Tiempo:** el scroll es el tiempo, y la cámara recorre una curva continua (`CatmullRomCurve3`) sin cortes.
  - **Pausa:** el easing `linger` (L = 0.4) frena la cámara a mitad de cada capítulo, justo cuando el texto llega a su pico.
  - **Suavizado:** el progreso se acerca al objetivo con lerp 0.09; con movimiento reducido, con 1.
- **Escena:** la intersección real de Toluca (`interseccion_toluca`: calles de OSM y raya de alto), de noche y con lluvia (ambiente forzado solo en la vista, ADR 0020).
- **Quién calcula:** el solver real (Web Worker). El visor solo agrega tres cosas a lo que ya hace:
  1. **Cámara guiada desde afuera:** una pose por cuadro que entrega la portada.
  2. **Capa de croquis pintado sobre el asfalto:** las siluetas y trayectorias del croquis 2D como pintura vial, con la misma geometría que `@croquis/croquis-2d`.
  3. **Revelado:** de 0 a 1, los vehículos y personas pasan de la pintura al 3D. Crecen en altura desde el piso mientras la pintura se desvanece.
- **Control de velocidad (capítulo I):** cambia la velocidad del vehículo A en el spec, el Web Worker reconstruye y la escena se reemplaza. Las lecturas cambian con el resultado nuevo.

Los valores entre ‹ › son lugares para datos medidos: nunca se escriben a mano (CLAUDE.md, regla 3).

```
APERTURA (centrado)                      EL PROBLEMA
┌──────────────────────────────────┐      ┌──────────────────────────────────┐
│ [logotipo]                  ES|EN│      │ ┊                                │
│                                  │      │ ┊  ‹cifra de ATUS›               │
│      (escena: noche, lluvia,     │      │ ┊  ‹qué cuenta, de historia.json›│
│       faros que la revelan)      │      │ ┊  ├────────── ATUS, INEGI ──┤   │
│                                  │      │ ┊                                │
│         [logotipo con efectos]   │      │ ┊  (croquis a mano: trazo de     │
│  Cuenta lo que pasó. Míralo pasar│      │ ┊   lápiz sobre papel del parte) │
│        [ Cuenta qué pasó ]       │      │ ┊  Así se explica hoy un choque. │
└──────────────────────────────────┘      └──────────────────────────────────┘
C — CUENTA                               R — RECONOCE
┌──────────────────────────────────┐      ┌──────────────────────────────────┐
│ ┊ C                              │      │ ┊ R                              │
│ ┊ Lo dices con tus palabras.     │      │ ┊ Cada dato sale de una frase.   │
│ ┊ ┌──────────────────────────┐   │      │ ┊ «se me cerró» ─────▶ maniobra  │
│ ┊ │iba por Tollocan y se me  │▌  │      │ ┊ «como a 50»   ─────▶ 50 km/h   │
│ ┊ │cerró una camioneta…      │   │      │ ┊ (citas en naranja; el dato     │
│ ┊ └──────────────────────────┘   │      │ ┊  queda pegado a su frase)      │
└──────────────────────────────────┘      └──────────────────────────────────┘
O — ORDENA                               Q — ¿QUÉ FALTA?
│ ┊ antes ──── impacto ──── después│      │ ┊ Una sola pregunta:             │
│ ┊   −1.2 s      0 s      +2.4 s  │      │ ┊ ¿A qué velocidad iba la        │
│ ┊ (la escena salta a cada momento)│     │ ┊  camioneta?   [    ] km/h      │
U — UBICA (vista cenital)                I — IMPACTA (la revelación)
│ ┊ El croquis se pinta en la calle│      │  t = ‹s› ───────●──────────────  │
│ ┊ (siluetas y flechas de pintura │      │  (la cámara baja; la pintura se  │
│ ┊  vial sobre el asfalto mojado) │      │   levanta y es la escena 3D)     │
│                                  │      │  A ‹velocidad› ΔV ‹valor ± int.›│
│                                  │      │  Velocidad de A ──●── ‹del spec›│
S — SIMULA                               LAS PRUEBAS
│ ┊ Desde cualquier lugar:         │      │ ┊ ├── ‹F1 de E1› ─┤ extracción   │
│ ┊ [libre] [conductor] [hipótesis]│      │ ┊ ├── ‹error E3› ─┤ ΔV contra EDR│
│ ┊ (fantasma de la hipótesis)     │      │ ┊ [foto NHTSA ▏ abolladura]  E5 │
LO QUE NO ES                             CIERRE (centrado)
│ ┊ No es un peritaje.             │      │      [logotipo con efectos]      │
│ ┊ No decide culpas.              │      │ [ Cuenta qué pasó ] Ver un ejemplo│
│ ┊ No estima lesiones.            │      │                                  │
```

- **Celular:**
  - **Texto:** va abajo, sobre un velo degradado.
  - **Cámara:** se aleja según el aspecto de la pantalla.
  - **Rendimiento:** no hay sombras de alta calidad, y el `pixelRatio` es de 1.5 como máximo.
- **Teclado:**
  - **Riel de capítulos:** a la derecha, con botones accesibles y un área táctil de 44 px o más.
  - **Navegación:** `Re Pág` y `Av Pág` saltan de capítulo.
- **Carga:**
  - **Antes del 3D:** primero el cuadro estático (`<img>` con `fetchpriority=high`) y el texto.
  - **Después:** el 3D se monta cuando la página está inactiva, y si el equipo no da la calidad mínima se queda en los cuadros estáticos.
- **Cifras de la portada:** las de «El problema» y «Las pruebas» salen de `eval/results/` con `build-paginas.mjs`, igual que hoy.

## 5. El flujo guiado (§11.4): `/cuenta`

Es una sola página con los pasos visibles y un solo botón principal por paso. El estado vive en `sessionStorage`, como hoy, así que se puede volver sin perder nada.

```
[logotipo]  Cuenta ━━━ ¿Qué falta? ┅┅┅ Ubica ┅┅┅ Simula        ES|EN
┊ Cuenta qué pasó                        ┊ Lo que va entendiendo
┊ ┌───────────────────────────────┐      ┊  • 2 vehículos
┊ │ Escribe como se lo contarías  │      ┊  • «como a 50» → 50 km/h
┊ │ a alguien…                    │      ┊  • piso mojado
┊ └───────────────────────────────┘      ┊
┊ Ejemplos: [alcance] [moto] [peatón]    ┊
┊                       [ Leer mi relato ]
Mientras la IA lee (5–10 s): «Quitando datos personales ✓ · Buscando vehículos… · Ordenando
la línea de tiempo…», con lo que de verdad va pasando (eventos NDJSON del servidor).
```

1. **Cuenta:** el relato, ejemplos y el contador de datos, con cada dato y su cita marcada en el texto.
2. **¿Qué falta?:** las preguntas que más cambian el resultado. Se puede contestar o saltar.
3. **Ubica:**
   - **Croquis:** el editor sobre papel del parte.
   - **Guía:** una corta la primera vez, que se puede cerrar: arrastrar, rotar y dibujar la trayectoria.
   - **Deshacer:** con `Ctrl+Z` y con un botón.
4. **Simula:**
   - **Visor:** lecturas de telemetría por vehículo (velocidad y ΔV con su intervalo) y una línea de tiempo tipo traza con marcadores de inicio de frenado, impacto y reposo.
   - **Cámaras:** predefinidas.
   - **Hipótesis:** comparación en pantalla dividida.
   - **Leyenda:** siempre visible.

**Herramientas avanzadas:** `/relato`, `/croquis` y `/visor` siguen existiendo. `/relato` lleva al flujo, y los botones de E9 cambian de nombre en `docs/e9/protocolo.md`. Los 5 eventos de E9 se registran en los mismos momentos.

## 6. Las demás páginas

- **`/demo`, `/recorrido` y `/e9`:** el mismo sistema.
  - **Gráficas del recorrido:** una sola paleta de roles. Croquis va en blanco vial, las alternativas en concreto y el mejor valor marcado con su cota. Se siguen generando desde `eval/results/`.
- **`/historia`:** se vuelve la versión extendida de la portada. Toma de ella el texto largo de cada letra y los datos de ATUS, sin duplicar el contenido de los capítulos.
- **`/medicion` (nueva):** E6 en el navegador, para medir alta y ultra en la computadora de demo sin Node ni Playwright.
  - **Qué hace:** recorre las escenas canónicas en el nivel elegido y toma la mediana de 3 repeticiones, con el mismo método que `eval/e6_performance.mjs`.
  - **Qué entrega:** un JSON que se descarga y se copia a `eval/results/`.
  - **Diseño:** el sistema de diseño, con prioridad a la claridad.

## 7. Bilingüe

- **Rutas:**
  - **Español de México:** es el idioma por omisión y vive en la raíz.
  - **Inglés:** completo, bajo `/en/…`.
  - **Atributos:** cada página lleva `lang` y `hreflang`.
- **Textos:** van en diccionarios tipados (`src/i18n/{es,en}.ts`) con las mismas claves. Una prueba exige que existan las mismas claves en los dos.
- **Datos generados** (historia, recorrido y demo): llevan sus textos en los dos idiomas desde `build-paginas.mjs`.
- **El relato:**
  - **Sigue en español de México:** el extractor y el glosario son de español mexicano.
  - **Qué dice la versión en inglés:** lo explica, y los ejemplos de la demo se muestran en su idioma original con una traducción al lado.
  - **Exportaciones:** en la página en inglés, la leyenda, la atribución y la semilla de las exportaciones van en inglés; en español siguen igual (§10, ADR 0045 §3).

## 8. Rendimiento y accesibilidad (§11.6)

- **Presupuestos de la portada:** carga inicial de 8 MB o menos, LCP de 2.5 s o menos y CLS menor que 0.1 en celular con 4G simulada.
  - **Cómo se mide:** con un script en `eval/` y Lighthouse, con el resultado en `eval/results/`.
- **Accesibilidad:**
  - **axe:** sin problemas serios en cada página, con `@axe-core/playwright` en los e2e.
  - **Lighthouse:** 95 o más en accesibilidad.
  - **Teclado y foco:** foco visible en amarillo vial (2 px más 2 px de separación) y navegación completa con teclado.
  - **Capítulos:** el texto de cada capítulo describe lo que se ve. La escena y sus cuadros fijos son decorativos para lectores de pantalla (`aria-hidden` y `alt` vacío), para no repetirlo dos veces.
- **E6 sin cambios:** el visor no cambia de costo. La capa de croquis y el revelado solo se montan en la portada, y E6 se vuelve a medir para comprobarlo.

## 9. Proceso y pruebas

1. **Revisión contra lo genérico:** abajo, antes de construir.
2. **Base:** tokens, fuente, marca, íconos, imagen para redes, encabezado, pie e idioma.
3. **Flujo guiado y visor:** las lecturas, la traza y la pantalla dividida.
4. **Portada:** la cámara por scroll, la capa de croquis, el revelado y el control de velocidad.
5. **Demás páginas:** demo, recorrido, `/e9`, `/medicion` e historia.
6. **Pruebas:**
   - **e2e:** en escritorio (1440 × 900) y en celular (390 × 844, táctil).
   - **Capturas visuales:** de cada capítulo y cada paso.
   - **Accesibilidad:** axe.
   - **Movimiento reducido.**
   - **Consola:** sin errores.
7. **Crítica con capturas** en 1440, 1920 y 390 px, y con movimiento reducido.
8. **Revisión independiente** de un agente que no participó, contra §11; lo que encuentre se corrige.
9. **Mediciones:** Lighthouse, LCP y CLS, y otra vez E6. Después, despliegue y la nota «listo para E9».

## 10. Revisión contra lo genérico (§11.7, paso 2)

Cada estilo por defecto de páginas generadas, comparado con este plan y con lo que se cambió:

| Patrón genérico | Riesgo en este plan | Qué se hizo |
| --- | --- | --- |
| Fondo negro con un solo acento chillón | Alto: el fondo es oscuro y hay un amarillo y un naranja intensos. | El fondo de la portada no es un color plano: es el asfalto real de la escena, con PBR y lluvia; en las páginas, asfalto mojado con la textura sutil del asfalto del visor. El amarillo aparece una sola vez por pantalla (la acción) y el naranja solo donde hay evidencia. El color dominante es el blanco vial de la pintura, no el acento. |
| Tarjetas redondeadas idénticas con sombra gris | Medio: el recorrido y la demo tenían listas de tarjetas. | Sin tarjetas: el contenido va en la retícula de la línea de carril, separado por líneas de 1 px y por cotas. Las únicas superficies son los paneles de vidrio sobre la escena 3D, con 4 px de radio y un filo de luz en vez de sombra gris. |
| Etiquetas en mayúsculas sobre cada título («eyebrow») | Alto: la plantilla de `scroll-world` las trae. | Se quitaron. En su lugar va la letra del capítulo (C, R, O…), que es la secuencia real del acrónimo y del flujo, y nada más. |
| Gradientes decorativos | Medio: los tokens traen degradados. | Solo los degradados con significado de los tokens (faro en la pintura, baliza en la X y luz del botón principal), en los lugares que dice BRAND.md. No hay fondos con degradado, salvo el respaldo `luz-escena` mientras carga el 3D. |
| Numeraciones que no son secuencia («01 / 02 / 03») | Alto: la plantilla numera las escenas. | Solo hay dos numeraciones: C-R-O-Q-U-I-S, que es el orden real del proceso, y los 4 pasos del flujo, que se siguen en orden. |
| Animación de entrada en cada sección y efectos al pasar el mouse | Medio. | Una sola secuencia de apertura y la cámara del scroll; los cambios de estado duran 120 ms. |
| Íconos de stock decorando cada punto | Bajo. | Sin íconos decorativos. Los pocos que hay salen del dibujo del croquis (flecha de trayectoria, X de impacto y raya de carril). |
| Texto de relleno de marketing («revoluciona», «potencia») | Medio. | El texto habla como persona (§11.1.7), con frases cortas que dicen qué hace el sistema y cuánto mide. Cada número enlaza a su fuente. |
| Héroe con ilustración o video | — | El héroe es la escena real calculada en vivo; antes de cargar se ve un cuadro real del mismo visor, no una ilustración. |
| Pila de tipografías genéricas (Inter o del sistema) | — | Anybody variable autoalojada, con el eje de ancho como voz de la marca (titulares anchos, lectura normal). |

## 11. Revisión independiente (§11.7, paso 8; 2026-10-20)

Un agente que no participó en el diseño revisó el build de producción con capturas a 1440, 1920, celular (Pixel 7) y movimiento reducido, contra §11, BRAND.md y este plan. Encontró 23 puntos. Qué se hizo con cada uno:

| # | Hallazgo | Qué se hizo |
| --- | --- | --- |
| 1 | El service worker servía la portada en lugar de `/cuenta` y de las páginas `/en/…` al recargar | Corregido: las páginas sin precargar van a la red; el inicio en su idioma solo sin red. Prueba e2e nueva. |
| 2 | En el celular la leyenda tapaba el texto y las lecturas | Leyenda compacta (dos renglones cortos) bajo el encabezado en el celular y en un panel de vidrio en escritorio; las lecturas bajan; encabezado más opaco al hacer scroll. |
| 3 | La revelación no se leía: la acción quedaba detrás del texto | La proyección se desplaza (`setViewOffset`) para poner la acción del lado contrario al texto; contornos con trazos más cortos; sin lluvia mientras se ve el croquis pintado; cámara de «Impacta» más cerca y con menos cielo. |
| 4 | «Simula» empezaba sin autos; lecturas tapaban; ΔV sin intervalo | «Simula» abre con la cámara que sigue a los vehículos y reproduciendo; lecturas compactas y con el resultado completo (ΔV con intervalo). |
| 5 | Titulares de `/recorrido` desbordados | Columna más ancha y titular a la medida de la columna. |
| 6 | La «I» se veía como un rectángulo | Cada letra lleva su palabra. |
| 7 | Demasiado naranja en «Reconoce»; faltaban los campos | Cinco citas con su campo y valor; solo ellas van subrayadas. |
| 8 | Las cotas no decían si más es mejor; la foto y el render no coincidían | Cada cota dice «menos es mejor»/«más es mejor» y marca el mejor valor con ★; el comparador usa la prueba 4389, con la misma vista en la foto y en el render. |
| 9 | Lecturas contradictorias; el modo sin movimiento engañaba | «ahora» y «antes de frenar»; el resultado dice a qué velocidad llega A al impacto y dónde queda; aviso de imagen fija con movimiento reducido. |
| 10 | «Una sola pregunta» contra varias en el flujo | «La pregunta que más importa»: pregunta primero lo que más cambia el resultado (PLAN §11.3 pide mostrar una). |
| 11 | Jerarquía del flujo | Un H1 por paso; en «Ubica» el croquis va primero; el atajo Ctrl+Z no se muestra en pantallas táctiles; el riel distingue «hecho» de «disponible»; en el visor, resultados e hipótesis antes de exportar. |
| 12 | `/demo` con tarjetas iguales | Lista sobre la retícula, cada caso con su croquis calculado. |
| 13 | `/historia` repite la portada | **No se cambió.** Este plan (§6) define la historia como la versión extendida de la portada: el texto largo de cada letra. |
| 14 | La «í» de Anybody se lee «i» a tamaño de lectura | Copia de Anybody con el acento de la «í» más grande y separado (`scripts/fuente.py`, OFL 1.1). |
| 15 | Inglés poco natural y español sin marcar | Traducción al lado de los relatos, títulos de escena, niveles de calidad, intervalos con signo menos y frases corregidas. «narrative» se queda: es el término de todo el sitio. |
| 16 | Cielo azul y pasto oliva fuera de los tokens | El cielo de la portada pasa a asfalto-noche. El suelo del visor **no se cambió**: es la escena física de cada caso, no interfaz. |
| 17 | El 3D en vivo se veía peor que el cuadro fijo | Los cuadros fijos se renderizan en calidad media, la que recibe un celular. |
| 18 | Abolladuras como ruido | Se vio con render por software (SwiftShader). En los cuadros fijos, renderizados con GPU, la zona de contacto se ve arrugada; se vuelve a revisar en la computadora de demo. |
| 19 | Áreas táctiles menores de 44 px | Pasos del flujo, deslizadores, marcadores de la traza, casillas, ajustes del visor y enlaces del pie. |
| 20 | Leyenda de escritorio sin velo | Panel de vidrio, texto a la izquierda. |
| 21 | El anillo de impacto aparecía antes del croquis | Aparece a partir de «Ubica». |
| 22 | Preguntas sin unidades | km/h o m junto al campo. |
| 23 | Texto secundario sobre la escena | Concreto claro en las cotas sobre la escena. |
