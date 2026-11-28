# Bitácora del frente U · Visor Unity, contratos e integración

Plan: `docs/cesvi/PLAN-CESVI.md` §3.3. Reglas: `CLAUDE.md`. ADR del bloque 0110–0129 (el 0110 ya estaba usado, así que este frente empieza en el 0111).

## Estado

- **Fase actual (2026-11-15):** U8 cerrada: el visor deforma la carrocería con el daño del solver, el 3D tiene controles de reproducción y el build con el daño (huella `e06bdd73b0ce3706`) está publicado. U5 y U6 cerraron el 2026-11-12. U7 (cierre) va con la Tanda 5 de la auditoría.
- **Siguiente:** el paquete de fotos del colaborador (15 tomas del modo foto y el recorrido de la app, ya con el daño) y volver a medir los fps con este build. El detalle está abajo, en «U8».
- **Tráiler (2026-11-16):** construido en `apps/trailer`, con previos en los tres formatos. Faltan las tomas reales del 3D, que salen de la tanda 4 de la RTX. El detalle está abajo, en «Tráiler».
- **Unity y Blender corren en segundo plano** desde el 2026-11-10: René reabrió la sesión con `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1`. Sigue la regla de un solo proceso pesado a la vez.
- **Cómo se itera:** capturas del Editor en modo batch (`Capturas.Tomar`, unos 3 min). En esta sesión no hubo herramientas del MCP de Unity. Un build WebGL solo al cerrar cada punto.

## La batería de ciudad: Tollocan tronaba en el 3D (René, 2026-11-20)

- **Lo que se vio:** en el humo de la t5b, Tollocan pasaba a «calculando» y, 1.2 s después, Unity contestaba «Object reference not set to an instance of an object». Se abría el visor de respaldo.
- **La causa, reproducida en Unity** (PlayMode en el Editor, en modo batch, sin navegador): en un caso de ciudad, las calles del mapa en vivo llegan después de que el 3D empezó, y la web mandaba otro `cargarCaso` mientras Unity seguía con el primero.
  - La carga nueva destruía lo de la vieja; la vieja, al volver de `await modelos.ArmarAsync`, tocaba `go.transform` (`VisorCaso.cs`) y contestaba «error».
  - La web tomaba ese «error» como respuesta de la nueva.
  - Un solo caso cargado por separado no truena: 14 de 14 en el Editor y 14 de 14 en el player de Windows (build de desarrollo).
- **Producción tiene el mismo bug:** con el código del 1.3.0 (`35a9cd92`) y paquetes de `main`, las cargas encimadas a 0 y 1 cuadros contestan «error». El arreglo solo de la web está en el #292, sin fusionar.
- **El arreglo** (`dcf7c291`, `266a61dc`):
  - Unity: cada carga lleva su turno, y una reemplazada se detiene sin tocar nada (`CargaReemplazada`).
  - Web: una carga a la vez; la escena que llega mientras Unity carga va cuando termina.
  - Cada elemento y cada sección de los constructores va protegido (`Omisiones`), y lo omitido viaja en `cargado` (`omitidos`) para que el perito lo vea.
- **La batería:** `packages/scene-schema/fixtures/caso3d-ciudad/` (14 paquetes, datos de `data/osm/`), `Assets/Croquis/TestsCiudad/CiudadEnUnityTests.cs` y `tools/unity/bateria-ciudad.ps1`. Resultados en `eval/results/unity_bateria_ciudad/`. Con el arreglo: 19 de 19.
- **El build:** `59d874d0d8ffd774` (7.1 min, 0 errores), en el release de GitHub `visor-web-59d874d0d8ffd774`; no va a Blob. El manifiesto de la rama apunta a él.
- **La t5c:** definida y fijada a `c051746c`; el PR #293 la hace vigente, sin fusionar.
- **Siguiente paso:** con el visto bueno de René, fusionar #293 (la t5c) y #292 (el arreglo de producción). Después, la tarea de 1.4 s en el hilo de la página (armar el paquete de un caso de ciudad) y las velocidades (`feat/w-velocidades-via`).

## Ronda 4, punto 9: el modo «mapa real» (René, 2026-11-18; ADR 0124)

- **Prueba visual con la foto de Esri** en el cruce de Guadalajara: `eval/ronda4_mapa_real_esri.mjs` (20 teselas, ninguna fallida). En AXA, con el Unity falso: `docs/cesvi/ronda-4/evidencia/mapa-real/axa-*.jpg`.
- **Web lista:** `lib/visor-unity/piso.ts`, `components/visor-unity/mapa-real.tsx` y el piso y el fantasma en `visor-unity.tsx`.
  - Pruebas: `piso.test.ts`, `dictamen-caso.test.ts` (el crédito del piso) y la e2e `visor-mapa-real.spec.ts` (@flujo).
- **Unity escrito, sin compilar en Unity:** `PisoMapa`, `Fantasmas`, `PisoMapaVista`, `VisorCaso` y el puente 1.3.0.
  - `dotnet test` de Croquis.Core: 107 de 107.
  - `Visor/` se comprobó contra los ensamblados del Editor 6000.3, sin abrir Unity.
- **Build 1.3.0 (René, 2026-11-18: en su laptop, publicar solo si no empeora la carga):** huella `3087c2915b272e66`.
  - **Compilación:** web en 8.3 min y Windows en 1.6 min, sin errores. Pesa casi lo mismo: wasm +58 KB y data +16 KB.
  - **Arranque del 3D** (`medir-unity-arranque`, 3 corridas por build en la demo local, sin Blob; `eval/results/ronda4_unity_arranque_{antes,despues}_*.json`). Medianas, hasta «listo», primera y segunda visita:

    | Caso       | Antes (64b29e87) | Después (1.3.0) |
    | ---------- | ---------------- | --------------- |
    | AXA        | 13.7 s / 8.8 s   | 13.5 s / 7.5 s  |
    | Caso nuevo | 14.1 s / 6.7 s   | 12.0 s / 6.2 s  |

    No empeora.

  - **Con el Unity real** (`e2e/unity-130-real.spec.ts`, capturas en `docs/cesvi/ronda-4/evidencia/unity-130/`):
    - el mapa real con la foto de Esri, su ajuste y el modo solo con el mapa;
    - el fantasma translúcido de una hipótesis en «Versiones».
  - **Tareas largas al encender el piso:** de 50 a 197 ms. Quedan en «Endurecimiento pendiente».
  - **Publicado:**
    - en Blob, con `publicar-web.mjs`, sin podar;
    - en el release `visor-web-3087c2915b272e66` (para la demo local y la RTX);
    - en el visor de escritorio `visor-escritorio-r4`, probado: arranca con el puente 1.3.0, sin excepciones.

## Ronda 4, punto 8: las versiones en el 3D (René, 2026-11-18; ADR 0123)

- **Ahora (sin build nuevo):** en «Versiones», «La reconstrucción» / «Esta versión» alterna lo que carga Unity.
  - Se conservan el instante y el modo de cámara.
  - El paquete 3D, las fotos y el video siguen siendo los de la reconstrucción.
  - **Límite:** un giro a mano en la órbita vuelve a su ángulo, porque la escena se recarga.
- **Siguiente:** el fantasma superpuesto (`caso-3d` con la versión, vehículos translúcidos en Unity), compilado con el paquete del colaborador. Se cambia antes de la demo si la medición cumple.

## Ronda 4, B7: «Descargar video» del 3D (René, 2026-11-18; ADR 0122)

- **Qué hace:** el botón «Descargar video», junto al del minimapa, graba la reproducción completa con la cámara elegida. Sale un MP4 H.264 de 1920×1080 a 30 fps, con la leyenda ilustrativa (la dibuja Unity) y el logo; el minimapa no aparece.
- **Cómo:** cuadro por cuadro, con `fijarTiempo` y el lienzo, así que sale fluido aunque la máquina no llegue a 30 fps.
- **Mientras graba:** un panel con el porcentaje, cuánto falta y «Cancelar» (también Esc).
- **Pruebas:**
  - `video.test.ts`: los instantes, cuánto falta y el nombre del archivo.
  - `e2e/visor-video.spec.ts`, con el Unity de mentira: el MP4 es H.264 de 1920×1080 a 30 fps, con todos los instantes; la cancelación con Esc, en el panel.
- **Con el Unity real, en Chrome y en Edge:** la tanda «r4» del colaborador (`demo-local.ps1 -Despues video-3d`).

- **El marco:** en Reconstrucción, las cámaras, «Editar en 3D», «Descargar paquete 3D», el minimapa y la pantalla completa van en una barra arriba, y la reproducción abajo, fuera de la escena. Las notas van en «Supuestos y notas del cálculo», cerrado.
  - **Pantalla completa** (botón o F; Esc sale): los controles se esconden a los 3 s sin mover el mouse, y Espacio reproduce o pausa.
  - **El 2D** igual: la reproducción y la nota de la velocidad abajo; acercar y alejar, arriba.
  - **Capturas antes y después** con el Unity real: `docs/cesvi/ronda-3/evidencia/marco/` (`e2e/capturas-marco.spec.ts`).
  - **Pruebas:** `marco-vista.test.tsx` (5) y la e2e `visor-marco.spec.ts` (@flujo, con el Unity de prueba): barras fuera del lienzo, notas cerradas, `depurar` con `minimapa: false`, pantalla completa, Espacio, autoocultado, F, Esc y el 2D.
- **Los cinco ejemplos con el Unity real**, en la demo local: los cinco abren el 3D, con las mismas cifras del 16 de noviembre (16, 62, 34, 21 y 36 km/h), sin llamadas a Claude ni errores de página (`eval/results/ronda2_ejemplos_unity_demo_local.json`, capturas en `docs/cesvi/ronda-3/evidencia/ejemplos-unity/`).
  - «Crucero de noche» y «Carambola de noche con lluvia» salen de día y en seco en el 3D: la escena se arma con el clima y la luz por omisión, y la hora de la lectura («21:45 horas», «22:30 horas») no llega a la luz.
  - En «poste-terraceria» el vehículo A se llama «A · 3»: solo el modelo, sin la marca.

**La corrida corta de la RTX (t4b, `tools/colaborador/tandas.json`):** visor local, arranque del 3D, demo local, seis fotos rehechas, tomas del tráiler, video de Unity y fps web. Estimado: 163 minutos de pasos, más la comprobación.

