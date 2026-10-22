# Croquis para CESVI · plan de la versión real (v2)

> **v2, 2026-10-21.** René aclaró el objetivo y este plan reemplaza a la v1 del mismo día. La v1 ponía el veredicto sobre la declaración del conductor en el centro; eso pasa a ser un complemento opcional.
>
> Este plan manda sobre `PLAN.md` en lo que se contradigan. `PLAN.md` sigue valiendo para lo que ya está construido: solver, contrato, visor 3D, evaluaciones E1–E8 y niveles de calidad §7.8. `docs/cesvi/PROTOTIPO.md` queda como historial y el prototipo desplegado se conserva para la demo. Las reglas de trabajo siguen en `CLAUDE.md`.

## 1. Qué es Croquis

**El perito narra el hecho y Croquis lo reconstruye con física y lo muestra en 3D.**

1. **El perito describe el hecho con lenguaje técnico:** modalidad, vehículos, sentidos, maniobras, zonas de contacto, daños, restos, huellas y posiciones finales. Ubica el lugar en el mapa y corrige posiciones si hace falta.
2. **Croquis entiende la descripción.** La IA solo traduce el texto a la escena (contrato); nunca inventa números físicos.
3. **La física reconstruye:**
   - el solver calcula velocidades, trayectorias, el impacto o los impactos y las posiciones finales, con rangos;
   - usa como evidencia lo que el perito dio (punto de impacto, posiciones finales, restos, huellas y daños);
   - los métodos de CESVI (McHenry, EBS, desplazamiento, huellas, cantidad de movimiento) se muestran al lado como verificación.
4. **Croquis muestra la reconstrucción** en 3D y en el croquis 2D sobre el mapa, sincronizados en una línea de tiempo.
5. **Sale un reporte** con la reconstrucción, los cálculos y su trazabilidad.

**El papel de los dictámenes de CESVI:** demostrarles a los peritos que un hecho que ellos ya analizaron y probaron, Croquis lo reconstruye y llega a lo mismo. Se usan para:
- evaluar a Croquis contra sus conclusiones (§5, R4);
- la demo: el dictamen y la reconstrucción de Croquis, lado a lado.

**El complemento opcional** (R7): el perito puede cargar la declaración de un conductor y ver en 3D, lado a lado o superpuesta, esa versión contra la reconstrucción, con lo que cambia entre ambas. Croquis no declara culpables ni dice quién miente. Si se muestra una sugerencia, el perito la confirma o la descarta.

## 2. Lo que ya existe y se reutiliza

- **Solver y port a TS:**
  - impulso, CRASH3 con rigideces de NHTSA, post-impacto y Monte Carlo;
  - inversión con Levenberg–Marquardt;
  - determinismo y paridad;
  - medido contra registradores de choques reales (E3) y atropellos (E4).
- **Visor 3D:** WebGPU, niveles baja / media / alta / ultra, daño y cámaras. Estaba en pausa: **se reactiva.**
- **Extracción con Claude:** salida estructurada, fuentes por dato y preguntas de lo que falta, ya adaptada al lenguaje técnico del perito, con un glosario de 114 términos.
- **El recorrido de `/cesvi`:** 8 pasos, modo Presentar / Trabajar, mapa con el punto editable, posiciones del perito, deshacer, temas y dictamen en PDF.
- **Contrato 2.0.0:** expediente, N vehículos, M impactos y versiones.
- **C0 en curso:** el corpus estructurado de los 671 dictámenes. Se conserva tal cual y se amplía en R0.

## 3. Datos

- **Licencia:** los dictámenes de CESVI son de uso libre para este proyecto (René, 2026-10-21; muchos son casos elaborados por CESVI). Se registran en `data/SOURCES.md`.
- **Corpus estructurado (R0):** a lo que ya extrae C0 se le agrega, por dictamen:
  - **Descripción de los hechos sin conclusiones:** solo hechos, lugar, daños, evidencias y medidas, sin velocidades calculadas ni conclusiones. Es lo que se le da a Croquis como «narración del perito» en la evaluación. Debe pasar una revisión automática de fuga: no puede contener cifras de velocidad ni frases de conclusión.
  - **Lo que concluyó CESVI, para comparar:** modalidad, zonas de contacto por vehículo, secuencia de impactos, velocidades calculadas (si las hay) y posiciones finales (si se describen).
- **Partición:** la prueba congelada (30 %) de C0 se mantiene y no se usa para ajustar nada.

## 4. Principios que no cambian

- La IA traduce, la física decide, el visor muestra.
- Ningún número inventado.
- Cada resultado lleva su rango y su fuente; toda diferencia con un dictamen se muestra con su valor y su porcentaje.
- Reconstrucción de apoyo: el análisis y la firma son del perito.

## 5. Fases

Cada fase se cierra con su criterio en verde, merge y despliegue, y con su resumen en PROGRESS. Las evaluaciones son scripts en `eval/` que se corren al cerrar la fase y no bloquean CI. Pruebas según «Para quién y qué tan lejos» de CLAUDE.md.

