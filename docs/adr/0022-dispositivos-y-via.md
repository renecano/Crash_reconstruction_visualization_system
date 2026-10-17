# ADR 0022 — Semáforos con fase, señales, rayas, guarniciones y árboles instanciados (F8c)

- **Estado:** aceptado (2026-10-16)
- **Contexto:** desde F3 el visor dibujaba los dispositivos de forma básica:
  - **Semáforo:** un poste con una caja oscura, sin lámparas ni fase.
  - **Señales:** todas la misma placa gris (roja para el alto).
  - **Rayas:** las discontinuas medían 3 m cada 6 m, sin fuente, y los dispositivos de línea se ignoraban.
  - **Guarniciones y camellón:** no había guarniciones (la banqueta flotaba a 15 cm), y el camellón solo separaba las rayas.
  - **Árboles:** cada uno era dos mallas con geometría propia. Con escenas de OSM (F8d) eso no escala.

## Decisiones

1. **Semáforos con fase en el tiempo** (`traffic-signals.ts`, `traffic-devices.ts`):
   - **Cabezas:** una por fase, con tres lentes de 30 cm. Cada cabeza mira al vehículo cuyo flujo regula (`movimiento` o `aplica_a`); sin vehículo, las cabezas se reparten en cruz.
   - **Sin `tiempo_en_fase`:** no se inventan cambios y el color declarado se mantiene toda la escena.
   - **Con `tiempo_en_fase`:** se reconstruye verde → ámbar → rojo alrededor del impacto.
   - **Duración del ámbar:** 3 s, el valor con que el Manual de Señalización y Dispositivos para el Control del Tránsito (SEDATU/SCT, 2023, p. 783) ejemplifica el despeje. El manual no fija un valor único: es un supuesto con fuente.
   - **Intermitente:** destella 55 veces por minuto (el manual pide de 50 a 60, p. 720).
   - **Lámparas:** se cambian propiedades del material, no materiales, para no compilar sombreadores a media reproducción.
   - **Física:** el solver no usa los semáforos; esto es solo visual.
2. **Una placa por señal**, con las formas y tamaños del mismo manual (Tablas III.3-1 y VII.2-1):
   - **Alto:** octágono de 30 cm por lado.
   - **Ceda el paso:** triángulo rojo con el vértice abajo, de 85 cm.
   - **Restrictivas** (límite de velocidad, no vuelta): tablero de 71 × 71 cm con círculo de 62 cm; el límite lleva su número.
   - **Supuestos de forma:** "un sentido" es una flecha blanca sobre negro y "otro", una placa gris.
   - **Textos:** van en una textura de lienzo solo en el navegador.
3. **Rayas discontinuas del manual** (Tabla II.2-3): 2.5 m cada 5 m en calles de hasta 50 km/h, y 5 m cada 10 m en carreteras o calles de más de 50 km/h.
   - Los dispositivos `linea_continua` y `linea_discontinua` deciden si se rebasa o se cambia de carril. En doble sentido hablan de la raya central: discontinua es sencilla y amarilla. En un sentido hablan de las rayas entre carriles.
   - No se dibujan como un segmento suelto en su posición: en una curva (`frontal_curva`) un tramo recto se vería mal.
4. **Guarniciones de 15 cm** donde hay banqueta o `guarniciones`:
   - **Forma:** caras verticales de concreto entre la calzada y la banqueta, cortadas donde otra vía cruza.
   - **Camellón:** elevado a la misma altura, del ancho del separador, con sus guarniciones.
5. **Árboles instanciados:** los que no participan en un evento van en dos mallas instanciadas (troncos y copas, una llamada de dibujo cada una), con la forma determinista de siempre. El árbol del choque conserva su malla. El conteo de triángulos multiplica por las instancias.

## Consecuencias

- **Capturas:** cambian casi todas (rayas, guarniciones, camellón, semáforos y señales); se regeneran en CI y se revisan.
- **Fuente:** el manual queda registrado en `data/SOURCES.md` con su SHA-256 y las páginas usadas.
- **Pendientes:**
  - el semáforo peatonal;
  - las flechas en el pavimento;
  - el destello en rojo (hoy el intermitente es ámbar);
  - que el solver use la fase del semáforo, por ejemplo para preguntar si un vehículo cruzó en rojo, sin juzgar culpas (§10).
