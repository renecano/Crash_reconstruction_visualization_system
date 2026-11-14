# Croquis para CESVI · plan final (v4)

**Fecha:** 2026-11-07. **Sustituye a:** v3 (2026-10-30), que pasa a `docs/historial/`. Lo ya hecho en v3 sigue valiendo.

## Por qué hay v4

1. **CESVI pidió el 3D en Unity.** El visor three.js no les convence y creen que en Unity quedará mucho mejor. Queda sin efecto «three.js con WebGPU; nada de Unity» de v3. El visor three.js se queda como respaldo; no se borra.
2. **CESVI pidió tres cosas para la escena** (§0.3):
   - puntos intermedios y el punto inicial del choque;
   - objetos que se pueden mover;
   - un terreno que afecta la reconstrucción.
3. **Las personas que usaron Croquis dejaron cinco observaciones** (§0.2).

**Equipo.** Trabajan **dos Claude Code en paralelo**, cada uno en un frente con carpetas propias (§3):
- **U · visor Unity:** René.
- **W · web y física:** el compañero.

Esta es la recta final: lo que no está aquí no entra en esta versión.

---

## 0. Dónde estamos

### 0.1 Ya hecho

- **Física y evaluación:**
  - contrato 2.2.0, solver Python + port TS con paridad, multiarranque determinista y rango estable (ADR 0100);
  - E-R4 publicada: modalidad 58.3 % contra 37.2 % de la línea base.
- **AXA con sus dos lecturas:**
  - método de CESVI: 60.27 = 60.27 y 63.90 contra 63.15;
  - reconstrucción física (desde W8, ADR 0135): 56.87 km/h (54.79–78.39), −6.28 km/h y −9.94 % contra 63.15, la hipótesis «cuadra con el daño medido»; la alternativa con el reposo supuesto, 34.44 km/h. Antes de W8 era 71.56 (68.02–92.81), con el choque corrido 12 m.
