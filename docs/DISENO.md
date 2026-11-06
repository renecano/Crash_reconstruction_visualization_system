# Diseño de Croquis para CESVI: «Laboratorio»

Decisiones y fuentes del rediseño «Laboratorio» de `/cesvi` (prompt y pantallas en `docs/cesvi/rediseno/laboratorio/`, pedido de René del 2026-11-04). La referencia visual son las pantallas `Lab-*.dc.html`. Las decisiones técnicas están en el ADR 0108.

## Paso viejo → acto nuevo

El recorrido conserva sus ocho pasos por dentro (su lógica, lo obligatorio y las pruebas). Los actos los agrupan en la barra (`apps/web/src/lib/actos.ts`). Ningún paso se queda sin acto.

| Paso viejo                             | Acto nuevo         | Cómo se ve dentro del acto                            |
| -------------------------------------- | ------------------ | ----------------------------------------------------- |
| 1 · El caso                            | 1 · El hecho       | Primera parte: los vehículos y lo que falta           |
| 2 · El hecho                           | 1 · El hecho       | Segunda parte: la narración y lo que Croquis leyó     |
| 3 · El lugar                           | 2 · La escena      | La colocación en tres pasos (B)                       |
| 4 · La reconstrucción                  | 3 · Reconstrucción | Velocidades con su rango y el 3D                      |
| 5 · Los daños                          | 4 · Análisis       | Primera parte: los daños medidos y los calculados     |
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
- **Colocación rehecha (B):** ver `docs/PROGRESS.md`.
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

## Lo que sigue

1. Llevar la maqueta a La escena y a Presentar, con las cotas (ancho de la vía, dispersión de restos).
2. Las pantallas en orden (prompt §8), luego el movimiento (§6) y los tooltips (§9).
3. Pruebas pesadas al final: axe, Lighthouse y Playwright del caso AXA de día y de noche, con capturas de cada acto.
