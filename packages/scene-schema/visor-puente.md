# Puente web ↔ visor Unity

**Versión 1.5.0.** Los tipos están en `src/visor-puente.ts` (`VISOR_PUENTE_VERSION`), y una prueba revisa que este documento y los tipos nombren los mismos mensajes. Este contrato solo cambia con un PR `contract:`.

## Cómo viajan los mensajes

- **De la web a Unity:** `unityInstance.SendMessage("VisorPuente", "<mensaje>", "<JSON>")`, con los campos de la tabla como objeto JSON. Sin campos, `"{}"`.
- **De Unity a la web:** Unity llama a `window.croquisVisorMensaje("<JSON>")`, con el nombre en `tipo` y los campos al mismo nivel: `{"tipo":"tiempo","t":0.4}`.
- **Al arrancar:** Unity manda `listo` con su versión. Si no es una de las que acepta la web (`VERSIONES_PUENTE_COMPATIBLES`), la web no carga el caso y abre el visor ligero.

## De la web a Unity

| Mensaje       | Campos                                                                                       | Qué hace                                                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cargarCaso`  | `json`: el paquete caso-3d, como texto                                                       | Carga el caso. Contesta `cargado` o `error`.                                                                                                                                                     |
| `fijarTiempo` | `t`: segundos, 0 es el impacto principal                                                     | Lleva la reproducción a ese instante.                                                                                                                                                            |
| `reproducir`  |                                                                                              | Reproduce.                                                                                                                                                                                       |
| `pausar`      |                                                                                              | Pausa.                                                                                                                                                                                           |
| `velocidad`   | `x`: 0.25, 0.5 o 1                                                                           | Cambia la velocidad.                                                                                                                                                                             |
| `camara`      | `modo`                                                                                       | Cambia de cámara.                                                                                                                                                                                |
| `calidad`     | `nivel`: `baja`, `media`, `alta`, `ultra`, `auto`; `escala` (opcional): número fijo o `null` | Fija el nivel, o lo deja automático. Con `escala`, fija la escala de dibujo (1: la resolución completa) o, con `null`, la devuelve a la automática; sin el campo no la cambia (lo usa el video). |
| `encuadrar`   | `zona`: `todo` o `impacto`                                                                   | «Ver todo» o «Ir al impacto».                                                                                                                                                                    |
| `capturar`    | `vista`, `ancho`, `alto`                                                                     | Toma una foto cuando la escena está lista. Contesta `captura`.                                                                                                                                   |
| `modoEdicion` | `on`: sí o no; `herramienta`, `vehiculo_id`                                                  | Permite arrastrar objetos o marcar un punto, según la herramienta.                                                                                                                               |
| `marcadores`  | `visibles`: sí o no                                                                          | Muestra u oculta los puntos de C1: primer golpe, choques intermedios y puntos de paso.                                                                                                           |
| `piso`        | `imagen`, `centro_x`, `centro_y`, `lado_m`, `atribucion`                                     | Cambia el piso del modo «mapa real» sin recargar el caso. Con `imagen` nula, vuelve al entorno procedural.                                                                                       |
| `leyenda`     | `visible`: sí o no                                                                           | Muestra u oculta la leyenda ilustrativa de Unity. La web la oculta solo mientras pone la suya (Presentar).                                                                                       |

**`modo`:** `cenital`, `cinematica`, `orbita`, `acera`, `libre`, `automatica`, `conductor:<id del vehículo>`, `cerca:<id del vehículo>:<azimut°>:<distancia m>:<altura m>` o `persona:<id de la persona>`. `acera` es de pie junto al árbol más cercano a la acción. `cerca` sigue al vehículo desde un azimut contado desde su frente hacia su derecha (la web la usa para «Detrás de A» y para el daño). `persona` sigue a quien va a pie, en bici o en moto, desde su costado.

**`herramienta`:** `mover` (la de omisión: arrastrar un objeto lo mueve, la rueda o dos dedos lo giran, y con mayúsculas la rueda cambia su largo), `punto_inicial`, `choque_intermedio` o `punto_paso` (un clic en el piso marca ese punto). Los puntos de un vehículo llevan su `vehiculo_id`.

**Cambios de la 1.1.0:** la cámara `acera` y el mensaje `marcadores`.

**Cambios de la 1.2.0:** la vista `antes` de `capturar` (un segundo antes del impacto: el dictamen lleva tres fotos), la `herramienta` de `modoEdicion`, y el campo `tipo` de `puntoMarcado` se llama `punto` (chocaba con el `tipo` del mensaje, y se perdía).

**Cambios de la 1.3.0** (ronda 4; ADR 0123 y 0124):

- **El mensaje `piso`.** `imagen` es una data URL (JPEG o PNG), cuadrada y con el norte arriba; cubre `lado_m` metros con su centro en (`centro_x`, `centro_y`) de la escena. Mientras hay piso, Unity apaga el entorno procedural (calles, edificios, árboles y cerros) y dibuja la imagen como piso, sin sombras de nubes ni charcos encima.
- **Dos campos opcionales en `caso-3d`.**
  - `piso`: lo mismo, dentro del paquete. Lleva solo el mapa de OpenStreetMap: la foto satelital va por el mensaje y nunca se guarda.
  - `fantasma`: una versión del caso (`etiqueta` y `resultado`). Unity dibuja sus vehículos translúcidos, sin daño, con el mismo reloj que la reconstrucción.
- **La web sigue aceptando la 1.2.0** (`VERSIONES_PUENTE_COMPATIBLES`). Con ella no manda el piso ni el fantasma (`conPisoYFantasma`, verdadero en la 1.3.0 y la 1.4.0).

**Cambios de la 1.4.0** (Presentar, 2026-11-26):

- **El mensaje `leyenda`.** En Presentar la web pone su leyenda completa encima del 3D, y la de Unity quedaba repetida y medio tapada por el degradado. La web manda `leyenda` con `visible: false` al entrar a Presentar y con `visible: true` al salir. Al cargar un caso, Unity la muestra. La web sigue aceptando la 1.3.0 y la 1.2.0: a esas no les manda el mensaje (`conLeyenda`).

**Cambios de la 1.5.0** (el video, 2026-11-27):

- **La cámara `automatica`.** Con «Descargar video» el impacto podía quedar tapado: en un alcance, la cámara fija lo veía desde atrás de los vehículos. La `automatica` cambia de toma según el instante, y en todas el punto de contacto (`resultado.punto_impacto`) se ve sin que nada lo tape (edificios, copas de árboles ni los propios vehículos):
  - **La llegada:** desde arriba y de lado, con los vehículos y el punto de contacto en cuadro.
  - **El impacto:** de cerca, de lado al contacto (perpendicular a la línea entre los vehículos) y desde un lado despejado. La cámara lenta la pone la web con los instantes que pide (`fijarTiempo`).
  - **El final:** desde arriba, con las posiciones finales y el punto de contacto.
  - Entre una toma y otra, Unity pasa con un movimiento suave.
- La web sigue aceptando la 1.4.0, la 1.3.0 y la 1.2.0; a esas no les ofrece la `automatica` (`conCamaraAutomatica`) y graba con la cámara que el perito tiene elegida.
- **El trayecto previo** (`trayecto_previo` del paquete, Unity #377) lo dibujan los builds de la 1.5.0 compilados desde `main` (`conTrayectoPrevio`). La web sabe qué versión trae el build publicado antes de arrancar Unity: el manifiesto lleva `puente` (lo escribe `publicar-web.mjs --release <huella> --puente <versión>`). Con un build de antes de la 1.5.0, La escena no pregunta «¿De dónde venía?» (René, 2026-11-27).

**`vista`:** `antes` (t = −1 s), `impacto` (t = 0) y `reposo` (al final) salen con la cámara cinematográfica; `conductor:<id del vehículo>`, con la de ese conductor en el impacto. La foto se toma a la escala de dibujo completa, sin minimapa ni panel; la leyenda ilustrativa la pone la web al pie.

## De Unity a la web

| Mensaje         | Campos                                                    | Cuándo                                     |
| --------------- | --------------------------------------------------------- | ------------------------------------------ |
| `listo`         | `version`                                                 | Al terminar de arrancar.                   |
| `cargado`       | `escena_id`; `omitidos` (opcional): lo que el 3D omitió   | El caso ya se puede ver.                   |
| `tiempo`        | `t`                                                       | Mientras avanza la reproducción.           |
| `camara`        | `modo`                                                    | Cambió la cámara.                          |
| `captura`       | `vista`, `png`: base64 sin el prefijo `data:`             | Respuesta a `capturar`.                    |
| `fps`           | `p50`                                                     | Cada 5 s, para la calidad automática.      |
| `error`         | `codigo`, `mensaje`                                       | Ver abajo.                                 |
| `objetoEditado` | `id`, `x`, `y`, `rumbo_deg`, `largo`, `ancho`             | El perito soltó un objeto en modo edición. |
| `puntoMarcado`  | `punto`, `vehiculo_id` y `objeto_id` opcionales, `x`, `y` | El perito marcó un punto en modo edición.  |

**`punto` de `puntoMarcado`:** `punto_inicial`, `choque_intermedio` o `punto_paso`. Un choque intermedio lleva el `objeto_id` del objeto tocado.

**`codigo` de `error`:** `version_puente`, `caso_invalido`, `modelo_no_cargo`, `dispositivo_perdido`, `captura_fallo` o `interno`. Con `dispositivo_perdido`, o si la carga pasa del límite de `docs/adr/0111-visor-unity.md`, la web abre el visor ligero (three.js) con un aviso.

## Reglas

- **Unity nunca recalcula.** Manda la edición, la web actualiza la `EscenaSpec`, corre el solver y vuelve a mandar `cargarCaso`.
- **Unity solo reproduce** lo que trae el paquete: todo movimiento sale de `resultado`, y no usa la física de Unity para el choque.
- **Las coordenadas de los mensajes** son las de la escena: metros, X al este, Y al norte, con `rumbo_deg` antihorario desde +X.
