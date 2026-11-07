# Croquis para CESVI · plan de cierre (v3)

> **v3, 2026-10-30.** René pidió un análisis completo del proyecto y un plan para terminarlo al 100 %. Esta v3 reemplaza a la v2 (2026-10-21) y manda sobre `PLAN.md` y sobre `PROTOTIPO.md` en lo que se contradigan. Las reglas de trabajo siguen en `CLAUDE.md`. Lo que la v2 ya definió (§1 «Qué es Croquis», §3 «Datos», §4 «Principios») sigue valiendo y no se repite aquí.
>
> **La idea de esta versión:** ya no se agregan fases nuevas. Hay una lista cerrada de siete tramos (T1–T7), cada uno con su «listo cuando» medible, y una definición de terminado que René puede palomear. Cuando los siete estén en verde, Croquis para CESVI está terminado.

## 0. Dónde estamos (análisis del 2026-10-30)

### 0.1 Lo que ya está y funciona

| Área | Estado | Evidencia |
| --- | --- | --- |
| **Contrato** `escena.schema.json` 2.2.0 (expediente, N vehículos, M impactos, versiones, conductores, perfil de aplastamiento) | Hecho | Zod y Pydantic generados |
| **Solver** Python de referencia + port TS con paridad: impulso, CRASH3, post-impacto, Monte Carlo, inversión LM con multiarranque determinista, «lo medido pesa más que lo supuesto», orden en alcances, arrastre muestreado, contacto secundario sin traslape, carambolas, conductores como agentes | Hecho | E7 paridad, 16 escenas versionadas, ADR 0091 y 0088 |
| **Evaluación contra CESVI** (E-R4, prueba congelada de 205 reportes) | Hecho y publicado | modalidad 58.3 % contra 37.2 % de la línea base; carambolas 21 de 31 impactos posteriores ocurren |
| **Caso AXA** | Hecho | método de CESVI reproducido: restos 60.27 = 60.27; deformación 63.90 contra 63.15 (+1.19 %). Reconstrucción física: V2 71.56 km/h (68.02–92.81) contra 63.15 (+13.32 %); el rango cambió en T3.1 (ADR 0100), antes 56.19–100.49 |
| **`/cesvi`** (lista de casos, caso nuevo, 8 pasos, mapa con bandeja/anillo/fantasmas, preguntas con control, hipótesis, rangos, conductor, bitácora de agentes, dictamen PDF/Word, cargar reporte, reproducción de reportes, comparación con la declaración) | Hecho y en producción | https://croquis-sage.vercel.app/cesvi |
| **Visor 3D** WebGPU, 4 niveles, modelos CC-BY de 6 clases sin marcas, daño horneado, calles de OpenStreetMap, efectos de cine en alta/ultra | Hecho en lo que toca a vehículos; **el escenario no** (ver 0.2) | `docs/cesvi/r10/` |
| **Portada v3** (ES/EN, cifras calculadas al compilar, fondo con la propia reconstrucción) | Hecho y en producción | `docs/cesvi/portada-v3/` |
| **Video demo** | Entregado a CESVI | `demo/video/` |
| **Exportar a Blender + botón de la computadora de demo** | Hecho y probado en la laptop con `-Prueba` (1 min 35 s) | **Nunca se ha corrido en la computadora del colaborador** |
| **Arquitectura multiagente** (R12a conductores, R12b pizarra con 8 agentes) | Hecho, medido, en producción | ADR 0088 y 0093 |

PLAN-CESVI v2 (R0–R12b) está completo en el sentido de «cada fase cumplió su criterio». Que a René le parezca que «no ha quedado» es correcto por tres razones que la v2 no cubría bien: el escenario 3D, la verificación en hardware real y la prueba con personas. Son los tramos T1, T2 y T4.

### 0.2 Lo que falta o está flojo (de mayor a menor impacto para CESVI)

