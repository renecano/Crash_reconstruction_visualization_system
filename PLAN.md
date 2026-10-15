# Croquis — Plan maestro

> Reconstrucción 3D de percances viales a partir del relato de quien los vivió.
> Este documento es la especificación que Claude Code sigue fase por fase. Las reglas permanentes de trabajo están en `CLAUDE.md`.

**Nombre de trabajo:** *Croquis* (el dibujo del percance que se hace en el parte de tránsito en México). Se puede cambiar; ver "Decisiones abiertas".

---

## 0. Resumen en una página

El usuario cuenta lo que pasó, con sus palabras ("iba por Tollocan, el de la camioneta gris se me cerró y le di por el lado del copiloto, estaba lloviendo"). Croquis:

1. **Entiende** el relato con un LLM y lo convierte en una escena estructurada (`EscenaSpec`). Cada dato queda ligado a la frase del relato de donde salió, o marcado como supuesto.
2. **Pregunta** solo lo que más cambia el resultado (preguntas priorizadas por sensibilidad física, no por una lista fija).
3. **Muestra un croquis 2D editable** para que el usuario corrija posiciones, carriles y trayectorias arrastrando.
4. **Reconstruye la física** con un solver propio: cinemática previa, impulso del impacto, energía de deformación (CRASH3), trayectorias hasta el reposo, proyección de peatones y cinemática de ocupantes. Lo desconocido se resuelve con rangos (Monte Carlo) y por inversión (a partir de daños y posiciones finales).
5. **Visualiza en 3D** en el navegador: tipo y color de vehículos, vía, árboles, postes, clima, hora y luz, personas, deformación de carrocería, vidrios, piezas desprendidas, marcas de llanta. Con línea de tiempo, cámara lenta, vista del conductor y comparación de hipótesis.
6. **Exporta** informe PDF, video y escena glTF, siempre marcados como reconstrucción ilustrativa.

Regla central: **la IA traduce, la física decide y el visor muestra.** El LLM nunca genera geometría ni movimiento.

---

## 1. Problema y fuentes

- México registró 340,415 accidentes de tránsito en zonas urbanas y suburbanas en 2021 (INEGI, ATUS). El Estado de México fue la entidad con más víctimas mortales ese año.
- INEGI ya publicó las cifras ATUS 2025: los choques con motocicleta y las volcaduras aumentaron, y también las muertes de peatones y pasajeros. **Tarea de F0:** descargar los datos abiertos ATUS más recientes y reemplazar estas cifras por números calculados desde el archivo, con script reproducible en `data/`.
- Después de un percance, quien lo vivió tiene que explicarlo (a su aseguradora, al ajustador, al otro conductor, a su familia) con palabras y, a lo mucho, un croquis a mano. Las herramientas profesionales de reconstrucción (PC-Crash, Virtual CRASH, HVE) son caras, cerradas y para peritos; las animaciones genéricas no respetan la física.

**Usuario principal:** persona involucrada en un percance que quiere entender y mostrar qué pasó.
**Usuario secundario:** ajustador o estudiante de seguridad vial que quiere explorar hipótesis ("¿y si iba a 60 en vez de 40?").

**Lo que Croquis NO es:** un peritaje, una prueba legal ni un dictamen de responsabilidad. Esto se muestra en la interfaz y en cada exportación (ver §10).

---

## 2. Principios no negociables

1. **La IA traduce, la física decide.** El LLM produce `EscenaSpec`; el solver determinista produce el movimiento; el visor solo dibuja lo que el solver calculó.
2. **Todo supuesto es visible y editable.** Cada campo lleva `fuente` (`relato` | `usuario` | `supuesto` | `default`), `confianza` y, si viene del relato, el fragmento exacto (offsets) que lo respalda.
3. **Rangos antes que números falsos.** Lo incierto se representa como distribución; los resultados se muestran con intervalo.
4. **Reproducible por semilla.** Misma `EscenaSpec` + misma semilla ⇒ misma reconstrucción, bit a bit, en cualquier navegador (Rapier WASM es determinista entre plataformas).
5. **La demo no se cae.** El solver corre también en el navegador (port TS con pruebas de paridad) y hay casos precargados que funcionan sin servidor ni API.
6. **Toda cifra del README sale de un script en `eval/`** con su salida versionada. Nada se afirma sin medirse.
7. **Nunca se asigna culpa ni se diagnostican lesiones.** Ver §10.

---

## 3. Arquitectura

