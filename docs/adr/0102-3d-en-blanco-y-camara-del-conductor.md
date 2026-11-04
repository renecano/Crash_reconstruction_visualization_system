# ADR 0102 — El 3D en blanco en computadoras potentes y la cámara del conductor

- **Estado:** aceptado (2026-11-04). Pedido urgente de René antes de T1.3c y T3.2.
- **Contexto:** en producción, en computadoras con tarjeta de video (que eligen alta o ultra), el visor 3D mostraba unos clips y luego pantalla blanca; en la laptop de referencia (media, WebGL 2) no se reproducía. Además la cámara del conductor solo mostraba el respaldo del asiento.

## Diagnóstico

Reproducido en la laptop con el diagnóstico nuevo (`eval/t1_memoria_gpu.mjs`, `eval/results/t1_memoria_gpu.json`, etiqueta `antes`): en modo automático el visor arranca en media (58–71 fps), sube a alta a los 10 s y, con WebGPU, el pase de oclusión ambiental (GTAO) falla al compilar: `textureGather(texture_depth_multisampled_2d, …)` no existe en WGSL. El pase hereda las 4 muestras de MSAA del renderer (`PassNode.renderTarget.samples = renderer.samples`), así que su textura de profundidad es multimuestra. El módulo de sombreado queda inválido («Render pipeline creation failed (renderPipeline_GTAO)») y, con él, **todos** los búferes de comandos siguientes (`GPUValidationError: Invalid CommandBuffer … is invalid due to a previous error` en cada cuadro): el renderer no dibuja nada y el lienzo queda en blanco. No es memoria de video ni pérdida del dispositivo: el diagnóstico contó 597 MB estimados en alta y 1 258 MB en ultra (a 1080p con dpr 1.5 y 2), y ninguna pérdida. Con WebGL 2 el mismo pase compila (GLSL resuelve la profundidad), por eso la laptop no lo veía.

## Decisión

1. **El pase previo de la oclusión se dibuja sin MSAA** (`pass(scene, camera, { samples: 0 })` en `PostEffects.tsx`): la oclusión no necesita antialiasing; el pase principal conserva sus muestras.
2. **Diagnóstico en pantalla con `?diag=1`** (`diagnostics.ts`, `DiagnosticoPanel` en `visor-app.tsx`): backend y preferencia, adaptador (`adapterInfo` de WebGPU o `UNMASKED_RENDERER` de WebGL), calidad, dpr y generación, lienzo, fps, memoria estimada (texturas de la escena por materiales y nodos TSL, búferes de pantalla con MSAA y pasos de postproceso, mapas de sombra), último error y motivo de la pérdida. También en `window.__croquisDiagnostico` para las evaluaciones.
3. **Pérdida del dispositivo y errores del ciclo de dibujo** (`recovery.ts`, lógica pura con pruebas): `renderer.onDeviceLost` (WebGPU `device.lost`, WebGL `webglcontextlost`) y `renderer.onError` (errores de validación de la GPU) se registran; una pérdida recrea el renderer y la escena (`generation` en el `Canvas`); si se repite dentro de 120 s se baja un nivel y ese nivel queda de techo del modo automático; a la cuarta se deja de intentar y aparece un aviso con «Reintentar» y «Usar calidad media». Las excepciones del ciclo de dibujo se atrapan, se registran (una por segundo) y, si no paran (30 cuadros seguidos), cuentan como pérdida. Un límite de error de React envuelve el `Canvas`: nunca pantalla blanca. El renderer se desecha al desmontar (R3F no lo hacía: cada cambio de calidad creaba otro).
4. **Cámara del conductor en sus ojos** (`driverEyeOffset` en `cameras.ts`): en el asiento del conductor, 0.2 m delante del centro entre ejes (la cabeza junto al pilar B) y 0.37 m a la izquierda, a la altura del ojo del análisis de visibilidad; FOV 70°, plano cercano 0.05 m; no se dibujan las personas a bordo de ese vehículo. El ojo del análisis de visibilidad del solver (`eyeOffset`, 0.05·largo detrás del centro de masa) no cambia: a 25 m de distancia 0.4 m no mueven las líneas de vista; alinearlos queda en «Endurecimiento pendiente».

## Evidencia

- `eval/results/t1_memoria_gpu.json`: `antes` (los errores de GTAO y el visor vacío en modo automático; memoria por nivel) y `despues` (sin errores de GPU en alta y ultra con WebGPU, memoria por nivel).
- Pruebas: `recovery.test.ts` (recrear, bajar, techo, rendirse, reintentar), `diagnostics.test.ts` (bytes por textura, texturas compartidas, memoria de pantalla, almacén), `cameras.test.ts`; e2e `visor.spec.ts` (`?diag=1` y una pérdida simulada que recrea el visor sin pantalla en blanco).

## Límites

- La memoria es una estimación (dimensiones y tipo de cada textura, búferes por dpr y muestras): el navegador no expone la memoria de video real.
- Una pérdida real por TDR (un cuadro de más de 2 s en Windows) se recupera igual que cualquier otra, pero si vuelve a ocurrir en el mismo nivel, bajar de nivel es la única defensa.
