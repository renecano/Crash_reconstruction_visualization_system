# Croquis · Rediseño "Laboratorio" (prompt para Claude Code)

Vas a rediseñar la app de Croquis para CESVI (`/cesvi` y los casos) siguiendo el diseño aprobado en el canvas "Croquis — Rediseño 2.0", filas **Laboratorio**. La referencia visual manda: si algo de este texto contradice el canvas, pregunta. La calidad no se rebaja en ningún punto; si falta tiempo, cambia el orden, no el nivel.

Dos reglas que no se rompen:
1. **Ningún número se inventa.** Toda cifra sale del caso, del solver o de un supuesto declarado con su fuente. Si no existe, se muestra "sin dato", nunca 0.
2. **Nada de frases de marketing dentro de la app.** Los títulos dicen qué hay en la pantalla ("Casos", el nombre del hecho, "Velocidad al impacto", "Daños"…). Los lemas son para la página web, no para la app.

---

## 0. Primero, errores de datos (con un test cada uno antes de corregirlo)

1. En Daños, C1–C6 salen en 0 cm y la energía y el Δv en 0 en el caso AXA A2010930, aunque el reporte sí trae medidas. Revisa el parser y el mapeo a la cara del impacto. Sin medida → "sin dato" con el motivo.
2. V2 aparece a 34.5 km/h (solver de trayectorias) y a 63.90 km/h (McHenry por deformación) sin decir que son métodos distintos. Toda cifra lleva su método al lado. Verifica que 63.90 salga de deformaciones reales.
3. "Posiciones finales: Croquis tiene 0 de 0" → "Sin dato en el reporte · no comparable".
4. "Bitácora de los agentes (1 mensajes)" → pluralización correcta.
5. El dictamen repite título. Un solo título.

## 1. Marca

- **No cambies el logo.** Es el de la página "Croquis para CESVI": la C de trayectoria con escala de transportador y la mira naranja `#FF5A1F`. Toma de ahí el `<symbol id="mark">` (versión completa con marcas de escala, para tamaños ≥ 48 px) y `mark-sm` (para el header y tamaños chicos). Las marcas de escala se generan cada 15° de 60° a 300° (radio interno 26.2 en múltiplos de 45°, si no 27.3; radio externo 29.6).
- Wordmark: `CROQUIS` en Anybody, `wdth 132`, peso 650, `letter-spacing: 0.2em`. Anybody se usa **solo** en el wordmark.

## 2. Tipografía

| Uso | Fuente | Notas |
|---|---|---|
| Títulos y cifras protagonistas | Instrument Serif | peso 400; las cifras grandes van en **itálica**, `letter-spacing: -0.045em`, `font-variant-numeric: tabular-nums` |
| Interfaz | Instrument Sans | 13–20 px |
| Datos, IDs, rangos | Geist Mono | 10–15 px |

Autoalójalas con `next/font`. Deja el par tipográfico en un solo lugar (tokens) para poder probar Sora o Manrope sin tocar componentes.

## 3. Tokens: Día y Noche

El tema sigue `prefers-color-scheme` la primera vez; luego el botón luna/sol del header lo cambia y se recuerda en `localStorage`. Transición de colores: 400 ms.

