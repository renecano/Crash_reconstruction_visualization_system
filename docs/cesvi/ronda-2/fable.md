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

## A6 · «La incógnita» y el visor (rama `feat/ronda2-a6-incognita`)

**Qué decidí sobre la pantalla antes de «Reconstruir», y por qué**

Se queda, convertida en el planteamiento del problema («La incógnita», la propuesta que eligió René). La razón: es el único momento en que el perito puede ver junto lo que va a entrar al cálculo antes de confiar en un número. Quitarla (la propuesta «Sin antesala») ahorraba un clic, pero el resultado llegaba sin que se viera de qué evidencia salió.

**Qué cambió en la pantalla antes de reconstruir**

- **A la izquierda**, en lugar del mapa lejano con los marcadores encimados: el croquis de lo que el perito colocó, encuadrado a esa evidencia. Cada vehículo donde quedó y cada choque llevan una etiqueta con su origen («lo marcaste», «narración» o «supuesto»). Por dónde llegó cada vehículo va punteado, con su «A · ? km/h»: lo que se va a calcular. Lleva escala, norte y, si ya llegaron, las calles del mapa en tenue.
- **A la derecha:** la pregunta («¿A qué velocidad venían?») con un signo del tamaño que tendrá la respuesta, el botón «Reconstruir» y, debajo, lo que el perito marcó y lo que quedó como supuesto (los mismos renglones de «¡La escena está lista!»). Ningún número aparece antes de calcular.
- Al reconstruir, el signo late mientras se calcula y la cifra aparece en ese mismo lugar.
- No calcula nada nuevo: dibuja lo que ya está en el expediente.

**La gráfica de puntos de las simulaciones** (la que René pidió de «Sin antesala»)

- Va a la vista bajo la cifra, en lugar del histograma de barras que estaba plegado. Cada punto es una simulación real del caso, en su km/h; el corchete bajo el eje es el rango (donde cae el 80 %) y el punto naranja, el mejor ajuste.
- Si una columna no cabe, cada punto vale varias simulaciones y la leyenda lo dice. Una columna con simulaciones nunca se queda sin punto.
- Los percentiles y la mediana siguen plegados («Los percentiles de las simulaciones»).
- Son los mismos datos de antes (`valores` del resultado): ninguna cifra cambia.

**El visor**

- **Dos pestañas: «3D» y «2D».** Antes eran cinco en una fila (Cenital, Detrás de A, Conductor A, Órbita 3D, Mapa).
- **2D:** el croquis cenital con etiquetas, trayectorias, siluetas, escala y norte. El interruptor «Mapa» pone el mapa real; no es otra pestaña.
- **Una sola barra de reproducción** (`BarraReproduccion`) para el 3D, el 2D y el 2D sobre el mapa: reproducir, línea de tiempo con el impacto marcado, ¼× ½× 1×, «Ir al impacto», «Ver todo» y «Repetir». El instante se conserva al cambiar de pestaña. Sobre el mapa, los vehículos se mueven por un canal sin volver a dibujar la página (`apps/web/src/lib/canal.ts`).
- En el 2D, «Ver todo» e «Ir al impacto» ya no se repiten arriba: arriba quedan acercar y alejar.
- **El selector «Cámara» del 3D** (`selector-camaras.tsx`): las cuatro generales a un clic («Alrededor», «Desde arriba», «Cinematográfica», «Desde la acera»); un botón por vehículo («B · Tacoma») que abre sus tres vistas («Detrás, siguiéndolo», «Lo que veía su conductor», «Su daño, en el impacto»): dos clics; las personas que van a pie, en bici o en moto, a un clic. Con teclado: Esc cierra el menú y regresa el foco.
- **«Detrás de C»:** la distancia y la altura de la cámara siguen al largo del vehículo. Un sedán de 4.5 m conserva 8 m atrás y 2.6 m arriba; detrás de una camioneta de 5.3 m queda a 9.42 m y 3.3 m. No pide build de Unity: son los parámetros que la web le manda a la cámara «cerca».
- El mapa del caso se acerca más a lo colocado (zoom máximo 20.5 en lugar de 19).

**Lo que no pude ver en pantalla**

- El 3D real de Unity: René pidió no cargar Unity en su laptop (se quedó sin memoria). El selector se probó con el Unity falso de las e2e y con pruebas unitarias; «Detrás de C» con la camioneta queda por verse en el ensayo en producción.

