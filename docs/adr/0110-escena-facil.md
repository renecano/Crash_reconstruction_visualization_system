# ADR 0110 — La escena, rehecha desde cero: una pregunta a la vez

- **Fecha:** 2026-11-05
- **Estado:** aceptada; reemplaza la colocación B del rediseño «Laboratorio».
- **Contexto:**
  - René probó la colocación B con personas reales (prueba T4). A nadie le gustó: no la entendían, les parecía complicada y las piezas azules y naranjas no se leían como coches.
  - La meta nueva: que la entienda un niño.
  - La referencia visual está en `docs/cesvi/rediseno/escena-facil/EscenaFacil1–4.dc.html` y manda, con los tokens del Laboratorio.

## Decisiones

1. **Una pregunta a la vez, en palabras de todos los días:** «¿Dónde fue el choque?», «¿Por dónde venía el Jetta?» y «¿Dónde quedó después del choque?».
   - Fuera de pantalla: «V1», «pieza punteada», «anillo», «Mantén Espacio» y los modos Colocar, Mover mapa y Medir.
   - Los pasos son un choque por impacto (en una carambola, uno por cada uno) y luego, por vehículo, por dónde venía y dónde quedó.
2. **Croquis propone primero, desde la narración, y la persona confirma con un toque.** La lógica sin interfaz está en `apps/web/src/lib/escena-facil.ts`, con pruebas.
   - **El cruce:** Croquis lee las calles que nombra la narración y busca su cruce en las calles de OpenStreetMap.
     - Si las dos están, lo propone: «Sí, fue en ese cruce».
     - Si solo está una, lo dice tal cual y propone el cruce más cercano de esa calle. No presenta otro cruce como el narrado.
     - Si el caso no trae coordenadas, Croquis busca en `/api/lugar` la descripción del lugar, luego el cruce y luego la primera calle, con el municipio.
   - **La flecha:** sale del sentido narrado («circulaba de sur a norte»), con su frase. Si la narración no lo dice, sale de las zonas de contacto.
   - **El color:** sale de la narración («Jetta, modelo 2002, color azul»). Si no lo dice, de una paleta fija: azul, morado, verde y gris. El naranja es solo del choque.
3. **Tocar en vez de arrastrar:**
   - **El choque:** un toque, que se ajusta a la calle más cercana (a menos de 30 m).
   - **Por dónde venía:** una flecha grande por cada calle que llega al cruce, sacadas de OSM. Sin calles, cuatro por puntos cardinales, y lo dice.
   - **Dónde quedó:** tres opciones, «Lo marco en el mapa», «Quedó junto al choque» (1.5 m adelante de su pose de impacto) y «No sé dónde quedó». Al marcarlo, el coche va alineado a la calle; arrastrarlo es opcional, y dos botones redondos de 48 px lo giran 15°.
4. **Coches que parecen coches:** la silueta de su clase vista desde arriba, a escala, de su color, con su nombre y una flecha en el frente.
5. **Un mapa claro propio** (`estilo-mapa-escena.ts`): calles blancas a su ancho real con su orilla y su nombre, manzanas, edificios y parques, sobre las mismas teselas de OpenFreeMap, con versión de día y de noche.
   - Se mueve arrastrando y se acerca con la rueda o pellizcando, sin modos.
   - El norte siempre queda arriba, para que «del sur» sea cierto.
6. **Mensajes:**
   - **Éxito (verde):** después de cada paso, con «Deshacer». Se va solo a los 6 s.
   - **Alerta (ámbar), con acción:** coches encimados («Separarlos» o «Así está bien»), un coche fuera de la calle («Ponerlo en la calle»), el choque lejos de cualquier calle y una dirección contraria a la narración.
   - **Error (rojo):** solo si no llegan las calles, y dice qué hacer.
7. **El avance siempre visible abajo.** «Ver la reconstrucción →» se activa al completar todo. Al terminar aparece la tarjeta «¡La escena está lista!», con el resumen y los supuestos con su etiqueta y su explicación.
8. **Lo avanzado va en «Más herramientas», plegado:** medir (restos y huellas), dónde empezó cada coche y el giro exacto.
9. **El expediente no cambia.** Se guardan las mismas posiciones, rumbos y banderas de supuesto; el solver no cambia.
   - «No sé por dónde venía» deja la pose que propone Croquis como supuesto.
   - El caso guardado recuerda esos vehículos (`direcciones_supuestas`), como ya recordaba `finales_desconocidos`.
   - En una carambola, la dirección del primero de un choque reorienta a los demás de ese choque.
10. **El mapa de antes (`MapaEscena`) queda para la reconstrucción y el croquis del dictamen.** Se encuadra solo en lo colocado cuando se vuelve visible.
11. **Presentar muestra el resumen de la escena** en lugar de la lista de la colocación B.

## Lo que se quitó

- La lista guiada y el panel `PasoLugar` de la colocación B.
- La guía «Colocar», el GIF de B y su prueba.

## Límites

- **Satélite:** no hay fuente libre a nivel de calle sin cuenta. Esri, Mapbox y Google piden llave. Queda en «Bloqueado».
- **Overpass:** OpenStreetMap a veces tarda decenas de segundos en responder. Mientras, la hoja dice «Buscando…» y la persona puede tocar el mapa.
- **Lectura de la narración:** el sentido y el color salen de reglas sobre el texto; si la narración los dice de otra manera, no hay propuesta y se pregunta igual.
- **Medición con personas:** la meta de un minuto aún no se mide con personas. René la repetirá con `docs/cesvi/prueba-personas.md`.
