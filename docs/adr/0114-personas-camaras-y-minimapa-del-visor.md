# ADR 0114 — U3 y U4: personas, cámaras y minimapa del visor Unity

- **Fecha:** 2026-11-10
- **Estado:** aceptada
- **Contexto:** El plan v4 (§3.3) pide en U3 el daño con `perfil_m`, los ocupantes, los peatones y las motos con su trayectoria y la volcadura si el `Resultado` trae el giro. En U4 pide las cámaras (cenital, cinematográfica, órbita, conductores a la altura del ojo de `visibilidad` y libre, con ratón y táctil), «Ver todo» e «Ir al impacto», el minimapa y que los coches no salgan chicos en la cinematográfica (René, 2026-11-10). Unity solo reproduce el `Resultado`.

## Decisiones

1. **Las personas usan los cuerpos de MakeHuman (CC0) del visor web** (`apps/web/public/modelos/personas/`, `assets/ASSETS.md`): sin rasgos, con ropa neutra y con los mismos colores por persona que la web (`Cuerpos.Paleta`, el mismo FNV-1a de `body-assets.ts`, probado contra valores de la web).
   - **De dónde se cargan:** en el navegador, de la ruta `/modelos/personas/` del sitio que abre el visor; en el editor y en el escritorio, de producción. No se copian a git ni a Blob: ya se sirven en el sitio, y subirlos a Blob tocaría la canalización de la web.
   - **Las regiones** (piel, camisa, pantalón…) vienen en un atributo propio del glTF (`_REGION`) que glTFast no importa: `Cuerpos.Atributo` lo lee del .glb y la malla se parte en una submalla por región, cada una con su material liso. glTFast deja la malla legible y conserva el orden de los vértices.
   - **Si el cuerpo no se puede bajar,** un maniquí de piezas; el visor nunca se queda sin la persona.
   - **Variante:** el `Resultado` no trae la edad. Con menos de 1.45 m, el cuerpo de niñez; si no, el de adultez.
2. **La postura sale de la fase del `Resultado`** (`Personas.PosturaDe`): caminando, de pie, sentado (montado), en vuelo (de vertical a tendido a lo largo de la fase) y tendido (deslizamiento y reposo). Se dobla con los huesos (muslos, rodillas, brazos) alrededor del eje lateral del cuerpo. No hay animación propia: el paso al caminar es solo para que se lea el movimiento.
3. **Los ocupantes** van sentados en su asiento y se desplazan lo que dio el solver (`ocupante.variantes`), desde el impacto.
   - **El asiento es una colocación visual,** no un dato del solver: adelante, un poco detrás del centro; atrás, a un cuarto del largo; el conductor a la izquierda (`Personas.Asiento`).
   - **Si el cinturón no se declaró,** el solver da dos variantes y se dibujan las dos: la que lo usa con el cuerpo y la otra como maniquí naranja.
   - **En la cámara de un conductor** se esconden los ocupantes de su vehículo: el ojo va donde está su cabeza.
