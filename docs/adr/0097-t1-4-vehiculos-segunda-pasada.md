# ADR 0097 — T1.4: vehículos, segunda pasada

- **Estado:** aceptado (2026-11-03). Cuarto subtramo de T1 (PLAN-CESVI v3).
- **Contexto:** los modelos de Sketchfab (R10, ADR 0086) ya daban vehículos reales, pero la pintura era un barniz liso, las calaveras solo encendían de noche, las ruedas quedaban donde el modelo tiene sus arcos y cuatro clases (van, combi, autobús, tractocamión) seguían paramétricas. PLAN-CESVI v3 pide pintura con capa transparente y hojuelas, luces de freno cuando el conductor frena, faros y calaveras de noche con interior tenue, ruedas en los ejes del caso, una moto de trabajo y un modelo por clase que falte.

## Decisión

1. **Pintura con hojuelas** (`paint-material.ts`): base metálica cuya normal gira por celda de ~1 mm (tres hashes por pixel, sin texturas) debajo de un barniz (`clearcoat`) que conserva la normal lisa: los reflejos del HDRI siguen nítidos y debajo centellea el metal. El `estado_pintura` del contrato (nueva, normal, desgastada) cambia la rugosidad de la base y del barniz y cuánto se notan las hojuelas. La pintura dañada (`damage-material.ts`) usa las mismas hojuelas y el mismo estado, así una puerta deformada no cambia de pintura junto a la intacta. Vidrio y cromo conservan sus materiales; en media reciben el HDRI por `setVehicleEnvironment` (T1.1).
2. **Luces de freno sin inventar nada** (`brake-lights.ts`): la señal sale de la trayectoria del solver. Antes del primer impacto, un vehículo solo pierde velocidad si el conductor frena (motor y aire quitan menos de 0.5 m/s²), así que las calaveras encienden cuando la desaceleración de la trayectoria llega a 1 m/s²; coincide con el evento `inicio_frenado` (prueba sobre el alcance). Después del impacto, el arrastre también frena sin pedal: ahí siguen encendidas solo si el relato dice que aplicó el freno (`frenado.aplico`) y mientras el vehículo se mueve. Cada vehículo tiene su material de calaveras (también en los modelos, que antes solo lo clonaban de noche): de día encienden a 3 y de noche a 6 sobre la luz de posición de 1.5.
3. **Noche:** faros y calaveras encendidos como antes; en los modelos, las piezas del interior y el volante reciben un brillo tenue cálido (tablero), ilustrativo.
4. **Ruedas en los ejes del caso** (`axleRemap` en `vehicle-models.ts`): el largo del modelo, ya escalado al largo del caso, se reparte en tres tramos (voladizo delantero, paso entre ejes y voladizo trasero) y cada uno se estira por separado para que los arcos caigan en los ejes del caso (`axlePositionsFor`, los mismos del paramétrico y del solver); las ruedas se colocan ahí. Los extremos no se mueven, así que el largo del caso se conserva. Si los ejes ya coinciden (menos de 2 cm), no se toca nada. Cierra el límite «paso entre ejes» de ADR 0086.
5. **Cuatro clases más con modelo**, todas CC-BY 4.0 verificadas en el API y fijadas por SHA-256 en `sketchfab.lock.json`:
   - van → «Shvan '92» y microbús/combi → «Shvan 92 Traveller», de Daniel Zhabotinsky: el mismo pipeline de ADR 0086 (nombres de pieza conocidos, placas y emblemas quitados);
   - autobús → «Generic Town Bus» (own.guest) y tractocamión → «Low Poly Red Semi Truck» (JuraPicksHisNose): modelos de otros autores, sin nombres de pieza. Reciben una configuración (`Modelo.generico`: largo real, giro al frente +X, papel por material) y el script de Blender (`preparar_generico`) reconoce las ruedas por geometría (componentes redondos de los materiales de llanta, agrupados por centro) y las luces por posición (componentes de los materiales de luces: al frente y abajo, faros; atrás, calaveras). Baja sigue paramétrica.
   - `vehicles build` acepta `CROQUIS_VEHICULOS_SOLO=van,combi,…` para no volver a pasar por Blender los modelos ya versionados.
6. **Moto de trabajo de 125 cc: no entra.** La búsqueda en Sketchfab (2026-11-03, API pública, solo CC-BY o CC0 descargables) no dio un modelo limpio: «125cc Naked Motorcycle» copia una Yamaha YBR 125 (regla 5: sin modelo real reconocible), las Super Cub y las Vespa traen marca y el resto son scooters de caricatura o motos de fantasía. Sigue la enduro de ADR 0086; queda en «Endurecimiento pendiente».

## Límites

- Las hojuelas son celdas en el espacio del vehículo: al escalar la carrocería a las dimensiones del caso se estiran un poco (no se nota a las distancias del visor).
- Las luces de freno no distinguen un frenado suave de uno fuerte, ni el freno de motor de un pedal ligero (todo por debajo de 1 m/s² va apagado).
- En el autobús y el tractocamión los faros dependen de que el autor los haya separado del resto en su material: si el paso genérico no encuentra piezas al frente, el vehículo no lleva foco de noche (`workingHeadlights` da 0).
- El estilo del tractocamión (pocas caras, sin texturas) es más sencillo que el de los autos de Daniel Zhabotinsky.

## Evidencia

- Capturas «t1.4» (cinematográfica y daño) contra «t1.3» en `docs/cesvi/t1/`; fps en `eval/results/e6_t1_t1.4_media.json` (ver PROGRESS).
- Pruebas: `paint-material.test.ts`, `brake-lights.test.ts` (incluida la coincidencia con `inicio_frenado` del alcance), `vehicle-models.test.ts` (reparto a los ejes del caso sin cambiar el largo), `scene-graph.test.ts` (las calaveras encienden al frenar), pipeline (`test_vehicles.py`: diez clases, ruedas y papeles de los genéricos).