```
 Relato (texto / voz)
        │
        ▼
 ┌──────────────────┐   PII fuera antes de salir del dispositivo (nombres, placas, teléfonos)
 │ Redactor PII     │
 └────────┬─────────┘
          ▼
 ┌──────────────────┐   Claude API, salida estructurada con JSON Schema (strict)
 │ Extractor LLM    │──► EscenaSpec v1 + evidencia por campo
 └────────┬─────────┘
          ▼
 ┌──────────────────┐   valida esquema, unidades, rangos físicos y contradicciones
 │ Validador        │──► preguntas priorizadas por sensibilidad
 └────────┬─────────┘
          ▼
 ┌──────────────────┐   el usuario corrige arrastrando; sincronizado con EscenaSpec
 │ Croquis 2D       │
 └────────┬─────────┘
          ▼
 ┌──────────────────────────────────────────────────────────┐
 │ Solver de reconstrucción (referencia Python + port TS)   │
 │  pre-impacto · impulso · CRASH3 · post-impacto · peatón  │
 │  ocupantes · volcadura · inversión · Monte Carlo         │
 └────────┬─────────────────────────────────────────────────┘
          ▼  Resultado: trayectorias, impulsos, ΔV, perfiles C1–C6,
          │  eventos, rangos, banderas de inconsistencia
          ▼
 ┌──────────────────┐   ┌──────────────┐   ┌───────────────┐
 │ Visor 3D (R3F)   │   │ Informe PDF  │   │ Video / glTF  │
 └──────────────────┘   └──────────────┘   └───────────────┘

 Fuera de línea: validación del daño contra autos reales chocados (NHTSA y CISS), ver E5
```

### 3.1 Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Web | Next.js (App Router) + React 19 + TypeScript estricto | Mismo ecosistema de PackFlow; SSR para la página de historia |
| 3D | three.js con `WebGPURenderer` y respaldo WebGL, React Three Fiber v9, drei | R3F v9 acepta el renderer WebGPU vía `gl` asíncrono; TSL compila sombreadores a WGSL y GLSL |
| Física visual | Rapier (`@react-three/rapier` v2, WASM) | Determinista entre plataformas; ragdolls, piezas, volcaduras |
| Croquis 2D | SVG con React (o Konva si el rendimiento lo exige; decidir en ADR) | Editable, exportable |
| Esquema | JSON Schema como fuente única → genera Zod (TS) y Pydantic (Python) | Un solo contrato |
| Solver referencia | Python 3.12, NumPy, SciPy, `uv` | Precisión, validación, notebooks de evaluación |
| Solver navegador | TypeScript puro en `packages/solver-ts`, corriendo en Web Workers | Es el solver de producción: todos los módulos de §6 (incluidos inversión y Monte Carlo); paridad probada contra Python |
| API | Route Handlers de Next.js en TypeScript (`apps/web/app/api/`) | Extracción con Claude, validación, límite de peticiones; se despliega junto con la web en Vercel |
| Almacenamiento | Navegador (IndexedDB) por defecto; con consentimiento, Vercel Blob o una base del Marketplace de Vercel; límite de peticiones con Upstash Redis del Marketplace | Sin servidores propios; decidir en ADR |
| LLM | Claude API con salida estructurada (JSON outputs / strict tool use) | Garantiza JSON válido; la exactitud se mide aparte |
| Assets | Blender en modo headless (scripts Python) → glTF con Draco/meshopt | Pipeline reproducible y con licencias |
| Pruebas | pytest + Hypothesis, Vitest, Playwright (incluye snapshots visuales) | Leyes físicas como propiedades; regresiones visuales |
| Infra | **Todo en Vercel** (web + API), con entornos de preview y producción | Un solo despliegue; sin AWS |
| CI | GitHub Actions | lint, tipos, pruebas, paridad, evaluación rápida |

**Versiones:** al instalar, usar la versión estable vigente de cada paquete y registrarla en `docs/adr/0001-stack.md`. No fijar versiones copiadas de este plan.

**Despliegue solo en Vercel:** en producción no corre Python. El solver Python es la referencia para pruebas, paridad y evaluaciones (local y CI); el usuario siempre usa el port TS. El PDF se genera en el navegador. Si alguna función del servidor necesitara Python, primero se intenta en TS; Python en Vercel (runtime beta) solo con ADR que justifique por qué.

**Restricción de hardware:** desarrollo en Windows con 8 GB de RAM. Scripts compatibles con PowerShell; presupuestos de rendimiento medidos en esa laptop (ver §7.8).

### 3.2 Estructura del repo

```
croquis/
├─ apps/
│  └─ web/                    Next.js: historia, demo, app, visor y app/api/ (Route Handlers)
├─ packages/
│  ├─ scene-schema/           escena.schema.json + generadores Zod/Pydantic + fixtures
│  ├─ solver-ts/              solver de producción (port TS, Web Workers)
│  ├─ extraction/             prompts, redactor PII, verificador, glosario, preguntas (TS)
│  ├─ viewer/                 componentes R3F (vía, vehículos, daño, personas, clima)
│  └─ croquis-2d/             editor 2D
├─ solver/                    paquete Python croquis_solver (referencia; no se despliega)
├─ data/
│  ├─ raw/                    descargas (no versionadas si pesan; script para bajarlas)
│  ├─ processed/
│  └─ SOURCES.md              origen, licencia, fecha y script de cada dato
├─ eval/
│  ├─ relatos-mx/             benchmark de extracción (dev / test congelado)
│  ├─ crash-tests/            NHTSA CTD
│  ├─ ciss/                   casos reales con EDR
│  ├─ pedestrian/             proyección de peatones
│  ├─ damage-real/            deformación del visor vs aplastamiento medido en autos reales
│  ├─ perf/                   fps, carga, memoria
│  └─ results/                salidas versionadas que alimentan el README
├─ assets/
│  ├─ pipeline/               scripts Blender headless
│  ├─ vehicles/  humans/  env/
│  └─ ASSETS.md               autor, licencia y URL de cada asset
├─ docs/
│  ├─ adr/                    decisiones de arquitectura
│  ├─ PROGRESS.md             bitácora por fase
│  ├─ physics.md              modelos, ecuaciones y referencias
│  ├─ responsible-ai.md
│  └─ data.md
├─ CLAUDE.md
├─ PLAN.md
└─ README.md
```