### R0 · Corpus (continúa C0)
- Termina lo de C0: corpus validado, partición congelada, etiquetas revisadas en una muestra y mediciones en `eval/results/cesvi_corpus.json`.
- Agrega los dos campos del §3 (descripción sin conclusiones y lo que concluyó CESVI), con la revisión de fuga.
- **Listo cuando:** el corpus completo valida y cada dictamen de la prueba congelada tiene su descripción limpia y sus conclusiones estructuradas.

### R1 · De la narración del perito a la escena
- El paso «El hecho» genera la escena completa (contrato v2), no solo datos sueltos:
  - N vehículos con clase y masa;
  - M impactos con zonas de contacto;
  - objetos fijos (poste, muro, barda, árbol, guarnición);
  - maniobras, restos, huellas y posiciones finales.
- El perito corrige en el mapa: posición inicial, de impacto y final de cada vehículo, restos y huellas. Lo que marca tiene fuente `perito` y la física lo usa como evidencia.
- Preguntas solo de lo que más cambia la reconstrucción, con «No sé».
- **Listo cuando:** las descripciones de 10 dictámenes de desarrollo, de modalidades distintas, generan escenas válidas, y una e2e recorre narración → mapa → escena.

### R2 · Reconstrucción física desde la evidencia del perito
- La inversión usa las posiciones y medidas del perito (punto de impacto, posiciones finales, longitud de restos, huellas, profundidad de daño) para estimar velocidades y trayectorias con rangos.
- Choques contra objeto fijo.
- Modalidades frecuentes en el corpus: alcance, lateral, frontal, reversa, volcadura y salida del camino. Lo que el solver no cubra se declara en pantalla como límite, no se simula a medias.
- Módulo de verificación CESVI al lado del resultado físico: McHenry de 2, 4 y 6 medidas, EBS, desplazamiento, huellas y cantidad de movimiento, con la fórmula sustituida.
  - **Reproducción:** todo dictamen del corpus que imprime entradas y resultados se recalcula, y se reporta cuántos coinciden dentro de 0.5 %. Ningún ajuste para que cuadre.
- El solver Python es la referencia. Cada cambio lleva su port a TS y pruebas de paridad.
- **Listo cuando:** las escenas de R1 se reconstruyen con resultados y rangos, y la verificación CESVI está corrida sobre el corpus.

### R3 · 3D de la reconstrucción
- Se reactiva el visor 3D y se integra al recorrido (paso de las versiones y modo trabajo):
  - lo que calculó el solver;
  - daño en las zonas que describió el perito;
  - restos, huellas y objetos fijos;
  - cámaras libre, cenital y de conductor;
  - línea de tiempo sincronizada con el croquis 2D.
- Corrige la interpenetración: en el impacto los cuerpos no se atraviesan.
- Respeta los niveles de §7.8: la laptop es el piso, alta y ultra no se recortan.
- Pruebas: la e2e del recorrido abre el 3D en Chromium. Las capturas y los fps se miden a mano antes de una demo.
- **Listo cuando:** cualquier escena de R2 se ve en 3D y en 2D sincronizadas y sin interpenetración.

### R4 · Croquis reproduce los dictámenes (evaluación y demo)
- **Evaluación E-R4,** sobre la prueba congelada. A Croquis se le da solo la descripción sin conclusiones y se compara con lo que concluyó CESVI:
  - modalidad;
  - zonas de contacto por vehículo;
  - secuencia de impactos;
  - velocidades, cuando el dictamen las calcula (error absoluto y porcentaje);
  - posiciones finales, cuando se describen.
  - **Contra líneas base simples:** la modalidad más frecuente y una velocidad fija promedio. Se publica en `eval/results/` con lo que sale bien y lo que no.
- **Página «Reproducción de dictámenes»:** lista de casos con el dictamen y la reconstrucción de Croquis lado a lado (2D y 3D), con las diferencias en porcentaje. Para la demo: «esto lo analizaron ustedes, esto lo reconstruyó Croquis».
- **Listo cuando:** E-R4 está corrida y publicada, y la página tiene al menos los casos de la prueba congelada que Croquis puede reconstruir.

### R5 · Cargar un dictamen
- PDF, Markdown o texto. Croquis llena el expediente y la narración con la cita de cada dato, y el perito revisa y reconstruye.
- **Evaluación E-R5:** exactitud por campo en la prueba congelada; con PDF originales cuando René los consiga.
- **Listo cuando:** importar un dictamen del corpus lo deja listo para reconstruir.

### R6 · Carambolas
- Impactos en secuencia en el solver (Python y TS, con paridad), en el croquis (X1, X2…), en el 3D y en la línea de tiempo.
- **Listo cuando:** los dictámenes del corpus con 3 o más vehículos se reconstruyen y se ven en 3D, con una e2e de una carambola.

