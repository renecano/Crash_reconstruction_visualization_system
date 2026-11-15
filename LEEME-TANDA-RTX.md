# Croquis: lo pesado de una tanda, en la computadora con la RTX

Las pruebas y mediciones pesadas de Croquis no corren en la laptop de René. Esta computadora las corre con un doble clic y sube los resultados a GitHub.

**Es una sola corrida.** Primero comprueba que todo sirve (unos 2 minutos) y, si pasa, sigue sola con lo pesado. La tanda de hoy (Tanda 3) tarda **cerca de 1 hora en total**; la ventana dice el tiempo estimado al empezar.

## Los 3 pasos

1. **Trae lo último.** En la carpeta del repositorio de Croquis: `git pull` (o el botón de actualizar de tu programa de Git).
2. **Doble clic en `CORRER-TANDA-EN-RTX.bat`.** Se abre una ventana negra que dice qué paso va y cuánto lleva. No pregunta nada. No la cierres.
3. **Cuando diga «Avísale a René que ya terminó», avísale.** Los resultados ya están en GitHub, en una rama `resultados/<tanda>-<fecha>` (nunca en `main`). Presiona una tecla para cerrar la ventana.

## Qué hace sola y qué te toca a ti

| Sola                                                                                                              | Tú                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instala **Git** y **Node.js LTS** si faltan, con winget (el instalador de Windows). Avisa antes qué va a instalar | Si aparece la ventana de permiso de Windows («¿Quieres permitir que esta aplicación haga cambios en el dispositivo?»), dale **«Sí»**                |
| Instala **pnpm** en la versión que fija el repositorio (con corepack; si ese Node ya no trae corepack, con npm)   | Nada                                                                                                                                                |
| Refresca el PATH en la misma ventana: no hay que cerrarla ni volver a abrirla                                     | Nada                                                                                                                                                |
| Instala las dependencias del repositorio (`pnpm install`)                                                         | Tener internet y la computadora conectada a la corriente                                                                                            |
| Se cambia a la rama de la tanda si todavía no está en `main`, y al terminar vuelve a la que estaba                | No tener cambios sin guardar en la carpeta. Si los hay, lo dice y se detiene                                                                        |
| Sube los resultados con el inicio de sesión normal de GitHub                                                      | Si Git abre el navegador, **inicia sesión en GitHub** con tu cuenta (la que René invitó al repositorio). Nunca pide ni guarda tokens ni contraseñas |

**Lo que no puede hacer sola:**

- **Si la computadora no tiene winget** (pasa en Windows muy viejos) o una instalación falla: lo dice, da el enlace de descarga de lo que falta y se detiene. Instálalo a mano y vuelve a hacer doble clic.
- **Si la carpeta se descargó como .zip** en vez de clonarse con Git: lo dice y se detiene. Hay que clonarla: `git clone https://github.com/renecano/Crash_reconstruction_visualization_system.git`.
- **Si tu cuenta de GitHub no tiene permiso de escritura** en el repositorio: la comprobación falla en la subida y lo dice. Pídele a René que te invite.

## Si algo falla

- **Si la comprobación falla,** se detiene ahí y lo dice en rojo, con el paso que falló: lo pesado no corre. Tómale una foto a la ventana y mándasela a René.
- **Si falla un paso pesado,** lo dice y sigue con el siguiente. Su salida queda en la misma rama para que René la vea.
- **Si se cerró a la mitad,** vuelve a hacer doble clic: lo que ya terminó ya está en GitHub.
- **Mientras corre,** no uses la computadora para otra cosa pesada.

## Para René

- La tanda que corre con doble clic es `vigente` en `tools/colaborador/tandas.json`; ahí va la comprobación, la lista de pasos de cada tanda y, si la tanda todavía no está en `main`, su rama.
- `CORRER-TANDA-EN-RTX.bat -Lista` dice qué hay; `-Prueba` corre solo la comprobación; `-Tanda t1` corre otra; `-SinSubir` no sube nada; `-SimularFalta pnpm` prueba la instalación sin desinstalar nada.
- Probado en la laptop (2026-11-15) simulando que falta pnpm: lo instaló con corepack en una carpeta aparte, pasó la comprobación y no tocó el pnpm que ya estaba. La instalación de Git y de Node con winget no se probó de verdad (aquí ya están): la simulación solo muestra lo que haría. El Node LTS que instala winget hoy es el 26, que ya no trae corepack: en una computadora sin Node, pnpm se instala con npm.
