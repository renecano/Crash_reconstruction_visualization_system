# Prototipo CESVI v0: reproducir un dictamen real

> Especificación del prototipo que se mostrará a CESVI México. Mientras dure el "Modo prototipo CESVI" de `CLAUDE.md`, este documento manda sobre `PLAN.md` en lo que se contradigan. El plan completo para CESVI se escribirá después.

## Objetivo

Que un perito de CESVI vea en Croquis **uno de sus propios dictámenes reproducido**, con sus mismos datos, su mismo método y sus mismos números (casi idénticos), y que vea lo que Croquis agrega: el lugar en un mapa real, el croquis de la versión declarada contra la versión de la evidencia, los cálculos verificables y el dictamen exportable.

**Usuario:** el perito o analista de CESVI, no la persona que tuvo el choque.
**Papel de Croquis:** propone y calcula; el perito valida, corrige y firma. Croquis sugiere si la versión declarada se sostiene, siempre con sus razones, y el perito confirma o cambia la conclusión.

## Datos

- **Los dictámenes de CESVI** están en `data/raw/cesvi/` (ignorado por git: nunca se suben). Son 4 lotes en Markdown (OCR de los PDF, 671 documentos separados por encabezados `# Document: <archivo>`), más dos PDF de contexto técnico y el *Manual de Proyecto Geométrico de Carreteras* de la SCT (2018).
- **Permiso:** René confirmó que CESVI permite usar todos los datos de sus reportes. Aun así, el repositorio solo guarda datos derivados del caso (por ejemplo, el JSON del caso) y no los documentos originales.
- **Datos personales:** placas, VIN, nombres de personas y de peritos no van ni en el repositorio, ni en el fixture, ni en la demo desplegada. Se muestran como "omitido". La demo en Vercel va con protección de acceso (Deployment Protection o contraseña) porque es un caso real.
- **Fixture del caso:** crea `data/cesvi/casos/A2010930.json` con los datos de abajo, y una prueba que verifique cada valor contra el texto del lote.

## El caso: AXA, siniestro A2010930

Fuente: `crash_reports_batch_01.md`, documento `AXA SINIESTRO A2010930.pdf`. Es el único de los lotes que imprime todos los datos de entrada y los resultados del cálculo de McHenry.

**Datos del siniestro**
- Modalidad dictaminada: alcance.
- Fecha y hora: 17 de junio de 2010, ~11:30 h. Dictamen emitido el 30 de junio de 2010 por un perito de CESVI (nombre omitido).
- Lugar: carretera Internacional México-Nogales, km 47+800, tramo Los Mochis–Navojoa, Ahome, Sinaloa.
- Vía: 2 arroyos (sur→norte hacia Navojoa y norte→sur hacia Los Mochis), cada uno de 6.47 m, separados por terracería y hierbas en la parte central; el sentido sur→norte con carpeta reciente y líneas discontinuas blancas.
- Aseguradora: AXA.
- Objetivo del dictamen: determinar si los daños corresponden a una maniobra en reversa.

**Vehículos**
- **A:** Chevrolet Silverado 2500, 2007, arena, placas omitidas, particular. Daño posterior con acentuación al vértice posterior izquierdo; tapa de batea desacoplada; batea desplazada de izquierda a derecha y de atrás hacia adelante.
- **B:** Toyota Tacoma, 1997, blanco, placas no disponibles en el reporte, particular. Daño frontal considerable, de adelante hacia atrás, con acentuación al lado derecho; bolsa de aire del conductor activada; cinturón sin tensar. Masa usada en el cálculo: 1,431.083 kg.

**Declaración del conductor de A (literal):** "venia de sur a norte cuando vi un accidente de un tráiler y me pare, reversie unos metros cuando llego la camioneta y me impacto".

**Evidencia en el lugar:** restos de ambos vehículos sobre el extremo izquierdo, con 15.89 m entre el primero y el último.

**Cálculo 1, energía de deformación de la Tacoma (McHenry, 4 medidas):**
- L = 1.689 m; A = 55.405; B = 385.336 (unidades como las imprime el reporte; energía en kJ y masa en t, consistentes).
- C1 = 0.96 m, C2 = 0.86 m, C3 = 0.52 m, C4 = 0.20 m.
- Reporte: E deformación = 220.1900228; EBS = √(2·E/m) = 17.5420 m/s = **63.15 km/h**.

**Cálculo 2, velocidad por desplazamiento:** V3 = √(2·a·g·D) con D = 15.89 m, a = 0.9, g = 9.8 m/s² → 16.74 m/s = **60.27 km/h**.

**Conclusiones del reporte:**
1. Por la magnitud y profundidad de los daños de la Tacoma, su velocidad de impacto es de 63.15 km/h.
2. Por la separación de los restos y la posición final de la Silverado, esta fue impactada por alcance a 60.27 km/h.
3. La modalidad es un alcance de la Tacoma a la Silverado.
4. Los hechos no sucedieron como los declara el conductor de la Silverado.

Razonamiento clave del reporte: las dos velocidades no difieren de forma significativa; una reversa no habría producido 15.89 m de desplazamiento; y en una reversa los daños estarían centrados en la parte posterior de A y en el frente de B, pero aparecen con acentuación al lado izquierdo de A y al derecho de B (maniobra evasiva).

### Discrepancia conocida: hay que investigarla, no ajustarla