| Token | Día | Noche |
|---|---|---|
| `bg` | #F4F5F7 | #0A1120 |
| `surf` (hojas) | #FFFFFF | #111A2C |
| `surf2` | #F1F2F4 | #17223A |
| `line` | #ECEEF1 | rgba(148,170,210,.16) |
| `line2` | #C9CDD4 | rgba(148,170,210,.30) |
| `tx` | #0B0D12 | #E8EEF8 |
| `tx2` | #3A3F49 | #B4C0D4 |
| `tx3` (mínimo para texto) | #5B616C | #8D9BB4 |
| `pri` / `priTx` (acción principal) | #0B0D12 / #FFFFFF | #E8EEF8 / #0A1120 |
| `soft` (resaltes) | #ECEEF1 | #1E2B47 |
| `tipBg` / `tipTx` (tooltips, invertidos) | #0B0D12 / #FFFFFF | #E8EEF8 / #0A1120 |
| Escena: luz (degradado radial) | #FFFFFF → #E7E9ED | #14213C → #070D19 |
| Escena: losa de la vía | #FFFFFF | #1C2944 |
| Escena: camellón (punteado) | #ECEDEF | #131D33 |
| Escena: orillas / carriles | #D5D8DE / #CACED5 | #2C3A57 / #3A4A6A |
| Vehículo (maqueta) | #FFFFFF, detalles #D7DBE1 / #F1F2F4 | #DCE6F5, detalles #8FA1BF / #C3D0E6 |
| Inicio del degradado de velocidad | #0B0D12 | #8FB4FF |
| Impacto y zonas de daño | #FF5A1F (zonas al 45 %) | igual |

Sombras: hojas `0 30px 80px rgba(27,34,48,.12)` en día y `0 30px 80px rgba(0,0,0,.5)` en noche; vehículos con `drop-shadow` de 10/14/10 px. El naranja es **solo** para el impacto, el daño y el punto de "dónde estás" en la barra de actos. Contraste AA en todo texto, en los dos temas.

## 4. Estructura

- **6 actos**: El hecho · La escena · Reconstrucción · Análisis · Contra CESVI (solo si el caso trae reporte) · Dictamen. Rutas `/cesvi/casos/[id]/{hecho,escena,reconstruccion,analisis,contraste,dictamen}`; redirige las viejas.
- **Header de 72 px** (fondo translúcido con desenfoque): logo + wordmark + "AXA A2010930 · Ahome, Sin." en mono a la izquierda; al centro los 6 actos en una rejilla de 6 columnas con una línea de 2 px debajo que se llena hasta el acto actual, rematada con un punto naranja; a la derecha luna/sol, Presentar y Exportar.
- **Una acción principal por pantalla**: barra negra (blanca en noche) de 58 px con radio 14, texto "Continuar a…" y flecha que se desplaza 6 px al pasar el puntero.
- La escena generada por el caso es el fondo a sangre en Escena, Reconstrucción y Presentar; la información va en **hojas** flotantes (radio 22) encima.

## 5. La firma de Croquis: transición entre actos

Cada vez que se entra a un acto (incluido al cambiar desde la barra de actos):

1. Una cortina del color `bg` cubre todo.
2. 80 ms: la C del logo se **traza** (stroke-dashoffset, 620 ms, `cubic-bezier(.65,0,.25,1)`); las marcas de escala aparecen (300 ms).
3. 220 ms: abajo sube el número del acto en mono y su nombre en Instrument Serif 48 px (máscara de abajo hacia arriba, 600 ms).
4. 600 ms: la mira naranja **golpea** (escala 0 → 1.25 → 1) y suelta un anillo que se expande y se desvanece (700 ms).
5. 860 ms: la cortina sube (clip-path, 560 ms, `cubic-bezier(.7,0,.2,1)`) y el contenido del acto empieza sus entradas en ese momento, no antes.

Total: aproximadamente 1.4 s. Se desactiva con `prefers-reduced-motion` y con un ajuste de usuario "Transiciones". Implementa la transición como componente (`<ActTransition act={n} />`) montado por el layout del caso, junto con las transiciones de ruta de Next (o View Transitions API donde exista).

## 6. Movimiento (catálogo; una animación por momento, nada se mueve solo mientras el perito trabaja)

