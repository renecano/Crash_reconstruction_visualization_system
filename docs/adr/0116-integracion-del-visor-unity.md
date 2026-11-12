# ADR 0116 — U6: el visor Unity en `/cesvi`, la edición en 3D y las fotos del dictamen

- **Fecha:** 2026-11-12
- **Estado:** aceptada
- **Contexto:** El plan v4 (§3.3, U6) pide integrar el visor Unity en la web: `<VisorUnity>` con carga diferida y respaldo three.js, las fotos del dictamen con `capturar`, «Descargar paquete 3D», el modo edición en 3D (C2 y C1), los scripts de build y de Blob, y el build de Windows con un caso de ejemplo. «Listo cuando», en producción: `/cesvi` muestra Unity en Reconstrucción, Análisis y Presentar; mover un poste en 3D recalcula; las fotos del dictamen salen de Unity; el respaldo funciona; pasa la e2e del flujo completo en Chromium.

## Decisiones

1. **Puente 1.2.0** (PR `contract:`): la vista `antes` de `capturar` (el dictamen lleva tres fotos: −1 s, 0 s y reposo) y la `herramienta` de `modoEdicion` (`mover`, `punto_inicial`, `choque_intermedio`, `punto_paso`) con su `vehiculo_id`. La 1.1.0 no decía qué marcaba un clic.
2. **Una sola instancia de Unity por página**, montada con el caso (como el visor three.js), oculta cuando no se ve y en pausa. Sirve a Reconstrucción y a Números (el mismo panel) y, en Presentar, se muestra detrás de la historia: Presentar le avisa el instante de cada capítulo por un canal sin React (`CanalTiempo`), para no redibujar la página 60 veces por segundo.
3. **El paquete lo arma la web** (`paqueteDelCaso`): la escena del 3D (`especDel3d`, la misma del visor three.js), el Resultado completo del solver TS sobre esa escena, el relieve del lugar y el escenario (ADR 0112). Unity no recalcula.
4. **Respaldo three.js** cuando no hay WebGL 2, no hay manifiesto, el cargador no baja, pasan 90 s, la versión del puente no coincide, Unity pierde el dispositivo o un caso no carga. El aviso dice por qué. `?visor=ligero` lo abre directo.
5. **Edición en 3D** (`EditorEscena`, geometría en `Croquis.Core.Edicion` con `dotnet test`): arrastrar un objeto lo mueve por el piso con un fantasma; la rueda o dos dedos lo giran; con Mayúsculas la rueda cambia su largo; Esc cancela. Al soltar sale `objetoEditado`; la web lo lleva al expediente con las funciones de la escena fácil (`moverObjeto`, `girarObjeto`, `cambiarTamano`; el objeto de un choque intermedio, con `moverChoqueIntermedio`) y el caso se recalcula y se vuelve a cargar. Los puntos de C1 llegan igual (`marcarPrimerGolpe`, `agregarChoqueIntermedio` con el objeto tocado, `agregarPuntoDePaso`). Los objetos que vienen del mapa (OpenStreetMap) no se editan en 3D: el aviso lo dice.
6. **Fotos del dictamen desde Unity** (`Captura`): cámara cinematográfica en el instante de cada vista, dibujada aparte a la escala de dibujo completa (no a la de la escala automática de media), sin minimapa ni panel; la escena vuelve a como estaba. La atribución de los modelos (CC-BY) se arma con el mismo manifiesto `vehiculos.json` que usa Unity.
7. **«Descargar paquete 3D»** baja el caso-3d del caso; **el visor de escritorio** lo abre (`-abrir <archivo>` o arrastrándolo sobre el programa) y, sin archivo, abre el caso de ejemplo que viaja en el paquete.
8. **Blob guarda dos builds:** el nuevo y el de producción (el del manifiesto de `origin/main`); `publicar-web.mjs --podar` lista los demás y solo los borra con `--si`.
9. **Las e2e no bajan el Unity real.** Un navegador automatizado (`navigator.webdriver`) abre el visor ligero, salvo que la prueba pida Unity; la e2e de U6 usa un Unity de mentira (`e2e/unity-falso.js`) que habla el puente. Así CI no baja 70 MB por flujo ni necesita GPU, y se prueba lo que es de la web. El Unity real se revisa a mano en producción, con capturas en la bitácora.

## Consecuencias

- Abrir un caso baja el build de Unity (unos 70 MB, en la caché del navegador después de la primera vez) aunque el perito no abra el 3D: así el 3D está listo al abrirlo, como ya pasaba con los modelos del visor three.js.
- El visor three.js (`packages/viewer`) sigue congelado y es el respaldo.