---

## 4. `EscenaSpec` v1 (el contrato)

Cada valor escalar usa el envoltorio:

```json
{ "valor": 40, "unidad": "km/h", "rango": [30, 50],
  "fuente": "relato", "confianza": 0.7,
  "evidencia": [{ "inicio": 23, "fin": 41, "texto": "iba como a 40" }] }
```

### 4.1 Bloques

**meta**: `id`, `version_esquema`, `idioma`, `semilla`, `creado`, hash del relato (el texto completo solo vive en el dispositivo salvo consentimiento).

**lugar**
- `tipo_via`: recta, curva, intersección en X, intersección en T, glorieta, incorporación, retorno, estacionamiento, carretera de dos carriles, autopista
- carriles por sentido, ancho de carril, sentidos, camellón, banquetas, guarniciones, acotamiento
- pendiente, peralte, radio de curva
- superficie: asfalto, concreto, adoquín, empedrado, terracería; estado: seco, mojado, encharcado, grava suelta, aceite, lodo → rango de coeficiente de fricción con referencia
- dispositivos: semáforo (con fase por movimiento y tiempo), alto, ceda el paso, tope, paso peatonal, líneas
- `ubicacion_real` opcional: coordenadas para generar la geometría desde OpenStreetMap

**entorno**
- fecha y hora → posición del sol
- clima: despejado, nublado, lluvia ligera o fuerte, niebla, granizo; visibilidad
- iluminación: día, amanecer/atardecer, noche con o sin alumbrado
- objetos: árboles (diámetro de tronco y altura, porque cambian el impacto y la visibilidad), postes (material), muros, bardas, vehículos estacionados, puestos, contenedores, señales

**vehiculos[]**
- `id`, `rol` (A, B, C…), `clase`: sedán compacto, sedán mediano, hatchback, SUV compacta, SUV grande, pickup, van, microbús/combi, autobús, camión unitario, tractocamión, motocicleta, bicicleta, scooter
- marca/modelo/año opcionales (solo para masa, dimensiones y rigidez; **el modelo 3D es genérico por clase, sin logotipos**)
- color (nombre + hex), estado de la pintura
- masa, largo, ancho, alto, distancia entre ejes, voladizos (rangos con fuente)
- maniobra: recto, vuelta izquierda/derecha, vuelta en U, cambio de carril, reversa, incorporación, detenido, estacionado
- velocidad previa, frenado (sí/no, desde dónde, ABS), aceleración, luces encendidas
- ocupantes (referencias a `personas`)

**personas[]** (sin nombres)
- rol: conductor, pasajero (asiento), peatón, ciclista, motociclista
- edad aproximada, estatura y masa en rango
- cinturón, casco, sistema de retención infantil
- postura y movimiento (caminando, corriendo, detenido, cruzando)

**eventos[]** en secuencia temporal
- impacto entre A y B, o A con objeto
- zona de impacto con código tipo CDC (SAE J224): lado, zona horizontal, zona vertical, extensión
- dirección principal de la fuerza en horas de reloj (PDOF)
- post-impacto: giro, derrape, volcadura, arrastre, segundo impacto
- posiciones finales (si se conocen)

**danos_declarados[]**: por vehículo y zona: severidad, vidrios, bolsas de aire, piezas desprendidas, fugas.

**evidencias[]**: marcas de frenado (longitud), restos, posición de los vidrios, posiciones finales, fotos (opcional, fase posterior).

### 4.2 Requisitos

- El esquema se versiona; existen migraciones v1→vN con pruebas.
- Las unidades se normalizan a SI internamente; la interfaz muestra km/h y metros.
- Validaciones físicas: masas y dimensiones dentro de rangos por clase, velocidades plausibles, geometría coherente (un vehículo no empieza dentro de otro).

---

## 5. Comprensión del relato con IA

### 5.1 Pipeline

1. **Redacción de PII local** (regex + diccionario de nombres + patrón de placas mexicanas). El texto que sale del dispositivo ya no lleva nombres, placas ni teléfonos. Se mide en el set de pruebas (§8, E1).
2. **Extracción** con Claude API y salida estructurada contra `escena.schema.json`. Modelo por defecto: `claude-sonnet-5-5`; comparar contra `claude-haiku-5-5` y contra una línea base de reglas. El modelo queda configurable.
3. **Verificador de evidencia.** Todo campo con `fuente: "relato"` debe citar un fragmento que exista literalmente en el relato; si no existe, el campo baja a `supuesto`. Se mide la tasa de "alucinación de campo".
4. **Normalizador de español mexicano.** Glosario versionado: "se me cerró", "le pegué por alcance", "me echó la lámina", "dio el llegue", "combi", "tope", "vuelta en U", "se pasó el alto", "venía hecho la mocha", etc.
5. **Detector de contradicciones** (con el solver): por ejemplo, "iba a 20" con un peatón proyectado 25 m; se muestra al usuario como pregunta, no como acusación.
6. **Preguntas priorizadas por sensibilidad.** El solver corre Monte Carlo sobre los campos inciertos y estima cuánto reduce cada respuesta la varianza del resultado (velocidad de impacto, posiciones finales). Se pregunta primero lo que más importa, con máximo 3 preguntas por ronda.
7. **Voz** (fase posterior): dictado con Web Speech API en el navegador; transcripción en servidor como alternativa medida.

