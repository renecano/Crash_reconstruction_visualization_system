# Croquis para CESVI · plan de la versión real

> Este plan sustituye al prototipo (`docs/cesvi/PROTOTIPO.md`, que queda como historial) y manda sobre `PLAN.md` en lo que se contradigan. `PLAN.md` sigue valiendo para lo que ya está construido (solver, contrato, evaluaciones E1–E8) y para lo que este plan no toca. Las reglas de trabajo siguen en `CLAUDE.md`, sección «Para quién y qué tan lejos».

## 1. Qué es y para quién

**Croquis es la mesa de trabajo del perito de CESVI.** El perito abre un caso nuevo o carga un dictamen y hace cuatro cosas:
1. Describe el hecho con lenguaje técnico.
2. Ubica el lugar y coloca los vehículos en el mapa.
3. Registra los daños.
4. Revisa la correspondencia y los cálculos.

Croquis le sugiere si la versión declarada se sostiene, con sus razones; el perito confirma, corrige y firma. Al final sale un dictamen con la estructura de CESVI.

La primera versión real debe poder:
1. Atender **cualquier caso nuevo**, no solo el de AXA, de cualquier modalidad.
2. **Cargar un dictamen** (PDF, Markdown o texto) y llenar el expediente, que el perito revisa.
3. Atender **carambolas**: más de dos vehículos e impactos múltiples.

**Usuario:** el perito de CESVI. Opina sobre lo que ve, no sobre lo técnico; las decisiones técnicas las toma Claude Code (CLAUDE.md, Autonomía).

## 2. Lo que dicen los 671 dictámenes (y por qué cambia el foco)

Un conteo preliminar por palabras clave sobre los lotes de `data/raw/cesvi/` dio esto. **Es aproximado y no va en ningún documento hasta que `eval/` lo mida** (regla 3 de CLAUDE.md):

- **Correspondencia de daños:** casi todos los dictámenes la analizan.
  - Dirección del daño y forma: en casi 9 de cada 10.
  - Magnitud: en 2 de cada 3.
  - Altura de los daños: en cerca de la mitad.
  - Intercambio de material: en cerca de 6 de cada 10.
- **Daño previo u óxido:** cerca de 1 de cada 4 lo revisa.
- **Bolsas de aire:** cerca de 1 de cada 4 las menciona.
- **Fotografías:** casi todos las usan.
- **Cálculos de velocidad (McHenry, EBS, desplazamiento, huellas, cantidad de movimiento):** solo una minoría pequeña.
- **Tres o más vehículos:** poco frecuente, pero presente.

**Conclusión:** el corazón del trabajo de CESVI es la **correspondencia de daños**: si la forma, la altura, la dirección y la magnitud de los daños de un vehículo corresponden con las del otro, y con la dinámica que declara el conductor. Los cálculos de velocidad son apoyo en pocos casos. La versión real se construye alrededor de la correspondencia, con los cálculos como módulo.

## 3. Datos

- **Licencia:** René confirmó que los dictámenes que entregó CESVI son de uso libre para este proyecto. Muchos son casos elaborados por CESVI con ese fin, con cálculos correctos.
  - Se pueden usar en fixtures, pruebas, evaluaciones y demos.
  - Regístralo en `data/SOURCES.md` con esa declaración y la fecha.
  - Los lotes crudos siguen fuera de git, por tamaño.
- **Corpus estructurado (fase C0):** un script en `data/` convierte cada dictamen en un registro JSON:
  - modalidad, vehículos, daños por vehículo (zona, dirección, altura, magnitud);
  - versión declarada, evidencias, cálculos con sus valores, criterios analizados;
  - conclusión (se sostiene / no se sostiene / parcial / sin juicio);
  - la cita del texto de donde sale cada campo.
  - Se hace con Claude y salida estructurada, con caché y semilla, y se valida contra el esquema. El costo estimado y el real se anotan en PROGRESS.
- **Partición fija:** entrenamiento/desarrollo y prueba congelada (30 %, estratificada por modalidad y conclusión). La prueba no se mira para ajustar nada; se congela como Relatos-MX.
- **Etiquetas de la conclusión:** las propone Claude con su cita. Claude Code revisa a mano una muestra estratificada y reporta la concordancia en `eval/results/`. Si es baja, se corrige el extractor antes de usar las etiquetas.

## 4. Modelo: el expediente (contrato v2)

Amplía `escena.schema.json`, que sigue siendo el único contrato, con migración desde v1.3. Zod y Pydantic se generan.

