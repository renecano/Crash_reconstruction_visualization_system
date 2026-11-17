# Ronda 2 · lo que hizo Fable

René eligió el 2026-11-16, de tres propuestas por pantalla (página privada de propuestas; las maquetas no van a git):

- **A1, «Caso nuevo»:** «El trazo».
- **A6, antes de «Reconstruir»:** «La incógnita», con la gráfica de puntos de las simulaciones de la propuesta «Sin antesala».

Ningún número cambia en ninguno de los bloques: cambia cómo se llega a ellos y cómo se muestran.

## A1 · «El trazo» (rama `feat/ronda2-a1-trazo`)

**Qué cambió en la pantalla**

- La primera pantalla de un caso nuevo ya no es la ficha del caso con un mapa vacío. Es un titular («Narra el hecho. Croquis lo reconstruye.»), una sola línea que se dibuja y pasa por cinco viñetas (narras, colocas, se reconstruye, comparas, firmas), con quién actúa en cada una («Tú» o «Croquis»), y un solo botón principal: «Escribir la narración del hecho».
- La línea es la misma de la barra de arriba: al empezar se recoge hacia ella.
- «Usar un ejemplo» y «Abrir un caso guardado (.croquis)» quedan al lado, como acciones secundarias.
- Las viñetas no llevan cifras. La maqueta mostraba «16 km/h»; un número fijo en esa pantalla no saldría del cálculo, así que la viñeta de «Comparas» dibuja el rango y la marca del reporte sin dígitos.
- En ventana chica (900×620) todo cabe sin desplazarse; en teléfono las cinco estaciones van en lista y el botón queda siempre a la vista.
- Sin movimiento con `prefers-reduced-motion` o con «Transiciones» apagado.
- El aviso «El lugar aún no está marcado · Lo marcas en el paso 3» desapareció: en el primer paso, sin nada colocado, no hay mapa.
- Los demás casos (AXA, un reporte importado, uno guardado) conservan su ficha del caso.

**Un solo mapa por caso**

- Antes había dos mapas de MapLibre por caso (el del caso y el de «La escena») y cada uno compilaba sus programas de WebGL la primera vez que se dibujaba.
- Ahora hay una sola instancia (`apps/web/src/lib/mapa-compartido.ts`) que se le presta a quien la muestra. Al cambiar de dueño solo cambia de estilo. Si alguien la pide mientras otro la tiene, recibe un mapa propio, como antes.
- El mapa del caso se monta cuando ya hay algo que ver en él: en un caso nuevo, no existe hasta «La escena».
- **Medido** en la laptop de René (8 GB, Intel UHD, sin GPU dedicada), con `apps/web/e2e/medir-pasos.spec.ts` (Chromium con ventana, sin abrir el 3D):

| Qué                                             | Antes (producción, `pasos_hilo_despues_produccion.json`) | Después (build local, `pasos_hilo_ronda2_a1.json`) |
| ----------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Tarea más larga al cambiar de paso              | 214 ms                                                   | 169 ms                                             |
| Tarea más larga de la visita                    | 288 ms                                                   | 218 ms                                             |
| AXA, de «El hecho» a «La escena» (segundo mapa) | 96 ms                                                    | 55 ms                                              |
| Caso nuevo, todos los cambios de paso           | 0 ms                                                     | 0 ms                                               |

- La tarea que queda (AXA, del paso 1 al 2) es la única compilación de MapLibre del caso: su perfil la ubica en `getProgram`. No baja de 100 ms; para eso habría que no dibujar el mapa en el hilo principal, que MapLibre no permite. Las dos mediciones no son en las mismas condiciones (producción contra build local), así que la diferencia de 214 a 169 ms es indicativa; lo firme es que el segundo mapa ya no compila.

**Evidencia:** `evidencia/a1/` (antes y después en claro y ventana chica; después también en oscuro y teléfono).

**Pruebas:** `trazo-inicio.test.tsx` (qué dice, quién actúa, un solo botón principal, sin cifras, con y sin animación), `mapa-compartido.test.ts` (se presta el mismo mapa, uno propio si está ocupado) y las e2e del flujo de caso nuevo y de la carambola en Chromium.