### 5.2 Benchmark "Relatos-MX"

- Mínimo 300 relatos en español de México con su `EscenaSpec` de referencia, cubriendo la distribución de tipos de accidente de ATUS (colisión con vehículo, peatón, motociclista, ciclista, objeto fijo, volcadura, salida del camino, etc.).
- Fuentes: escritos a mano, variaciones con distintos registros (formal, coloquial, con faltas de ortografía, desordenados en el tiempo) y relatos basados en narrativas públicas de casos CISS traducidas y adaptadas (con atribución). Todo lo sintético se marca como sintético.
- División dev / test. **El test se congela (hash en el repo) antes de la primera evaluación** y no se usa para ajustar prompts.
- Relatos contrafactuales para sesgo: el mismo relato cambiando sexo, edad o tipo de vehículo del conductor; la extracción de velocidades y maniobras no debe cambiar.

### 5.3 Métricas

F1 por campo, exactitud de categorías, error absoluto en numéricos, tasa de alucinación de campo, tasa de PII que se filtra, cobertura de preguntas útiles, costo por 1,000 relatos, latencia p50/p95, diferencia contrafactual.

---

## 6. Solver de reconstrucción

Paquete `solver/croquis_solver` (referencia) y `packages/solver-ts` (port). Todas las ecuaciones y referencias quedan en `docs/physics.md`.

### 6.1 Módulos

1. **Pre-impacto.** Trayectorias sobre la geometría de carriles (splines), maniobras, frenado con fricción y ABS, tiempo de percepción-reacción como rango. Salida: estados (posición, rumbo, velocidad, velocidad angular) en el tiempo.
2. **Impacto vehículo-vehículo.** Mecánica de impacto plano de cuerpos rígidos con modelo de impulso (estilo Brach o Kudlich-Slibar): conservación de momento lineal y angular, coeficiente de restitución y fricción tangencial en el plano de contacto. Salida: impulso, ΔV por vehículo, PDOF, velocidades post-impacto.
3. **Energía de deformación (CRASH3).** Coeficientes de rigidez A/B/G por clase y zona, estimados desde pruebas de choque de NHTSA; perfil de aplastamiento de 6 puntos C1–C6 sobre el ancho dañado. Sirve en ambos sentidos: de velocidad a daño (para el visor) y de daño declarado a velocidad (para la inversión). ΔV por energía se contrasta con ΔV por momento.
4. **Impacto con objeto fijo.** Árbol, poste, muro: barrera rígida o semirrígida según objeto, con profundidad de penetración.
5. **Post-impacto.** Modelo planar de 3 grados de libertad con círculo de fricción por llanta (o modelo simplificado documentado), rotación, derrape y reposo. Segundos impactos.
6. **Volcadura.** Criterio de inicio (velocidad lateral, tropiezo con guarnición o terreno); la secuencia 3D se simula en Rapier con condiciones iniciales del solver y se etiqueta como ilustrativa.
7. **Peatón y ciclista.** Ecuaciones de distancia de proyección de Searle (velocidad mínima y máxima a partir de la distancia y la fricción cuerpo-suelo) y de Wood; un ragdoll en Rapier cuyo impulso se calibra para caer dentro de esos límites. Contactos con defensa, cofre y parabrisas según altura del vehículo y estatura.
8. **Ocupantes.** Cinemática relativa al habitáculo: el ocupante se mueve hacia el punto de impacto (opuesto a la desaceleración), con y sin cinturón; zonas de contacto probables. Sin predicción de lesiones (ver §10 y Decisiones abiertas).
9. **Visibilidad.** Línea de vista desde el ojo de cada conductor en el tiempo: qué tapaba la vista (árbol, vehículo estacionado, curva, lluvia, noche). Responde "¿podía verlo y a qué distancia?".
10. **Inversión.** Dados daños, posiciones finales, marcas de frenado y distancia de proyección, estimar velocidades y ángulos por optimización (en la referencia, mínimos cuadrados robustos con SciPy; en el port TS, un optimizador propio o una librería JS equivalente, con paridad probada; CMA-ES si hace falta) y devolver distribución, no un solo número.
11. **Monte Carlo.** Muestreo de todos los campos con rango; resultado con percentiles y la semilla registrada.
12. **Consistencia.** Banderas cuando lo declarado no cabe en ninguna solución física; se explican en lenguaje llano.

### 6.2 Pruebas del solver

- Propiedades con Hypothesis: conservación de momento lineal y angular en el impacto (error relativo < 1e-9), energía cinética después ≤ antes, ΔV coherentes con masas, simetría al intercambiar vehículos.
- Casos analíticos con solución cerrada (choque central en línea, barrera rígida).
- Paridad Python ↔ TS: los mismos fixtures dan los mismos resultados con tolerancia documentada (objetivo 1e-6 relativo).
- Determinismo: misma semilla ⇒ mismo resultado.

