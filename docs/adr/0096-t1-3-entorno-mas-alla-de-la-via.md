# ADR 0096 — T1.3: entorno más allá de la vía

- **Estado:** aceptado (2026-11-03). Tercer subtramo de T1 (PLAN-CESVI v3).
- **Contexto:** hasta T1.2 el escenario terminaba en la vía: un plano de pasto hasta el horizonte, sin edificios, árboles, cercas ni cerros. PLAN-CESVI v3 pide que donde OpenStreetMap trae edificios se extruyan, y donde no (casi todo México: AXA 0, Toluca 0) un entorno procedural por tipo de vía y uso de suelo con semilla fija, vegetación y postes instanciados, relieve leve, siluetas de cerros o perfil urbano a lo lejos, y «procedural» en la leyenda.

## Decisión

1. **Plan procedural puro por escena** (`environment-decor.ts`, `planEnvironment`): con la semilla de la escena y una ventana de 360 m centrada en la acción.
   - **Zona** (`zoneFor`): rural si la vía es `carretera_dos_carriles` o `autopista`, o si la mayoría de las calles del mapa son `motorway`/`trunk`; urbana en los demás casos.
   - **Urbana:** lotes con edificios sencillos a lo largo de cada calle, con retiro de 7 m de la calzada, un claro de 28 m alrededor de la acción para que ninguna fachada tape las cámaras, 1–2 niveles a menos de 70 m y hasta 3 más lejos; árboles de banqueta cada 15 m. Ningún árbol (de banqueta ni de campo) a menos de 22 m de la acción (`TREE_CLEAR_M`): en la primera captura de Toluca una copa tapaba el impacto.
   - **Rural:** parcelas (franjas de 60–120 m perpendiculares a la vía, con su tono), cercas en los linderos y a lo largo del derecho de vía, postes de luz eléctrica cada 45 m, árboles y arbustos en grupos a más de 8 m de la vía.
   - **Horizonte:** un anillo de cerros a 520 m (alturas por ruido con la semilla: 50–160 m en campo, 25–80 m en ciudad) y, en ciudad, bloques lejanos a 420 m. La niebla los funde con el cielo.
   - **Relieve leve** (`terrainHeightAt`): ruido suave de hasta 3 m (1.5 m en ciudad), plano hasta 18 m del borde de la vía y en rampa hasta 58 m: la física vive en z = 0 y no cambia. Árboles, edificios, postes y cercas se asientan sobre ese relieve.
2. **Mallas instanciadas** (`environment-scene.ts`): el suelo es una malla de 96 × 96 cuadros con el relieve y el color por vértice de las parcelas; los edificios son un cubo unitario instanciado con escala y color por instancia y una fachada procedural (filas de ventanas por nivel de 3.2 m, zócalo, de noche un tercio con ventanas encendidas); los árboles entran a las mismas mallas instanciadas de troncos y copas de F8c; los postes de luz y los postes de cerca también van instanciados. Son pocas llamadas de dibujo aunque haya cientos de piezas.
3. **La leyenda lo dice:** el grafo resume lo procedural (`SceneGraph.procedural`: zona, edificios, árboles, luminarias, cerros), el visor lo entrega (`onProcedural`) y la leyenda añade una línea: «Entorno procedural (no es el lugar real): 15 edificios, 34 árboles, cerros al fondo.».
4. **Vegetación con modelos CC0: evaluada y descartada por ahora.** Los árboles CC0 de Poly Haven pesan de 46 a 215 MB cada uno (mallas de geometry nodes) y no caben en el visor; los paquetes de pocas caras (Quaternius, Kenney) se descargan sin API fija. Los árboles siguen siendo procedurales (tronco y copa de pocas caras, tres tipos), instanciados; queda en «Endurecimiento pendiente» traer un paquete CC0 de pocas caras con su pipeline fijado por SHA-256.
5. **Edificios de OpenStreetMap: pendiente.** El contrato (`red_vial`) solo trae calles; traer `building` pide ampliar la consulta de Overpass, el contrato (versión menor) y el paso del lugar. Como en México casi nunca hay edificios mapeados y el «listo cuando» de T1.3 es que ninguna cámara vea un plano liso ni un horizonte vacío, se deja anotado para cuando haya un caso con edificios mapeados.
6. **El horizonte son siluetas sin iluminación** (`MeshBasicMaterial`, un color por zona y hora). Con material estándar, los cuatro focos de la noche (dos luminarias y dos faros) se evaluaban sobre todo el anillo de cerros y el perfil urbano, y la noche con lluvia bajaba de 63 a 50 fps de mediana en media. A 420–520 m, dentro de la niebla, un color plano se ve igual que uno iluminado.

## Interruptores de diagnóstico

`eval/t1_tirones.mjs --diag '{"sinEntorno":true}'` quita todo el entorno procedural y `{"sinRelieve":true}` solo el relieve, para medir su costo en media.

## Evidencia

- Capturas «t1.3» contra «t1.2» en `docs/cesvi/t1/`; fps en `eval/results/e6_t1_t1.3_media.json` (ver PROGRESS).
- Pruebas: `environment-decor.test.ts` (zona, ciudad determinista sin nada sobre la calzada, campo con parcelas y cercas, relieve plano en el corredor), `scene-graph.test.ts` (los árboles procedurales entran a las mallas instanciadas después de los declarados).
