# Diseño de Croquis para CESVI: «Laboratorio»

Decisiones y fuentes del rediseño «Laboratorio» de `/cesvi` (prompt y pantallas en `docs/cesvi/rediseno/laboratorio/`, pedido de René del 2026-11-04). La referencia visual son las pantallas `Lab-*.dc.html`. Las decisiones técnicas están en el ADR 0108.

## Paso viejo → acto nuevo

El recorrido conserva sus ocho pasos por dentro (su lógica, lo obligatorio y las pruebas). Los actos los agrupan en la barra (`apps/web/src/lib/actos.ts`). Ningún paso se queda sin acto.

| Paso viejo                             | Acto nuevo         | Cómo se ve dentro del acto                            |
| -------------------------------------- | ------------------ | ----------------------------------------------------- |
| 1 · El caso                            | 1 · El hecho       | Primera parte: los vehículos y lo que falta           |
| 2 · El hecho                           | 1 · El hecho       | Segunda parte: la narración y lo que Croquis leyó     |
| 3 · El lugar                           | 2 · La escena      | Una pregunta a la vez (escena fácil, ADR 0110)        |
| 4 · La reconstrucción                  | 3 · Reconstrucción | La escena a sangre y la cifra en la hoja              |
| 5 · Los daños                          | 4 · Análisis       | Primera parte: perfil, correspondencia y supuestos    |
| 6 · Los números                        | 4 · Análisis       | Segunda parte: la verificación con el método de CESVI |
| 7 · Croquis contra el reporte de CESVI | 5 · Contra CESVI   | Solo si el caso trae reporte                          |
| 8 · El dictamen                        | 6 · Dictamen       | El dictamen y la validación del perito                |

Dentro de un acto con dos partes, el rótulo dice cuál («Acto 1 de 6 · El hecho · 1 de 2: El caso»). La acción principal lleva a la siguiente («Continuar al hecho»).

## Lo que ya está (2026-11-05)

- **Tokens de día y noche** (prompt §3): en `assets/brand/tokens.json` (`lab-dia-*`, `lab-noche-*`, `lab-impacto`), con los mismos roles de siempre bajo `data-diseno="laboratorio"` (`styles/sistema.css`).
  - La primera vez, al trabajar el tema sigue al sistema; al presentar abre en noche. Se recuerda por modo.
  - Los colores cambian en 400 ms.
- **Tipografía** (prompt §2): Instrument Serif en títulos y cifras protagonistas (`.cifra-protagonista`), Instrument Sans en la interfaz y Geist Mono en datos. Registradas en `assets/ASSETS.md`.
- **Barra del caso** (prompt §4): 72 px, marca y caso en mono, los actos en una rejilla con la línea de 2 px que se llena hasta el acto actual y el punto naranja, Presentar / Trabajar, tema, «Transiciones» y Exportar.
- **Acción principal:** «Continuar a…», 58 px, radio 14; la flecha avanza 6 px al pasar el puntero.
- **Transición entre actos** (prompt §5, `TransicionActo`):
  - Completa, de unos 1.4 s, al entrar al caso y al presentar; corta, de menos de 500 ms, entre actos al trabajar.
  - Se apaga con `prefers-reduced-motion` o con «Transiciones».
- **Rutas por acto** (prompt §4): `/cesvi/casos/<caso>/<acto>`, con `[[...acto]]` en cada página de caso (AXA, nuevo, importar, reporte y guardado).
  - Una ruta con acto abre ahí si ya se puede; si no, en el acto donde va el caso.
  - Al cambiar de acto, la ruta cambia con `history.replaceState`, sin recargar: el estado del recorrido vive en la página.
  - Las rutas sin acto siguen abriendo, en El hecho.

