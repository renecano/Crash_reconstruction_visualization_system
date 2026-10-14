# Física de Croquis — modelos, ecuaciones y referencias

> Este documento acompaña a `solver/croquis_solver` (referencia) y `packages/solver-ts` (port, F9).
> Cada módulo se documenta cuando se implementa; lo que aparece como _pendiente_ no existe aún en código.
> Todo valor que no sale de una medición propia o de una fuente citada está marcado **supuesto**, tanto aquí como en los resultados del solver (`parametros`, `banderas`, `origen`).

## Convenciones

- Unidades internas SI: metros, segundos, kilogramos, radianes. La interfaz convierte a km/h (`units.py` / `units.ts`).
- Marco del mundo: X al este, Y al norte, rumbo medido desde +X en sentido antihorario. Marco del cuerpo: x al frente, y a la izquierda.
- Dirección principal de la fuerza (PDOF) en horas de reloj: 12 = de frente, 3 = desde la derecha, 6 = desde atrás, 9 = desde la izquierda (`impact.pdof_degrees`).
- Todo lo aleatorio recibe semilla explícita; los resultados con rango se reportan como percentiles (Monte Carlo en F7).
- Inercia de guiñada: placa rectangular uniforme, $I_z = m\,(L^2 + W^2)/12$ (`Body2D.box_inertia`). **Aproximación**; para un sedán de 1 300 kg y 4.5 × 1.8 m da ≈ 2 540 kg·m², del orden de las mediciones publicadas (Heydinger et al., SAE 1999-01-1336), que se adoptarán en F7.

## Módulos (PLAN §6.1)

| #   | Módulo                                                           | Fase  | Estado                               |
| --- | ---------------------------------------------------------------- | ----- | ------------------------------------ |
| 1   | Pre-impacto (trayectorias, frenado, percepción-reacción)         | F2    | **hecho** (`preimpact.py`)           |
| 2   | Impacto vehículo-vehículo (impulso planar)                       | F2    | **hecho** (`impact.py`)              |
| 3   | Energía de deformación CRASH3 (A/B/G, perfil C1–C6)              | F2    | **hecho** (`crash3.py`, E2)          |
| 4   | Impacto con objeto fijo                                          | F2    | **hecho** (`fixed_object.py`)        |
| 5   | Post-impacto (3 GDL, círculo de fricción)                        | F2    | **hecho** (`postimpact.py`)          |
| 6   | Volcadura (criterio de inicio; secuencia en Rapier, ilustrativa) | F5    | **hecho** (`rollover.py`; visor)     |
| 7   | Peatón y ciclista (Searle, Wood; contactos; ragdoll en F5)       | F2/F5 | **hecho** (`pedestrian.py`; ragdoll) |
| 8   | Ocupantes (cinemática relativa, sin lesiones)                    | F5    | **hecho** (`occupant.py`)            |
| 9   | Visibilidad (línea de vista en el tiempo)                        | F5    | **hecho** (`visibility.py`)          |
| 10  | Inversión (mínimos cuadrados robustos; CMA-ES si hace falta)     | F7    | pendiente                            |
| 11  | Monte Carlo                                                      | F7    | pendiente                            |
| 12  | Consistencia (banderas en lenguaje llano)                        | F7    | banderas básicas en `reconstruct.py` |

## 1. Pre-impacto (`preimpact.py`)

- **Trayectorias** por longitud de arco $s$: recta; arco circular de radio $R$ (curvatura $\pm 1/R$); cambio de carril suave con desplazamiento lateral $y(s) = \tfrac{\Delta}{2}\,(1 - \cos(\pi s/L))$; composición de tramos. El orquestador usa $R = 8$ m para vueltas en intersección y $L = 40$ m para cambios de carril (**supuestos** de geometría urbana).
- **Frenado**: desaceleración $a = g\,(\mu\, f_{ABS} \cos\alpha + \sin\alpha)$ con $\alpha = \arctan(\text{pendiente}/100)$ (subida positiva). $\mu$ sale de `data/friction.json` (llanta bloqueada); $f_{ABS}$ es la relación fricción pico / deslizamiento, 1.15 (rango 1.05–1.3), **supuesto** hasta E3.
- **Perfil de velocidad**: $v_0$ constante y, desde $t_b$, $v = v_0 - a\,(t - t_b)$ hasta cero. Distancia de derrape $d = v_0^2/(2a)$ y su inversa $v_0 = \sqrt{2 a d}$.
- **Percepción-reacción**: 1.1 s nominal, rango 0.7–1.5 s (Olson y Sivak 1986; Green 2000). Todavía no se usa para colocar el inicio del frenado cuando el relato no lo da: en ese caso el orquestador asume 0.6 s de frenado antes del impacto y lo marca como bandera.
- Pruebas: `test_preimpact.py` (fórmula cerrada de derrape, geometría de arcos y cambios de carril, determinismo bit a bit).

