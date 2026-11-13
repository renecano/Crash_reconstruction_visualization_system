# ADR 0115 — U5: calidad y rendimiento del visor Unity

- **Fecha:** 2026-11-10
- **Estado:** aceptada
- **Contexto:** El plan v4 (§3.3, U5) pide los cuatro niveles de `PLAN.md` §7.8 en el visor Unity, la calidad automática con las reglas de la web (nunca sube; baja un nivel si los fps quedan debajo de 24 durante 5 s; con tope de dpr), un panel de diagnóstico y la medición: en la laptop, el build WebGL en media; en una computadora con tarjeta de video, el de escritorio en alta y ultra. El presupuesto de §7.8 es media ≥ 60 fps y baja ≥ 30 fps a 1080p en la laptop, y ≥ 60 fps en alta o ultra en la computadora de demo. Hasta U4 había dos ajustes fijos por destino del build: «media» en la web y «alta» en el escritorio.

## Decisiones

1. **Cuatro niveles de `QualitySettings`, cada uno con su canalización URP** (`ConstruirVisor.Niveles`): `URP_baja`, `URP_media`, `URP.asset` (alta, el de antes) y `URP_ultra`. Los dos builds llevan los cuatro; el nivel se cambia en tiempo de ejecución sin recargar.
   - **Media y alta son los ajustes que ya tenían** el build web y el de escritorio en U2: pasarlos a niveles no cambia su aspecto.
   - **Baja** recorta densidad, no funciones: sombras del sol a 50 m en una cascada, sin MSAA, sin oclusión ni resplandor, dpr 0.75, la mitad de matas y dos luminarias con luz real. Faros, alumbrado, lluvia, evidencias y marcadores siguen en los cuatro niveles (prueba `CadaNivelTieneAlMenosLoDelDeAbajo`).
   - **Ultra** agrega sobre alta: sombras a 150 m, suavizado de sombra alto, mapa de sombras de focos de 4096, sonda de 512, dpr hasta 2, más matas y ocho luminarias con luz.
   - **Los perfiles viven en el núcleo** (`Croquis.Core.Calidades`), sin Unity, y se prueban con `dotnet test`.
2. **Lo del escenario se lee al armar el caso** (matas, luminarias con luz, focos por faro, sonda); la canalización (sombras, MSAA, luces, oclusión, resplandor, escala) cambia de inmediato. Si el automático baja a media sesión, el escenario toma el nivel nuevo al cargar el siguiente caso.
3. **Calidad automática con las reglas de la web** (`CalidadAutomatica`): arranca en media en la web; en el escritorio, en alta con tarjeta dedicada y en media con una integrada; en teléfono, en baja. Ultra solo se elige a mano. Nunca sube; baja un nivel cuando los fps de una ventana de 5 s quedan debajo de 24, y vuelve a medir desde cero. La carga del caso y los cuadros de más de 1 s no cuentan.
4. **Tope de dpr por nivel** (baja 0.75, media 1, alta 1.5, ultra 2): la escala de dibujo de URP es `min(1, tope / dpr de la pantalla)`. Nunca sobremuestrea. La página del build limita el lienzo a dpr 2.
5. **El puente no cambia:** `calidad` ya estaba en el contrato 1.1.0 (`baja`, `media`, `alta`, `ultra`, `auto`). Fijar un nivel apaga el automático; `auto` lo vuelve a encender desde el nivel actual.
6. **Panel de diagnóstico** (`PanelDiagnostico`), para medir y para soporte, no para el perito: nivel y por qué bajó, fps y tiempo de cuadro, pantalla, dpr y escala, sombras, MSAA, luces, GPU, llamadas de dibujo y memoria. Se abre con F3, con `?diagnostico=1`, con `-diagnostico` en el escritorio o con `depurar` `{"diagnostico": true}`.
7. **Medición con el protocolo de E6** (ADR 0026): navegador nuevo por medición, sin vsync, tres repeticiones en orden alterno, mediana, modo «Mejor rendimiento» y condiciones registradas.
   - **Web:** `eval/e6_unity.mjs` → `eval/results/e6_unity_web.json`, a 1920×1080, con el nivel fijo y la cámara cinematográfica en bucle.
   - **Escritorio:** el mismo programa mide si se abre con `-caso` (`Medicion`); `tools/unity/medir-escritorio.ps1` corre un proceso por medición y escribe `e6_unity_escritorio.json`. `tools/unity/paquete-escritorio.ps1` arma el paquete que se corre en la computadora con tarjeta de video.