### R7 · Comparación con la declaración del conductor (opcional)
- El perito pega una o más declaraciones. Croquis arma esa versión y la muestra en 3D y 2D, lado a lado o superpuesta, contra la reconstrucción.
- Muestra «Qué cambia entre versiones»: posiciones, restos, zonas de contacto esperadas contra observadas, velocidades.
- Indicadores de correspondencia de daños (dirección, zona, altura) como información para el perito.
- Una sugerencia de si la versión se sostiene solo si el perito la activa; él la confirma o la descarta. Sin culpas.
- Reutiliza lo que ya hace el prototipo para el caso de AXA.
- **Listo cuando:** la e2e carga una declaración y la compara en 3D.

### R8 · Reporte
- PDF y Word con:
  - la narración del perito;
  - el croquis 2D y cuadros del 3D;
  - los resultados con rangos;
  - la verificación CESVI;
  - la comparación de R7, si se usó;
  - la trazabilidad (método, huella de entradas, quién validó y cuándo).
- Estructura de dictamen de CESVI cuando el perito lo pida.
- **Listo cuando:** la e2e exporta el PDF y el Word de una reconstrucción.

### R9 · Diseño, endurecimiento y lo que diga CESVI
- **Pase de diseño (pedido por René el 2026-10-21).** Todo lo nuevo de R0–R8 lleva el diseño del prototipo con el mismo nivel que el recorrido de 8 pasos:
  - maquetas de `docs/cesvi/rediseno/`;
  - modo Presentar / Trabajar;
  - tema claro y oscuro.
  - Pantallas que lo necesitan:
    - visor 3D en el recorrido;
    - lista de casos;
    - importar dictamen;
    - reproducción de dictámenes;
    - carambolas;
    - comparación;
    - reporte.
  - Pide a René una revisión visual antes de cerrarlo.
- Lo anotado en «Endurecimiento pendiente» y los cambios que pida CESVI.

### R10 · Calidad visual del 3D (al final, cuando todo lo demás funcione)
- **Meta (René, 2026-10-21):** que la reconstrucción se vea como un juego actual de autos o de mundo abierto (la referencia es GTA o Forza), al menos muy por encima de lo que hay hoy.
  - Lo realista es acercarse a ese nivel en una sola escena con buenos recursos, no igualar un juego de estudio grande.
  - Se hace en three.js con WebGPU, no en Unity (ADR que lo registre).
- **Qué incluye:**
  - **Vehículos:** modelos 3D realistas por clase (sedán, hatchback, SUV, pickup, camión, moto), con licencia libre registrada en `assets/ASSETS.md` y sin logotipos ni marcas (regla 5).
  - **Materiales físicos:** pintura metálica con capa transparente, vidrio, cromo, llantas y faros.
  - **Luz:** de ambiente con HDRI, sombras suaves y reflejos en pantalla.
  - **Postprocesado:** oclusión ambiental, bloom, tone mapping de cine, antialiasing temporal, profundidad de campo en las cámaras cinemáticas y desenfoque de movimiento en el impacto.
  - **Escenario:** asfalto y marcas viales con textura, banquetas, camellones, vegetación y postes según el lugar real del mapa.
  - **Marcas en el piso:** huellas de frenado, restos y vidrios como calcomanías y partículas.
  - **Daño:** deformación de la carrocería en la zona y con la profundidad que dio el perito (C1–C6 cuando las hay), más vidrios rotos y piezas desprendidas, sin contenido gráfico de personas.
  - **Cámaras cinemáticas** con trayectorias suaves para presentar.
- **Niveles §7.8:** ultra y alta usan todo; media y baja bajan efectos sin perder función. La laptop es el piso; alta y ultra se miden en la computadora de la demo.
- **Evaluación:** capturas de antes y después de las mismas escenas para que René las revise, y fps por nivel. Las capturas se aprueban a ojo de René; no son prueba de CI.
- **Listo cuando:** René aprueba las capturas y se cumplen los fps de §7.8.

### R11 · Video cinematográfico para demo y reporte (complemento)
- «Exportar a Blender» desde el visor: la escena reconstruida en glTF, con animación, cámaras y materiales, más un script de Python para Blender que arma la escena y renderiza el video (Cycles o EEVEE) con la leyenda de reconstrucción de apoyo.
- Se renderiza en la computadora de la demo, no en Vercel. El video puede adjuntarse al reporte.
- Los recursos son los mismos de R10.
- **Listo cuando:** un caso del corpus sale como video de calidad cinematográfica con un solo comando en la computadora de la demo, y René aprueba el resultado.

**Orden:** R0 → R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8 → R9 → R10 → R11.

## 6. Fuera de esta versión

La portada y la historia de lanzamiento (siguen en pausa), cuentas de usuario y nube para los casos, el chat de «Preguntar», el dictado por voz y la app móvil. Se anotan como pendientes, no se borran.

## 7. Bloqueado: necesita a René

- PDF originales de algunos dictámenes (R5).
- Tabla de rigideces A y B de CESVI, si la tienen (R2).
- PDF u hoja de cálculo del dictamen de AXA (diferencia de energía).
- Computadora de demo con GPU para medir alta y ultra (R3).
- Comentarios de CESVI tras la demo (R9).
