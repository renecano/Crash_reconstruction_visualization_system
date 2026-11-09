# Bitácora del frente U · Visor Unity, contratos e integración

Plan: `docs/cesvi/PLAN-CESVI.md` §3.3. Reglas: `CLAUDE.md`. ADR del bloque 0110–0129 (el 0110 ya estaba usado, así que este frente empieza en el 0111).

## Estado

- **Fase actual:** U2 (escenario), segunda pasada, en el orden que fijó René el 2026-11-09: 1 luz y color, 2 calle mexicana, 3 suelo y desgaste, 4 árboles, 5 autopista y cerros.
- **Hecho:** el punto 1. **En curso:** el punto 2 (`cuadras.ts` y las fachadas por tipo de lote).
- **Siguiente paso:** cerrar el punto 2 con sus capturas, su build WebGL y su medición. Al terminar los 5: publicar el build en Blob y entregar las 20 capturas nuevas junto a las del 2026-11-09.
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

- La segunda pasada de calidad, con la lista de «Lo que no convence todavía».
- La red vial de OpenStreetMap: el escenario ya la toma si la escena la trae, pero ninguna de las 5 escenas la trae y no se ha visto.
- Medir Blob y dejar solo los 2 últimos builds (hoy hay uno publicado, el de U1).
- Las pruebas EditMode del escenario dentro de Unity.

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

## Necesito del otro frente

Nada por ahora.

## Bloqueado

Nada por ahora.