1. **El escenario 3D no está a la altura de los vehículos.** En las capturas de `docs/cesvi/r10/` (alta y ultra, cámara cinematográfica) se ve: un plano verde liso, la vía como franjas grises sin textura ni relieve, una barda como caja beige, ningún cielo ni horizonte, ningún edificio, banqueta ni árbol, luz plana sin reflejos del entorno, huellas de frenado como barras negras y la leyenda vieja con «semilla 101». R10 fiaba el entorno a los objetos de OpenStreetMap, y en México casi no están mapeados (AXA: 0; cruce de Toluca: 0). **La meta de R10 («como GTA o Forza») no se cumplió en el escenario** y nadie la midió contra esa meta. Es el tramo T1.
2. **Nada se ha verificado en hardware real.** Alta y ultra nunca se han medido en una computadora con tarjeta de video (en la laptop, alta se dibuja por software y tarda 30 s en cargar). El video de R11 en calidad completa no existe. El botón del colaborador lleva 6 días listo sin correrse. Tramo T2.
3. **Los números de AXA tienen dos lecturas y hay que presentarlas sin confusión.** El método de CESVI se reproduce casi exacto (+1.19 %); la reconstrucción física da +13.32 % con V2 a 71.56 km/h y rango 68.02–92.81 (`eval/results/axa_rango_estable.json`). Nota: cuando se escribió este plan el rango era 56–100 km/h y dependía del muestreo (p10 de 59 a 73 según la corrida); T3.1 lo resolvió y ya no se mueve entre 20 semillas (ADR 0100). Además el rumbo inicial de V2 queda pegado al límite de búsqueda (+20°), señal de que algo del arranque está mal orientado. La reversa no se reconstruye (0 de 9 en E-R4). Tramo T3.
4. **Ningún perito ni ninguna persona ajena ha usado Croquis.** La revisión visual de R9 que se le pidió a René el 2026-10-23 sigue pendiente; CESVI no ha dado comentarios; E9 nunca se hizo. El flujo nos parece claro a nosotros, no sabemos si a un perito. Tramo T4.
5. **El repositorio no cuenta la historia actual.** `README.md` es del 19 de octubre, anterior al giro a CESVI, y no menciona a CESVI; `docs/PROGRESS.md` pesa 358 KB y su «Estado actual» sigue diciendo «prototipo, Hito 1–3» del 20 de octubre; `PLAN-CESVI.md` quedó en v2 y R12 lo agregó Claude Code por su cuenta. Nadie retoma esto en 10 minutos, que es lo que exige `CLAUDE.md`. Tramo T5.
6. **Pendientes que un perito sí notaría** (todos anotados en «Endurecimiento pendiente»): buscar el lugar en el mapa en «Caso nuevo» (hoy se navega a mano); la versión declarada no se dibuja en el croquis 2D; los agentes no respetan el orden de impactos de la reconstrucción; en una carambola no se puede declarar a mano el orden de impactos; la moto es de campo y las ruedas no siempre caen en los ejes; las relecturas de R12b no están grabadas. Tramo T6.
7. **Lo que CESVI tiene que decidir:** cuentas y nube para los casos (hoy «Guardar en este equipo» y archivo), si quieren la estructura exacta de sus reportes en el dictamen, y qué más necesitan. Tramo T7.

Dos causas de fondo, para no repetirlas: Claude Code solo avanza cuando recibe un prompt (del 28 al 30 de octubre no hizo nada porque nadie le pidió nada), y las fases se cerraron contra su propio criterio y no contra la meta que René tenía en la cabeza. Esta v3 pone la meta de René como criterio.

## 1. Definición de terminado (René palomea)

Croquis para CESVI está al 100 % cuando se cumplen las siete:

- [ ] **T1** René aprueba las capturas del escenario 3D de las 4 escenas de referencia (autopista de día, cruce urbano, noche con lluvia, carambola) en alta en la computadora con tarjeta de video y en media en la laptop, con los fps de §7.8 cumplidos.
- [ ] **T2** Existen en el repo la medición E6 de alta y ultra en una computadora con tarjeta de video y el video de R11 de AXA y de la carambola en calidad completa, y René los aprobó.
- [ ] **T3** AXA se presenta con sus dos lecturas sin ambigüedad; el rango de la reconstrucción no depende del muestreo; la reversa se reconstruye; E-R4 v4 está publicada y la portada toma sus cifras.
- [ ] **T4** Tres personas ajenas al proyecto recorren un caso de principio a fin con el guion de prueba, se midió dónde se atoran y se corrigieron los tres problemas más frecuentes.
- [ ] **T5** `README.md` y `docs/ESTADO.md` describen Croquis para CESVI al nivel del repo de Helada; cualquiera lo prueba en vivo y en local siguiendo el README; CI completa en menos de 10 minutos.
- [ ] **T6** La lista cerrada de endurecimiento de §2.6 está hecha o explícitamente descartada por René.
- [ ] **T7** CESVI vio la demo, sus comentarios están en PROGRESS y lo que pidieron está hecho o planeado con fecha.

## 2. Los siete tramos

