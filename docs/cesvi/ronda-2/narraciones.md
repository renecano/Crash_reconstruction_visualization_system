# Ronda 2 · C: cinco narraciones de ejemplo (planeación)

Pedido de René (2026-11-16): «Usar una narración de ejemplo» trae hoy solo la del Jetta y el Camaro. Se quieren cinco, con un selector donde cada una diga en una línea qué muestra. Entre las cinco tiene que verse todo lo que Croquis sabe hacer.

**Estado:** planeación. **No se ha gastado API.** Fable lee, prueba y pule las cuatro nuevas en producción (ver `para-fable.md`).

## Qué muestra cada una

| #   | Línea del selector                                                                       | Qué capacidades de Croquis cubre                                                                                                                                                                                                                         | Origen                                                          |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | **Crucero de noche en Iztapalapa:** dos autos en un crucero urbano, con alturas de daño. | Lectura con cita de cada dato, preguntas de lo que falta, posiciones en el mapa, **noche** (22:30)                                                                                                                                                       | La actual: un reporte de CESVI (`cesvi-e814f085db`), ya grabada |
| 2   | **Alcance en carretera con la deformación medida:** el método de CESVI y dos hipótesis.  | **Medidas de deformación completas** (C1–C6 y L en los dos vehículos), así que sale **el método de CESVI** (EBS y restos). Sin posiciones finales, el reposo queda supuesto: se espera que salgan **dos hipótesis**, como en AXA                         | Inventada                                                       |
| 3   | **Carambola de noche con lluvia:** tres vehículos en fila sobre pavimento mojado.        | **Carambola** (3 vehículos, 2 impactos en orden), **noche y lluvia** (pavimento mojado: cambia la fricción)                                                                                                                                              | Inventada                                                       |
| 4   | **Reversa en una calle con pendiente y tope:** una camioneta sale de una cochera.        | **Maniobra en reversa** (velocidad de reversa con su fuente), **terreno que afecta**: pendiente y un tope                                                                                                                                                | Inventada                                                       |
| 5   | **Salida del camino contra un poste:** curva con acotamiento de terracería.              | **Objeto fijo** (poste), **terreno** (terracería y pendiente; aquí conviene probar «Usar el relieve real del lugar»), **puntos intermedios** de trayectoria (la huella de derrape cruza la carpeta y el acotamiento), deformación medida contra el poste | Inventada                                                       |

Cobertura de lo que pidió René:

| Capacidad                                                        | Dónde             |
| ---------------------------------------------------------------- | ----------------- |
| Medidas de deformación completas (método de CESVI)               | 2 (y 5)           |
| Carambola                                                        | 3                 |
| Terreno que afecta (terracería, pendiente, topes o relieve real) | 4 y 5             |
| Noche y lluvia                                                   | 3 (y 1, de noche) |
| Maniobra en reversa                                              | 4                 |
| Puntos intermedios de trayectoria                                | 5                 |
| Objeto fijo                                                      | 5                 |
| Dos hipótesis                                                    | 2                 |

**Riesgos que Fable revisa al leerlas en producción:**

- Que la 2 dé de verdad dos hipótesis. Salen cuando el reposo supuesto y la deformación medida no caben juntos. Si no salen, hay que ajustar las medidas o quitar los restos, sin inventar nada que la narración no diga.
- Que la 5 se vea bien en el 3D (vehículo contra poste).
- Si alguna deja ver un límite del solver, se cambia por otra que luzca. El límite no se esconde: queda en `docs/` y en los límites del caso.

## Reglas de los textos

- Inventados, con el lenguaje técnico de un reporte de CESVI: lugar, vía, superficie, vehículos, daños con su dirección, medidas, restos, huellas y posiciones finales.
- Sin conclusiones ni velocidades: la narración no las trae (ADR 0060). Sin nombres de personas, placas, aseguradoras ni folios.
- Las calles y los kilómetros son inventados. Los municipios son reales, pero ninguno describe un caso real.

## Borradores

### 2 · Alcance en carretera con la deformación medida

El hecho se ubica en la carretera federal 57, tramo Querétaro–San Luis Potosí, a la altura del km 112+300, municipio de San Luis de la Paz, Guanajuato, aproximadamente a las 16:10 horas. La carretera consta de dos cuerpos separados por un camellón central con vegetación; el cuerpo con sentido de Sur a Norte tiene dos carriles de concreto asfáltico de 3.50 metros cada uno, con acotamiento de 2.50 metros. La superficie se encontraba seca.

Se examinan el vehículo A, marca Nissan, tipo NP300, modelo 2018, color blanco, de servicio particular, y el vehículo B, marca Volkswagen, tipo Vento, modelo 2016, color gris, de servicio particular. El vehículo A presenta en su parte frontal un hundimiento de adelante hacia atrás que afecta defensa, fascia, cofre, parrilla y radiador; se midió la deformación a lo ancho del frente con seis medidas a separación uniforme: C1 = 0.18 m, C2 = 0.24 m, C3 = 0.29 m, C4 = 0.31 m, C5 = 0.27 m y C6 = 0.20 m, con un ancho de daño L = 1.52 m. El vehículo B presenta en su parte posterior un hundimiento de atrás hacia adelante que afecta defensa trasera, cajuela, calaveras y panel trasero, con medidas C1 = 0.22 m, C2 = 0.30 m, C3 = 0.36 m, C4 = 0.38 m, C5 = 0.33 m y C6 = 0.25 m, y L = 1.45 m. Las zonas de contacto corresponden entre sí: la parte frontal del vehículo A con la parte posterior del vehículo B.

