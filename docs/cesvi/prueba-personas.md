# Prueba con personas (T4 del plan v3)

**Qué mide:** si una persona ajena al proyecto llega sola, con una narración impresa, desde «Caso nuevo» hasta descargar el dictamen. Se anota el tiempo por paso, dónde pregunta, dónde se equivoca y qué dice al final. Con tres personas se sacan los tres problemas más frecuentes y Claude Code los corrige antes del cierre con CESVI (T7).

**Quién la corre:** René (o alguien que él designe) como facilitador. Este documento, la hoja de registro de abajo y `node eval/prueba_personas.mjs` son todo lo necesario.

**Quiénes:** tres personas ajenas al proyecto (compañeros, el colaborador, un profesor). Si CESVI presta un perito, mejor, pero no se espera a eso. Cada persona hace **los dos casos** de abajo, en el orden en que se le asignan (ver «Orden de los casos»).

## Antes de empezar

1. **Computadora y red:** una computadora con Chrome o Edge actualizado y conexión a internet. Abrir https://croquis-sage.vercel.app/cesvi en una ventana normal (no de incógnito). La lectura de la narración usa Claude en el servidor.
2. **Impreso:** esta página con las dos narraciones (sección «Las narraciones») y una hoja de registro por persona y por caso (sección «Hoja de registro»).
3. **Cronómetro** (el del celular basta) y lápiz.
4. **No ensayar con la persona.** Solo se le lee la consigna de abajo. No se le explica la interfaz.
5. **Ventana limpia:** si quedó un caso de otra persona, en el primer paso usar «← Casos» y empezar de nuevo desde «Caso nuevo». Los casos guardados «en este equipo» de personas anteriores no estorban, pero conviene no abrirlos.

## Orden de los casos

Para que el orden no favorezca a un caso, se alterna:

| Persona | Primer caso | Segundo caso |
| ------- | ----------- | ------------ |
| P01     | Alcance (A) | Lateral (B)  |
| P02     | Lateral (B) | Alcance (A)  |
| P03     | Alcance (A) | Lateral (B)  |

## Con cada persona (unos 40 minutos)

1. **Presentación (2 min).** Decirle, con estas palabras:

   > «Croquis es una herramienta para peritos de tránsito. Tú vas a hacer de perito. Te voy a dar la narración de un hecho ya escrita, como la escribiría un perito. Tu tarea es meterla en Croquis y llegar hasta descargar el dictamen en PDF. No te voy a ayudar; si algo no entiendes, dilo en voz alta y sigue como puedas. No hay respuestas buenas ni malas: lo que estamos probando es la herramienta, no a ti.»

2. **Entregar la narración impresa del primer caso** y abrir https://croquis-sage.vercel.app/cesvi. Desde aquí corre el cronómetro.
3. **Observar y anotar** en la hoja de registro, paso por paso (los pasos son los ocho de la barra de arriba: Caso, Hecho, Lugar, Reconstrucción, Daños, Números, Reporte y Dictamen; en un caso nuevo el paso «Reporte» no aparece, así que son siete pantallas):
   - la hora en que **entra** a cada paso (de ahí sale el tiempo por paso);
   - cada vez que **pregunta** algo o dice que no entiende (qué dijo, en qué paso);
   - cada **error** (hizo algo distinto de lo que la narración pedía, o tuvo que deshacer);
   - si **se atora** más de 2 minutos sin avanzar: se anota «se atoró en…», se le da **una** pista (la de la sección «Pistas permitidas») y se sigue. Se anota que hubo pista.
4. **Al terminar** (descargó el PDF, o pasaron 25 minutos): se detiene el cronómetro y se le preguntan las tres cosas de «Al final» antes del segundo caso.
5. **Segundo caso:** igual, con la otra narración y otra hoja. En el primer paso, «← Casos» y «Caso nuevo».
6. **Cierre (2 min).** Agradecer. Si descargó PDFs, se pueden borrar de la computadora: no hacen falta.

### Lo que verá la persona (para reconocer dónde está)

Nombres exactos de los botones, para anotar sin ambigüedad:

