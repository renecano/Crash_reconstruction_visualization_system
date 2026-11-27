# Guion de la demo con CESVI (en vivo, unos 15 minutos)

Para la demo en vivo con los peritos de CESVI. El video grabado tiene su propio guion (`docs/cesvi/video/guion.md`, del 23 de octubre, sin el 3D).

- **Ensayado** el 2026-11-15 en producción con `apps/web/e2e/ensayo-demo.spec.ts` (`eval/results/ensayo_demo.json`, `docs/cesvi/demo/ensayo/`). Eso fue antes de la ronda 2: con las pantallas nuevas (A1 «El trazo», A6 «La incógnita», las pestañas «3D» y «2D», el selector de cámaras y los arreglos del Dictamen) falta repetir el ensayo con el Unity real. Los cinco ejemplos sí se recorrieron de punta a punta en producción el 2026-11-16, sin el 3D de Unity (`eval/results/ronda2_ejemplos.json`).
- **Actualizado** el 2026-11-17 con lo que cambió en la ronda 2 y el respaldo sin red (la demo local).
- **Cifras:** solo las que muestra la pantalla. Las de abajo son las del 2026-11-15; si la pantalla dice otra cosa, manda la pantalla.
- **Nada juzga al conductor:** el perito concluye. Croquis es una reconstrucción de apoyo.
- **Antes de empezar:** Chrome con caché (no incógnito), la laptop conectada a la corriente, y el 3D de AXA abierto una vez antes (así el build ya está en caché: la primera carga tarda unos 10 s; las siguientes, 3 a 4 s).
- **Actualizado** el 2026-11-18 con el acto «Versiones» (ronda 4, punto 8).
- **Los actos** (la barra de arriba): «El hecho», «La escena», «Reconstrucción», «Versiones», «Análisis», «Contra CESVI» y «Dictamen». En ventanas de menos de 1280 px de ancho, la barra muestra el nombre del acto actual y los demás con su número.

## 0 · Apertura (1 min)

> Pantalla: la portada; «Entrar a Croquis».

Croquis reconstruye un hecho de tránsito con física a partir de lo que narra el perito, lo muestra en 3D y arma el dictamen con la estructura de sus reportes. La IA solo ordena lo narrado; los números salen de la física.

## 1 · AXA A2010930: un caso que CESVI ya analizó (5 min)

> Lista de casos → AXA. «El hecho» y «La escena» de corrido (AXA abre con su escena colocada); en «Reconstrucción», la pantalla plantea la incógnita antes de calcular; «Reconstruir» (unos 9 s).

- **La incógnita (A6):** a la izquierda, el croquis de lo que se colocó, con el origen de cada cosa («lo marcaste», «narración» o «supuesto») y por dónde llegó cada vehículo, punteado, con su «? km/h». A la derecha, la pregunta («¿A qué velocidad venían?»), «Reconstruir» y lo marcado contra lo supuesto. Antes de calcular no aparece ningún número; la cifra sale en el lugar del signo.

- **La cifra:** V2 a 57 km/h, con su rango de 55 a 78. Es el mejor ajuste de la física, no un promedio. Debajo, a la vista, la nube de puntos: cada punto es una simulación del caso, el corchete bajo el eje es el rango (donde cae el 80 %) y el punto naranja, el mejor ajuste. Los percentiles siguen plegados.
- **Dos hipótesis:** el reposo que el reporte no da (supuesto) y la deformación medida no caben juntos. Se ve «La más cercana al daño medido»; la otra, «Cuadra con el reposo supuesto» (34 km/h), va marcada como supuesto. El perito elige.
- **Lo que explica el daño:** queda en el borde bajo de la energía que da la deformación medida. Croquis lo dice; no lo esconde.

> Pestaña «3D» → Unity → «Ir al impacto» (unos 14 s con la carga). La pestaña «2D» es el croquis del perito (ronda 4): girado con la vía horizontal, cada vehículo en A1 (antes), A2 (impacto) y A3 (reposo), el punto de impacto, el norte y la escala. «Mapa» o «Foto» lo ponen sobre el lugar real; «Color por velocidad» colorea los recorridos. Es el mismo croquis del dictamen.