| Nombre | Qué hace | Duración |
|---|---|---|
| `rise` | opacidad 0→1, `translateY(18px)`→0, `blur(8px)`→0 | 600–900 ms, `cubic-bezier(.2,.8,.2,1)`, escalonado 80–150 ms |
| `line` | títulos suben desde una máscara | 900 ms |
| `marker` | los datos que Croquis leyó en el relato se resaltan uno tras otro, como con marcador | 500 ms c/u, escalonado 100 ms |
| `draw` | trayectorias y perfiles de deformación se trazan | 1100–1400 ms |
| `count` | cifras protagonistas cuentan desde 0 (easing `1-(1-p)^4`) | 1400–1500 ms |
| `grow` | rangos y barras crecen desde la mediana o desde abajo | 600–900 ms |
| `pulse` | el impacto suelta un anillo una vez | 1200 ms |
| `drop` | una pieza colocada cae y asienta en el mapa | 700 ms |
| `stamp` | sello "Validado" al firmar, con estallido de anillo | 600 + 900 ms |

Usa Framer Motion. Todo respeta `prefers-reduced-motion` (estado final sin animar).

## 7. La escena: solo lo que genera el caso

Nada de videos ni animaciones decorativas de coches. La escena es una **maqueta** vista desde arriba, generada del caso:
- Geometría de la vía del mapa real (OSM o el proveedor actual): carriles, orillas, camellón, a escala real.
- Vehículos con las dimensiones de su ficha, como piezas de maqueta con sombra.
- **Estela de B**: posiciones reales muestreadas del solver cada 0.4 s, con opacidad creciente hacia el impacto.
- Trayectoria con **degradado por velocidad real** (inicio del degradado → naranja al impacto); leyenda con la velocidad inicial y final.
- Zonas de contacto teñidas en cada vehículo; posiciones finales en línea punteada; cotas reales (ancho de la vía, dispersión de restos).
- Etiquetas con líneas guía hacia cada vehículo y hacia el impacto.
- Cámaras: Cenital · Detrás de B · Conductor B · Órbita 3D (estas tres usan el visor 3D existente).

## 8. Pantallas

**Casos.** Título "Casos" y una línea de estado real ("7 reportes de CESVI de ejemplo · aún no guardas casos propios"). Tres acciones: Narrar un hecho nuevo (negra), Cargar un reporte de CESVI (zona para soltar, también en toda la página), Abrir archivo .croquis. A la derecha, el último caso reproducido como hoja de expediente sobre otra, con su croquis generado y sus dos cifras; al pasar el puntero se levanta. Abajo, la lista de reportes como índice con mini croquis generado por caso, modalidad, vehículos y estado; filtros con conteo real.

**1 · El hecho.** Título = nombre del hecho generado del relato; meta (municipio, tramo, vehículos, impactos). Contador real "N datos leídos" con leyenda de estilos: vehículos (negrita + insignia A/B), daños (subrayado naranja), lugar y vía (resalte suave), medidas (mono con subrayado punteado). Hoja derecha "Lo que Croquis leyó": cada vehículo con su vista superior y el daño pintado, masa en cifra grande con etiqueta "supuesto" (trama ámbar) o "del reporte", y la vía. **Pasar el puntero por una mención del vehículo en el relato ilumina su tarjeta, y al revés.** Sin mapa en este acto.

**2 · La escena.** Maqueta a sangre (o satélite). Hoja "Evidencia · 2 de 3" con barra de progreso y tareas que se marcan solas; la actual en `surf2` con el campo de rumbo. Pieza en colocación: contorno discontinuo, guía naranja de ajuste al carril, aro de rotación girando lento. Herramientas Colocar C / Mover Espacio / Medir M; Maqueta / Satélite; escala gráfica y ubicación.

**3 · Reconstrucción (el pico).** Hoja derecha: "Solver resuelto · N mensajes" + Repetir; "Velocidad al impacto"; la cifra en Instrument Serif itálica ~184 px que cuenta; **histograma de las simulaciones reales** (una barra por km/h; las del rango p10–p90 en tinta, el resto en gris) que crece barra por barra; botones p10 / p50 / p90 que al pasar el puntero explican qué significa cada percentil en una frase; lista con velocidad previa, A y qué fija el resultado; Continuar.