---

## 7. Visualización 3D

### 7.1 Escena

- **Vía** desde plantillas paramétricas (recta, curva, X, T, glorieta, incorporación) o desde OpenStreetMap con `ubicacion_real` (atribución ODbL en pantalla). Carriles, líneas, pasos peatonales, guarniciones, banquetas, camellones, topes, señales y semáforos con su fase en el tiempo.
- **Entorno:** árboles instanciados con variación (tronco con diámetro del `EscenaSpec`), postes, bardas, vehículos estacionados; cielo y sol según fecha, hora y coordenadas; lluvia (partículas y pavimento mojado con reflejos), niebla, noche con alumbrado público y faros de los vehículos con conos de luz reales.
- **Materiales:** PBR con texturas CC0 (Poly Haven); asfalto seco vs mojado.

### 7.2 Vehículos

- Un modelo base por clase (sedán, hatchback, SUV, pickup, van, combi, autobús, camión, moto, bici), **genérico y sin marcas**.
- Requisitos del asset: malla con densidad suficiente en paneles deformables, piezas separadas y nombradas (`bumper_front`, `hood`, `door_fl`, `mirror_l`, `headlight_r`, `windshield`, `wheel_rr`…), UVs limpias, LODs.
- Escalado por dimensiones reales del vehículo descrito (largo, ancho, alto, distancia entre ejes) sin deformar ruedas.
- Pintura `MeshPhysicalMaterial` con barniz (clearcoat), color del `EscenaSpec`, suciedad y desgaste opcionales.
- Pipeline en Blender headless: limpieza, subdivisión selectiva, nombrado, LOD, exportación glTF comprimida y registro de licencia en `assets/ASSETS.md`. Fuentes: CC0 (Quaternius, Poly Haven, Kenney) y CC-BY con atribución si hace falta más realismo; nunca assets con licencia que prohíba redistribución.

### 7.3 Daño (lo más real posible)

1. **Deformación plástica:** campo de desplazamiento por vértice construido desde el perfil C1–C6 del solver (ancho, profundidad, altura de la zona), con caída suave, arrugas por ruido dirigido y suavizado laplaciano; se hornea como *morph target* y se anima durante la fase de contacto (~100–150 ms) en cámara lenta. Implementación en TSL (GPU) con respaldo en CPU.
2. **Vidrios:** parabrisas con grieta tipo telaraña en el punto de contacto (sombreador + decal), vidrios laterales que estallan en partículas instanciadas, faros rotos.
3. **Piezas desprendidas:** defensa, espejos, tapones, molduras como cuerpos Rapier con impulso del impacto.
4. **Superficie:** rayones, abolladuras (normal maps) y **transferencia de pintura** del color del otro vehículo con *projected decals*.
5. **Bolsas de aire** que se despliegan según ΔV y zona, con umbral configurable y referenciado.
6. **En el piso:** marcas de frenado y derrape siguiendo la trayectoria del solver, vidrios y restos, fluidos, huellas de arrastre.

### 7.4 Personas

- Cuerpos de MakeHuman/MPFB (assets CC0) con variación por edad, estatura y complexión; rig compatible; animaciones de caminar, estar de pie y manejar.
- Ragdolls Rapier con límites articulares; ocupantes dentro del habitáculo; peatones, ciclistas y motociclistas proyectados.
- Zonas de contacto marcadas con indicadores neutros (no gráficos). **Sin sangre ni lesiones visibles.**

### 7.5 Cámaras y tiempo

Libre, cenital, vista de cada conductor (con análisis de visibilidad sobrepuesto), cámara cinematográfica automática; línea de tiempo con arrastre, cámara lenta, cuadro por cuadro; marcadores de eventos (inicio de frenado, impacto, reposo).

### 7.6 Hipótesis

Comparar dos o más hipótesis (por ejemplo, 40 vs 60 km/h) con vehículos "fantasma" sobrepuestos y la diferencia de resultados en un panel.

### 7.7 Croquis 2D

Vista cenital editable sincronizada con el 3D: arrastrar vehículos, rotar, dibujar trayectorias, colocar árboles y señales. Exporta un croquis tipo parte de tránsito (SVG/PNG/PDF).

### 7.8 Presupuesto de rendimiento (medido en la laptop de René)

- Escena de 2 vehículos, 2 personas, intersección con árboles: ≥ 60 fps a 1080p en GPU integrada en calidad "media"; ≥ 30 fps en "alta".
- Carga inicial de la demo ≤ 8 MB antes de interactuar; assets restantes en streaming.
- Niveles de calidad automáticos según GPU; respaldo WebGL medido.

### 7.9 Exportación

Video (MediaRecorder WebM; MP4 con ffmpeg.wasm), cuadros PNG, escena glTF, informe PDF (croquis, línea de tiempo, parámetros con fuente, supuestos, rangos, banderas, semilla, hash de entradas y leyenda ilustrativa).

---

## 8. Evaluación (evidencia medida)