- **El 3D reproduce el resultado:** no calcula nada. Después del impacto, la carrocería se deforma con el perfil de daño del solver.
- **Una sola barra de reproducción** para 3D y 2D: pausar, ¼× ½× 1×, «Ir al impacto», «Ver todo», «Repetir». Al cambiar de pestaña se conserva el instante.
- **Cámara** (el selector arriba a la izquierda del 3D): las cuatro generales a un clic («Alrededor», «Desde arriba», «Cinematográfica», «Desde la acera»); un botón por vehículo («B · Tacoma») abre sus tres vistas («Detrás, siguiéndolo», «Lo que veía su conductor», «Su daño, en el impacto»), a dos clics; las personas a pie, en bici o en moto, a un clic. «Detrás, siguiéndolo» se aleja más en las camionetas grandes. Esc cierra el menú.
- **Leyenda:** reconstrucción ilustrativa; el entorno es procedural, no el lugar real.
- **«Descargar video»** (arriba a la derecha, junto a «Ocultar minimapa»): graba la reproducción completa con la cámara elegida, en MP4 de 1920×1080, con la leyenda y el logo, y dice cuánto falta. Mientras graba, la escena se tapa con un panel; «Cancelar» o Esc lo paran. En la demo conviene hacerlo con una cámara ya elegida y no esperar a que termine: con unos segundos basta para mostrarlo. Funciona en Chrome y Edge.
- **La nota bajo el 3D** dice de qué vehículo y qué velocidad es, con el nombre del panel: «B · Tacoma (V2) antes del impacto: Croquis 57 km/h (55–78) · CESVI 63.15 km/h de barrera equivalente por la deformación (EBS)» y «A · Silverado 2500 (V1) al salir del impacto: Croquis 31 km/h · CESVI 60.27 km/h por los restos». Presentar y el dictamen lo nombran igual.

> «Comparar con una versión» (bajo la cifra, en Reconstrucción) → acto «Versiones».

- **Qué es:** lo que declaró cada conductor y las hipótesis «¿y si…?» del perito, simuladas con la misma física y dibujadas sobre la reconstrucción. Croquis no dice quién tiene razón ni juzga a ningún conductor.
- **La declaración de AXA ya viene escrita:** «Agregar lo que declaró un conductor» → «Leer y comparar». La lectura usa Claude (dentro del tope diario); en la demo local sin la llave, la pantalla lo dice y lo demás sigue.
- **La lista de versiones:** cada una con su tipo («Declaración del conductor» o «Hipótesis del perito»), su título y una línea de resumen («4 de 7 puntos comparables no coinciden con la evidencia»). La elegida va punteada sobre la reconstrucción en el 2D, con el nombre de cada vehículo.
- **Qué cambia:** tarjetas en el lenguaje del perito, primero lo que no coincide: «Declaró» contra «La evidencia» (velocidad, zona de contacto, dónde quedó). En una hipótesis: si se tocan, la velocidad de cada vehículo al contacto, dónde está al contacto y cuánto se separa su trayectoria, contra los mismos conductores sin ella.
- **«Probar una hipótesis «¿y si…?»»:** conductor, qué hace (frenar, volantear, seguir) y cuántos segundos antes del impacto. La simulación llega hasta el primer contacto y no calcula el choque ni el daño; lo dice.
- **En el 3D:** «La reconstrucción» / «Esta versión» alterna entre las dos con el mismo instante y la misma cámara. Un giro hecho a mano en la órbita vuelve a su ángulo al alternar (el build publicado recarga la escena); el fantasma superpuesto en Unity es el build siguiente.
- **Llegan a Presentar** (su capítulo, antes de «Contra CESVI») **y al dictamen** («Versiones del caso»), cada una marcada como declaración o como hipótesis.

> Acto «Contra CESVI».

- **El método de CESVI con los datos del reporte:** 63.90 km/h por deformación, contra los 63.15 de su reporte (+0.75 km/h, +1.19 %); por la separación de los restos, 60.27, igual que el reporte.
- **Toda diferencia va con su valor y su porcentaje.**