8. **El escritorio se compila con Mono, no con IL2CPP.** IL2CPP necesita las herramientas de C++ de Visual Studio, que la laptop de desarrollo no tiene. Lo que se mide es el costo de la GPU, que no depende del backend de scripts.

## Optimización de media (2026-11-11)

La primera E6 dio media entre 13.9 y 23.6 fps a 1080p (`eval/results/e6_unity_web.json`), contra una meta de 60. René pidió optimizar primero sin cambiar el aspecto, midiendo cada cambio; después, escala de dibujo; y, si no alcanza, detenerse con cifras y opciones. Alta y ultra no se tocan.

**Cómo se midió.** `eval/u5_perfil.mjs` (interruptores de `depurar` en un solo build, `Perfilado.cs`), `eval/u5_cpu.mjs` (perfil de CPU de Chromium, con símbolos si el build se hace con `CROQUIS_SIMBOLOS=1`), `eval/u5_diferencia.mjs` (diferencia por pixel contra la captura base; dos tomas de la base dan 0 en escenas sin lluvia) y `eval/e6_unity.mjs` en tres escenas (`axa-dia`, `lateral_interseccion-noche`, `nocturno_lluvia-noche`).

**Qué se encontró.**

- A 1080p manda el costo por pixel. Con el modelo `ms = F + P · escala²`, la media original tenía P de 33 ms de día y 57 de noche, y F (lo que no depende de la resolución) de unos 14 ms.
- Con todo apagado (sin oclusión, sombras, luces, MSAA, posproceso ni minimapa) y a resolución completa, el cuadro tardaba 18 ms de día y 28 de noche: **a 1080p nativo esta GPU integrada no llega a 60 fps ni con la escena pelada.** La escala de dibujo hace falta en cualquier caso.
- Cada cuadro repetía la geometría unas 3.6 veces: la pasada de normales para la oclusión, dos cascadas de sombra, la vista y el minimapa.
- CPU: la piel de las personas se deformaba cada cuadro aunque estuvieran quietas (unos 3 ms, `u5_cpu_1_simbolos_escala025.json`), y la lluvia genera su geometría por cámara (unos 5 ms con el minimapa, `u5_cpu_2_nocturno_lluvia-noche.json`).
- El suelo se sombreaba tres veces (pasto, tonos y parcelas, cada capa con su iluminación completa).

**Decisiones (baja y media).**