Cada evaluación tiene script en `eval/`, salida en `eval/results/` y se compara contra al menos una alternativa simple. El README solo cita estos resultados.

| ID | Qué se mide | Datos | Comparar contra |
|---|---|---|---|
| E1 | Extracción del relato (F1 por campo, alucinación de campo, fuga de PII, costo, latencia, sesgo contrafactual) | Relatos-MX test congelado | Línea base de reglas, Haiku vs Sonnet |
| E2 | Impacto contra barrera: ΔV y aplastamiento a partir de la velocidad, y velocidad a partir del aplastamiento | NHTSA Vehicle Crash Test Database (API pública) | Modelo de energía equivalente ingenuo |
| E3 | Reconstrucción de casos reales: ΔV estimado vs ΔV del EDR | NHTSA CISS (casos con descarga de EDR) | ΔV reconstruido por CISS con WinSmash |
| E4 | Proyección de peatón: velocidad estimada y distancia | Ecuaciones de Searle y Wood y datos publicados accesibles | Fórmula de Searle sola |
| E5 | Deformación contra autos reales: (a) se reproduce cada prueba de choque en Croquis y se compara el perfil de aplastamiento de la malla con el medido en el vehículo después de la prueba; (b) lo mismo con casos reales de CISS (aplastamiento C1–C6 medido por los investigadores); (c) comparación visual lado a lado contra las fotos del vehículo | NHTSA Vehicle Crash Test Database (reportes con fotos y medidas de aplastamiento posteriores a la prueba) y NHTSA CISS | Deformación lineal simple y deformación uniforme en la zona de impacto |
| E6 | Rendimiento: fps, tiempo de carga, memoria | Escenas canónicas en la laptop de René | Presupuesto §7.8 |
| E7 | Paridad Python ↔ TS | Fixtures del solver | Tolerancia documentada |
| E8 | Determinismo | Repeticiones por semilla en distintos navegadores | Igualdad exacta |
| E9 | Usabilidad: tiempo hasta la primera reconstrucción, correcciones necesarias, SUS | ≥ 5 personas reales contando un percance propio o ficticio | — |

Notas:
- CISS: sus reconstrucciones con WinSmash, en promedio, sobreestiman el ΔV debajo de 16 km/h y lo subestiman arriba, comparadas con el EDR. Medirse contra el EDR y contra WinSmash es "comparar hacia arriba".
- E5: primero inventariar cuántas pruebas de NHTSA y casos CISS traen medidas completas de aplastamiento y fotos útiles, y documentarlo en `docs/data.md` con el tamaño de muestra. Métricas: error por punto (C1–C6) y error en profundidad máxima, ancho dañado y área, por tipo de impacto (frontal, frontal desplazado, lateral, alcance, poste).
- Si un dato no es accesible (por formato o licencia), se documenta en `docs/data.md` y se reemplaza por la mejor alternativa con fuente; no se inventan números.

---

## 9. Datos y licencias

| Dato | Uso | Licencia / condición |
|---|---|---|
| INEGI ATUS (datos abiertos) | Problema, distribución de tipos de accidente para el benchmark | Términos de libre uso de INEGI; citar |
| NHTSA Vehicle Crash Test Database (API) | Rigidez CRASH3, validación E2 y E5 (fotos y aplastamiento medido), masas de prueba | Datos públicos del gobierno de EE. UU.; citar |
| NHTSA CISS | Validación E3 y E5, narrativas para relatos | Datos públicos; citar |
| Fichas técnicas de fabricantes | Dimensiones y masas por modelo común en México | Cita por ficha en `data/SOURCES.md` |
| Tablas de fricción de la literatura | Rangos por superficie y estado | Cita por valor |
| OpenStreetMap | Geometría de vías reales | ODbL, atribución visible |
| Poly Haven, Quaternius, Kenney | Texturas, HDRI, modelos | CC0 |
| MakeHuman / MPFB | Personas | Assets CC0 |
| Código de Croquis | — | MIT (confirmar con René) |

---

## 10. IA responsable

**Lo que Croquis nunca debe hacer:**
1. Asignar culpa o "presunto responsable".
2. Diagnosticar o estimar lesiones de personas reales (ver Decisiones abiertas).
3. Presentar la reconstrucción como peritaje o prueba.
4. Inventar datos sin marcarlos como supuesto.
5. Guardar el relato completo en el servidor sin consentimiento explícito.
6. Mostrar contenido gráfico de personas lesionadas.

**Medidas:**
- Leyenda visible en el visor y marca en cada exportación: "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje." + semilla + hash de entradas.
- Consentimiento separado para guardar casos y para usar relatos en mejorar el sistema.
- PII redactada en el dispositivo; IDs seudónimos.
- Sesgo: pruebas contrafactuales (E1) y revisión de que el texto generado no culpe por sexo, edad o tipo de vehículo.
- Modos de falla documentados: relato contradictorio, datos insuficientes, física fuera de rango, LLM no disponible (la app sigue funcionando con croquis manual).
- Límite de gasto y de peticiones por usuario para la API.

---

## 11. Historia y demo

Lecciones de `aprendizajes-hackathon`: ingeniería real + historia visual.