> Acto «Dictamen» (PDF y Word).

- **Tu conclusión:** se escribe aunque el 3D esté abierto (antes, con Unity cargado, el campo no dejaba escribir). Se puede citar el resultado y el cursor queda al final de la cita.
- **«Validar y firmar»** dice qué falta junto al botón («Escribe tu conclusión y tu nombre para firmar») y se activa en cuanto están los dos.
- **Abajo:** «Word» y «Descargar el caso» en una fila, «Guardar en este navegador» en otra.

## 2 · Un caso nuevo, en vivo (4 min)

> Lista → «Narrar un hecho nuevo». La primera pantalla es «El trazo» (A1) → «Escribir la narración del hecho» → un ejemplo de la lista (o una narración que dicte un perito) → «Leer la narración».

- **«El trazo»:** el titular «Narra el hecho. Croquis lo reconstruye.» y una línea que pasa por cinco estaciones (narras, colocas, se reconstruye, comparas, firmas), cada una con quién actúa («Tú» o «Croquis»). Un solo botón principal; al lado, «Usar un ejemplo» (lleva a la lista de los cinco) y «Abrir un caso guardado (.croquis)». No lleva cifras ni mapa: el mapa aparece hasta «La escena».

- **Un ejemplo sin cambios usa su lectura guardada** (hecha con Claude) y la pantalla lo dice: no espera ni gasta. Una narración dictada, o un ejemplo con un cambio, sí se lee con Claude (unos 13 s).

- **Cada dato con su cita:** lo que la narración no dice queda como supuesto, a la vista. Los datos personales se quitan antes de enviar el texto. «Lo que Croquis leyó» enseña los vehículos y los impactos en orden, con la letra de cada vehículo y su «supuesto».
- **Las preguntas no sacan del cuestionario:** «Lo coloco en el mapa» se anota y la colocación se hace en «La escena».
- **La escena llega armada** (ronda 4): Croquis la propone con lo que leyó. A la izquierda va la lista: cada cosa propuesta, lista o pendiente, con su «Por qué» (la calle y el sentido en que venía, y el daño en que se apoya). Lo propuesto se confirma o se corrige; lo que falta abre su pregunta en el mapa. Arriba están las herramientas con su tecla: girar (Q/E), «Alinear con la calle» (A), «Voltear 180°» (F), deshacer, acercar y medir (M). «Ver la reconstrucción» se activa en el panel al completar.
- **Reconstruir y ver en 3D** (unos 5 s; el 3D ya está en caché). Antes de reconstruir sale la misma incógnita que en AXA, ahora con lo que colocó el perito.

**Los cinco ejemplos** (`docs/cesvi/ronda-2/narraciones.md`; cifras del 2026-11-16 en producción, con la escena colocada como dice cada narración):

| Ejemplo                                         | Qué muestra                                                                 | Lo que da                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Crucero de noche en Iztapalapa                  | Lectura con citas y preguntas; de noche                                     | A · Jetta a <!--cifra:ejemplos.crucero-->20 km/h (5–26)<!--/cifra-->     |
| Alcance en carretera con la deformación medida  | Las medidas C1–C6 de los dos vehículos, su energía y su cambio de velocidad | A · NP300 a <!--cifra:ejemplos.alcance-->54 km/h (49–55)<!--/cifra-->    |
| Carambola de noche con lluvia                   | Tres vehículos, dos impactos en orden, pavimento mojado                     | A · Ranger a <!--cifra:ejemplos.carambola-->25 km/h (20–32)<!--/cifra--> |
| Reversa en una calle con tope                   | La reversa como supuesto con su fuente; un tope con las medidas de la norma | B · Versa a <!--cifra:ejemplos.reversa-->20 km/h (16–25)<!--/cifra-->    |
| Choque en un entronque y salida contra un poste | Punto de paso, terracería y un objeto fijo                                  | B · Sentra a <!--cifra:ejemplos.poste-->63 km/h (43–65)<!--/cifra-->     |