9. **Minimapa con fondo horneado:** la escena fija se dibuja una vez en una textura; por cuadro solo los vehículos, los peatones y las evidencias. Cambia el minimapa en dos detalles: los vehículos se ven aunque pasen bajo un árbol, y de noche no muestra la mancha de los faros.
10. **Poses fijas:** mientras la postura no cambia, la piel ya deformada se dibuja como malla común. En todos los niveles; se ve igual.
11. **Una cascada de sombra de 2048 a 70 m** en vez de dos de 1024 a 80 m: diferencia de 0.04 niveles de 255 (`u5_diferencia_pasos_2_a_4.json`).
12. **Oclusión ligera:** normales reconstruidas de la profundidad, menos muestras, desenfoque medio y aplicada después de los opacos. Diferencia de 0.15 a 0.46 en las escenas sin lluvia.
13. **FXAA en vez de MSAA 2×.** Con la oclusión ligera evita la pre-pasada de profundidad. Es el único cambio de esta lista que se nota: los bordes cambian (1.3 a 1.8 de diferencia media; 3.8 a 4.5 % de los pixeles cambian más de 8 niveles).
14. **El suelo en una pasada** (`Croquis/Suelo`): el Lit de URP con otra función de superficie, que mezcla tonos y parcelas antes de iluminar. Diferencia de 0.06 a 0.08 (`u5_diferencia_pasos_5_y_6.json`).
15. **Sombras unidas** (`SombrasUnidas`): las piezas opacas de cada vehículo y del escenario proyectan con una sola malla. Diferencia de 0 a 0.01 (`u5_diferencia_sombras_unidas.json`).
16. **El posproceso se interpola solo cuando cambia** (`Calidad.RefrescarPosproceso`), no en cada cuadro y cámara. En todos los niveles.
17. **La lluvia no se dibuja en el minimapa.**
18. **De noche la luna no proyecta sombra:** 0.28 de diferencia media en la escena urbana (0.46 % de los pixeles cambian más de 8 niveles).

**Probado y descartado.**

- **Luces por zona (Forward+):** cambia la luz de noche de forma visible y no gana fps; de día cuesta (la ganancia del suelo unido, de 25 a 31 fps en `axa-dia`, se perdía).
- **IL2CPP optimizado para velocidad y WebAssembly 2023:** sin ganancia medible (`u5_paso8_wasm_2023_*` contra `u5_paso7_wasm_anterior_*`), y el build pesa más.
- **«Depth priming»:** URP lo desactiva en WebGL.
- **FSR para reescalar:** URP no lo admite en WebGL 2; la escala de dibujo se reescala con filtro lineal.
- **Gradación en HDR:** al conmutar en vivo rompe el color; no se siguió.

**Dónde quedó** (mediana de 2 repeticiones, fps a 1080p; `eval/results/u5_paso_*.json`):

| Paso                                                | axa, día | lateral, noche | lluvia, noche |
| --------------------------------------------------- | -------- | -------------- | ------------- |
| Base (E6, 3 repeticiones)                           | 22.6     | 13.9           | 18.5          |
| 1. Minimapa y poses horneados                       | 25.0     | 15.3           | 16.9          |
| 2. Una cascada                                      | 24.7     | 15.7           | 19.5          |
| 3. Oclusión desde la profundidad                    | 25.9     | 17.3           | 21.5          |
| 4. FXAA sin MSAA y oclusión después de los opacos   | 32.5     | 19.4           | 25.0          |
| 5. Suelo y sombras unidos, posproceso, con Forward+ | 31.0     | 19.3           | 25.2          |
| 6. Sin sombra de luna (interruptor sobre el paso 5) | 33.8     | 22.0           | 28.2          |
| 7. Sin Forward+ (una repetición)                    | 35.7     | 23.7           | 26.2          |

En el paso 1 las personas salían gigantes por un error del horneado (malla sin la escala del modelo); se corrigió antes del paso 5, así que los pasos 1 a 4 llevan ese sesgo.

Con el paso 7, una repetición por escala (`eval/results/u5_paso7_wasm_anterior_escala_*.json`): a 0.6, 63.4 / 49.2 / 47.1 fps; a 0.35, 81.9 / 80.4 / 66.9. De ahí, F de 8.9, 8.0 y 11.7 ms y P de 19, 34 y 27 ms: 60 fps pedirían una escala de 0.64, 0.50 y 0.43.