- **Caso:** aseguradora, siniestro, fecha y hora, lugar (coordenadas, vía, carriles), modalidad o modalidades, perito.
- **Vehículos 1..N:** marca, modelo, año, clase, masa (con fuente), rigidez A y B (con fuente: dictamen, tabla CESVI o NHTSA E2), altura de defensas si se mide.
- **Daños por vehículo:** zona en un diagrama estándar (frontal, posterior, lateral izquierdo o derecho, con tercios y vértices); altura mínima y máxima desde el piso (cm); dirección de la deformación; magnitud o medidas C1–C6 y L; intercambio de material (color y sobre qué zona); daño previo u óxido; fotos referenciadas.
- **Impactos 1..M, con orden:** qué vehículos o qué objeto fijo, zonas de contacto, punto en el mapa, momento en la secuencia. Una carambola es M > 1.
- **Versiones:**
  - la de la evidencia, que arma el perito;
  - una por cada declaración de conductor (cita literal y maniobras extraídas);
  - en cada una: posiciones inicial, de impacto y final de cada vehículo.
- **Evidencias del lugar:** restos (inicio, fin, longitud), huellas de frenado o derrape, posiciones finales, objetos fijos dañados.
- **Fuente por dato:** perito, conductor, expediente, dictamen importado, supuesto o mapa, con su cita cuando aplique.
- **Resultado:** criterios de correspondencia, cálculos, sugerencia, decisión del perito, quién validó y cuándo, y la huella de las entradas.

## 5. Fases

Cada fase se cierra con su criterio en verde, merge y despliegue, y con su resumen en PROGRESS (CLAUDE.md, Flujo por fase). Las evaluaciones son scripts en `eval/` que se corren a mano al cerrar la fase; no bloquean CI.

### C0 · Corpus y contrato v2
- Contrato v2 con migración y un validador semántico para lo nuevo (N vehículos, M impactos, versiones).
- Corpus estructurado de los 671 dictámenes, con partición y etiquetas (§3).
- Glosario técnico de CESVI con frecuencias, derivado del corpus; lo usan los prompts.
- Medición en `eval/results/cesvi_corpus.json` de las proporciones del §2. Desde aquí, esas cifras sí se pueden citar.
- **Listo cuando:** el corpus valida al 100 % contra el esquema (los que no validan quedan listados con su motivo), la concordancia de las etiquetas está medida y existe la partición congelada.

### C1 · Motor de cálculo CESVI completo
- Métodos que aparecen en el corpus, cada uno con fórmula sustituida, unidades y fuente:
  - McHenry de 2, 4 y 6 medidas;
  - EBS y velocidad de impacto;
  - desplazamiento √(2·a·g·D);
  - frenado por huellas √(2·μ·g·d);
  - cantidad de movimiento, para dos vehículos y por impacto en carambolas;
  - umbral de activación de bolsas de aire;
  - comparación con pruebas de choque de CESVI.
  - Los umbrales y las referencias se toman de lo que cite el corpus, con su cita; no se inventan.
- Rigidez A y B por vehículo: la del dictamen si viene, si no la tabla que CESVI dé, y si no NHTSA E2 marcada como tal. El perito puede cambiarla.
- **Evaluación E-C1, reproducción:** todo dictamen del corpus que imprime entradas y resultados se recalcula. Se reporta cuántos reproduce dentro de 0.5 %, cuántos no y por qué (dato que no se imprime, errata, OCR). Ningún ajuste para que cuadre.
- **Listo cuando:** cada método tiene pruebas unitarias con casos del corpus y E-C1 está corrida.

### C2 · Motor de correspondencia (el núcleo)
- Criterios con estado (corresponde / no corresponde / sin dato) y la evidencia de cada uno:
  - **Altura:** los rangos de altura de los daños de los dos vehículos se traslapan, con la tolerancia por cabeceo al frenar documentada.
  - **Forma:** la geometría del daño corresponde al otro vehículo o al objeto fijo (defensa, poste, muro, esquina).
  - **Dirección:** la dirección de la deformación de cada vehículo concuerda con el movimiento relativo de la versión analizada (por ejemplo, de atrás hacia adelante en un alcance).
  - **Magnitud:** la energía o la profundidad del daño concuerda con las velocidades de la versión; usa C1 cuando hay medidas.
  - **Intercambio de material:** el color y la zona de la transferencia corresponden.
  - **Daño previo:** óxido o daños sin relación con el hecho.
  - **Lugar:** el lugar y las evidencias explican el daño.
- Reglas deterministas en TS. La IA no decide criterios: solo extrae datos y redacta. Cada regla documenta de qué patrón del corpus sale.
- **Listo cuando:** pruebas unitarias por criterio con casos del corpus de entrenamiento.