Orden de Claude Code: **T2a → T1 → T3 → T6 → T5 → T2b → T7.** T4 lo hace René en paralelo desde ahora (no depende del 3D). Cada tramo se cierra con su «listo cuando», merge, despliegue y «Resumen para René» en PROGRESS. Pruebas según «Para quién y qué tan lejos» de `CLAUDE.md`: unitarias de cálculos, una e2e por flujo en Chromium; capturas y fps se miden a mano al cerrar el tramo.

### T1 · Escenario 3D a nivel de juego actual (el tramo grande)

**Meta (René, 2026-10-21 y 2026-10-30):** que la escena completa, no solo los autos, se vea como un juego actual de autos o de mundo abierto. Lo realista es una escena creíble y cuidada, no igualar a un estudio grande. three.js con WebGPU; nada de Unity. Los recursos nuevos son CC0 o CC-BY (Poly Haven, ambientCG, Quaternius, Sketchfab), registrados en `assets/ASSETS.md`, sin marcas (regla 5). Todo lo que se ve lo calcula el sistema: nada de imágenes de fondo ni video.

**Las 4 escenas de referencia** (se miden siempre las mismas): AXA (autopista federal de día), `lateral_interseccion` (cruce urbano), `nocturno_lluvia` y la carambola de R11. Capturas con la cámara cinematográfica y la del daño, en alta y ultra (computadora de demo) y media (laptop), antes y después de cada subtramo, en `docs/cesvi/t1/`.

**T1.1 · Cielo, luz y aire.**
- Cielo procedural con sol según la hora y la fecha del hecho (y la latitud del lugar), más un HDRI CC0 para la luz de ambiente y los reflejos; horizonte nunca vacío.
- Tone mapping de cine (ACES o AgX) con exposición por escena; sombras suaves en cascada; GTAO ya existe, se calibra.
- Clima: niebla y lluvia con densidad física, no rayitas; de noche, luminarias cada tramo según la clase de vía, con cono de luz real, y faros que iluminan el asfalto.
- **Listo cuando:** las 4 escenas tienen cielo, horizonte y sombras creíbles en las capturas.

**T1.2 · Vía y suelo.**
- Asfalto PBR (albedo, normal, rugosidad) con desgaste y parches; marcas viales como calcomanías con desgaste; juntas y alcantarillas.
- Guarniciones con altura real, banquetas, acotamientos de grava en carretera, barreras metálicas por clase de vía (la autopista de AXA las lleva), camellones.
- Mojado cuando llueve: rugosidad y reflejos cambian, charcos en los bajos.
- Huellas de frenado, de arrastre y restos como calcomanías y partículas con sombra, a escala de lo que dio el perito (ya se calculan; ahora se ven bien).
- **Listo cuando:** en la cámara del daño el piso y la vía se ven como fotografía de un juego actual en las 4 escenas.

**T1.3 · Entorno más allá de la vía.**
- Donde OpenStreetMap trae edificios: extruidos con conjuntos de fachadas procedurales (ventanas, cornisas, colores por zona). Donde no trae nada (la mayoría de México): entorno procedural por tipo de vía y uso de suelo con semilla fija: en carretera, parcelas, cercas, vegetación y postes; en ciudad, lotes con edificios sencillos variados, árboles de banqueta, señales.
- Vegetación y postes instanciados (modelos CC0), terreno con relieve leve y texturas de suelo; a lo lejos, siluetas de cerros o perfil urbano.
- Todo con fuente «procedural» en la leyenda, para que nadie lo tome por el lugar real.
- **Listo cuando:** ninguna cámara ve un plano liso ni un horizonte vacío en las 4 escenas.

**T1.4 · Vehículos, segunda pasada.**
- Pintura con capa transparente y hojuelas, reflejos del entorno, cromo y vidrio; luces de freno encendidas cuando el conductor (agente) frena; faros y calaveras de noche; interior tenue.
- Ruedas en los ejes del caso (pendiente de ADR 0086); moto de trabajo de 125 cc con licencia libre; clases sin modelo (van, combi, autobús, tractocamión) con un modelo cada una si existe con licencia libre, si no, paramétrico mejorado.
- **Listo cuando:** las capturas del daño de las 4 escenas las aprueba René.

**T1.5 · Cámara y presentación.**
- Cámara cinematográfica más cerca y más baja (3–6 m, 35–50 mm), órbita lenta al impacto, cámara lenta con desenfoque de movimiento en el contacto, profundidad de campo; transiciones suaves entre la cenital, la del conductor y la cinematográfica.
- Leyenda limpia: la de CESVI, la atribución CC-BY y nada más (fuera «semilla 101» de la vista para presentar).
- Lo mismo en el exportador a Blender, para que el video de R11 muestre el mismo escenario.
- **Listo cuando:** un recorrido de 20 s de AXA en modo Presentar se ve como un clip de juego y René lo aprueba.