Para la demo: la carambola (los dos impactos en orden, de noche con lluvia en el 3D) o el alcance (la deformación medida). **Dos hipótesis** solo se ven en AXA: ninguno de los ejemplos las da. **El del poste no se usa en la demo** hasta el arreglo del rango del solver (su extremo bajo incluye muestras en las que el Sentra no llega al poste; ver «Endurecimiento pendiente» en `docs/PROGRESS.md`). Un ejemplo sin cambios no gasta API; los cinco aún no se han visto con el 3D real de Unity.

**Plan B:** si Claude no responde, la pantalla lo dice y conserva la narración; se sigue con el caso de AXA o se llena la escena a mano.

## 3 · Importar un reporte (2 min)

> Lista → «Cargar un reporte de CESVI» → el archivo del reporte → «Leer» (Claude, unos 22 s).

Croquis lee el reporte completo de CESVI y arma el expediente con la cita de cada dato. Se revisa contra el texto: lo que no está en el reporte no entra.

**Plan B:** si tarda, mientras tanto se muestra la reproducción de reportes.

## 4 · Una carambola de sus reportes (2 min)

> Lista → «Ver los 205 reportes de la reproducción…» → el reporte `257e13` → colocar → reconstruir → 3D (unos 17 s).

- **Los impactos en orden,** en 3D.
- **Sin las posiciones del perito,** la evidencia no fija ninguna velocidad, y la pantalla lo dice así. En la prueba con 33 carambolas, todas se reconstruyen y se ven en 3D; ocurren <!--cifra:carambolas.prueba-->22 de 31<!--/cifra--> impactos posteriores.

## 5 · Cierre (1 min)

- **Lo que no hace:** no asigna culpa, no estima lesiones, no sustituye al perito.
- **Límites que conviene decir:** el rango contuvo la velocidad verdadera 410 de 578 veces (70.9 %) en casos fabricados, y lo esperado es cerca de 80 %; la rigidez por clase viene de pruebas de vehículos de Estados Unidos.
- **Lo que les pedimos:** sus comentarios y qué más necesitan.

## Antes y durante la demo

- **Tope de Claude:** 10 USD diarios (`/api/version`). La secuencia de arriba cuesta unos 0.20 USD; con el ensayo del mismo día, sobra.
- **Sin red, o si Vercel falla: la demo local** (`LEEME-DEMO-LOCAL.md`). El día anterior, con internet, doble clic en `CORRER-DEMO-LOCAL.bat` (Windows) o `CORRER-DEMO-LOCAL.command` (Mac con Apple Silicon); el día de la demo, otra vez, y se abre `http://localhost:3000/cesvi`. El 3D y los modelos salen de la computadora.
  - Sin internet funcionan completos AXA, los cinco ejemplos (con su lectura guardada), la reconstrucción, el 3D de Unity y el dictamen.
  - Necesitan internet: la lectura con IA de una narración nueva o de un reporte importado, los mosaicos del mapa (sin red sale en blanco, pero se coloca la escena) y buscar un lugar por nombre.
  - Probada en la laptop de René con la red cortada en el navegador; en Mac, solo en una Mac de CI.
- **«Buscar el lugar»** (ronda 4): busca dentro del municipio y el estado del caso, o en los que se escriban, y da varias opciones con su municipio y estado para elegir. Ya no salta a la primera.
- **Peatones y ciclistas** (ronda 4): en La escena, «Cambiar algo» → «Peatón» o «Ciclista», y se toca el mapa donde lo golpearon. Se mueve, se gira (anillo o Q/E), se quita y se deshace como un vehículo. «Marcar dónde quedó» dibuja la distancia de proyección en metros, que entra al cálculo del atropello. Si la lectura dice que el impacto fue contra un peatón, La escena pide colocarlo.
- **Detalle que se nota en pantalla:** en el 3D, la barra de reproducción tapa una esquina del minimapa. La leyenda ilustrativa del 3D ya lleva su recuadro y se lee sobre cualquier fondo (WCAG AA).
