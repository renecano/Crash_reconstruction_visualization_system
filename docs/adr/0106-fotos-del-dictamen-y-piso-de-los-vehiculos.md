# ADR 0106 — Fotos del dictamen, vehículos apoyados en el piso y calidad automática que baja

- Fecha: 2026-11-04
- Estado: aceptado
- Origen: René, 2026-11-04 (captura del dictamen de un caso nuevo con «En el impacto (0 s)» y
  «En reposo (+4.0 s)»; pedidos C1–C3 y D).

## Contexto

- **C1.** Las dos fotos del dictamen salían idénticas. La foto tomaba la cámara que tuviera el
  visor en ese momento: con la del conductor (la que René estaba probando) o la cenital, y los
  vehículos ya detenidos, el impacto y el reposo se ven igual. Además la foto no esperaba a que el
  visor estuviera listo (con el precompilado progresivo del ADR 0104 podía salir a medio revelar).
- **C2.** «Las llantas no caen en sus salpicaderas… el auto se ve hundido en el asfalto».
  Medido con `eval/t1_ruedas.mjs` (`eval/results/t1_ruedas.json`, capturas en
  `docs/cesvi/t1/ruedas/`): en las ocho clases con modelo y escena de ejemplo las ruedas quedan en
  los ejes del caso, centradas en sus huecos y con la base en el piso, en el inicio, el impacto y el
  reposo; las mallas de las ruedas coinciden con su nodo en todos los modelos menos el autobús (sus
  «ruedas» son tapones y las llantas vienen en la carrocería; no hay autobús en los casos de
  ejemplo). Lo que sí se encontró: los vehículos iban siempre a altura 0, así que uno que termina
  sobre la banqueta (lateral_interseccion: la pickup en reposo) o sobre el pasto con relieve se veía
  hundido.
- **C3.** «Marcas rojas sobre el asfalto junto a la llanta trasera»: los aros de la línea de visión
  (naranja cuando algo tapaba) y el anillo del punto de impacto se dibujan en el piso junto a los
  vehículos; son marcadores de interfaz.
- **D.** René pidió que, si los fps se quedan por debajo de 24 durante 5 s, la calidad automática
  baje un nivel (hasta baja) y lo diga en `?diag=1`; bajar sí, subir no.

## Decisión

1. **Fotos del dictamen** (`ViewerExportApi.captureFrameReady`): esperan al grafo listo (modelos,
   texturas, daño y programas; a lo más 60 s), dibujan el instante dos veces antes de copiar (las
   sombras y texturas al día), con la **cámara cinematográfica** (opción `camara`; la del visor
   vuelve tal como estaba, sin transición) y **sin marcadores de interfaz** (opción `sinInterfaz`:
   todo lo que lleva `userData.interfaz`: anillo y centro del impacto, líneas y aros de visión,
   indicadores de contacto de las personas). El e2e del flujo de un caso nuevo
   (`cesvi-caso.spec.ts`) compara «en el impacto» y «en reposo» y falla si menos del 2 % de los
   píxeles cambia.
2. **El piso bajo los vehículos** (`ground-height.ts`): la altura del piso es lo más alto entre el
   relieve (en la vía, 0; el parche de suelo va 3 cm abajo) y las banquetas y camellones (a la
   altura de la guarnición, 15 cm), con una rejilla de 4 m para que cada consulta revise solo sus
   triángulos. Cada vehículo guarda la altura del piso en cada muestra de su trayectoria (promedio
   bajo sus cuatro llantas, dos en una moto, sin inclinar la carrocería) y la interpola al dibujar.
3. **Calidad automática**: con el visor a la vista y el grafo listo desde hace 4 s, si los fps de
   los últimos 5 s no llegan a 24 (`LOWER_BELOW_FPS`), baja un nivel en ese momento (el dibujo se
   vuelve a preparar), el nivel queda de techo para la sesión y `?diag=1` lo dice («bajó de media a
   baja (19 fps durante 5 s); no vuelve a subir en esta sesión»). Nunca sube. Antes (ADR 0104) solo
   bajaba con el reloj en pausa y al volver a abrir el 3D.

## Consecuencias

- Pruebas: `ground-height.test.ts`, `ground-height-scene.test.ts` (la pickup de
  lateral_interseccion termina sobre la banqueta; los marcadores de interfaz van marcados),
  `quality.test.ts` (24 fps durante 5 s), e2e del flujo (fotos distintas).
- No arreglado aquí (anotado en `docs/PROGRESS.md`): el autobús de Sketchfab trae las llantas en la
  carrocería; la pintura transferida cubre todo el costado del vehículo golpeado, no solo la zona del
  contacto; un ocupante de la pickup de lateral_interseccion asoma por la puerta en reposo.