**E6 completa (2026-11-11, 10 escenas, 3 repeticiones, cadena reanudable `eval/u5_cadena.mjs`):** baja cumple en las 10 escenas (36.5 a 51.3 fps). Media a escala 1 da de 21.2 a 30.4 fps; a 0.7, de 35.8 a 51.9; a 0.6, de 43.8 a 59.6; a 0.5, de 50.3 a 70.3, con 3 de 10 escenas en 60 o más (`eval/results/e6_unity_media_escala_*.json`, `e6_unity_baja.json`). El ajuste por escena (`eval/results/u5_opciones.json`) da F de 5.5 a 13.7 ms y P de 20.1 a 40.2 ms; la escala estimada para 60 fps va de 0.60 (AXA de día) a 0.38 (lluvia de día). **Media no cumple con ninguna escala medida.** Las opciones (escala fija cercana a 0.4, escala automática por escena o bajar antes el costo fijo de lluvia y terracería) están en `docs/progress/U.md`; la decisión es de René y el perfil de media sigue con `DprMaximo = 1` hasta que elija.

## Decisión de René y escala automática (2026-11-11)

René revisó §7.8 de `PLAN.md`: la meta de media (≥ 60 fps a 1080p) es **en la escena de referencia**, no en las diez. Pidió escala de dibujo automática en media con piso de 0.5, una sola ronda de costo fijo y volver a medir; las demás escenas quedan registradas con su cifra.

19. **La escena de referencia es `lateral_interseccion`** (día y noche). §7.8 la describe como «2 vehículos, 2 personas, intersección con árboles». Entre las canónicas medidas es la única con intersección y árboles; lleva 2 vehículos y 3 personas (una más que la descripción), así que no es más ligera que la escena descrita. Las otras: `axa` (vía recta, sin personas), `carambola` (3 vehículos), `nocturno_lluvia` y `terraceria` (vía recta). ADR 0026 había leído «todas las escenas canónicas» porque ninguna coincidía exactamente; con la aclaración de René manda §7.8 tal como está escrito.
20. **Escala de dibujo automática en media** (`Croquis.Core.EscalaAutomatica`, pruebas en `EscalaAutomaticaTests`): entre 0.5 y 1 sobre el tope de dpr, buscando 60 fps. Empieza arriba, baja de un salto a la escala que el cuadro medido indica (apuntando a 64.8 fps), deja un margen de 6 % y se asienta. **No baja de 0.5 y dentro de un caso no sube**: con la pantalla a 60 Hz no se puede saber cuánta holgura hay sin probar una escala mayor, y probar se ve como un tirón. Ya asentada, solo baja con 4 s seguidos debajo de 59.1 fps; si bajar no mejora los fps, deshace el paso y deja de bajar. Busca de nuevo al cargar otro caso (desde 15 % arriba de donde quedó), al cambiar de cámara o de tamaño. Corre también con «media» fijada a mano. La regla de bajar a baja con menos de 24 fps durante 5 s sigue igual.
21. **Lluvia como malla movida en la GPU** (`Croquis/Lluvia`, `LluviaEnMalla`), en baja y media: las mismas gotas y números que las partículas de alta y ultra, sin simularlas en la CPU. −2.1 ms por cuadro en lluvia de noche y −0.9 en terracería (`u5_ronda3_1_cambios.json`). Se ve igual; las gotas pegadas a la cámara ya no salen como postes.
22. **Cada vehículo del minimapa en una sola malla** (`VehiculoEnMinimapa`, `Croquis/MinimapaVehiculo`), en baja y media: de 30 a 60 llamadas por vehículo a una. −1.1 a −2.4 ms por cuadro; de 191 a 138 llamadas en la referencia de noche. Con luz difusa y un piso de claridad: el vehículo se distingue de noche.
23. **La piel de las personas ya no cuesta** (0.01 ms por cuadro con nombres de función, `u5_ronda3_0_cpu_*.json`): las poses fijas del paso 1 lo resolvieron. No se tocó.
24. **Lo que queda del costo fijo** es el dibujo de Unity y URP (5 a 6.5 ms y 3 ms por cuadro en el perfil) y la cámara del minimapa (1.1 a 1.3 ms). La ronda era una; no se siguió.