- **Acrónimos.** Subtítulo en inglés (README y portafolio): *Crash Reconstruction from Oral Queries Using Impact Simulation*. Lema en español: *Cuenta. Reconoce. Ordena. ¿Qué falta? Ubica. Impacta. Simula.* La página de historia lleva una sección por letra:
  - **C — Cuenta.** Lo dices con tus palabras, como se lo contarías a alguien.
  - **R — Reconoce.** La IA convierte tu relato en datos y marca de qué frase salió cada uno.
  - **O — Ordena.** Arma la línea de tiempo: antes, impacto y después.
  - **Q — ¿Qué falta?** Te pregunta solo lo que de verdad cambia el resultado.
  - **U — Ubica.** Acomodas autos, personas y calles en el croquis.
  - **I — Impacta.** La física calcula el choque, la deformación y hacia dónde salió cada quien.
  - **S — Simula.** Lo ves pasar en 3D, desde cualquier ángulo y en cámara lenta.
- **Página de historia** con scroll: una persona ficticia del valle de Toluca que choca en una avenida real, la dificultad de explicar lo que pasó, datos de ATUS en el momento justo, por qué un croquis a mano y una animación genérica no bastan, y luego el producto.
- **Demo "Tú eres…"**: el visitante escribe (o elige) un relato, ve en vivo qué entendió la IA campo por campo, corrige el croquis, ve la reconstrucción y compara hipótesis. Casos precargados que corren sin servidor, con semilla.
- **Recorrido técnico**: página que muestra evaluaciones E1–E9 con gráficas generadas desde `eval/results/`.
- Tres videos: presentación, demo de producto y recorrido técnico (guion en `docs/`).

---

## 12. Infraestructura y calidad

- Monorepo con pnpm workspaces (JS) y `uv` (Python).
- CI: lint (ESLint, Ruff), tipos (tsc, mypy o pyright), pytest, Vitest, Playwright con snapshots visuales de escenas canónicas, paridad, determinismo, evaluación rápida (subconjunto de E1 sin llamar a la API usando respuestas grabadas).
- Despliegue: todo en Vercel (web y API), con un preview por cada PR y producción desde `main`; variables de entorno de Vercel para secretos; las funciones de extracción usan streaming y `maxDuration` configurado según los límites vigentes de Vercel (verificarlos en su documentación).
- Observabilidad: registro estructurado, costo por petición LLM, errores del visor.
- Accesibilidad: el croquis y los resultados se pueden leer sin el 3D; contraste y teclado.
- i18n: español de México por defecto, inglés como segundo idioma.

---

## 13. Fases y criterios de aceptación

Cada fase termina con: pruebas en verde, `docs/PROGRESS.md` actualizado, evidencia (capturas, números de `eval/results/`) y lista de lo pendiente. Cumplido el criterio, Claude Code hace merge y continúa con la siguiente fase sin esperar aprobación. **Si falta tiempo se cambia el orden, no la calidad.**

**F0 — Fundaciones**
Monorepo, CI, ADR del stack con versiones, licencias, esqueleto de docs, scripts de descarga de ATUS con cifras reales.
✅ CI verde; `pnpm dev` y `uv run pytest` funcionan en Windows; `data/SOURCES.md` con ATUS.

**F1 — Contrato y croquis**
`escena.schema.json` v1 completo, generación Zod/Pydantic, 10 escenas canónicas escritas a mano (alcance, lateral en intersección, frontal en curva, peatón en cruce, motociclista, objeto fijo árbol, poste, volcadura, nocturno con lluvia, glorieta), editor de croquis 2D con ida y vuelta al JSON.
✅ Las 10 escenas validan en ambos lados; editar en croquis y volver al JSON no pierde datos (prueba).

**F2 — Solver de referencia**
Módulos 6.1.1–6.1.5 y 6.1.7 con pruebas de propiedades y casos analíticos; primera corrida de E2.
✅ Conservación < 1e-9; E2 con error reportado contra la línea base.

**F3 — Visor base**
Vía paramétrica, vehículos por clase con color y dimensiones, movimiento desde el solver, línea de tiempo, cámaras, entorno básico (sol, árboles, postes).
✅ Las 10 escenas canónicas se ven; snapshots visuales; E6 dentro de presupuesto.

**F4 — Daño**
Todo §7.3.
✅ Snapshots de daño por escena; perfil C1–C6 del visor coincide con el del solver (prueba numérica sobre la malla).

**F5 — Personas y visibilidad**
§7.4, módulos 6.1.7–6.1.9.
✅ Proyección del ragdoll dentro de los límites de Searle en ≥ 95 % de corridas con semilla; E4 corrido; análisis de visibilidad con prueba en escena de árbol.

**F6 — Comprensión del relato**
§5 completo: PII, extracción, verificador, glosario, preguntas por sensibilidad; Relatos-MX con test congelado; E1.
✅ E1 publicado con las tres alternativas; fuga de PII medida; contrafactuales medidos.

**F7 — Inversión, Monte Carlo y consistencia**
Módulos 6.1.10–6.1.12; hipótesis en el visor; E3 con CISS.
✅ E3 contra EDR y WinSmash; banderas de inconsistencia con pruebas.