- **La maqueta del caso** (prompt §7; `components/cesvi/escena/maqueta.tsx`, geometría en `lib/maqueta.ts`): la vista «Maqueta» junto a «Mapa» y «3D» en Reconstrucción.
  - **La vía:** las calles del mapa a su ancho. Sin calles del mapa no se dibuja una vía inventada, y lo dice.
  - **Los vehículos:** piezas con la silueta de su clase en el impacto, con sombra y la zona de contacto teñida.
  - **La estela:** sus poses reales cada 0.4 s antes del impacto.
  - **La trayectoria:** más naranja cuanto más rápido.
  - **El reposo** punteado, y etiquetas con líneas guía, cada velocidad con su método.

## Las pantallas (prompt §8)

Los números de todas salen del solver o de la comparación con el reporte. El detalle de cada una está en `docs/PROGRESS.md`. Aquí van las decisiones que no se ven en el diseño.

- **La escena** es la escena fácil, no el diseño de `Lab-Escena` (René, 2026-11-05; ADR 0110).
- **Reconstrucción:**
  - El histograma es de simulaciones reales: el solver entrega `valores_kmh`.
  - «Detrás de B» es una cámara propia (`chaseCamera`), porque la cinematográfica orbita en un ángulo fijo.
  - Lo demás del acto va plegado en «Ver el detalle»; las hipótesis y el aviso de caso cambiado siguen a la vista.
- **El rango que no aparenta certeza:** si las simulaciones no se apartan de la solución, su p10–p90 tiene ancho cero. No se dibuja como si fuera certeza: se dice, y se da el rango de la velocidad previa, nombrado «aproximación lineal». Vale en la hoja, el dictamen, las citas y Presentar.
- **Análisis:** solo se dibuja el perfil medido. El del modelo es uniforme y parecería una forma observada, así que va como texto con su método.
- **Contra CESVI:**
  - Dos lecturas con el mismo peso, cada una con su nombre (T3.4): «Método de CESVI con los datos del reporte» y «Reconstrucción física de Croquis», más una línea de por qué difieren. También en Presentar. Nada se ajusta para coincidir.
  - La diferencia lleva signo y dos decimales en todas las pantallas («+1.19 %»).
  - El reporte no trae su croquis como datos, así que a la izquierda de «Lado a lado» va un esquema con lo que sí dice, rotulado «no es su imagen».
- **Dictamen:**
  - La hoja es una vista previa: el archivo lleva todas las secciones.
  - El sello muestra la huella SHA-256 de las entradas del caso (sus primeros 12 hexadecimales).
  - El formato por defecto es la estructura de CESVI.
  - Croquis no redacta la conclusión: las citas solo entran si el perito las pide.
- **Casos:** dice «Caso reproducido», no «Último reproducido», porque Croquis no registra cuál fue el último. El mini croquis es un esquema del tipo de choque: los reportes no traen posiciones.
- **Presentar:** a pantalla completa solo con una reconstrucción vigente; sin ella se consulta el recorrido sin los controles de edición. Con movimiento reducido no avanza sola.

**Lo que el diseño pide y no se hizo:** dictar por voz («Escríbelo o díctalo», «Dictar un dato») y «Reporte original». Croquis no tiene entrada por voz y el PDF importado no se guarda en el caso. Están en «Endurecimiento pendiente».

## Movimiento y tooltips (prompt §6 y §9)

- **Con Motion** (`components/cesvi/movimiento.tsx`): `rise`, `line`, `count`, `grow`, `draw`, `pulse`. Se cargan con `LazyMotion`.
- **Con CSS:** `marker`, `stamp` y la transición entre actos (ADR 0108); `drop` ya estaba en la escena fácil.
- **La regla:** cada animación corre una vez al aparecer. Nada se mueve solo mientras el perito trabaja. Presentar es la excepción, porque es una historia, y se pausa con Espacio.
- **Con `prefers-reduced-motion`** todo sale en su estado final.
- **Las cifras** terminan exactamente en el valor del cálculo.
- **Tooltips:** una sola capa (`capa-tooltips.tsx`) lee `data-tip` en cualquier elemento, de HTML o de SVG, con puntero y con foco.
- **Las fuentes** del diseño están en `assets/ASSETS.md`.