### C3 · Caso nuevo, de cualquier modalidad
- Generaliza el recorrido y el modo trabajo, que ya existen, a N vehículos y cualquier modalidad: alcance, lateral, frontal, reversa, volcadura, contra objeto fijo y las demás que aparezcan en el corpus.
- Paso «El hecho»: la descripción técnica del perito y las declaraciones (ya construido), ahora para N vehículos y M impactos.
- Paso «Daños»: diagrama de zonas por vehículo con altura, dirección, magnitud e intercambio de material, más carga de fotos asociadas a cada daño.
- Guardado de casos en el dispositivo (IndexedDB): lista de casos, duplicar, borrar, y exportar e importar el caso en JSON. Las fotos se guardan con el caso.
- **Listo cuando:** la e2e en Chromium crea un caso nuevo de una modalidad distinta al alcance, de principio a fin, y exporta su dictamen.

### C4 · Cargar un dictamen
- Acepta PDF, Markdown o texto. El PDF se manda a Claude como documento (texto e imágenes, incluidas las fórmulas como imagen), con salida estructurada al expediente v2 y la página y la cita de cada campo.
- Pantalla de revisión: cada campo con su cita resaltada; el perito acepta o corrige; lo que falta queda punteado.
- **Evaluación E-C4, extracción:** sobre la prueba congelada, exactitud por campo (modalidad, vehículos, zonas, alturas, valores de cálculo, conclusión) contra el corpus estructurado revisado. Los PDF originales se evalúan cuando René los consiga (ver §7); mientras, se evalúa con Markdown.
- **Listo cuando:** importar cualquier dictamen del corpus abre su caso completo en el recorrido y E-C4 está corrida.

### C5 · Carambolas
- **Croquis:** N vehículos, impactos numerados (X1, X2…) en el mapa y en la línea de tiempo.
- **Correspondencia y cálculos:** por impacto.
- **Solver:** impactos en secuencia en Python (la referencia), port a TS y pruebas de paridad (CLAUDE.md, Reglas técnicas). Arreglar de paso que los cuerpos no se atraviesen en el croquis.
- **Listo cuando:** los dictámenes del corpus con 3 o más vehículos se cargan y se reconstruyen, con una e2e de una carambola.

### C6 · Sugerencia de veredicto
- Combina los criterios de C2 con los cálculos de C1 en una sugerencia («se sostiene», «no se sostiene», «parcialmente», «sin datos suficientes»). Cada razón lleva el enlace a su paso.
- **Evaluación E-C6:** sobre la prueba congelada, concordancia con la conclusión de CESVI y matriz de confusión.
  - **Contra dos líneas base:** decir siempre la clase más frecuente, y una regla de solo zonas de daño. Si no supera la línea base de la clase más frecuente, se dice así.
  - **Lo que no se hace:** ajustar con la prueba congelada.
- **Listo cuando:** E-C6 está corrida y publicada en `eval/results/` con sus líneas base.

### C7 · Dictamen para cualquier caso
- Plantilla con la estructura de CESVI: título con la modalidad, objetivo, fundamentos, características, observación de daños, lugar, consideraciones, conclusiones numeradas y validación.
- Variantes por modalidad, sacadas del corpus.
- Consideraciones redactadas por Claude con los números del motor, marcadas como borrador hasta que el perito las acepte.
- PDF y Word (.docx).
- Trazabilidad (ya diseñada en el paso 8).
- **Listo cuando:** la e2e exporta el PDF y el Word de un caso nuevo y de uno importado.

### C8 · Endurecimiento y lo que diga CESVI
- Lo anotado en «Endurecimiento pendiente».
- Los cambios que pida CESVI después de ver la demo.

**Orden:** C0 → C1 → C2 → C3 → C4 → C6 → C5 → C7 → C8. C0 va primero porque el corpus alimenta las pruebas de todo lo demás. C5 va después de C6 porque las carambolas son poco frecuentes, pero no se recorta.

## 6. Lo que no entra en esta versión

El visor 3D y la portada (en pausa), cuentas de usuario y nube para los casos (se decide con CESVI), el chat de «Preguntar», el dictado por voz y la app móvil. Se anotan como pendientes, no se borran.

## 7. Bloqueado: necesita a René

- PDF originales de algunos dictámenes, para evaluar la carga de PDF con imágenes y fórmulas.
- Tabla de coeficientes de rigidez A y B que usa CESVI, si la tienen.
- PDF original u hoja de cálculo del dictamen de AXA (diferencia de energía).
- Comentarios de CESVI tras la demo.
- Saldo de la API de Claude para procesar el corpus en C0 (Claude Code estima el costo antes de correrlo).