**Niveles §7.8:** ultra y alta usan todo; media baja densidad de vegetación, resolución de texturas (KTX2 512) y quita reflejos en pantalla; baja conserva la función con lo procedural de hoy. La laptop de 8 GB es el piso: en media, ≥ 60 fps mediana en las 4 escenas; alta y ultra se miden en la computadora de demo (T2b). Si media no alcanza, se recorta densidad en media, nunca función (regla de `CLAUDE.md`).

**Medición:** `eval/results/t1_capturas.json` (lista de capturas antes/después por subtramo) y `eval/results/e6_t1_*.json` (fps por nivel y escena). René aprueba a ojo; los fps son de CI manual.

### T2 · Verificación en hardware real

**T2a (ahora, 2 minutos):** el colaborador hace `git pull` y corre `EJECUTAR-EN-COMPUTADORA-DEMO.bat -Prueba` desde una terminal en la carpeta del repo. Sirve para descubrir hoy cualquier problema del script en otra máquina (Git, Chrome, permisos, descarga de Blender). Si falla, Claude Code lo arregla antes de T1.

**T2b (después de T1):** el colaborador corre el botón completo. Claude Code integra la rama `resultados/computadora-demo-<fecha>`: E6 alta y ultra en PROGRESS y README, los videos de R11 en `demo/video/` y las tomas de la portada sustituidas por los renders de Blender (ADR 0092).

- **Listo cuando:** E6 de alta y ultra y los dos videos están en el repo y René los aprobó.

### T3 · Números defendibles

1. **El rango no depende del muestreo:** muestreo estratificado (o cuasialeatorio, Sobol) con más muestras en el Web Worker, medido: el p10 y el p90 de V2 en AXA no deben moverse más de 1 km/h entre corridas. Antes y después en `eval/results/axa_rango_estable.json`.
2. **El rumbo inicial de V2 en el límite (+20°):** diagnosticar si el límite es corto o la pose inicial supuesta está mal orientada; corregir con fuente; medir AXA y las 16 escenas.
3. **Reversa:** sentido de marcha separado del rumbo del frente en el contrato y en el solver (Python y TS, paridad); `cesvi-3a0125cb81` reconstruye al que retrocede; E-R4 mide la reversa (hoy 0 de 9).
4. **AXA con sus dos lecturas, sin confusión:** en el paso 7, el 3D y el dictamen, dos bloques con nombre: «Reproducción del método de CESVI con los datos del reporte» (60.27 = 60.27; 63.90 contra 63.15) y «Reconstrucción física de Croquis» (V2 con su rango contra 63.15, con valor y porcentaje), más una línea en lenguaje de perito de por qué difieren (EBS con la masa sola contra velocidad de circulación por momento y trayectorias; deslizamiento con a = 0.9 contra llantas que ruedan). Nada se ajusta para coincidir.
5. **E-R4 v4:** se corre completa con todo lo anterior y se publica junto a v1–v3; la portada y el README toman las cifras de v4 al compilar.
- **Listo cuando:** los cinco puntos están medidos en `eval/results/` y las cifras públicas salen de ahí.

### T4 · Prueba con personas (René, en paralelo desde ya)

- **Guion:** `docs/cesvi/prueba-personas.md` (Claude Code lo escribe al inicio de T1): un caso de alcance y uno lateral, con la narración impresa; la persona debe llegar al dictamen sin ayuda. Se anota el tiempo por paso, dónde pregunta, dónde se equivoca y qué dice al final.
- **Quiénes:** tres personas ajenas al proyecto (compañeros, el colaborador, un profesor). Si CESVI presta un perito, mejor, pero no se espera a eso.
- **Qué sale:** `eval/results/prueba_personas.json` con los tiempos y los tres problemas más frecuentes; Claude Code los corrige antes de T7.
- **También aquí:** la revisión visual de R9 que René tiene pendiente desde el 2026-10-23 (Presentar y Trabajar, tema claro y oscuro).
- **Listo cuando:** tres recorridos medidos y los tres problemas más frecuentes corregidos.

### T5 · Repositorio al nivel de Helada y documentación que se pueda retomar