**Medir con la escala automática.** La E6 de media espera a que la escala lleve 8 s asentada antes de contar cuadros y anota la escala de cada medición. La cadena hace antes una pausa de 4 min para que el equipo se enfríe (la primera configuración salía castigada). El promedio de fps es la cifra que vale: el diagnóstico de tirones (`Tirones.cs`) mostró que, visto desde el visor, los cuadros son parejos (12 lentos de 586 en la referencia de noche, contra 65 de 580 en los tiempos de `requestAnimationFrame`), así que la mediana y el 1 % más lento del navegador exageran el vaivén.

**Medición final (2026-11-12, `eval/results/e6_unity_media.json`):** la escena de referencia llega a 64.7 fps de día y 62.1 de noche en media con la escala automática: **cumple §7.8**. 8 de 10 escenas pasan de 60; carambola queda en 59.6 y 56.3 a escala 0.5, el piso. Ninguna baja de 24 fps. Baja: de 41.0 a 62.3 fps. La escala elegida: 0.627 y 0.548 en AXA, 0.5 en las demás. Con 0.5 fija, la ronda de costo fijo pasó de 3 a 7 escenas sobre 60 fps (`e6_unity_media_escala_0.5.json` contra el archivado `u5_estado.ff04482a02.json`).

**Alta y ultra en la computadora con tarjeta de video (2026-11-12, `eval/results/e6_unity_escritorio.json`):** programa de escritorio (Direct3D 12) en una RTX 4070 Laptop con i9-14900HX, 1920×1080, 3 repeticiones: de 290.3 a 414.9 fps en alta y de 289.4 a 410.2 en ultra, con el 1 % más lento en 166.6 o más. **Cumple la meta de §7.8 para la computadora de demo** en las 10 escenas. Alta y ultra dan casi lo mismo porque, con dpr 1, las dos dibujan a escala 1. El build web en esa computadora se mide al cerrar U6.

**El build web en la computadora de demo (2026-11-12, `eval/results/e6_unity_web_demo.json`, resumen por build en `e6_unity_web_demo_por_build.json`):** Chrome 140 en la misma RTX 4070 Laptop, pantalla de 1920×1200 con dpr 1.25, 3 repeticiones. La corrida cruzó el despliegue de #210: la primera repetición midió el build `01fce868922703fd` y las otras dos, `f12372a6c2d7742c`, que trae el primer bloque de «ultra con el margen». Alta: de 215.8 a 451.8 fps. Ultra con el bloque (2 repeticiones): de 195.7 a 270.4 fps, con el 1 % más lento en 96.7 o más. Ultra sin el bloque (1 repetición): de 222.2 a 468.3. **Cumple ≥ 60 fps en el navegador en las 10 escenas, también con el bloque.**

**El programa de escritorio con el primer bloque de «ultra con el margen» (2026-11-12, noche; `eval/results/e6_unity_escritorio_bloque1.json`):** misma RTX 4070 Laptop, 1920×1080, 3 repeticiones, ahora con 11 escenas (las 10 y el caso de ejemplo del programa). Alta: de 295.1 a 414.1 fps (antes, de 290.3 a 414.9). **Ultra, con el bloque** (dibujar a 1.5×, sombras de 8192 hasta 250 m y 16 luminarias): de 207.4 a 279.7 fps, con el 1 % más lento en 138.2 o más (antes del bloque, de 289.4 a 410.2). El bloque cuesta de 45 a 131 fps según la escena, y **ultra sigue cumpliendo ≥ 60 fps** en todas, con más del triple de margen. El archivo anterior, sin el bloque, se queda en `e6_unity_escritorio.json`.

## Consecuencias

- El build WebGL lleva las variantes de shader de los cuatro niveles (por ejemplo, sombras de focos de alta); su peso se mide en U5 y queda en `docs/progress/U.md`.
- La meta de alta y ultra (≥ 60 fps en la computadora de demo) se cumple en el programa de escritorio (2026-11-12); falta medir el build web en esa computadora (U6).