- **Arranque del 3D** (en la t4 se quedó «arrancando» 5 min): el hilo de la página estuvo bloqueado (Playwright la consultó 4 veces en 5 min y el plazo de 90 s del visor no corrió). Aquí, con la misma copia del build, pasó en 2.8 min. `arranque-3d.ps1` fija la GPU de alto rendimiento para el Chromium de Playwright, como `medir-web.ps1` con Chrome, y la deja como estaba. La prueba trae la ventana al frente y, si falla, escribe en el registro la tarjeta de WebGL, la fase y lo que dijo la página.
- **Tomas del tráiler** (en la t4 se detuvieron en el tope de 60 min sin ninguna terminada): en la laptop, la escena de noche con lluvia a 4K bajó de 6.2 a 0.2 fps hacia la octava toma en la misma instancia del visor. No es la textura de la foto: con el lienzo fijo pasó lo mismo, y se deshizo. Van de 6 en 6, una instancia por grupo, con retoma y tope de 10 min por grupo. Probado a 1080p: 115 tomas en 13.1 min, y la segunda corrida no tuvo nada por hacer.
- **Fotos promo** (`paquetes-promo.mts`):
  - 02, más cerca;
  - 11, las etiquetas con placa oscura: el rojo del aplastamiento pasa de 4.0:1 a 6.5:1;
  - 15, el relieve ya no tapa la carretera curva (#271);
  - 16, la cámara en la calle a 2.4 m;
  - 18, A, B y el punto de choque en el cuadro;
  - 19, a t = −0.3, cuando la casa de la esquina ya no tapa a B.
- **El video de Unity** (`tools/unity/video-unity.mjs`, `video-unity-montar.mjs`, `video-unity-tarjetas.mjs`; paso `desde-release.ps1 -Paso video`):
  - **Casos:** AXA solo en la versión para CESVI; la pública usa el alcance inventado; el lateral en intersección va en las dos.
  - **Tomas por caso:** llegada, detrás de A (cámara lenta al final), el daño en cámara lenta y cenital hasta el reposo. Cuadro por cuadro a 60 fps en ultra, JPG.
  - **Montaje:** el ffmpeg de Remotion, H.264 sin música, con la tarjeta del logo al abrir y al cerrar; el logo de la esquina y la leyenda salen en cada cuadro.
  - **Salida:** 4K y 1080p de cada caso y de los dos juntos, en `croquis-video-unity.zip` en el Escritorio.
  - **Probado en la laptop a 1080p con tomas de 1 s:** 720 cuadros y los cinco videos en 12.4 min. La primera prueba dejó ver una cámara del daño tapada por un poste y una llegada tapada por una casa; las dos cámaras van ahora sobre la calle de A.
- **Visor de escritorio** (`Fotos.cs`): la textura de la foto se reusa, sale en JPG si el plan lo pide, con menos cuadros de asiento y con el logo del plan. El paquete nuevo es `fotos-promo-t4b.zip` en el release `rtx-t4`.

**Pendiente:** la causa de que la lluvia de noche a 4K frene el visor con cada toma; la RTX dirá con los fps por grupo si también le pasa.

La meta está en `docs/cesvi/PLAN-CESVI.md` §3.3. Decisiones: ADR 0112 (el escenario se calcula en TS) y ADR 0113 (recursos y materiales).

### Segunda pasada · punto 1: luz y color (2026-11-09)

- **Capturas para comparar** (del Editor, AXA y `lateral_interseccion`, día y noche, cinematográfica y acera): `docs/cesvi/u2/puntos/p0-antes/` y `docs/cesvi/u2/puntos/p1-luz/`.
- **Qué cambió:** exposición y color por ambiente, oclusión ambiental a escala de calle, sombra de contacto bajo cada vehículo, sonda de reflejos, noche legible (luz ambiente explícita, luna, niebla con tope, luminarias de caída suave con su charco de luz en el piso), y lluvia fina con salpicaduras. El detalle está en el ADR 0113.
- **El resplandor vuelve a estar encendido en WebGL.** Lo que quemaba la imagen eran pixeles sin número: primero por normales anuladas en caras dobles, y después por la sonda de reflejos con HDR, que en WebGL devuelve NaN (37.5 % de la captura en negro con HDR, 0.5 % sin él). En WebGL la sonda va sin HDR.
- **Medido al cerrar el punto** (`eval/results/unity_build.json` y `docs/cesvi/u2/puntos/p1-luz/fps-web.json`):

| Qué                                | Primera pasada | Punto 1     |
| ---------------------------------- | -------------- | ----------- |
| Peso del build                     | 61.3 MB        | 62.5 MB     |
| Con Brotli calidad 9               | 27.7 MB        | 28.4 MB     |
| Hasta que Unity arranca, a 20 Mbps | 12.9 s         | 13.1 s      |
| Hasta que AXA se ve                | 3.6 s más      | 3.7 s más   |
| fps a 1280 × 720, AXA de día       | 35.7           | 37.75       |
| fps a 1600 × 900, de día           | 20 a 27        | 20.8 a 26.3 |
| fps a 1600 × 900, de noche         | 12 a 21        | 11.4 a 17.2 |

- **La noche bajó de fps** (el mínimo era 12.3 y ahora es 11.4): la sonda, la oclusión más ancha y los charcos de luz cuestan. Sigue sin cumplir §7.8; los niveles son U5.
- **Ajustado después de este build, sin medir todavía:** los faros bajan de intensidad (a quemarropa tapaban el punto de contacto con un destello) y las gotas pegadas a la cámara tienen tope de tamaño. Se verifican en el build del punto 2.
- **Queda de este punto:** los cerros de noche salen como silueta negra (se atiende en el punto 5) y los reflejos en el asfalto mojado casi no se notan de noche.

### Segunda pasada · punto 2: calle mexicana (2026-11-09)

- **Capturas para comparar** (del Editor): `docs/cesvi/u2/puntos/p2-calle/`, contra `p1-luz/`.
- **Qué cambió:** en zona urbana, `cuadras.ts` arma las cuadras con la semilla de la escena, sobre los mismos corredores del croquis 2D: lotes pegados a la banqueta y entre sí (casas de 1 y 2 pisos, comercios con cortina, toldo y letrero sin texto, talleres con portón, baldíos con barda), casas remetidas con reja, herrería en ventanas, zaguanes, esquinas construidas, postes con cables y varias filas de cuadras de fondo, que Unity dibuja como volúmenes baratos. El suelo entre cuadras es grava, no pasto. La guarnición de las esquinas va pintada de amarillo.
- **Las cámaras ya no se meten en lo construido:** la cinematográfica busca el rumbo más cercano al de siempre desde el que el hecho se ve sin fachadas, copas ni postes en medio, y si no hay lugar sube como grúa.
- **Arreglo general:** `Malla.Cerrar` separa todo triángulo repetido en sentido contrario (caras dobles): eran la fuente de las piezas negras (toldos, discos de señales).
- **De día la niebla también tiene tope:** con lluvia, la vista cenital quedaba en blanco.
- **Medido al cerrar el punto** (`eval/results/unity_build_urbana.json`, escena `lateral_interseccion` de día, y `docs/cesvi/u2/puntos/p2-calle/fps-web.json`): 62.5 MB (28.4 MB con Brotli), 13.1 s hasta que Unity arranca, 4.3 s más hasta que el cruce se ve, 32.8 fps a 1280 × 720. A 1600 × 900: de 21.3 a 27 fps de día y de 12.7 a 18.5 de noche. El peso no cambió.
- **Falta volver a medir AXA** para `eval/results/unity_build.json` (sigue con la cifra del punto 1).
- **Queda de este punto:** rampas en las banquetas y juntas marcadas (hoy solo las da la textura).

### Segunda pasada · punto 3: suelo y desgaste, y las notas de René sobre el punto 2 (2026-11-09)

- **Capturas para comparar** (del Editor): `docs/cesvi/u2/puntos/p3-suelo/`, contra `p2-calle/`.
- **Desgaste de la calzada, con semilla:** rodadas por carril (`via.rodadas` en el contrato, por corredor: sirven con plantilla y con la red del mapa), grietas, parches de bacheo y manchas de aceite, como calcas pegadas al piso; rayas con la pintura gastada.
- **Regla forense:** ninguna grieta, parche o mancha procedural cae dentro del claro del hecho (el radio de la zona de interés del caso): una mancha inventada junto al impacto se podría confundir con una evidencia. Las rodadas sí pasan: son desgaste parejo del carril.
- **Suelo:** manchas grandes de tono y matas de pasto verdes y secas en zona rural; terracería con rodadas marcadas y baches.
- **Fachadas (nota de René):** molduras en puertas y ventanas, cornisa y remate del pretil, zoclo, escurrimientos bajo el pretil, los tinacos y las ventanas, y pintura descarapelada, todo con la semilla de la escena.
- **Calles de colonia (nota de René):** en zona urbana de plantilla, con dos carriles a lo más y sin rayas de carril declaradas en la escena, ya no hay raya blanca de orilla (`sinRayasDeOrilla`).
- **Corregido en el camino:**
  - La oclusión ambiental manchaba la pintura clara vista de cerca, como hollín. En un visor forense eso no puede pasar: el radio bajó a 0.18 m, con ruido de gradiente intercalado.
  - La cámara cinematográfica ya nunca se para sobre lo construido, a ninguna altura.
- **Medido al cerrar el punto** (`eval/results/unity_build.json` para AXA, `unity_build_urbana.json` para el cruce, y `docs/cesvi/u2/puntos/p3-suelo/fps-web.json`):

| Qué                                   | Punto 2     | Punto 3     |
| ------------------------------------- | ----------- | ----------- |
| Peso del build                        | 62.5 MB     | 62.1 MB     |
| Con Brotli calidad 9                  | 28.4 MB     | 27.9 MB     |
| Hasta que Unity arranca, a 20 Mbps    | 13.1 s      | 12.9 s      |
| Hasta que AXA se ve                   | sin medir   | 3.5 s más   |
| Hasta que el cruce urbano se ve       | 4.3 s más   | 5.1 s más   |
| fps a 1280 × 720, AXA de día          | sin medir   | 29.85       |
| fps a 1280 × 720, cruce urbano de día | 32.8        | 27          |
| fps a 1600 × 900, de día              | 21.3 a 27   | 16.1 a 24.4 |
| fps a 1600 × 900, de noche            | 12.7 a 18.5 | 10.9 a 15.2 |

- **La noche urbana bajó de 12 fps:** el cruce de noche da de 10.9 a 11.1 fps (antes 12.7). Se activa la regla de René: primero rendimiento, después más detalle.
- **Este build tardó 74 min** porque la laptop estuvo suspendida a la mitad; los demás tardan de 5 a 8 min.
- **Una prueba del contrato falló una vez por tiempo** (5.8 s con límite de 5 s) con la laptop cargada; sola pasa. Se confirma en CI.

### Ajustes que pidió René al aprobar U2 (2026-11-10)

René aprobó la segunda pasada con dos ajustes. Los coches chicos en la cinematográfica quedan para U4.

1. **`nocturno_lluvia` de noche se veía clara, el cielo como un atardecer.** Ahora:
   - el cielo nublado de noche va oscuro y gris azulado (exposición 0.4 y tinte), sin el naranja del resplandor del HDRI;
   - la niebla de lluvia es más oscura y el ambiente baja (1.1 en vez de 1.35 sobre la noche clara);
   - la exposición final pasa de 0.95 a 0.7.

   La luz fuerte es la de luminarias y faros. Vehículos, vía y evidencias se siguen leyendo.

2. **Los matorrales de AXA se veían como puntitos repetidos.**
   - Las matas de pasto van en manchones: cada uno con su radio, su tamaño (de 0.55 a 1.9 veces) y casi siempre un solo tono. Entre manchones queda pasto liso, y el total de matas es el mismo.
   - Los matorrales de la orilla van en grupos de 2 a 9 estirados a lo largo de la orilla, de 0.5 a 3.4 m (muchos chicos, pocos grandes), con alguno suelto entre grupos.

- **Antes y después:** `docs/cesvi/u2/ajustes/`.
- **Build:** 5 min, pico de Unity 2,528 MB y mínimo libre 315 MB. El peso no cambia (64.9 MB). Publicado en Blob con la huella `6337b65c1db3110f`.
- **La carga no se pudo medir.** La red estaba lenta (Blob a unos 230 KB/s) y el tiempo de carga incluye bajar los modelos: el cruce urbano dio de 5 a 37 s entre corridas. `eval/results` se queda con la medición anterior, y se mide otra vez con la red normal (pendiente).
- **Fps a 1600 × 900** (`docs/cesvi/u2/ajustes/fps-web.json`):

| Escena                       | Segunda pasada | Con los ajustes |
| ---------------------------- | -------------- | --------------- |
| `axa-dia`                    | 30.3           | 32.3 a 33.3     |
| `axa-noche`                  | 22.2           | 23.8            |
| `carambola-dia`              | 30.3           | 31.2 a 32.3     |
| `carambola-noche`            | 27             | 27              |
| `lateral_interseccion-dia`   | 27             | 23.3 a 23.8     |
| `lateral_interseccion-noche` | 23.3 a 25      | 20.8 a 22.7     |
| `nocturno_lluvia-dia`        | 32.3 a 33.3    | 29.4 a 31.2     |
| `nocturno_lluvia-noche`      | 27 a 27.8      | 25 a 26.3       |
| `terraceria-dia`             | 30.3           | 30.3            |
| `terraceria-noche`           | 24.4 a 25      | 20 a 20.4       |

### Resumen para René (segunda pasada, 2026-11-10)

**Qué quedó.** Los 5 puntos de la segunda pasada, en tu orden: luz y color, calle mexicana, suelo y desgaste, árboles y autopista con cerros. Las 20 capturas WebGL nuevas están junto a las del 2026-11-09 en `docs/cesvi/u2/segunda-pasada/lado-a-lado/` (antes a la izquierda, después a la derecha). Las nuevas, solas, están en `despues/`.

**Cómo probarlo.** `https://croquis-sage.vercel.app/visor-unity/medir.html` abre el build publicado (huella `c10ac1849189d3d7`) con AXA.

**Cifras** (build WebGL con la laptop libre, perfil «media»):

- **Peso:** 64.9 MB (31.2 MB con Brotli). Antes de la segunda pasada eran 61 MB (27.4). Los 3.9 MB de más son los atlas de los árboles a tamaño completo.
- **Arranque:** 14.2 s, antes 13. AXA carga en 3.4 s más y el cruce urbano en 4.3 s.
- **Fps:** la noche urbana queda en 23.3 a 25 fps a 1600 × 900, arriba de tus 12. Ninguna escena baja de 22.2.

**Qué necesito de ti.** Que veas las capturas lado a lado y me marques lo que no llegue a la vara.

### Segunda pasada · punto 5: autopista y cerros (2026-11-10)

El detalle está en ADR 0113, «Autopista y cerros».

- **Autopista** (solo cuando la vía trae acotamiento):
  - orilla de grava y tierra suelta fuera del acotamiento;
  - vialetas sobre las rayas (una en cada espacio de las discontinuas y una cada 12 m en las continuas);
  - reflejante ámbar en uno de cada tres postes de la defensa;
  - fantasmas donde no hay defensa;
  - un tablero verde genérico por sentido, sin texto, entre 90 y 150 m adelante del hecho;
  - matorrales a la orilla en tres follajes.
- **No hay vehículos inventados.** Nada de esto cae dentro del claro del hecho.
- **Cerros:**
  - ladera con pendiente y textura de pasto, tierra, monte y roca;
  - de noche se leen como laderas oscuras, ya no como silueta negra;
  - las dos texturas se hornean al preparar el proyecto.
- **Encontrado en el camino:**
  - **Niebla:** la de URP es global y no se apaga desde el material; por eso los cerros lejanos salían azules de día y negros de noche. Las capas lejanas se acercan, escaladas para conservar su tamaño aparente.
  - **`Mathf.SmoothStep`:** no es el `smoothstep` de los sombreadores, y las texturas de desgaste de los puntos 1 a 3 salían como cuadros parejos. Se corrigieron todas. La raya gastada solo se aclara: con huecos, una raya continua se leía discontinua.
- **Carga:**
  - En el primer build del punto 5, la carga del caso subió de 3.3 a 5.1 s en AXA y de 4.1 a 6.6 s en el cruce urbano. La causa era que las texturas de los cerros se generaban al cargar, una por capa.
  - Horneadas, la carga quedó en 3.4 y 4.3 s.
  - En ese primer build los fps también bajaron (cruce urbano de día, de 28 a 19-20). La medición empezó justo al terminar el build, con la laptop caliente: tras 4 min de pausa volvieron a su nivel.
- **Capturas:** `docs/cesvi/u2/puntos/p5-autopista/` (Editor).
- **Medido** (`eval/results/unity_build.json`, `unity_build_urbana.json` y `docs/cesvi/u2/segunda-pasada/fps-web.json`):
  - Peso: 64.9 MB, arranque 14.2 s.
  - A 1280 × 720: 43.5 fps en AXA de día y 42.6 en el cruce urbano de día.
  - Build: 11 min (la laptop se suspendió a la mitad), pico de Unity 1,924 MB y mínimo libre 667 MB.
- **Fps a 1600 × 900, con la laptop libre:**

| Escena                       | Punto 4     | Punto 5     |
| ---------------------------- | ----------- | ----------- |
| `axa-dia`                    | 30.3        | 30.3        |
| `axa-noche`                  | 21.7 a 22.7 | 22.2        |
| `carambola-dia`              | 27 a 27.8   | 30.3        |
| `carambola-noche`            | 27.8        | 27          |
| `lateral_interseccion-dia`   | 27.8 a 29.4 | 27          |
| `lateral_interseccion-noche` | 19.6 a 20.8 | 23.3 a 25   |
| `nocturno_lluvia-dia`        | 27 a 28.6   | 32.3 a 33.3 |
| `nocturno_lluvia-noche`      | 22.7 a 23.3 | 27 a 27.8   |
| `terraceria-dia`             | 26.3        | 30.3        |
| `terraceria-noche`           | 22.7        | 24.4 a 25   |

### Segunda pasada · punto 4: árboles como impostores (2026-11-10)

Antes, cada árbol eran tres tarjetas cruzadas: de cerca se veía la costura al centro de la copa y, al rodearlo, un árbol plano. Ahora es un impostor de 8 vistas horneadas en Blender desde el modelo CC0. El detalle y por qué no se usaron impostores octaédricos están en ADR 0113, «Árboles como impostores».

- **Horneado:** `node tools/unity/impostores.mjs` (Blender 5.2, de 2 a 4 min por especie), 8 vistas de 1024 px. Atlas en `tools/unity/arboles/` (7.6 MB los tres, en WebP), registrados en `assets/ASSETS.md`.
- **Corregido en el camino:** el pie del tronco brincaba de una vista a otra (ahora el horneado lo centra en el eje); otras copias del árbol en el archivo `.blend` se asomaban por la orilla del cuadro (ahora se esconden); una franja oscura al centro de la copa (el impostor ya no recibe la sombra de sus propias tarjetas); desde la cenital los árboles se veían acostados (ahora queda la tarjeta de planta); a la mitad de resolución, de cerca se veían manchas (el atlas entra completo también en WebGL).
- **La cámara de la acera** en `nocturno_lluvia` ya no queda pegada a una fachada: si junto al árbol no hay lugar, lo rodea hasta verlo sin estorbos.
- **Las matas de noche** ya no brillan de más: su material de noche va más apagado.
- **Capturas:** `docs/cesvi/u2/puntos/p4-arboles/` (Editor) contra `p3-suelo/`.
- **Medido** (build WebGL; `eval/results/unity_build.json`, `unity_build_urbana.json` y `docs/cesvi/u2/puntos/p4-arboles/fps-web.json`): peso 64.7 MB (31 MB con Brotli), antes 61 (27.4). Arranque 14.3 s, antes 13. AXA carga en 3.3 s más y el cruce urbano en 4.1 s. A 1280 × 720: 47.6 fps en AXA de día y 42.6 en el cruce urbano de día.
- **El peso sube 3.7 MB** por los atlas a tamaño completo. A la mitad pesaban la cuarta parte, pero se veían en manchas desde la acera. El build fue de 5 min, con pico de Unity de 2,103 MB y mínimo libre de 499 MB.
- **Fps a 1600 × 900, con la laptop libre:**

| Escena                       | Antes (verificación) | Con impostores |
| ---------------------------- | -------------------- | -------------- |
| `axa-dia`                    | 27 a 29.4            | 30.3           |
| `axa-noche`                  | 20 a 23.8            | 21.7 a 22.7    |
| `carambola-dia`              | 27.8 a 30.3          | 27 a 27.8      |
| `carambola-noche`            | 22.7 a 25.6          | 27.8           |
| `lateral_interseccion-dia`   | 24.4 a 25            | 27.8 a 29.4    |
| `lateral_interseccion-noche` | 19.6 a 20            | 19.6 a 20.8    |
| `nocturno_lluvia-dia`        | 30.3                 | 27 a 28.6      |
| `nocturno_lluvia-noche`      | 23.3 a 23.8          | 22.7 a 23.3    |
| `terraceria-dia`             | 27 a 27.8            | 26.3           |
| `terraceria-noche`           | 22.7                 | 22.7           |

### Segunda pasada · verificación en build con la laptop libre (2026-11-09)

Build WebGL de `main` (5 min 42 s; pico de Unity 2,380 MB, mínimo libre 462 MB), capturas de las 10 escenas y medición, sin navegador ni otra sesión abiertos.

- **Matas:** en WebGL ya salen verdes, con su recorte; no hay cuadros negros (AXA de noche).
- **Faros:** ya no tapan el punto de contacto con un destello (`lateral_interseccion` de noche).
- **Gotas:** finas, sin rayas gruesas junto a la cámara (`nocturno_lluvia` de noche).
- **Detalles nuevos, por corregir en esta rama:** de noche las matas brillan de más; en `nocturno_lluvia` la cámara de la acera queda pegada a una fachada.
- **Medido** (`eval/results/unity_build.json`, `unity_build_urbana.json` y `docs/cesvi/u2/puntos/verificacion/fps-web.json`): 61 MB (27.4 MB con Brotli), 13 s hasta que Unity arranca, 3.3 s más hasta que AXA se ve y 3.9 s más para el cruce urbano. A 1280 × 720: 45.5 fps en AXA de día y 37.75 en el cruce urbano de día.
- **Los fps anteriores estaban medidos con la laptop ocupada** (René la usaba con el navegador abierto). Con la laptop libre, a 1600 × 900:

| Escena                       | Con «media», laptop ocupada | Con «media», laptop libre |
| ---------------------------- | --------------------------- | ------------------------- |
| `axa-dia`                    | 22.7 a 26.3                 | 27 a 29.4                 |
| `axa-noche`                  | 14.9 a 19.2                 | 20 a 23.8                 |
| `carambola-dia`              | 20 a 21.7                   | 27.8 a 30.3               |
| `carambola-noche`            | 15.9 a 18.2                 | 22.7 a 25.6               |
| `lateral_interseccion-dia`   | 17.9 a 18.5                 | 24.4 a 25                 |
| `lateral_interseccion-noche` | 13.2 a 13.3                 | 19.6 a 20                 |
| `nocturno_lluvia-dia`        | 20.8 a 21.7                 | 30.3                      |
| `nocturno_lluvia-noche`      | 21.3 a 22.2                 | 23.3 a 23.8               |
| `terraceria-dia`             | 24.4 a 25                   | 27 a 27.8                 |
| `terraceria-noche`           | 18.2 a 18.9                 | 22.7                      |

- **La noche urbana queda en 19.6 a 20 fps,** con margen sobre los 12 de la regla de René. Para comparar punto contra punto hay que medir siempre con la laptop libre.

### Segunda pasada · perfil «media» para WebGL (regla de fps de René, 2026-11-09)

René pidió que, si al cerrar los puntos 3 a 5 la noche urbana bajaba de 12 fps en WebGL, se adelantara la parte de U5 que hiciera falta antes de agregar más detalle. Bajó al cerrar el punto 3 (10.9 a 11.1 fps en el cruce de noche).

- **Qué es «media»** (`Calidad.cs`; lo del pipeline lo fija `PrepararEscenario` según el destino del build): suavizado 2x en vez de 4x; sombras del sol en 2 cascadas de 2048 hasta 80 m, en vez de 4 de 4096 hasta 110 m; sin sombras de luces adicionales; 3 luminarias con luz real en vez de 6 (todas conservan su charco de luz pintado); un foco por vehículo en vez de dos; oclusión ambiental a media resolución; la mitad de las matas. No se quita ninguna función. «Alta» (escritorio) conserva todo.
- **fps a 1600 × 900 en WebGL** (`docs/cesvi/u2/puntos/p3-suelo/fps-web.json` contra `perf-media/fps-web.json`):

| Escena                       | Punto 3     | Con «media» |
| ---------------------------- | ----------- | ----------- |
| `axa-dia`                    | 22.2 a 24.4 | 22.7 a 26.3 |
| `axa-noche`                  | 10.9 a 13.7 | 14.9 a 19.2 |
| `carambola-dia`              | 18.9 a 20   | 20 a 21.7   |
| `carambola-noche`            | 13.7 a 15.2 | 15.9 a 18.2 |
| `lateral_interseccion-dia`   | 18.5 a 18.9 | 17.9 a 18.5 |
| `lateral_interseccion-noche` | 10.9 a 11.1 | 13.2 a 13.3 |
| `nocturno_lluvia-dia`        | 16.1 a 22.2 | 20.8 a 21.7 |
| `nocturno_lluvia-noche`      | 13.7 a 13.9 | 21.3 a 22.2 |
| `terraceria-dia`             | 20 a 20.4   | 24.4 a 25   |
| `terraceria-noche`           | 14.7 a 14.9 | 18.2 a 18.9 |

- **La noche urbana queda en 13.2 a 13.3 fps:** arriba de 12, con poco margen.
- **El día no mejoró.** A 1280 × 720 las mismas escenas dan cerca de 1.45 veces más fps que a 1600 × 900, con 1.56 veces menos pixeles: el límite de día son los pixeles, no las sombras ni el número de mallas. Si la noche urbana vuelve a bajar de 12 al cerrar el punto 4 o el 5, lo siguiente es la escala de render de «media».
- **Sigue sin cumplir §7.8** (media a 60 fps a 1080p en esta laptop): eso es U5 completo.
- **Defecto que solo se ve en el build:** en WebGL las matas de pasto salían como cuadros negros. Se copiaba la tarjeta de árbol y se le quitaba la normal en ejecución, y el build no traía esa variante del sombreador. Ya tienen su material base (`mata`) como asset. **El arreglo compiló, pero no se ha visto en un build:** lo paró la falta de memoria.
- **Las capturas del Editor ahora salen en «media»** cuando el destino es WebGL, para ver lo mismo que el build.

### Resumen para René (primera pasada, 2026-11-09)

- **Capturas:** `docs/cesvi/u2/capturas/`, 20 imágenes del build WebGL en esta laptop, a 1600 × 900, en el instante 0.4 s después del impacto. Son las 5 escenas de D1 (AXA, `lateral_interseccion`, `nocturno_lluvia`, carambola y terracería), cada una de día y de noche, con la cámara cinematográfica y la de la acera.
- **Qué quedó:**
  - **Vía:** asfalto PBR, mojado cuando llueve, charcos, banquetas y camellones con altura, guarniciones, barreras de dos ondas y rayas.
  - **Cielo y luz:** cielo HDRI girado al sol del hecho, sombras suaves, oclusión ambiental y tono de cine. De noche, luminarias y faros que iluminan el piso.
  - **Entorno procedural:** edificios con ventanas, cortinas, toldos, pretil, tinacos y varillas; árboles, palmeras, postes con cables, cercas, señales, cerros y perfil urbano. La leyenda dice que no es el lugar real.
  - **Del caso:** vehículos con el color del caso, luces de freno cuando frenan y faros de noche; semáforos con su luz en el tiempo; objetos colocados; huellas que aparecen con el tiempo; manchas; vidrios y restos; marcadores de C1 (primer golpe, choques intermedios y puntos de paso), con el mensaje `marcadores` del puente para ocultarlos.
  - **Terreno de C3:** zonas de otra superficie, ondulación y topes, sobre una función de altura. El escenario entero se arma sobre ella.
  - **Cámaras:** cinematográfica y de acera (junto al árbol más cercano). El puente pasa a 1.1.0.
- **Lo que no convence todavía** (mi lectura de las capturas, antes de la tuya):
  - **Los árboles de cerca se notan como tarjetas cruzadas,** con una costura vertical al centro.
  - **Los edificios son cajas:** les faltan volúmenes, balcones, puertas distintas y suciedad.
  - **El pasto es un plano con textura:** sin matas ni variación; en la autopista de AXA el campo se ve vacío.
  - **Los cerros** se leen, pero como siluetas lisas y pálidas.
  - **De noche** las luminarias queman el piso cerca del poste y el resto queda muy oscuro.
  - **Sin desgaste:** el asfalto y las rayas no tienen rodadas, parches ni grietas.
- **Provisional hasta W5:** el solver todavía no entrega altura, cabeceo ni alabeo, así que en la escena de terracería el vehículo se posa sobre el piso dibujado. Su x, su y y su rumbo son los del `Resultado`. Esa escena es el alcance canónico con un terreno agregado para las capturas; la definitiva la deja W5 en `fixtures/`.
- **Lo que necesito de ti:** ver las capturas y decirme qué corregir primero.

### Cifras (`eval/results/unity_build.json` y `docs/cesvi/u2/capturas/fps.json`)

Unity 6000.3.28f1, esta laptop (i5-10210U, 8 GB, sin tarjeta de video dedicada), Chromium.

| Qué                                | U1 (sin escenario) | U2 (con escenario) |
| ---------------------------------- | ------------------ | ------------------ |
| Peso del build                     | 41.7 MB            | 61.3 MB            |
| Con Brotli calidad 9               | 10.7 MB            | 27.7 MB            |
| Hasta que Unity arranca, a 20 Mbps | 5.4 s              | 12.9 s             |
| Hasta que AXA se ve                | 2.2 s más          | 3.6 s más          |
| fps a 1280 × 720, AXA de día       | 58.8               | 35.7               |

- **fps a 1600 × 900, con el caso quieto:** de 20 a 27 de día y de 12 a 21 de noche, según la escena.
- **No cumple §7.8 de `PLAN.md`.** Todavía no hay niveles de calidad: todo corre con lo de alta (sombras de 4096 en 4 cascadas, MSAA 4x, oclusión ambiental, 8 luces por objeto). Los niveles son U5; ahí se recorta densidad en media, no función.
- **El escenario en el paquete:** de 211 a 324 KB sin comprimir.
- **Tiempo del build:** 27 min el primero con los recursos nuevos; de 5 a 6 min los siguientes.

### Memoria de los builds de U2

| Paso                      | Duración | Pico de Unity    | Mínimo libre |
| ------------------------- | -------- | ---------------- | ------------ |
| Primer build con recursos | 27 min   | 2,770 MB         | 550 MB       |
| Build de diagnóstico      | 6 min    | 2,627 MB         | 354 MB       |
| Builds siguientes         | 5 min    | 2,168 a 2,852 MB | 350 a 523 MB |

Con `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` y sin nada más abierto, todos terminaron.

### Lo que se encontró

- **En WebGL el resplandor (bloom) quema toda la imagen en blanco.** En el editor no pasa. Se confirmó con un build de diagnóstico que apaga una cosa a la vez (`depurar` en el puente, fuera del contrato): sin resplandor, el build se ve igual que el editor. Queda apagado solo en WebGL; se revisa en U5.
- **Un renderer de URP creado por código nace sin datos de posproceso:** sin ellos no había tono de cine. Se le asignan en `PrepararEscenario`.
- **URP quita del build los modos de niebla que ninguna escena usa:** la escena se guarda con niebla encendida.
- **Una cara doble que comparte vértices sale negra:** sus normales se anulan. Así salía el tope; `Malla.Cuadro` ahora duplica los vértices.
- **La cámara de la acera** elige, entre 12 lugares junto al árbol, el que queda fuera de los edificios y más lejos de postes y luminarias.
- **Las cajas salían con las caras al revés** cuando su segundo eje venía de `Cross(up, eje)`: `Malla.Caja` lo corrige sola.
- **Los enums de quicktype cambian de nombre** («IndecentTipo») cuando cambia el esquema: los del escenario llevan `title` para que queden fijos.

### Cómo repetirlo

1. `node tools/unity/recursos.mjs` (trae los recursos, fuera de git).
2. `pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-d1.ts` (los 10 paquetes, en `apps/visor-unity/Build/casos/`).
3. Para iterar: `Unity.exe -batchmode -projectPath apps/visor-unity -buildTarget WebGL -executeMethod Croquis.EditorTools.Capturas.Tomar -casos <Build/casos> -salida <carpeta> -logFile <log>` (unos 3 min).
4. Para René: `powershell tools/unity/build-web.ps1`, `node tools/unity/capturas.mjs` y `node eval/unity_build.mjs --caso axa-dia`.

### Falta de U2

- Medir otra vez la carga del build con los ajustes cuando la red esté normal (el 2026-11-10 Blob iba a unos 230 KB/s).
- Rampas en las esquinas de las banquetas y juntas marcadas (hoy solo las da la textura): quedó del punto 2.
- Las vialetas miden lo de verdad (10 cm): de noche se ven cerca de la cámara, pero a más de 30 m no.
- Los impostores cambian de vista cada 45°: se nota solo al orbitar despacio junto a un árbol. Mezclar vistas pide un sombreador propio (U5).
- La red vial de OpenStreetMap: el escenario ya la toma si la escena la trae, pero ninguna de las 5 escenas la trae y no se ha visto.
- Medir Blob y dejar solo los 2 últimos builds (hoy hay uno publicado, el de U1).
- Las pruebas EditMode del escenario dentro de Unity.

## U3 · Personas y daño (2026-11-10)

Plan: PLAN-CESVI §3.3. Decisiones: ADR 0114.

### Qué se hizo

- **Personas con trayectoria** (peatones, ciclistas y motociclistas): siguen su trayectoria del `Resultado` con la postura de su fase (caminando, de pie, sentada sobre la moto, en vuelo y tendida).
- **Ocupantes:** sentados en su asiento, se desplazan lo que dio el solver desde el impacto. Sin cinturón declarado van las dos variantes; la segunda, como maniquí naranja.
- **Los cuerpos son los de MakeHuman (CC0) del visor web,** con los mismos colores por persona. Se cargan del sitio (`/modelos/personas/`) y se pintan por región leyendo `_REGION` del .glb. Si no bajan, un maniquí de piezas.
- **Vehículos estacionados** con el modelo de su clase (antes, una caja de tabique: se veía en el peatón del cruce).
- **El daño con `perfil_m`:** el algoritmo (`CampoDano`) estaba desde U1, con su prueba de tolerancia (2 cm o 6 %) en CI, pero el visor no lo aplicaba al dibujar (auditoría del 2026-11-15, C2). Se corrigió en U8 (ADR 0117).
- **La volcadura no se dibuja:** es un límite del solver, no del visor. El `Resultado` no trae el alabeo en el tiempo y en la escena de referencia el vuelco no se inicia (velocidad lateral 9.74 km/h contra 19.77 km/h crítica). Está en el README y en «Endurecimiento pendiente» (René, 2026-11-10).

### Pruebas (núcleo, `dotnet test` en CI)

- `PersonasTests.cs`: la pose de cada persona en cada muestra es la del `Resultado` (menos de 1 cm); la postura sigue la fase; el motociclista va sobre su moto hasta el impacto; el ocupante va en su asiento y su desplazamiento es el del solver; con cinturón declarado se dibuja solo esa variante.
- `CuerposTests.cs`: el hash de colores es el del visor web (valores de Node); las regiones salen del .glb real; los triángulos se reparten por región.

## U4 · Cámaras y encuadre (2026-11-10)

### Qué se hizo

- **Cámaras:** cenital, órbita, cinematográfica, acera, la de cada conductor y la libre.
- **Ratón y dedos:** la órbita gira con el arrastre, se desplaza con el botón derecho o dos dedos y acerca con la rueda o el pellizco; la cenital se desplaza y acerca; la libre gira, avanza con la rueda y con las flechas o WASD.
- **«Ver todo» e «Ir al impacto»:** la misma caja que en 2D (W6). «Ver todo» desde la cinematográfica, la acera o un conductor pasa a la órbita y se lo dice a la web.
- **La cinematográfica encuadra los vehículos en el instante:** ya no salen chicos (lo pidió René al aprobar U2).
- **El conductor** ve a la altura del ojo de `visibilidad`, desde su asiento; en dos ruedas, al centro. No se dibuja lo que está a menos de 0.75 m del ojo (el volante del modelo genérico tapaba el camino) y se esconden los ocupantes de su vehículo.
- **Minimapa** abajo a la derecha, con «Ver todo», el norte arriba y una flecha donde está la cámara; sin niebla (en lluvia solo se veía su color) y escondido en la cenital.
- **El puente no cambió:** `orbita`, `libre`, `encuadrar todo` e `impacto` ya estaban en el contrato.

### Pruebas

- **Núcleo (`dotnet test`, CI):** «Ver todo» deja en cuadro las poses finales, el fin de cada trayectoria, el impacto y los marcadores en los 22 paquetes; a la distancia de la lente la caja cabe justa; la caja de los vehículos en un instante los contiene. En total, 25 pruebas.
- **e2e de cambio de cámaras** (`tools/unity/e2e-camaras.mjs`, sobre el build WebGL, fuera de CI): 19 comprobaciones en verde con el motociclista. Cada cámara contesta `camara` con su modo y se ve distinta; «Ver todo» pasa a la órbita; «Ir al impacto» cambia la vista; el minimapa está en su esquina y se esconde en la cenital; una cámara que no existe contesta con error; sin errores en la página.

### Cifras del build (`eval/unity_build.mjs`, AXA, mediana de 3 corridas, laptop)

|               | Antes (U2, 14:31) | Después (U3 y U4)                  |
| ------------- | ----------------- | ---------------------------------- |
| Peso          | 64.9 MB           | 65.0 MB                            |
| Brotli q9     | 31.2 MB           | 31.2 MB                            |
| Hasta `listo` | 14.2 s            | 14.4 s                             |
| Caso cargado  | 3.4 s             | 4.8 s (corridas: 4.8, 2.8 y 5.7 s) |
| fps p50       | 43.5              | 58.8                               |

- **El peso casi no cambió.** Los cuerpos no van en el build: se bajan del sitio.
- **La carga del caso varía mucho entre corridas** (2.8 a 5.7 s); AXA no tiene personas, así que no es la descarga de los cuerpos.
- **Los fps subieron sin una causa en el código:** entran en el ruido térmico que ya se registró (±6 fps) y no se atribuyen a U3 ni a U4. El costo del minimapa, que dibuja la escena dos veces, se mide en U5.

### Resumen para René (U3 y U4)

**Qué quedó.**

- **Personas:** el peatón cruza caminando, sale volando sobre el cofre y queda tendido; el motociclista va sobre su moto y sale proyectado. Son los cuerpos de MakeHuman del visor web, con ropa neutra.
- **Ocupantes:** van en su asiento y se mueven lo que calcula el solver. Si no se sabe si llevaba cinturón, se ven las dos variantes.
- **Vehículos estacionados:** el camión estacionado del peatón ya es un camión.
- **Cámaras:** todas se mueven con el ratón y los dedos, con «Ver todo», «Ir al impacto» y un minimapa. En la cinematográfica los coches ya llenan el cuadro.
- **Conductor:** ve desde su asiento, a la altura de ojo que usó el análisis de visibilidad.
- **La volcadura no está:** el solver todavía no la calcula en el tiempo. Quedó dicho en el README como límite del solver.

**Cómo probarlo.** El build está en `apps/visor-unity/Build/web` (sin publicar en Blob: se publica al integrar en U6). Con `node tools/unity/e2e-camaras.mjs` se abre el motociclista y se recorren todas las cámaras.

**Capturas** (del build WebGL):

- `docs/cesvi/u3/`: peatón, motociclista y alcance (ocupantes), con la cinematográfica, en t = −1, 0.3 y 3 s.
- `docs/cesvi/u4/`: cada cámara (`camara-*.webp`), «Ver todo», «Ir al impacto», el minimapa y la cenital sin minimapa.

**Qué necesito de ti.** La computadora con tarjeta de video para medir alta y ultra en U5.

### Falta de U4

- **El vidrio trasero** de algunos modelos refleja la fachada de enfrente (la sonda de reflejos, desde U2): con fachadas de colores vivos, de lejos parecen bandas de color dentro del vehículo.
- **En el sedán, la vista del conductor** deja ver el cofre por dentro del corte de 0.75 m: se lee, pero no es bonito.
- **Las flechas del teclado** mueven la cámara libre; en la órbita y la cenital todavía no.
- **El paso de los peatones** es un balanceo de piernas, no una animación de marcha.
- **Corregido (2026-11-11): el brazo de un ocupante salía por la ventana** de la camioneta V2 en `lateral_interseccion`. Tenía dos causas: el cuerpo iba a la altura de cadera de un sedán (0.52 m) también en una camioneta, y el ancho de una de doble rodada es el de sus salpicaderas. Ahora la cadera va a la altura del asiento de su clase (`Personas.AlturaCadera`, ilustrativa: 0.86 m en una camioneta) y el cuerpo nunca pasa de 0.6 m del eje. Captura del editor: `docs/cesvi/u4/ajustes/conductores/lateral-ocupante-en-cabina-editor.webp`.

## U8 · El daño del solver en Unity y los controles del 3D (auditoría del 2026-11-15, Tanda 2)

**Estado: cerrada (2026-11-15).** Código en `main` (#230, ADR 0117) y build web con el daño publicado (huella `e06bdd73b0ce3706`).

### Qué se hizo

- **El daño (C2):** el visor deforma la carrocería con el perfil de aplastamiento del `Resultado`. Lo que se puede probar sin Unity está en `Croquis.Core/DanoDelCaso.cs`; `Visor/DanoVista.cs` prepara la malla deformada al armar el vehículo y `VehiculoVista.Colocar` la muestra desde su impacto.
- **Los controles (I3):** barra de reproducción en `<VisorUnity>` (reproducir, deslizador, ¼× ½× 1×, «Ir al impacto», «Ver todo», «Repetir»). Funciona con el build publicado: usa mensajes del puente que ya existían.
- **La leyenda (§2.3):** va también en un caso sin escenario. `medir.html` ya no se publica.

### Evidencia

- `dotnet test apps/visor-unity/tests/Croquis.Core.Tests -c Release`: 66 de 66.
- Unity 6000.3.28f1 en modo batch en la laptop (`-runTests -testPlatform EditMode`): compila sin errores y pasan 6 de 6 (3 nuevas, `DanoEnUnityTests`). Tardó menos de 2 minutos y no quedó ningún proceso de Unity vivo.
- Web: `reproduccion.test.ts` y `barra-reproduccion.test.tsx`, tipos y lint.

### El build con el daño (2026-11-15)

- **Dónde se compiló:** en la laptop, como los builds anteriores (`tools/unity/en-tarea.ps1 -Nombre build-web`), con el equipo libre y Edge cerrado. Tardó 7.1 minutos, terminó con código 0 y no quedó ningún proceso de Unity vivo. El plan de la auditoría lo ponía en la computadora del colaborador; publicar necesita el token que solo está aquí, así que se hizo aquí (decisión técnica, anotada en el ADR 0117).
- **Comprobado antes de publicar:** `node tools/unity/e2e-camaras.mjs` sobre el build, todo en verde y sin errores en la página.
- **Publicado:** `node tools/unity/publicar-web.mjs`, sin podar: el build anterior (`abbbeec49fbae3c6`) sigue en Blob y se regresa a él con solo restaurar `apps/web/public/visor-unity/manifest.json`.
- **Comprobado en producción** (2026-11-15, `CROQUIS_URL=https://croquis-sage.vercel.app` con `playwright.produccion.config.ts`): el flujo completo pasa en 51 s; Unity queda listo en 11.8 s. Capturas en `docs/cesvi/u6/produccion/` y cifras en `eval/results/u6_flujo_unity_produccion.json`.
- **Medido** (`node eval/unity_build.mjs --caso axa-dia` → `eval/results/unity_build.json`; mediana de 3 corridas, navegador nuevo y sin caché, 20 Mbps): 69.4 MB (31.2 MB con Brotli), 12.7 s hasta que Unity arranca y 8.9 s más hasta que se ve el caso. Sin errores.
- **No se volvió a medir:** los fps de la E6 (`e6_unity_media.json` es del build anterior). El daño se prepara al armar el vehículo y no trabaja en cada cuadro, pero eso no sustituye a la medición.

### Resumen para René

- **Qué quedó:** en el 3D de producción, cada vehículo se ve sin deformar hasta su primer impacto y deformado después, con el perfil de aplastamiento que calculó el solver. Unity no calcula nada.
- **Qué vas a ver en AXA:** la parte trasera de la pickup golpeada queda hundida unos 18 cm y el frente de la otra, unos 5 cm. Es lo que da el solver: un perfil estimado, parejo en todo el ancho. Por eso el cambio es discreto y no una lámina arrugada. Si el perito captura las medidas C1–C6, el 3D las sigue.
- **Capturas** (del build publicado, nivel alta, 1600 × 900; `docs/cesvi/u8/capturas/`):
  - antes del impacto: `axa-dia-t-1-cerca-veh-b-200-6-1.6.webp` y `axa-dia-t-1-cerca-veh-a-20-6-1.6.webp`;
  - a 3 s: `axa-dia-t3-cerca-veh-b-200-6-1.6.webp`, `axa-dia-t3-cerca-veh-a-20-6-1.6.webp` y `axa-dia-t3-cinematica.webp`;
  - en el impacto: `axa-dia-t0.4-cinematica.webp`; de noche: `axa-noche-t3-cerca-veh-b-200-6-1.6.webp` y `axa-noche-t3-cinematica.webp`.
- **Cómo probarlo:** <https://croquis-sage.vercel.app/cesvi>, caso de AXA, «Ver en 3D», y mover el deslizador de antes a después del impacto.
- **Lo que se nota en las capturas y no es del daño:** de noche, a 3 s, los faros del vehículo de atrás queman de blanco la caja de la pickup de adelante.

### Pendiente

- **El paquete del colaborador de la Tanda 2** (decisión 9): las 15 tomas del modo foto (visor de escritorio, que también hay que compilar con el daño) y el recorrido de la app en producción.
- **Volver a medir los fps** con este build (E6) en la laptop y en la computadora de demo.
- La sombra unida de baja y media no sigue al daño.
- La barra de reproducción tapa una esquina del minimapa en la vista de órbita (se ve en `docs/cesvi/u6/produccion/1-reconstruccion-unity.png`).
- **La leyenda del 3D con recuadro** (René, 2026-11-15): texto blanco opaco sobre un recuadro del color de fondo de la app al 78 % (`Croquis.Core/Leyenda3d.cs`, que prueba con `dotnet test` el contraste WCAG: más de 10:1 con blanco puro detrás). Medido en capturas del build `d18f1f3aebbfe08c` (`docs/cesvi/demo/leyenda/antes` y `despues`): antes, 2.64:1 sobre techos claros en órbita y 4.24:1 en la escena urbana de día; después, de 4.87 a 7.42:1 en las siete capturas (la medición incluye los bordes suavizados de las letras, así que se queda corta). Build de 7.4 min en la laptop; e2e de cámaras en verde.
- **La nota bajo el 3D dice qué velocidad es** (René, 2026-11-15): «A · Silverado 2500 (V1) al salir del impacto: Croquis 31 km/h · CESVI 60.27 km/h por los restos (desplazamiento) · −29 km/h (−48 %)» y «B · Tacoma (V2) antes del impacto: Croquis 57 km/h (55–78) · CESVI 63.15 km/h de barrera equivalente por la deformación (EBS) · −6 km/h (−10 %)», con el nombre del panel; Presentar y la tabla del dictamen nombran igual (#246). Ensayo de los tramos 1a a 1e en producción antes y después: `docs/cesvi/demo/nota/antes` y `despues`, `eval/results/ensayo_demo_nota.json` (5 de 5, sin errores de página).

## Ajustes de René antes de U5 (2026-11-10)

Conductor sin la carrocería propia (contorno tenue del cofre y los postes), vidrio propio sin el reflejo de la sonda, moto tendida desde el impacto con «Posición final ilustrativa», camisas que nunca son color piel, el ocupante dentro de la cabina y la cinematográfica que se acerca si una fachada la tapa. ADR 0114, decisiones 12 a 15. Capturas del build WebGL en `docs/cesvi/u4/ajustes/` (conductores en AXA y `lateral_interseccion`; vidrios en las 5 escenas de día y de noche; personas a los 3 s). PR #205.

## U6 · Puente, builds e integración (cerrada el 2026-11-12)

Rama `feat/u6-integracion`. Decisiones: ADR 0116.

### Plan

1. **Contrato 1.2.0** (PR `contract:` aparte, antes que lo demás): vista `antes` de `capturar` y `herramienta` de `modoEdicion`.
2. **Unity:** `capturar` (`Captura.cs`), modo edición (`EditorEscena.cs`, `Croquis.Core.Edicion` con pruebas), abrir un paquete en el escritorio (`Escritorio.cs`).
3. **Web:** `PuenteUnity` (`lib/visor-unity/puente.ts`), `paqueteDelCaso`, `<VisorUnity>` con respaldo three.js, `<VisorCasoUnity>` en el caso (notas, barra de edición, «Descargar paquete 3D»), ediciones al expediente (`lib/visor-unity/edicion.ts`), fotos y créditos del dictamen desde Unity, Unity detrás de Presentar.
4. **Builds:** `publicar-web.mjs --podar` (dos builds en Blob), paquete de escritorio con caso de ejemplo y su release de GitHub.
5. **Pruebas:** unitarias de `puente`, `edicion` y `Croquis.Core.Edicion`; e2e `visor-unity.spec.ts` (`@flujo`) con un Unity de mentira.
6. **En producción:** publicar el build 1.2.0 en Blob, fusionar y revisar a mano: Unity en Reconstrucción, Análisis y Presentar; mover un poste en 3D; fotos del dictamen; respaldo con `?visor=ligero` y en un navegador sin WebGL 2. Capturas para René.

### Hecho (2026-11-12)

- **Contrato 1.2.0** fusionado (#207), con el campo `punto` de `puntoMarcado` (el `tipo` chocaba con el del mensaje).
- **Unity:** fotos del dictamen (`Captura`), modo edición (`EditorEscena`, `Croquis.Core.Edicion`), abrir un paquete en el escritorio (`Escritorio`), y la cinematográfica que busca vista libre.
- **Web:** `<VisorUnity>` y `<VisorCasoUnity>` en Reconstrucción y Números (el mismo panel) y detrás de Presentar; respaldo three.js; ediciones al expediente; fotos y créditos del dictamen desde Unity; «Descargar paquete 3D»; el entorno procedural deja libre lo que recorre el caso.
- **Build publicado en Blob:** huella `01fce868922703fd` (`apps/web/public/visor-unity/manifest.json`). `publicar-web.mjs --podar` listaría para borrar dos builds viejos sin uso (`2d5c1a20a446c129`, 41.7 MB; `c10ac1849189d3d7`, 65.0 MB); no los borré: no se deshace y la decisión es de René.

### Pruebas (2026-11-12)

- `dotnet test`: 53 en verde (con `EdicionTests` y `EscalaAutomaticaTests`).
- Web: tipos y lint en verde; unitarias de `lib/visor-unity` (12) y `components/visor-unity` (10).
- e2e `visor-unity.spec.ts` (`@flujo`, Unity de mentira): 2 en verde en local (mover el poste en 3D recalcula y vuelve a Unity; fotos del dictamen desde Unity; respaldo con otra versión del puente).
- **e2e con el Unity real** (`visor-unity-real.spec.ts`, a mano, Chromium con ventana y la GPU de la laptop): en verde. Unity listo en unos 30 s; el poste se arrastra con el ratón en la cenital, el caso se recalcula (60.62 → 60.35 km/h) y vuelve a Unity; las tres fotos del dictamen salen de Unity y son distintas; Presentar muestra Unity. Corrí la prueba cinco veces: las tres primeras encontraron los problemas del punto 9 de ADR 0116, que se corrigieron. Lo medido, en `eval/results/u6_flujo_unity_real.json`; las capturas, en `docs/cesvi/u6/real/`.

### En producción (2026-11-12)

- **#208 fusionado**; producción sirve el build `01fce868922703fd`.
- **La prueba del flujo completo con el Unity real, contra el sitio publicado** (`playwright.produccion.config.ts`, Chromium con la GPU de la laptop): en verde. Unity listo en 46 s (bajando el build de Blob por primera vez); el poste arrastrado en 3D recalcula (60.62 → 60.35 km/h) y vuelve a Unity; las tres fotos del dictamen salen de Unity; Presentar muestra Unity detrás de la historia. Capturas en `docs/cesvi/u6/produccion/`; lo medido, en `eval/results/u6_flujo_unity_produccion.json`.
- **El respaldo:** lo prueba la e2e de CI (otra versión del puente abre three.js) y `?visor=ligero` lo abre a mano.
- **El visor de escritorio** con su caso de ejemplo: release `visor-escritorio-u6` (60 MB). Probado en esta laptop: abre AXA y lo reproduce en bucle.

### Medición del build web en la computadora de demo (punto 3 de René, 2026-11-12)

La demo puede ser dentro de Croquis, así que hay que medir el visor en el navegador en la misma computadora (RTX 4070 Laptop) donde se midió el programa de escritorio.

- **`/visor-unity/medir-e6.html`** (en el sitio): una medición E6 por visita (escena, nivel, segundos y repetición en la dirección). Baja el build y la escena de Blob, fija el nivel, reproduce en bucle con la cinematográfica, espera 3 s (y en media a que la escala se asiente), mide los tiempos de cuadro y descarga el resultado.
- **`tools/unity/medir-web.ps1`**: abre Chrome nuevo por medición (10 escenas × alta y ultra × 3, en orden alterno), en pantalla completa y sin vsync, con un perfil propio (el build sale de la caché después de la primera vez). Reanudable. Mientras mide pone «Alto rendimiento» y le pide a Windows que Chrome use la tarjeta dedicada; al terminar restaura los dos. Escribe `e6_unity_web_demo.json`.
- **Las escenas de D1 viven en Blob** junto al build (`casos/`) y el manifiesto las lista (`casos`); `publicar-web.mjs` las sube.
- **Probado en esta laptop** contra un servidor local (una repetición en alta de las 10 escenas): de punta a punta en verde, con plan y preferencia de GPU restaurados al final. Con la Intel UHD, alta da de 6 a 11 fps (no es la meta: alta y ultra son para la computadora de demo).
- **El paquete:** `tools/unity/paquete-medicion-web.ps1` → release `visor-web-medicion`.

### La carga del 3D: de 46 s a … (René, 2026-11-12)

René midió unos 46 s desde Blob, contra unos 14 s de las mediciones anteriores (`medir.html`, que no corre el solver). El tiempo se mide desde el clic en «Órbita 3D» hasta que Unity muestra el caso, con un navegador sin caché (primera visita), con `e2e/visor-unity-real.spec.ts` y sus marcas (`unity:*` del lado web y `depurar` `carga` dentro de Unity).

**Por qué tardaba:**

| Paso                                | Antes              | Por qué                                                                                                                                                                                                             |
| ----------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bajar el build                      | dentro de los 46 s | Unos 40 MB comprimidos (`.data` 28.5 MB y `.wasm` 11 MB con brotli; Blob los sirve comprimidos y con un año de caché). Unity no empezaba a bajarlos hasta abrir el 3D, y la red de la laptop da de 0.4 a 0.65 MB/s. |
| Solver completo, solo para el 3D    | 10.8 s             | Se esperaba a Monte Carlo, inversión y consistencia, que Unity no dibuja.                                                                                                                                           |
| Leer el paquete en Unity            | parte de unos 7 s  | Se leía tres veces completo (el sobre, la versión y el paquete).                                                                                                                                                    |
| Armar el caso (modelos y escenario) | 1.7 a 6.5 s        | Los modelos de los vehículos se bajan de Blob; varía con la red.                                                                                                                                                    |
| El primer cuadro                    | 5.9 s              | Compilar los shaders de la escena y subir sus texturas.                                                                                                                                                             |

**Lo que se cambió:**

1. **Unity carga con la reconstrucción** (las mismas trayectorias y eventos que el resultado completo, en 20 a 58 ms en lugar de 1.2 a 7.2 s). El resultado completo llega después y solo cambia el paquete que se descarga.
2. **El caso baja el visor de fondo** desde que se abre (el build, los cuerpos y los modelos de sus vehículos), y Unity arranca con esas copias. El primer intento bajaba el `.data` dos veces a la vez (84 s): ahora Unity espera la descarga que ya está en curso.
3. **El paquete se lee una vez:** el sobre y la versión, con un lector en flujo que se detiene al encontrarlos (pruebas `PaqueteTests`).
4. **El primer cuadro no se puede quitar**, pero ya no se espera: Unity carga el caso de fondo desde que termina la reconstrucción, con el 3D oculto, mientras el perito lee la cifra.

**Medido (primera visita, sin caché):**

| Dónde                                                        | Clic al 3D al terminar la reconstrucción | Desglose                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Producción, antes                                            | 46.4 s                                   | (sin marcas)                                                                                    |
| Local, build local, antes                                    | 21.5 s                                   | arranque 3.4, solver 10.8, cargar el caso 6.9                                                   |
| Sitio local con el build de Blob, con la precarga compartida | 18.9 s                                   | esperar el resto de la descarga 4.6, arranque 2.5, solver 0, cargar 10.5                        |
| Local, build local, con la lectura única                     | 12.6 s                                   | arranque 2.4, solver 0, leer el paquete 0.6, armar el caso 2.35, primer cuadro y aviso el resto |

**En producción, después (#210, build `f12372a6c2d7742c`, primera visita sin caché, red de la laptop de desarrollo):**

| Cuándo se abre el 3D          | Hasta ver el caso    | Desglose                                                                                                                                                                    |
| ----------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Al terminar la reconstrucción | 36.4 s (antes 46.4)  | esperar el resto de la descarga 24.6, arranque 2.4, solver 0, leer el paquete 0.5, armar el caso 3.3, primer cuadro 4.4 (`eval/results/u6_carga_produccion_inmediato.json`) |
| 20 s después                  | 35.7 s desde el clic | la descarga completa tardó más de 1 min (`eval/results/u6_carga_produccion_pausa20.json`)                                                                                   |

- **Lo que queda es la red:** en esta conexión (de 0.4 a 1 MB/s) bajar 40 MB toma de 40 s a más de 1 min. Lo demás ya es de unos 10 s (arranque, lectura, armado y primer cuadro).
- **Primera y segunda visita, con el build más ligero** (#212, build `dc9c30121a648d63`; 2026-11-12, de noche, con «ya cerré todo» de René): `tools/unity/carga-cadena.ps1` (tarea de Windows, fuera de la sesión) → `eval/results/u6_carga_segunda_visita.json`, 3 repeticiones contra producción, cada una con un perfil de Chrome nuevo con caché en disco, como el navegador de la demo:

  | Repetición | Primera visita (sin caché) | Esperar la descarga | Segunda visita (build en la caché) |
  | ---------- | -------------------------- | ------------------- | ---------------------------------- |
  | 1          | 28.7 s                     | 13.1 s              | 7.8 s                              |
  | 2          | 15.7 s                     | 2.2 s               | 15.0 s                             |
  | 3          | 14.9 s                     | 2.0 s               | 7.7 s                              |
  | Mediana    | **15.7 s**                 |                     | **7.8 s**                          |
  - **La primera visita depende de la red:** de 15 a 29 s en esta corrida, contra 36.4 s de la corrida de la tarde con el build anterior. La red de la noche fue más rápida, así que la diferencia no es solo del build; lo que sí es del build son los 6.71 MB menos (−17.7 %).
  - **Para la demo:** si el sitio se abre una vez antes, el 3D sale en unos 8 s. En la repetición 2, la segunda visita esperó 8.9 s a la precarga; no se repitió en las otras dos.
  - **Primera medición con incógnito, descartada como cifra de demo:** el contexto de siempre de Playwright es de incógnito, con una caché en memoria que no guarda archivos de 20 a 35 MB, y la segunda visita volvía a bajar todo (mediana de 20.7 s; `eval/results/u6_carga_segunda_visita_incognito.json`). La prueba ahora usa un perfil con caché en disco cuando mide la segunda visita (`CROQUIS_SEGUNDA=1`).

- **Para la primera visita solo queda achicar el build** (texturas: 25 MB, de ellas 8 MB en los cuatro cielos HDRI; shaders: 8 MB). René (2026-11-12) pidió las dos que no cambian el aspecto: el cielo del caso y quitar variantes de shaders; la compresión con pérdida, no. Ver «El build más ligero».

### El build más ligero (René, 2026-11-12)

**Qué se hizo** (rama `feat/u6-build-ligero`):

1. **Solo el cielo del caso.** Cada uno de los cuatro cielos HDRI es un AssetBundle aparte en `StreamingAssets/cielos/` (`ConstruirVisor.Cielos`, sin compresión propia: Blob lo sirve con brotli). Unity baja el del caso mientras arma los vehículos (`Cielos.CargarAsync`) y lo usa al armar el escenario; los HDR salieron de `Resources` y `recursos.mjs` los copia a `Recursos/hdri/`. Es la misma textura con el mismo importador. La web le dice a Unity dónde están (`streamingAssetsUrl` en `puente.ts`, `medir.html` y `medir-e6.html`). Se agregaron los módulos `assetbundle` y `unitywebrequestassetbundle` (el wasm crece 0.12 MB sin comprimir).
2. **Sin las variantes de shaders que el visor nunca enciende** (`Editor/VariantesDeShaders.cs`, solo en el build web; cada palabra con su motivo):
   - posproceso: grano, distorsión de lente, aberración cromática, tono «Neutral», suciedad del resplandor y dithering (el perfil lleva ACES, resplandor sin textura, ajuste de color y viñeta; ninguna cámara enciende el dithering);
   - Lit, el suelo y los materiales glTF: `_LIGHT_COOKIES` (ninguna luz lleva cookie) y `LOD_FADE_CROSSFADE` (no hay LODGroup).
   - La niebla (`FOG_EXP2`) se queda con y sin ella: el minimapa la apaga al dibujar.
   - Variantes: Lit 1 216 → 304, el suelo 256 → 64, UberPost 720 → 18, FinalPost 96 → 24, los tres glTF 64 → 32 cada uno. Shaders del build: 8.0 → 2.5 MB.

**Peso medido** (`eval/u6_peso_build.mjs` → `eval/results/u6_peso_build.json`: lo que baja Chrome de Blob con brotli, archivo por archivo):

| Build                                  | `.data`  | `.wasm`  | Cielo del caso  | Primera visita |
| -------------------------------------- | -------- | -------- | --------------- | -------------- |
| Antes (`f12372a6c2d7742c`, producción) | 27.20 MB | 10.53 MB | (en el `.data`) | **37.84 MB**   |
| Después (`dc9c30121a648d63`)           | 19.41 MB | 10.57 MB | 1.01–1.05 MB    | **31.13 MB**   |

Son 6.71 MB menos (−17.7 %). En la red de la laptop (0.4 a 1 MB/s) eso son de 7 a 17 s menos en la primera visita.

**Se ve igual:**

- **Capturas** (`eval/u6_comparar_capturas.mjs` → `eval/results/u6_comparar_capturas.json`): las 10 escenas de D1, cinematográfica y acera, en media, en PNG, con el build de producción (bajado de Blob) y dos veces con el nuevo. La diferencia entre el de producción y el nuevo es la misma que entre dos corridas del nuevo: en el peor caso, 5.67 contra 5.85 niveles de diferencia media (la vegetación y la lluvia se mueven entre corridas).
- **Ninguna variante quitada se pide:** un build de prueba con `CROQUIS_VARIANTES=1` (coincidencia estricta de variantes; Unity avisa en la consola si un caso pide una variante que no está) y las 10 escenas en baja, media, alta y ultra (`tools/unity/capturas.mjs`, `consola.json`). Ningún aviso lleva las palabras quitadas. Los únicos avisos son de los materiales glTF con `_TEXTURE_TRANSFORM` y `_OCCLUSION`, que el build nunca ha traído (ninguno de sus materiales las usa); vienen de antes y quedan en «Endurecimiento pendiente» de `docs/PROGRESS.md`.
- **El flujo completo** con el Unity de Blob y el sitio local (`e2e/visor-unity-real.spec.ts`, `CROQUIS_UNITY_BLOB=1`) pasa: el cielo ya está cuando terminan los vehículos (paso `cielo` de `depurar carga`).

**Builds fuera de la sesión:** `tools/unity/en-tarea.ps1` corre cualquier comando largo (el build, las capturas) como una tarea de Windows, sin suspensión: la sesión cortó un build por falta de memoria y así ya no la afecta.

### El build web en la computadora de demo (2026-11-12)

El colaborador de René corrió `medir-web.ps1` en la RTX 4070 Laptop (Chrome 140, 1920×1200 con dpr 1.25, ANGLE sobre Direct3D 11 con la NVIDIA). El archivo dice build `01fce868922703fd` porque es el que había al empezar, pero la corrida cruzó el despliegue de #210 (21:11 UTC): la repetición 1 midió `01fce868` y las 2 y 3, `f12372a6c2d7742c`, con el primer bloque de ultra. `eval/e6_web_demo_por_build.mjs` separa las dos (`eval/results/e6_unity_web_demo_por_build.json`). fps, mediana:

| Escena                      | Alta (3) | Ultra con el bloque (2) | Ultra sin el bloque (1) |
| --------------------------- | -------- | ----------------------- | ----------------------- |
| axa, día                    | 451.8    | 253.8                   | 468.3                   |
| axa, noche                  | 379.1    | 195.7                   | 384.9                   |
| carambola, día              | 276.9    | 270.4                   | 293.8                   |
| carambola, noche            | 249.6    | 238.1                   | 246.7                   |
| lateral_interseccion, día   | 338.0    | 243.3                   | 346.3                   |
| lateral_interseccion, noche | 294.1    | 200.5                   | 308.2                   |
| nocturno_lluvia, día        | 235.0    | 233.4                   | 248.2                   |
| nocturno_lluvia, noche      | 215.8    | 215.1                   | 222.2                   |
| terraceria, día             | 293.2    | 261.6                   | 308.9                   |
| terraceria, noche           | 279.4    | 227.5                   | 282.9                   |

- **El navegador cumple** con holgura en alta y en ultra, también con el bloque: el peor caso es AXA de noche en ultra, 195.7 fps (1 % más lento: 96.7).
- **El bloque cuesta** hasta la mitad de los fps en las escenas más ligeras (AXA de día: 468 → 254) y casi nada en las que ya pesaban (lluvia de noche: 222 → 215). Con dpr 1.25, ultra dibuja a 1.5× sobre el lienzo de 1920×1200.
- **Falta:** el programa de escritorio con el bloque (la parte de escritorio de `visor-rtx-u6`). Ultra en el navegador tiene 2 repeticiones con el bloque; para tener 3, `medir-web.ps1 -Niveles ultra` en una carpeta nueva.

### El programa de escritorio con el primer bloque de ultra (2026-11-12, noche)

El colaborador de René corrió `medir-escritorio.ps1` del release `visor-rtx-u6` → `eval/results/e6_unity_escritorio_bloque1.json` (RTX 4070 Laptop, 1920×1080, 3 repeticiones, 11 escenas con el caso de ejemplo). fps, mediana:

| Escena                      | Ultra sin el bloque | Ultra con el bloque | Alta  |
| --------------------------- | ------------------- | ------------------- | ----- |
| axa, día                    | 410.2               | 279.4               | 414.1 |
| axa, noche                  | 321.9               | 207.4               | 323.3 |
| carambola, día              | 359.3               | 273.0               | 396.2 |
| carambola, noche            | 315.5               | 233.9               | 326.6 |
| lateral_interseccion, día   | 370.7               | 260.8               | 369.5 |
| lateral_interseccion, noche | 313.1               | 217.2               | 311.0 |
| nocturno_lluvia, día        | 299.1               | 254.0               | 360.5 |
| nocturno_lluvia, noche      | 289.4               | 230.4               | 295.1 |
| terraceria, día             | 392.1               | 272.4               | 393.6 |
| terraceria, noche           | 317.9               | 237.3               | 323.7 |
| ejemplo                     | —                   | 279.7               | 413.1 |

- **Ultra con el bloque cumple con holgura:** de 207.4 a 279.7 fps; el 1 % más lento, 138.2 o más. En el navegador, de 195.7 a 270.4 (`e6_unity_web_demo_por_build.json`).
- El bloque cuesta de 45 a 131 fps por escena; alta queda igual que antes (295.1–414.1).

### El ocupante que atravesaba la puerta (René, 2026-11-13; ADR 0116)

En `lateral_interseccion`, de día y de noche, la copiloto del hatchback rojo sacaba el brazo y la pierna por la puerta.

- **Causa:** el visor, no el solver. Fueron tres cosas:
  1. El solver desplaza a la copiloto hasta 0.30 m hacia su puerta (de 0.367 a 0.667 m del eje). El visor solo limitaba la **cadera** a 0.6 m del eje; los hombros, el brazo y la rodilla quedaban unos 0.3 m más afuera.
  2. Los brazos del modelo MakeHuman parten en pose A, abiertos 42°. Sentado, el visor los doblaba hacia el volante desde ahí, y las manos quedaban hacia afuera: la malla sentada llegaba a 0.538 m del centro del cuerpo (medido en el visor con un registro temporal), contra 0.32 m de la cuenta con las proporciones.
  3. Del cinturón para arriba la carrocería se mete hacia adentro: con la caja al ancho de la puerta, la mano todavía asomaba por el vidrio (primer intento, `docs/cesvi/u6/ocupante/primer-intento/`).
- **Arreglo:**
  - **Cabina por clase** (`Croquis.Core.Cabina`): tablero, pared de atrás, piso, techo y la cara de adentro de la puerta.
  - **El ancho del habitáculo a cada altura**, medido en el modelo 3D de cada clase con `tools/blender/medir_cabina.py` → `eval/results/u6_cabina_perfil.json` y la tabla generada `PerfilCabina.cs`. En el hatchback de `lateral_interseccion`, a la altura de los hombros de la copiloto (1.01 m) la carrocería mide 0.82 de su medio ancho, contra 0.93 a media puerta.
  - **El cuerpo en dos franjas** (hombros con brazos hasta el cuello; la cabeza arriba), con lo más grande entre las proporciones y la malla ya posada.
  - **Sentado, los brazos bajan antes de doblarse:** la malla pasa de 0.538 a 0.284 m.
  - **El desplazamiento del solver se recorta al interior** (límite ilustrativo; el número del solver no cambia). La nota del 3D lo dice cuando el caso trae ocupantes.
  - En reposo, un ocupante puede ir unos centímetros más adentro que su asiento: la copiloto va a 0.305 m del eje en vez de 0.367.
- **Pruebas** (`dotnet test`, 60 de 60):
  - en los 23 caso-3d versionados, cada ocupante y variante, cada 0.01 s, cada centímetro de altura del cuerpo dentro de la cabina a esa altura;
  - las 11 clases (sedán compacto y mediano, hatchback, SUV compacta y grande, pickup, van, combi, camión, tractocamión y autobús), con 1.5, 1.7 y 1.9 m de estatura, en cada asiento y con desplazamientos de hasta ±2 m;
  - la tabla generada coincide con `eval/results/u6_cabina_perfil.json`.
- **Capturas** (build web local, nivel alta, vista «cerca» del hatchback; nueva en `CamaraVisor`, `cerca:<id>:<azimut>:<distancia>:<altura>`): `docs/cesvi/u6/ocupante/antes/` y `despues/`, de día y de noche, a 0.3 s (lado de la copiloto, 40° y desde arriba) y a 0.6 s. Las 40 de cada tanda (5 instantes × 4 vistas × día y noche) están en `apps/visor-unity/Logs/capturas-ocupante/` (fuera de git).
- **De paso:** el cargador de modelos usa el mismo mapa clase → modelo que la cabina (`Cabina.ModeloDeClase`).
- **Pendiente** (en «Endurecimiento pendiente»): los peatones que caminan siguen con los brazos en la pose A, abiertos; el arreglo de los brazos solo se aplica sentado, que es lo que se pidió.

### Material promocional (René, 2026-11-13)

Solo para publicidad: no cambia ningún número ni el flujo del perito, y las imágenes no entran al repo.

- **Modo foto del visor de escritorio** (`Fotos.cs`, ADR 0116): `VisorCroquis.exe -fotos tomas.json -salida fotos -ancho 3840 -alto 2160 -calidad ultra`. Cada toma abre su paquete, fija el instante y la cámara y se dibuja aparte a la resolución pedida, sin minimapa, panel ni desenfoque, con la leyenda ilustrativa pequeña en una esquina. Sin `-fotos`, el visor es el de siempre.
- **Tomas de ingeniería** (`CapasIngenieria.cs`), todas con datos del Resultado y cada una también «-limpia» con la misma cámara: rayos X (carrocería translúcida, `perfil_m` como mapa de calor con `CampoDano` y la flecha del impulso m·ΔV en la dirección del PDOF), estroboscópica (cada 0.1 s, color por rapidez), nube de incertidumbre, terreno en alambre con la pendiente en color, ficha técnica (largo, ancho, alto, entre ejes; el centro de masa en el centro de la huella y a 0.37 del alto, el supuesto del solver) y el cono de visibilidad del análisis.
- **La nube** son las poses finales de cada muestra del mismo Monte Carlo del Resultado: `monteCarlo` gana un gancho opcional `alMuestra` que no cambia nada (prueba `montecarlo-muestras.test.ts`), y `tools/unity/paquetes-promo.mts` comprueba que sus medianas sean las del Resultado (lateral 64, carambola 64 y AXA 128 muestras: iguales).
- **Paquetes y tomas:** `tools/unity/paquetes-promo.mts` (incluye la hora dorada, con la iluminación «atardecer»: sol a 8.55°, y AXA con el relieve real de `/api/relieve`, casi plano: pendiente < 1 %). El paquete para la RTX: `tools/unity/paquete-fotos-promo.ps1` → release `fotos-promo`, con `generar-fotos.ps1`.
- **Prueba en la laptop:** las 15 tomas (24 PNG con las limpias) en 60 s a 1280×720 en alta, sin errores (Intel UHD).
- **El recorrido de la app** (parte B): `apps/web/e2e/promo-recorrido.spec.ts` con `playwright.promo.config.ts`, contra producción con el Unity real, 2560×1440 con dpr 2, de día y de noche: 54 PNG en `D:\Croquis-promo\recorrido` (lista en su `LEEME.md`).

### Resumen para René (U6)

- **Qué quedó:** el visor 3D de `/cesvi` es Unity (Reconstrucción, Números y detrás de Presentar), con respaldo three.js; editar en 3D (mover, girar y alargar objetos; marcar el primer golpe, choques y puntos de paso) recalcula el caso; las fotos del dictamen salen de Unity; «Descargar paquete 3D» y el visor de escritorio que lo abre.
- **Cómo probarlo:** abre un caso en croquis-sage.vercel.app, ve a Reconstrucción → «Órbita 3D» → «Editar en 3D», arrastra un objeto y mira cómo cambia la cifra. Las capturas de la prueba con Unity real están en `docs/cesvi/u6/produccion/`.
- **Lo que encontró la prueba con Unity real y se corrigió:** casas inventadas encima de un vehículo que termina fuera de la calle, la cámara cinematográfica con una pared enfrente y el minimapa tapando Presentar.
- **Qué necesito de ti:**
  1. Que tu colaborador corra el paquete `visor-web-medicion` en la RTX 4070 Laptop y te devuelva `e6_unity_web_demo.json` (unos 40 min).
  2. Si quieres liberar espacio en Blob: `node tools/unity/publicar-web.mjs --podar --si` borra dos builds viejos sin uso (107 MB). No lo corrí: no se deshace.

## U5 · Calidad y rendimiento (cerrada el 2026-11-12)

ADR 0115. Rama `feat/u4-ajustes`, PR #205 (borrador).

### Qué se hizo

- Cuatro niveles de `QualitySettings` (baja, media, alta, ultra), cada uno con su canalización URP; media y alta son los ajustes que tenían el build web y el de escritorio.
- Calidad automática con las reglas de la web, tope de dpr por nivel, panel de diagnóstico (F3, `?diagnostico=1`, `-diagnostico`).
- Medición web `eval/e6_unity.mjs` y modo de medición del escritorio (`Medicion`, `tools/unity/medir-escritorio.ps1`, `tools/unity/paquete-escritorio.ps1`).
- Núcleo: `NivelesCalidad.cs` con 7 pruebas (`dotnet test`: 36 en verde).

### Medido en la laptop (`eval/results/e6_unity_web.json`)

Build WebGL a 1920 × 1080, cámara cinematográfica en bucle, mediana de 3 repeticiones del promedio de fps, modo «Mejor rendimiento», conectada. GPU: Intel UHD Graphics (i5-10210U), Chromium de Playwright sin vsync. Meta de PLAN §7.8: media ≥ 60 y baja ≥ 30.

| Escena                      | Media | Baja |
| --------------------------- | ----- | ---- |
| axa, día                    | 22.6  | 42.9 |
| axa, noche                  | 15.5  | 33   |
| carambola, día              | 20.2  | 38   |
| carambola, noche            | 14.7  | 37   |
| lateral_interseccion, día   | 19    | 41.7 |
| lateral_interseccion, noche | 13.9  | 28   |
| nocturno_lluvia, día        | 23.6  | 40.6 |
| nocturno_lluvia, noche      | 18.5  | 34   |
| terraceria, día             | 21.5  | 41.9 |
| terraceria, noche           | 17.4  | 39.4 |

- **Media no cumple en ninguna escena** (13.9 a 23.6 fps; le falta entre 2.5 y 4.3 veces). **Baja cumple en 9 de 10**; `lateral_interseccion` de noche da 28.
- El build pesa 71 MB sin comprimir (U4: 65 MB): lleva las variantes de shader de los cuatro niveles.
- Carga del caso hasta que se ve, con el nivel fijo: 10 a 11.4 s en media y 7.9 a 8.9 s en baja (mediana).

### Optimización de media (2026-11-11)

Detalle, decisiones y lo descartado: ADR 0115, sección «Optimización de media». Resumen:

- **Hecho en baja y media, sin cambiar el aspecto** (diferencia por pixel medida, `eval/results/u5_diferencia_*.json`): minimapa con fondo horneado, poses fijas, una cascada de sombra, oclusión ligera, suelo en una pasada, sombras unidas, posproceso interpolado solo cuando cambia, lluvia fuera del minimapa y luna sin sombra. **Sí se nota un poco:** FXAA en vez de MSAA 2× (bordes).
- **Descartado:** Forward+, WebAssembly 2023 con IL2CPP para velocidad, depth priming, FSR y gradación en HDR.
- **Dónde va** (tres escenas, fps a 1080p): de 22.6 / 13.9 / 18.5 a 35.7 / 23.7 / 26.2. A escala 0.6: 63.4 / 49.2 / 47.1.
- **Lo que dice el modelo:** a 1080p nativo esta GPU no llega a 60 fps ni con todo apagado. Para 60 harían falta escalas de 0.64 (día), 0.50 (noche urbana) y 0.43 (lluvia de noche).

### Resultado de la medición (2026-11-11): media no cumple, en espera de René

La cadena terminó completa (150 mediciones, ninguna con error ni repetida; equipo conectado, «Mejor rendimiento»; build `ff04482a02` de 70 MB; e2e de cámaras en verde). Cifras: `eval/results/e6_unity_media_escala_{1,0.7,0.6,0.5}.json`, `e6_unity_baja.json` y el resumen `eval/results/u5_opciones.json` (`node eval/u5_opciones.mjs`). fps a 1080p, mediana de 3 repeticiones:

| Escena                      | media ×1 | ×0.7 | ×0.6 | ×0.5 | baja | F (ms) | P (ms) | Escala para 60 |
| --------------------------- | -------- | ---- | ---- | ---- | ---- | ------ | ------ | -------------- |
| axa, día                    | 30.4     | 51.9 | 59.6 | 69.9 | 51.3 | 7.7    | 25.0   | 0.60           |
| axa, noche                  | 25.6     | 46.7 | 57.5 | 70.3 | 42.3 | 5.5    | 33.4   | 0.58           |
| carambola, día              | 25.1     | 40.4 | 48.8 | 58.6 | 41.5 | 9.6    | 30.3   | 0.48           |
| carambola, noche            | 21.2     | 38.5 | 47.6 | 57.5 | 39.0 | 6.8    | 40.2   | 0.50           |
| lateral_interseccion, día   | 27.0     | 42.5 | 52.5 | 61.9 | 46.5 | 9.3    | 27.9   | 0.51           |
| lateral_interseccion, noche | 21.4     | 35.8 | 46.8 | 56.5 | 37.4 | 8.0    | 38.9   | 0.47           |
| nocturno_lluvia, día        | 29.7     | 41.4 | 48.8 | 53.4 | 46.1 | 13.7   | 20.1   | 0.38           |
| nocturno_lluvia, noche      | 24.6     | 41.3 | 43.8 | 50.3 | 36.5 | 12.2   | 28.0   | 0.40           |
| terraceria, día             | 27.3     | 42.6 | 48.1 | 54.9 | 43.6 | 11.8   | 24.7   | 0.44           |
| terraceria, noche           | 23.3     | 41.3 | 47.5 | 53.6 | 41.8 | 9.3    | 33.2   | 0.47           |

- **Baja cumple** su meta (≥ 30 fps) en las 10 escenas: de 36.5 a 51.3 fps (antes de optimizar, 9 de 10, de 28 a 42.9).
- **Media no cumple** (≥ 60 fps) con ninguna escala medida: a escala 1, 0.7 y 0.6, ninguna escena; a 0.5 (960×540 por dentro), 3 de 10, y las otras siete quedan entre 50.3 y 58.6 fps. Antes de optimizar, media a escala 1 daba de 13.9 a 23.6 fps; ahora, de 21.2 a 30.4.
- **F y P** salen del ajuste `ms = F + P·escala²` sobre las cuatro escalas medidas: F es lo que cuesta el cuadro sin contar pixeles y P, lo que cuestan los pixeles a escala 1. «Escala para 60» es una estimación del ajuste, no una medición. Las escenas con lluvia y la terracería traen el F más alto (11.8 a 13.7 ms de los 16.7 que hay para 60 fps): ahí bajar la escala rinde poco.
- **Qué tanto se nota la escala** (`eval/results/u5_diferencia_escalas.json`, tres escenas contra la captura a escala 1, sin el minimapa): la diferencia media por pixel va de 2.5 a 6.4 a escala 0.8 y de 3.0 a 7.3 a escala 0.5. Esa cifra **incluye lo que cambia entre dos tomas** (los fragmentos del impacto no caen en el mismo lugar y las capturas son WebP): no hay toma repetida de la base para restarlo, así que sirve para comparar escalas entre sí, no como medida absoluta. A la vista, a 0.5 los bordes finos (rejas, rines, cables) se ven escalonados y las texturas lejanas, más lisas; los vehículos, las personas y las marcas se siguen distinguiendo. Capturas: `docs/cesvi/u5/media/` (escala 1, las 10 escenas) y `docs/cesvi/u5/escalas/escala_{0.8,0.7,0.6,0.5}/`.

**Opciones para René** (no se fija ninguna escala ni se toca la meta sin que él elija; el perfil de media sigue con `DprMaximo = 1`):

1. **Escala fija más baja, alrededor de 0.4** (768×432 por dentro). Según el ajuste, las 10 escenas llegarían a 60 fps (la lluvia pide 0.38 a 0.40). Cuesta: una configuración más en la cadena (unos 20 min de medición) y una imagen claramente más suave que a 0.5 en todas las escenas, también en las que no lo necesitan.
2. **Escala automática por escena**: el visor ajusta la escala de media entre un piso y un techo (por ejemplo, 0.4 a 0.7) para sostener 60 fps. AXA de día quedaría cerca de 0.6 y la lluvia cerca de 0.4. Cuesta: programar y probar el ajuste (que no oscile ni parpadee) y volver a medir las 10 escenas; la nitidez cambia de una escena a otra.
3. **Bajar primero el costo fijo** de lluvia y terracería (geometría de la lluvia, piel de las personas, llamadas de dibujo) y después elegir escala: con F por debajo de unos 8 ms, la escala necesaria sube hacia 0.5. Cuesta: otra ronda de perfilado y optimización sin cambiar el aspecto, sin garantía de cuánto se gana; es lo único que mejora las escenas donde la escala ya no rinde. Se puede combinar con 1 o 2.

### Escala automática y ronda de costo fijo (2026-11-11, tras la decisión de René)

- **La escena de referencia de §7.8** («2 vehículos, 2 personas, intersección con árboles») es `lateral_interseccion`: la única canónica con intersección y árboles, con 2 vehículos; lleva 3 personas, una más que la descripción, así que no es más fácil que ella. Registrado en ADR 0115.
- **Escala de dibujo automática en media** (`Croquis.Core.EscalaAutomatica`, probada con `dotnet test`): cada caso empieza arriba (en 1, o 15 % por encima de donde quedó el anterior) y baja de un salto a la escala que el cuadro medido indica, hasta sostener 60 fps; deja un margen y se asienta. **Nunca baja de 0.5 y dentro de un caso no sube**, así que no oscila. Ya asentada, solo baja si los fps caen durante 4 s seguidos; si bajar no mejora los fps (la causa no son los pixeles), deshace ese paso y deja de bajar. Al cargar otro caso, cambiar de cámara o de tamaño del lienzo, busca de nuevo. Con el nivel fijado en «media» también corre: se fija el nivel, no la escala. El panel de diagnóstico (F3) dice a qué escala va y si llegó.
- **Si una escena baja de 24 fps** durante 5 s, la calidad automática pasa a baja, como antes; los cuadros en que la escala se está acomodando no cuentan.
- **Ronda de costo fijo, una sola** (perfil de CPU con nombres de función, `eval/results/u5_ronda3_0_cpu_*.json`; cada cambio medido contra su versión anterior en la misma sesión, a escala 0.5, `eval/results/u5_ronda3_1_cambios.json`):

  | Cambio (baja y media)                                               | Lluvia, noche | Terracería, día | Referencia, noche | Referencia, día |
  | ------------------------------------------------------------------- | ------------- | --------------- | ----------------- | --------------- |
  | Lluvia: malla movida en la GPU en vez de partículas (ms por cuadro) | −2.1          | −0.9            | sin lluvia        | sin lluvia      |
  | Minimapa: cada vehículo en una sola malla (ms por cuadro)           | −1.1          | −1.2            | −2.3              | −2.4            |
  | Llamadas de dibujo por cuadro, antes → después                      | 259 → 183     | 278 → 212       | 191 → 138         | 196 → 164       |
  - **La lluvia** se ve igual (mismas gotas, mismos números y color); de paso ya no salen como «postes» las gotas pegadas a la cámara. Las salpicaduras siguen siendo partículas: medidas, no cuestan.
  - **El minimapa** dibujaba cada vehículo pieza por pieza (de 30 a 60 llamadas por vehículo) para una figura de unos cuantos pixeles. Ahora es una malla por vehículo con el color de cada pieza, con luz difusa y un piso de claridad para que se distinga de noche. La sombra de contacto ya no queda horneada donde el vehículo empezó.
  - **La piel de las personas** ya no cuesta: 0.01 ms por cuadro en el perfil (las poses fijas del paso 1 la resolvieron). No había nada que ganar ahí y no se tocó.
  - **Lo que queda del minimapa** (su cámara, ya con pocas llamadas) son 1.1 a 1.3 ms por cuadro. No se siguió: era una sola ronda.

- **Alta y ultra no cambian:** siguen con partículas, con el minimapa completo y sin escala automática (prueba `LasOptimizacionesDeU5SoloTocanBajaYMedia`).

### Medición final y cierre (2026-11-12)

La cadena reanudable midió el build `e3da8c1317` (70 MB) completo: 90 mediciones, ninguna con error, e2e de cámaras en verde, equipo conectado y en «Mejor rendimiento» (`eval/results/e6_unity_media.json`, `e6_unity_media_escala_0.5.json`, `e6_unity_baja.json`; estado en `eval/results/u5_estado.json`). fps a 1080p, mediana de 3 repeticiones:

| Escena                          | Media, escala automática | Escala elegida | Media a 0.5 fija (control) | Baja |
| ------------------------------- | ------------------------ | -------------- | -------------------------- | ---- |
| axa, día                        | 61.4                     | 0.627          | 71.8                       | 62.3 |
| axa, noche                      | 68.0                     | 0.548          | 73.8                       | 51.4 |
| carambola, día                  | 59.6                     | 0.5            | 63.2                       | 47.8 |
| carambola, noche                | 56.3                     | 0.5            | 64.3                       | 44.5 |
| **lateral_interseccion, día**   | **64.7**                 | 0.5            | 65.6                       | 53.1 |
| **lateral_interseccion, noche** | **62.1**                 | 0.5            | 59.4                       | 41.0 |
| nocturno_lluvia, día            | 61.6                     | 0.5            | 58.6                       | 58.0 |
| nocturno_lluvia, noche          | 61.0                     | 0.5            | 59.3                       | 47.0 |
| terraceria, día                 | 64.2                     | 0.5            | 63.7                       | 52.5 |
| terraceria, noche               | 67.3                     | 0.5            | 63.3                       | 48.1 |

- **Criterio de cierre: cumple.** La escena de referencia de §7.8 llega a 64.7 fps de día y 62.1 de noche en media con su escala automática.
- **Las demás:** 8 de 10 escenas pasan de 60 en media. Carambola (3 vehículos) queda en 59.6 de día y 56.3 de noche, a 0.5: el piso. Ninguna baja de 24 fps, así que la calidad automática no pasa a baja en ninguna. Baja cumple sus 30 fps en las 10 (de 41.0 a 62.3; antes de esta ronda, de 36.5 a 51.3).
- **La escala que eligió cada escena** (`eval/results/u5_escalas_elegidas.json`): 0.627 en AXA de día, 0.548 en AXA de noche y 0.5 en las demás. Durante las 30 mediciones de media la escala no cambió ni una vez mientras se contaban cuadros; esperó entre 16 y 32 s a asentarse. En 2 de las 30 quedó en el piso sin llegar (carambola de día y la referencia de noche, una repetición cada una).
- **El control a 0.5 fija** mide cuánto aportó la ronda de costo fijo con el mismo build: con escala 0.5 y el build anterior, 3 de 10 escenas pasaban de 60 (`e6_unity_media_escala_0.5` del 2026-11-11, archivado en `u5_estado.ff04482a02.json`); ahora, 7 de 10. Entre repeticiones de la misma escena hay hasta 8 fps de diferencia (carambola de noche: 56.3 con la automática y 64.3 con la fija, ambas a 0.5): es el ruido térmico de esta laptop.
- **Ojo con la carga al empezar:** al empezar media el CPU marcaba 28 % (al final, 3 %); las condiciones quedan en el resultado.
- **Capturas para juzgar la nitidez** (1080p, WebP de calidad 95): `docs/cesvi/u5/final/escala_1/` y `docs/cesvi/u5/final/escala_elegida/`, las 10 escenas en las dos. A 0.5, los bordes finos (rejas, rines, cables) se ven escalonados y las texturas lejanas, más lisas; los vehículos, las personas, las huellas y las marcas se distinguen igual.

### Alta y ultra en la computadora con tarjeta de video (2026-11-12)

El colaborador de René corrió el paquete `visor-escritorio-u5` (`medir-escritorio.ps1`) en una laptop con RTX 4070 Laptop, i9-14900HX y 32 GB: programa de escritorio en Direct3D 12, 1920×1080 en pantalla completa, un proceso por medición, 3 repeticiones, sin vsync, conectada y en «Alto rendimiento» (`eval/results/e6_unity_escritorio.json`, 60 mediciones, ninguna con error). fps, mediana de 3:

| Escena                      | Alta  | 1 % bajo | Ultra | 1 % bajo |
| --------------------------- | ----- | -------- | ----- | -------- |
| axa, día                    | 414.9 | 232.6    | 410.2 | 231.9    |
| axa, noche                  | 321.4 | 167.1    | 321.9 | 166.6    |
| carambola, día              | 356.0 | 176.9    | 359.3 | 180.2    |
| carambola, noche            | 317.2 | 173.4    | 315.5 | 172.2    |
| lateral_interseccion, día   | 372.4 | 182.9    | 370.7 | 182.9    |
| lateral_interseccion, noche | 312.1 | 179.2    | 313.1 | 179.4    |
| nocturno_lluvia, día        | 303.5 | 179.9    | 299.1 | 179.6    |
| nocturno_lluvia, noche      | 290.3 | 188.4    | 289.4 | 186.0    |
| terraceria, día             | 388.3 | 189.1    | 392.1 | 190.2    |
| terraceria, noche           | 320.7 | 174.0    | 317.9 | 174.9    |

- **Cumple la meta de la computadora de demo** (PLAN §7.8: ≥ 60 fps en alta o ultra en todas las escenas canónicas): de 289.4 a 414.9 fps, con el 1 % más lento en 166.6 o más.
- **Alta y ultra dan casi lo mismo** porque, con una pantalla de dpr 1, las dos dibujan a escala 1 (el tope de dpr de ultra, 2, solo cuenta en pantallas de alta densidad) y sus diferencias (sombras a 150 m, suavizado alto, sonda de 512, más matas y luminarias) le cuestan poco a esta tarjeta. El margen sobre 60 fps es de 5 a 7 veces: la nota de René para después de U6 es usarlo en ultra.
- **Esto mide el programa de escritorio, no el navegador.** El build web en esa misma computadora se mide al cerrar U6 (el paquete se arma entonces).

### Resumen para René (U5)

- **Qué quedó:** cuatro niveles de calidad con calidad automática; en media, optimizaciones que no cambian el aspecto, escala de dibujo automática por escena (de 0.5 a 1, nunca menos de 0.5) y una ronda de costo fijo (lluvia en la GPU, vehículos del minimapa en una malla). Alta y ultra no cambian.
- **Cifras:** la referencia, 64.7 / 62.1 fps en media; carambola, 59.6 / 56.3; baja, de 41 a 62 fps. Tabla arriba.
- **Cómo verlo:** compara cada par de capturas de `docs/cesvi/u5/final/`. En el visor, F3 abre el panel de diagnóstico, que dice a qué escala va la automática y si llegó.
- **Alta y ultra:** medidas por tu colaborador en la RTX 4070 Laptop: de 289 a 415 fps en las 10 escenas (tabla arriba). U5 queda cerrada.
- **Qué necesito de ti:** nada. Si la nitidez a 0.5 no te convence en alguna escena, dímelo.

### Para retomar

La medición de U5 es una cadena reanudable que corre **fuera de la sesión de Claude Code**, como la tarea de Windows «CroquisU5» (René, 2026-11-11: que no se pierda nada si la sesión se cierra o se corta).

- **Empezar o reanudar** (salta lo ya hecho): `powershell -ExecutionPolicy Bypass -File tools/unity/u5-cadena.ps1 -Lanzar`
- **Ver cómo va:** `powershell -ExecutionPolicy Bypass -File tools/unity/u5-cadena.ps1 -Estado` (o `node eval/u5_cadena.mjs --estado`).
- **Detenerla** (no borra lo medido): `powershell -ExecutionPolicy Bypass -File tools/unity/u5-cadena.ps1 -Detener`
- **Dónde queda cada cosa:**
  - `eval/results/u5_estado.json`: el build (con su huella), la e2e, las capturas y cada medición (escena, nivel, escala y repetición), anotada en cuanto termina.
  - `apps/visor-unity/Logs/u5-cadena.log`: el registro (fuera de git).
  - `eval/results/e6_unity_<configuración>.json`: el resultado de cada configuración, cuando están sus 30 mediciones; el de `media` trae el criterio de cierre.
  - `eval/results/u5_escalas_elegidas.json`: la escala que eligió cada escena (mediana de sus repeticiones).
  - `docs/cesvi/u5/final/escala_1/` y `docs/cesvi/u5/final/escala_elegida/`: las 10 escenas a 1080p, a escala 1 y a la que eligió cada una, para juzgar la nitidez lado a lado.
- **Qué hace, en orden:** paquetes de las escenas si faltan; build WebGL (no se rehace si `Build/web` existe y la huella de los fuentes es la anotada); e2e de cámaras; la E6 (10 escenas × 3 repeticiones, un navegador nuevo por medición) de `media` con su escala automática, de `media_escala_0.5` (el control: la misma medición del build anterior, para ver cuánto aportó la ronda) y de `baja`, con 90 s de pausa entre configuraciones; y al final las capturas. En `media` espera a que la escala lleve 8 s asentada antes de contar cuadros.
- **Si cambian los fuentes de Unity,** la huella cambia: se compila otra vez y lo medido con el build anterior se archiva en `u5_estado.<huella>.json`. No se mezclan cifras de dos builds.
- **Mientras corre:** la laptop no se suspende ni apaga la pantalla (se restaura sola al terminar o si el proceso muere), y cierra Edge antes de cada medición. Hay que dejarla conectada y con la tapa abierta. **Nada pesado a la vez** (ni otra medición, ni Playwright, ni Unity).
- **El «antes»** de las comparaciones es la media anterior a la optimización: `D:\croquis-logs\var1\base` (fuera de git).
- **La medición a escalas fijas del build anterior** (`ff04482a02`, con la que René eligió) quedó archivada en `eval/results/u5_estado.ff04482a02.json`; `node eval/u5_opciones.mjs --estado eval/results/u5_estado.ff04482a02.json` rehace su resumen. Al cerrar U5, `eval/results/e6_unity_web.json` (la primera E6, de antes de optimizar) se queda como línea base.

Las evaluaciones largas de W8 (E-R4 v4) se lanzarán igual: reanudables, con su archivo de estado, y como tarea de Windows.

Pendiente visual que se vio al medir: en el hatchback, la pierna del ocupante asoma por debajo de la puerta (la cadera va a la altura del asiento, pero la pierna doblada cruza el piso del modelo).

## U-pre (hecho, #181)

AXA abre con su escena colocada, un número por cantidad y Lighthouse medido. El detalle y las cifras están en `docs/PROGRESS.md`, sección «AXA abre con su escena colocada».

## U0

- **Plan:** contrato 2.3.0 (§2.2) con migración de fixtures, `caso3d.schema.json`, `armarCaso3d`, generador de C#, `visor-puente.md`, fixtures caso-3d, ADR 0111, estas bitácoras, `CLAUDE.md` y el plan.
- **Decisiones:** ADR 0111, sección «Lo que se decidió al verificar».
- **Instalado:** .NET SDK 10.0.403 en `D:\dotnet-sdk` (783 MB, sin tocar C: ni el PATH), para compilar `Croquis.Core` y sus pruebas; `quicktype` 26.0.0 como dependencia de desarrollo de `@croquis/scene-schema`.
- **Evidencia:** los tipos C# leyeron y reescribieron los 20 paquetes de `fixtures/caso3d/` sin diferencias. Suites locales: scene-schema 175, extraction 851, solver-ts 188, cesvi 306. Con cesvi corriendo junto a otra instalación, una prueba pasó su límite de tiempo; sola pasa, y sin esa carga también (22 de 22 en su archivo).

## U1

La primera mitad, `Croquis.Core` y su job de CI, está en `main` (#184). El resto va en `feat/u1-visor`.

### Resumen para René

- **Qué quedó:** el visor Unity abre un paquete caso-3d, baja de Blob los mismos modelos del visor web, los ajusta a las medidas y los ejes del caso y reproduce el `Resultado`. D2 corre en CI en cada PR (19 s).
- **Cifras medidas** (`eval/results/unity_build.json`, Unity 6000.3.28f1, mediana de 3 corridas, navegador nuevo y sin caché, 20 Mbps y 40 ms de latencia):

| Qué                                                  | Cifra                                    |
| ---------------------------------------------------- | ---------------------------------------- |
| Peso del build                                       | 41.7 MB, o 10.7 MB con Brotli calidad 9  |
| El `.wasm`                                           | 33.4 MB, o 8.6 MB con Brotli             |
| Hasta que Unity arranca                              | 5.4 s                                    |
| Hasta que AXA se ve, con sus modelos bajados de Blob | 2.2 s más, 7.9 s en total                |
| fps durante la reproducción                          | 58.8 de mediana: la pantalla limita a 60 |

- **Las tres corridas dieron casi lo mismo:** 7.8 a 7.9 s en total.
- **Captura:** `eval/results/unity_build.png`. Se ven los dos vehículos de AXA con sus ruedas, sobre un piso liso: el escenario llega en U2. La cámara órbita deja la acción en una esquina: el encuadre llega en U4.
- **Peso comprimido:** la cifra con Brotli es de referencia, porque no sabemos con qué calidad comprime Blob. La de producción se mide en U6.
- **Cómo probarlo:** `powershell tools/unity/build-web.ps1` y luego `node eval/unity_build.mjs`.
- **Lo que necesito de ti:** abrir la liga de «Medir en la MacBook M1» en la M1 y pegar el resultado.

### Medir en la MacBook M1

La liga, que funciona desde que este PR esté en producción:

https://croquis-sage.vercel.app/visor-unity/medir.html

Ábrela en una ventana privada, para que la carga cuente completa. La página carga Unity, abre AXA y mide 15 s de reproducción. Al final muestra un JSON con «Copiar resultado» para pegarlo en la conversación.

**Para publicar:** `node tools/unity/publicar-web.mjs`. Toma `RECURSOS_READ_WRITE_TOKEN` de la terminal o del `.env.local` de la raíz, solo en memoria.

- **El build ya está en Blob** (huella `2d5c1a20a446c129`) y la página lee de `apps/web/public/visor-unity/manifest.json` dónde está.
- **La página vive en el sitio y no en Blob,** porque Blob entrega el HTML como descarga (ADR 0111).
- **Probada en local** con el build real de Blob y sin limitar la red: Unity arrancó en 4.1 s y AXA quedó cargado 3 s después, con 58.8 fps. Fue una sola corrida de prueba; las cifras oficiales son las de `eval/results/unity_build.json`.

La huella `2d5c1a20a446c129` es la de este build. Si se reconstruye, el script imprime la liga nueva.

### Memoria en esta laptop (2026-11-07)

8 GB de RAM, Unity solo en modo batch, sin nada más abierto. Muestras cada 5 s; las crudas quedaron en `D:\croquis-logs\`, fuera de git.

| Paso                                              | Duración              | Pico de Unity y sus procesos | Mínimo libre | Máximo comprometido | Cómo terminó                                   |
| ------------------------------------------------- | --------------------- | ---------------------------- | ------------ | ------------------- | ---------------------------------------------- |
| Importación inicial                               | 6 min                 | 3,136 MB                     | 47 MB        | 12,732 MB           | Bien                                           |
| Pruebas EditMode                                  | menos de 1 min        | 2,001 MB                     | 699 MB       | 11,497 MB           | 3 de 3                                         |
| Build WebGL, con los 40 paquetes de más           | 9.5 min, sin terminar | 2,595 MB                     | 342 MB       | 13,458 MB           | Detenido por Claude Code en el paso 323 de 331 |
| Importación con el manifiesto recortado           | 1 min                 | 1,855 MB                     | 669 MB       | 11,476 MB           | Bien: Unity registró 31 paquetes en vez de 67  |
| Build WebGL, manifiesto recortado                 | 7.6 min               | 2,631 MB                     | 632 MB       | 13,041 MB           | Bien                                           |
| Build WebGL tras corregir las ruedas, incremental | 4.1 min               | 2,813 MB                     | 710 MB       | 12,897 MB           | Bien                                           |

- **El build detenido no fue un error de Unity:** lo detuvo la protección de memoria de Claude Code. Desde entonces René abre Claude Code con `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1`.
- **El manifiesto recortado sí ayudó:** la memoria libre no bajó de 632 MB, contra 342 MB antes. No se puede separar cuánto se debe a los paquetes y cuánto a la protección apagada.
- **Unity agregó 40 paquetes la primera vez:** como el proyecto no tenía `ProjectSettings`, lo trató como nuevo. Ya con `ProjectSettings` no los volvió a agregar.

### Corregido en el camino

- **Ruedas:** cada modelo trae nodos anidados que también empiezan con `wheel_` (la llanta dentro de la rueda). Ahora solo cuentan las ruedas que trae el manifiesto, y si falta alguna, se avisa con `modelo_no_cargo`.
- **La escena ya no cambia el material del piso en cada build,** así que su GUID se queda fijo.

### Instalado

- **Tipografías del tráiler** (2026-11-16): `@fontsource/instrument-serif`, `@fontsource-variable/instrument-sans` y `@fontsource-variable/geist-mono`, las tres 5.3.0, en `apps/trailer`. Son las mismas de la app (SIL OFL 1.1; `assets/ASSETS.md`).
- **Unity 6000.3.28f1** en `D:\Unity\Editor`, con WebGL y Windows IL2CPP.
- **Unity 6000.4.2f1** se queda instalada: la usa el proyecto de prueba de la carpeta del Tec, y René decidió dejarla (2026-11-07).
- **.NET SDK 10.0.403** en `D:\dotnet-sdk`.

### Pendiente del visor

- **Color del caso:** los modelos marcan sus piezas de pintura en `extras.role`, y glTFast no lo importa por defecto. Por ahora salen con su color de fábrica.
- **Bicicleta y scooter:** no tienen modelo; son una caja de sus medidas hasta U3.
- **Sin implementar aún:** `calidad` (U5), `capturar` y `modoEdicion` (U6), y las cámaras que no son cenital u órbita (U4). Hoy contestan con `error`.
- **La leyenda ilustrativa** todavía no sale en el visor: llega con el escenario y las cámaras.
- **La medición en la MacBook M1:** la corre René con la liga.

- **De W5 (2026-11-10), para el siguiente build y para U6:**
  - `TerrenoVista.cs` ya dibuja el tope como arco de círculo, igual que el solver (antes, cos²). El build publicado (`6337b65c1db3110f`) todavía lleva el anterior: entra en el siguiente.
  - La quinta escena de D1 (`terraceria`) sale ahora de `fixtures/caso3d/terraceria_topes.json`, con el resultado del solver sobre el terreno (z, cabeceo, alabeo y `cruce_tope`).
  - En la web, la malla de relieve del caso está en `Reconstruccion.relieve` (en metros de la escena, altura 0 en el impacto). Al integrar `<VisorUnity>` (U6), pásala a `armarCaso3d` como `relieve`.

## Tráiler (2026-11-16, ADR 0119)

René aprobó el storyboard versión 2 (28 s, «más épico», sin la mancha negra del impacto) y pidió construirlo. El storyboard está en https://claude.ai/artifact/31WivpWPStddS7SBaGJ5F1.

### Qué quedó

- **La composición** (`apps/trailer/src/Trailer.tsx`), la misma para los tres formatos (`Trailer`, `Trailer4K`, `TrailerVertical`):
  - `escenas/Papel.tsx`, de 0 a 18 s: el trazo que se vuelve calle, los vehículos hasta el contacto, el mundo que se invierte a noche con la onda del golpe, la evidencia que cae en sus casillas y las simulaciones que se reducen a una.
  - `escenas/Frases.tsx`, de 18 a 23.5 s: «La IA lee. La física decide. El perito firma.», con el relato y sus citas, la nube de simulaciones y la hoja firmada.
  - `escenas/Logo.tsx`, de 23.5 a 28 s: el logotipo de la marca, armado pieza por pieza.
- **El pulso** (`ritmo.json`): una sola rejilla para la imagen y la música.
- **Los datos** (`datos/caso.json`, de `tools/trailer/datos-caso.mts`): la escena inventada `nocturno_lluvia`, su Resultado y el Monte Carlo del solver. Ningún número a mano.
- **La música** (`tools/trailer/musica.mjs`): original, compuesta en código. Sale idéntica con la misma semilla.
- **Las tomas del 3D para la RTX** (`tools/trailer/tomas-rtx.mjs` y `tools/colaborador/desde-release.ps1 -Paso trailer`, un paso más de la tanda 4): seis secuencias a 3840×2160 en ultra, con el visor de escritorio del release `rtx-t4`.

### Evidencia

- Pruebas unitarias de `apps/trailer` (la cámara, el pulso, los datos y los cortes): en verde.
- La música: el silencio antes del golpe final es real y el golpe empieza en el segundo que marca `ritmo.json` (comprobado en el audio del archivo renderizado).
- Los renders de previo y lo que tardó cada uno: `eval/results/trailer_render_trailer.json`, `trailer_render_trailervertical.json` y `trailer_render_trailer4k.json`.

### Correcciones tras el primer previo (René, 2026-11-17)

- El lápiz, modelado en 3D con su sombra y un trazo de grafito; los vehículos, con los modelos 3D de la app dibujados en tinta; el título de la evidencia, sobre una zona limpia; la música, sin silencio al final; y el logo, que se escribe con una cosa por letra. El detalle está en el ADR 0119.
- Hay un previo nuevo, solo a 1920×1080: `trailer-salida/croquis-trailer-previo-1920x1080.mp4` (`eval/results/trailer_render_trailer.json`). Los de 4K y vertical que hay en la carpeta son del previo anterior.
- Las tomas del 3D que pide el tráiler no cambiaron: las mismas seis secuencias de `tools/trailer/tomas-rtx.mjs`.
- Para volver a renderizar hacen falta, una vez: `node tools/trailer/modelos-tinta.mjs` (la geometría de los vehículos) y `node tools/trailer/musica.mjs`.

### Lo que falta

- **Las tomas reales del 3D.** Los archivos que hay en `trailer-salida/` son previos (`-previo` en el nombre): en los huecos del 3D llevan las fotos de prueba a 720p que se tomaron en la laptop el 2026-11-14, de otras escenas inventadas. Sirven para revisar el ritmo, no para entregar.
- **Para terminar:** que el colaborador corra la tanda 4 y mande `croquis-tomas-trailer.zip`. Se descomprime en `trailer-salida/tomas/` y se corre `node render.mjs Trailer`, `Trailer4K` y `TrailerVertical` (sin `--previo`) desde `apps/trailer`.
- **El modo foto con secuencias no se ha probado en la RTX.** El plan usa los mismos campos de las 15 fotos promo; si alguna cámara no encuadra bien, se ajusta en `tomas-rtx.mjs`.
- **Nadie ha oído la música.** Se revisó por números (el arco de fuerza, el silencio, los golpes en su sitio y que haya medios para bocinas chicas). René la tiene que oír.

### Resumen para René

- **Qué quedó:** el tráiler completo en código, con música original, en los tres formatos. Los previos están en `trailer-salida/`.
- **Cómo probarlo:** abre `trailer-salida/croquis-trailer-previo-1920x1080.mp4`. Para volver a renderizar: `cd apps/trailer` y `node render.mjs Trailer --previo`.
- **Qué necesito de ti:** que oigas la música y me digas qué cambiar, y las tomas de la RTX (la tanda 4).

## Portada con el estilo de la app (2026-11-24, rama `feat/portada-estilo-app`, ADR 0125)

- **Plan:** rehacer `/` y `/en` con el sistema «Laboratorio», sin tocar /cesvi, el solver ni `tools/colaborador/`.
- **Qué se hizo:** página nueva en `components/portada-v3/`, cifras del índice único, capturas reales de día y de noche, logo en vez del nombre escrito. Se quitaron las tomas de video y los datos de AXA.
- **Evidencia:** `e2e/home.spec.ts` (@flujo), `textos.test.ts` y `portada-cesvi.test.ts`. Lighthouse y peso de antes y después, en el PR.
- **Segunda vuelta (René, 2026-11-24):** capturas de producción sin cifras de la reconstrucción, respaldo WebP, precarga y tamaños de la foto del inicio, y el lugar del video con su botón de pausa. Probada en Chromium 156, WebKit 27.2 y Firefox 157 (de Playwright); WebKit cortaba los descendentes del titular y se corrigió.
- **Tercera vuelta (René, 2026-11-24):** titular en dos frases sin el logo; el indicador de los pasos se calcula de la posición (antes, un salto largo dejaba marcado el paso anterior) y sus pestañas se tocan; en Dictamen, dos páginas del PDF de un ejemplo inventado (el spec falla si traen «km/h», «kJ» o «AXA»); póster con los dos autos enteros.
- **El video lo agrega el Claude Code de René, en esta rama:** con `RECURSOS_READ_WRITE_TOKEN` en el entorno, `node apps/web/scripts/portada-video.mjs <tráiler.mp4> <inicio_s> <duración_s>` corta, comprime, sube a Blob y cambia solo `video.json`, que es lo único que se confirma. El póster es la foto aprobada y no se toca.
- **Siguiente paso:** el video y el visto bueno de René a las capturas; después, fusionar #313.

## Ronda final del 3D (Alberto, 2026-11-26)

Alberto lleva todo lo de Unity y René con su Claude Code, el solver y la web. El contrato está en `docs/contrato-unity.md`. Cada punto va en su PR contra `main`, y los fusiona el Claude Code de René con CI en verde.

| Punto           | PR                    | Qué quedó                                                                                                                                                                                                                                                          |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Daños        | #336                  | Hundimiento exacto C1–C6 (`dano.perfil_m`), arrastre de lado por la PDOF (como mucho la mitad de C), pliegues del 16 % de C desde 3 cm (completos desde 15 cm) y solo dentro de la cara, malla refinada a 6 cm en la zona dañada, y `danos_posteriores` en su `t`. |
| 2. Pedazos      | #338 (encima de #337) | Vidrio templado, plástico y lámina, con vuelo, rebote, arrastre y reposo de fórmula cerrada (`Croquis.Core.Pedazos`). Un pedazo por cada 1,200 J (entre 4 y 240), y uno por impacto.                                                                               |
| 3. Cámara lenta | #337                  | Escalón en vez de rampa y letrero «Cámara lenta ×N» (×5 en el impacto, por la velocidad que manda la web).                                                                                                                                                         |
| 4. Entorno      | #339 (encima de #335) | Camellón desde `red_vial` de OSM: quita lo que el plan puso adentro (43 edificios y 16 postes en Paseo Tollocan) y le pone pasto, guarnición, matas y árboles. Paisaje árido con `entorno.paisaje`.                                                                |
| 5. «¿Y si…?»    | #340                  | Mismo reloj que la reconstrucción en una hipótesis, su propio daño y letrero «Hipótesis».                                                                                                                                                                          |
| Contrato        | #335                  | `escenario.entorno.paisaje` (`arido` o `templado`), opcional; lo calcula la web con la cobertura de OSM.                                                                                                                                                           |

### Evidencia

- `dotnet test` de `Croquis.Core` en verde en cada rama (de 116 a 120 pruebas según la rama; 128 con todo junto).
- Capturas de antes y después en `docs/progress/capturas/2026-11-26/` (editor, nivel media) y del build WebGL para los letreros. Los casos son fixtures inventados; ninguno de AXA ni de CESVI.
- **El build WebGL desde la Mac (M1, 16 GB), con Unity 6000.3.28f1:** 193 s con `Library` ya importada (`BuildPlayer`: 2 min 54 s, 0 errores); 70 MB en `apps/visor-unity/Build/web`. El comando está en #337.

- **Ajustes pedidos por René (2026-11-26), PR aparte porque #336, #338 y #339 ya estaban fusionados:**
  - **Daño:** la profundidad se cuenta desde el frente real de la carrocería, no desde la caja (las esquinas redondeadas recibían menos de C). Medido en la malla, el sedán llega a C1 con 52.0 de 52.2 cm. En la van, la lámina más cercana a C1 está 12 cm hacia dentro y ahí da 45.5 donde el solver pide 44.8; la esquina nominal no tiene lámina. Las demás estaciones quedan dentro de 2 cm o 6 %. Hay capturas cenitales con el perfil dibujado (`Capturas -perfil`, vista `planta:<vehículo>`).
  - **Pedazos:** tamaño mínimo visible y vidrio con brillo, con la misma cantidad.
  - **Árido:** cerros ocres y niebla de polvo de día.

### Instalado (Mac de Alberto)

- Unity 6000.3.28f1 (arm64) con WebGL, con el CLI `unity`.
- .NET SDK 10 en `~/.dotnet`, para `dotnet test`.

### Pendiente

- El mensaje `fantasma` del puente 1.4.0 (cambiar la hipótesis sin recargar) sigue propuesto.
- Los letreros de pantalla no salen en las capturas del editor (`Capturas.cs` renderiza la cámara a una textura). Para verlos hay que usar el build WebGL.

### Cierre para la t11 (Alberto, 2026-11-26, con permiso de René para fusionar)

El Claude Code de René estaba detenido. Mientras tanto, René me autorizó a fusionar con CI en verde los PR que no tocan cifras.

**Fusionados:**

- #345 (contrato del daño medido) → #358 (Unity dibuja los C1–C6 medidos);
- #354 (puente 1.4.0, mensaje `leyenda`) → #355 (Unity) y #360 (web: una sola leyenda en Presentar; «Salir · Esc» con fondo);
- #356 (cámara «Desde la acera»), #357 (recorrido visual versionado);
- #359 (respaldo por clima del paisaje, Köppen-Geiger 1991–2020, solo México);
- #361 (sin casas en la isla de las glorietas).

**Pendiente:** #362 («¿Y si…?» en el 3D al simular) va encima de #334 y entra después de él.

**La pregunta de #345 (ancho y centro de lo medido):** se respondió leyendo el solver de #349. `medido_m` va sobre el mismo `ancho_m` (el medido) y el mismo `centro_m` (de la zona del CDC) que `perfil_m`.

### Release para la t11

- **El release:** `visor-web-932aa256f4466ebc`, compilado desde `main` en 0a02044e: 78 s, 0 errores, 36.2 MB, sin archivos de Mac.
- **Puente 1.4.0:** necesita una web con #354. La web de la t10-final (03340cb4) no acepta la 1.4.0 y abre el visor ligero.
- **El recorrido con este build** (`e2e/revision-3d.spec.ts`, web local de `main`): los cinco ejemplos, Tollocan, Reforma y la carretera Hermosillo–Bahía de Kino, 8 de 8.
  - Ningún vehículo dentro de un edificio ni saltos de trayectoria.
  - Una sola leyenda en Presentar.
  - La isla de la glorieta de Reforma, sin casas.
  - Bahía de Kino sin cobertura de OSM: `paisaje: arido` (el clima).
  - En el punto de la carretera donde OSM sí trae cobertura, sale «templado» porque OSM manda. Es la Costa de Hermosillo, zona agrícola; no lo confirmé con OSM.
- **El «¿Y si…?»** se revisó en el build nuevo con el paquete de la hipótesis: cámara lenta ×5, letreros «Hipótesis» y fantasma.
- **Lo que queda en la calzada,** según el paquete de la web:
  - el árbol del caso de Tollocan (`obj-1`, evidencia): para René;
  - una luminaria del plan de la web, que Unity lleva a la orilla (#352).

### t10-final (rama `resultados/t10-final-2026-11-26-msi-k47`, commit 03340cb4, RTX 4070)

Revisión sin publicar nada: publicar lo hace el Claude Code de René.

| Paso                                          | Estado                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| comprobación: dependencias, solver en reversa | ok                                                                                                        |
| visor (build `dd83b2d3`), preparar, humo      | ok                                                                                                        |
| ejemplos                                      | ok (5 de 5)                                                                                               |
| tres narraciones de René                      | ok (3 de 3)                                                                                               |
| **final-unity**                               | **falló:** «No tests found». `playwright.produccion.config.ts` no incluye `final-unity` en su `testMatch` |
| video-3d                                      | ok                                                                                                        |
| arranque-1, arranque-2, arranque-3            | **no corrieron** (no están en `corrida.json`)                                                             |

- Los ejemplos se guardaron en `eval/results/t9/ejemplos.json` y las narraciones en `eval/results/t9/`, no en `eval/results/t10/` como dice `tandas.json`. El comando que quedó en el registro usa `-Salida eval/results/t9/ejemplos.json`.

**Contra el índice** (`eval/results/cifras.json` de la misma rama), en km/h:

| Caso          | t10        | Índice     | Diferencia                                           |
| ------------- | ---------- | ---------- | ---------------------------------------------------- |
| Crucero (A)   | 20 (5–26)  | 20 (5–26)  | coincide                                             |
| Alcance (A)   | 54 (49–55) | 53 (49–56) | mejor +1 (+1.9 %), p90 −1 (−1.8 %)                   |
| Carambola (A) | 25 (20–32) | 25 (20–32) | coincide                                             |
| Reversa (B)   | 20 (16–25) | 20 (16–25) | coincide                                             |
| Poste (B)     | 63 (43–65) | 61 (37–64) | mejor +2 (+3.3 %), p10 +6 (+16.2 %), p90 +1 (+1.6 %) |
| AXA (V2)      | 57 (55–78) | 57 (55–78) | coincide                                             |

El alcance y el poste no coinciden con el índice. Va para René, sin tocar el solver ni las cifras.

## Necesito del otro frente

- Que la web calcule `escenario.entorno.paisaje` (#335) con la cobertura de OSM alrededor del lugar. Sin él, el visor se queda en «templado».

### Resumen para René

- **Qué quedó:** los cinco puntos, uno por PR (#336 a #340), más el contrato #335.
- **Orden para fusionar:** #335 → #339; #337 → #338; #336 y #340 en cualquier momento.
- **Cómo probarlo:** las capturas de cada PR. Con el build WebGL de `main` ya fusionado: Paseo Tollocan (Metepec) muestra el camellón, y cualquier choque muestra «Cámara lenta ×5» al reproducir.
- **Qué necesito de ti:** el `paisaje` en la web y publicar el build WebGL a Blob (no tengo el token).

## Necesito del otro frente

Nada por ahora.

## Bloqueado

- Nada. (La medición de alta y ultra en la computadora con tarjeta de video llegó el 2026-11-12: `eval/results/e6_unity_escritorio.json`.)

## Demo con CESVI (2026-11-27)

- **Roce sin deformación** (`feat/u-roce`): en la reversa publicada el CR-V roza al Versa (1 349 J y 1 642 J, el 13 % y el 29 % del umbral de CRASH3 A²/2B·L de cada cara), y la lámina no se hunde, como debe ser. Unity ahora dibuja en la zona del CDC (`ancho_m` alrededor de `centro_m`, a la altura de la estructura) rayones, una banda tenue de abrasión y la pintura del otro vehículo, sobre la lámina real y sin mover un vértice; cuántos y qué tan marcados va con E / (A²/2B·L) (`Core/Rozadura.cs`, 4 pruebas; `Visor/RozaduraVista.cs`). Sobre pintura clara el rayón es oscuro; sobre oscura, claro. Capturas: `capturas/demo/2-roce-versa-*.jpg`.
- **Nada procedural sobre la vía** (`fix/u-nada-en-la-calzada`; René: en el video de AXA la cerca de alambre cruzaba los carriles): #352 solo llevaba a la orilla señales, postes, árboles y luminarias a 0.6 m o más dentro de la calzada, y #339 quitaba las cercas que _empezaban_ en el camellón. Las cercas que el plan rural traza a 6 m de un cuerpo y 40 m hacia afuera caen sobre el otro cuerpo de la carretera. Regla general en `Core/Calzada.cs`: nada del plan del entorno toca la calzada ni el acotamiento; postes, señales, luminarias y árboles van a la orilla (o se quitan), las cercas se cortan donde cruzan y los edificios y bardas encima se quitan; en `CarreteraVista`, los matorrales y las señales de la orilla tampoco caen en el otro cuerpo. Prueba: `CalzadaTests` mide en los datos de 16 escenas (la batería de ciudad, con AXA en la MEX 15D, Tollocan, Reforma, Insurgentes, el centro de Toluca, Metepec, Guadalajara y Monterrey, más dos nuevas: la MEX 57 de dos cuerpos y la SON 100 de dos carriles en Sonora) que nada procedural quede sobre la vía; en AXA, sin el arreglo, 11 cercas cruzaban. Antes del arreglo: Metepec 94 árboles, 19 postes, 20 señales y 59 edificios sobre la vía; MEX 57 20 árboles y 17 edificios. Capturas: `capturas/demo/3-calzada-mex57-*.jpg`; las de AXA, solo en local.
- **La cámara «Automática» del video** (`feat/u-camara-automatica`, puente 1.5.0, contrato #371): la llegada desde arriba y de lado; el impacto de cerca, perpendicular a la línea entre los vehículos y del primer lado desde el que el contacto se ve sin nada en medio (edificios, copas y los propios vehículos, `Core/CamaraAutomatica.cs`, 7 pruebas); el final desde arriba. `depurar` `{"contacto": true}` proyecta el punto de contacto y revisa el rayo: en el impacto, AXA, el alcance y el crucero dan fx ≈ 0.50, fy ≈ 0.50 y despejado (`e2e/camara-video-real.spec.ts`, Unity real). Capturas: `capturas/demo/4-camara-*.jpg`.

### 4 · Auditoría de fidelidad de calles (2026-11-27, `feat/w-auditoria-calles`)

`eval/auditoria_calles.py` → `eval/results/auditoria_calles.{json,md}`. Compara, junto al punto del choque, las etiquetas de OSM de la vía con lo que dibuja el 3D. Del 3D toma una sección transversal del paquete caso-3d: calzadas, rayas (juntando 10 m de vía para no perder una raya discontinua; la doble amarilla cuenta como una), acotamiento, camellón, guarniciones y dispositivos. Si el choque cae en un cruce, recorre la vía principal hasta 60 m y toma la primera sección limpia. 11 lugares, 3 de ellos nuevos (Viaducto en La Piedad, Periférico en CU, Circuito Interior en Río Mixcoac).

| Calle                            | Qué                          | Etiqueta de OSM                                        | Qué dibuja el 3D                                                                                                   | ¿Bien?  |
| -------------------------------- | ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------- |
| Paseo Tollocan (Metepec)         | carriles                     | lanes=2, oneway=yes                                    | 2 en 6.9 m                                                                                                         | bien    |
| Paseo Tollocan (Metepec)         | pasos peatonales             | 1 a menos de 80 m                                      | ninguno                                                                                                            | mal     |
| Centro de Toluca (sentido único) | ancho                        | width=7                                                | 6.9 m                                                                                                              | bien    |
| Centro de Toluca                 | semáforos                    | 1                                                      | ninguno                                                                                                            | mal     |
| Centro de Toluca                 | pasos peatonales             | 2                                                      | ninguno                                                                                                            | mal     |
| Reforma (glorieta del Ángel)     | dos cuerpos                  | 8 vías del otro sentido                                | 2 calzadas, 87.8 m de separación (la glorieta)                                                                     | bien    |
| Reforma                          | carriles                     | lanes=3                                                | el choque cae en la glorieta                                                                                       | revisar |
| Reforma                          | semáforos                    | 6                                                      | ninguno                                                                                                            | mal     |
| Reforma                          | pasos peatonales             | 6                                                      | ninguno                                                                                                            | mal     |
| Insurgentes (glorieta)           | carriles                     | lanes=2, oneway=yes                                    | 3 en 7.0 m (a 20 m)                                                                                                | mal     |
| Insurgentes                      | dos cuerpos y lateral        | 3 vías del otro sentido; Av. Oaxaca                    | 4 calzadas                                                                                                         | bien    |
| Insurgentes                      | paso a desnivel              | Chapultepec, Oaxaca y la glorieta con `layer`/`bridge` | todo a ras del piso                                                                                                | mal     |
| Viaducto (lateral)               | carriles                     | lanes=2, oneway=yes                                    | 2 en 6.9 m (a 20 m)                                                                                                | bien    |
| Viaducto                         | dos cuerpos y laterales      | 10 vías del otro sentido                               | 5 calzadas                                                                                                         | bien    |
| Viaducto                         | paso a desnivel              | Av. Coyoacán y Patricio Sanz                           | todo a ras del piso                                                                                                | mal     |
| Viaducto                         | semáforos / pasos peatonales | 6 / 15                                                 | ninguno / ninguno                                                                                                  | mal     |
| Periférico (CU)                  | carriles                     | lanes=3, oneway=yes                                    | 10 divisiones en 28.1 m                                                                                            | mal     |
| Periférico                       | dos cuerpos y laterales      | Ruiz Cortines y una de servicio                        | 5 calzadas                                                                                                         | bien    |
| Periférico                       | segundo piso                 | Autopista Urbana Sur (elevada)                         | dibujada a ras, encima del Periférico: por eso los 28.1 m                                                          | mal     |
| Circuito Interior (Río Mixcoac)  | carriles                     | lanes=2, oneway=yes                                    | 2 en 6.9 m (a 10 m)                                                                                                | bien    |
| Circuito Interior                | dos cuerpos                  | 2 vías del otro sentido                                | 3 calzadas                                                                                                         | bien    |
| Circuito Interior                | banquetas                    | sidewalk=right                                         | sin banqueta ni guarnición                                                                                         | mal     |
| Circuito Interior                | puente                       | el propio Circuito                                     | a ras del piso                                                                                                     | mal     |
| MEX 15D (AXA)                    | carriles y dos cuerpos       | lanes=2, oneway=yes; otro cuerpo                       | 2 carriles; 2 calzadas, 11.5 m de camellón                                                                         | bien    |
| MEX 57 (dos cuerpos)             | lateral                      | una vía de servicio                                    | 1 calzada                                                                                                          | mal     |
| SON 100 (dos carriles)           | carriles                     | lanes=2                                                | 2, con doble amarilla y líneas de orilla (verificado desde arriba; el script cuenta 3 porque cae junto a un cruce) | bien    |

**Lo que no llega al paquete:** de la vía solo pasan `lanes`, `oneway` y a veces `width`. No llegan `lanes:forward`/`backward`, `sidewalk`, `bridge`/`layer`, `turn:lanes`, semáforos ni cruces peatonales. Ninguna escena de ciudad trae banquetas ni guarniciones. Los semáforos y pasos peatonales que se dibujan son solo los que declara el caso.

**Para René (tocan la red vial que usa la escena, así que no los cambié):**

- Las vías elevadas (`bridge`/`layer`) entran a `red_vial` a ras del piso. En el Periférico, la Autopista Urbana Sur queda encima de los carriles. En Insurgentes, Viaducto y Circuito Interior, los pasos a desnivel salen planos. Un vehículo podría colocarse en la vía equivocada.
- La lateral de servicio de la MEX 57 no sale como calzada aparte.
- El ejemplo del alcance narra una carretera de dos cuerpos, pero su lugar está en zona urbana.

**Siguiente para Unity y la web sin cifras:**

- semáforos de OSM como postes sin fase (sin inventar luces);
- pasos peatonales de OSM como capa `paso_peatonal`;
- banquetas donde OSM dice `sidewalk`.

Los tres necesitan pasar la etiqueta en el paquete (PR aparte).

- **El trayecto previo en Unity** (`feat/u-trayecto-previo`, contrato #375): antes de `t_inicio` el vehículo va por `trayecto_previo` (`Core/Previo.cs`). Se dibujan la ruta punteada en azul claro, la calle lejana como franja de asfalto sobre el suelo de la escena y un piso grande ligero, sin edificios lejos. El letrero «Trayecto ilustrativo: no es evidencia» se ve también en pausa, porque así se graba el video. La reproducción empieza donde empieza el trayecto más largo. La cámara automática sigue al vehículo y en 1.5 s pasa a la llegada, el impacto y el final de siempre. Medido en la MacBook M1 con 5.8 km y 1 210 puntos (`tools/unity/medir-trayecto.mjs` → `eval/results/u_trayecto_previo/medicion.json`): carga en 2.9 s; 14.5 fps (p50) siguiendo al vehículo, contra 14.5 a 17.5 fps con el choque quieto. El trayecto no los baja; esta Mac, bajo Playwright, dibuja la escena completa a esa velocidad. Capturas: `capturas/demo/5-trayecto-t*.jpg`.
- **Defensas en Paseo Matlatzincas** (`fix/u-matlatzincas`, René, 2026-11-27): las «cercas en medio de los carriles» eran las defensas metálicas del plan de la web (`via.barreras`, 36 en el caso). Algunas cruzan los carriles en los enlaces, y #372 no las cubría: el release 8a302a25 todavía las dibujaba. Ahora `Calzada.Despejar` corta cada defensa donde se mete 40 cm o más en la calzada o el acotamiento; las de la orilla se quedan. El caso entra a la batería (`caso3d-ciudad/matlatzincas.json`, extracto `matlatzincas_rene`) y `CalzadaTests` lo mide. Capturas: `capturas/demo/7-defensas-matlatzincas-{dd83,8a30,despues}.jpg`.

- **2026-11-27 · Cámaras sin copas ni troncos encima y defensas fuera del recorrido (Alberto, `fix/u-copa-cenital`).** «Desde arriba» ya no dibuja las copas de los árboles (capa 30); el tronco y la sombra sí se ven. Antes, la copa del árbol del choque tapaba el coche en Matlatzincas y en Toluca. La cinematográfica y la automática rodean troncos, postes, luminarias y los objetos del caso, salvo el que está en el punto que se mira. Las defensas del mapa se cortan donde pasa un vehículo del caso (`Calzada.AbrirPasoEnBarreras`, con prueba en Core sobre las defensas de Matlatzincas). Capturas en `docs/cesvi/ronda-4/evidencia/camaras-copas/`.