- **`README.md` nuevo**, para Croquis para CESVI: el problema y sus fuentes; qué hace y qué no; cómo probarlo en vivo (liga) y en local (comandos exactos para Windows); resultados medidos contra líneas base (E-R4 v4, AXA con sus dos lecturas, carambolas) con liga a `eval/results/`; mapa del repo; datos y recursos con fuente y licencia; IA responsable; límites; siguiente paso. Cada cifra sale de `eval/results/` (regla 3 de `CLAUDE.md`).
- **`docs/ESTADO.md`** (dos páginas): qué existe, cifras, cómo correrlo, qué falta, qué está bloqueado. Es lo que lee quien retoma el proyecto. PROGRESS sigue siendo la bitácora, pero su «Estado actual» se reescribe (hoy dice «Hito 1–3» del 20 de octubre) y lo anterior al giro a CESVI se mueve a `docs/historial/`.
- **`PLAN-CESVI.md`** pasa a esta v3; v2 y `PROTOTIPO.md` a `docs/historial/`.
- **CI** completa en menos de 10 minutos (Python va en 8 con el multiarranque): repartir o acelerar.
- **«Bloqueado»** se limpia: solo lo que de verdad necesita a René o a CESVI.
- **Listo cuando:** alguien sin contexto instala y corre Croquis en local siguiendo solo el README, y `ESTADO.md` cabe en dos páginas.

### T6 · Endurecimiento que un perito nota (lista cerrada)

1. Buscar el lugar en «Caso nuevo» (dirección, carretera y kilómetro, o coordenadas) en vez de navegar a mano.
2. La versión declarada dibujada en el croquis 2D (hoy solo en 3D y tabla).
3. En una carambola, declarar a mano el orden de impactos cuando la narración no lo dice.
4. Los agentes respetan el orden de impactos de la reconstrucción (solver, paridad).
5. Las relecturas de R12b grabadas y medidas (gasta API; se pide a René antes).
6. El prompt del corpus dice «reporte» en vez de «dictamen» (en la misma regrabación del punto 5).
7. Varias declaraciones a la vez en R7 (solo si en T4 o T7 alguien lo pide; si no, se descarta).
- **Listo cuando:** 1–4 hechos con su e2e; 5–6 hechos o descartados por René; 7 decidido.

### T7 · Cierre con CESVI

- Demo con la versión final (T1–T6), guion de 15 minutos: narración → mapa → reconstrucción 3D → dictamen; AXA con sus dos lecturas; la carambola.
- Se les pregunta lo que solo ellos pueden decidir: cuentas y nube para los casos, estructura exacta de su reporte en el dictamen, qué modalidades les importan más, si quieren el comparador de declaraciones.
- Lo que pidan se anota en PROGRESS con fecha; lo chico se hace de inmediato, lo grande entra como v4 solo si René lo aprueba.
- **Listo cuando:** los comentarios de CESVI están en PROGRESS y cada uno tiene decisión.

## 3. Lo que solo René puede hacer (y cuándo)

| Qué | Cuándo | Para qué |
| --- | --- | --- |
| Pedirle al colaborador el `-Prueba` (2 min) | Hoy | T2a: destapar fallas del script en otra máquina |
| Pedirle al colaborador el botón completo (horas) | Cuando Claude Code avise que T1 cerró | T2b |
| Aprobar capturas de T1 por subtramo | Cada vez que Claude Code lo pida en «Resumen para René» | Cierra T1 |
| Conseguir tres personas y correr el guion | Esta semana, en paralelo | T4 |
| Revisión visual de R9 | Junto con T4 | Pendiente desde el 2026-10-23 |
| Autorizar gasto de API para regrabar relecturas y corpus | Cuando llegue T6.5 | T6 |
| Agendar la demo con CESVI | Cuando T1–T6 estén en verde | T7 |

## 4. Fuera de esta versión (no se borra)

Cuentas y nube (hasta que CESVI lo pida en T7), app móvil, dictado por voz, chat «Preguntar», OCR de reportes escaneados, mosaicos de mapa propios, la historia de lanzamiento. Quedan en «Endurecimiento pendiente».

## 5. Riesgos

- **T1 en una laptop de 8 GB:** las texturas y la vegetación pueden no caber en media. Mitigación: KTX2, instancias, LOD por nivel, medir en cada subtramo, y la computadora de demo para alta y ultra.
- **Claude Code se detiene sin prompt:** al cerrar cada tramo deja en PROGRESS el siguiente paso concreto y René le manda «sigue con el plan v3» sin más.
- **El 3D nunca es «suficiente» a ojo:** por eso las 4 escenas fijas y la aprobación por subtramo; cuando René aprueba T1.5, T1 cierra y no se reabre salvo por CESVI.