4. **Los vehículos estacionados** se dibujan con el modelo de su clase (`clase_vehiculo`; sin clase, un sedán) a sus medidas. Antes salían como una caja de tabique.
5. **La volcadura no se dibuja: es un límite del solver,** no del visor. `rollover.py` decide si el vuelco se inicia y da la velocidad de alabeo, pero no integra el giro; el `Resultado` no trae el alabeo en el tiempo, y en la escena de referencia el vuelco no se inicia. Está en el README («Límites de diseño») y en «Endurecimiento pendiente».
6. **«Ver todo» es la misma caja que en 2D** (`Encuadre.VerTodo`, ADR 0132): trayectorias completas, reposos, impacto, evidencias, marcadores, objetos y personas, con 6 m de margen. **«Ir al impacto»** es la zona de interés de siempre. Las dos ajustan la cenital, la órbita y la libre; desde la cinematográfica, la acera o un conductor, «Ver todo» pasa a la órbita y se le avisa a la web con `camara`.
7. **La cinematográfica encuadra los vehículos en el instante** (`Lente.VehiculosEn`, los involucrados con su largo, más el punto de impacto) para que llenen el 62 % del cuadro, de 7 a 60 m. Antes encuadraba toda la zona de interés y los coches salían chicos.
8. **El conductor** ve desde su asiento a la altura del ojo que usó `visibilidad` (`altura_ojo_m`; sin ella, 1.08 m de AASHTO). En dos ruedas va al centro, a 1.45 m como mínimo. A esa altura, en el sedán genérico el volante y el tablero del modelo tapaban el camino; en vez de subir el ojo (sería otro dato que el del solver), la cámara no dibuja lo que está a menos de 0.75 m del ojo.
9. **Ratón y dedos** (el `Input` clásico, que funciona en WebGL): en la órbita, arrastrar gira, el botón derecho o dos dedos desplazan y la rueda o el pellizco acercan. La cenital desplaza y acerca. La libre gira con el arrastre, avanza con la rueda y con las flechas o WASD, y nunca baja del piso. Una órbita que no se ha tocado gira despacio con el tiempo del caso, como antes.
10. **El minimapa** es una cámara ortográfica desde arriba en la esquina inferior derecha, con «Ver todo» y el norte arriba. Una flecha naranja, en una capa que solo ve el minimapa (31), marca dónde está la cámara. No proyecta sombras ni lleva posproceso, y la niebla se apaga mientras se dibuja (en una escena de lluvia, desde arriba, solo se veía su color). En la cenital se esconde.
11. **El contrato del puente no cambia:** `camara` ya admitía `orbita` y `libre`, y `encuadrar` ya admitía `todo` e `impacto`.

## Ajustes de René antes de U5 (2026-11-10)

12. **La vista del conductor no dibuja la carrocería propia,** salvo un contorno tenue (gris, 20 % de opacidad, 7 mm) del borde del cofre y de los postes y el techo del parabrisas, a la medida del vehículo y de su clase. Se ve lo que el conductor alcanzaba a ver. El ojo sigue a la altura de `visibilidad`, y ya no hace falta el recorte de 0.75 m.
13. **Todo vidrio de los modelos usa un vidrio propio neutro** (`vidrio_vehiculo`: tintado al 62 %, liso y sin el reflejo de la sonda). Con el de los modelos (transmisión o el atlas de luces y vidrio), el medallón reflejaba las fachadas de colores vivos como franjas rojas y azules, de torreta. Se guarda como recurso al preparar el proyecto para que su variante entre al build.
14. **La moto (y toda dos ruedas que el solver arrastra caída) se tiende desde el impacto,** en 0.35 s y hacia el lado al que se desliza (`Caida`). En reposo lleva el letrero «Posición final ilustrativa». La caída no es un resultado del solver: es un límite suyo, junto a la volcadura (README y «Endurecimiento pendiente»).
15. **La camisa nunca es color piel:** de la paleta web se quitó el malva `#7d4b55`, a 35 de un tono de piel en RGB; todas las camisas quedan a más de 60, con prueba en el núcleo. La paleta de camisas del visor Unity ya no es idéntica a la de la web (6 colores en vez de 7).

## Consecuencias

- **El núcleo gana** `Personas`, `Cuerpos`, `Encuadre.VerTodo`, `CajaPlano` y `Lente`, con pruebas en `dotnet test` (CI): pose en cada muestra, postura por fase, ocupantes, regiones del .glb real, el hash de la web, «Ver todo» deja en cuadro reposos e impacto en los 22 paquetes, y la caja de la cinematográfica.
- **La e2e de cambio de cámaras** (`tools/unity/e2e-camaras.mjs`) corre sobre el build WebGL, fuera de CI (los builds necesitan licencia y pasan de 10 min, ADR 0111).
- **El minimapa dibuja la escena dos veces.** Su costo se mide en U5; si media no cumple §7.8, se le baja densidad, no se quita.
- **El vidrio trasero de algunos modelos** refleja la fachada de enfrente con la sonda de reflejos, ya desde U2. De lejos puede leerse como algo dentro del vehículo; queda en «Falta de U4».