Se localizan restos de plástico y vidrio en el carril de baja velocidad, en una franja de 6.80 metros de largo que inicia 3.20 metros antes del acotamiento. Los vehículos fueron retirados del lugar antes de la inspección, por lo que no se cuenta con sus posiciones finales.

### 3 · Carambola de noche con lluvia

El hecho se ubica en el Boulevard de los Pinos, a la altura del número 2400, colonia Valle Alto, municipio de Monterrey, Nuevo León, aproximadamente a las 21:45 horas. El boulevard consta de un arroyo de tres carriles con sentido de Poniente a Oriente, de concreto hidráulico, con iluminación artificial funcionando. Al momento del hecho se registraba lluvia ligera y la carpeta se encontraba mojada.

Se examinan tres vehículos de servicio particular que circulaban por el carril central, en este orden de adelante hacia atrás: el vehículo A, marca Chevrolet, tipo Aveo, modelo 2015, color rojo; el vehículo B, marca Toyota, tipo Corolla, modelo 2019, color blanco; y el vehículo C, marca Ford, tipo Ranger, modelo 2012, color negro. El vehículo C presenta en su parte frontal un hundimiento de adelante hacia atrás sobre defensa, parrilla y cofre. El vehículo B presenta en su parte posterior un hundimiento de atrás hacia adelante sobre defensa, cajuela y calaveras, y en su parte frontal un hundimiento de adelante hacia atrás sobre defensa y fascia. El vehículo A presenta en su parte posterior un hundimiento de atrás hacia adelante sobre defensa y cajuela. Las zonas de contacto corresponden: la parte frontal del vehículo C con la parte posterior del vehículo B, y la parte frontal del vehículo B con la parte posterior del vehículo A.

Se localizan restos de plástico y vidrio sobre el carril central. El vehículo A quedó en el carril central, 14 metros adelante del inicio de los restos; el vehículo B, en el mismo carril, a 6 metros; y el vehículo C, sobre el área de restos, ligeramente orientado hacia el carril derecho.

### 4 · Reversa en una calle con pendiente y tope

El hecho se ubica en la calle Cerro del Fortín, frente al número 85, colonia Lomas del Valle, municipio de Puebla, Puebla, aproximadamente a las 08:20 horas. La calle consta de un arroyo de dos carriles de concreto asfáltico, uno por sentido, con pendiente descendente hacia el Norte; 12 metros al Sur del acceso del número 85 se encuentra un reductor de velocidad tipo tope de 0.10 metros de alto y 1.80 metros de ancho. La superficie se encontraba seca.

Se examinan el vehículo A, marca Honda, tipo CR-V, modelo 2017, color plata, de servicio particular, que salía en reversa del acceso vehicular del número 85 hacia la calle, y el vehículo B, marca Nissan, tipo Versa, modelo 2020, color azul, de servicio particular, que circulaba de Sur a Norte. El vehículo A presenta en su parte posterior derecha un hundimiento de atrás hacia adelante y de derecha a izquierda sobre defensa y calavera. El vehículo B presenta en su costado izquierdo, a la altura de la puerta delantera, un hundimiento de izquierda a derecha con desprendimiento de pintura. Las zonas de contacto corresponden: la parte posterior del vehículo A con el costado izquierdo del vehículo B.

El vehículo A quedó con su parte posterior sobre el carril con sentido al Norte, a 2.40 metros del acceso; el vehículo B quedó 7 metros al Norte del área de contacto, junto a la guarnición.

### 5 · Salida del camino contra un poste

El hecho se ubica en la carretera estatal 15, tramo San Martín–Atlixco, a la altura del km 23+600, municipio de Tianguismanalco, Puebla, aproximadamente a las 06:40 horas. La carretera consta de un arroyo de dos carriles de concreto asfáltico, uno por sentido, en curva hacia la izquierda en el sentido de Norte a Sur, con acotamiento de terracería de 2.00 metros de ancho y pendiente descendente en el mismo sentido. La superficie se encontraba seca.

Se examina el vehículo A, marca Mazda, tipo 3, modelo 2014, color gris, de servicio particular. Sobre la carpeta se localiza una huella de derrape de 18.40 metros que inicia en el carril con sentido al Sur, cruza el borde derecho de la carpeta y continúa 9.60 metros sobre el acotamiento de terracería, hasta un poste de concreto de la línea de distribución eléctrica situado a 1.50 metros del borde. El vehículo A presenta en su parte frontal derecha un hundimiento de adelante hacia atrás y de derecha a izquierda, de forma semicircular coincidente con el poste, que afecta defensa, fascia, salpicadera derecha y cofre; deformación medida C1 = 0.05 m, C2 = 0.12 m, C3 = 0.20 m, C4 = 0.31 m, C5 = 0.42 m y C6 = 0.51 m, con L = 0.95 m.

El vehículo A quedó en contacto con el poste, orientado hacia el Suroeste.

## Costo esperado

Las 10 lecturas de narraciones grabadas en `data/cesvi/grabaciones/escenas/` costaron 0.0288 USD en la mediana y 0.0734 USD como máximo (su campo `costo_usd`). Con cuatro narraciones y hasta tres lecturas de cada una mientras se pulen, el peor caso es de unos 0.90 USD (12 × 0.0734); lo esperado, unos 0.35 USD. Va contra el tope de W9: 1.41 de 20 USD gastados (`eval/results/w9_gasto.json`). Cada lectura buena se graba como las de `data/cesvi/grabaciones/escenas/` y la app la usa desde la caché, sin volver a llamar a Claude.