**4 · Análisis.** "Daños" con pestañas A/B. Perfil de deformación dibujado sobre la cara dañada con C1–C6 reales; energía y Δv en cifra grande; nota del reporte. Correspondencia (método de CESVI) con controles de 3 opciones y contador. Supuestos como tarjetas con barra de rango (trama ámbar), marcador del valor y fuente.

**5 · Contra CESVI.** Conteo arriba (coinciden / difieren / sin dato). Hoja con las dos cifras grandes que cuentan a la par, la diferencia en % y km/h, y una regla con los dos marcadores que se deslizan a su lugar. Criterios con ícono lleno (coincide) o punteado (sin dato). Lado a lado: croquis de CESVI en estilo papel y el de Croquis. Citas exactas del reporte en Instrument Serif itálica.

**6 · Dictamen (el final).** Izquierda: hoja de papel real que se actualiza en vivo, con marca de agua "Borrador". Derecha: conclusión del perito (Croquis no la redacta; solo inserta citas con referencia), formato (CESVI / Croquis completo), nombre + "Validar y firmar". Al firmar: cae el sello "Validado" con la huella SHA-256 del archivo, desaparece la marca de agua, la firma aparece en itálica y la barra de actos llega al 100 %.

**Presentar.** Abre en noche. Maqueta grande a sangre con velo hacia la izquierda; capítulos (La escena · El impacto · Posiciones finales · Contra CESVI) con barras tipo historia de 6 s; título del capítulo en Instrument Serif 104 px y sus datos en filas; ← → capítulos, Espacio pausa, Esc sale. Aviso "Reconstrucción de apoyo · el dictamen es del perito" siempre visible.

## 9. Al pasar el puntero (tooltips invertidos, 160–180 ms, aparecen 8 px arriba del objeto)

- Reconstrucción: cada vehículo (modelo, masa con su origen, velocidad al impacto, daño), el impacto (t, contacto, quién lo colocó), cada posición de la estela (t real), cada barra del histograma (rango de la barra y si está dentro de p10–p90), p10/p50/p90.
- Análisis: cada punto C1–C6 (valor y de qué cara sale); las tarjetas de supuestos se levantan 3 px.
- Contra CESVI: cada marcador de la regla (valor y de dónde sale); las filas de criterios se resaltan.
- El hecho: menciones del vehículo y su tarjeta, enlazadas.
- Casos: la fila se resalta, su mini croquis crece 8 % y la flecha avanza; la hoja del último caso se levanta.
- Todo tooltip también aparece con foco de teclado.

## 10. Orden de trabajo

1. §0 con sus tests.
2. Tokens día/noche, tipografía, logo existente como componente.
3. Layout del caso: header, barra de actos y `ActTransition`.
4. Escena generada (§7), compartida por Escena, Reconstrucción y Presentar.
5. Pantallas en orden: Hecho → Escena → Reconstrucción → Análisis → Contraste → Dictamen → Casos → Presentar.
6. Movimiento (§6) y tooltips (§9).
7. `docs/DISENO.md` (decisiones y fuentes) y README con capturas en día y noche.

## 11. Pruebas (al final, en este orden)

1. Unitarias: formatos de cifras y rangos, "sin dato" en vez de 0, veredicto del contraste, pluralización, tema recordado.
2. Accesibilidad: axe sin violaciones serias en los dos temas; los 6 actos completos con teclado; tooltips con foco; reduced-motion sin animaciones.
3. Rendimiento: Lighthouse ≥ 90; la transición no bloquea la carga del acto (el contenido se precarga debajo de la cortina).
4. **Playwright (último):** recorrido del caso AXA A2010930 de Casos al PDF firmado, en día y en noche, con capturas de cada acto a 1440 px; verificación de que 63.90 / 63.15 / 1.2 % coinciden en Casos, Contraste y el PDF.
