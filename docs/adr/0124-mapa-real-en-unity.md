# ADR 0124 · El modo «mapa real» del 3D: el mapa como piso y la foto satelital encima

- **Fecha:** 2026-11-18
- **Estado:** aceptada. La web ya está lista. Unity necesita el build 1.3.0, que compila el colaborador.
- **Pedido:** René, ronda 4, punto 9.
  - El mapa como piso, de un proveedor cuyas condiciones permitan este uso y la caché sin red, y no de los servidores de teselas de openstreetmap.org.
  - La foto satelital de Esri encima cuando hay internet, como modo aparte: el entorno actual se queda.
  - Fotos del dictamen: con el mapa, y con Esri con su atribución. Video: con el mapa; con Esri solo si su licencia lo permite.
  - Demo local sin internet: con el mapa; la foto se apaga sola y lo dice.
  - Que el perito pueda ajustar la posición de la foto.
  - En el visor de escritorio, el mapa sin la foto.
- **Investigación y pruebas visuales:** `docs/cesvi/ronda-4/mapa-real-unity.md`.

## Decisión

- **La web dibuja el piso; Unity solo lo pone.**
  - MapLibre dibuja fuera de pantalla una imagen cuadrada de 2 048 px, con el norte arriba. Cubre lo que se mueve en la escena, con margen, entre 200 y 800 m (`lib/visor-unity/piso.ts`).
  - La foto de Esri se dibuja aparte y se compone encima con el ajuste del perito. Así, mover la foto solo recompone la imagen y no vuelve a pedir teselas.
  - La imagen se codifica con `toBlob`, fuera del hilo principal.
- **El mapa** es el estilo de La escena, con OpenFreeMap: uso comercial y descargas sin red permitidos, con atribución. Va en el paquete `caso-3d` (`piso`), en el video (con su crédito en cada cuadro) y en el visor de escritorio.
- **La foto** es Esri World Imagery (ArcGIS Location Platform, llave `NEXT_PUBLIC_ESRI_API_KEY`, con referrers).
  - Solo en vivo, por el mensaje `piso` del puente 1.3.0. Nunca se guarda en el paquete ni va en el video: la licencia de Esri nombra PDF e imágenes, no video.
  - Se apaga sola, y lo dice, sin red, sin llave o si sus teselas no cargan. Así pasa en la demo local fuera de `localhost:3000` y en el escritorio, que no manda referrer.
  - El dictamen lleva «Powered by Esri» y el crédito del servicio junto a los cuadros del 3D.
  - **El ajuste:** flechas de 0.5 m, hasta ±15 m, porque Esri declara de 5 a 8.5 m de error. El modo se declara ilustrativo.
- **Unity** (`PisoMapa` en Core, `PisoMapaVista` en Visor):
  - valida la data URL y el tamaño (hasta 4 096 px);
  - pone la imagen sobre el terreno, con un faldón alrededor;
  - mientras hay piso, apaga el entorno procedural (calles, edificios, árboles, cerros) y conserva vehículos, personas, daño, cielo y luminarias;
  - nombra el crédito en su leyenda.
- **Compatibilidad:** la web acepta los puentes 1.2.0 y 1.3.0. Con el build publicado (1.2.0), el modo no aparece y «Versiones» alterna; con el 1.3.0, aparece el modo y la versión va como fantasma superpuesto (ADR 0123).

## Pendiente

- **El build 1.3.0:** lo compila y lo mide el colaborador, en la laptop y en la RTX, y se publica solo si cumple.
  - `LoadImage` de 2 048 px corre en el hilo principal: hay que medir que no pase de 100 ms (René, 2026-11-16).
- **El ajuste de la foto no se guarda con el caso:** dura la sesión.