Con la fórmula de 4 medidas que el propio reporte escribe, los datos impresos dan **E = 225.454** (no 220.190) y **63.90 km/h** (no 63.15, +1.2 %). El paso de energía a velocidad del reporte sí es exacto (√(2·220.1900228/1.431083) = 17.5420 m/s).
- Revisa las causas posibles (redondeo de las C impresas, OCR, una variante de la fórmula en la imagen del PDF original) y documéntalas en un ADR.
- **No ajustes coeficientes ni fórmulas para que cuadre.** La interfaz muestra las dos cosas: el resultado con los datos impresos (+1.2 %) y el resultado partiendo de la energía del reporte (exacto). Así el perito ve exactamente dónde difiere.
- Agrégalo a la lista de preguntas para CESVI (pedir el PDF original o su hoja de cálculo).

## Qué construir, en este orden (cada hito se despliega en cuanto funciona)

**Hito 1. El caso y sus cálculos (lo primero que se puede mostrar).**
- Página `/cesvi` con el expediente del caso: datos del siniestro, vehículos, declaración literal y evidencia.
- Módulo de cálculo con el método de CESVI: McHenry de 2, 4 y 6 medidas (la de 6 corregida a la forma de libro, porque la impresa tiene erratas evidentes; documentarlo), EBS, velocidad de impacto, velocidad por desplazamiento √(2·a·g·D), y la comparación entre velocidades con un umbral de "diferencia significativa" que el perito puede cambiar.
- Cada fórmula se muestra con los valores sustituidos, como en el reporte.
- **Tabla "Reproducción del dictamen":** cada número del reporte junto al de Croquis, con la diferencia absoluta y en porcentaje.
- El cálculo propio de Croquis (rigidez NHTSA con su intervalo) aparece aparte, como segunda opinión, sin reemplazar al de CESVI.

**Hito 2. El lugar y el croquis sobre el mapa.**
- Mapa con MapLibre GL y mosaicos vectoriales gratuitos (la versión con privacidad completa queda para después). El perito busca o toca el punto (km 47+800, Ahome) y se importan las calles de OSM como hoy.
- **Croquis a escala sobre el mapa con dos versiones:**
  - *Versión declarada:* A detenido, retrocede unos metros y B lo impacta, como las imágenes 1–3 del reporte.
  - *Versión de la evidencia:* alcance de B a A.
- **Herramientas del perito:** mover y girar cada vehículo y marcar su posición inicial, punto de impacto (X naranja de la marca) y posición final; dibujar la zona de restos (inicio y fin) y medir distancias en metros sobre el mapa. Las posiciones que marca el perito quedan con fuente `perito`.
- La distancia de los restos que mide el perito alimenta el cálculo 2.

**Hito 3. Correspondencia, sugerencia y dictamen exportable.**
- **Lista de criterios de CESVI** por vehículo: intercambio de material, forma, altura, magnitud, dirección del daño, daño previo y si el lugar explica el daño. El perito marca cada uno, con una nota.
- **Diagrama de zonas de daño** por vehículo (por ejemplo, A: posterior izquierda; B: frontal derecha).
- **Sugerencia de Croquis:** a partir de los cálculos, el desplazamiento y la ubicación de los daños, propone si la versión declarada se sostiene, con cada razón ligada a su evidencia. El perito la acepta, la edita o la rechaza; el dictamen registra quién validó y cuándo.
- **Borrador de las consideraciones** redactado con Claude en el estilo de los dictámenes de CESVI, siempre marcado como borrador y editable por el perito. Claude no calcula números: los toma del módulo de cálculo.
- **Exportar el dictamen a PDF** con la estructura de CESVI: título con la modalidad, objetivos, fundamentos, características de los vehículos, observación de daños, lugar de los hechos con el croquis sobre el mapa, consideraciones (declaración, dinámica declarada, análisis de deformaciones con los cálculos sustituidos, desplazamiento, correspondencia), conclusiones numeradas y validación del perito.
- Leyenda: "Elaborado con apoyo de Croquis. El dictamen es responsabilidad del perito que lo firma."

## Fuera del prototipo (pospuesto, no borrado)

El visor 3D, la portada y la historia, las evaluaciones largas, las pruebas en varios navegadores, las capturas de referencia, la versión del mapa con mosaicos propios, la importación automática de cualquier dictamen y los demás pendientes ya acordados (interpenetración, impactos múltiples, generalidad). Todo va a "Endurecimiento pendiente" en `docs/PROGRESS.md`.

## Siguientes casos (después del primero)

- `Siniestro 33002049.pdf` (lote 4): Ecosport contra el muro del puente Armería, 6 medidas, dos impactos (el segundo estimado por comparación con un choque de prueba de CESVI a 16 km/h).
- `Siniestro  6011-00229-7.pdf` (lote 3): Ecosport estática; usa el umbral de activación de bolsas de aire.

En los dos el reporte no imprime L, A ni B (la fórmula está como imagen), así que habrá que pedirle esos datos o el PDF original a CESVI.

## Criterio de "listo para mostrar"

- El caso A2010930 abre en `/cesvi` desplegado en Vercel.
- La tabla de reproducción muestra el 60.27 km/h exacto, el 63.15 km/h exacto partiendo de la energía del reporte, y la discrepancia de la energía explicada.
- El croquis sobre el mapa muestra las dos versiones con posiciones editables por el perito.
- El dictamen se exporta a PDF con la estructura de CESVI.
- Pruebas: unitarias de las fórmulas con los números del caso y una e2e del flujo en Chromium.
