# Croquis para CESVI · plan final (v4)

**Fecha:** 2026-11-07. **Sustituye a:** v3 (2026-10-30), que pasa a `docs/historial/`. Lo ya hecho en v3 sigue valiendo.

**Por qué hay v4.** Pasaron dos cosas:
1. **CESVI pidió que el 3D se haga en Unity.** El visor de three.js no les convence, y creen que en Unity puede quedar mucho mejor. Con eso queda sin efecto la regla de v3 «three.js con WebGPU; nada de Unity». El visor three.js se queda como respaldo y no se borra.
2. **Personas que usaron Croquis dejaron cinco observaciones** (§0.2).

**Cómo se trabaja ahora.** Trabajan **tres Claude Code en paralelo**, uno por persona del equipo, cada uno en un frente con carpetas propias (§3). Esta es la recta final: lo que no está en este plan no se hace en esta versión.

---

## 0. Dónde estamos

### 0.1 Ya hecho (de v3 y antes)

- **Contrato, solver y evaluación:**
  - contrato 2.2.0; solver Python + port TS con paridad;
  - inversión con multiarranque determinista y rango estable (T3.1, ADR 0100);
  - E-R4 publicada (modalidad 58.3 % contra 37.2 % de la línea base).
- **AXA con sus dos lecturas** en Contra CESVI y Presentar:
  - método de CESVI: 60.27 = 60.27 y 63.90 contra 63.15;
  - reconstrucción física: 71.56 km/h (68.02–92.81), +13.32 %.
