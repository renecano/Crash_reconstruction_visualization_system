# ADR 0020 — Clima y superficie en el visor (F8a)

- **Estado:** aceptado (2026-10-16)
- **Contexto:** el visor ya tenía el sol según fecha, hora y lugar, una niebla exponencial por clima y un asfalto más oscuro y liso con lluvia. Faltaba:
  - **Lluvia y granizo:** solo cambiaban el color de la luz, no se veía caer nada.
  - **Piso mojado:** salía del clima e ignoraba `lugar.estado_superficie`. `poste` (nublado, piso mojado) se dibujaba seco.
  - **Visibilidad:** la niebla no respetaba la que declara la escena.
  - **Capturas de clima:** no había ninguna, y PLAN §13 las pide para cerrar F8.

## Decisiones

1. **El piso sigue al estado declarado** (`road-surface.ts`). Cada estado tiene un aspecto: seco, mojado, encharcado, aceite, lodo y grava suelta.
   - Encharcado agrega charcos casi espejo; aceite, lodo y grava son manchas de ruido en coordenadas del mundo, sin texturas descargadas y siempre iguales para la misma escena.
   - Sin estado declarado, la lluvia fuerte encharca y la ligera o el granizo mojan, y se reporta como supuesto.
   - Lo declarado manda: lluvia con el piso declarado seco se dibuja seco.
   - Son valores visuales: la fricción de cada estado la sigue poniendo el solver con su tabla.
2. **Reflejos:** el piso mojado recibe como mapa de entorno el cielo que ya se hornea en un mapa cúbico (ADR 0006), así que refleja el cielo sin costo extra por cuadro. De noche no hay cielo que reflejar; los reflejos de luminarias y faros llegan con las luces reales (F8b).
3. **Niebla por visibilidad.** Con `entorno.visibilidad` declarada, la niebla deja pasar el 5 % del contraste a esa distancia.
   - Es la definición del alcance óptico meteorológico de la OMM (WMO-No. 8, cap. 9). Como `FogExp2` atenúa como exp(−(d·z)²), d = √(ln 20) / V.
   - Sin visibilidad declarada se quedan las densidades ilustrativas por clima.
   - El solver ya usaba la visibilidad para la detección (ADR 0008).
4. **Lluvia y granizo como partículas** (`precipitation.ts`, `precipitation-scene.ts`):
   - **Malla:** una malla instanciada de estelas (dos planos cruzados) en una caja centrada en la acción, de 20 a 45 m de medio lado y 24 m de alto.
   - **Movimiento:** lo calcula el sombreador (TSL, igual en WebGPU y WebGL 2) desde la semilla de cada partícula y el tiempo de la línea de tiempo. Es determinista: en pausa la lluvia se detiene, y una captura en t = 0 siempre sale igual.
   - **Velocidades** (visuales):
     - lluvia ligera, 4.0 m/s, y fuerte, 7.0 m/s, por las velocidades terminales medidas por Gunn y Kinzer (1949) para gotas de ~1 y ~2–3 mm;
     - granizo de 1–2 cm, 9 m/s (supuesto de orden de magnitud);
     - sin viento (supuesto).
   - **Cantidad por nivel de calidad:** lluvia fuerte con 1,500, 6,000 o 15,000 partículas (baja, media y alta); la ligera usa 40 % y el granizo 35 %.
   - **Granizo:** se ve como estela corta, más ancha y opaca que la gota. Con un grano esférico de 1 cm medía menos de un píxel a la distancia de la cámara libre (verificado en captura).
5. **Ambiente forzado solo en la vista.** La URL del visor acepta `clima`, `iluminacion`, `piso` y `visibilidad` (m), validados contra los enums del contrato; lo desconocido se ignora.
   - Solo cambia el dibujo: la escena y la reconstrucción no cambian.
   - La vista lo avisa en un recuadro ("Ambiente cambiado solo en la vista… La reconstrucción no cambia").
   - Sirve para las capturas de clima y para ver una escena con otro tiempo sin sugerir que la física se recalculó.
6. **Capturas de clima** (Playwright, Linux): niebla a 60 m, granizo, lluvia fuerte de día con charcos y noche sin alumbrado. Una prueba funcional comprueba en todas las plataformas que la vista avisa y carga sin errores.

## Consecuencias

- **Capturas que cambian:** las de `alcance` (lluvia ligera: gotas y piso mojado con reflejos), `nocturno_lluvia` (gotas) y `poste` (ahora mojado), en impacto y en daño.
- **E6:** la lluvia agrega miles de estelas transparentes en las escenas con lluvia. Se vuelve a medir antes de cambiar el README; los números se registran en PROGRESS.
- **Pendientes de F8:**
  - luces reales de alumbrado y faros (F8b), que darán reflejos de noche y harán visible la lluvia nocturna (hoy es tenue a propósito);
  - viento;
  - salpicaduras y granizo acumulado en el piso.