**Evidencia:** `evidencia/a6/` (antes y después de la pantalla antes de reconstruir, en claro, oscuro, ventana chica y AXA; el visor 2D, el 2D sobre el mapa y el selector del 3D).

**Pruebas:** `planteamiento.test.tsx`, `selector-camaras.test.tsx`, `camaras.test.ts`, `reconstruccion-lab.test.ts` (la nube) y las e2e de los flujos principales en Chromium, ajustadas a las pestañas nuevas.

**Pendiente (anotado en «Endurecimiento pendiente»):** las e2e manuales `promo-recorrido.spec.ts` y `auditoria-recorrido.spec.ts` todavía buscan las pestañas viejas (`vista-detras`, `vista-conductor`): hay que pasarlas al selector de cámaras antes de volver a correrlas.

## C · Las cinco narraciones de ejemplo (rama `feat/ronda2-c-narraciones`)

El detalle, los textos y los límites están en [`narraciones.md`](narraciones.md).

**Qué cambió en la pantalla**

- En la narración del caso nuevo, en lugar del botón «Usar una narración de ejemplo» hay una lista de cinco, cada una con una línea de lo que muestra. Está a la vista con el campo vacío o con un ejemplo sin cambios.
- En «El trazo», «Usar un ejemplo» lleva a esa lista.
- Un ejemplo leído sin cambios usa su lectura guardada (hecha con Claude con el prompt de la app) y la pantalla lo dice. Con un cambio en el texto, se lee con Claude.

**Las cinco, con lo que muestra cada una** (en producción, la escena colocada como dice cada narración; `eval/results/ronda2_ejemplos.json`; el build local dio lo mismo):

| Ejemplo                                         | Qué muestra                                                                 | Lo que da                    |
| ----------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------- |
| Crucero de noche en Iztapalapa                  | Lectura con citas y preguntas; de noche                                     | A · Jetta a 16 km/h (7–24)   |
| Alcance en carretera con la deformación medida  | Las medidas C1–C6 de los dos vehículos, su energía y su cambio de velocidad | A · NP300 a 62 km/h (53–62)  |
| Carambola de noche con lluvia                   | Tres vehículos, dos impactos en orden, pavimento mojado                     | A · Ranger a 34 km/h (30–41) |
| Reversa en una calle con tope                   | La reversa como supuesto con su fuente; un tope con las medidas de la norma | B · Versa a 21 km/h (20–26)  |
| Choque en un entronque y salida contra un poste | Punto de paso, terracería y un objeto fijo                                  | B · Sentra a 36 km/h (31–38) |

**Lo que cambié porque dejaba ver un límite** (los límites quedan escritos en `narraciones.md`, no escondidos):

- **El alcance** decía que los vehículos fueron retirados: sin posiciones finales, la deformación sola no fija la velocidad. Ahora la narración dice dónde quedó cada uno.
- **La carambola** se reescribió con la geometría que sí se reconstruye completa (A alcanza a B y B a C, detenidos en un semáforo).
- **El poste** era un solo vehículo contra un objeto fijo, que la reconstrucción no calcula. Ahora es un choque entre dos vehículos en el que uno sale a la terracería y pega contra el poste; la app sigue diciendo que ese golpe no lo calcula.
- **Dos hipótesis:** ningún ejemplo las da; solo AXA. La línea del alcance ya no las promete.

**Gasto de API:** siete lecturas, 0.1993 USD. W9 quedó en 1.6059 de 20 USD.

**Pruebas:** `ejemplos-narracion.test.ts` (son cinco, sin datos personales, ninguna cita fuera de su texto, cada una trae lo que promete), la e2e del flujo de caso nuevo (la lista y la lectura guardada) y `ejemplos-ronda2.spec.ts` (manual: recorre las cinco de punta a punta y anota lo que dice la pantalla).

**Evidencia:** `evidencia/c/`.

## Lo que falta de la parte 1

Los tres bloques están en producción (#256, #257 y #258). Los cinco ejemplos se recorrieron ahí de punta a punta sin el 3D de Unity.

- **Ver los ejemplos y el visor nuevo en el 3D real de Unity,** y el ensayo completo de la demo en producción con Unity. No se hizo en la laptop de René porque se quedó sin memoria con Unity; queda a su decisión correrlo ahí (con Edge cerrado) o en la RTX del colaborador.
- **La rama `perf/unity-armado-por-partes` (Opus)** toca `visor-unity.tsx`, igual que A6 (ahí se cambió el selector de cámaras y su import). Al retomarla hay que traerle `main` y resolver ese archivo.