**F8 — Entorno completo**
OSM real, clima, noche y faros, todos los dispositivos de tránsito, vehículos estacionados, superficie mojada.
✅ Escena en una intersección real de Toluca generada desde OSM con atribución; snapshots de clima.

**F9 — Demo offline y exportaciones**
Port TS completo del solver (todos los módulos de §6, incluidos inversión y Monte Carlo en Web Workers) con paridad (E7), determinismo (E8), casos precargados, PDF, video, glTF.
✅ La demo funciona sin red; E7 y E8 en verde.

**F10 — Validación del daño contra autos reales**
Ingesta de reportes de pruebas de NHTSA (fotos y aplastamiento medido) y de casos CISS con aplastamiento C1–C6; reproducción de cada caso en Croquis con la misma clase, masa, velocidad y ángulo; medición del perfil sobre la malla deformada; comparaciones lado a lado contra las fotos; ajuste de la deformación (caída, ancho, arrugas) solo con el conjunto de desarrollo y evaluación final en un conjunto de prueba separado y congelado antes de medir. Corre en la laptop; no requiere software externo con licencia.
✅ E5 publicado con tamaño de muestra, error por tipo de impacto contra las dos líneas base y galería de comparaciones con las fotos reales.

**F11 — Producto final**
Página de historia, recorrido técnico, README completo, despliegue en Vercel (preview y producción), E9 con usuarios reales, guiones de video.
✅ Checklist del README (§15) completo con enlaces; sitio en vivo.

---

## 14. Riesgos

| Riesgo | Mitigación |
|---|---|
| Modelos 3D realistas con licencia libre escasean | Pipeline Blender para mejorar bases CC0; CC-BY con atribución; registrar la decisión en ADR |
| 8 GB de RAM | Calidad por niveles; no correr todo a la vez |
| Pocas pruebas con medidas completas de aplastamiento | Combinar NHTSA y CISS; reportar el tamaño de muestra real y los tipos de impacto no cubiertos como límite |
| Formatos complejos de CISS y CTD | Scripts de ingesta con pruebas; empezar por subconjuntos documentados |
| Sobreafirmar precisión física | Rangos, banderas, leyenda; README separa "medido" de "ilustrativo" |
| Costo de la API | Respuestas grabadas en CI, caché, límite por usuario, comparar Haiku |
| Relatos ambiguos | Croquis editable + preguntas por sensibilidad |

---

## 15. README (estándar Helada)

Problema con fuentes · cómo probarlo en vivo y en local · resultados medidos contra alternativas simples (E1–E9) · mapa del repo · datos con fuente y licencia y lo que no cubren · IA responsable · límites y siguiente paso · documentación de respaldo para cada afirmación · pruebas · licencia y atribución (incluye NHTSA, INEGI, OSM y assets).

**Siguiente paso documentado (no es parte de las fases):** comparar la deformación contra simulación por elementos finitos con software libre (OpenRadioss y modelos públicos de vehículos) cuando haya acceso a una máquina potente.

---

## 16. Decisiones abiertas para René

Claude Code no espera respuesta: usa la **opción por defecto**, la registra en un ADR y René puede cambiarla después.

1. Nombre. Por defecto: *Croquis*.
2. Lesiones. Por defecto: **no** se estiman (razones en §10). Alternativa: modo educativo separado con curvas de riesgo publicadas y advertencias.
3. Despliegue. **Decidido por René: solo Vercel** (web y API), sin AWS. Mientras René no conecte el repo a su cuenta de Vercel, todo corre en local y el despliegue queda en "Bloqueado — necesita a René".
4. Presupuesto de la API de Claude. Por defecto: límite configurable por variable de entorno con un tope bajo; las evaluaciones grandes (E1) se corren una vez y se graban.
5. Licencia del código. Por defecto: MIT.
6. Entrada por fotos del daño. Por defecto: queda como fase posterior a F11 (se documenta como siguiente paso, no se recorta nada del plan actual).

---

## Fuentes

- INEGI, Accidentes de tránsito terrestre en zonas urbanas y suburbanas (ATUS): https://www.inegi.org.mx/programas/accidentes/
- NHTSA, Crash Test Database y APIs: https://nrd-static.nhtsa.dot.gov/
- NHTSA, Crash Investigation Sampling System: https://www.nhtsa.gov/crash-data-systems/crash-investigation-sampling-system
- Watson et al., SAE 2023-01-5043 (CISS vs EDR, frontal): https://doi.org/10.4271/2023-01-5043
- Watson et al., SAE 2022-01-5069 (CISS vs EDR, alcance): https://doi.org/10.4271/2022-01-5069
- Searle, J. A., "The Physics of Throw Distance in Accident Reconstruction", SAE 930659
- Wood, D., SAE 910814: https://doi.org/10.4271/910814
- Rapier, determinismo: https://rapier.rs/docs/user_guides/templates_injected/determinism
- React Three Fiber v9 y WebGPU: https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide
- `@react-three/rapier`: https://github.com/pmndrs/react-three-rapier
- Claude API, salida estructurada: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- MakeHuman / MPFB, licencia: https://static.makehumancommunity.org/about/license.html
- Quaternius (CC0): https://quaternius.com
- OpenStreetMap, licencia: https://www.openstreetmap.org/copyright
