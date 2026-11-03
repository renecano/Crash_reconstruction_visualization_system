# ADR 0098 — T1.5: cámara y presentación

- **Estado:** aceptado (2026-11-03). Quinto subtramo de T1 (PLAN-CESVI v3).
- **Contexto:** la cámara cinematográfica de R10 orbitaba a 24° de elevación y 14 m o más de distancia: nunca veía el cielo ni el horizonte (T1.1 a T1.3 los construyeron y en las capturas no aparecían), y pasaba de una cámara a otra de golpe. PLAN-CESVI v3 pide una cámara a nivel de calle (3–6 m, 35–50 mm), órbita lenta al impacto, cámara lenta con desenfoque de movimiento en el contacto, profundidad de campo, transiciones suaves entre cámaras y una leyenda limpia para presentar; y lo mismo en el exportador a Blender.

## Decisión

1. **Cámara a nivel de calle** (`cinematicCamera`): altura de 3 a 6 m y lente de 50 a 35 mm según el tamaño de la acción (`actionBounds`: un alcance se ve con 50 mm desde 3 m; un cruce ancho o una carambola, con 35 mm desde 6 m); el campo de visión sale de la lente sobre un sensor de 24 mm (`fovFromFocalMm`); la distancia encuadra la acción a lo ancho de una pantalla 16:9 con margen, entre 12 y 42 m; mira a 1 m de altura (media altura de los vehículos), así la inclinación hacia abajo queda por debajo de la mitad del campo de visión y el horizonte, los cerros y el cielo quedan en el tercio superior. La órbita baja de 0.12 a 0.06 rad/s (3.4°/s) y sigue al centro de los vehículos involucrados, como antes.
2. **Cámara lenta en el contacto** (`impactTimeWarp` en `cinematic-fx.ts`): con la cinematográfica, el reloj del visor (`ViewerClock.setWarp`) multiplica el tiempo real por un factor que baja en rampa de 1 a 0.25 a 0.85 s del primer impacto, se queda en 0.25 a menos de 0.25 s y vuelve a 1. No toca la velocidad que eligió la persona (`speed`): las dos se multiplican. El desenfoque de movimiento (`impactBlurWeight`) y la profundidad de campo siguen como en R10 (solo alta y ultra).
3. **Transiciones suaves** (`blendPose`, `CAMERA_TRANSITION_MS` = 1.2 s): al cambiar de cámara (cenital, conductor, cinematográfica, daño, persona), la pose se mezcla con suavizado de entrada y salida desde la última pose dibujada, incluida la de la cámara libre. La libre no se mezcla al entrar (la controla la persona).
4. **Leyenda limpia al presentar** (`Legend.limpia`): en el modo «Presentar» de las pantallas de CESVI (`useModoCesvi`), la leyenda muestra el texto de CESVI y las atribuciones (OpenStreetMap, modelos CC-BY) y nada más: sin «semilla», sin el hash del relato y sin el conteo de lo procedural. En «Trabajar» y fuera de CESVI todo sigue; las exportaciones (SVG, PNG, glTF) conservan la semilla.
5. **Lo mismo en el video de R11** (`warpedTimes` en `export/gltf.ts`): el exportador recibe la misma cámara lenta (`timeWarp`) y hornea los instantes: el video avanza a sus fps constantes y la escena, al factor de cada instante; los cuadros clave de la animación van en tiempo de video, así el clip de Blender frena en el contacto igual que la pantalla. La cámara cinematográfica exportada es la nueva (misma función), y el escenario de T1.1–T1.4 ya viaja en la escena glTF.

## Límites

- La cámara lenta alarga el clip de R11 (unos 1.4 s más por impacto a 30 fps); la leyenda del video sigue diciendo el tiempo de la escena.
- La transición se calcula con el reloj de pared (`performance.now`), no con el tiempo de la escena: al pausar sigue terminando.
- En media no hay profundidad de campo ni desenfoque de movimiento (R10, §7.8): la cámara lenta se ve sin ellos.

## Evidencia

- Capturas «t1.5» contra «t1.4» en `docs/cesvi/t1/`; fps en `eval/results/e6_t1_t1.5_media.json` (ver PROGRESS).
- Pruebas: `cameras.test.ts` (altura, lente, horizonte en pantalla y órbita en tres escenas; mezcla de poses), `cinematic-fx.test.ts` (rampa de la cámara lenta), `clock.test.ts` (el factor no toca la velocidad elegida), `export/gltf.test.ts` (instantes horneados), `legend.test.tsx` (leyenda limpia).
