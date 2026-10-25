# ADR 0092 — Portada v3: el expediente filmado con la propia reconstrucción

- **Estado:** aceptado (2026-10-25).
- **Contexto:**
  - René eligió una versión nueva de la portada para la URL principal. La referencia es `docs/cesvi/rediseno/Portada-v3.html`, copia de `docs/cesvi/entrante/portada-v3-referencia.html`.
  - Su fondo usaba clips de stock con un auto de marca visible. `CLAUDE.md` prohíbe el stock y las marcas.

## Decisión

1. **Estructura y comportamiento de la referencia, en Next.js:**
   - **Código:** `components/portada-v3/`:
     - `portada-v3.tsx`, el marcado;
     - `comportamiento.ts`, los scripts de la referencia en una sola función con limpieza;
     - `textos.ts`, en español y en inglés;
     - `fuentes.ts`;
     - `portada-v3.css`.
   - **Qué conserva:**
     - las siete hojas del expediente;
     - la intro y la transición con el símbolo;
     - las entradas al hacer scroll, las lecturas que se decodifican y las cifras que cuentan;
     - la mira y los botones magnéticos;
     - las siete letras;
     - los huevos de pascua: la consola, «croquis» o triple clic al logo, el doble clic en la cifra y el botón que choca.
   - **La hoja de estilos** es la de la referencia con alcance `.pv3`. La generó un script de una sola vez:
     - la raíz y el cuerpo pasan a `.pv3`;
     - las animaciones llevan el prefijo `pv3-`;
     - las fuentes son variables de `next/font`.
   - **Para no pelear con React:**
     - los titulares se parten en palabras al renderizar, no tocando el DOM;
     - la intro se oculta en lugar de quitarse;
     - el «boom» del botón se agrega dentro de `.pv3`.
2. **El fondo es la propia reconstrucción** (`demo/portada/grabar-tomas.mjs`):
   - **Escenas:** cuatro tomas de 7.2 s de escenas que ya estaban bien: nocturno_lluvia, la carambola de R6, poste y AXA (con «cuadra con el daño medido», la escena del video de R11).
   - **Cómo se ven:** de noche, en calidad alta, con los vehículos de R10 y la cámara del daño.
     - La carambola y AXA son de día en sus escenas: para la toma solo cambia la iluminación; la física es la misma.
     - La cámara cinemática deja los vehículos diminutos de noche.
   - **Cómo se graban:**
     - salen del exportador de video del visor (`captureSequence`, instantes exactos), así que son fluidas aunque la laptop no llegue a tiempo real;
     - ffmpeg las recorta y las pasa a H.264: escritorio a 1280 de ancho y celular a 640, cada una de menos de 3 MB, con un póster JPG.
   - **Créditos del pie:** «Todo lo que ves es una reconstrucción calculada por Croquis».
   - **Más adelante:** cuando lleguen los renders de Blender de la computadora de la demo, sustituyen a estas tomas.
3. **Cifras:**
   - salen al compilar de `eval/results` y de los datos de AXA (`lib/portada-cesvi.ts`); si falta una, el build falla;
   - el «63.15 → 63.51» de «piezas sueltas» es una ilustración de un dígito transpuesto, no un resultado. En el código lo marcan `capturaMalCopiada` y `data-ilustracion`.
4. **Textos ajustados al mínimo** para que sean ciertos del producto de hoy:
   - «Croquis lo ubica en el lugar real» pasa a «Lo ubicas en el lugar real»: el lugar lo marca el perito;
   - la narración de ejemplo es la de AXA tal como está, «carretera México-Nogales», no «carretera federal». Se marcan la modalidad, la vía y la ubicación, sin «Sentido»: la lectura no extrae el sentido de circulación;
   - «Croquis no lo rellena por su cuenta» pasa a «lo que decidas no dar entra como supuesto y queda marcado así».
5. **Botones:** los tres «Entrar a Croquis» (barra, portada y cierre) llevan a /cesvi, y «Cómo funciona» baja a su sección. No hay enlace a los 205 reportes.
6. **Tipografías:**
   - **Fuentes:** Anybody, Schibsted Grotesk, Martian Mono y Caveat, todas de Google Fonts bajo SIL Open Font License 1.1 (`assets/ASSETS.md`);
   - **Carga:** `next/font` las sirve desde el sitio, con el eje de ancho donde la portada lo anima. Caveat no se precarga;
   - **Regla:** la de `CLAUDE.md` se aclaró (René): se permiten las fuentes de licencia libre y lo prohibido es copiar fuentes propietarias de marca.
7. **Se conservan:**
   - la versión en inglés (`/en`);
   - `/publico`, enlazada desde el pie;
   - movimiento reducido: sin video, solo el póster;
   - en celular, el video de menor resolución, con la primera toma cargando antes que las demás.

## Consecuencias

- Se quita la portada anterior de CESVI (`components/portada-cesvi`) y su dibujo de la reconstrucción de AXA desde arriba.
- **Pruebas:**
  - las cifras, la ilustración marcada, la narración y las tomas: `components/portada-v3/textos.test.ts` y `lib/portada-cesvi.test.ts`;
  - una e2e `@flujo` en Chromium (`e2e/home.spec.ts`): carga sin errores de consola, los tres botones llevan a /cesvi, en inglés, el pie a /publico y el póster con movimiento reducido.