1. **Casos:** la lista con «Caso nuevo», «Cargar un reporte» y los casos de ejemplo. La persona debe elegir **«Caso nuevo»**.
2. **El caso (paso 1):** pantalla de entrada. Botón «Siguiente: el hecho →».
3. **El hecho (paso 2):** el cuadro «Narración técnica del perito». Aquí **teclea o dicta la narración impresa** y pulsa **«Leer la narración»**. Después aparecen la escena leída (vehículos, impacto) y las **preguntas** de lo que falta, cada una con su control, un botón «Usar» y un botón «No sé». Hay un botón «Usar una narración de ejemplo»: si lo usa en vez de teclear, se anota como error (la tarea es meter la narración impresa).
4. **El lugar (paso 3):** el mapa, con la lista «Lo que falta»: el punto de impacto y dónde quedó cada vehículo. Herramientas «Colocar», «Mover mapa» y «Medir»; «⤢ Expandir». Hay que **navegar a mano** hasta el lugar (hoy no hay buscador; eso se mide: cuánto tarda en llegar al lugar o si se da por vencido y coloca el caso en otro lado, lo cual **no es error**: se anota «colocó en otro lugar»). Cada elemento se coloca con un clic en el mapa y se cierra con «Listo».
5. **La reconstrucción (paso 4):** botón **«Reconstruir»**; luego las velocidades con su rango y la bitácora de los agentes. Botón **«Ver en 3D»** (o el que diga el panel) para el visor. El 3D tarda unos segundos en una laptop.
6. **Los daños (paso 5):** el perfil de aplastamiento calculado por vehículo. Solo se mira.
7. **Los números (paso 6):** los cálculos del método de CESVI, la verificación de lo que falta y «Probar una hipótesis sobre un conductor». Solo se mira (la hipótesis es opcional; si la prueba, se anota).
8. **El dictamen (paso 7 en un caso nuevo):** escribir un nombre, **«Validar»** y **«Descargar el PDF»**. Aquí termina la tarea.

La barra de arriba tiene «Presentar / Trabajar» y el tema claro u oscuro. En «Presentar» se esconden las herramientas de edición: si la persona lo activa y «se le pierden» los controles, se anota.

### Pistas permitidas (una por atoro, solo tras 2 minutos)

- En el hecho: «Pega la narración en el cuadro y pulsa “Leer la narración”».
- En las preguntas: «Si no lo dice la narración, pulsa “No sé”».
- En el lugar: «Acércate con la rueda del mouse hasta ver las calles; con “Colocar” activo, haz clic donde fue el impacto».
- En el lugar, si no encuentra el sitio: «Colócalo en cualquier calle parecida; anoto que no se encontró el lugar».
- En la reconstrucción: «Pulsa “Reconstruir” y espera».
- En el dictamen: «Escribe tu nombre, pulsa “Validar” y luego “Descargar el PDF”».

## Las narraciones (imprimir)

Las dos están escritas en lenguaje técnico de perito, como las de los reportes de CESVI. La persona las teclea (o las dicta) tal cual. **Ningún dato es de una persona real.**

### Caso A · Alcance en carretera (datos del reporte A2010930 de CESVI, sin datos personales)

> Hecho de tránsito en la modalidad de alcance en el arroyo que corre de sur a norte de la carretera México-Nogales, a la altura del km 47+800, tramo Los Mochis–Navojoa. Los dos vehículos avanzaban hacia Navojoa; el vehículo B (Toyota Tacoma) iba detrás del vehículo A (Chevrolet Silverado 2500). El vehículo A tiene la zona de contacto en la parte posterior, acentuada hacia el lado izquierdo, con el hundimiento concentrado en el vértice posterior izquierdo y la fuerza de atrás hacia adelante; la batea quedó desplazada de izquierda a derecha. El vehículo B tiene la zona de contacto en la parte frontal, acentuada hacia el lado derecho, deformada por cuerpo duro de adelante hacia atrás. Los restos de ambos vehículos quedaron sobre el extremo izquierdo, repartidos a lo largo de 15.89 m. El arroyo tiene carpeta asfáltica en buen estado, 6.47 m de ancho y líneas discontinuas, separado del arroyo contrario por terracería.

**Lugar en el mapa:** la carretera federal 15 (México-Nogales) entre Los Mochis y Navojoa, Sinaloa. Cualquier tramo recto de esa carretera sirve; se anota si lo encuentra.

**Lo que la narración no dice** (para que Croquis pregunte y la persona responda «No sé» o un valor): el carril, las masas y la posición final exacta de cada vehículo. La persona coloca las posiciones finales donde le parezca razonable: el B detrás del A, los dos en el arroyo.

### Caso B · Choque lateral en cruce urbano (caso ficticio, Toluca centro)

