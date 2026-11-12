# Puente web ↔ visor Unity

**Versión 1.2.0.** Los tipos están en `src/visor-puente.ts` (`VISOR_PUENTE_VERSION`), y una prueba revisa que este documento y los tipos nombren los mismos mensajes. Este contrato solo cambia con un PR `contract:`.

## Cómo viajan los mensajes

- **De la web a Unity:** `unityInstance.SendMessage("VisorPuente", "<mensaje>", "<JSON>")`, con los campos de la tabla como objeto JSON. Sin campos, `"{}"`.
- **De Unity a la web:** Unity llama a `window.croquisVisorMensaje("<JSON>")`, con el nombre en `tipo` y los campos al mismo nivel: `{"tipo":"tiempo","t":0.4}`.
- **Al arrancar:** Unity manda `listo` con su versión. Si no coincide con la de la web, la web no carga el caso y abre el visor ligero.

## De la web a Unity

| Mensaje       | Campos                                            | Qué hace                                                                               |
| ------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `cargarCaso`  | `json`: el paquete caso-3d, como texto            | Carga el caso. Contesta `cargado` o `error`.                                           |
| `fijarTiempo` | `t`: segundos, 0 es el impacto principal          | Lleva la reproducción a ese instante.                                                  |
| `reproducir`  |                                                   | Reproduce.                                                                             |
| `pausar`      |                                                   | Pausa.                                                                                 |
| `velocidad`   | `x`: 0.25, 0.5 o 1                                | Cambia la velocidad.                                                                   |
| `camara`      | `modo`                                            | Cambia de cámara.                                                                      |
| `calidad`     | `nivel`: `baja`, `media`, `alta`, `ultra`, `auto` | Fija el nivel, o lo deja automático.                                                   |
| `encuadrar`   | `zona`: `todo` o `impacto`                        | «Ver todo» o «Ir al impacto».                                                          |
| `capturar`    | `vista`, `ancho`, `alto`                          | Toma una foto cuando la escena está lista. Contesta `captura`.                         |
| `modoEdicion` | `on`: sí o no; `herramienta`, `vehiculo_id`       | Permite arrastrar objetos o marcar un punto, según la herramienta.                     |
| `marcadores`  | `visibles`: sí o no                               | Muestra u oculta los puntos de C1: primer golpe, choques intermedios y puntos de paso. |

**`modo`:** `cenital`, `cinematica`, `orbita`, `acera`, `libre` o `conductor:<id del vehículo>`. `acera` es de pie junto al árbol más cercano a la acción.

**`herramienta`:** `mover` (la de omisión: arrastrar un objeto lo mueve, la rueda o dos dedos lo giran, y con mayúsculas la rueda cambia su largo), `punto_inicial`, `choque_intermedio` o `punto_paso` (un clic en el piso marca ese punto). Los puntos de un vehículo llevan su `vehiculo_id`.

**Cambios de la 1.1.0:** la cámara `acera` y el mensaje `marcadores`.

**Cambios de la 1.2.0:** la vista `antes` de `capturar` (un segundo antes del impacto: el dictamen lleva tres fotos) y la `herramienta` de `modoEdicion`.

**`vista`:** `antes` (t = −1 s), `impacto` (t = 0) y `reposo` (al final) salen con la cámara cinematográfica; `conductor:<id del vehículo>`, con la de ese conductor en el impacto. La foto se toma a la escala de dibujo completa, sin minimapa ni panel; la leyenda ilustrativa la pone la web al pie.

## De Unity a la web

| Mensaje         | Campos                                                   | Cuándo                                     |
| --------------- | -------------------------------------------------------- | ------------------------------------------ |
| `listo`         | `version`                                                | Al terminar de arrancar.                   |
| `cargado`       | `escena_id`                                              | El caso ya se puede ver.                   |
| `tiempo`        | `t`                                                      | Mientras avanza la reproducción.           |
| `camara`        | `modo`                                                   | Cambió la cámara.                          |
| `captura`       | `vista`, `png`: base64 sin el prefijo `data:`            | Respuesta a `capturar`.                    |
| `fps`           | `p50`                                                    | Cada 5 s, para la calidad automática.      |
| `error`         | `codigo`, `mensaje`                                      | Ver abajo.                                 |
| `objetoEditado` | `id`, `x`, `y`, `rumbo_deg`, `largo`, `ancho`            | El perito soltó un objeto en modo edición. |
| `puntoMarcado`  | `tipo`, `vehiculo_id` y `objeto_id` opcionales, `x`, `y` | El perito marcó un punto en modo edición.  |

**`tipo` de `puntoMarcado`:** `punto_inicial`, `choque_intermedio` o `punto_paso`.

**`codigo` de `error`:** `version_puente`, `caso_invalido`, `modelo_no_cargo`, `dispositivo_perdido`, `captura_fallo` o `interno`. Con `dispositivo_perdido`, o si la carga pasa del límite de `docs/adr/0111-visor-unity.md`, la web abre el visor ligero (three.js) con un aviso.

## Reglas

- **Unity nunca recalcula.** Manda la edición, la web actualiza la `EscenaSpec`, corre el solver y vuelve a mandar `cargarCaso`.
- **Unity solo reproduce** lo que trae el paquete: todo movimiento sale de `resultado`, y no usa la física de Unity para el choque.
- **Las coordenadas de los mensajes** son las de la escena: metros, X al este, Y al norte, con `rumbo_deg` antihorario desde +X.
