# Bitácora del frente U · Visor Unity, contratos e integración

Plan: `docs/cesvi/PLAN-CESVI.md` §3.3. Reglas: `CLAUDE.md`. ADR del bloque 0110–0129 (el 0110 ya estaba usado, así que este frente empieza en el 0111).

## Estado

- **Fase actual:** U3 (personas) y U4 (cámaras y encuadre) **terminadas** en `feat/u3-personas`, con su e2e de cámaras en verde sobre el build WebGL. PR a `main`.
- **Siguiente:** U5 (calidad y rendimiento). René pidió detenerse antes de U5 y avisarle (2026-11-10). Para medir alta y ultra dará la computadora con tarjeta de video; lo que se mida en media se hace en esta laptop.
- **Unity y Blender corren en segundo plano** desde el 2026-11-10: René reabrió la sesión con `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1`. Sigue la regla de un solo proceso pesado a la vez.
- **Cómo se itera:** capturas del Editor en modo batch (`Capturas.Tomar`, unos 3 min). En esta sesión no hubo herramientas del MCP de Unity. Un build WebGL solo al cerrar cada punto.

## U2 · Escenario

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
- **El daño con `perfil_m`** ya estaba desde U1, con su prueba de tolerancia (2 cm o 6 %) en CI.
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

## Ajustes de René antes de U5 (2026-11-10)

Conductor sin la carrocería propia (contorno tenue del cofre y los postes), vidrio propio sin el reflejo de la sonda, moto tendida desde el impacto con «Posición final ilustrativa», camisas que nunca son color piel, el ocupante dentro de la cabina y la cinematográfica que se acerca si una fachada la tapa. ADR 0114, decisiones 12 a 15. Capturas del build WebGL en `docs/cesvi/u4/ajustes/` (conductores en AXA y `lateral_interseccion`; vidrios en las 5 escenas de día y de noche; personas a los 3 s). PR #205.

## U5 · Calidad y rendimiento (2026-11-11, en curso)

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

### Optimización de media (2026-11-11, en pausa)

Detalle, decisiones y lo descartado: ADR 0115, sección «Optimización de media». Resumen:

- **Hecho en baja y media, sin cambiar el aspecto** (diferencia por pixel medida, `eval/results/u5_diferencia_*.json`): minimapa con fondo horneado, poses fijas, una cascada de sombra, oclusión ligera, suelo en una pasada, sombras unidas, posproceso interpolado solo cuando cambia, lluvia fuera del minimapa y luna sin sombra. **Sí se nota un poco:** FXAA en vez de MSAA 2× (bordes).
- **Descartado:** Forward+, WebAssembly 2023 con IL2CPP para velocidad, depth priming, FSR y gradación en HDR.
- **Dónde va** (tres escenas, fps a 1080p): de 22.6 / 13.9 / 18.5 a 35.7 / 23.7 / 26.2. A escala 0.6: 63.4 / 49.2 / 47.1.
- **Lo que dice el modelo:** a 1080p nativo esta GPU no llega a 60 fps ni con todo apagado. Para 60 harían falta escalas de 0.64 (día), 0.50 (noche urbana) y 0.43 (lluvia de noche).

### Para retomar

La medición de U5 es una cadena reanudable que corre **fuera de la sesión de Claude Code**, como la tarea de Windows «CroquisU5» (René, 2026-11-11: que no se pierda nada si la sesión se cierra o se corta).

- **Empezar o reanudar** (salta lo ya hecho): `powershell -ExecutionPolicy Bypass -File tools/unity/u5-cadena.ps1 -Lanzar`
- **Ver cómo va:** `powershell -ExecutionPolicy Bypass -File tools/unity/u5-cadena.ps1 -Estado` (o `node eval/u5_cadena.mjs --estado`).
- **Detenerla** (no borra lo medido): `powershell -ExecutionPolicy Bypass -File tools/unity/u5-cadena.ps1 -Detener`
- **Dónde queda cada cosa:**
  - `eval/results/u5_estado.json`: el build (con su huella), la e2e, las capturas y cada medición (escena, nivel, escala y repetición), anotada en cuanto termina.
  - `apps/visor-unity/Logs/u5-cadena.log`: el registro (fuera de git).
  - `eval/results/e6_unity_<configuración>.json`: el resultado de cada configuración, cuando están sus 30 mediciones.
  - `docs/cesvi/u5/media/` y `docs/cesvi/u5/escalas/`: las capturas a 1080p.
- **Qué hace, en orden:** paquetes de las escenas si faltan; build WebGL (no se rehace si `Build/web` existe y la huella de los fuentes es la anotada); e2e de cámaras; capturas de las 10 escenas en media y de tres escenas a escala 0.8, 0.7, 0.6 y 0.5; y la E6 (10 escenas × 3 repeticiones, un navegador nuevo por medición) de media a escala 1, baja y media a 0.7, 0.6 y 0.5, con 90 s de pausa entre configuraciones.
- **Si cambian los fuentes de Unity,** la huella cambia: se compila otra vez y lo medido con el build anterior se archiva en `u5_estado.<huella>.json`. No se mezclan cifras de dos builds.
- **Mientras corre:** la laptop no se suspende ni apaga la pantalla (se restaura sola al terminar o si el proceso muere), y cierra Edge antes de cada medición. Hay que dejarla conectada y con la tapa abierta. **Nada pesado a la vez** (ni otra medición, ni Playwright, ni Unity).
- **El «antes»** de las comparaciones es la media anterior a la optimización: `D:\croquis-logs\var1\base` (fuera de git).
- **Al terminar:** presentarle a René las opciones (escala fija, escala según la escena o recortes de noche) y **no fijar la escala de media sin que él elija**. Si media no cumple con ninguna escala, detenerse con «Media no cumple: cambia el modelo». Al cerrar, `eval/results/e6_unity_web.json` se vuelve a medir con el perfil final.

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

## Necesito del otro frente

Nada por ahora.

## Bloqueado

- **Alta y ultra (U5):** el paquete `visor-escritorio-u5.zip` se corre en la computadora con tarjeta de video (`medir-escritorio.ps1`) y devuelve `e6_unity_escritorio.json`, que va a `eval/results/`.