## 2. Impacto vehículo-vehículo (`impact.py`)

Modelo de impulso de cuerpos rígidos planos (Brach y Brach 2011; Kudlich–Slibar). En el punto de contacto $P$ con normal $\hat n$ (de A hacia B) y tangente $\hat t$:

- Velocidad relativa en $P$: $\vec v_{rel} = (\vec v_B + \omega_B \times \vec r_B) - (\vec v_A + \omega_A \times \vec r_A)$.
- Cambio de velocidad relativa por el impulso $\vec J$ (sobre B; $-\vec J$ sobre A): $\vec v'_{rel} = \vec v_{rel} + K\,\vec J$, con $K = (1/m_A + 1/m_B)\,I + \vec s_A \vec s_A^{\,T}/I_A + \vec s_B \vec s_B^{\,T}/I_B$ y $\vec s = \hat k \times \vec r$.
- Restitución de Newton en la normal: $\hat n \cdot \vec v'_{rel} = -e\,(\hat n \cdot \vec v_{rel})$.
- Tangencial: adherencia ($\hat t \cdot \vec v'_{rel} = 0$) si $|J_t| \le \mu J_n$ (impulso crítico de Brach); si no, deslizamiento con $J_t = -\mu\,\mathrm{sgn}(v_t)\,J_n$.
- Con restitución de Newton y fricción de Coulomb existen configuraciones que ganarían energía (paradoja de Kane). El solver evalúa candidatos en orden (adherencia, deslizamiento con $\mu$, $\mu/2$, …, 0) y toma el primero que no gana energía; el caso $\mu = 0$ nunca la gana para $e \le 1$. El resultado informa la fricción efectivamente usada.
- Salidas: impulso, $\Delta V = |\vec J|/m$ por vehículo, PDOF por vehículo, velocidades y velocidades angulares posteriores, energía disipada.
- Valores por defecto del orquestador: $e = 0.1$, relación de impulso $\mu = 0.4$ (**supuestos**; Brach reporta $e$ de 0.05 a 0.3 a velocidades urbanas).
- Pruebas (`test_impact.py`): conservación de momento lineal y angular con error relativo < 1e-9 en 400 configuraciones aleatorias (Hypothesis), energía cinética no creciente, simetría al intercambiar vehículos, choque central en línea contra la solución cerrada $v'_A = \frac{m_A v_A + m_B v_B + m_B e (v_B - v_A)}{m_A + m_B}$, barrera rígida $\Delta V = v(1+e)$, PDOF a las 3 para un impacto lateral derecho.

## 3. Energía de deformación CRASH3 (`crash3.py`, E2)

Fuerza por unidad de ancho lineal en el aplastamiento: $F/w = A + B\,C$. Para un perfil de $N$ puntos equiespaciados sobre el ancho dañado $L$ ($w = L/(N-1)$, $G = A^2/2B$):

$$E = w \sum_{i=1}^{N-1} \left[ \frac{A}{2}(C_i + C_{i+1}) + \frac{B}{6}\left(C_i^2 + C_i C_{i+1} + C_{i+1}^2\right) + G \right] \cdot (1 + \tan^2\theta)$$

con $\theta$ el ángulo entre la fuerza principal y la normal a la superficie (acotado a 45°). Caso uniforme: $E = L\,(A C + B C^2/2 + G)$ y su inversa $C = (-A + \sqrt{A^2 + 2B(E/L - G)})/B$. Velocidad equivalente contra barrera $EBS = \sqrt{2E/m}$; para dos vehículos $\Delta V_1 = \sqrt{2 E_{tot} m_2 / (m_1 (m_1+m_2))}$.

**Coeficientes por clase** (`stiffness_classes.json`, generado por E2 desde pruebas frontales a 0° contra barrera rígida de NHTSA): con $\Delta V = v(1+e)$, $b_1 = (\Delta V - b_0)/\bar C$, $A = m b_0 b_1 / L$, $B = m b_1^2 / L$, $b_0 = 8$ km/h y $e = 0.1$ (valores de literatura citados por Kodsi et al. 2017). Se reporta la mediana por clase; solo hay datos para la zona frontal; lateral y trasera usan el respaldo marcado `supuesto`. El reparto de la energía disipada entre dos carrocerías se hace inversamente a $B$ (misma fuerza en el contacto; **aproximación**). Formas de perfil por zona CDC: distribuido → uniforme; Y/Z → triangular sobre 66 % del lado; L/C/R → 40 % del lado.

Pruebas (`test_crash3.py`): uniforme = fórmula cerrada, inversa recupera la energía, monotonía, perfiles con forma absorben exactamente la energía pedida, conversión kgf/cm → N/m.

## 4. Objetos fijos (`fixed_object.py`)

- Barrera plana rígida: $\Delta V = v(1+e)$, $E = \tfrac12 m v^2 (1 - e^2)$, perfil uniforme sobre el ancho. Desde F3 el orquestador resuelve las superficies planas con el impulso planar de §2 contra un cuerpo inmóvil (normal de la superficie), que se reduce a esta fórmula en un choque de frente centrado y trata bien los golpes oblicuos o de costado.
- Objeto estrecho (poste, árbol): el ancho dañado se propaga desde el diámetro $D$ con ángulo $\alpha = 45°$: $L = \min(W, D + 2 C_{max} \tan\alpha)$, resuelto por iteración porque $C_{max}$ depende de $L$ (forma "poste" de CRASH3). **Aproximación** habitual en reconstrucción.
- Rigidez del objeto: concreto, metal y mampostería son rígidos; madera/vegetal con $D \ge 0.25$ m se trata como rígido; si es más delgado, cede y absorbe el 30 % de la energía cinética (**supuesto**, rango 10–50 %, pendiente de E5 con BeamNG en F10).

## 5. Post-impacto (`postimpact.py`)

Modelo planar de 3 GDL en el marco del cuerpo $(u, v, r)$: $m(\dot u - r v) = \sum F_x$, $m(\dot v + r u) = \sum F_y$, $I_z \dot r = \sum (x_i F_{y,i} - y_i F_{x,i})$. Cuatro llantas con carga estática repartida por ejes; llanta bloqueada: fuerza $\mu N$ opuesta a su velocidad de deslizamiento (círculo de fricción saturado); llanta rodando: lateral $-\mu N\,\mathrm{sat}(v_{lat}/0.3)$ más arrastre longitudinal. Integración semi-implícita de Euler con $dt = 2$ ms, salida cada 20 ms, reposo cuando $|v| < 0.05$ m/s y $|r| < 0.05$ rad/s.

Tras el impacto, si el conductor frenaba las llantas van bloqueadas; si no, ruedan con un arrastre de $0.35\,\mu$ (**supuesto** que representa frenado parcial y daño; Fricke 2010 discute factores de arrastre post-impacto entre 0.3 y 0.5 de $\mu$). Pruebas: derrape recto = $v^2/(2\mu g)$ (1 %), energía no creciente, giro que decae, determinismo bit a bit.

## 7. Peatón y ciclista (`pedestrian.py`)

Searle (SAE 831622, 1983; SAE 930659, 1993): un cuerpo lanzado con velocidad $v$ y ángulo $\theta$ desde la altura de su centro de masa $h$ vuela, al aterrizar pierde la velocidad vertical $v_z$ y la fricción le quita $\mu |v_z|$ de la horizontal, y luego desliza con desaceleración $\mu g$. Integrando ese modelo (`throw_kinematics`):

$$D = \frac{v^2 (\cos\theta + \mu \sin\theta)^2}{2 \mu g} + \mu h \quad\Longrightarrow\quad v(\theta) = \frac{\sqrt{2 \mu g (D - \mu h)}}{\cos\theta + \mu \sin\theta},\qquad v_{min} = \sqrt{\frac{2\mu g (D - \mu h)}{1 + \mu^2}},\quad v_{max} = \sqrt{2 \mu g (D - \mu h)}$$

(válido mientras el deslizamiento arranca con velocidad, es decir, para ángulos bajos; cotas para $0 \le \theta \le 2\arctan\mu$). **Corrección en F3:** la versión de F2 usaba $(D + \mu h)$; lanzar desde más alto lleva más lejos, así que para una misma distancia la velocidad necesaria es menor y el término resta, igual que en Wood. Una prueba de propiedades exige que la integración y la forma cerrada coincidan a 1e-9. Wood (1988), como lo reproduce Spinu et al. 2018: $v = \sqrt{2\mu g (D - \mu h)}\,(m_v + m_p)/m_v$. Fricción cuerpo–suelo: 0.66 asfalto, 0.79 pasto (Searle). Factor de proyección vehículo → peatón 0.9 (rango 0.8–1.0, **supuesto** hasta E4). Contactos: defensa por altura (pierna/rodilla/muslo/cadera), borde de cofre, y cabeza por distancia de envolvimiento $WAD \approx 1.08 \times$ estatura (**aproximación**, literatura 1.03–1.1; F5 lo calibra con el ragdoll). Pruebas: cotas de Searle acotan toda velocidad en el dominio, ida y vuelta, cinemática = forma cerrada, lanzar desde más alto llega más lejos, Wood decrece con la masa del vehículo, zonas de contacto.

**Trayectorias de personas (`person_motion.py`, F3).** El peatón golpeado camina en línea recta desde su posición declarada para llegar al punto de impacto en $t = 0$ (velocidad del relato o 1.4 m/s, **supuesto** dentro de las medias de 1.25–1.51 m/s de Knoblauch, Pietrucha y Nitzburg, TRR 1538, 1996); después sigue el vuelo, el aterrizaje y el deslizamiento del modelo de Searle, de modo que la distancia recorrida es exactamente la que reporta el solver. Otras personas a pie caminan o permanecen de pie. Los jinetes de moto, scooter o bici van montados (fase `montado`) hasta el impacto y desde ahí siguen el mismo modelo (F5); los ocupantes de vehículos cerrados no tienen trayectoria en el mundo (§8).

**Jinetes (F5).** En un choque vehículo–vehículo, quien va en moto, scooter o bici no va sujeto: sale con la velocidad de su vehículo al impacto por un factor de proyección 0.9 (**supuesto**, rango 0.8–1.0; Searle 1993 aplica el mismo modelo a motociclistas), desde una altura del centro de masa de 1.05 m en moto, 1.0 m en scooter y 1.15 m en bici (asiento más torso, **supuesto**), y sigue el modelo de Searle. Si el relato declara la distancia de proyección de esa persona y no cabe con la velocidad reconstruida, se marca (en `motociclista`, 8 m declarados piden 29–39 km/h contra 50 km/h reconstruidos: el jinete pierde velocidad al golpear el auto).

**Banda de Searle (`searle_distance_band`, F5).** Para una velocidad de lanzamiento $v$, una fricción $\mu \in [\mu_{lo}, \mu_{hi}]$ y ángulos en $[0, 2\arctan\mu]$, la ecuación de Searle acota la distancia:

$$D_{min}(\mu) = \frac{v^2}{2\mu g} + \mu h,\qquad D_{max}(\mu) = \frac{v^2 (1+\mu^2)}{2\mu g} + \mu h.$$

Ambas son convexas en $\mu$: el mínimo de $D_{min}$ está en $\mu^* = v/\sqrt{2gh}$ acotado al rango y el máximo de $D_{max}$ en un extremo. Es el criterio contra el que se juzga el ragdoll (PLAN §13). Pruebas: toda distancia de la forma cerrada con $\mu$ y $\theta$ en su dominio cae en la banda (Hypothesis, 300 casos); el modelo completo cae en la banda donde la velocidad sobrevive al aterrizaje; sin altura coincide con la forma cerrada a 1e-12. El port TS (`packages/solver-ts/src/pedestrian.ts`) reproduce las distancias y bandas de las escenas canónicas (paridad, E7).

**E4 (`uv run croquis-eval e4-pedestrian`).** 18 casos publicados de acceso abierto con velocidad medida (7 impactos escenificados del IPTM, Becker et al. 2016; 5 pruebas con maniquí de Eubanks y Haight, SAE 921591, y 6 casos reales de Randles et al., SAE 2001-01-0171, reproducidos en Batista 2008); el caso 69 de Eubanks y Haight (vehículo sin frenar) queda fuera del dominio de Searle y se reporta aparte. Resultados en `eval/results/e4_pedestrian.json` y en el README. El factor de proyección 0.9 queda cerca del óptimo de la muestra (0.92) y reajustarlo no mejora fuera de muestra (dejar uno fuera), así que se conserva.

## 6. Volcadura (`rollover.py`, F5)

Un vehículo que se desliza de lado y tropieza con las llantas gira alrededor de la línea de contacto. Con conservación del momento angular respecto a ese punto en el tropiezo impulsivo, $m v h = I_p \omega$ con $I_p = I_{cg} + m(h^2 + (T/2)^2)$, y exigiendo que la energía de rotación suba el centro de masa sobre el punto de giro, $\tfrac12 I_p \omega^2 \ge m g \Delta z$ con $\Delta z = \sqrt{h^2 + (T/2)^2} - h = h(\sqrt{1 + SSF^2} - 1)$:

$$v_{crit} = \sqrt{\frac{2 g \Delta z\, I_p}{m h^2}},\qquad SSF = \frac{T}{2h}$$

(la velocidad crítica de deslizamiento que usó NHTSA junto con el factor de estabilidad estática). Altura del centro de masa $h = 0.37 \times$ alto (**supuesto**; SSF típico 1.0–1.5), inercia de alabeo de una caja homogénea ancho × alto (**supuesto**), vía $T = 0.84 \times$ ancho (la proporción de autos y SUVs; la misma que usa el visor para las marcas). Para la SUV de `volcadura`: SSF 1.21 y $v_{crit} \approx 20$ km/h, del orden de lo publicado para SUVs. La velocidad lateral es la componente hacia la orilla en el tropiezo. Si el relato declara la volcadura y el criterio no alcanza (la fase previa no modela deslizamiento lateral), se marca. El visor simula las vueltas con Rapier desde estas condiciones y las etiqueta como **ilustrativas** (ADR 0008). Pruebas: la energía de rotación con $v_{crit}$ es exactamente $m g \Delta z$; el criterio es monótono y un vehículo más alto vuelca con menos velocidad.

## 8. Ocupantes (`occupant.py`, F5)

Cinemática del ocupante relativa al habitáculo, sin estimar lesiones (PLAN §10 y §16.2).

- **Pulso de choque:** media onda senoidal $a(t) = A\sin(\pi t/T)$ con $\int a\,dt = \Delta V$, es decir $A = \pi \Delta V/(2T)$. Si el vehículo pierde $\Delta V$ contra una barrera equivalente, su desplazamiento durante el pulso es $\Delta V\,T/2 = C$, así que $T = 2C/\Delta V$ con el aplastamiento máximo del solver, acotada a [0.06, 0.20] s. La dirección sale de la PDOF: el ocupante se mueve hacia el lado de donde viene la fuerza.
- **Sin cinturón:** vuelo libre hasta el espacio de vuelo del modelo de Michie (1981, TRR 796; base del procedimiento MASH de AASHTO): 0.6 m en sentido longitudinal y 0.3 m en lateral. Se reportan el instante y la velocidad relativa al tocar el interior (cinemática; no se comparan con umbrales de lesión).
- **Con cinturón:** sin fuerza hasta recorrer la holgura (0.05 m, **supuesto**, rango 0.02–0.10) y después resorte amortiguado con frecuencia natural 8 Hz y amortiguamiento 0.3 (**supuestos**). Actúa solo hacia adelante; en lateral el torso queda casi libre y la puerta del lado cercano se alcanza igual. Hacia atrás, el respaldo detiene al torso y la cabeza recorre 0.08 m hasta la cabecera (**supuesto**).
- **Zonas:** volante y tablero, tablero, respaldo del asiento de adelante, puerta y ventana del lado cercano, consola central o asiento contiguo, respaldo y cabecera.
- Si el relato no dice si llevaba cinturón se dan las dos variantes.

Ejemplo: a 50 km/h de frente con 0.45 m de aplastamiento, con cinturón el desplazamiento máximo es de unos 21 cm; sin cinturón toca el volante a los 0.6 m. Pruebas: el pulso integra el ΔV, la dirección sigue la PDOF, el cinturón reduce el desplazamiento frontal, sin cinturón la velocidad relativa al contacto es la acumulada del pulso, zonas por asiento y variantes sin dato.

## 9. Visibilidad (`visibility.py`, F5)

¿Podía verlo y a qué distancia? Para cada conductor y cada otro actor, cada 0.1 s antes del impacto se traza la línea de vista en 3D desde el ojo hasta varios puntos del objetivo (esquinas y centro de un vehículo a dos alturas; piernas, torso y cabeza de una persona; el tronco de un objeto). Se ve si al menos un punto queda libre.

- **Ojo:** AASHTO (Green Book 2018) usa 1.08 m para autos y 2.33 m para camiones; SUV, pickup, van, combi, moto y bici son **supuestos** por clase. Posición en el habitáculo con el volante a la izquierda.
- **Oclusores (geometría de `scene_objects.py`, la misma que dibuja el visor):** tronco (cilindro) y copa (esfera) de cada árbol, postes, muros, bardas, puestos y vehículos estacionados (cajas con altura) y los demás vehículos en movimiento en ese instante. La intersección es exacta para cilindro vertical, esfera y caja orientada; así la vista pasa sobre un auto bajo o bajo una copa alta.
- **Noche sin alumbrado:** una persona, un objeto o un vehículo sin luces solo se ve dentro del alcance de las luces bajas, 30 m (**supuesto**, rango 10–60; Olson y Sivak, citados por terceros: peatones con ropa oscura se detectan a menos de 30 m), y de su apertura horizontal útil (±30°, **supuesto**). Un vehículo con luces se ve.
- **Lluvia, niebla o granizo:** si el relato da la visibilidad meteorológica, nada más lejos se ve.
- No se modelan el campo visual del conductor (pilares, espejos) ni el deslumbramiento.

Resumen por par: si se veía al impacto, desde cuándo y a qué distancia, el tiempo disponible y lo que más tiempo lo tapó. Ejemplos: en `peaton_cruce` el camión estacionado tapa al peatón hasta 1.8 s antes del impacto (se ve a 21.6 m); en `objeto_fijo_arbol` el árbol se ve durante toda la aproximación (prueba del criterio de F5). Pruebas: intersecciones exactas y simétricas (Hypothesis), copa alta y auto bajo, noche y clima, árbol que tapa a una persona detrás de su tronco, segundo árbol que tapa el del impacto un tramo, camión que tapa al peatón.

## Orquestador (`reconstruct.py`)

1. Modelos por vehículo desde el contrato (masa, dimensiones; faltantes desde `vehicle_classes.json`).
2. Evento de impacto principal = primer evento `impacto_*` por `orden`; $t = 0$ en el impacto. **Contacto (`contact.py`, F3):** la zona CDC de cada vehículo define un punto de contacto en su marco (cara por el lado; posición a lo largo de la cara por la zona horizontal: tercios L/C/R o F/P/B, sextos Y/Z). Cada vehículo en movimiento puede ubicar ese punto en cualquier lugar de su trayectoria; el punto de impacto común se resuelve con proyecciones alternadas y Levenberg-Marquardt desde el punto declarado, y cada vehículo llega con **su punto de contacto** (no su centro de masa) justo en $t = 0$. Si las zonas no pueden tocarse se usa el acercamiento máximo y se marca. La fase previa se muestrea en una rejilla alineada a $t = 0$; antes de su posición declarada cada vehículo avanza a velocidad constante (mínimo 3 s de aproximación, parámetro `aproximacion_previa_s`).
   **Trayectorias (`road.py`):** vía recta, curva (centro en $(0, -R)$) o glorieta (centro en $(0, R + W/2)$, antihoraria), el mismo modelo que dibujan el croquis y el visor (ADR 0006). Para "recto" y cambios de carril se prueba la trayectoria que sigue el carril (arco concéntrico con desplazamiento lateral coseno, longitud de arco integrada en tabla) y la geometría literal; las vueltas son arcos de 90° de radio 8 m seguidos de recta. Si ninguna alcanza el objeto o la persona declarados, se infiere un desvío suave cuyo contacto ocurre a 3/4 de la maniobra (todavía con movimiento lateral) y se marca como inferido.
3. Impacto: vehículo–vehículo (normal desde la zona CDC declarada o desde la velocidad relativa; el punto de contacto excéntrico genera giro), vehículo–objeto estrecho (poste, árbol: modelo de §4), vehículo–superficie plana (muro, barda, guarnición: impulso planar contra un cuerpo inmóvil con la **normal de la superficie**, así un roce lateral contra la guarnición solo pierde la componente normal), vehículo–persona (Searle; el vehículo cede $m_p v$ de momento).
4. Energía disipada → perfiles CRASH3 por vehículo (origen de la rigidez informado).
5. Post-impacto hasta el reposo; la escena continúa 2 s después del último reposo; eventos (`inicio_frenado`, impacto, `reposo`) con tiempos.
6. Banderas: frenado sin distancia declarada, frenado que detendría antes del impacto, zonas de impacto que no pueden tocarse, desvío inferido para alcanzar el objeto, distancia de proyección declarada incompatible con la velocidad reconstruida.
7. Salida: documento que cumple `packages/scene-schema/resultado.schema.json` (ADR 0006).

Pruebas (`test_reconstruct.py`, `test_road.py`, `test_results_io.py`): en t = 0 el punto de contacto de cada vehículo coincide con el de impacto (< 0.3 m), el impacto excéntrico genera giro, cada vehículo arranca sobre su carril, ninguna escena tiene zonas inalcanzables, la trayectoria del peatón recorre exactamente la distancia de Searle, los resultados versionados cumplen su esquema y coinciden con el solver; además las 10 escenas canónicas se reconstruyen, trayectorias continuas y finitas, reposo de los involucrados, determinismo bit a bit del JSON, impulsos iguales y opuestos ($m_A \Delta V_A = m_B \Delta V_B$ exacto), PDOF 12/6 en el alcance, árbol/poste concentran el daño, proyección del peatón dentro de las cotas de Searle.

## Del perfil del solver al daño visual (F4)

El visor no calcula daño: traduce el perfil CRASH3 del solver (`dano.perfil_m`, `ancho_m`, `centro_m` y zona CDC) a una deformación por vértice:

$$\vec d(\vec p) = \hat n_{in}\, c(u)\, m(y)\, w(\delta),\qquad w(\delta) = 1 - \mathrm{smoothstep}(0,\, 1.6c + 0.3,\, \delta)$$

con $u$ la posición a lo largo de la cara golpeada (C1 a la izquierda en frente y atrás, adelante en los costados), $c(u)$ el perfil interpolado con 15 cm de caída fuera del ancho dañado, $m(y)$ la máscara vertical de la zona CDC y $\delta$ la profundidad detrás de la cara. La cara se desplaza exactamente $c(u)$ y el material de atrás se comprime sin plegarse (la pendiente de $w$ es menor que $1/c$). Una prueba mide el perfil sobre la malla deformada y exige coincidencia con el del solver dentro de 2 cm o 6 % en todas las escenas canónicas. Las reglas que no salen del solver (faros, parabrisas, piezas desprendidas, vidrios, charcos y bolsas de aire con umbrales del IIHS) son ilustrativas y están en ADR 0007.

## Rangos de plausibilidad por clase (F1)

El validador semántico (`check.ts` / `check.py`) marca masas, dimensiones y velocidades fuera de los rangos de `packages/scene-schema/vehicle_classes.json` (E006–E008). Los rangos de masa y dimensiones salen de fichas técnicas (`data/SOURCES.md`); los topes de velocidad por clase son constantes de diseño pensados para detectar relatos físicamente imposibles.

## Pruebas del solver (PLAN §6.2)

- Propiedades con Hypothesis / fast-check: conservación de momento lineal y angular (error relativo < 1e-9), energía cinética después ≤ antes, ΔV coherente con masas, simetría al intercambiar vehículos. **En verde en F2.**
- Casos analíticos con solución cerrada: choque central, barrera rígida, derrape, CRASH3 uniforme. **En verde en F2.**
- Paridad Python ↔ TS con tolerancia objetivo 1e-6 relativa (E7): F9.
- Determinismo por semilla (E8): determinismo bit a bit ya probado en Python; entre navegadores en F9.

## Referencias

- Brach, R. M. y Brach, R. M. _Vehicle Accident Analysis and Reconstruction Methods_, 2.ª ed., SAE International, 2011.
- Kudlich, H. (1966) y Slibar, A. (1966): modelo de impulso planar (resumido en Brach y Brach).
- McHenry, R. R. CRASH3 Technical Manual, NHTSA, 1986; Campbell, K. L. "Energy basis for collision severity", SAE 740565, 1974.
- Kodsi, S., Selesnic, S., Attalla, S., Chakravarty, A. "Vehicle frontal crush stiffness coefficients trends", _Accident Reconstruction Journal_, sep./oct. 2017 (método de A/B desde la base de NHTSA; $b_0$ 5–11 km/h; $e$ 0.03–0.2).
- Siddall, D. y Day, T. "Updating the vehicle class categories", SAE 960897, 1996 (clases por distancia entre ejes).
- Fricke, L. B. _Traffic Crash Reconstruction_, 2.ª ed., Northwestern University Center for Public Safety, 2010 (fricción, arrastre post-impacto).
- Mumford, D. et al. "Inverted vehicle drag tests", _Accident Investigation Quarterly_ 13, 1997.
- Searle, J. A. y Searle, A. "The trajectories and landing velocities of pedestrians...", SAE 831622, 1983; Searle, J. A. "The physics of throw distance in accident reconstruction", SAE 930659, 1993.
- Wood, D. P. "Application of a pedestrian impact model to the determination of impact speed", SAE 910814, 1991; Wood 1988 según Spinu, A. et al., IOP Conf. Ser.: Mater. Sci. Eng. 444 (2018) 072017.
- Olson, P. L. y Sivak, M. "Perception-response time to unexpected roadway hazards", _Human Factors_ 28(1), 1986; Green, M. "How long does it take to stop?", _Transportation Human Factors_ 2(3), 2000.
- Knoblauch, R. L., Pietrucha, M. T. y Nitzburg, M. "Field studies of pedestrian walking speed and start-up time", _Transportation Research Record_ 1538, 1996 (velocidad al caminar).
- IIHS (Insurance Institute for Highway Safety), "Airbags", https://www.iihs.org/research-areas/airbags (consultado el 2026-10-13): umbrales de despliegue de bolsas frontales y laterales.
- Heydinger, G. J. et al. "Measured vehicle inertial parameters — NHTSA's data through November 1998", SAE 1999-01-1336.
- Watson et al., SAE 2023-01-5043 y SAE 2022-01-5069 (CISS vs EDR; E3 en F7).
- Michie, J. D. "Collision risk assessment based on occupant flail-space model", _Transportation Research Record_ 796, 1981 (espacio de vuelo de 0.6 m y 0.3 m; base de MASH, AASHTO).
- AASHTO, _A Policy on Geometric Design of Highways and Streets_ (Green Book), 7.ª ed., 2018 (altura del ojo 1.08 m en autos y 2.33 m en camiones).
- Olson, P. L. y Sivak, M., estudios de detección nocturna de peatones con luces bajas (1983–1984), citados en AAFS 2004 C60 y en MDPI Eng. Proc. 150(1) 18 (2026): < 30 m con ropa oscura.
- NHTSA, investigación de volcaduras y calificación de resistencia a la volcadura: factor de estabilidad estática (SSF) y velocidad crítica de deslizamiento (CSV). La fórmula de §6 se deriva aquí por momento angular y energía; la referencia es conceptual.
- Winter, D. A. _Biomechanics and Motor Control of Human Movement_, 4.ª ed., Wiley, 2009 (fracciones de masa por segmento, tabla 4.1; curvas normativas de la marcha).
- Hendriks, E. et al., tabla suplementaria de rangos de movimiento "according to AAOS", _Plast. Reconstr. Surg. Glob. Open_ 8(6), 2020 (cadera, rodilla, hombro y codo).
- Becker, T., Reade, M. y Scurlock, B. "Simulations of pedestrian impact collisions with Virtual CRASH 3 and comparisons with IPTM staged tests", arXiv:1512.00790, 2016 (tabla 3; E4).
- Batista, M. "A simple throw model for frontal vehicle-pedestrian collisions", arXiv:0803.2402, 2008 (tablas 1 y 2: Eubanks y Haight, SAE 921591; Randles et al., SAE 2001-01-0171; E4).