> Hecho de tránsito en la modalidad de choque lateral en el cruce de la calle Benito Juárez con la calle Hidalgo, en el centro de Toluca, Estado de México, de día, con el pavimento seco. El vehículo A (Nissan March, hatchback) circulaba por Benito Juárez con dirección al oriente, con el semáforo en verde a su favor según el conductor. El vehículo B (pickup) circulaba por Hidalgo con dirección al norte. El vehículo A tiene la zona de contacto en la parte frontal, distribuida en todo el frente, con la fuerza de adelante hacia atrás. El vehículo B tiene la zona de contacto en el costado izquierdo, a la altura de las dos puertas, con la fuerza de izquierda a derecha. Después del contacto, ambos vehículos giraron; el vehículo B quedó atravesado en el cruce con el frente hacia el noreste, y el vehículo A quedó en el cruce con el frente hacia el sureste, a unos 6 m del punto de impacto. Quedaron fragmentos de vidrio y plástico repartidos en el cruce. La calle Benito Juárez tiene dos carriles por sentido y la calle Hidalgo uno por sentido.

**Lugar en el mapa:** el cruce de Benito Juárez con Hidalgo, centro de Toluca (cerca de los Portales). Se anota si lo encuentra.

**Lo que la narración no dice:** las masas, las velocidades y la distancia a la que quedó el B. La persona responde «No sé» o coloca las posiciones como las entiende.

## Hoja de registro (una por persona y por caso)

Imprimir o copiar a mano. El código es `P01`, `P02`, `P03`; nunca el nombre.

```
Persona: P__     Caso: A (alcance) / B (lateral)     Orden: 1.º / 2.º     Fecha: ____-__-__
Computadora: laptop / escritorio     Navegador: Chrome / Edge / otro     ¿Perito?: sí / no

Paso              Hora de entrada   Preguntas (qué dijo)             Errores         Pista
1 Caso            __:__
2 Hecho           __:__
3 Lugar           __:__                                                ¿encontró el lugar? sí / no
  Colocar         del toque del impacto __:__:__ a «Siguiente» __:__:__  ¿sin ayuda? sí / no
4 Reconstrucción  __:__
5 Daños           __:__
6 Números         __:__
7 Dictamen        __:__
PDF descargado    __:__   (o «no llegó», con el paso donde se quedó)

Al final (preguntar y anotar textual):
1. ¿Qué fue lo más difícil?
2. ¿Hubo algo que no entendiste o que esperabas que hiciera otra cosa?
3. ¿Qué cambiarías primero?
Del 1 al 5, ¿qué tan seguro estás de que el dictamen dice lo que la narración decía? __
```

## Meta de la colocación (René, 2026-11-04, B)

**Colocar a los dos vehículos en menos de 1 minuto, sin ayuda.** Se cronometra desde que la persona toca el mapa para marcar el impacto hasta que «Siguiente» queda habilitado (los tres pasos: impacto, por dónde venía cada uno y dónde quedó). Cuenta como ayuda cualquier pista de la lista de arriba. En la hoja va en la fila «Colocar»; en el JSON, `colocar_s` (segundos) y `colocar_sin_ayuda`. `eval/prueba_personas.mjs` da la mediana y cuántos lo hicieron en menos de 60 s sin ayuda.

## Qué sale y cómo se agrega

1. **Pasar cada hoja a un archivo** `data/prueba-personas/P01-A.json` (una por persona y caso) con la forma de `eval/prueba_personas/plantilla.json`: los tiempos por paso en segundos, las preguntas, los errores, las pistas y las respuestas finales. Sin nombres.
2. **Agregar:** `node eval/prueba_personas.mjs` lee `data/prueba-personas/*.json` y escribe `eval/results/prueba_personas.json`: mediana del tiempo total y por paso, cuántos llegaron al PDF, cuántos encontraron el lugar, y la lista de problemas ordenada por frecuencia (los tres primeros son los que corrige Claude Code).
3. **Qué cuenta como problema:** cada pregunta, error o pista se escribe con una **clave** corta y común entre personas (por ejemplo `lugar-no-encontrado`, `no-se-como-colocar`, `boton-leer-no-visto`, `pdf-no-encontrado`). La misma clave en dos personas es el mismo problema. Las claves las pone quien pasa las hojas; el script solo cuenta.
4. **Lo cualitativo** (lo que dijeron al final) va a `docs/PROGRESS.md`, en el cierre de T4, sin nombres.

## También aquí: la revisión visual de R9

Mientras la persona hace la tarea, René aprovecha la misma sesión para la revisión visual pendiente desde el 2026-10-23 (ADR 0073): las pantallas de `/cesvi` en **Presentar** y **Trabajar** y en los **dos temas**. Lo que vea raro va con captura a `docs/PROGRESS.md`.

## Límites que se reportan

- **La muestra es de tres personas**, de conveniencia; dice dónde se atoran, no cuánto tardaría un perito.
- **Los tiempos incluyen teclear la narración**, que depende de cada persona. Por eso se compara por paso y no solo el total.
- **Se mide en producción**, con la red y la laptop que haya ese día; el tiempo del 3D depende de la máquina.
