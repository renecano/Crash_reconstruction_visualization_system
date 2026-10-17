# ADR 0023 — Vía real desde OpenStreetMap (F8d)

- **Estado:** aceptado (2026-10-16)
- **Contexto:** PLAN §7.1 pide la vía "desde plantillas paramétricas o desde OpenStreetMap con `ubicacion_real`". El criterio de F8 pide una escena en una intersección real de Toluca generada desde OSM, con atribución. El contrato ya tenía `lugar.ubicacion_real` (lat, lon, radio, rotación), pero nada lo usaba salvo el cálculo del sol.

El riesgo de fondo: el solver arma las trayectorias sobre la vía paramétrica (`road.py`: recta, curva, X, T, glorieta, en un marco local con el cruce en el origen). Si la vista dibujara las calles de OSM y la física siguiera una plantilla distinta, los vehículos irían fuera de la calle que se ve.

## Decisiones

1. **Contrato 1.2.0:**
   - **Fuente nueva `mapa`:** el dato salió de OpenStreetMap en `ubicacion_real`; no lo dijo el relato ni es un supuesto.
   - **Campo opcional nuevo `lugar.red_vial`:** las calles de OSM ya proyectadas a metros en el marco local de la escena.
     - **Por calle:** id OSM, tipo (`highway`), nombre, carriles, ancho, si es de un sentido, y puntos.
     - **De la consulta:** fecha, atribución y licencia (ODbL 1.0).
   - **Migración:** 1.1.0 → 1.2.0 es identidad.
2. **La red se guarda en la escena.** No se consulta cada vez que se dibuja: así la escena es determinista, funciona sin red (F9) y no depende de la disponibilidad del servidor público de Overpass. En la primera consulta de este ADR respondió "at capacity" (502) y hubo que reintentar.
3. **La física sigue en la plantilla paramétrica, alineada con el mapa:**
   - **Plantilla:** tipo de cruce por el grado del nodo (3 calles: T; 4: X), rotación para que la calle principal quede sobre +X, y carriles y ancho de las etiquetas de OSM (`lanes`, `width`).
   - **Fuente de esos campos:** `mapa`. Si OSM no trae el dato, el valor por defecto de siempre.
   - **Revisión de consistencia** (Python y port TS): avisa si el eje de la plantilla se aleja más de una tolerancia de la calle de OSM dentro de la zona de la acción. Así se ve cuándo la plantilla no representa el cruce real.
4. **Dibujo:** el visor 3D y el croquis 2D dibujan la red de OSM cuando existe; la plantilla queda solo para la física.
   - **Atribución en pantalla:** junto al dibujo y legible, con el texto que recomienda la comunidad: "Contiene información de OpenStreetMap, disponible en openstreetmap.org bajo la Open Database License (ODbL)".
5. **Obtención:**
   - **Script de datos:** `croquis-data osm` consulta Overpass con User-Agent propio, reintentos con espera creciente y caché, y guarda la respuesta cruda con su SHA-256 (`data/SOURCES.md`).
   - **Conversión:** TS, porque la usa producción, con pruebas sobre la respuesta guardada.
   - **En producción:** una escena del usuario con coordenadas se consulta una vez, se guarda en la escena y se cachea. El uso cabe en la política del servidor público: muy por debajo de 10,000 consultas al día, sin uso comercial.
6. **Escena nueva:** `interseccion_toluca`, en Av. General Venustiano Carranza y Calle Benito Juárez García (nodo OSM 305269145; datos OSM del 2026-10-16). Se elige entre las intersecciones de vías principales a 700 m del centro de Toluca y se le escribe un relato y su reconstrucción, como a las otras diez.

## Consecuencias

- **Pruebas y evaluaciones:** las que recorren las escenas canónicas pasan de 10 a 11, incluidas E7, las capturas y E6.
- **Límite declarado:** la física no reproduce la geometría exacta del cruce real (radios de esquina, carriles de vuelta). Usa la plantilla alineada y la revisión avisa cuando no alcanza.
