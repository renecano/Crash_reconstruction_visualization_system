# Ronda 2 · C: cinco narraciones de ejemplo

Pedido de René (2026-11-16): «Usar una narración de ejemplo» traía solo la del Jetta y el Camaro. Ahora son cinco, cada una con una línea de lo que muestra, en la narración del caso nuevo.

**Estado (2026-11-16):** en producción (#258). Leídas con Claude y probadas de punta a punta en producción, sin el 3D de Unity (`eval/results/ronda2_ejemplos.json`): ninguna llamada a Claude y ningún error de página. Falta verlas en el 3D de Unity (ver «Lo que falta»).

## Qué muestra cada una

| #   | En el selector                                                                                                                         | Qué da (producción, `ronda2_ejemplos.json`)                                                                                                                                | Qué capacidades cubre                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Crucero de noche en Iztapalapa.** Dos autos en un crucero urbano, con alturas de daño.                                               | A · Jetta a 16 km/h (7–24); B · Camaro a 12 km/h (3–19)                                                                                                                    | Lectura con cita de cada dato, preguntas de lo que falta, de noche (22:30). Es un reporte de CESVI (`cesvi-e814f085db`)       |
| 2   | **Alcance en carretera con la deformación medida.** La deformación medida (C1–C6) en los dos vehículos: energía y cambio de velocidad. | A · NP300 a 62 km/h (53–62); B · Vento a 0 km/h (0–10). «Los daños» muestra el perfil C1–C6, la energía de deformación y el cambio de velocidad de los dos                 | Medidas de deformación completas (C1–C6 y L) en los dos vehículos, que entran como evidencia junto con las posiciones finales |
| 3   | **Carambola de noche con lluvia.** Tres vehículos en fila sobre pavimento mojado: dos impactos en orden.                               | A · Ranger a 34 km/h (30–41). Los dos impactos ocurren en orden: A con B, y 0.18 s después B con C                                                                         | Carambola (3 vehículos, 2 impactos en orden), de noche y con lluvia. La app declara que C empieza detenido (supuesto)         |
| 4   | **Reversa en una calle con tope.** Una camioneta sale en reversa de una cochera; hay un tope en la calle.                              | B · Versa a 21 km/h (20–26). A · CR-V, casi detenido al contacto (0–1); la app dice que una reversa sin velocidad narrada se supone a 5.68 km/h (3.06–9.07), con su fuente | Maniobra en reversa con su fuente; un tope con las medidas de la norma y el perfil del terreno bajo cada vehículo             |
| 5   | **Choque en un entronque y salida contra un poste.** Huella de derrape, acotamiento de terracería y un poste.                          | B · Sentra a 36 km/h (31–38); A · Mazda 3 a 30 km/h (25–32)                                                                                                                | Punto de paso (la huella de derrape), zona de terracería (cambia la fricción) y un objeto fijo como segundo choque            |

Las cifras son las de la pantalla, con la escena colocada como dice cada narración (la receta de cada una está en `apps/web/e2e/ejemplos-ronda2.spec.ts`). Si el perito coloca distinto, cambian.

## Lo que no se logró, y los límites que dejan ver

- **Dos hipótesis: ninguna de las cinco las da.** Salen cuando una posición final supuesta no cabe con la deformación medida (`checkAssumedRest`). En un caso narrado las posiciones finales las coloca el perito, así que no hay un reposo supuesto con el cual chocar. Hoy solo se ven en el caso de AXA. La línea del ejemplo 2 ya no las promete.
- **Sin posiciones finales, la deformación medida sola no fija la velocidad.** El borrador del ejemplo 2 decía que los vehículos fueron retirados antes de la inspección: con «No sé dónde quedó» en los dos, la app respondía «la evidencia no la fija» para el que alcanza. La narración ahora dice dónde quedó cada uno, como un reporte con croquis.
- **Un solo vehículo contra un objeto fijo no se reconstruye.** El borrador del ejemplo 5 era un vehículo que sale del camino y pega contra un poste: la app lo decía («El impacto 1 no es entre dos vehículos: la reconstrucción no lo calcula») y daba una cifra que no salía del choque. Se cambió por un choque entre dos vehículos en el que uno sale a la terracería y pega contra el poste. Ahí la reconstrucción usa el choque entre vehículos y el punto de paso, y declara que el golpe contra el poste no lo calcula. El límite no se esconde: sigue a la vista en los límites del caso.
- **El borrador de la carambola no se reconstruía completo** (A adelante y C atrás, con A a 14 m): el segundo impacto no ocurría. Se reescribió con la geometría que sí se resuelve: A alcanza a B y B a C, detenidos en un semáforo, con desplazamientos cortos.
- **La pendiente del ejemplo 4 no entra.** El terreno admite topes, zonas y el relieve real del lugar; una pendiente narrada no se puede declarar a mano. La narración conserva la pendiente y la línea del selector ya no la promete.
- **El redactor de datos personales quita los números de domicilio** («número 2400» pasa a «[NUMERO]»). Las narraciones no los llevan, para que el texto leído sea idéntico al del ejemplo.

## Cómo se usan en la app

- La lista está en la narración del caso nuevo, con el campo vacío o con un ejemplo sin cambios (`apps/web/src/lib/ejemplos-narracion.ts`).
- Cada ejemplo trae su lectura guardada (`data/cesvi/grabaciones/ejemplos/`), hecha con Claude con el prompt de la app (`eval/ronda2_narraciones.mts`). Si el perito lee un ejemplo tal cual, la app usa esa lectura, no llama a Claude y lo dice: «Es una narración de ejemplo: se muestra su lectura guardada, hecha con Claude». Con un solo cambio en el texto, se lee de nuevo.
- En las cinco lecturas, ninguna cita queda fuera de su texto (`eval/results/ronda2_narraciones.json`).

## Costo

Siete lecturas (las cuatro nuevas y la relectura de las tres que se reescribieron): 0.1993 USD. El libro de W9 quedó en 1.6059 de 20 USD (`eval/results/w9_gasto.json`).

## Lo que falta

- Verlas en el 3D de Unity (`CROQUIS_UNITY=1`): no se hizo en la laptop de René, que se quedó sin memoria con Unity.

## Reglas de los textos

- Inventados, con el lenguaje técnico de un reporte de CESVI: lugar, vía, superficie, vehículos, daños con su dirección, medidas, restos, huellas y posiciones finales.
- Sin conclusiones ni velocidades: la narración no las trae (ADR 0060). Sin nombres de personas, placas, aseguradoras, folios ni números de domicilio.
- Las calles y los kilómetros son inventados. Los municipios son reales, pero ninguno describe un caso real.

## Los textos

El 1 es el reporte de CESVI ya grabado. Los otros cuatro:

### 2 · Alcance en carretera con la deformación medida

El hecho se ubica en la carretera federal 57, tramo Querétaro–San Luis Potosí, a la altura del km 112+300, municipio de San Luis de la Paz, Guanajuato, aproximadamente a las 16:10 horas. La carretera consta de dos cuerpos separados por un camellón central con vegetación; el cuerpo con sentido de Sur a Norte tiene dos carriles de concreto asfáltico de 3.50 metros cada uno, con acotamiento de 2.50 metros. La superficie se encontraba seca.

Se examinan el vehículo A, marca Nissan, tipo NP300, modelo 2018, color blanco, de servicio particular, y el vehículo B, marca Volkswagen, tipo Vento, modelo 2016, color gris, de servicio particular. El vehículo A presenta en su parte frontal un hundimiento de adelante hacia atrás que afecta defensa, fascia, cofre, parrilla y radiador; se midió la deformación a lo ancho del frente con seis medidas a separación uniforme: C1 = 0.18 m, C2 = 0.24 m, C3 = 0.29 m, C4 = 0.31 m, C5 = 0.27 m y C6 = 0.20 m, con un ancho de daño L = 1.52 m. El vehículo B presenta en su parte posterior un hundimiento de atrás hacia adelante que afecta defensa trasera, cajuela, calaveras y panel trasero, con medidas C1 = 0.22 m, C2 = 0.30 m, C3 = 0.36 m, C4 = 0.38 m, C5 = 0.33 m y C6 = 0.25 m, y L = 1.45 m. Las zonas de contacto corresponden entre sí: la parte frontal del vehículo A con la parte posterior del vehículo B.

Se localizan restos de plástico y vidrio en el carril de baja velocidad, en una franja de 6.80 metros de largo. El vehículo A quedó en el carril de baja velocidad, 9 metros adelante del inicio de los restos; el vehículo B quedó sobre el acotamiento, 21 metros adelante del inicio de los restos.

### 3 · Carambola de noche con lluvia

El hecho se ubica en el Boulevard de los Pinos, entre las calles Encino y Nogal, colonia Valle Alto, municipio de Monterrey, Nuevo León, aproximadamente a las 21:45 horas. El boulevard consta de un arroyo de tres carriles con sentido de Poniente a Oriente, de concreto hidráulico, con iluminación artificial funcionando y semáforo en el cruce con la calle Nogal. Al momento del hecho se registraba lluvia ligera y la carpeta se encontraba mojada.

Se examinan tres vehículos de servicio particular que se encontraban en el carril central: el vehículo A, marca Ford, tipo Ranger, modelo 2012, color negro; el vehículo B, marca Toyota, tipo Corolla, modelo 2019, color blanco; y el vehículo C, marca Chevrolet, tipo Aveo, modelo 2015, color rojo. El vehículo B y el vehículo C se encontraban detenidos por el semáforo en rojo, el vehículo C delante del vehículo B; el vehículo A circulaba detrás de ellos. El vehículo A presenta en su parte frontal un hundimiento de adelante hacia atrás sobre defensa, parrilla y cofre. El vehículo B presenta en su parte posterior un hundimiento de atrás hacia adelante sobre defensa, cajuela y calaveras, y en su parte frontal un hundimiento de adelante hacia atrás sobre defensa y fascia. El vehículo C presenta en su parte posterior un hundimiento de atrás hacia adelante sobre defensa y cajuela.

Primer impacto: la parte frontal del vehículo A contra la parte posterior del vehículo B. Segundo impacto: por el empuje, la parte frontal del vehículo B contra la parte posterior del vehículo C.

Se localizan restos de plástico y vidrio sobre el carril central, en el área del primer contacto. El vehículo A quedó sobre el área de restos; el vehículo B, en el mismo carril, 5 metros adelante del área de restos; y el vehículo C, 10 metros adelante del área de restos.

### 4 · Reversa en una calle con tope

El hecho se ubica en la calle Cerro del Fortín, frente al acceso vehicular de una casa habitación, colonia Lomas del Valle, municipio de Puebla, Puebla, aproximadamente a las 08:20 horas. La calle consta de un arroyo de dos carriles de concreto asfáltico, uno por sentido, con pendiente descendente hacia el Norte; 12 metros al Sur de ese acceso se encuentra un reductor de velocidad tipo tope de 0.10 metros de alto y 1.80 metros de ancho. La superficie se encontraba seca.

Se examinan el vehículo A, marca Honda, tipo CR-V, modelo 2017, color plata, de servicio particular, que salía en reversa de ese acceso vehicular hacia la calle, y el vehículo B, marca Nissan, tipo Versa, modelo 2020, color azul, de servicio particular, que circulaba de Sur a Norte. El vehículo A presenta en su parte posterior derecha un hundimiento de atrás hacia adelante y de derecha a izquierda sobre defensa y calavera. El vehículo B presenta en su costado izquierdo, a la altura de la puerta delantera, un hundimiento de izquierda a derecha con desprendimiento de pintura. Las zonas de contacto corresponden: la parte posterior del vehículo A con el costado izquierdo del vehículo B.

El vehículo A quedó con su parte posterior sobre el carril con sentido al Norte, a 2.40 metros del acceso; el vehículo B quedó 7 metros al Norte del área de contacto, junto a la guarnición.

### 5 · Choque en un entronque y salida contra un poste

El hecho se ubica en el entronque de la carretera estatal 15, tramo San Martín–Atlixco, con el camino a San Lucas, a la altura del km 23+600, municipio de Tianguismanalco, Puebla, aproximadamente a las 06:40 horas. La carretera estatal consta de un arroyo de dos carriles de concreto asfáltico, uno por sentido, con circulación de Poniente a Oriente y viceversa, y acotamiento de terracería de 2.00 metros de ancho en ambos lados; el camino a San Lucas llega del Sur, es de un carril por sentido y de concreto asfáltico. La superficie se encontraba seca.

Se examinan el vehículo A, marca Mazda, tipo 3, modelo 2014, color gris, de servicio particular, que circulaba por el camino a San Lucas de Sur a Norte, y el vehículo B, marca Nissan, tipo Sentra, modelo 2018, color blanco, de servicio particular, que circulaba por la carretera estatal de Poniente a Oriente. El vehículo A presenta en su parte frontal un hundimiento de adelante hacia atrás sobre defensa, fascia y cofre. El vehículo B presenta en su costado derecho, a la altura de la puerta delantera, un hundimiento de derecha a izquierda, y en su parte frontal izquierda un hundimiento de adelante hacia atrás, de forma semicircular coincidente con un poste. Las zonas de contacto corresponden: la parte frontal del vehículo A con el costado derecho del vehículo B.

Después del contacto, el vehículo B dejó una huella de derrape de 18.40 metros que inicia en el área de contacto, cruza el borde de la carpeta y continúa sobre el acotamiento de terracería, hasta un poste de concreto de la línea de distribución eléctrica situado a 1.50 metros del borde de la carpeta, contra el cual se impactó. El vehículo B quedó en contacto con el poste, orientado hacia el Oriente; el vehículo A quedó sobre el entronque, 8 metros al Norte del área de contacto.
