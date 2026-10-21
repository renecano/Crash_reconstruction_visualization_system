# ADR 0053 — El lugar sin esperar a Overpass, y cada vehículo con su nombre y su color

- **Estado:** aceptado (2026-10-21).
- **Contexto:** René revisó el recorrido de `/cesvi` (ADR 0052) y pidió tres ajustes:
  - **Paso 3:** marcar el punto de impacto tardaba lo que tardara Overpass. En producción, unos 45 s.
  - **Paso 4:** al mover los vehículos no se sabía cuál era cuál.
  - **Acceso:** quitar el usuario y la clave.

## Decisión

### El lugar (paso 3)

- **Las calles salen de lo que ya está en el navegador:** al marcar el impacto no se espera a la red.
  - **El tramo precargado del caso:** `data/cesvi/casos/A2010930-tramo.json`, con la carretera federal 15 entre Los Mochis y Navojoa (libre y de cuota). Lo genera `data/cesvi/scripts/tramo.mjs` desde Overpass, simplificado con Douglas-Peucker a 2 m; la fuente está en `data/SOURCES.md`.
  - **Los mosaicos vectoriales que el mapa ya cargó:** `querySourceFeatures` sobre la capa `transportation` de OpenMapTiles, para un punto fuera del tramo.
- **Lo que se hace con ellas:** dibujar las calles, tomar el rumbo de la vía más cercana y proponer las dos versiones. Todo es cálculo local (`callesCerca` en `@croquis/cesvi`).
- **Overpass, en segundo plano:** sigue consultándose, pero solo enriquece cuando llega (nombre, carriles y ancho de la vía más cercana, y las calles completas alrededor). No mueve las versiones, porque el perito pudo haberlas editado ya. Si no responde, no se pierde nada.
- **Sin Nominatim:** la cámara encuadra el tramo precargado. La demo ya no depende de Nominatim ni de Overpass. Los mosaicos de OpenFreeMap siguen siendo el único servicio externo; sin ellos el fondo queda vacío, pero el tramo, los vehículos y los cálculos se ven igual.
- **La meta es menos de 1 s del clic a ver las calles:**
  - **La medición:** la página mide del clic al segundo cuadro después de dibujar y lo deja en `data-ms`.
  - **La prueba:** la e2e retiene Overpass y exige menos de 1000 ms.
  - **La evaluación:** `eval/cesvi_lugar.mjs` lo mide en producción, con Overpass sin responder, y guarda el resultado en `eval/results/cesvi_lugar.json`.

### Los vehículos (paso 4 y todo el recorrido)

- **Un nombre y un color fijos por vehículo:** «A · Silverado» y «B · Tacoma», es decir, la letra del dictamen y la primera palabra del tipo (`lib/vehiculos-cesvi.ts`).
  - **Los colores:** `--vehiculo-a` (azul) y `--vehiculo-b` (violeta), que son los de las hipótesis del visor (ADR 0045). No compiten con el amarillo de las acciones ni con el naranja de la evidencia.
  - **Dónde se usan:** en el mapa, las siluetas de los daños, los números, los criterios y el PDF. El PDF los pone en un cuadro junto a cada nombre.
  - **Una sola fuente de verdad:** una prueba revisa que el CSS y el PDF usen los mismos valores.
- **Etiquetas en dos columnas:** en una versión varios puntos coinciden. En la declarada, el impacto y la posición final de cada vehículo son el mismo punto, y los restos miden 0 m. Por eso las etiquetas no van encima de su punto.
  - **Cómo se acomodan:** A y R1–R2 a la izquierda; B y ✕ a la derecha. No se enciman, una línea del color correspondiente une cada etiqueta con su punto, y se recolocan al mover el mapa (`etiquetas-mapa.ts`, con pruebas).
  - **Qué etiquetas hay:**
    - el nombre de cada vehículo, también mientras se anima;
    - al editar, una por marca: «A · inicial», «A · impacto», «A · final», «✕ impacto», «R1 restos» y «R2 restos».
- **Puntos que se arrastran, justo en su lugar:** pequeños, con el color de su vehículo (o naranja), y con área táctil de 44 px.
  - **Elegir:** con un clic en el punto o en su etiqueta.
  - **Lo elegido:** se resalta en amarillo (etiqueta, punto y contorno del vehículo) y queda encima. Arriba se lee qué es y de qué versión: «B · Tacoma · posición inicial · versión declarada».
- **Leyenda pequeña abajo a la derecha:** los colores de los vehículos, los trazos de cada fase, el ✕ y la zona de restos.

### Acceso

- **`/cesvi` y `/api/cesvi/consideraciones` son públicas:** se quitaron `proxy.ts` y sus variables en Vercel. ADR 0049 queda reemplazado.
- **Lo que sigue protegiendo:** el borrador con Claude conserva el tope de gasto diario y el límite de peticiones por hora. El caso sigue sin placas, VIN ni nombres.

## Consecuencias

- **La demo funciona aunque Overpass esté caído o lento.** Para otro caso hará falta precargar su tramo con el mismo script. Mientras no exista, se usan los mosaicos.
- **El croquis del PDF es la imagen del mapa, sin las etiquetas** (son HTML). Por eso el pie de la imagen dice qué color es cada vehículo.
- **`docs/cesvi/PROTOTIPO.md` todavía pide protección de acceso;** ese documento es de René y no se editó. La diferencia está anotada en `docs/PROGRESS.md`.