- **Interfaz:**
  - rediseño Laboratorio de `/cesvi` (6 actos, día y noche, #178);
  - escena fácil (una pregunta a la vez);
  - búsqueda de lugar, cámaras del conductor y fotos del dictamen corregidas.
- **Despliegue y demo:**
  - despliegue verificado en Vercel, con recursos pesados en Blob;
  - botón reanudable de la computadora de demo.

### 0.2 Observaciones de las personas que usaron Croquis (2026-11-07)

Vienen del documento «Notas/Sugerencias de cambios Croquis CESVI», con capturas. Se guarda en `docs/cesvi/entrante/`.

| # | Dónde | Qué pasa | Frente |
| --- | --- | --- | --- |
| O1 | El hecho | Acepta cualquier texto (en la captura, «gggg…»), no hace preguntas y deja avanzar sin información suficiente. | W2 |
| O2 | Dictamen | «Citar velocidad» y «Citar supuestos» duplican el texto cada vez que se presionan. «Descargar el PDF» y «Exportar → Word» no hacen nada; solo `.croquis` descarga. | W1 |
| O3 | Reconstrucción | No se ve la zona completa y no hay forma de ir a la zona de interés, ni en 2D ni en 3D. | W3 (2D) y U4 (3D) |
| O4 | Todas las vistas | No se ve el relieve en ninguna vista. | N1 (datos y 2D) y U2 (3D) |
| O5 | El hecho | No siempre pone la letra a ambos vehículos aunque los identifica. Ejemplo: «una combi colisiona con un pickup lobo»; la combi no recibe su letra. | W2 |

### 0.3 Lo que queda de v3

| Qué | Estado | Pasa a |
| --- | --- | --- |
| T1 escenario 3D en three.js | **Se congela.** El escenario se rehace en Unity. Lo hecho queda como visor de respaldo. | U2–U5 |
| T2b corrida completa del colaborador | Falta integrar su rama de resultados | N5 |
| T3.2 rumbo inicial de V2 pegado al límite (+20°) | Pendiente | N2 |
| T3.3 reversa (0 de 9 en E-R4) | Pendiente | N2 |
| T3.5 E-R4 v4 | Pendiente | N2 |
| T4 prueba con personas | Primera ronda hecha (O1–O5). Falta la segunda ronda con la versión v4. | §4 |
| T5 README y `ESTADO.md` | Pendiente | N4 |
| T6.2 versión declarada en el croquis 2D | Pendiente | W5 |
| T6.3 orden de impactos a mano en carambolas | Pendiente | W5 (interfaz) y N3 (solver) |
| T6.4 los agentes respetan el orden de impactos | A medias | N3 |
| T6.5 y T6.6 relecturas R12b grabadas y el prompt del corpus | Necesitan que René apruebe el gasto de API | N3 |
| Trabajo en curso de René: `feat/axa-escena-colocada`, cifra grande 71.56, Lighthouse | En curso | U, antes de U0 |

---

## 1. Definición de terminado (René palomea)

Croquis para CESVI está al 100 % cuando se cumplen las siete:

- [ ] **D1 · Visor Unity.** En `/cesvi`, la reconstrucción 3D es la de Unity, en el navegador y como programa de escritorio para la demo. René aprueba las capturas de las 4 escenas de referencia:
  - AXA (autopista de día);
  - `lateral_interseccion` (cruce urbano);
  - `nocturno_lluvia`;
  - la carambola.

  También se cumplen los fps de §7.8 de `PLAN.md`, medidos en la laptop de 8 GB y en una computadora con tarjeta de video.
- [ ] **D2 · Fidelidad.** En los 16 casos versionados, Unity reproduce la pose de cada vehículo en cada instante con menos de 1 cm y 0.1° de diferencia contra el `Resultado`. El perfil de daño en la malla cumple la tolerancia de `physics.md` (2 cm o 6 %). Ambas pruebas corren en CI.
- [ ] **D3 · Observaciones.** O1–O5 están corregidas, cada una con su prueba (unitaria o e2e, según §3).
- [ ] **D4 · Números.** T3.2, T3.3 y T3.5 están medidos en `eval/results/`, y la portada y el README toman de ahí sus cifras.
- [ ] **D5 · Endurecimiento.** T6.2–T6.4 están hechos con su prueba; T6.5 y T6.6 están hechos o René los descartó.
- [ ] **D6 · Repositorio.** README y `docs/ESTADO.md` cumplen el estándar de Helada. Alguien sin contexto lo corre en local siguiendo solo el README. CI tarda menos de 10 minutos.
- [ ] **D7 · Personas y CESVI.** Hubo una segunda ronda con 3 personas sobre la v4, con los 3 problemas más frecuentes corregidos. CESVI vio la demo, y sus comentarios están anotados con una decisión para cada uno.

---

## 2. El visor en Unity: decisiones de arquitectura

Claude Code del frente U las registra en un ADR al hacer U0. Son decisiones tomadas; si al verificar en la documentación oficial alguna no se sostiene, se elige la alternativa más cercana y se anota.

1. **Unity 6.3 LTS con URP.** Es una sola canalización para web y escritorio; HDRP no compila para web. Antes de instalar, se verifica el parche vigente y se anota en `docs/adr/0001-stack.md`. Licencia Personal; en Unity 6 la pantalla «Made with Unity» es opcional, se verifica y se desactiva.
2. **El proyecto vive en el monorepo**, en `apps/visor-unity/`.
   - `.gitignore` estándar de Unity: `Library/`, `Temp/`, `Obj/`, `Logs/`, `Builds/`, `UserSettings/`.
   - Los modelos de vehículos se cargan en tiempo de ejecución desde Vercel Blob con glTFast. Son los mismos glTF CC-BY y sin marcas del visor web, registrados en `assets/ASSETS.md`, así que no van binarios pesados a git.
   - El proyecto de prueba en la carpeta del Tec queda como experimento; de ahí solo se copia lo útil.
3. **Una sola entrada: el paquete `caso-3d` v1**, con este contenido: `escena` (EscenaSpec) + `resultado` (Resultado) + `relieve` (opcional) + `convenciones`.
   - Su esquema es `packages/scene-schema/caso3d.schema.json`, y referencia a los otros dos sin duplicarlos.
   - Lo arma una función TS, `armarCaso3d(escena, resultado, relieve?)`.
   - El mismo paquete sirve para tres cosas: el puente web → Unity, el botón «Descargar paquete 3D» y los casos de prueba en `packages/scene-schema/fixtures/caso3d/`, generados por un script a partir de los 16 casos versionados.
4. **Los tipos C# se generan** del esquema, igual que Zod y Pydantic, en `apps/visor-unity/Assets/Croquis/Generated/`, y no se editan a mano. La herramienta se verifica; quicktype es la opción a probar. CI revisa que estén al día.
5. **Unity solo reproduce.** No usa la física de Unity para el choque.
   - Todo movimiento sale de `resultado.*.trayectoria`, interpolado linealmente, y el rumbo por el camino angular más corto.
   - El daño sale de `dano.perfil_m`, con la misma regla de `physics.md`: la cara se desplaza exactamente c(u).
   - Los vidrios, las bolsas de aire y las piezas siguen siendo ilustrativos (ADR 0007).
   - El volante y el giro de las llantas se derivan de la trayectoria y se marcan como ilustrativos.
6. **El núcleo C# no depende de Unity.** `Croquis.Core` es un asmdef con `noEngineReferences`.
   - Hace la lectura del paquete, la conversión de ejes, la interpolación, el perfil de daño sobre una malla y el encuadre de la zona de interés.
   - Se prueba con `dotnet test` en CI: es rápido y no pide licencia de Unity.
   - Las pruebas EditMode y PlayMode de Unity corren solo en local.
   - Conversión de ejes: Croquis usa X al este, Y al norte y rumbo antihorario desde +X; en Unity, posición = (x, h, y) y yaw = 90° − rumbo.
7. **Puente web ↔ Unity.** El contrato vive en `packages/scene-schema/visor-puente.md`, con tipos TS y un número de versión.
   - **De JS a Unity:** `cargarCaso(json)`, `fijarTiempo(t)`, `reproducir()`, `pausar()`, `velocidad(x)`, `camara(modo)`, `calidad(nivel)`, `encuadrar(zona)` y `capturar(vista, ancho, alto)`.
   - **De Unity a JS:** `listo{version}`, `cargado{escena_id}`, `tiempo{t}`, `camara{modo}`, `captura{vista, png}`, `fps{p50}` y `error{codigo, mensaje}`.
8. **Distribución:**
   - **Web:** build WebGL subido a Vercel Blob, con un manifiesto versionado (`apps/web/public/visor-unity/manifest.json`, con versión, hash y URLs). Se guardan solo los 2 últimos builds, por el almacenamiento. Antes de elegir la compresión (Brotli, gzip o ninguna), se verifica qué encabezados sirve Blob.
   - **Escritorio:** build de Windows para la computadora de demo, como zip en un release de GitHub, nunca en git. Abre un archivo `caso-3d`.
9. **Respaldo.** Si no hay WebGL2, si se pierde el dispositivo o si la carga pasa del límite que fije el ADR, se abre el visor three.js como «Visor ligero», con un aviso.
10. **Fotos del dictamen.** Salen de Unity con `capturar`, siempre con la cámara cinematográfica en el instante del impacto y en el de reposo, esperando a que la escena esté lista (misma regla que ya se aplica hoy). La del conductor sale de la cámara de su conductor.
11. **Los builds de Unity no corren en CI:** necesitan licencia y pasan de 10 minutos. Se hacen con `tools/unity/build-web.ps1` y `tools/unity/build-windows.ps1`, ambos en modo batch, en la computadora que René asigne (§5). Otro script los sube a Blob.
12. **Reglas que no cambian:**
    - nada de logotipos ni marcas en los modelos;
    - todo lo procedural lleva «procedural» en la leyenda;
    - la leyenda ilustrativa va en cada vista y en cada captura;
    - ningún número inventado.

---

## 3. Los tres frentes

### 3.1 Quién hace qué

| Frente | Quién | Le pertenece (solo este frente lo cambia) |
| --- | --- | --- |
| **U · Visor Unity** | Claude Code de René (tiene Unity) | `apps/visor-unity/**`, `tools/unity/**`, `packages/scene-schema/caso3d*`, `packages/scene-schema/visor-puente.md`, `packages/scene-schema/fixtures/caso3d/**`, `apps/web/public/visor-unity/**` |
| **W · Web y observaciones** | Claude Code del compañero 1 | `apps/web/src/app/cesvi/**` y sus componentes, `packages/cesvi/**`, `packages/croquis-2d/**`, `packages/extraction/**`, `extraction/**`, el componente anfitrión `<VisorUnity>` y las e2e de la web |
| **N · Números, relieve y repo** | Claude Code del compañero 2 | `solver/**`, `packages/solver-ts/**`, `eval/**`, `data/**`, la nueva ruta `apps/web/src/app/api/relieve/**`, `README.md`, `docs/ESTADO.md`, `docs/historial/**` |

**Archivos compartidos:** `packages/scene-schema/escena.schema.json`, `resultado.schema.json`, `CLAUDE.md`, `docs/cesvi/PLAN-CESVI.md`, `.github/workflows/**`, `package.json`, `pnpm-lock.yaml` y el índice de `docs/PROGRESS.md`.

- Estos se cambian solo con un PR pequeño de tipo `contract:` o `chore:`. René lo revisa y lo fusiona antes que lo demás, y los otros frentes rebasan sobre él.
- Si `pnpm-lock.yaml` tiene conflicto, se regenera con `pnpm install`; no se edita a mano.
- `packages/viewer` (three.js) queda congelado: solo W lo toca, y solo para arreglar el respaldo.

### 3.2 Reglas para que tres Claude Code no se pisen

- **Ramas.** `feat/u<n>-<tema>`, `feat/w<n>-<tema>` y `feat/n<n>-<tema>`, de vida corta: un PR por fase o media fase, a `main` al menos una vez al día y rebasando sobre `main` antes de abrir el PR.
- **Fusiones.** Solo René fusiona, con CI en verde, y usa **«Create a merge commit»**. En Vercel Hobby con repositorio privado, los commits de otros autores pueden quedar bloqueados para desplegar. El commit de fusión de René es el que despliega. Si aun así se bloquea, se usa el Deploy Hook después de fusionar.
- **Bitácora por frente.** Cada frente escribe en `docs/progress/U.md`, `W.md` o `N.md`: plan corto, evidencia, cifras, pendientes y siguiente paso. `docs/PROGRESS.md` (488 KB) queda como índice y como «Estado actual», y solo lo actualiza el frente U al integrar. Así no hay conflictos en el archivo más grande del repo.
- **ADR por bloques,** para que no choquen los números: U usa 0110–0129, W usa 0130–0149 y N usa 0150–0169.
- **Contratos primero.** Nada consume `caso-3d`, el puente ni el relieve antes de que U0 esté en `main`.
- **Pruebas.** Las de `CLAUDE.md`: unitarias de cálculo y lógica, y una e2e por flujo, en Chromium. Las pesadas (e2e, capturas y fps) van al final de cada fase, no en medio. Cada frente corre las suyas antes del PR.
- **Secretos.** Cada persona usa su propia llave en su `.env.local`, o ninguna: las pruebas usan respuestas grabadas. Las llaves no se pasan por chat ni se escriben en archivos versionados.
- **Si un frente necesita algo de otro,** lo anota en su bitácora, en «Necesito de U/W/N», y sigue con lo que no dependa de eso.

### 3.3 Frente U · Visor Unity (Claude Code de René)

**U-pre. Cerrar lo que está en curso:** `feat/axa-escena-colocada`, la cifra grande 71.56 en Reconstrucción con la mediana 75.2 como dato secundario (ya pedido), Lighthouse y el «Resumen para René». Se fusiona.

**U0. Contratos y organización.** Es lo primero, porque W y N dependen de esto. Medio día.
- **`caso3d.schema.json`**, con la forma de `relieve`:
  - origen en latitud, longitud y en x, y de la escena;
  - resolución en metros;
  - ancho y alto de la malla;
  - alturas en metros relativas al punto de impacto;
  - fuente, licencia y resolución nativa.
- **El resto del contrato:** `armarCaso3d` en TS con su prueba; el generador de C# y la revisión en CI; `visor-puente.md` con sus tipos TS.
- **Casos de prueba:** script que genera `fixtures/caso3d/` para los 16 casos.
- **Organización del repo:**
  - el ADR de §2;
  - `docs/progress/{U,W,N}.md`;
  - en `CLAUDE.md`, el visor es Unity, se agregan sus reglas y la tabla de frentes;
  - este plan se copia a `docs/cesvi/PLAN-CESVI.md` y v3 se mueve a `docs/historial/`.
- **Listo cuando:** está en `main` y W y N pueden consumirlo.

**U1. Núcleo y reproducción.**
- Proyecto en `apps/visor-unity/`, con el mismo paquete MCP de Unity del proyecto de prueba (ver su `Packages/manifest.json`), Newtonsoft y glTFast.
- `Croquis.Core` con su proyecto de pruebas en `dotnet`.
- Vehículos con los glTF de Blob según su clase, con las llantas en los ejes según `distancia_entre_ejes`.
- Línea de tiempo con reproducir, pausa, 0.25×/0.5×/1× y barra de tiempo.
- **Desde aquí, un build WebGL de prueba** para medir peso y tiempo de carga en la laptop: el riesgo más grande se mide al principio, no al final.
- **Listo cuando:** se cumple D2 en CI para los 16 casos, y el peso y el tiempo de carga del build quedan anotados en `eval/results/unity_build.json`.

**U2. Escenario** (aquí llegan las reglas de T1.1–T1.3 de v3).
- **Vías:** se arman con `lugar`, en todas las variantes de `tipo_via`: recta, curva con su radio, cruces en X y en T, glorieta, autopista con camellón y barreras.
- **Calles reales:** se usa la red vial de OpenStreetMap cuando hay `ubicacion_real`.
- **Marcas y bordes:** marcas viales como calcomanías; guarniciones y banquetas con su altura real.
- **Dispositivos, objetos y evidencias:**
  - los semáforos cambian de color según sus fases en el tiempo;
  - se colocan los objetos;
  - las evidencias aparecen a escala: huellas de frenado cuando se frena, vidrios y restos.
- **Relieve y entorno:**
  - relieve tomado de `caso3d.relieve` (si no hay, suelo plano con la nota «sin relieve: el caso no tiene ubicación real»);
  - entorno procedural con semilla fija y la etiqueta «procedural».
- **Ambiente:** cielo y sol según fecha, hora y latitud; de noche, luminarias y faros; con lluvia, asfalto mojado.
- **Listo cuando:** ninguna cámara ve un plano liso ni un horizonte vacío en las 4 escenas, y René aprueba las capturas.

**U3. Daño y personas.**
- Deformación con `perfil_m`, con prueba de tolerancia en `Croquis.Core`.
- Ocupantes con sus variantes.
- Peatones y motociclistas con su trayectoria.
- Volcadura, si el `Resultado` trae el giro; si no, se anota como pendiente.
- **Listo cuando:** se cumple la parte de daño de D2 y René aprueba las capturas del daño.

**U4. Cámaras y encuadre** (resuelve O3 en 3D).
- **Cámaras:** cenital, cinematográfica, órbita, conductor A y B a la altura del ojo de `visibilidad`, y libre.
- **Controles:** con ratón y táctil.
- **Encuadre automático de la zona de interés:** abarca las trayectorias en [t_inicio, t_fin], el reposo, las evidencias y los objetos. Se activa con dos botones: «Ver todo» e «Ir al impacto».
- **Minimapa** cenital.
- **Listo cuando:** en los 16 casos, «Ver todo» deja en cuadro las dos poses finales y el punto de impacto (prueba en el núcleo), y se cumple la e2e de cambio de cámaras.

**U5. Calidad y rendimiento.**
- **Niveles baja, media, alta y ultra** como perfiles de URP.
- **Calidad automática** con las mismas reglas de la web: nunca sube durante la sesión, y baja un nivel si los fps quedan por debajo de 24 durante 5 s. Con tope de dpr.
- **Panel de diagnóstico** equivalente a `?diag=1`.
- **Medición** en la laptop (WebGL, media) y en la computadora con tarjeta de video (escritorio, alta y ultra), guardada en `eval/results/e6_unity_*.json`.
- **Si media no alcanza** §7.8, se recorta densidad en media, nunca función. Si el recorte toca alta o ultra, se pregunta a René.

**U6. Puente, builds e integración** (junto con W4).
- Lado Unity del puente (`.jslib`); scripts de build y de subida a Blob; manifiesto.
- Build de Windows con un caso de ejemplo y la opción de abrir un archivo `caso-3d`.
- **Listo cuando:** en producción, `/cesvi` muestra Unity en Reconstrucción, Análisis y Presentar; las fotos del dictamen salen de Unity; el respaldo funciona; hay una e2e del flujo completo en Chromium.

### 3.4 Frente W · Web y observaciones (Claude Code del compañero 1)

**W1. Dictamen (O2).** Es lo primero, porque rompe el flujo del perito.
- «Citar velocidad» y «Citar supuestos» deben ser idempotentes: si el bloque ya está citado, se resalta o se reemplaza; nunca se duplica.
- «Descargar el PDF» y «Exportar → Word» deben descargar archivos válidos.
- Se anota la causa raíz en `docs/progress/W.md`.
- **Pruebas:**
  - unitaria: citar dos veces deja un solo bloque;
  - e2e en Chromium: descarga el PDF (se abre y tiene ≥ 1 página) y el Word (zip con `word/document.xml`).
- **Listo cuando:** pasan las pruebas.

**W2. El hecho (O1 y O5).**
- **Antes de llamar al modelo:**
  - se revisa que el relato tenga contenido real, no solo longitud: proporción de palabras reconocibles, repetición, letras contra símbolos;
  - si no pasa, se muestra un mensaje amable con un ejemplo y no se gasta API;
  - la ruta responde `relato_insuficiente` con lo que falta.
- **Después de leer el relato,** se muestra lo mínimo para reconstruir: al menos un vehículo y algo más (otro vehículo, peatón u objeto), el tipo de impacto o la zona de contacto, y el lugar o su confirmación en el mapa.
  - **Si no hay nada reconstruible,** «Continuar» queda bloqueado y se explica por qué.
  - **Si es parcial,** se puede seguir, pero las preguntas pendientes salen al frente y se muestra la lista de supuestos declarados que usará Croquis. Es la regla de siempre: lo que falta se declara como supuesto, nunca se inventa en silencio.
  - **Debe haber preguntas** siempre que falte un dato que cambie la reconstrucción. Que salga «0 preguntas» con un relato vacío es un error.
- **O5:**
  - cada vehículo identificado recibe su letra en la mención del relato y su tarjeta en el panel;
  - vocabulario mexicano en el mapeo a clases de `vehicle_classes.json`: combi, pesero, micro, microbús, vocho, urvan, torton, rabón, tráiler, pipa, volteo, motoneta, taxi;
  - si no hay clase exacta, se usa la más cercana como supuesto declarado;
  - los nombres comerciales («Lobo») son el modelo en texto, nunca una marca en el 3D.
- **Pruebas:** unitarias con respuestas grabadas, entre ellas el relato exacto de la captura: «En el zócalo de la Ciudad de México una combi colisiona con un pickup lobo en su parte trasera derecha», y «gggg…».

**W3. Encuadre en 2D (O3).**
- Al abrir, el croquis se ajusta a todas las trayectorias, las poses finales y las evidencias.
- Zoom y desplazamiento con ratón, rueda y táctil, más los botones «Ver todo» e «Ir al impacto».
- Escala gráfica y flecha del norte.
- Se aplica en Reconstrucción, Análisis y Contra CESVI.
- **Prueba:** unitaria del encuadre (todas las poses quedan dentro).

**W4. Integración del visor Unity** (cuando U0 esté en `main`; se cierra junto con U6).
- Componente `<VisorUnity>` según `visor-puente.md`:
  - carga el build desde el manifiesto;
  - se carga diferido, solo en las pantallas que usan 3D;
  - si falla, cae al visor three.js.
- Las fotos del dictamen se toman con `capturar`.
- Botón «Descargar paquete 3D».
- Mientras no exista el build, se prueba contra un arnés que cumple el contrato, solo en pruebas; nunca se publica.

**W5. Endurecimiento en la interfaz.**
- T6.2: la versión declarada se dibuja en el croquis 2D.
- T6.3: en una carambola, se puede declarar a mano el orden de impactos (interfaz y contrato; N hace la parte del solver).
- Cada uno con su e2e.

**W6. Segunda ronda con personas.** Cuando W1–W3 estén en producción, René repite la prueba con 3 personas, y W corrige los 3 problemas más frecuentes.

### 3.5 Frente N · Números, relieve y repo (Claude Code del compañero 2)

**N1. Relieve (O4)** (cuando U0 esté en `main`).
- **Fuente de elevación:** se verifica la licencia y el acceso de cada opción y se registra en `data/SOURCES.md`. En orden de preferencia:
  1. Continuo de Elevaciones Mexicano de INEGI, si se puede consultar por programa;
  2. Copernicus GLO-30, en datos abiertos (COG);
  3. Terrain Tiles de AWS.

  En producción no hay Python: se lee desde la ruta de Next.js, por ejemplo con lecturas por rango de un COG.
- **Ruta `/api/relieve`:** recibe latitud, longitud y radio, y devuelve la malla de alturas con la forma de `caso3d.relieve`, con caché.
- **Pendiente:** se calcula a lo largo de la trayectoria de cada vehículo y se propone como `lugar.pendiente`, con fuente «dem», confianza y rango. El perito la puede cambiar.
  - Se dice con honestidad: una malla de 15–30 m no ve una rampa de 2 m.
  - El frenado ya usa la pendiente (`physics.md`). Si el post-impacto no la usa, se agrega en Python y TS, con paridad.
- **Dónde se ve:**
  - perfil de elevación en Reconstrucción (altura a lo largo del camino de A y de B);
  - sombreado o curvas de nivel en el croquis 2D;
  - el relieve en Unity, que hace U2 a partir del paquete.
- **Pruebas:** unitarias de la pendiente con una malla sintética conocida, y paridad si se toca el solver.

**N2. T3 que queda.**
- **T3.2:** diagnosticar el rumbo inicial de V2 pegado a +20° y corregirlo con fuente; medir AXA y los 16 casos.
- **T3.3:** reversa, con el sentido de marcha separado del rumbo del frente, en contrato, Python y TS, con paridad; `cesvi-3a0125cb81` reconstruye al que retrocede.
- **T3.5:** E-R4 v4 completa, publicada junto a v1–v3; la portada y el README toman sus cifras al compilar.
- **Empieza aquí** mientras U0 llega, porque no depende de nada.

**N3. T6 del solver.**
- T6.4: los agentes respetan el orden de impactos.
- T6.3: la parte del solver del orden manual.
- T6.5 y T6.6: relecturas R12b grabadas y el prompt del corpus dice «reporte». Antes de gastar API, se pide autorización a René.

**N4. T5, el repositorio.** Va al final, para tomar capturas de Unity y cifras finales.
- **README** al nivel de Helada:
  - el problema y sus fuentes, qué hace y qué no;
  - cómo probarlo en vivo y en local (comandos para Windows);
  - resultados contra líneas base, con liga a `eval/results/`;
  - mapa del repo, datos y recursos con licencia;
  - IA responsable, límites y siguiente paso.
- **`docs/ESTADO.md`** de dos páginas.
- Lo anterior a CESVI pasa a `docs/historial/`.
- CI en menos de 10 minutos.

**N5. T2b.** Integrar la rama `resultados/computadora-demo-*` del colaborador: E6 y videos donde ya existan. El exportador a Blender queda congelado: no se extiende.

---

## 4. Orden y tiempos

```
Día 0     U-pre → U0 (contratos)         W1 (dictamen)          N2 (T3.2)
          ───────── U0 en main ─────────────────────────────────────────
Después   U1 → U2 → U3 → U4 → U5 → U6    W2 → W3 → W5 → W4      N1 → N2 → N3
Cierre    integración U6+W4 → segunda ronda con personas (W6) → N4 README
          → ensayo del guion → demo con CESVI (D7)
```

- **El camino largo es U.** Si U se atrasa, W y N no lo esperan: avanzan con lo suyo y W4 se cierra cuando U6 llegue.
- **Estimación** en sesiones de trabajo de Claude Code. No está medida: es para planear.
  - U: 10–14 sesiones.
  - W: 5–7 sesiones.
  - N: 6–8 sesiones.
- **Aprobaciones de René:** las capturas de U2, U3 y U5 (como en v3, por etapa, para que el 3D no se cierre sin que él lo vea) y los PR de contrato.

---

## 5. Lo que solo René (y el equipo) pueden hacer

| Qué | Cuándo |
| --- | --- |
| Agregar a los 2 compañeros como colaboradores del repo en GitHub. Cada uno usa su propia cuenta de Claude. | Hoy |
| Liberar espacio en disco en la computadora que corra Unity: el Editor y `Library/` ocupan 15–20 GB, y la laptop ya avisó que tiene poco espacio. | Antes de U1 |
| Instalar Unity Hub y Unity 6.3 LTS (licencia Personal) en esa computadora. | Antes de U1 |
| Decidir qué computadora hace los builds de Unity. La de más RAM hace los builds; la laptop de 8 GB puede editar, pero compilar WebGL ahí es lento. | Antes de U1 |
| Revisar una vez si Vercel bloquea los commits de los compañeros; fusionar siempre con «Create a merge commit». | Primer PR de W o N |
| Aprobar las capturas de U2, U3 y U5. | Cuando U lo pida |
| Autorizar el gasto de API de T6.5 y T6.6. | Cuando N3 lo pida |
| Segunda ronda con 3 personas. | Cuando W1–W3 estén en producción |
| Opcional: preguntar a CESVI qué les faltó del 3D actual (más realismo, más control de cámara, relieve…), para afinar la meta de U2–U5. | Cuando se pueda |
| Agendar la demo con CESVI. | Cuando D1–D6 estén en verde |

---

## 6. Riesgos

- **Rendimiento de Unity WebGL en la laptop de 8 GB y en el M1.** Se mide desde U1, con niveles, calidad automática y el visor three.js de respaldo.
- **Peso del build y almacenamiento de Blob.** Se guardan solo 2 builds y se verifica qué encabezados de compresión sirve Blob.
- **RAM y disco.** Unity, Claude Code y el navegador juntos no caben bien en 8 GB: hay que cerrar lo demás. Los compañeros no necesitan Unity.
- **Conflictos entre tres Claude Code.** Se evitan con carpetas propias, PR pequeños diarios, bitácora por frente, bloques de ADR y contratos primero.
- **Que el contrato se desvíe.** Solo cambia por PR de contrato; los tipos son generados y CI lo revisa.
- **«Verde» sin que René lo vea.** Se aprueba por etapa con capturas, como en v3.

## 7. Fuera de esta versión (no se borra)

- Lo que ya estaba fuera en v3: cuentas y nube, app móvil, dictado por voz, chat «Preguntar», OCR, mosaicos propios, la historia de lanzamiento.
- T1 en three.js, más allá de mantener el respaldo.
- Extender el exportador a Blender.

Todo queda en «Endurecimiento pendiente».