- **Interfaz:**
  - rediseño Laboratorio de `/cesvi` (#178);
  - escena fácil, una pregunta a la vez;
  - búsqueda de lugar y cámaras del conductor;
  - fotos del dictamen corregidas.
- **Infraestructura:** despliegue verificado en Vercel con Blob y botón reanudable de la computadora de demo.

### 0.2 Observaciones de las personas que usaron Croquis

Están en `docs/cesvi/entrante/notas-sugerencias-croquis-cesvi.pdf`, con capturas.

| # | Dónde | Qué pasa | Fase |
| --- | --- | --- | --- |
| O1 | El hecho | Acepta cualquier texto («gggg…»), no pregunta y deja avanzar sin información suficiente. | W2 |
| O2 | Dictamen | «Citar velocidad» y «Citar supuestos» duplican el texto en cada clic. «Descargar el PDF» y «Exportar → Word» no hacen nada; `.croquis` sí funciona. | W1 |
| O3 | Reconstrucción | No se ve la zona completa ni hay forma de ir a la zona de interés, ni en 2D ni en 3D. | W6 (2D) y U4 (3D) |
| O4 | Todas | No se ve el relieve. | W5 y U2 |
| O5 | El hecho | No siempre pone la letra a ambos vehículos. Ejemplo: en «una combi colisiona con un pickup lobo», la combi se queda sin letra. | W2 |

### 0.3 Lo que pidió CESVI para la escena (2026-11-07)

| # | Qué piden | Qué significa en Croquis | Fase |
| --- | --- | --- | --- |
| C1 | **Puntos intermedios y punto inicial del choque** | Al colocar los choques, el perito marca:<br>(a) **el punto inicial del choque**, donde fue el primer contacto;<br>(b) **choques intermedios contra objetos** (pared, poste, barrera) en el lugar donde fueron, ligados al objeto y en su orden;<br>(c) **puntos de paso**: «el vehículo pasó por aquí», con hora opcional.<br>Lo que marca el perito es evidencia medida: pesa más que lo supuesto en la inversión, como siempre. | W3 (+ U2 para verlos en 3D) |
| C2 | **Mover objetos** | En la escena, agregar, mover, girar, cambiar el tamaño y quitar objetos: poste, muro o pared, árbol, barrera, guarnición, señal y vehículo estacionado. La reconstrucción se recalcula. También se pueden arrastrar en el 3D de Unity: la edición pasa por el puente y la web recalcula. | W4 (2D) y U6 (3D) |
| C3 | **El terreno afecta** | El terreno entra en la física, no solo en lo visual:<br>• **relieve** con altura real del lugar (fuente abierta de elevación) o declarado por el perito;<br>• **superficies por zona**: asfalto, concreto, terracería, grava, pasto, tierra o lodo, cada una con su fricción, su fuente y su rango;<br>• **ondulación**: zona con amplitud y longitud de onda declaradas;<br>• **topes** con su posición y medidas.<br>El solver calcula la altura, el cabeceo y el alabeo del vehículo, y Unity solo los reproduce. | W5 (+ U2) |

### 0.4 Lo que queda de v3

| Qué | Pasa a |
| --- | --- |
| T1 escenario 3D en three.js | **Se congela;** se rehace en Unity (U2–U5) |
| T2b integrar la corrida del colaborador | U7 |
| T3.2 rumbo inicial de V2 pegado a +20°, T3.3 reversa, T3.5 E-R4 v4 | W8 |
| T4 prueba con personas | La primera ronda está hecha (O1–O5); la segunda va con la v4 (§4) |
| T5 README y `ESTADO.md` | U7 |
| T6.2 versión declarada en el croquis 2D, T6.3 orden de impactos a mano, T6.4 los agentes respetan el orden | W7 |
| T6.5 y T6.6 relecturas R12b y prompt del corpus (con aprobación de API de René) | W9 |
| En curso en el Claude Code de René: `feat/axa-escena-colocada`, la cifra grande 71.56, Lighthouse | U-pre |

---

## 1. Definición de terminado (René palomea)

- [ ] **D1 · Visor Unity.** En `/cesvi`, el 3D es el de Unity, en el navegador y en el programa de escritorio de la demo. René aprueba las capturas de las 4 escenas de referencia:
  - AXA;
  - `lateral_interseccion`;
  - `nocturno_lluvia`;
  - la carambola;
  - una escena nueva con terracería, ondulación y topes.

  Se cumplen los fps de §7.8 de `PLAN.md`, medidos en la laptop de 8 GB y en una computadora con tarjeta de video.
- [ ] **D2 · Fidelidad.** En todos los casos versionados, Unity reproduce la pose de cada vehículo (incluidos la altura, el cabeceo y el alabeo) con menos de 1 cm y 0.1° de diferencia contra el `Resultado`. El daño en la malla cumple la tolerancia de `physics.md` (2 cm o 6 %). Ambas pruebas corren en CI.
- [ ] **D3 · Pedidos de CESVI.** C1–C3 funcionan de punta a punta: se marcan en 2D, el solver los usa y se ven en 3D. Sus pruebas:
  - casos analíticos conocidos del terreno: el frenado en pendiente coincide con la fórmula y el cambio de μ en terracería también;
  - la inversión respeta los puntos de paso dentro de su incertidumbre;
  - el choque intermedio ocurre contra el objeto marcado;
  - paridad Python ↔ TS.
- [ ] **D4 · Observaciones.** O1–O5 están corregidas, cada una con su prueba.
- [ ] **D5 · Números.** T3.2, T3.3 y T3.5 están en `eval/results/`, y la portada y el README toman de ahí sus cifras.
- [ ] **D6 · Endurecimiento y repo.**
  - T6.2–T6.4 están hechos; T6.5 y T6.6 están hechos o descartados por René.
  - README y `ESTADO.md` cumplen el estándar de Helada.
  - CI tarda menos de 10 min.
- [ ] **D7 · Personas y CESVI.**
  - Segunda ronda con 3 personas, con los 3 problemas más frecuentes corregidos.
  - Demo con CESVI, con sus comentarios anotados y una decisión para cada uno.

---

## 2. Decisiones de arquitectura

Las registra el frente U en un ADR en U0. Si al verificarlas en la documentación oficial alguna no se sostiene, se elige la alternativa más cercana y se anota.

### 2.1 Visor Unity

1. **Unity 6.3 LTS con URP:** una sola canalización para web y escritorio. El parche vigente se verifica y se anota en `docs/adr/0001-stack.md`. Licencia Personal; se desactiva la pantalla «Made with Unity», que en Unity 6 es opcional.
2. **El proyecto vive en el monorepo**, en `apps/visor-unity/`.
   - `.gitignore` estándar de Unity.
   - Los modelos se cargan en tiempo de ejecución desde Vercel Blob con glTFast. Son los mismos glTF CC-BY y sin marcas del visor web, registrados en `assets/ASSETS.md`.
   - El proyecto de prueba de la carpeta del Tec queda como experimento.
3. **Una sola entrada: el paquete `caso-3d` v1**, con `escena`, `resultado`, `relieve` (opcional) y `convenciones`.
   - Su esquema es `packages/scene-schema/caso3d.schema.json`, que referencia a los otros dos sin copiarlos.
   - Lo arma una función TS: `armarCaso3d(escena, resultado, relieve?)`.
   - El mismo paquete sirve para el puente, para el botón «Descargar paquete 3D» y para los fixtures en `packages/scene-schema/fixtures/caso3d/`, generados por script.
4. **Los tipos C# se generan** del esquema (se verifica la herramienta; quicktype es la opción a probar). Van en `apps/visor-unity/Assets/Croquis/Generated/`, no se editan a mano y CI revisa que estén al día.
5. **Unity solo reproduce.** No usa la física de Unity para el choque.
   - El movimiento sale de `resultado.*.trayectoria`: x, y, rumbo, más z, cabeceo y alabeo cuando vienen. Se interpola linealmente; el rumbo, por el camino angular más corto.
   - El daño sale de `dano.perfil_m`, con la regla de `physics.md`.
   - Vidrios, bolsas de aire, volante y giro de llantas son ilustrativos (ADR 0007).
6. **El núcleo C# no depende de Unity.** `Croquis.Core` es un asmdef con `noEngineReferences`, con su proyecto de pruebas `dotnet test` en CI (rápido y sin licencia).
   - Hace la lectura del paquete, la conversión de ejes, la interpolación, el perfil de daño sobre una malla y el encuadre de la zona de interés.
   - Conversión de ejes: Croquis usa X al este, Y al norte y rumbo antihorario desde +X; en Unity, posición = (x, z, y) y yaw = 90° − rumbo.
   - Las pruebas EditMode y PlayMode corren solo en local.
7. **Puente web ↔ Unity.** El contrato vive en `packages/scene-schema/visor-puente.md`, con tipos TS y un número de versión.
   - **De JS a Unity:** `cargarCaso`, `fijarTiempo`, `reproducir`, `pausar`, `velocidad`, `camara`, `calidad`, `encuadrar`, `capturar` y `modoEdicion(on/off)`.
   - **De Unity a JS:** `listo`, `cargado`, `tiempo`, `camara`, `captura{vista, png}`, `fps`, `error`, `objetoEditado{id, x, y, rumbo_deg, largo, ancho}` y `puntoMarcado{tipo, vehiculo_id?, objeto_id?, x, y}`.
   - Unity nunca recalcula. Manda la edición, la web actualiza la `EscenaSpec`, corre el solver y vuelve a cargar el caso.
8. **Distribución:**
   - **Web:** build WebGL en Vercel Blob, con un manifiesto versionado en `apps/web/public/visor-unity/manifest.json`. Se guardan solo los 2 últimos builds. La compresión se elige después de verificar qué encabezados sirve Blob.
   - **Escritorio:** build de Windows como zip en un release de GitHub; abre archivos `caso-3d`.
9. **Respaldo:** si no hay WebGL2, si se pierde el dispositivo o si la carga pasa del límite que fije el ADR, se abre el visor three.js como «Visor ligero», con un aviso.
10. **Fotos del dictamen:** se toman desde Unity con `capturar`, con la cámara cinematográfica en el impacto y en el reposo, esperando a que la escena esté lista. La foto de cada conductor sale de su propia cámara.
11. **Los builds de Unity no corren en CI:** necesitan licencia y tardan más de 10 min. Se hacen con `tools/unity/build-web.ps1` y `tools/unity/build-windows.ps1` (modo batch) en la computadora que asigne René.
12. **Siempre:** nada de logotipos ni marcas; «procedural» en la leyenda de lo procedural; leyenda ilustrativa en cada vista y captura; ningún número inventado.

### 2.2 Contrato 2.3.0 (para C1 y C3)

Lo sube U0 como PR `contract:`. Zod, Pydantic y C# se regeneran, y los fixtures se migran con su script en `fixtures/migrations/`. W lo ajusta con otro PR de contrato si al implementar hace falta.

- **C1 · Punto inicial y choques intermedios.** No hacen falta campos nuevos: ya existen `eventos[].punto_impacto`, `orden`, `actores` y `tipo` (`impacto_vehiculo_vehiculo` / `impacto_vehiculo_objeto`). El perito los marca con `procedencia.fuente = "perito"`.
- **C1 · Puntos de paso.** Campo nuevo: `vehiculos[].puntos_paso[]`, con:
  - `id`, `orden` y `posicion{x, y}`;
  - `precision_m`, con valor por defecto y declarado;
  - `t_s` y `rumbo_deg`, ambos opcionales;
  - `nota` y `procedencia`.
- **C3 · `lugar.terreno`.** `lugar.superficie` sigue siendo el valor por defecto fuera de las zonas.
  - `relieve`: `fuente` («dem», «declarado» o «plano»), resolución y referencia a la malla del paquete.
  - `superficies[]`: `{id, tipo, poligono[{x, y}], friccion{valor, rango, fuente}, procedencia}`.
  - `ondulaciones[]`: `{id, poligono, amplitud_m, longitud_onda_m, rumbo_deg, procedencia}`.
  - `topes[]`: `{id, linea[{x, y}, {x, y}], alto_m, largo_m, procedencia}`.
- **C2.** Los objetos ya tienen posición, rumbo, medidas y material en `entorno.objetos[]`; solo se agregan los tipos que falten (vehículo estacionado, señal).
- **Resultado.** `vehiculos[].trayectoria` agrega `z`, `cabeceo` y `alabeo`, opcionales. Se agrega el evento `cruce_tope`, con la velocidad de cruce.

---

## 3. Los dos frentes

> **Cambio del 2026-11-09 (René).** El compañero no ha subido nada del frente W, así que el Claude Code de René lleva los dos frentes.
>
> - **Antes de empezar una fase W:** `git fetch` y revisar si existe una rama o un PR `feat/w<n>` de esa fase. Si existe, no se toma y se sigue con la siguiente.
> - **Cada fase W que se toma** se anota en `docs/progress/W.md`, para que el Claude Code del compañero la vea.
> - **Fusiones:** el Claude Code de René fusiona con «Create a merge commit» cuando CI está en verde, sin esperar a René. Al cerrar cada fase deja su «Resumen para René» con capturas y sigue; René revisa cuando puede.
> - **Orden recomendado** (se puede cambiar con una razón anotada):
>   1. W1 y W2: errores que rompen el flujo del perito, y rápidos.
>   2. U2 → U3 → U4: el escenario, el daño y las cámaras, que es lo que CESVI pidió ver.
>   3. W3 → W4 ampliada → W5 → W6. Al terminar W3 y W5, sus marcadores y su terreno entran en el visor.
>   4. U5 → U6 → W4b → W7 → W8 → W9 → U7.
> - **La meta de U2–U5:** que la escena completa, no solo los autos, se vea como un juego actual de autos. El detalle está al inicio de §3.3.
> - **Dos fases nuevas:** W4 se amplía con «Corregir después» y se agrega W4b, «Menos ruido visual» (§3.4).
> - **Memoria (8 GB):** un solo proceso pesado a la vez. Unity en modo batch, las pruebas de Python y Playwright nunca corren juntos.

### 3.1 Quién hace qué

| Frente | Quién | Solo este frente cambia |
| --- | --- | --- |
| **U · Visor Unity, contratos e integración** | Claude Code de René (tiene Unity) | `apps/visor-unity/**`, `tools/unity/**`, `packages/scene-schema/caso3d*`, `visor-puente.md`, `fixtures/caso3d/**`, `apps/web/public/visor-unity/**`, el componente `<VisorUnity>` (carpeta propia en `apps/web`) y, al final, `README.md`, `docs/ESTADO.md` y `docs/historial/**` |
| **W · Web y física** | Claude Code del compañero | `apps/web/src/app/cesvi/**` y sus componentes (salvo `<VisorUnity>`), `packages/cesvi/**`, `packages/croquis-2d/**`, `packages/extraction/**`, `extraction/**`, `solver/**`, `packages/solver-ts/**`, `eval/**`, `data/**`, `apps/web/src/app/api/relieve/**`, las e2e de la web |

**Compartidos:** `escena.schema.json`, `resultado.schema.json`, `CLAUDE.md`, `docs/cesvi/PLAN-CESVI.md`, `.github/workflows/**`, `package.json`, `pnpm-lock.yaml` y el índice de `docs/PROGRESS.md`.
- Se cambian solo con un PR pequeño de tipo `contract:` o `chore:`, que René fusiona primero; el otro frente rebasa.
- Si `pnpm-lock.yaml` tiene conflicto, se regenera con `pnpm install`.
- `packages/viewer` (three.js) queda congelado: solo W lo toca, y solo para arreglar el respaldo.
- **Puntos de contacto entre frentes:**
  - Cuando U necesite enganchar `<VisorUnity>` en una pantalla de W (Reconstrucción, Análisis, Presentar, las fotos del dictamen), lo hace en un PR pequeño y lo anota en su bitácora.
  - Cuando W necesite que el 3D muestre algo nuevo, lo pide en la suya.

### 3.2 Reglas para que dos Claude Code no se pisen

- **Ramas.** `feat/u<n>-<tema>` y `feat/w<n>-<tema>`, de vida corta: un PR por fase o media fase, a `main` al menos una vez al día, rebasado sobre `main` antes de abrirlo.
- **Fusiones.** Solo René fusiona, con CI en verde, y con **«Create a merge commit»**. En Vercel Hobby con repo privado, los commits de otro autor pueden quedar bloqueados para desplegar; el commit de fusión de René es el que despliega. Si aun así se bloquea, se usa el Deploy Hook.
- **Bitácora por frente:** `docs/progress/U.md` y `docs/progress/W.md`, con plan, evidencia, cifras, pendientes, siguiente paso y «Necesito del otro frente». `docs/PROGRESS.md` queda como índice y «Estado actual»; solo lo actualiza U al integrar.
- **ADR por bloques:** U del 0110 al 0129; W del 0130 al 0169.
- **Contratos primero.** Nadie consume `caso-3d`, el puente ni los campos 2.3.0 antes de que U0 esté en `main`.
- **Pruebas** según `CLAUDE.md`: unitarias de cálculo y de lógica, más una e2e por flujo en Chromium. Las pesadas (e2e, capturas, fps) van al final de cada fase.
- **Secretos.** Cada quien usa su propia llave en su `.env.local`, o ninguna, porque las pruebas usan respuestas grabadas. Nunca pasan por chat ni van a archivos versionados.

### 3.3 Frente U · Visor Unity (Claude Code de René)

**La meta de U2–U5 (René, 2026-11-09; lo más importante de todo el plan).** CESVI no quedó convencido con el 3D de three.js y por eso pidió Unity. La vara es que la escena completa se vea como un juego actual de autos (GTA, Forza), con la complejidad que haga falta y sin versión mínima:

- **Vías con geometría real:** carriles, curvas con su radio, cruces y glorietas bien resueltos, guarniciones y banquetas con altura, camellones y barreras, marcas viales y desgaste como calcomanías, asfalto PBR y mojado con reflejos cuando llueve.
- **Entorno sin planos lisos ni horizonte vacío:** edificios y fachadas variados, vegetación, postes, señales, luminarias, terreno con relieve y perfil lejano. Todo procedural con semilla fija y marcado «procedural» en la leyenda.
- **Luz de cine:** cielo y sol según fecha, hora y latitud, sombras suaves, oclusión ambiental, niebla y lluvia con densidad física. De noche, luminarias y faros que iluminan el asfalto.
- **Vehículos:** pintura con el color del caso, vidrio, cromo, luces de freno cuando frenan y faros de noche.
- **Función de altura:** el escenario se diseña desde el inicio sobre z(x, y), hoy plana, para que el relieve, la ondulación y los topes de W5 entren sin rehacer las vías.
- **WebGL:** todo debe funcionar en el build WebGL. Antes de apoyarse en una función de URP, se verifica en la documentación oficial que exista ahí.
- **Recursos:** CC0 o CC-BY sin marcas, registrados en `assets/ASSETS.md`, servidos desde Blob y fuera de git. Se mide cuánto ocupa Blob y se conservan solo los 2 últimos builds.
- **Presupuesto:** después de cada subetapa se miden peso, tiempo de carga y fps con `eval/unity_build.mjs` en la laptop. Si media no cumple §7.8 de `PLAN.md`, se recorta densidad en media, nunca función; alta y ultra conservan todo.
- **La física no cambia de lugar:** Unity solo reproduce el `Resultado`.

**U-pre. Cerrar lo que está en curso.** `feat/axa-escena-colocada`, la cifra grande 71.56 (con la mediana 75.2 como dato secundario), Lighthouse y el «Resumen para René». Se fusiona.

**U0. Contratos y organización.** Desbloquea a W. Medio día.
- Contrato 2.3.0 de §2.2, con migración de fixtures.
- `caso3d.schema.json` con la forma de `relieve`:
  - origen en latitud, longitud y en x, y de la escena;
  - resolución en metros, ancho y alto de la malla;
  - alturas en metros relativas al punto de impacto;
  - fuente, licencia y resolución nativa.
- `armarCaso3d` con su prueba.
- Generador de C# y su revisión en CI.
- `visor-puente.md` con sus tipos.
- Script de fixtures `caso3d`.
- El ADR de §2.
- `docs/progress/{U,W}.md`.
- `CLAUDE.md` con el visor en Unity, sus reglas y la tabla de frentes.
- Este plan copiado a `docs/cesvi/PLAN-CESVI.md`; v3 pasa a `docs/historial/`.

**U1. Núcleo y reproducción.**
- Proyecto en `apps/visor-unity/` con el mismo paquete MCP de Unity del proyecto de prueba (ver su `Packages/manifest.json`), Newtonsoft y glTFast.
- `Croquis.Core` con sus pruebas `dotnet`.
- Vehículos con los glTF de Blob según su clase y las llantas en los ejes.
- Línea de tiempo.
- **Desde aquí, un build WebGL de prueba,** para medir peso y carga en la laptop. El riesgo más grande se mide al principio.
- **Listo cuando:** D2 pasa en CI para todos los casos y el peso y el tiempo de carga quedan en `eval/results/unity_build.json`.

**U2. Escenario** (con las reglas de T1.1–T1.3 de v3).
- **Vías desde `lugar`,** en todas las variantes de `tipo_via`:
  - recta;
  - curva con radio;
  - cruces en X y en T;
  - glorieta;
  - autopista con camellón y barreras.
- **Red vial de OpenStreetMap** cuando hay `ubicacion_real`.
- **Elementos de la vía:** marcas viales como calcomanías y guarniciones y banquetas con altura real.
- **Dispositivos y objetos:** semáforos con sus fases en el tiempo y los objetos colocados.
- **Evidencias** a escala: huellas, vidrios y restos.
- **Terreno de C3:**
  - malla de relieve, más la ondulación;
  - topes con su geometría;
  - materiales por zona (terracería, grava, pasto…).
- **Marcadores de C1:** punto inicial, choques intermedios y puntos de paso, visibles y con opción de ocultarlos.
- **Entorno procedural** con semilla fija y la etiqueta «procedural».
- **Cielo y luz:** sol según fecha, hora y latitud; noche con luminarias y faros; lluvia con piso mojado.
- **Listo cuando:** ninguna cámara ve un plano liso ni un horizonte vacío en las 5 escenas de D1, y René aprueba las capturas.

**U3. Daño y personas.**
- Deformación con `perfil_m` y su prueba en el núcleo.
- Ocupantes.
- Peatones y motos con su trayectoria.
- Volcadura, si el `Resultado` trae el giro; si no, se anota como pendiente.
- **Listo cuando:** pasa la parte de daño de D2 y René aprueba las capturas.

**U4. Cámaras y encuadre** (resuelve O3 en 3D).
- **Cámaras:** cenital, cinematográfica, órbita, conductor A y B a la altura del ojo de `visibilidad`, y libre; con ratón y táctil.
- **Encuadre automático de la zona de interés:** trayectorias, reposo, evidencias, objetos y marcadores de C1. Botones «Ver todo» e «Ir al impacto».
- **Minimapa.**
- **Listo cuando:**
  - prueba en el núcleo: «Ver todo» deja en cuadro las poses finales y el punto de impacto en todos los casos;
  - e2e de cambio de cámaras.

**U5. Calidad y rendimiento.**
- **Niveles:** baja, media, alta y ultra.
- **Calidad automática** con las reglas de la web: nunca sube durante la sesión, y baja un nivel si los fps quedan debajo de 24 durante 5 s. Con tope de dpr.
- **Panel de diagnóstico.**
- **Medición:** en la laptop (WebGL en media) y en una computadora con tarjeta de video (escritorio en alta y ultra), guardada en `eval/results/e6_unity_*.json`.
- **Si no alcanza:** si media no llega a §7.8, se recorta densidad, nunca función. Si el recorte toca alta o ultra, se pregunta a René.

**U6. Puente, builds e integración.**
- `.jslib` del puente, `<VisorUnity>` en la web (carga diferida, con respaldo three.js), las fotos del dictamen con `capturar` y el botón «Descargar paquete 3D».
- **Modo edición en 3D (C2 y C1):** arrastrar y girar objetos y marcar puntos. Unity manda la edición, la web recalcula y recarga.
- Scripts de build y de subida a Blob, y el manifiesto.
- Build de Windows con un caso de ejemplo.
- **Listo cuando:** en producción:
  - `/cesvi` muestra Unity en Reconstrucción, Análisis y Presentar;
  - mover un poste en 3D recalcula;
  - las fotos del dictamen salen de Unity;
  - el respaldo funciona;
  - pasa la e2e del flujo completo en Chromium.

**U7. Cierre.**
- T2b: integrar la rama `resultados/computadora-demo-*`. El exportador a Blender queda congelado.
- T5: README al nivel de Helada, con capturas de Unity y cifras de `eval/results/`, y `docs/ESTADO.md` de dos páginas. Lo anterior a CESVI pasa a `docs/historial/`. CI en menos de 10 min.
- Ensayo del guion de la demo.

### 3.4 Frente W · Web y física (Claude Code del compañero)

**W1. Dictamen (O2).** Primero, porque rompe el flujo del perito.
- «Citar velocidad» y «Citar supuestos» deben ser idempotentes: si el bloque ya está, se resalta o se reemplaza; nunca se duplica.
- «Descargar el PDF» y «Exportar → Word» deben descargar archivos válidos.
- La causa raíz se anota en la bitácora.
- **Pruebas:**
  - unitaria: citar dos veces deja un solo bloque;
  - e2e en Chromium: el PDF abre y tiene ≥ 1 página; el Word es un zip con `word/document.xml`.

**W2. El hecho (O1 y O5).**
- **Antes de llamar al modelo:** se revisa que el relato tenga contenido real, no solo longitud (proporción de palabras reconocibles, repetición, letras contra símbolos). Si no pasa, sale un mensaje amable con un ejemplo, no se gasta API y la ruta responde `relato_insuficiente`.
- **Lo mínimo para reconstruir:** un vehículo y otro actor (vehículo, peatón u objeto), el tipo de impacto o la zona de contacto, y el lugar o su confirmación en el mapa.
  - **Si no hay nada reconstruible:** «Continuar» se bloquea y se explica por qué.
  - **Si es parcial:** se puede seguir, con las preguntas pendientes al frente y la lista de supuestos declarados.
  - Si falta un dato que cambia la reconstrucción, siempre hay preguntas.
- **O5:**
  - cada vehículo identificado lleva su letra en la mención y su tarjeta en el panel;
  - vocabulario mexicano en el mapeo a `vehicle_classes.json`: combi, pesero, micro, microbús, vocho, urvan, torton, rabón, tráiler, pipa, volteo, motoneta, taxi; si no hay clase exacta, la más cercana, como supuesto declarado;
  - los nombres comerciales («Lobo») van solo en texto.
- **Pruebas:** unitarias con respuestas grabadas, entre ellas «En el zócalo de la Ciudad de México una combi colisiona con un pickup lobo en su parte trasera derecha» y «gggg…».

**W3. Punto inicial, choques intermedios y puntos de paso (C1).**
- **En la escena fácil,** después de colocar los vehículos, siempre una pregunta a la vez, con tarjetas y mensajes de éxito y de alerta como el resto:
  - «¿Dónde fue el primer golpe?»: un toque en el mapa;
  - «¿Chocó contra algo más?»: se elige o se agrega el objeto y se toca dónde fue;
  - «¿Sabes por dónde pasó?»: puntos de paso opcionales.
- **Solver (Python + TS, paridad):**
  - los puntos de paso entran a la inversión como residuo: la distancia mínima de la trayectoria al punto, con su `precision_m`, y la posición en `t_s` si se dio;
  - el punto inicial marcado entra como evidencia medida (si hoy no se usa en la inversión, se agrega);
  - los choques intermedios usan el objeto y el lugar marcados, en su orden.
- **Pruebas:** casos sintéticos donde la inversión pasa por el punto dentro de su incertidumbre y el choque intermedio ocurre contra el objeto marcado.

**W4. Objetos que se mueven (C2, en 2D) y corregir después.**
- En la escena: agregar desde una paleta con siluetas claras (poste, pared, árbol, barrera, guarnición, señal, vehículo estacionado), arrastrar, girar, cambiar el tamaño y quitar.
- Al soltar, se recalcula, con un mensaje de éxito; si el objeto se empalma con un vehículo o con otro objeto, sale una alerta.
- **Corregir después (René, 2026-11-09).** Todo lo que el perito coloca en la escena fácil se puede corregir, no solo los objetos: la dirección de cada vehículo (hoy una flecha puesta en diagonal por error ya no se puede arreglar), su posición de reposo, el primer golpe, los choques intermedios y los puntos de paso.
  - **Tocar algo ya colocado** lo selecciona y muestra controles grandes: arrastrar, girar con manija o con botones de ±15°, «Cambiar» (reabre la pregunta original con su respuesta marcada) y «Quitar».
  - **En el resumen «¡La escena está lista!»,** cada respuesta lleva «Cambiar», que regresa solo a esa pregunta sin rehacer las demás.
  - **«Deshacer» y «Rehacer»** siempre visibles.
  - **Al soltar** se recalcula, con mensaje de éxito; si algo queda empalmado, sale una alerta con «Separarlos / Así está bien».
- **Pruebas:** unitaria de la edición sobre la `EscenaSpec`; e2e: mover un poste cambia el resultado, y corregir la dirección de un vehículo ya colocado también.

**W4b. Menos ruido visual (René, 2026-11-09).** Hay demasiados números y elementos que un perito de CESVI no va a leer.
- **Regla:** a primera vista, cada pantalla muestra solo lo que aparece en un dictamen de CESVI o lo que el perito necesita para decidir ahí. Lo demás va a un «Ver detalle» plegado. Nada se borra y todo sigue disponible para el dictamen.
- **Un número por cantidad** en toda la app.
- **Antes de cambiar nada:** inventario por pantalla (qué se queda y qué se pliega), con capturas de antes y después, de día y de noche, para que René corrija lo que no le convenza.

**W5. Terreno (C3 y O4).** Cada efecto del terreno lleva fuente o queda como supuesto declarado con rango, con pruebas analíticas y paridad Python ↔ TS; un terreno plano debe dar exactamente el resultado de hoy.
- **Relieve real.** Se verifica la licencia y el acceso de la fuente y se registra en `data/SOURCES.md`. En orden de preferencia:
  1. Continuo de Elevaciones Mexicano de INEGI;
  2. Copernicus GLO-30 (COG abierto);
  3. Terrain Tiles de AWS.

  La ruta `/api/relieve` (TS; en producción no hay Python) devuelve la malla con la forma de `caso3d.relieve`, con caché. Se dice con honestidad: una malla de 15–30 m no ve una rampa de 2 m.
- **En la escena fácil:** «¿Cómo es el terreno?», con opciones visuales: pavimento liso, terracería, grava, pasto u otro, ondulado y con topes. Las zonas se dibujan con unos toques y los topes se colocan como línea. Valores por defecto con fuente: la fricción por superficie sale de `data/friction.json`, y las medidas de los topes de la norma o el manual de dispositivos que se verifique. El perito los puede cambiar.
- **Solver (Python + TS, paridad, documentado en `physics.md` con fuentes):**
  - **gravedad:** componente según el gradiente de la altura z(x, y) (relieve + ondulación), que generaliza la `pendiente` actual;
  - **fricción por zona:** según la superficie bajo el vehículo, con su rango en el Monte Carlo;
  - **topes:** pérdida parcial de contacto y de energía al cruzarlos, modelada con fuente o como supuesto declarado con rango, más el evento `cruce_tope` con la velocidad;
  - **pose en el terreno:** z, cabeceo y alabeo calculados por contacto con el terreno, para que Unity solo los reproduzca.
- **Dónde se ve en la web:**
  - perfil de elevación en Reconstrucción (altura a lo largo del camino de A y de B);
  - sombreado o curvas de nivel y las zonas de superficie en el croquis 2D.
- **Pruebas analíticas:**
  - el frenado en pendiente constante coincide con la fórmula;
  - en terracería, la distancia cambia según μ;
  - malla plana = resultado de hoy (no se rompe nada);
  - paridad.
- **Escena de referencia nueva** en `fixtures/`: terracería con ondulación y topes. Es la quinta de D1.

**W6. Encuadre en 2D (O3).**
- Ajuste automático a trayectorias, poses finales, evidencias y marcadores.
- Zoom y desplazamiento con ratón, rueda y táctil; botones «Ver todo» e «Ir al impacto».
- Escala gráfica y flecha del norte.
- Aplica en Reconstrucción, Análisis y Contra CESVI.
- **Prueba:** unitaria del encuadre.

**W7. Endurecimiento.**
- T6.2: la versión declarada se dibuja en el croquis 2D.
- T6.3: orden de impactos a mano en carambolas, en interfaz y solver.
- T6.4: los agentes respetan el orden de impactos.
- Cada uno con su prueba.

**W8. Números.**
- T3.2: rumbo inicial de V2 pegado a +20°; diagnosticar y corregir con fuente, medido en AXA y en todos los casos.
- T3.3: reversa, con el sentido de marcha separado del rumbo, en contrato, Python y TS; `cesvi-3a0125cb81` reconstruye al que retrocede.
- T3.5: E-R4 v4 completa, con C1 y C3 ya dentro.

**W9.** T6.5 y T6.6, con autorización de API de René antes de gastar. Después, los 3 problemas más frecuentes de la segunda ronda con personas.

---

## 4. Orden y tiempos

```
Día 0     U-pre → U0 (contratos 2.3.0, caso-3d, puente)        W1 (dictamen)
          ────────────── U0 en main ──────────────────────────────────────────
Después   U1 → U2 → U3 → U4 → U5 → U6                         W2 → W3 → W4 → W5 → W6 → W7 → W8
Cierre    segunda ronda con 3 personas (cuando W1–W6 estén en producción) → W9
          → U7 (README, ESTADO, ensayo) → demo con CESVI
```

- **Los dos frentes son largos.** El orden de W pone primero lo que rompe el flujo (O2, O1/O5) y lo que pidió CESVI (C1–C3); los números van después.
- **Si U llega a U2 antes de que W termine C1 o C3,** dibuja lo que ya viene en el paquete y deja preparados los marcadores y el terreno para cuando lleguen.
- **Estimación,** en sesiones de Claude Code (no está medida; es para planear): U 11–15, W 11–15.
- **René aprueba** las capturas de U2, U3 y U5, la escena fácil con C1–C3 y los PR de contrato.

---

## 5. Lo que solo René (y el compañero) pueden hacer

| Qué | Cuándo |
| --- | --- |
| Agregar al compañero como colaborador del repo; él usa su propia cuenta de Claude. | Hoy |
| Liberar 15–20 GB de disco en la computadora con Unity (la laptop ya avisó que tiene poco espacio). | Antes de U1 |
| Instalar Unity Hub y Unity 6.3 LTS (Personal). Decidir qué computadora hace los builds: la de más RAM. | Antes de U1 |
| Revisar una vez que Vercel despliega los PR del compañero fusionados con «Create a merge commit». | Primer PR de W |
| Aprobar las capturas de U2, U3 y U5 y la escena fácil con C1–C3. | Cuando lo pidan |
| Autorizar el gasto de API de W9. | Cuando W lo pida |
| Segunda ronda con 3 personas. | Cuando W1–W6 estén en producción |
| Agendar la demo con CESVI. | Cuando D1–D6 estén en verde |

## 6. Riesgos

- **Unity WebGL en la laptop de 8 GB y en el M1.** Se mide desde U1, con niveles y con el respaldo three.js.
- **El terreno en la física es lo más delicado de W5.** Mitigaciones:
  - cada efecto con fuente o como supuesto declarado con rango;
  - pruebas analíticas;
  - una malla plana debe dar exactamente el resultado de hoy;
  - nada se ajusta para que «se vea bien».
- **Conflictos entre los dos Claude Code.** Carpetas propias, PR pequeños diarios, bitácoras separadas, ADR por bloques y contratos primero.
- **Peso del build y almacenamiento de Blob.** Se guardan 2 builds y se verifica la compresión.
- **«Verde» sin que René lo vea.** Aprobación por etapa, con capturas.

## 7. Fuera de esta versión (no se borra)

- Lo que ya estaba fuera en v3: cuentas y nube, app móvil, dictado por voz, chat «Preguntar», OCR, mosaicos propios, historia de lanzamiento.
- T1 en three.js más allá del respaldo.
- Extender el exportador a Blender.

Todo queda en «Endurecimiento pendiente».
