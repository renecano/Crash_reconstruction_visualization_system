# ADR 0121 · El marco del 3D y el 2D, y corregir la escena después

- **Fecha:** 2026-11-17
- **Estado:** aceptada
- **Pedido:** René, 2026-11-17. Dos correcciones:
  1. En Reconstrucción, todos los controles iban encima del 3D y lo tapaban.
  2. En La escena, corregir algo ya colocado no era interactivo.

  Ningún número cambia.

## Decisión

### 1. El marco de las vistas 3D y 2D

- **`MarcoVista`** (`apps/web/src/components/visor-unity/marco-vista.tsx`) envuelve la sección del escenario. En Reconstrucción, con resultado, pone dos barras fuera del lienzo:
  - **arriba:** la vista (3D o 2D, el interruptor del mapa) y las cámaras; a la derecha, «Editar en 3D», «Descargar paquete 3D», el minimapa y la pantalla completa;
  - **abajo:** la reproducción y la nota de la velocidad del 2D.
- **Los controles no cambian de componente.** Cada uno se dibuja en su ranura con un portal (`EnRanura`). Sin marco (Presentar, el dictamen, `/visor`) quedan donde estaban.
- **Las notas** («Supuestos y notas del cálculo») van debajo del marco, en un desplegable cerrado al abrir, con el mismo contenido.
- **Pantalla completa** (botón o F; Esc sale) con la API del navegador:
  - las barras van sobre la escena y se esconden a los 3 s sin mover el mouse;
  - se quedan visibles si el foco de teclado está en un control;
  - Espacio reproduce o pausa.
- **El minimapa se oculta** con el mensaje `depurar` (`minimapa`) que el build publicado de Unity ya entiende: no hace falta un build nuevo ni cambiar el contrato del puente (`PuenteUnity.minimapa`).
- **La leyenda ilustrativa** que dibuja Unity sigue en el lienzo: es obligatoria (PLAN §10) y no hay forma de moverla sin un build nuevo.

### 2. Corregir la escena después

- **Seleccionar** se hace en el mapa del modo guiado (`mapa-facil.tsx`), que es el mapa que se usa en La escena:
  - se toca un coche, un objeto, una zona del terreno o una marca;
  - queda resaltado, con su nombre;
  - tocar en vacío o Esc quita la selección.
- **Mover:** se arrastra, o con las flechas (0.5 m; con Shift, 2 m).
- **Girar:** con su anillo (imán de 15°; Shift lo suelta), o con Q y E.
- **Quitar:** con «Quitar» o Supr. Un coche no sale del caso: pierde su reposo y la escena vuelve a preguntar dónde quedó.
- **Deshacer y rehacer:** Ctrl+Z, y Ctrl+Shift+Z o Ctrl+Y, cualquier número de veces; el tope sube de 30 a 200.
- **Teclado y lectores de pantalla:** cada marcador es un botón con nombre; «En la escena» los lista para elegirlos sin el mapa.
- **La lógica** está en `apps/web/src/lib/seleccion-escena.ts`, con sus pruebas.
- **La reconstrucción ya no se recalcula sola** tras un cambio de la escena. Avisa «La escena cambió después de reconstruir…» y ofrece «Reconstruir de nuevo». Mientras tanto se queda el resultado anterior, y no se pierde nada más. Las ediciones del 3D y las respuestas a las preguntas siguen recalculando solas.

## Consecuencias

- Tres e2e que esperaban el recálculo automático tocan ahora «Reconstruir de nuevo» (`reconstruirSiCambio` en `e2e/ayuda-recorrido.ts`).
- **Lo que queda pendiente:**
  - No hay personas que seleccionar: el modo guiado no coloca peatones.
  - El 2D de Reconstrucción (la maqueta) reproduce el resultado y no se edita.
