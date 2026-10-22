# Bitácora de Croquis

Este archivo permite que cualquier sesión retome el trabajo sin contexto previo.
Reglas de trabajo: `CLAUDE.md`. Especificación: `PLAN.md`.

## Estado actual

- **Ahora: prototipo para CESVI** (desde el 2026-10-20). Croquis es para los peritos de CESVI México; el alcance lo pone CESVI (`CLAUDE.md`). La especificación es `docs/cesvi/PROTOTIPO.md`, que manda sobre `PLAN.md` en lo que se contradigan.
  - **Orden:** Hito 1 (el caso A2010930 y sus cálculos en `/cesvi`), Hito 2 (el lugar y el croquis sobre el mapa) y Hito 3 (correspondencia, sugerencia y dictamen en PDF). Cada uno se despliega al terminar.
  - **CI:** para hacer merge solo cuentan lint, tipos, pruebas unitarias y una e2e por flujo principal en Chromium; lo demás corre a mano (ADR 0047).
  - **Datos de CESVI:** en `data/raw/cesvi/`, que git ignora (`.gitignore`: `data/raw/*`). El repositorio solo guarda datos derivados del caso, sin placas, VIN ni nombres.
- **`/cesvi` con el mensaje del plan v2 (2026-10-21, para la demo)** (rama `feat/cesvi-reconstruccion`, PR #78):
  - **Liga:** https://croquis-sage.vercel.app/cesvi (pide usuario y clave).
  - **Qué cambió:**
    - **Paso 4, «La reconstrucción»:**
      - se abre en la reconstrucción de Croquis, el nombre nuevo de la «versión de la evidencia»;
      - la versión declarada es una capa opcional, apagada al inicio: «Comparar con la declaración del conductor». Encendida, vuelven las pestañas, superponer, y en Trabajar las vistas y «Qué cambia entre versiones».
    - **Paso 7, «Croquis contra el dictamen»:**
      - **Tabla punto por punto** de lo que concluyó CESVI contra lo que obtuvo Croquis, con la diferencia en %:
        - modalidad: alcance contra alcance, coincide;
        - velocidad por deformación: 63.15 contra 63.90 km/h, +1.19 %;
        - velocidad por restos: 60.27 contra 60.27 km/h, +0.00 %;
        - dinámica del impacto: 15.89 m de restos en ambos.
      - **La diferencia de energía, explicada:** 225.454 con los datos impresos contra 220.190 del dictamen, +2.39 %.
      - **El perito concluye:** valida la comparación o escribe su conclusión.
      - **La comparación con la declaración** va abajo, plegada; la sugerencia sobre la declaración solo aparece si el perito la pide.
    - **Textos:** nada juzga al conductor. Esto vale para:
      - el paso 2 («Para la reconstrucción» y «Declaración del conductor · opcional»);
      - el paso 5 («Con la maniobra declarada, para comparar»);
      - las frases del recorrido;
      - el PDF y el Word: tabla «Reconstrucción de Croquis contra el dictamen original», la declaración solo si el perito encendió la comparación y sin veredicto;
      - el prompt del borrador de consideraciones (v2).
    - **Maqueta:** `docs/cesvi/rediseno/Paso7.html` con el título y la tabla nuevos.
    - **Sin 3D en esta demo.**
  - **Cómo probarlo:**
    1. Paso 4: se ve solo la reconstrucción (restos 15.89 m); encender «Comparar con la declaración del conductor» muestra la versión declarada.
    2. Paso 7: la tabla y la explicación de la energía; abrir «Comparación con la declaración del conductor · opcional»; escribir un nombre y «Aceptar y seguir».
    3. Paso 8: el PDF lleva la tabla.
  - **Pruebas:**
    - `packages/cesvi/src/contra-dictamen.test.ts` (los números de la tabla y un resumen sin juicios sobre el conductor);
    - la e2e `@flujo` de `/cesvi`, actualizada.
- **Hito 1 — el caso y sus cálculos** (rama `feat/cesvi-hito1`, ADR 0048 y 0049):
  - **Liga:** https://croquis-sage.vercel.app/cesvi (pide usuario y clave).
  - **Qué hay:**
    - el expediente del caso A2010930 sin placas, VIN ni nombres;
    - los cálculos con el método de CESVI (McHenry de 2, 4 y 6 medidas, EBS, velocidad por desplazamiento y la comparación con un umbral que fija el perito), cada fórmula con sus valores sustituidos y los datos editables;
    - la tabla «Reproducción del dictamen»;
    - la discrepancia de la energía explicada, las preguntas para CESVI y la segunda opinión con la rigidez de NHTSA.
  - **Cómo probarlo:** abrir la liga; en la tabla, 60.27 y 63.15 km/h coinciden y la energía difiere (+2.39 %); cambiar «D, separación de los restos» recalcula V3, y cambiar el umbral cambia si la diferencia es significativa.
  - **Pruebas:** `pnpm --filter @croquis/cesvi test` (las fórmulas con los números del caso y las citas contra el lote), `apps/web/src/proxy.test.ts` y la e2e `@flujo` de `/cesvi`.
  - **Qué necesito de René:**
    - pasar el usuario y la clave a quien vea la demo: están en `.env.local` (`CROQUIS_CESVI_USUARIO`, `CROQUIS_CESVI_CLAVE`) y en Vercel;
    - las preguntas para CESVI que muestra la página, empezando por el PDF original o la hoja de cálculo del dictamen.
- **Hito 3 — correspondencia, sugerencia y dictamen exportable** (rama `feat/cesvi-hito3`, ADR 0051):
  - **Liga:** https://croquis-sage.vercel.app/cesvi, sección «Correspondencia y dictamen» (pide usuario y clave).
  - **Qué hay:**
    - criterios de correspondencia de CESVI por vehículo, con nota;
    - diagrama de zonas de daño;
    - la sugerencia de Croquis con sus tres razones y la regla con que concluye; el perito la acepta, edita o rechaza, y queda quién y cuándo;
    - el borrador de las consideraciones con Claude, editable, con aviso de las cifras que no vienen de los cálculos;
    - el dictamen en PDF con la estructura de CESVI.
  - **Cómo probarlo:** en «Correspondencia y dictamen», escribir un nombre, aceptar la sugerencia, pedir el borrador y exportar el dictamen.
  - **Pruebas:** `packages/cesvi` (sugerencia y borrador con cliente falso), `apps/web/src/lib/dictamen-cesvi.test.ts` y la e2e `@flujo` hasta la descarga del PDF.
  - **Qué necesito de René:** nada nuevo. El borrador usa la llave y el tope de gasto de producción que ya están en Vercel.
- **Next.js 16.4.0 → 16.4.2 por seguridad (2026-10-22, rama `fix/next-security`):**
  - **Cómo se encontró:** `next build` se detuvo con un aviso de vulnerabilidad, y `pnpm audit --prod` lo confirmó.
  - **Lo que corrige 16.4.2** (y `eslint-config-next` 16.4.2 con él):
    - dos ejecuciones remotas de código sin autenticación: la optimización de imágenes con SVG (GHSA-2464-fhr4-w9xw) y las funciones `use cache` que devuelven arreglos tipados (GHSA-673q-mjm6-r5xr);
    - una denegación de servicio con Server Actions (GHSA-p3m5-59mp-jv5r).
  - **Resultado:** `pnpm audit --prod` ya no encuentra vulnerabilidades. Versión registrada en el ADR 0001.
- **Video demo narrado de `/cesvi` para CESVI (2026-10-22)** (rama `feat/video-demo`; no es prueba de CI):
  - **Dónde quedó:** `demo/video/croquis-cesvi-demo.mp4` (1920×1080 a 30 cuadros, H.264 y AAC estéreo a 48 kHz, 4.10 min) y los subtítulos en `demo/video/croquis-cesvi-demo.srt`. Los dos están fuera de git: el MP4 pesa 20.9 MB, más de 20 MB, y el `.srt` se regenera con el montaje.
  - **Qué muestra:**
    - la entrada con la marca;
    - los ocho pasos del recorrido, con el modo Trabajar y el tema;
    - «Caso nuevo» con un crucero (otra modalidad que el alcance de AXA);
    - el cierre: «Lo que sigue: el 3D de la reconstrucción y cualquier caso, no solo este».
  - **Guion:** `docs/cesvi/video/guion.md`, en 19 segmentos. Es el mismo texto de la voz y de los subtítulos; solo trae cifras que muestra el sistema.
  - **Voz:** Piper con la voz `es_MX-claude-high`, registrada en `assets/ASSETS.md`. Sin música.
  - **Las lecturas de Claude son las grabadas** (`hecho-A2010930.json` y la escena `cesvi-e814f085db`): el video no gasta API.
  - **Cómo regrabarlo completo** (PowerShell o Git Bash, desde la raíz):
    1. `pnpm --filter @croquis/web build`, y luego `pnpm --filter @croquis/web start` en otra terminal (servidor de producción en `http://localhost:3000`).
    2. `node demo/video/voz.mjs`: un WAV por segmento y su duración medida (`demo/video/salida/voz.json`). Solo hace falta si cambia el guion.
    3. `node demo/video/grabar.mjs`, con `PLAYWRIGHT_BROWSERS_PATH=D:\dev-cache\ms-playwright`: Chromium completo en headless nuevo, a 1920×1080. Cada segmento espera su voz más 1.3 s de lectura. Escribe `salida/recorrido.webm` y `salida/linea-de-tiempo.json`. Con `CROQUIS_VIDEO_RAPIDO=1` hace un ensayo rápido de las acciones, sin esperas; ese ensayo no sirve para el video.
    4. `node demo/video/montar.mjs`: pone cada voz donde empezó su segmento y escribe el MP4 y el `.srt`.
  - **Herramientas instaladas fuera del repositorio** (en D:, porque C: está casi lleno; las rutas se pueden cambiar con variables de entorno, ver `demo/video/comun.mjs`):
    - ffmpeg 9.0.2 essentials en `D:\dev-cache\tools\ffmpeg\` (`CROQUIS_FFMPEG_DIR`);
    - Piper 1.8.0 (piper-tts, en un venv de Python 3.12) en `D:\dev-cache\tools\piper-venv\` (`CROQUIS_PIPER`);
    - la voz en `D:\dev-cache\tools\piper-voices\es_MX-claude-high.onnx` (`CROQUIS_PIPER_VOZ`).
  - **Lo que arregló la grabación en «Caso nuevo»** (con su prueba en `e2e/cesvi-caso.spec.ts`):
    - las posiciones que coloca el perito no se veían en el mapa, porque faltaba la hoja de estilos de MapLibre;
    - ahora cada posición se ve con el número y el color del vehículo, y el impacto con borde punteado;
    - el clic pasa al mapa aunque caiga junto a otra posición.
  - **Lo que encontró y queda pendiente** (ver «Endurecimiento pendiente»): en una reversa, el solver no reconstruye al vehículo que retrocede.
  - **Regrabado el 2026-10-22** con el Chromium completo (`channel: "chromium"`): la vista previa del paso 8 muestra el PDF. El Chromium del shell headless no trae visor de PDF, y en él salía en blanco.
- **Versión real para CESVI (desde 2026-10-21):** el plan es `docs/cesvi/PLAN-CESVI.md`; `docs/cesvi/PROTOTIPO.md` queda como historial.
  - **El prototipo desplegado se queda como está** para la demo con CESVI de esta semana. La versión real se trabaja en ramas y entra a `main` solo con la e2e del prototipo en verde.
  - **Plan v2 (2026-10-21):** René lo cambió el mismo día. El centro es la reconstrucción con física y su 3D a partir de lo que narra el perito; los dictámenes sirven para demostrar que Croquis reproduce lo que CESVI ya analizó, y la comparación con la declaración del conductor queda como complemento opcional (R7). `CLAUDE.md` cambió con él: el visor 3D se reactiva.
  - **Orden:** R0 → R1 → R2 → R3 → R6 → R4 → R5 → R7 → R8 → R9 → R10 → R11.
    - **R6 (carambolas) va antes de R4** (René, 2026-10-21): la evaluación de R4 debe cubrir los 104 dictámenes con 3 o más vehículos y los 144 con más de un impacto (`eval/results/cesvi_corpus_extraccion.json`).
    - **R10** (calidad visual del 3D) y **R11** (video cinematográfico con Blender) van al final.
  - **Cómo quedan las fases C de la v1:**
    - **C0:** pasa a R0. Falta lo nuevo: la descripción de los hechos sin conclusiones, con su revisión de fuga, y lo que concluyó CESVI, estructurado.
    - **C1:** es el módulo de verificación CESVI de R2, con su reproducción (E-C1) ya corrida.
    - **C2–C8:** se reacomodan en R1–R9.
  - **Fase actual: R5** (cargar un dictamen). R4 y R6 quedaron cerradas el 2026-10-22, y R3 también; R0, R1 y R2, el 2026-10-21. C0 y C1 de la v1 quedaron cerradas el 2026-10-21. El plan de C0 fue:
    - **Contrato v2:** `escena.schema.json` ampliado, con migración desde v1.3, Zod y Pydantic generados y un validador semántico (N vehículos, M impactos, versiones).
    - **Corpus estructurado** de los 671 dictámenes con Claude (salida estructurada, caché, semilla), validado contra el esquema, con partición congelada del 30 % y etiquetas de la conclusión revisadas en una muestra.
    - **Mediciones:** las proporciones del §2 en `eval/results/cesvi_corpus.json`; desde ahí se pueden citar.
    - **Costo:** antes de correr el corpus se estima y se anota aquí. Si pasa de 30 USD, se pregunta a René.
  - **Resumen de R4 para René** (rama `feat/r4-reproduccion`, ADR 0067):
    - **Qué quedó:**
      - **E-R4:** Croquis recibe solo la narración sin conclusiones de cada dictamen de la prueba congelada; la lee a escena como en «Caso nuevo», la reconstruye y se compara con lo que concluyó CESVI.
      - **Desarrollo antes que prueba:** las reglas se ajustaron con 80 dictámenes de desarrollo y se congelaron en un commit antes de medir la prueba, que se midió una sola vez.
      - **La página `/cesvi/reproduccion`:**
        - los 205 dictámenes de la prueba, con lo que concluyó CESVI y lo que obtuvo Croquis lado a lado;
        - lo que coincide y lo que no;
        - la reconstrucción en 2D y 3D.
    - **Números medidos** (`eval/results/cesvi_r4_reproduccion_prueba.json`, 205 dictámenes):
      - **Modalidad:** 34.2 % (65 de 190), contra 35.3 % de decir siempre «otra». Croquis no infiere «otra», que en los dictámenes es una clase de casos variados.
        - **Solo las modalidades físicas:** 52.8 % (65 de 123), contra 37.4 % de decir siempre «alcance».
        - **Por modalidad:** alcance 34 de 46, lateral 17 de 25, frontal 4 de 6, objeto fijo 6 de 17, salida del camino 2 de 10, volcadura 2 de 10, reversa 0 de 9.
      - **Zonas de contacto:** Croquis tiene 69.2 % de las de CESVI (216 de 312), con precisión de 59.7 %.
      - **Secuencia:** primer impacto 63.7 % (86 de 135); secuencia completa 49.6 %.
      - **Posiciones finales:** Croquis tiene 53.4 % (31 de 58).
      - **Velocidades:** hay 5 por deformación en la prueba y Croquis no calcula ninguna, porque esas narraciones no traen las medidas C y L ni la masa. La línea base de 61.62 km/h se equivoca en una mediana de 11.72 km/h.
      - **Reconstrucción:** los 205 se reconstruyen en 3D, con mediana de 359 ms.
      - **Gasto de API:** 3.6760 USD con lotes (estimado: 5.60 USD).
    - **Cómo probarlo:**
      1. Abrir `/cesvi/reproduccion` y entrar a un dictamen.
      2. Leer los dos lados.
      3. «Reconstruir» para ver el 2D y el 3D.
    - **Pruebas:**
      - `packages/cesvi/src/dictamenes-r4.test.ts`: reglas, comparación y líneas base;
      - la e2e `@flujo` de la página.
    - **Qué necesito de René:** nada.
    - **Siguiente:** R5, cargar un dictamen.
  - **Lo que se planeó para R4:**
    1. **Comparación** (`packages/cesvi/src/reproduccion.ts`): a partir de la escena que Croquis lee de la narración sin conclusiones (R0 → R1), contra lo que concluyó CESVI (R0):
       - **modalidad:** Croquis la infiere de la escena (vehículos, caras y dirección de los daños, objeto fijo) y de lo que dice la narración;
       - **zonas de contacto:** por vehículo y cara;
       - **secuencia de impactos:** participantes de cada impacto en orden;
       - **velocidades:** cuando el dictamen las calcula y Croquis puede calcularlas (verificación CESVI con las medidas, o la reconstrucción), con error absoluto y porcentaje;
       - **posiciones finales:** si Croquis las tiene por vehículo.
       - **Líneas base:** la modalidad más frecuente y la velocidad promedio, las dos tomadas de desarrollo.
    2. **Desarrollo antes que prueba:**
       - las reglas se ajustan con una muestra de dictámenes de desarrollo;
       - se congelan con un commit;
       - la prueba congelada (205) se lee y se mide una sola vez.
    3. **Lecturas con Claude** (la lectura de R1, con la API de lotes): el estimado de costo se anota aquí antes de enviar; si pasa de 30 USD, se pregunta a René.
       - **Estimado del 2026-10-22** (`cesvi_r4_reproduccion.mts estimar`: tokens de entrada contados con la API y salida media de las lecturas de R1):
         - desarrollo, 80 narraciones: 366,324 tokens de entrada, ~1.57 USD;
         - prueba, 205: 942,623 tokens de entrada, ~4.03 USD.
       - **Total:** ~5.60 USD, bajo el tope de 30 USD.
       - **La prueba se lee al mismo tiempo,** porque el lote tarda, pero se mide una sola vez, ya con las reglas congeladas.
    4. **Página «Reproducción de dictámenes»** (`/cesvi/reproduccion`): los casos de la prueba que Croquis reconstruye, con lo que concluyó CESVI y lo que obtuvo Croquis lado a lado (2D y 3D) y las diferencias en porcentaje, más una e2e.
    - **Riesgos:**
      - las narraciones casi nunca nombran la modalidad (3 de 205), así que la inferencia depende de las zonas;
      - sin posiciones medidas, la física no fija velocidades;
      - solo 17 dictámenes de la prueba tienen velocidades calculadas.
  - **Resumen de R6 para René** (rama `feat/r6-carambolas`, ADR 0066):
    - **Qué quedó:**
      - **El solver resuelve impactos en secuencia** (Python y TS, con paridad):
        - cada impacto entre vehículos posterior al primero ocurre cuando el par se toca, con el mismo impulso del primero;
        - el daño de cada impacto queda en su vehículo, y si un impacto declarado no ocurre, se dice;
        - resultado 1.9.0 y escena canónica nueva `carambola`;
        - las once escenas anteriores no cambian sus números.
      - **«Caso nuevo»:** los impactos 2..M de la narración pasan a la reconstrucción. El mapa marca X1, X2… y la reconstrucción lista cada impacto con su instante. Un vehículo que solo está en un impacto posterior empieza detenido donde lo colocó el perito (supuesto, se dice).
      - **3D:** cada daño se deforma desde el instante de su impacto.
      - **Línea de tiempo:** numera los impactos.
    - **Números medidos** (E-R6, `eval/results/cesvi_r6_carambolas.json`):
      - **Expedientes:** los 105 del corpus con 3 o más vehículos son escenas válidas, se reconstruyen con todos sus vehículos y quedan listos para el 3D.
      - **Impactos posteriores:** 88 llegan a la escena; sin posiciones del perito, ocurren 7. Los otros quedan dichos como «no ocurre»: la disposición genérica no junta a los vehículos.
      - **Tiempo por escena:** mediana de 7,314 ms y máximo de 34,371 ms (8 vehículos).
    - **Cómo probarlo:**
      1. En `/cesvi/caso`, pegar la narración de una carambola que diga el orden de los impactos (la de la e2e está en `data/cesvi/grabaciones/carambola/carambola-e2e.json`).
      2. Colocar a los tres vehículos en fila, en el impacto y en su posición final.
      3. «Reconstruir»: aparecen X1 y X2 en el mapa y en la lista. «Ver la reconstrucción en 3D» la muestra.
    - **Pruebas:**
      - `solver/tests/test_carambola.py` y su espejo `packages/solver-ts/src/carambola.test.ts`;
      - la paridad de las 12 escenas canónicas;
      - el morph target por impacto en el visor y los impactos numerados en la línea de tiempo;
      - el adaptador y `impactosEnMapa` en `packages/cesvi`;
      - la e2e `@flujo` de una carambola en `/cesvi/caso`.
    - **Gasto de API:** 0.0280 USD, la lectura grabada de la narración de la e2e.
    - **Qué necesito de René:** nada.
    - **Siguiente:** R4, la evaluación contra los dictámenes (ya puede cubrir los de más de un impacto).
  - **Lo que se planeó para R6:**
    1. **Solver (Python de referencia y port TS, con paridad):**
       - **Qué cuenta como impacto posterior:** los eventos de impacto entre vehículos que vienen después del primero en la escena.
       - **Cuándo ocurre:** en la fase posterior conjunta (ADR 0063), cuando los contornos de ese par se tocan acercándose. Se resuelve con el mismo impulso del primer impacto (`planar_impact`): restitución, fricción, delta-v, PDOF y energía.
       - **El daño de cada vehículo:** el primero va en `dano`, y los siguientes en `danos_posteriores`. El resultado sube a 1.9.0.
       - **Si un impacto declarado no ocurre,** una bandera lo dice.
       - **Escena canónica nueva:** `carambola`, un alcance en cadena con tres vehículos.
    2. **«Caso nuevo»:**
       - el adaptador del expediente pasa los impactos 2..M a la escena;
       - el mapa marca X1, X2…;
       - el 3D deforma cada zona golpeada;
       - la línea de tiempo muestra cada impacto en su instante.
    3. **E-R6:** los dictámenes del corpus con 3 o más vehículos, reconstruidos con el solver de producción: cuántos son válidos, cuántos se reconstruyen y cuántos de sus impactos ocurren. Va en `eval/results/cesvi_r6_carambolas.json`.
    4. **e2e:** una carambola en `/cesvi/caso`, hasta el 3D.
    - **Riesgos:**
      - el costo de integrar N vehículos juntos (pares × paso de 2 ms), sobre todo en Python con `dmath`;
      - sin posiciones del perito, la disposición de los vehículos de impactos posteriores es un supuesto y se marca así.
  - **Resumen de R3 para René** (rama `feat/r3-visor-3d`; ADR 0063, 0064 y 0065):
    - **Qué quedó:**
      - **El 3D en «Caso nuevo»:** después de «Reconstruir», «Ver la reconstrucción en 3D» abre el visor con la escena reconstruida. Las velocidades de la inversión van marcadas como supuesto, con su rango.
      - **El daño, donde lo narró el perito:** el tercio de la cara pasa a la zona horizontal CDC del impacto.
      - **El reloj del 3D mueve a los vehículos sobre el mapa 2D:** cada uno es un punto con su color y una flecha con su rumbo.
      - **Los vehículos ya no se atraviesan después del impacto:**
        - el solver integra juntos a los vehículos de un choque, con contacto secundario plástico (ADR 0063, resultado 1.8.0);
        - la referencia Python usa el mismo fdlibm que el port TS (ADR 0065).
    - **Números medidos:**
      - **Interpenetración** (`eval/results/r3_interpenetracion.json`, 8 pares en las 11 escenas canónicas):
        - **Antes:** 3 de 8 pares pasaban su aplastamiento, con un máximo de 1.438 m (`nocturno_lluvia`).
        - **Ahora:** 1 de 8, la moto de `motociclista` en t = 0, con 0.083 m. Es la configuración del impacto: a los 0.04 s ya no queda exceso (ADR 0063 explica por qué).
      - **Paridad:** los 66,733 números de los resultados canónicos son iguales en Python y TS, con las tolerancias de siempre (ADR 0065).
      - **Velocidades de impacto y delta-v:** no cambian en ninguna escena canónica (ADR 0063).
    - **Lo que cambió en los resultados** (ADR 0063, «Consecuencias»):
      - en `nocturno_lluvia`, A ya no atraviesa a la combi y recorre 18.78 m en lugar de 30.11 m;
      - en `glorieta`, B recorre 2.47 m en lugar de 2.98 m;
      - en `lateral_interseccion`, la inversión ya no puede llegar a las posiciones finales atravesando a B. Su ajuste queda en A 81.95 km/h, con la bandera `velocidad_vs_evidencia` (la declarada es de 35 a 55 km/h).
    - **Cómo probarlo:** en `/cesvi/caso`:
      1. «Usar una narración de ejemplo» y «Leer la narración».
      2. Acercar el mapa y colocar a V1 y V2 en el impacto y en su posición final.
      3. «Reconstruir» y luego «Ver la reconstrucción en 3D». Al reproducir, los puntos del mapa siguen al 3D.
    - **Pruebas:**
      - unitarias del contacto secundario (Python y TS);
      - la guardia y las tablas de bits de `dmath.py`;
      - la paridad;
      - la e2e de `/cesvi/caso`, que abre el 3D.
    - **Qué necesito de René:** nada. Las capturas y los fps del 3D en «Caso nuevo» se miden a mano antes de una demo con CESVI.
    - **Siguiente:** R6, las carambolas (N vehículos, M impactos en secuencia).
  - **Lo que se planeó para R3:**
    1. **El 3D en «Caso nuevo»:** el visor embebible (`VisorEscena`) con la escena reconstruida, con las velocidades que estimó la inversión, marcadas como supuesto con su rango. Cámaras libre, cenital, de conductor y cinemática.
    2. **El daño en la zona que narró el perito:** el tercio de la cara pasa a la zona CDC del impacto (hoy el visor deforma por lado, con el perfil del solver).
    3. **La línea de tiempo sincronizada con el 2D:** el reloj del 3D mueve a los vehículos sobre el mapa de «Caso nuevo».
    4. **La interpenetración:** una medida de cuánto se atraviesan las cajas de los vehículos en el impacto en las escenas canónicas, y la corrección para que no se atraviesen; con prueba.
    - **Calidad:** respeta los niveles de §7.8 (la laptop es el piso; alta y ultra no se recortan).
    - **Prueba:** la e2e de `/cesvi/caso` abre el 3D en Chromium. Capturas y fps se miden a mano antes de una demo.
  - **Resumen de R2 para René** (rama `feat/r2-reconstruccion`, ADR 0062):
    - **Qué quedó:**
      - **«Caso nuevo» reconstruye con física:** el solver de producción corre en el navegador sobre la escena del perito.
      - **Velocidades:** da cada velocidad con sus percentiles y la evidencia que la fija (p. ej. «posición final de V1»). Sin evidencia no inventa nada: lo dice y pide la evidencia que falta.
      - **Límites en pantalla:** por ejemplo, con más de un impacto calcula el primero, porque las carambolas son R6.
      - **Verificación CESVI al lado:** McHenry y EBS con la fórmula sustituida cuando hay medidas, masa y rigidez. Si falta un dato, dice cuál.
      - **El solver no cambió:** la paridad Python/TS sigue igual.
    - **Números medidos** (`eval/results/cesvi_r2_reconstruccion.json`):
      - 11 de 11 escenas (las 10 de R1 y el caso de AXA) válidas y reconstruidas con incertidumbre; mediana de 425 ms.
      - Ninguna fija velocidades sin posiciones del perito, como debe ser. Con posiciones, la prueba unitaria y la e2e las fijan con percentiles.
      - La verificación con el caso de AXA da 225.454 kJ y 63.90 km/h, lo mismo que C1.
    - **Cómo probarlo:**
      1. En `/cesvi/caso`, narración de ejemplo, «Leer la narración».
      2. Acercar el mapa y colocar a V1 y V2 en el impacto y al final, con su rumbo.
      3. «Reconstruir».
      - Pruebas: `pnpm --filter @croquis/cesvi test` y la e2e `@flujo` de `/cesvi/caso`.
    - **Qué necesito de René:** nada nuevo.
    - **Siguiente:** R3, el 3D de la reconstrucción.
  - **Lo que se planeó para R2:**
    - **Adaptador del expediente (contrato 2.0.0) a la escena del solver (v1):** `buildSpec` da la base válida con sus valores por omisión marcados; encima va la evidencia del perito como declarada:
      - posiciones de impacto y finales en metros desde el punto de impacto;
      - masas;
      - medidas C1–C6 y L como daño declarado;
      - huellas de frenado o derrape.
    - **Reconstrucción:** la inversión existente (velocidades con percentiles y qué fija la evidencia), Monte Carlo y trayectorias. El solver no se toca, así que la paridad Python/TS no se arriesga.
    - **Límites en pantalla:** lo que el solver no cubra (más de un impacto antes de R6, por ejemplo) se dice, no se simula a medias.
    - **«Caso nuevo»** (`/cesvi/caso`) muestra la reconstrucción con rangos y, al lado, la verificación CESVI (C1) con la fórmula sustituida cuando hay medidas.
    - **E-R2:** las 10 escenas de R1 (con lo que fija su evidencia) y el caso de AXA como expediente, contra sus números impresos.
    - **Riesgo:** sin posiciones ni medidas del perito, la evidencia no fija las velocidades; se dice así, sin inventar.
  - **Resumen de R1 para René** (rama `feat/r1-escena`, ADR 0061):
    - **Qué quedó:**
      - **«Caso nuevo» en `/cesvi/caso`:**
        - el perito pega su narración técnica y Croquis la ordena en la escena del contrato 2.0.0 (N vehículos, M impactos con zonas de contacto, objetos fijos, restos, huellas y la descripción de las posiciones);
        - Croquis pregunta solo lo que más cambia la reconstrucción, siempre con «No sé»;
        - el perito coloca a cada vehículo en el mapa con su rumbo.
      - **Fuentes:** lo que marca el perito lleva fuente `perito`; lo que supone Croquis, `supuesto`, hasta que el perito lo confirma.
      - **El caso de AXA sigue igual en `/cesvi`.**
    - **Números medidos** (`eval/results/cesvi_r1_escenas.json`):
      - **Escenas válidas:** 10 de 10 contra el esquema y el validador, de 10 modalidades distintas (narraciones de desarrollo de R0; respuestas grabadas, 0.34 USD).
      - **Impactos:** en 3 la narración dice qué entró en contacto, en 1 Croquis lo supone y pide confirmarlo, y en 6 lo pregunta.
      - **Masas:** ninguna narración las trae; se preguntan.
    - **Cómo probarlo:**
      - abrir `/cesvi/caso`, «Usar una narración de ejemplo» y «Leer la narración»;
      - confirmar el impacto, dar o no saber las masas;
      - elegir «V1 · posición final», escribir el rumbo y tocar el mapa;
      - «Descargar la escena (JSON)».
      - Pruebas: `pnpm --filter @croquis/cesvi test` y la e2e `@flujo` de `/cesvi/caso`.
    - **Qué necesito de René:** nada nuevo.
    - **Siguiente:** R2, la reconstrucción física desde la evidencia del perito.
  - **Lo que se planeó para R1:**
    - **Lectura de la narración a expediente (contrato 2.0.0):** reutiliza el extractor de C0 (filas planas, citas y números revisados contra el texto) con un prompt para la narración del perito. Da N vehículos con clase y masa, M impactos con zonas de contacto, objetos fijos, maniobras, restos, huellas y la descripción de las posiciones finales.
    - **Posiciones:** el contrato las pide con coordenadas, que pone el perito en el mapa (fuente `perito`). De la narración solo salen como descripción, para guiar dónde colocarlas; no se inventan coordenadas.
    - **Preguntas:** solo lo que más cambia la reconstrucción (participantes y zonas de contacto de cada impacto, masas, longitud de restos y huellas, posiciones finales), con «No sé».
    - **E-R1:** 10 narraciones de desarrollo de R0, de modalidades distintas, leídas con Claude. Las respuestas se graban para que CI no llame a la API, y se validan con el esquema y el validador semántico.
    - **Recorrido:** el paso «El hecho» muestra la escena (N vehículos, M impactos), y el mapa coloca a cada vehículo; e2e narración → mapa → escena.
    - **Riesgos:**
      - el mapa del prototipo es de dos vehículos (A y B) y hay que generalizarlo sin romper el caso de AXA;
      - en las carambolas, la asignación de zonas a impactos puede quedar ambigua, y entonces se pregunta.
  - **Resumen de R0 para René** (rama `feat/r0-narracion`, ADR 0060):
    - **Qué quedó:** por cada uno de los 671 dictámenes, en `data/cesvi/corpus/narraciones.jsonl`:
      - la narración de los hechos sin conclusiones, revisada contra fugas;
      - lo que concluyó CESVI (modalidad, zonas de contacto, secuencia de impactos, velocidades y posiciones finales), cada dato con su cita verificada contra el texto.
    - **Números medidos** (`eval/results/cesvi_narraciones.json`):
      - **Narraciones limpias:** 664 de 671; 3 con fuga (todas de desarrollo) y 4 de dictámenes que solo traen conclusiones.
      - **Prueba congelada:** las 205 narraciones están limpias, y 193 traen conclusiones estructuradas. De las otras 12:
        - 8 son dictámenes que no concluyen modalidad, zonas ni secuencia;
        - en 4 el OCR revolvió el texto y las citas no se pueden verificar.

        Están listadas con su motivo.

      - **Citas fuera del texto:** 90 de 2 513, descartadas. **Velocidades descartadas:** 10 de 97.
      - **Costo real:** 10.27 USD; estimado 11.06.
    - **Cómo probarlo:**
      - `pnpm --filter @croquis/cesvi test` (revisión de fuga, citas y conversión, sin la API);
      - `pnpm --filter @croquis/cesvi narracion armar` rearma desde la caché local, sin costo.
    - **Qué necesito de René:** nada nuevo.
    - **Siguiente:** R1, de la narración del perito a la escena.
  - **Lo que se planeó para R0:**
    - **Plan:**
      - **Por dictamen, dos campos más:**
        - la narración del perito sin conclusiones: hechos, lugar, daños, evidencias y medidas, con su revisión automática de fuga (sin cifras de velocidad o energía, métodos ni frases de conclusión);
        - lo que concluyó CESVI: modalidad, zonas de contacto, secuencia de impactos, velocidades y posiciones finales, cada dato con su cita revisada contra el texto.
      - **Código:** `packages/cesvi/src/narracion.ts` y `data/cesvi/scripts/narracion.mts`.
      - **Salida:** `data/cesvi/corpus/narraciones.jsonl` y `eval/results/cesvi_narraciones.json`.
    - **Estimado de costo (antes de correr):**
      - **Entrada:** 6 691 319 tokens (conteo de la API, gratis).
      - **Piloto de 5 dictámenes** con la API normal: 0.1412 USD, con 1 327 tokens de salida en promedio, sin fugas y sin citas fuera del texto.
      - **Los 666 restantes con la API de lotes: ~11.1 USD,** por debajo del tope de 30 USD; se envía con tope de 15 USD.
  - **Resumen de C0 para René** (rama `feat/c0-corpus`, ADR 0058):
    - **Qué quedó:**
      - **Contrato 2.0.0:** `expediente` opcional (N vehículos, M impactos, versiones, cálculos, criterios), migración identidad 1.3.0 → 2.0.0 en TS y Python, Zod y Pydantic generados y validador semántico X001–X009 con paridad. Relatos-MX conserva sus escenas congeladas en 1.3.0 y las valida migradas.
      - **Corpus estructurado de los 671 dictámenes:** `data/cesvi/corpus/expedientes.jsonl`, con las citas redactadas, y `particion.json` (prueba congelada del 30 %).
      - **Medición por palabras clave:** `eval/cesvi_corpus.mjs` → `eval/results/cesvi_corpus.json`. Dice si el dictamen _menciona_ el tema, no si lo analiza.
      - **Revisión ciega** de la etiqueta de la conclusión: `eval/cesvi_concordancia.mts` → `eval/results/cesvi_concordancia.json`.
    - **Números medidos** (`eval/results/cesvi_corpus_extraccion.json`, `cesvi_concordancia.json`):
      - **Válidos contra el esquema y el validador:** 668 de 671. Los 3 que no:
        - 2 dictámenes de un solo vehículo que no nombran contra qué fue el impacto (X004);
        - 1 que escribe la altura del daño como «110 y 130 metros» (no se corrige: sería inventar).
      - **Citas fuera del texto:** 406 de 15 800 (se descartan). **Números que no están en su cita:** 313 de 3 129 (se descartan).
      - **Datos personales tras redactar:** 0.
      - **Partición:** 205 de prueba y 466 de desarrollo.
      - **Estructura** (sobre los 668 válidos):
        - **Conclusión:** no se sostiene 332, se sostiene 157, parcial 103, sin juicio 65, sin conclusión 11.
        - **Vehículos e impactos:** 3 o más vehículos en 104; más de un impacto en 144; con declaración, 581.
        - **Modalidad principal:** alcance 186, lateral 126, otra 120, objeto fijo 81, volcadura 34, reversa 32, salida de camino 31, frontal 27, crucero 10, carambola 3, sin modalidad 18.
        - **Criterios analizados:** intercambio 476, forma 396, altura 385, magnitud 291, dirección 195, daño previo 115, lugar 111.
        - **Cálculos:** prueba de choque 18, bolsas de aire 15, desplazamiento 14, EBS 8, huellas de frenado 6, McHenry 3, cantidad de movimiento 3 y otros 114.
      - **Concordancia de la conclusión:**
        - **Acuerdo:** 35 de 47 (74.5 %), kappa de Cohen 0.68.
        - **Los desacuerdos** caen en la frontera entre parcial, no se sostiene y sin juicio.
        - **El segundo lector es Claude Code, no un perito.**
        - **Para las fases siguientes:** la etiqueta sirve para estratificar y describir, no como verdad de referencia fina.
      - **Costo real:** 18.47 USD; estimado previo: 18.29 USD con la API de lotes, debajo del tope de 30.
        - **Desglose:** piloto, 0.26 USD; lote de 666, 16.45 USD; relectura de 41 inválidos con el prompt v3, 1.76 USD.
    - **Las cifras del §2 del plan** ya se pueden citar, desde los dos resultados de arriba.
    - **Cómo probarlo:**
      - `pnpm --filter @croquis/cesvi test`: extractor, conversión, redacción y partición, sin la API;
      - `pnpm --filter @croquis/scene-schema test`: contrato y validador;
      - `pnpm --filter @croquis/cesvi corpus armar` rearma el corpus desde la caché local, sin costo; requiere `data/raw/cesvi/`.
    - **Qué necesito de René:**
      - **Opcional:** que un perito de CESVI etiquete la hoja ciega (47 conclusiones, `data/raw/cesvi/revision-ciega.md`, fuera de git) para medir el acuerdo con una persona.
    - **Siguiente:** C1 (hecha, abajo).
  - **Resumen de C1 para René** (rama `feat/c1-calculo`, ADR 0059):
    - **Qué quedó:**
      - **Motor** (`packages/cesvi/src/calculos.ts`): los métodos que usan los dictámenes, además de McHenry, EBS y desplazamiento:
        - frenado por huellas, derrape con fricción equivalente y frenado con arrastre;
        - velocidad crítica en curva (la forma de CESVI con 11.27 y la completa), radio por cuerda y flecha, y vuelco;
        - tiro parabólico, trabajo de fricción, velocidad por energías y energía cinética;
        - distancias de reacción y de frenado;
        - cantidad de movimiento colineal y en el plano;
        - comparación con un umbral.
        - Cada uno con su fórmula sustituida (`formulas.ts`).
      - **Rigidez por vehículo** (`rigidez.ts`): perito, dictamen, tabla de CESVI o E2. Siempre dice de dónde sale, y el respaldo sin pruebas va marcado como supuesto.
      - **Umbrales y pruebas de choque citados** en los dictámenes, con quién los cita (`data/cesvi/calculos/referencias.json`); Croquis no fija ninguno.
      - **E-C1:** `eval/cesvi_reproduccion.mts` con 148 fichas transcritas de 39 dictámenes (`data/cesvi/calculos/fichas.json`).
    - **Números medidos** (`eval/results/cesvi_reproduccion.json`):
      - **Métodos:** reproducen 79 de 98 recalculados dentro de 0.5 % (desarrollo 61 de 75, prueba 18 de 23).
      - **Las 19 que no,** con su motivo revisado contra el texto:
        - 7 con una fórmula distinta a la impresa (6 de ellas en dos dictámenes casi iguales);
        - 5 erratas del dictamen (tan en radianes, tan α impresa y no sumada, 4S² contra 2S², V sin cuadrado);
        - 3 de redondeo;
        - 3 sin explicar, entre ellas la energía de A2010930;
        - 1 sin la sustitución.
      - **No se pudieron recalcular 30:** 16 por datos que no se imprimen (sobre todo McHenry hecho con un programa), 6 por OCR, 4 con datos sin definir y 4 comparaciones sin número.
      - **Aritmética:** 20 de 20.
    - **Cómo probarlo:**
      - `pnpm --filter @croquis/cesvi test` (97 pruebas, con casos de desarrollo citados por ficha);
      - E-C1: `cd packages/cesvi && pnpm exec tsx ../../eval/cesvi_reproduccion.mts`.
    - **Qué necesito de René:**
      - la tabla de rigideces de CESVI (ya estaba en «Bloqueado»);
      - si se puede, preguntarle a CESVI por los hallazgos de las erratas (lista en ADR 0059).
    - **Siguiente (plan v2):** R0, que agrega al corpus la descripción sin conclusiones y lo que concluyó CESVI. Antes de procesarlo con Claude se estima el costo y se anota aquí.
- **UI unificada (2026-10-21)** (rama `feat/cesvi-ui-unificada`, ADR 0057; maquetas Paso4Trabajo, Paso8 y Paso2Claro):
  - **Liga:** https://croquis-sage.vercel.app/cesvi
  - **Qué hay:**
    - **Modos Presentar y Trabajar** con los mismos datos. Trabajar tiene herramientas de colocación, las vistas Declarada, Evidencia, Superponer y Lado a lado, el objeto elegido en metros desde el impacto (rumbo y fuente editables), «Restablecer posición» y deshacer.
    - **Línea de tiempo** con eventos y velocidades de 0.1×, 0.25× y 1×.
    - **«Qué cambia entre versiones»** en Trabajar y en el paso 7.
    - **Paso 2:** la frase bajo cada dato, la completitud, las casillas de lo que falta y «¿Qué falta?» con «por qué importa» y «No sé».
    - **Barra superior:** el estado de la IA y «Llenar a mano».
    - **Paso 8:** vista previa; PDF, Word, croquis PNG y caso JSON; qué incluir; trazabilidad; y «Antes de firmar».
    - **Tema claro y oscuro** con interruptor: claro al trabajar y oscuro al presentar, recordado por modo.
  - **Cómo probarlo:**
    1. En el paso 4, «Trabajar». Elegir «A · posición inicial / final» y cambiar «y desde el impacto»; probar «Lado a lado» y 0.25×.
    2. Interruptor ◐.
    3. En el paso 8, Word y Caso JSON.
  - **Pruebas:**
    - **Unitarias:** comparación, completitud, llenado a mano, «No sé», eventos y contraste del tema claro.
    - **E2E:** la del recorrido cambia de modo y de tema y exporta PDF, Word y JSON.
- **Ubicación ilustrativa y maqueta de «El hecho» (2026-10-21)** (rama `feat/cesvi-ubicacion-ilustrativa`, ADR 0056):
  - **Liga:** https://croquis-sage.vercel.app/cesvi
  - **Qué cambió:**
    - **Ubicación ilustrativa del km 47+800**, a pedido de René, para mostrar que funcionan las coordenadas: 26.20915, −109.05970, sobre la carretera federal 15 (MEX 15D), en el arroyo que va hacia el norte, a 47.0 km de Los Mochis. La genera `data/cesvi/scripts/ubicacion-ilustrativa.mjs` desde el tramo precargado.
    - **Dónde se dice que no es el lugar real:** en el paso 3, con la insignia «supuesto» y un aviso; en el punto marcado, con la insignia «ilustrativa»; y en el pie del croquis del PDF.
    - **La maqueta `docs/cesvi/rediseno/Paso2.html`:** la reescribió Croquis con la pantalla de «El hecho» y el ejemplo del caso, en el formato de las demás maquetas.
  - **Cómo probarlo:**
    1. En el paso 3, «Usar esta ubicación».
    2. Luego «Cambiar ubicación», escribir `26.22848, -109.05424` y «Mover el punto»: el aviso de ilustrativa desaparece.
    3. En el paso 8, el PDF dice el punto de impacto.
  - **Pruebas:**
    - **Unitarias:** la ubicación está sobre la MEX 15 del tramo; un punto movido ya no es la ilustrativa; el PDF la dice ilustrativa.
    - **E2E:** la del recorrido usa la ubicación ilustrativa y luego la mueve.
- **El hecho y el punto editable (2026-10-21)** (rama `feat/cesvi-hecho-y-lugar`, ADR 0055):
  - **Liga:** https://croquis-sage.vercel.app/cesvi
  - **Qué cambió:**
    - **Paso 2, «El hecho»:**
      - **Las entradas:** la descripción técnica del perito, la principal, arma la versión de la evidencia. La versión declarada del conductor, la secundaria, arma la declarada.
      - **La lectura:** con Claude y un prompt en lenguaje técnico de CESVI, que lleva el glosario de 114 términos con su frecuencia en los 671 dictámenes (`data/cesvi/glosario.json`; el texto de los dictámenes no se sube). Sin Claude, la hace con reglas sobre el mismo glosario.
      - **Los datos:** cada uno lleva su fuente (perito, conductor, expediente o supuesto) y su frase resaltada en el color de su vehículo. Si la frase no está en el texto, el dato se descarta. Un número que no está en su frase, se quita.
      - **Las preguntas:** son técnicas («¿Carril de A al momento del impacto?», «¿Cuántos metros de reversa?») y las contestadas se pueden cambiar.
      - **Sin palabras de la versión para el público** («relato», «Cuenta qué pasó», «tu dispositivo»).
    - **Paso 3:**
      - **«Cambiar ubicación»:** se arrastra la ✕, se toca el mapa o se escriben coordenadas, y los vehículos se mueven y giran con el punto.
      - **Calles al moverlo:** se traen al instante del tramo precargado y de los mosaicos, sin esperar a Overpass.
      - **Más controles:** «Quitar punto», «Restablecer posiciones», y deshacer y rehacer con botones y con Ctrl+Z, Ctrl+Shift+Z y Ctrl+Y en los pasos 3 y 4.
    - **Ejemplo del caso AXA:** una descripción técnica escrita por Croquis con palabras propias (`data/cesvi/casos/A2010930-hecho.json`; no copia el dictamen ni dice el carril). Su lectura con Claude y la de la declaración están grabadas, y se usan en CI.
  - **Gasto:** 0.0527 USD en grabar las lecturas.
  - **Cómo probarlo:**
    1. **Paso 2:** «Usar el ejemplo del caso», «Leer la descripción», contestar el carril y los metros de reversa.
    2. **Paso 3:** marcar el punto, «Cambiar ubicación» y mover el punto; luego Ctrl+Z, Ctrl+Shift+Z, «Quitar punto», «Deshacer» y «Restablecer posiciones».
  - **Pruebas:**
    - **Unitarias:** el glosario, las citas, la lectura con reglas, la validación, la interpretación con la grabación de Claude, el historial y el traslado del punto.
    - **E2E:** la del recorrido, ampliada. Llena la descripción técnica, mueve el punto, deshace y rehace con botones y teclado, y lo quita y lo restablece.
  - **La maqueta `docs/cesvi/rediseno/Paso2.html`:** no había versión nueva en el disco; René pidió que la hiciera Croquis (ADR 0056).
- **Rediseño visual de /cesvi (2026-10-21)** (rama `feat/cesvi-rediseno`, ADR 0054; maquetas en `docs/cesvi/rediseno/`):
  - **Liga:** https://croquis-sage.vercel.app/cesvi
  - **Qué cambió:**
    - **Tokens nuevos** en `assets/brand/tokens.json`: grafito, blanco y una sola señal (#FF5B2E). A es #5AA9FF y B es #FFC24B. La acción principal es un botón blanco con texto grafito. Una prueba revisa el contraste de 4.5:1 desde los tokens.
    - **Tipografía:** Geist para la interfaz y Geist Mono para cifras y rótulos (paquete `geist` 1.8.1, OFL, registrado en `assets/ASSETS.md` y en el ADR 0001). Anybody queda solo en el logotipo.
    - **Puntero:** una regla global en la capa base pone la mano en todo lo que se toca o se arrastra, y `not-allowed` en lo desactivado.
    - **Composición como en las maquetas:**
      - barra de pasos en una fila, con el caso y «Exportar» a la derecha;
      - pasos 3 y 4 con paneles de vidrio sobre el mapa; en el 4, leyenda arriba a la derecha y reproductor con línea de tiempo abajo;
      - pasos 1, 2, 5, 6, 7 y 8 en página: el 2, el 6 y el 7 siguen su maqueta, y el 1, el 5 y el 8 usan el mismo sistema;
      - en cada pantalla, una frase, «Ver detalle» y Anterior · Siguiente.
    - **A y B con su color y su etiqueta en todo el recorrido:** mapa, frases de la narración, daños, números, sugerencia y PDF.
    - **El mapa, como la maqueta:**
      - posición final sólida e inicial punteada;
      - trayectorias;
      - restos como banda rayada con su medida;
      - la X con resplandor;
      - la otra versión superpuesta (casilla «Superponer»).
    - **Marca:** la X pasa a #FF5B2E; el símbolo y el logotipo no cambian. Se regeneraron los SVG con `make_brand.py`; salvo la X, son idénticos a los anteriores. Íconos, favicon y manifiesto, con `pnpm marca`.
    - **`PROTOTIPO.md`:** ya dice que la demo es pública y sin datos personales.
  - **Cómo probarlo:** abrir la liga y recorrer los 8 pasos con →.
    - **Paso 2:** las frases van en el color de quien las dice; lo que falta, en señal.
    - **Paso 4:** reproducir, arrastrar la línea de tiempo, alternar Declarada · Evidencia y la casilla «Superponer».
    - **Paso 7:** «Aceptar y seguir» lleva al dictamen.
  - **Pruebas:** la e2e del recorrido en verde, adaptada a la composición nueva, y la prueba de contraste y colores. No hay capturas de referencia.
- **Ajustes al recorrido tras la revisión de René (2026-10-21)** (rama `feat/cesvi-ajustes-recorrido`, ADR 0053):
  - **Liga:** https://croquis-sage.vercel.app/cesvi, ahora pública: sin usuario ni clave.
  - **Qué cambió:**
    - **Acceso:** se quitaron `proxy.ts` y las variables `CROQUIS_CESVI_*` de Vercel (ADR 0049, reemplazado). El borrador con Claude sigue con el tope de gasto diario y el límite por hora.
    - **Paso 3:** marcar el impacto ya no espera a Overpass.
      - **De dónde salen las calles:** del tramo precargado de la MEX 15 Los Mochis–Navojoa, de OSM (`data/cesvi/casos/A2010930-tramo.json`, registrado en `data/SOURCES.md`), y de los mosaicos que el mapa ya cargó.
      - **Overpass:** llega después y solo agrega nombre, carriles y ancho.
      - **Sin Nominatim:** la cámara encuadra el tramo precargado.
    - **Paso 4:**
      - cada vehículo lleva su nombre («A · Silverado», «B · Tacoma») y su color fijo, en todo el recorrido y en el PDF;
      - cada punto tiene su etiqueta en dos columnas, con una línea al punto;
      - lo elegido se resalta y dice qué es y de qué versión;
      - hay una leyenda abajo a la derecha.
  - **Cómo probarlo:**
    1. En el paso 3, escribir `25.97385, -109.03543` (sobre la MEX 15) o tocar la carretera: las calles y los vehículos aparecen al instante.
    2. En el paso 4, tocar cualquier etiqueta o punto, arrastrar un punto y alternar las versiones.
  - **Pruebas:**
    - **E2E:** la del recorrido retiene Overpass y comprueba que el paso 3 dibuja las calles en menos de 1 s y que después llega el ancho de la vía. También revisa los nombres A y B, las etiquetas de cada marca, el resaltado y la leyenda.
    - **Unitarias:** `tramo.test.ts` (tramo y calles cercanas), `etiquetas-mapa.test.ts` (nueve puntos en el mismo lugar no se enciman) y `vehiculos-cesvi.test.ts` (nombres, y el mismo color en el CSS y el PDF).
  - **Medición en producción** (`node eval/cesvi_lugar.mjs`, 5 corridas con navegador nuevo, Overpass sin responder → `eval/results/cesvi_lugar.json`):
    - **Del clic a las calles, según la página:** mediana 396 ms, máximo 477 ms. Cumple la meta de menos de 1 s.
    - **Visto desde Playwright:** de 1122 a 1484 ms. Esa cifra suma lo que Playwright tarda en hacer el clic y en consultar la página; Chromium corre sin GPU (SwiftShader).
    - **Antes:** marcar el punto esperaba a Overpass, unos 45 s en producción (lo que se vio en la revisión).
  - **`docs/cesvi/PROTOTIPO.md`:** a pedido de René, ya dice que la demo es pública y sin datos personales (rama `feat/cesvi-rediseno`).
- **Hito 4 — el recorrido del perito** (rama `feat/cesvi-recorrido`, ADR 0052):
  - **Liga:** https://croquis-sage.vercel.app/cesvi (hasta el 2026-10-21 pedía usuario y clave).
  - **Qué hay:** `/cesvi` es ahora un recorrido de 8 pasos.
    1. El caso, con los vehículos vistos desde arriba y la declaración.
    2. Lo que entiende la IA: frases subrayadas, datos con su fuente y preguntas.
    3. El lugar: el mapa vuela al tramo y el perito marca el punto.
    4. Las dos versiones animadas, con la zona de restos.
    5. Los daños: dónde están contra dónde estarían.
    6. Los dos números en grande, con «Ver cálculo».
    7. La sugerencia con sus tres razones.
    8. El dictamen en PDF.

    Barra de pasos arriba, ← → con el teclado, una frase por paso y el detalle en un panel.

  - **Cómo probarlo:** abrir la liga y avanzar con →. En el paso 2, contestar «¿Cuántos metros de reversa?». En el paso 3, tocar el punto de impacto en el mapa. En el 4, alternar las versiones. En el 7, escribir un nombre y aceptar. En el 8, descargar.
  - **Pruebas:** `packages/cesvi/src/declaracion.test.ts` (con la respuesta grabada de Claude) y una sola e2e que recorre los 8 pasos.
  - **Gasto:** 0.0214 USD para grabar la lectura de la declaración con Claude.
  - **Qué necesito de René:** la ubicación del km 47+800, con coordenadas o una foto aérea (OSM no tiene marcas de kilómetro en el tramo); mientras, el perito marca el punto. La vista previa del PDF se ve en Chrome, Edge o Safari de escritorio.
- **Hito 2 — el lugar y el croquis sobre el mapa** (rama `feat/cesvi-hito2`, ADR 0050):
  - **Liga:** https://croquis-sage.vercel.app/cesvi, sección «El lugar y el croquis» (pide usuario y clave).
  - **Qué hay:**
    - mapa con MapLibre GL y mosaicos de OpenFreeMap;
    - búsqueda del lugar (Nominatim) o coordenadas, y el punto de impacto; Croquis importa las calles de OSM y toma el rumbo de la vía;
    - las dos versiones a escala: la de la evidencia (A termina a 15.89 m y los restos van del impacto a ahí) y la declarada (A retrocede «unos metros» y no hay desplazamiento);
    - herramientas para mover y girar cada vehículo en cada fase, mover el punto de impacto y los extremos de la zona de restos, medir distancias y llevar la separación medida al cálculo 2; cada posición dice su fuente.
  - **Cómo probarlo:** en «El lugar y el croquis», buscar el lugar o escribir coordenadas y tocar el punto de impacto. Cambiar entre las dos versiones: en la de la evidencia, R1–R2 mide 15.89 m; en la declarada, 0 m. Con «Usar esta distancia en el cálculo 2», V3 pasa de 60.27 km/h a 0 km/h en la declarada.
  - **Pruebas:** `packages/cesvi/src/versiones.test.ts` (geometría y versiones) y la e2e `@flujo` de `/cesvi`, con mapa y vía sintéticos.
  - **Qué necesito de René:** la ubicación del km 47+800 (coordenadas o una foto aérea); el dictamen no la da y está en las preguntas para CESVI. Mientras, el perito marca el punto a mano.
- **Incidente de estilos en producción (2026-10-20), resuelto:** el despliegue del PR #63 salió con el CSS de la plantilla de Next (fondo #0a0a0a, Arial, sin `--fondo` ni Anybody) aunque el código era el nuevo. No faltaba nada en git: el build de Vercel restauró la caché de un despliegue anterior a F11a, y el siguiente (PR #64) salió bien. En la laptop y en CI el build siempre estuvo bien.
  - **Comprobado en producción:** en `:root`, `--fondo` vale `#0b0d0f`, el texto va en Anybody y la portada y `/cuenta` se ven como en local.
  - **Para que no se repita:** `apps/web/scripts/css-check.mjs` corre dentro de `pnpm build` (en Vercel y en CI) y falla si el CSS generado no trae `--fondo`, los tokens de la marca, Anybody y las clases del sistema. Tarda milisegundos. Contra el CSS del despliegue malo falla en los 6 requisitos.
  - **Además:** producción construye sin caché (`VERCEL_FORCE_NO_BUILD_CACHE=1` en Vercel): cada despliegue tarda un poco más, pero no reutiliza nada de un build anterior.
- **F11a cerrada** (PR #63). **F11b (E9 con personas) en pausa** mientras dure el trabajo con CESVI; el kit de E9 sigue listo.
- **F11a — experiencia y diseño** (PLAN §11, iniciada el 2026-10-19; rama `feat/f11a-diseno`).
  - **Plan:** `docs/design/plan.md`, con la revisión contra lo genérico. Las decisiones van en el ADR 0045.
  - **Orden de trabajo:**
    1. base: tokens desde `assets/brand/tokens.json`, Anybody autoalojada, marca, íconos, imagen para redes, encabezado, pie e idioma;
    2. flujo guiado `/cuenta` y visor;
    3. portada con cámara por scroll, capa de croquis, revelado y control de velocidad;
    4. demo, recorrido, `/e9`, `/medicion` e historia;
    5. pruebas (e2e escritorio y celular, capturas, axe y movimiento reducido), crítica con capturas, revisión independiente, Lighthouse, LCP y CLS, y E6;
    6. despliegue y la nota «listo para E9».
  - **Interpretación registrada:** `/medicion` es una página para medir E6 en el navegador de la computadora de demo; PLAN §11.5 la nombra pero no la define.
  - **Necesita a René:** la prueba piloto informal con una persona, porque requiere a alguien real.
  - **Avance (2026-10-20, rama `feat/f11a-diseno`):**
    - **Hecho — base:** tokens generados desde `tokens.json`, Anybody autoalojada, marca copiada tal cual, íconos, favicon y manifiesto (`pnpm marca`, comprobados en `generate:check`), rutas `app/(es)` y `app/(en)/en` y el marco del sitio.
    - **Hecho — flujo y visor:** `/cuenta` con sus 4 pasos (`/relato` redirige a `/cuenta`), visor con lecturas, traza y pantalla dividida, croquis sobre papel, y los mensajes del sistema en inglés con su prueba de cobertura. Los paneles de resultados y el informe PDF son bilingües.
    - **Hecho — portada:** los 12 capítulos sobre la escena de Toluca (`components/portada/`), revelación del croquis al 3D, tiempo por scroll con telemetría, control de velocidad que recalcula en el navegador, hipótesis fantasma, cotas de las pruebas y comparador de E5. Cuadros fijos por capítulo e imagen para redes renderizados por el visor (`pnpm portada`, comprobados en `generate:check`). Movimiento reducido sin 3D.
    - **Hecho — demás páginas:** demo, `/e9`, recorrido e historia bilingües en el sistema; datos de las páginas en `{ es, en }` desde `eval/results`; `/medicion` (E6 en el navegador) con `eval/e6_navegador.mjs`. Exportaciones en inglés sin «semilla».
    - **Hecho — pruebas:** e2e de portada, flujo con los 5 eventos de E9, accesibilidad con axe en todas las páginas y pasos, capturas visuales de cada capítulo y paso (referencias en Linux), proyecto de celular, movimiento reducido, sin errores de consola y sin desplazamiento horizontal. Correcciones que salieron de ahí: nombre del enlace de idioma, regiones con desplazamiento enfocables y desbordamiento del croquis en el celular.
    - **Hecho — carga:** three.js y Zod fuera del JavaScript inicial, CSS dentro del HTML y `/cuenta` dibujado en el servidor (ADR 0045 §5).
    - **Hecho — revisión independiente:** 23 hallazgos; 21 corregidos y 2 que no se cambian, con su razón (`docs/design/plan.md` §11). Entre los corregidos: el service worker servía la portada al recargar `/en/…` y `/cuenta`, y la «í» de Anybody se leía «i» a tamaño de lectura (copia corregida con `scripts/fuente.py`).
    - **Hecho — CLS y carga:** la primera medición de Lighthouse dio CLS arriba de 0.1 en `/en`, `/historia`, `/croquis`, `/visor` y `/medicion`. Las causas eran la fuente que llegaba tarde y páginas dibujadas solo en el navegador (ADR 0045 §5):
      - **Fuente:** no se precarga, porque retrasaba el primer pintado. El respaldo tiene las medidas de Anybody en cada rol, los textos al 150 % esperan a Anybody, y los ejes van recortados.
      - **Portada:** el lema tiene renglones fijos y la leyenda del celular va en dos renglones.
      - **Páginas del navegador:** `/medicion` sale del servidor y `/visor` reserva su lugar.
      - **Medición:** `eval/f11_portada.mjs` espera hasta 120 s a que la página quede en reposo y repite las corridas que Lighthouse no termina, anotándolas.
    - **Hecho — la portada ya no se congela por los horneados** (ADR 0046): los horneados con Rapier ceden el hilo principal. La precompilación de materiales se midió y se descartó (`eval/results/f11_tareas_largas*.json`).
    - **Hecho — e2e completo** en escritorio y celular, por bloques, con el build de la fuente nueva. `eval/results/f9_precarga.json` está al día.
    - **Siguiente:**
      1. con la laptop conectada, volver a medir con Lighthouse `/en` y `/visor` (el build cambió desde que se midieron: sin precompilación); las otras 8 páginas ya están medidas con este código o con uno que no cambia la carga. Después, `node eval/f11_portada.mjs --unir`. E1 no cambia (la extracción no se tocó). E6 queda para René (ver «Bloqueado»);
      2. PR, CI con las referencias visuales nuevas, merge y despliegue en Vercel;
      3. nota «listo para E9».
- **Fase actual: F11** (ver PLAN §13). F10 quedó cerrada el 2026-10-18 (#42 a #46): E5 publicado (test corrido una vez) y la galería con fotos reales. F9 quedó cerrada el 2026-10-17 (#25 a #41): demo sin red, E7 y E8 en verde y todas las exportaciones. F8 se cerró el mismo día (#20 a #24, E6 cumple).
- **Pendientes físicos de F7:** hechos. El pendiente 1 (test CISS de Relatos-MX y prompt v2) quedó hecho el 2026-10-14 (PR #11, ADR 0012).
- **Rigidez lateral, hecha** (PR #12, ADR 0013). Sale de 1,265 pruebas de barrera móvil de NHTSA. En el test de E3, el error en costados baja de 11.04 a 8.51 km/h.
- **Rigidez trasera, hecha** (PR #13, ADR 0014). Sale de 136 pruebas FMVSS 301 con barrera rígida, modelos 1975–2004. En el test de E3, el error en traseros baja de 16.45 a 7.68 km/h; en conjunto, 8.85 km/h contra 8.19 de WinSMASH.
- **Inercia de guiñada medida, hecha** (PR #15, ADR 0015). Viene de la base de parámetros inerciales de NHTSA, 164 vehículos medidos: el error de la inercia baja de 10.0 % con la placa uniforme a 5.3 %.
- **Fase de las marcas, hecha** (rama `feat/f7-marcas-derrape`, ADR 0016). Contrato 1.1.0 con `evidencias[].fase`, resultado 1.5.0 y la evidencia nueva `marcas_despues` en la inversión.
- **Moto caída, hecha** (rama `feat/f7-moto-caida`, ADR 0017): arrastre medido de Peck et al. 2014, muestreado en Monte Carlo y en la inversión; resultado 1.6.0.
- **Fase de las marcas en la extracción, hecha** (rama `feat/f7-fase-extraccion`, ADR 0019): reglas y prompt v3, que pasa a producción.
- **F9, paso 1 hecho** (rama `feat/f9-optimizador`, ADR 0027): la inversión usa álgebra lineal (`linalg.py`) y optimizador (`lsq.py`) propios, en Python puro. Frente a SciPy en las 8 escenas con inversión: converge en 8, costo total 24.273 contra 28.5212 y 118 evaluaciones contra 152; mejor en 2, igual en 3 y peor en 3 (`eval/results/f9_optimizador.json`).
- **F9, paso 2 hecho** (rama `feat/f9-port-inversion`): el solver TS produce el resultado completo, con Monte Carlo, inversión y consistencia (`fullResult`). E7 lo compara entero: 68,557 números a 1e-6, más 217 de inversión y consistencia con diferencia máxima 0.01 (ADR 0027).
- **F9, paso 3 hecho** (rama `feat/f9-workers`, ADR 0028): la escena propia (del relato o el croquis, con «Ver en 3D») se reconstruye en el navegador. El Web Worker responde dos veces: primero la reconstrucción para dibujar y después el resultado completo para los paneles; el visor 3D se queda con la primera y la página no se congela. Lo cubren 3 pruebas e2e.
- **F9, paso 4 hecho** (rama `feat/f9-e8`, ADR 0029): E8 cumple. El resultado completo del solver y el horneado con Rapier (restos, volcaduras y ragdolls) son idénticos en Chromium, Firefox y WebKit en las 11 escenas (`eval/results/e8_determinism.json`); antes, con `Math` nativo, el solver coincidía en 8 de 11. Lo logra `dmath` (fdlibm en TS, igual a V8 bit a bit) y `dthree`; el solver completo cuesta ×1.22 en V8 (`e8_costo_dmath.json`), dentro del Web Worker. CI corre E8 en un trabajo propio.
- **F9, paso 5 hecho** (rama `feat/f9-offline`, ADR 0030): la demo funciona sin red. Serwist precarga 67 entradas (11.05 MB, `eval/results/f9_precarga.json`): trozos, cuerpos, texturas, el worker del solver y las páginas. La prueba e2e con la red cortada abre el inicio, el visor en alta (Rapier, ragdoll y texturas), el croquis con «Ver en 3D» (resultado completo en el worker) y el relato, que avisa que necesita red. En E6 (`e6_ab_sw_*.json`), sin costo medible en media; en baja con WebGPU, 0.10 ms por cuadro (85.5 contra 86.1 fps).
- **F9, paso 6a hecho** (rama `feat/f9-exports`, ADR 0031): cuadro PNG (720p, 1080p, 4K o el del visor) y escena glTF con animación, desde el panel «Exportar» del visor. La leyenda vive en `@croquis/scene-schema` y va dibujada y como texto del archivo. Las pruebas e2e abren cada archivo descargado.
- **F9, paso 6b hecho** (rama `feat/f9-video`, ADR 0031): video MP4 y WebM de toda la reconstrucción, dibujado cuadro por cuadro con WebCodecs y Mediabunny, con la marca en cada cuadro y en los metadatos. El respaldo con MediaRecorder se vuelve a fechar cuadro por cuadro.
- **F9, paso 6c hecho** (rama `feat/f9-croquis-export`, ADR 0031): el croquis se exporta en SVG, PNG y PDF desde el editor, con la marca, la semilla, el hash, la atribución de OSM, el norte y una barra de escala nueva.
- **F9, paso 6d hecho** (rama `feat/f9-informe`, ADR 0031): informe PDF desde el visor. Los paneles y el informe comparten sus textos (`lib/textos-resultado.ts`) y los datos inciertos se dicen en palabras. **F9 cerrada.**
- **F10, paso 1 hecho** (rama `feat/f10-inventario`): inventario de E5 en `docs/data.md` y en `eval/results/e5_inventario.json`. Hay 3,620 casos de NHTSA y 8,804 de CISS con perfil medido completo; los números por tipo están en el inventario. CISS ahora trae la posición del daño, con su convención comprobada.
- **F10, paso 2 hecho** (rama `feat/f10-particion`, ADR 0032): el método de E5 quedó escrito antes de medir y la partición está congelada (`eval/e5/particion.json`, SHA-256 `2a894e09…`).
- **F10, pasos 3 y 4 hechos** (rama `feat/f10-reproductor`, ADR 0033): el reproductor de E5 en TS y el ajuste de la forma y el ancho del daño por zona, solo con desarrollo. La malla del visor sigue al solver con una mediana por zona de 0.04 a 0.86 cm por estación. Cambian cinco grupos de zonas; en desarrollo, el error por punto en laterales de CISS baja de 4.99 a 4.67 cm (`eval/results/e5_desarrollo*.json`).
- **F10, paso 5 hecho** (rama `feat/f10-test`): el test de E5 se corrió **una vez** en `e74d971`, con todo fijo (`eval/results/e5.json`). Los números y su lectura honesta están en el README.
- **F10, paso 6 hecho** (rama `feat/f10-galeria`): la galería de E5 está en `docs/galeria-e5/README.md`. Tiene 9 pares de foto real y render de Croquis: 3 frontales, 3 laterales y 3 de poste. El frontal desplazado y el alcance no tienen foto verificable en el test. **F10 cerrada.**
- **F11, paso 1 hecho** (rama `feat/f11-recorrido`, ADR 0034): página de historia (`/historia`) y recorrido técnico (`/recorrido`), con datos generados desde `eval/results/` y una revisión en CI.
- **F11, paso 2 hecho** (rama `feat/f11-demo`, ADR 0035): la demo «Tú eres…» (`/demo`) usa seis relatos de ejemplo con la respuesta grabada de Claude. Las preguntas se contestan en el navegador, y la escena se abre en el croquis o en el visor 3D con hipótesis, sin servidor y sin red.
- **F11, paso 3 hecho** (rama `feat/f11-readme`): el README queda completo contra el checklist de PLAN §15. Lleva el subtítulo, el estado al día y las páginas nuevas, y se agregaron estas secciones:
  - mapa del repo con la documentación de respaldo;
  - pruebas;
  - datos y lo que no cubren;
  - IA responsable;
  - límites medidos y siguiente paso;
  - licencia y atribución (NHTSA, INEGI, OSM, Relatos-MX y assets).
- **F11, pasos 4 y 5 hechos** (rama `feat/f11-guiones`):
  - **Guiones** de los tres videos en `docs/guiones/`.
  - **Kit de E9 listo** para que René lo corra: protocolo, consentimiento, la página `/e9` que anota solo métricas en el dispositivo, y `uv run croquis-eval e9`.
- **F11, paso 6a hecho** (rama `feat/f8-grava`, ADR 0036): la grava suelta ya no se ve como camuflaje.
  - **Todas las calidades:** manchas chicas con bordes suaves y grano de piedra.
  - **Alta y ultra:** textura CC0 que solo se carga si la escena la usa.
  - **Costo** (E6 antes y después en `objeto_fijo_arbol`): 0.5 ms por cuadro en media y 0.27 ms en baja.
  - **Atribución corregida en `assets/ASSETS.md`:** el asfalto es de Dimitrios Savva y el pasto de Charlotte Baglioni.
- **F11, paso 6b hecho** (rama `feat/f8-camellon`, ADR 0037): el camellón se corta a nivel de calle en los pasos peatonales y las rayas centrales se interrumpen.
- **F11, paso 6c hecho** (rama `feat/f8-semaforo-peatonal`, ADR 0038): semáforo peatonal con el contrato 1.3.0. Queda fuera del esquema del LLM, así que los prompts v1–v3 y sus grabaciones no cambian.
- **F11, paso 6d hecho** (rama `feat/f8-osm-rayas`, ADR 0039): las calles de OSM llevan rayas cuando OSM trae `lanes`, y banquetas y guarniciones según la escena. Todo se corta en los cruces.
- **F11, paso 6e hecho** (rama `feat/f8-osm-produccion`, ADR 0040): calles de OSM en producción. El croquis trae las calles del cruce real a partir de coordenadas, con caché, límite por IP y tres instancias de Overpass.
- **F11, paso 6f hecho** (PR #56 y rama `feat/f11-osm-reintentos`, ADR 0040): prueba real de `/api/osm` en producción.
  - **Resultado:** llegó a Overpass y trajo las mismas 22 calles del extracto versionado; la repetición salió de la CDN (`eval/results/osm_produccion_v1_*.json`).
  - **Instancias públicas:** fallan a ratos. La principal encola y responde a los 41–43 s, y private.coffee no contesta (`osm_instancias_*.json`).
  - **Cambios en la ruta:** dos vueltas en 50 s, mail.ru primero, la principal con hasta 45 s, y la cabecera `X-Croquis-Overpass`.
- **F11, paso 6g hecho** (rama `feat/f8-paso-peatonal-nom`, ADR 0041): las calles de OSM llevan rayas de carril también en el croquis 2D. La geometría de rayas y cruces se movió del visor a `@croquis/croquis-2d`, así que los dos cortan en el mismo lugar.
- **F11, paso 6h hecho** (misma rama, ADR 0042): paso peatonal según la NOM-034-SCT2/SEDATU-2022, consultada en el DOF.
  - **Franjas:** de 40 cm, separadas 40 cm.
  - **Largo:** el de la Tabla 8 (6 m en calle primaria).
  - **Orillas:** siguen continuas (5.5.1), lo que cierra el pendiente del ADR 0037.
- **F11, paso 6i hecho** (rama `feat/f8-raya-alto`, ADR 0044): raya de alto (M-6) en los accesos que controla un semáforo o un alto, según `aplica_a` y las fases.
  - **Dónde:** a 1.20 m de la vía que cruza o del paso peatonal, en los carriles del sentido del vehículo.
  - **En qué escenas:** las de plantilla y las del mapa, en el croquis y en el visor.
  - **Límite:** en una recta no se dibuja.
  - **Referencias visuales:** se regeneraron en CI (Linux) las de `lateral_interseccion` e `interseccion_toluca` y se revisaron; las otras 22 salieron idénticas byte por byte.
- **F11, paso 6j hecho** (rama `feat/f11-prompt-v4`, ADR 0043): prompt v4 con el semáforo peatonal, medido con el criterio fijado antes.
  - **Resultado:** **no pasa a producción**. Lee el semáforo peatonal con F1 0.978 en los dos modelos, pero con Sonnet baja el F1 micro común de 0.9354 a 0.9328 en dev; dos corridas de v3 difieren 0.0054.
  - **Lo que se hizo:** lote `dev-007` (30 relatos, escrito y revisado por agentes que no vieron las reglas ni los prompts), glosario por versión (las huellas de v1–v3 no cambian) y E1 con la métrica común.
  - **Gasto:** 5.58 USD.
  - **Criterio con ruido:** queda fijado para el próximo cambio de prompt.
- **Pendientes menores:**
  - texturas triplanares, después de E9.
- **Siguiente paso concreto:** F11 queda en lo que depende de René: E9 (el kit está listo) y la computadora de demo (E6 en alta y ultra). Lo que queda sin René son pendientes menores: texturas triplanares (después de E9) y una v5 del prompt con el criterio con ruido del ADR 0043, si se quiere volver a intentar el semáforo peatonal.

- **E1 del prompt v2 en el primer test, hecho** (PR #14). Sonnet 0.875 → 0.919 y Haiku 0.852 → 0.896. Además, E1 ahora compara cada contrafactual con la repetición del mismo relato (McNemar por tipo): ningún tipo difiere del ruido, y las reglas cambian con el modelo del vehículo en 6 de 52 pares (ADR 0012 §10).
- **F8** cerrada el 2026-10-17 (PR #20 a #24). **F0** cerrado el 2026-10-10 (PR #1), **F1** el 2026-10-10 (PR #3), **F2** el 2026-10-13 (PR #4), **F3** el 2026-10-13 (PR #5), **F4** el 2026-10-13 (PR #6), **F5** el 2026-10-13 (PR #7), **F6** el 2026-10-14 (PR #8), **F7** el 2026-10-14 (PR #9; pendientes registrados); migración a Vercel el 2026-10-14 (PR #10); test CISS y prompt v2 el 2026-10-14 (PR #11).

### Endurecimiento pendiente

Lo que se pospone por el trabajo con CESVI no se borra: queda aquí para después.

- **Fuera de la CI de cada PR** (ADR 0047; corre a mano con `completo.yml`, o antes de una demo con CESVI):
  - e2e completa en escritorio y celular, y las referencias visuales de `capturas-diseno` (aún sin versionar: la primera corrida completa las genera como artefacto para revisarlas y versionarlas);
  - E8 en Chromium, Firefox y WebKit;
  - generados al día (`generate:check` de scene-schema, extraction, solver-ts, croquis-2d y web) y la demo grabada (`demo:check`);
  - reproducibilidad de los datos de Python (DataMX, CISS, inercias de NHTSA, OSM, MakeHuman, Poly Haven) y Python en Windows.
- **El resto del sitio con los tokens del rediseño (ADR 0054):** portada, historia, visor 3D y «Cuenta qué pasó» heredan la paleta y Geist sin rediseñarse; la portada y la historia están en pausa. Cuando se reactiven, hay que revisarlas con el sistema nuevo (por ejemplo, los tamaños del lema estaban medidos con Anybody).
- **Lighthouse, axe y E-series como requisito:** `eval/f11_portada.mjs` y las demás evaluaciones siguen en el repo; se corren cuando René lo pida.
- **En pausa:** la portada de lanzamiento y la historia (el visor 3D se reactiva con el plan v2, R3) (de F11a solo se usan tokens, marca y componentes); E6 en baja y media después de F11a; F11b (E9 con personas).
- **«Caso nuevo» (R1 y R2):** buscar el lugar en el mapa (hoy el perito navega a mano hasta el punto), y generalizar el recorrido de ocho pasos a N vehículos para que use la misma escena.
- **Del contacto secundario de R3** (ADR 0063, «Límites»):
  - el impulso no acopla la guiñada y no hay fricción entre carrocerías;
  - el contorno es rectangular, con la cara dañada hundida de forma pareja;
  - con más evidencia, revisar el ajuste de la inversión en `lateral_interseccion` (A 81.95 km/h, con bandera);
  - regenerar a mano E7 y E8, y los cuadros de la portada en pausa, con el resultado 1.8.0.
- **De las carambolas de R6** (ADR 0066, «Límites»):
  - impactos posteriores contra objetos o personas;
  - un vehículo que espera y en realidad venía en movimiento;
  - el contorno con daño en dos caras;
  - el debris del segundo impacto;
  - el tiempo de las escenas con muchos vehículos (hasta 34 s en E-R6);
  - en «Caso nuevo», una forma de declarar a mano los impactos cuando la narración no dice su orden.
- **De E-R4** (ADR 0067, «Límites»):
  - **Modalidades:**
    - la reversa (0 de 9);
    - objeto fijo contra salida del camino cuando la narración no dice qué se golpeó.
  - **Lo que no se mide todavía:**
    - las velocidades (las narraciones de la prueba no traen medidas);
    - el texto de las posiciones finales (hoy solo su presencia).
  - **La página:**
    - reconstruye con la disposición genérica;
    - un enlace para abrir el caso en «Caso nuevo» y colocar a los vehículos.
- **Reversa en la reconstrucción** (encontrado al grabar el video, 2026-10-22):
  - **El caso:** en `cesvi-3a0125cb81`, A mira al norte y retrocede hacia el sur hasta pegar con B.
  - **Lo que pasa:** con esas posiciones, la inversión no identifica ninguna velocidad y deja las dos en el valor por defecto de 40 km/h. La página lo dice («la evidencia no la fija»), pero no reconstruye la maniobra.
  - **Lo que falta:** el contrato y el solver necesitan el sentido de marcha separado del rumbo del frente. Va con R4 o R6, junto con las otras modalidades del corpus.
- **Del prototipo de CESVI:** el mapa con mosaicos propios (privacidad completa), la importación automática de cualquier dictamen, interpenetración, impactos múltiples y generalidad del método; autenticación con cuentas para cuando los peritos usen sus propios casos (hoy el acceso es con usuario y clave, ADR 0049).

### Bloqueado — necesita a René

| Qué                                                                                                                                                                                                                                 | Para qué                                                                                  | Estado                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La maqueta actualizada de `docs/cesvi/rediseno/Paso2.html`                                                                                                                                                                          | Subirla tal como está y ajustar el paso 2 («El hecho») a ella                             | Pendiente: la del disco es idéntica a la del repositorio (2026-10-21)                                                                                                 |
| `CLAUDE.md` con el cambio que menciona René (apuntar al plan nuevo y el uso libre de los dictámenes)                                                                                                                                | Commit tal como esté en el disco                                                          | El del disco es idéntico al de git (2026-10-21): no hay cambio que subir. El uso libre quedó registrado desde `PLAN-CESVI.md` §3 en `data/SOURCES.md`                 |
| PDF originales de algunos dictámenes                                                                                                                                                                                                | Evaluar la carga de PDF con imágenes y fórmulas (C4, E-C4)                                | Pendiente; mientras, se evalúa con Markdown                                                                                                                           |
| Tabla de coeficientes de rigidez A y B que usa CESVI                                                                                                                                                                                | C1: rigidez por vehículo (si no, NHTSA E2 marcada como tal)                               | Pendiente                                                                                                                                                             |
| Comentarios de CESVI tras la demo                                                                                                                                                                                                   | C8                                                                                        | Pendiente                                                                                                                                                             |
| Saldo de la API de Claude para el corpus de C0                                                                                                                                                                                      | Procesar los 671 dictámenes                                                               | Hecho el 2026-10-21: 18.47 USD reales (estimado 18.29 USD, tope 30 USD)                                                                                               |
| Etiquetas de un perito de CESVI sobre la hoja ciega de 47 conclusiones (`data/raw/cesvi/revision-ciega.md`)                                                                                                                         | Medir el acuerdo de la etiqueta de la conclusión con una persona (hoy: con Claude Code)   | Opcional; no bloquea C1                                                                                                                                               |
| `ANTHROPIC_API_KEY`                                                                                                                                                                                                                 | F6 (extracción con Claude) y E1. CI usa respuestas grabadas, así que no bloquea hasta F6. | Recibida 2026-10-14 (`.env.local`)                                                                                                                                    |
| Confirmar licencia MIT del código y el nombre _Croquis_                                                                                                                                                                             | Se usan los valores por defecto de PLAN §16 (ADR 0002)                                    | Usando default                                                                                                                                                        |
| Computadora de demo (GPU potente) para medir alta y ultra                                                                                                                                                                           | Meta de PLAN §7.8: ≥ 60 fps en alta o ultra en todas las escenas canónicas (ADR 0026)     | Pendiente; ya se puede medir sin instalar nada: abrir `/medicion` en esa computadora, descargar el JSON y correr `node eval/e6_navegador.mjs <archivo>` (ADR 0045 §7) |
| Cuenta y llave de NextGIS (opcional)                                                                                                                                                                                                | Instancia de Overpass sin pago si las públicas siguen saturadas (ADR 0040)                | Opcional; la ruta funciona con las públicas cuando responden                                                                                                          |
| Pruebas con ≥ 5 personas reales (E9)                                                                                                                                                                                                | F11                                                                                       | Kit listo (`docs/e9/protocolo.md`, página `/e9`, `uv run croquis-eval e9`); faltan las sesiones                                                                       |
| Prueba piloto informal con una persona (5 s en la portada)                                                                                                                                                                          | Criterio de F11a (PLAN §11.7): ¿qué entendió en 5 segundos?                               | Pendiente; no bloquea el despliegue                                                                                                                                   |
| Laptop conectada a la corriente mientras corre Lighthouse                                                                                                                                                                           | Metas de carga de F11a (`eval/f11_portada.mjs`, ADR 0045 §5)                              | Pendiente (2026-10-20): la laptop estaba con batería                                                                                                                  |
| E6 en baja y media después de F11a, en una ventana de PowerShell aparte: `node eval/e6_performance.mjs --scenes alcance,nocturno_lluvia,glorieta --qualities baja --out eval/results/e6_f11a_baja.json` (y lo mismo con `media`)    | Confirmar que el visor no cambió de rendimiento con el empaquetado nuevo                  | Pendiente; desde Claude Code, el sistema cortó la corrida por falta de memoria                                                                                        |
| Confirmar que el repositorio remoto correcto es `renecano/Crash_reconstruction_visualization_system` (público, lo creó René vacío el 2026-10-10). Se eligió por nombre y fecha; se puede cambiar con `git remote set-url origin …`. | Push y CI                                                                                 | Asumido y ya en uso                                                                                                                                                   |

## Entorno de desarrollo (verificado 2026-10-10)

| Recurso           | Valor                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| SO                | Windows 11 Home 10.0.26200                                                                                                                        |
| CPU / RAM         | Intel i5-10210U (8 hilos) / 7.83 GB; al inicio de la sesión solo 1.4 GB libres (Claude Code, Docker Desktop/WSL y VS Code consumen ~2.3 GB)       |
| GPU               | Intel UHD Graphics integrada (1 GB) → la laptop de referencia para E6                                                                             |
| Disco             | C: 8.9 GB libres (casi lleno); D: 209 GB libres. El repo vive en D:.                                                                              |
| Node / pnpm       | v24.12.0 / 12.11.2                                                                                                                                |
| Python / uv       | 3.14.0 (C:\Python314) / 0.13.0                                                                                                                    |
| git / gh          | 2.47.1 / 2.102.0 (sesión iniciada como `renecano`)                                                                                                |
| Docker            | 29.1.3 (corriendo; consume ~850 MB con WSL)                                                                                                       |
| No instalados aún | Blender (winget `BlenderFoundation.Blender` 5.2.2), FFmpeg (`Gyan.FFmpeg` 9.0.2), AWS CLI. Se instalarán en la fase que los necesite (F3/F9/F11). |

Recomendación para René: cerrar Docker Desktop mientras se trabaja en Croquis libera ~850 MB de RAM.

### Cambios hechos a la máquina en F0

- `npm install -g pnpm@latest` → pnpm 12.11.2.
- `uv self update` → uv 0.13.0.
- Chromium de Playwright (1248) descargado a `D:\dev-cache\ms-playwright`.
- Cachés movidos a D: para no llenar C: — `pnpm config set store-dir D:\dev-cache\pnpm-store --global`, `npm config set cache D:\dev-cache\npm-cache`, variables de usuario `UV_CACHE_DIR=D:\dev-cache\uv-cache` y `PLAYWRIGHT_BROWSERS_PATH=D:\dev-cache\ms-playwright`. **Las terminales abiertas antes de este cambio no ven las variables**; abre una nueva o expórtalas a mano.

## F0 — Fundaciones

### Plan

Archivos: monorepo pnpm (`apps/web` Next.js 16, `packages/{scene-schema,solver-ts,viewer,croquis-2d}`), espacio de trabajo uv (`solver`, `services/api`, `extraction`, `data`, `eval`), CI en GitHub Actions (web, e2e, python en Ubuntu y Windows), ADRs, esqueleto de docs, licencias, scripts de descarga y resumen de INEGI ATUS.

Pruebas: Vitest en cada paquete TS (incluye `fast-check`), Playwright e2e de la portada, pytest + Hypothesis en cada paquete Python, ruff y pyright estricto, ESLint con reglas tipadas, Prettier.

Riesgos: (1) TypeScript 7 rompe typescript-eslint → se usa TS 6.0.3 (ADR 0003). (2) Los archivos anuales de ATUS no están en la URL histórica; la pestaña "Datos abiertos" del INEGI se renderiza con JavaScript → se localizaron con Chromium headless y la API de descarga masiva. (3) RAM: no correr `next dev` y pytest con Hypothesis pesado a la vez.

### Hecho

- Esqueleto completo del monorepo (PLAN §3.2) con primeros módulos reales y sus pruebas:
  - `packages/solver-ts/src/units.ts` ↔ `solver/croquis_solver/units.py` (primer par de paridad).
  - `packages/viewer/src/quality.ts` (niveles de calidad con histéresis, PLAN §7.8).
  - `packages/croquis-2d/src/geometry.ts` (vectores 2D y caja orientada).
  - `apps/web/src/components/legend.tsx` (leyenda obligatoria de PLAN §10) con prueba unitaria y e2e.
  - `services/api` con `/health` y configuración por entorno (tope de gasto y límite de peticiones, PLAN §16.4).
  - `extraction/croquis_extraction/hashing.py` (hash estable del relato para la leyenda).
  - `eval/croquis_eval/results.py` (escritura uniforme de resultados con commit, fecha y semilla).
- **Ingesta de INEGI ATUS 1997–2025** (`data/croquis_data/atus.py`): descarga con verificación de tamaño y SHA-256, agregación anual con polars en streaming (un año a la vez), exclusión de "Certificado cero", compatibilidad con nombres de columna antiguos. Salidas: `data/processed/atus/*.csv` (12 tablas, ≈125 KB) y `eval/results/atus_summary.json`.
- `.github/workflows/ci.yml` con tres trabajos: web (format, lint, tipos, pruebas, build), e2e (Playwright) y python (ruff, pyright, pytest) en Ubuntu y Windows. Dependabot semanal (npm, uv) y mensual (actions).
- ADR 0001 (stack con versiones), 0002 (decisiones abiertas §16), 0003 (TypeScript 6 vs 7).
- README con la sección "Problema" alimentada por `eval/results/atus_summary.json`; `data/SOURCES.md` con la fila de ATUS.

### Evidencia (local, Windows, 2026-10-10)

| Comando                                               | Resultado                                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                           | 5 paquetes sin errores (ESLint 10 + typescript-eslint tipado; eslint-config-next)                     |
| `pnpm typecheck`                                      | `next typegen && tsc --noEmit` en web y `tsc` en 4 paquetes: 0 errores                                |
| `pnpm test`                                           | Vitest: web 3, croquis-2d 2, scene-schema 3, solver-ts 3 (fast-check), viewer 4 → 15 pruebas en verde |
| `pnpm --filter @croquis/web build`                    | Next.js 16.4 (Turbopack) compila; 2 rutas estáticas                                                   |
| `pnpm --filter @croquis/web test:e2e`                 | Playwright 1 prueba en verde contra `next build && next start`                                        |
| `uv run ruff check . && uv run ruff format --check .` | All checks passed; 32 archivos formateados                                                            |
| `uv run pyright`                                      | 0 errors (modo strict)                                                                                |
| `uv run pytest`                                       | 16 pruebas en verde (Hypothesis incluida)                                                             |
| `uv run croquis-data atus process`                    | 29 años en 2 min 54 s; p. ej. `2025: 380391 accidentes, 4571 muertos`                                 |

Cifras medidas (de `eval/results/atus_summary.json`): 2025 = 380,391 accidentes, 4,571 fallecidos en el lugar, 86,956 heridos; 2024 = 374,949 / 4,656 / 85,980. Estado de México primer lugar en fallecidos (460). Colisiones con motocicleta +10.73 % y volcaduras +15.26 % respecto a 2024. Peatones fallecidos **bajaron** 13.87 % (901 → 776) y pasajeros subieron 3.29 % (972 → 1,004): el PLAN §1 decía que ambos subieron; el README reporta lo que dice el archivo. 2021 = 340,415, idéntico a la cifra del plan.

### Pendientes registrados

- Instalar Blender y FFmpeg cuando empiece F3 (pipeline de assets) y F9 (video).
- `turbo` no se adoptó en F0 (pnpm `-r` basta); reconsiderar si el CI pasa de ~10 min.
- La advertencia de peers de pnpm (eslint-plugin-import/jsx-a11y/react declaran eslint ≤ 9 aunque funcionan con 10) se vigila; si rompe, bajar `apps/web` a ESLint 9 con nota en ADR 0001.
- Prettier reformateó `CLAUDE.md` y `PLAN.md` una vez (solo espacios y alineación de tablas); ambos quedaron en `.prettierignore` para no volver a tocarlos.

### Decisiones

- Repositorio remoto: `renecano/Crash_reconstruction_visualization_system`. `main` nace con un commit raíz vacío para que la primera fase también entre por PR con CI.
- Cache Components de Next.js desactivado al crear la app (`--no-cache-components`): el producto es mayormente cliente (visor 3D); se puede activar después sin cambiar la estructura.
- Python 3.14 (y no 3.12 como decía PLAN §3.1): versión estable vigente con ruedas `cp314` para numpy, scipy, pydantic-core, pyarrow, pandas y polars en Windows (verificado en PyPI el 2026-10-10).
- `pytest --import-mode=importlib` y carpetas `tests/` sin `__init__.py` para que cinco paquetes convivan en un solo `pytest`.
- Las dimensiones `SEXO`, `ALIENTO`, `CINTURON` y `CAUSAACCI` de ATUS no se agregan (describen al "presunto responsable"; PLAN §10).

### Resumen para René (F0)

- **Qué quedó:** el repo completo con CI, los primeros módulos con pruebas y la ingesta real de ATUS con cifras verificables.
- **Cómo probarlo:** `pnpm install && uv sync --all-packages --all-groups`, luego `pnpm dev` (web), `uv run pytest`, `pnpm test`. Para regenerar las cifras: `uv run croquis-data atus download`, `uv run croquis-data atus process`, `uv run croquis-eval atus-summary`.
- **Qué necesito de ti:** nada para seguir a F1–F5. Para F6 la `ANTHROPIC_API_KEY`; para F11 credenciales de AWS/Vercel y las 5 personas de E9. Y confirmar el remoto de GitHub si no es el que asumí.

## F1 — Contrato y croquis

### Plan

Archivos: `packages/scene-schema/escena.schema.json` + generadores (`scripts/generate.ts` → Zod; `croquis_scene_schema_codegen` → Pydantic), 10 fixtures con relato, validador semántico en TS y Python, módulo de migraciones, tabla de clases de vehículo con fuentes, `packages/croquis-2d` (layout, ediciones puras, componente SVG), página `/croquis` y e2e.

Pruebas: Ajv ↔ Zod bajo mutaciones (fast-check), casos inválidos compartidos, casos semánticos compartidos (paridad TS ↔ Python), propiedad "editar y volver al JSON no pierde datos", pruebas de componente con Testing Library, Playwright sobre `/croquis`, generadores y tabla verificados en CI.

Riesgos: (1) `json-schema-to-zod` no resuelve `$ref` → generador propio (ADR 0004). (2) Las fichas técnicas de fabricantes son irregulares (autobuses sin tara, tractocamiones sin dimensiones) → rangos de respaldo marcados `supuesto`. (3) jsdom no implementa `getScreenCTM` → el editor convierte coordenadas con `getBoundingClientRect` + viewBox para poder probarse.

### Hecho

- **Contrato v1** (`escena.schema.json`, draft 2020-12, 48 definiciones): meta (semilla, hash del relato), lugar (vía, carriles, superficie, fricción, dispositivos con fases de semáforo, ubicación real), entorno (clima, iluminación, objetos con diámetro de tronco), vehículos (clase, color, masa y dimensiones con rango, maniobra, velocidad, frenado, poses), personas (sin nombres; rol, asiento, cinturón, casco, postura), eventos (CDC SAE J224 y PDOF), daños declarados, evidencias físicas. Todo escalar envuelto con `fuente`/`confianza`/`evidencia`.
- **Generación**: Zod (`src/generated/escena.zod.ts`, 628 líneas) y Pydantic (`croquis_scene_schema/generated.py`, 1000 líneas); `generate:check` y `--check` en CI.
- **10 escenas canónicas** con relato sintético y 100 % de evidencias con offsets reales (`scripts/fix_offsets.py`); validan con Ajv, Zod, jsonschema y Pydantic; ida y vuelta sin pérdida en ambos lados.
- **Validador semántico** (`check.ts` / `check.py`): E001–E015 y W001–W003 (ids, referencias, evidencia, rangos declarados, masa/dimensiones por clase, velocidad implausible, superposición con SAT, roles/ocupantes, orden y actores de eventos); 18 casos compartidos de paridad; mensajes sin culpa.
- **Tabla de clases** `vehicle_classes.json` generada desde 47 fichas técnicas (`data/vehicles/models_raw.json`, 43 oficiales), con `origen` por campo y respaldos `supuesto` documentados; `croquis-data vehicles build --check` en CI.
- **Migraciones** (`migrate.ts` / `migrate.py`): motor encadenado con fixture 0.9.0 compartido; registro vacío mientras solo exista 1.0.0.
- **Croquis 2D** (`@croquis/croquis-2d`): plantillas de vía por `tipo_via` (recta, curva, X, T, glorieta, incorporación, retorno, estacionamiento, carretera, autopista), vehículos a escala real, personas, objetos, dispositivos, evidencias y puntos de impacto; arrastre y giro; cada edición marca `fuente: usuario`, `confianza: 1`.
- **Web** `/croquis`: selector de escena, editor, JSON bidireccional ("Aplicar JSON" valida contra el contrato), descarga, lista de problemas, leyenda ilustrativa con semilla.
- Docs: ADR 0004, `data/SOURCES.md` (fichas), `docs/data.md`, `docs/physics.md` (rangos de plausibilidad), README.

### Evidencia (local, Windows, 2026-10-10)

| Comando                                                                                                                                            | Resultado                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                                                                                        | scene-schema 113, croquis-2d 34, web 3, solver-ts 3, viewer 4 → **157 pruebas** en verde                                     |
| `uv run pytest`                                                                                                                                    | **48 pruebas** en verde (incluye paridad semántica, codegen y tabla al día)                                                  |
| `pnpm lint` / `pnpm typecheck`                                                                                                                     | 5 paquetes sin errores                                                                                                       |
| `uv run ruff check . && uv run ruff format --check . && uv run pyright`                                                                            | limpio (pyright strict)                                                                                                      |
| `pnpm --filter @croquis/web test:e2e`                                                                                                              | 3 pruebas Playwright en verde (portada + 2 de `/croquis`: arrastre sin pérdida de datos; JSON a mano y errores del contrato) |
| `pnpm --filter @croquis/scene-schema generate:check`, `uv run croquis-scene-schema-generate --check`, `uv run croquis-data vehicles build --check` | al día                                                                                                                       |
| `pnpm --filter @croquis/web build`                                                                                                                 | rutas `/`, `/croquis` estáticas                                                                                              |

Criterio de aceptación F1 (PLAN §13): las 10 escenas validan en ambos lados ✔; editar en el croquis y volver al JSON no pierde datos ✔ (prueba de propiedad con 40 secuencias aleatorias por escena + e2e).

### Pendientes registrados

- Normalización completa de unidades a SI (`normalizar(spec)`) se implementa con el solver en F2 (hoy `check` convierte localmente).
- Snapshots visuales del croquis: se harán junto con los del visor 3D en F3 (misma infraestructura de Playwright).
- Exportar el croquis como SVG/PNG/PDF tipo parte de tránsito (PLAN §7.7) queda para F9 con el resto de exportaciones.
- Clases con rangos `supuesto` (autobús, tractocamión, bicicleta, scooter): buscar fichas con tara/dimensiones cuando aparezcan; el formato ya lo soporta.
- La tabla de clases usa márgenes fijos (masa ×0.75/×1.35 o PBV; dimensiones ×0.9/×1.1); revisar cuando E2/E3 den datos reales de masas de prueba.

### Decisiones

- Ver ADR 0004 (sin `allOf`, generador Zod propio, procedencia compartida en compuestos, tabla de clases generada, migraciones).
- `check` recibe la tabla por parámetro y usa `vehicle_classes.json` por defecto; `{}` la desactiva (pruebas de paridad usan una tabla pequeña explícita).
- Los campos `SEXO`, `ALIENTO`, `CINTURON` del "presunto responsable" de ATUS y cualquier noción de culpa quedan fuera del contrato y de los mensajes.

### Resumen para René (F1)

- **Qué quedó:** el contrato completo con tipos generados en los dos lenguajes, diez escenas listas para la demo, un validador que explica en lenguaje llano qué no cuadra, y el croquis editable en `/croquis` sincronizado con el JSON.
- **Cómo probarlo:** `pnpm dev` y abre http://localhost:3000/croquis; cambia de escena, arrastra el vehículo A y mira cómo cambia el JSON (y cómo la posición queda marcada como tuya); pega un JSON roto y verás los errores del contrato. Pruebas: `pnpm test`, `uv run pytest`, `pnpm --filter @croquis/web test:e2e`.
- **Qué necesito de ti:** nada para F2. Sigue pendiente lo de la lista de bloqueados (llave de API para F6, AWS/Vercel y personas para F11).

## F2 — Solver de referencia

### Plan

Archivos: `solver/croquis_solver/{models,impact,crash3,friction,preimpact,postimpact,fixed_object,pedestrian,stiffness,reconstruct}.py`, `data/friction.json`, cliente de la Vehicle Crash Test Database de NHTSA (`data/croquis_data/nhtsa_ctd.py`), E2 (`eval/croquis_eval/e2_barrier.py`), `docs/physics.md`, ADR 0005.

Pruebas: propiedades con Hypothesis (conservación de momento lineal y angular, energía no creciente, simetría), casos con solución cerrada (choque central, barrera, derrape, CRASH3 uniforme, cotas de Searle), reconstrucción de las 10 escenas con determinismo bit a bit, E2 con CSV sintético y reproducción byte a byte de la tabla de rigidez.

Riesgos: (1) restitución de Newton + Coulomb puede ganar energía (paradoja de Kane) → candidatos que nunca la ganan. (2) La API de NHTSA es lenta y devuelve 404 con `sortBy` → descarga reanudable por prueba, sin ordenar. (3) Sin pruebas de barrera rígida para lateral y trasera → respaldo marcado `supuesto`.

### Hecho

- Módulos 6.1.1 (pre-impacto), 6.1.2 (impacto por impulso), 6.1.3 (CRASH3), 6.1.4 (objetos fijos), 6.1.5 (post-impacto 3 GDL) y 6.1.7 (Searle, Wood, zonas de contacto) con ecuaciones y referencias en `docs/physics.md`.
- Orquestador `reconstruct(spec)` → `Reconstruction` (trayectorias, ΔV, PDOF, perfiles de daño, proyección de peatón, eventos y banderas) para las 10 escenas canónicas.
- Descarga completa de las pruebas vehículo contra barrera de NHTSA (3388 pruebas, 0 fallidas) y E2 con dejar-uno-fuera por clase. La tabla `solver/croquis_solver/data/stiffness_classes.json` sale de E2.
- `data/SOURCES.md` (NHTSA y derivados), `docs/data.md` (filtros y límites de E2), README con resultados medidos, ADR 0005.

### Evidencia (local, Windows, 2026-10-13)

| Comando                                                                 | Resultado                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `uv run pytest`                                                         | **195 pruebas** en verde (solver 73, eval y data 17, resto de paquetes) |
| `uv run ruff check . && uv run ruff format --check . && uv run pyright` | limpio (pyright strict)                                                 |
| `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`         | limpio; 157 pruebas TS en verde                                         |
| `uv run croquis-data nhtsa download --workers 4`                        | `listadas 3388, nuevas 3388, en caché 0, fallidas 0`                    |
| `uv run croquis-eval e2-barrier`                                        | 1316 pruebas usadas de 3388; salida en `eval/results/e2_barrier.json`   |

E2 (de `eval/results/e2_barrier.json`), error absoluto medio dejando una prueba fuera:

| Clase           | Pruebas | A (kgf/cm) | B (kgf/cm²) | Error velocidad (km/h) | Recta global (km/h) |
| --------------- | ------: | ---------: | ----------: | ---------------------: | ------------------: |
| camion_unitario |       5 |      82.73 |       12.09 |                  10.55 |                9.22 |
| hatchback       |      93 |      75.66 |       12.33 |                   8.69 |                 9.9 |
| pickup          |     158 |      89.45 |       12.09 |                   8.76 |               10.14 |
| sedan_compacto  |     155 |      65.14 |        9.89 |                   7.94 |                8.28 |
| sedan_mediano   |     386 |      75.25 |       11.48 |                   7.77 |                8.51 |
| suv_compacta    |     248 |       85.7 |       13.92 |                   8.37 |                9.71 |
| suv_grande      |     201 |      91.11 |       13.12 |                    8.2 |                9.27 |
| van             |      70 |      82.05 |       11.59 |                   6.63 |                6.71 |

Global: **8.1 km/h** contra 9.03 km/h de la recta global y 27.74 km/h de la regla de Emori. En aplastamiento: 75.4 mm contra 74.4 mm (sin mejora).

Criterio de aceptación F2 (PLAN §13): conservación < 1e-9 ✔ (Hypothesis, 400 configuraciones); E2 con error reportado contra la línea base ✔.

### Pendientes registrados

- Rigidez lateral y trasera medida: buscar pruebas de barrera deformable móvil o coeficientes publicados (hoy `supuesto`).
- E2 no mejora la predicción de aplastamiento frente a la recta global; revisar en F7 si un b0 por clase o la forma del perfil reducen el error.
- Usar el tiempo de percepción-reacción para ubicar el inicio de frenado cuando el relato no lo da (hoy 0.6 s fijos con bandera); entra con la inversión de F7.
- Inercia de guiñada medida por clase (hoy placa rectangular).
- Port TS del solver y paridad (E7): F9, como marca PLAN §13.

### Decisiones

- Ver ADR 0005 (Python con `math` para facilitar el port, candidatos anti-Kane, t = 0 en el impacto, arrastre post-impacto 0.35 μ, tabla de rigidez generada y verificada).
- E2 acepta `LOAD CELL BARRIER` además de `FLAT BARRIER`: ambas son barreras planas rígidas (la primera con celdas de carga). Con ambas quedan 1316 pruebas; los descartes por criterio están en `conteos`.

### Resumen para René (F2)

- **Qué quedó:** el solver físico que convierte una escena en trayectorias, daños y tiempos, y la primera evidencia medida: con rigidez por clase sacada de pruebas reales de NHTSA, la velocidad de impacto se estima con 8.1 km/h de error medio.
- **Cómo probarlo:** `uv run pytest solver` y `uv run croquis-eval e2-barrier`. Para regenerar todo desde cero: `uv run croquis-data nhtsa download` y `uv run croquis-data nhtsa process`.
- **Qué necesito de ti:** nada para F3–F5.

## F3 — Visor base

### Plan

Archivos: contrato del resultado (`packages/scene-schema/resultado.schema.json`, Zod generado, resultados versionados de las 10 escenas), `packages/viewer` (módulos puros: geometría de vía, vehículos procedurales, maniquí, muestreo, línea de tiempo, reloj, sol, cámaras, grafo de escena, elección de backend; componente React Three Fiber), página `/visor`, e2e y capturas visuales, E6 (`eval/e6_performance.mjs`), ADR 0006.

Pruebas: unitarias y de propiedades del visor sin GPU (el grafo de escena se prueba en Node), componentes de interfaz con Testing Library, Playwright sobre las 10 escenas, capturas visuales en Linux, E6 en la laptop de referencia.

Riesgos: (1) el visor mostraría choques sin sentido si el solver no coloca bien los vehículos → se corrigió el contacto (zonas CDC) y la geometría de los fixtures. (2) WebGPU en GPU integrada → se mide y se elige backend. (3) Capturas visuales que difieren entre sistemas → se generan y comparan en Linux.

### Hecho

- **Correcciones del solver que el visor dejó a la vista:** el punto de contacto de cada vehículo (zona CDC) llega al impacto, ya no su centro de masa (antes los autos se encimaban y el choque no generaba giro); vueltas de 90° con recta posterior; seguimiento de carril en curva y glorieta; desvío inferido marcado como bandera; superficies planas con la normal de la superficie; **signo del término de altura de Searle** (D − μh, como Wood); trayectorias de peatones coherentes con Searle; rejilla alineada a t = 0.
- **Modelo de vía compartido** solver ↔ croquis ↔ visor (curva con centro en (0, −R), glorieta con borde por el origen); fixtures corregidos para que cada vehículo arranque en su carril y los objetos queden fuera de la calzada; los accesos de la glorieta del croquis ya conectan con el anillo.
- **Contrato del resultado** con Zod generado, validación en Python y TS, equivalencia Ajv↔Zod con mutaciones y resultados versionados verificados en CI con tolerancia numérica (Linux y Windows coinciden).
- **Visor 3D** `/visor`: vía, banquetas, rayas y pasos peatonales; vehículos genéricos de 14 clases con dimensiones reales y piezas nombradas; maniquí neutro; objetos y dispositivos básicos; evidencias declaradas; sol por fecha, hora y lugar; cielo físico horneado; cámaras libre, cenital, del conductor y cinematográfica; línea de tiempo con cámara lenta, cuadro por cuadro y marcadores; tabla de resultados con fuentes; leyenda ilustrativa sobre el lienzo; calidad y backend automáticos por medición; modo pantalla completa y bucle por URL.

### Evidencia (local, Windows, 2026-10-13)

| Comando                                     | Resultado                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `uv run pytest`                             | **244 pruebas** en verde                                                                        |
| `pnpm test`                                 | **273 pruebas** en verde (visor 102)                                                            |
| `pnpm --filter @croquis/web test:e2e`       | 16 pruebas en verde en Windows; en CI (Linux) corren las 26, incluidas las 10 capturas visuales |
| `uv run croquis-solver reconstruct --check` | resultados al día (también en CI Ubuntu y Windows)                                              |
| `node eval/e6_performance.mjs`              | `eval/results/e6_performance.json`                                                              |

E6 (de `eval/results/e6_performance.json`; Intel(R) Core(TM) i5-10210U CPU @ 1.60GHz, 7.8 GB, GPU ANGLE (Intel, Intel(R) UHD Graphics (0x00009B41) Direct3D11 vs_5_0 ps_5_0, D3D11)), 1920×1080 a pantalla completa, cámara en movimiento, sin tope de vsync:

| Backend | Calidad | fps mínimo entre escenas | fps mediana | Escena más lenta | Carga inicial máx. (MB) |
| ------- | ------- | -----------------------: | ----------: | ---------------- | ----------------------: |
| WebGPU  | baja    |                    145.3 |       197.8 | glorieta         |                    0.77 |
| WebGPU  | media   |                     61.9 |        81.3 | glorieta         |                    0.77 |
| WebGPU  | alta    |                     28.3 |          35 | glorieta         |                    0.77 |
| WebGL 2 | baja    |                    211.4 |       324.5 | motociclista     |                    0.77 |
| WebGL 2 | media   |                     76.4 |        85.6 | frontal_curva    |                    0.77 |
| WebGL 2 | alta    |                     36.2 |        43.8 | peaton_cruce     |                    0.77 |

Presupuesto §7.8 con el backend que elige el modo automático en esta laptop (media: webgpu, alta: webgl; verificación en el visor a pantalla completa: «WebGPU · elegido por medición (WebGPU 108 fps)»): media ≥ 60 fps → ✔; alta ≥ 30 fps → ✔; carga inicial ≤ 8 MB → ✔.

Criterio de aceptación F3 (PLAN §13): las 10 escenas se ven ✔ (e2e); capturas visuales ✔ (10 referencias en Linux, comparadas en CI); E6 dentro de presupuesto ✔.

### Pendientes registrados

- Volcadura, ragdoll de peatones y ocupantes visibles: F5 (hoy el vehículo de la volcadura derrapa sin volcar y el maniquí no se articula).
- Texturas PBR (Poly Haven) para asfalto y pasto, alumbrado y faros con luz real, fases de semáforo: F8.
- Pipeline de Blender (§7.2) para assets de entorno o mallas más densas si F4 lo necesita; hoy los vehículos son procedurales (ADR 0006).
- El backend WebGPU de three.js rinde menos que WebGL 2 en Intel UHD; en calidad media WebGPU apenas pasa los 60 fps en la glorieta (margen estrecho; si una sesión mide menos, el modo automático cambia a WebGL 2). Revisar en cada actualización de three.js con E6.
- R3F 9 usa `THREE.Clock` (aviso de obsolescencia en consola); se va con la próxima versión de R3F.

### Decisiones

- Ver ADR 0006. Destacan: contrato del resultado separado del de entrada, modelo de vía compartido sin cambiar el contrato, vehículos procedurales, `WebGPURenderer` con elección de backend por medición, grafo de escena probado sin GPU, capturas generadas en Linux por CI.

### Resumen para René (F3)

- **Qué quedó:** las diez escenas se ven en 3D en `/visor`, con línea de tiempo, cámaras y la tabla de resultados; el solver ahora coloca bien el contacto entre vehículos y la geometría de las escenas es coherente con cada relato.
- **Cómo probarlo:** `pnpm dev` y abre http://localhost:3000/visor; cambia de escena y de cámara, reproduce en cámara lenta y salta a los eventos. Para medir el rendimiento: `pnpm --filter @croquis/web build` y `node eval/e6_performance.mjs`.
- **Qué necesito de ti:** nada para F4–F5.

## F4 — Daño

### Plan

Archivos: `dano.centro_m` en el resultado (esquema 1.1.0), carrocerías densas por secciones (`loft.ts`), campo de deformación y medición del perfil (`damage.ts`), materiales de daño en TSL (`damage-material.ts`), rig de daño por vehículo (`damage-rig.ts`), bolsas de aire (`airbag.ts`), marcas en el piso (`ground-marks.ts`), restos con Rapier (`debris.ts`, `debris-scene.ts`), cámara de acercamiento al daño, panel con bolsas de aire, capturas de daño, ADR 0007.

Pruebas: perfil C1–C6 medido sobre la malla deformada contra el del solver en las 10 escenas; propiedad de compresión sin pliegues; umbrales del IIHS; reglas de faros, parabrisas y bolsas en escenas reales; marcas por tiempo; horneado de Rapier reproducible; capturas de daño por escena en Linux.

Riesgos: (1) mallas sin vértices interiores → loft denso. (2) convención de C1 → fijada en el esquema y probada con un perfil asimétrico. (3) costo del daño en GPU integrada → E6 repetido.

### Hecho

- **Deformación plástica** desde el perfil del solver, horneada como morph target y animada en los 0.12 s de contacto; llantas que se recorren si el aplastamiento las alcanza.
- **Superficie** en TSL: transferencia de pintura en vetas, rayones con metal expuesto y abolladuras finas.
- **Vidrios:** parabrisas agrietado en telaraña (cabeza del peatón o frente aplastado ≥ 0.3 m), vidrios laterales que estallan, faros rotos con astillas.
- **Piezas desprendidas y restos** con Rapier determinista horneado (defensas, espejos, plásticos en el punto de impacto).
- **Bolsas de aire** con umbrales del IIHS (ΔV como sustituto de la velocidad equivalente contra barrera), visibles en la escena y explicadas en el panel.
- **Marcas en el piso** desde las trayectorias: frenado sin ABS, derrape y guiñada después del impacto, charcos de radiador.
- **Cámara** «Acercamiento al daño» y noches legibles (luz ambiental de alumbrado o de luna).

### Evidencia (local, Windows, 2026-10-13)

| Comando                               | Resultado                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `uv run pytest`                       | **244 pruebas** en verde                                                                                         |
| `pnpm test`                           | **311 pruebas** en verde (visor 139)                                                                             |
| `pnpm --filter @croquis/web test:e2e` | 16 pruebas en verde en Windows; en CI (Linux) corren las 36, incluidas 20 capturas (10 del impacto y 10 de daño) |
| `node eval/e6_performance.mjs`        | `eval/results/e6_performance.json` (con daño)                                                                    |

Prueba numérica de F4: en las 10 escenas, el perfil medido sobre la malla de cada vehículo dañado coincide con el C1–C6 del solver dentro de 2 cm o 6 % (motos y bicis excluidas: su deformación es ilustrativa).

E6 con daño (`eval/results/e6_performance.json`, mejor de 2 corridas por configuración, 1920×1080, cámara en movimiento, sin tope de vsync):

| Backend | Calidad | fps mínimo entre escenas | fps mediana | Escena más lenta     |
| ------- | ------- | -----------------------: | ----------: | -------------------- |
| WebGPU  | baja    |                     92.5 |       147.4 | lateral_interseccion |
| WebGPU  | media   |                     39.2 |        66.4 | frontal_curva        |
| WebGPU  | alta    |                     24.1 |        30.1 | glorieta             |
| WebGL 2 | baja    |                    174.2 |       242.8 | glorieta             |
| WebGL 2 | media   |                     69.4 |        79.2 | peaton_cruce         |
| WebGL 2 | alta    |                       33 |        42.6 | glorieta             |

Con la política automática por escena (WebGPU si alcanza 60 fps; si no, el más rápido): calidad media **64.4 fps** mínimo (WebGL 2 y WebGPU; escena más lenta lateral_interseccion); alta **33 fps** (WebGL 2); carga inicial máxima **2.36 MB** (incluye el WASM de Rapier). Presupuesto: media ≥ 60 ✔, alta ≥ 30 ✔, ≤ 8 MB ✔.

Criterio de aceptación F4 (PLAN §13): capturas de daño por escena ✔; perfil C1–C6 del visor coincide con el del solver (prueba numérica sobre la malla) ✔.

### Pendientes registrados

- Calibrar las reglas ilustrativas (faros, parabrisas, piezas, vidrios, bolsas) con E5 contra autos reales en F10 (ADR 0018).
- Colisiones de restos con banquetas elevadas (hoy el piso de colisión es plano).
- Deformación de motos y bicis con su propio modelo (hoy ilustrativa) cuando el solver tenga rigideces para dos ruedas.
- Fluidos distintos del radiador y marcas de arrastre de volcadura: F5 (volcadura).

### Decisiones

- Ver ADR 0007: deformación en CPU horneada como morph target (probada numéricamente, exportable a glTF) y efectos de superficie en TSL; reglas ilustrativas declaradas; umbrales de bolsas del IIHS; restos con Rapier determinista horneado.

### Resumen para René (F4)

- **Qué quedó:** cada choque deja el daño que calculó el solver: carrocería hundida con la forma y la profundidad del perfil C1–C6, pintura transferida, vidrios rotos, piezas en el piso, bolsas de aire y marcas.
- **Cómo probarlo:** `pnpm dev`, abre http://localhost:3000/visor, elige «Acercamiento al daño» y recorre la línea de tiempo alrededor de 0 en cámara lenta.
- **Qué necesito de ti:** nada para F5.

## F5 — Personas y visibilidad

Criterio de aceptación (PLAN §13): proyección del ragdoll dentro de los límites de Searle en ≥ 95 % de corridas con semilla; E4 corrido; análisis de visibilidad con prueba en la escena del árbol.

### Plan (orden de trabajo)

1. **Solver, peatón y jinete (6.1.7).** Banda de distancias de Searle para una velocidad y un rango de fricción; proyección de motociclistas y ciclistas en choques vehículo–vehículo (hoy solo se proyecta al peatón).
2. **Solver, ocupantes (6.1.8).** Cinemática relativa al habitáculo con y sin cinturón: pulso de choque desde ΔV y aplastamiento, desplazamiento hacia el punto de impacto y zona de contacto probable. Sin predicción de lesiones (§10, §16.2).
3. **Solver, visibilidad (6.1.9).** Línea de vista 2.5D desde el ojo de cada conductor (alturas AASHTO) hacia cada actor en el tiempo. Oclusores: árboles (tronco y copa), postes, muros, vehículos estacionados y en movimiento. Límites: noche (alcance y cono de faros, alumbrado), lluvia o niebla (`entorno.visibilidad`). Responde desde cuándo y a qué distancia se podía ver.
4. **Solver, volcadura (6.1.6).** Criterio de inicio por velocidad lateral contra la velocidad crítica de deslizamiento (SSF); la secuencia 3D va en Rapier en el visor, etiquetada como ilustrativa.
5. **Contrato del resultado 1.2.0.** `personas[].ocupante`, proyección de jinetes, `visibilidad` y `vehiculos[].volcadura`; regenerar los fixtures.
6. **Cuerpos.** Pipeline en Python sobre la malla base, los targets y el rig de MakeHuman (CC0, `LICENSE.ASSETS.md` del repositorio oficial): variantes por edad y sexo, complexión como _morph target_, esqueleto reducido para animar y para el ragdoll, glTF cuantizado. Ropa neutra por regiones, sin anatomía.
7. **Visor.** Animaciones de caminar, estar de pie, manejar y montar; ragdoll Rapier con límites articulares, calibrado contra la banda de Searle (horneado con semilla); ocupantes con su movimiento y marcadores neutros de contacto; volcadura en Rapier; cámara de conductor con la visibilidad sobrepuesta; panel de visibilidad y ocupantes.
8. **Evaluaciones.** E4 (proyección de peatón contra datos publicados accesibles; alternativa: Searle sola), tasa de éxito del ragdoll con semillas y E6 de nuevo con personas.
9. **Pruebas.** Hypothesis para las propiedades de ocupantes y visibilidad, prueba de visibilidad en `objeto_fijo_arbol`, `peaton_cruce` (camión estacionado) y casos sintéticos, pruebas del ragdoll y capturas visuales nuevas.

Riesgos: rendimiento con mallas con piel en GPU integrada (se mide con E6; hay LOD si hace falta); datos públicos de E4 escasos (se documenta cuál se usó y su licencia).

### Qué se hizo (F5)

- **Solver (Python, referencia):**
  - **Jinetes:** proyección de motociclistas y ciclistas en choques vehículo–vehículo (fase `montado` y luego Searle).
  - **Banda de Searle** (`searle_distance_band`, forma cerrada convexa en μ).
  - **Ocupantes** (`occupant.py`): pulso senoidal desde ΔV y aplastamiento; espacio de vuelo de Michie sin cinturón; holgura más resorte con cinturón; zona y velocidad relativa de contacto; dos variantes si no se declara el cinturón.
  - **Visibilidad** (`visibility.py`): línea de vista 2.5D desde alturas de ojo AASHTO; oclusores exactos; noche (faros) y clima.
  - **Volcadura** (`rollover.py`): velocidad crítica de deslizamiento con bandera de consistencia.
  - **Objetos del entorno** (`scene_objects.py`): geometría compartida con el visor.
  - **Otros:** vía 0.84 × ancho, igual que el visor. Resultado **1.2.0**.
- **Cuerpos** (`assets/pipeline`, CC0 de MakeHuman):
  - **Descarga:** commit fijo con candado SHA-256.
  - **Forma:** _macro targets_ con el algoritmo de MakeHuman; sexo neutro y etnias a 1/3.
  - **Salida:** tres variantes por edad (762 KB cada una), complexión como _morph target_ y rig reducido a 16 segmentos.
  - **Reproducibilidad:** CI descarga los insumos y reconstruye byte a byte.
- **Visor:**
  - **Animación:** posturas por direcciones de segmento; marcha con curvas de Winter.
  - **Ragdoll:** Rapier con límites AAOS aplicados por el módulo, calibrado contra la banda de Searle y sin volver a chocar con los vehículos de su propio evento.
  - **Ocupantes:** en su asiento, con el desplazamiento del solver y aros neutros de contacto.
  - **Volcadura:** ilustrativa en Rapier.
  - **Cámaras:** "Seguir a la persona", y la del conductor con líneas de vista y aros verde o naranja.
  - **Panel:** personas y visibilidad en lenguaje neutro.
- **Rendimiento:** E6 mostró que el visor está limitado por la CPU por objeto dibujado. Para devolver el margen:
  - los ocupantes no proyectan sombra;
  - rines, faros, calaveras y vidrios salen del pase de sombras;
  - cada rueda es una malla y los aros son una sola `InstancedMesh`;
  - las posturas se recalculan solo cuando cambian.
- **Port TS:** `packages/solver-ts/src/pedestrian.ts` (Searle y banda) con paridad probada contra los resultados del solver.
- **Fixtures corregidos con su relato:** el peatón de `peaton_cruce` sale de detrás del camión estacionado; la vegetación de `frontal_curva` pasa al interior de la curva.

### Evidencia y números medidos

- **Criterio del ragdoll** (`pnpm --filter @croquis/eval-js ragdoll` → `eval/results/ragdoll_searle.json`): 460 corridas con semilla (100 en escenas canónicas y 360 en el barrido de 20–70 km/h con tres cuerpos).
  - **Con calibración:** **100.0 %** dentro de la banda de Searle. Es casi por construcción, porque la calibración apunta al centro de la banda.
  - **Sin calibrar** (física sola, k = 1): **94.6 %**.
  - **Factor k:** mediana 0.9527 (rango 0.8574–1) y 2.14 horneados en promedio.
  - **Casos sin calibrar por debajo del 90 %:** adulto/30kmh (70 %), mayor/30kmh (50 %).
  - **Criterio de F5** (≥ 95 %): ✔.
- **E4** (`uv run croquis-eval e4-pedestrian` → `eval/results/e4_pedestrian.json`): 17 casos publicados en dominio.
  - **Velocidad desde la distancia:** error absoluto medio de Croquis **5.215 km/h** (sesgo +3.125), con su intervalo cubriendo **65 %** de los casos (ancho medio 12.685 km/h). Searle sola: 5.813 km/h, cobertura 24 % (ancho 5.831 km/h). Wood: 6.156 km/h.
  - **Por fuente:** IPTM 2.501 frente a 8.549 km/h; Eubanks y Haight 5.058 frente a 4.229; Randles 8.485 frente a 3.677. Croquis sobreestima en los casos reales de baja velocidad.
  - **Distancia desde la velocidad:** Croquis 2.543 m (banda que cubre 47 %), Searle sola 2.912 m; el ragdoll sin calibrar da 2.423 m.
  - **Factor de proyección:** 0.9; el óptimo de la muestra es 0.92 y reajustarlo da 6.5 km/h dejando uno fuera, así que se conserva.
- **Visibilidad en la escena del árbol** (criterio de F5): `test_visibilidad_en_la_escena_del_arbol`. El conductor de la pickup (ojo a 1.40 m) ve el árbol durante toda la aproximación, desde más de 50 m.
  - **Árbol que tapa:** con un segundo árbol frondoso entre ambos, lo tapa un tramo (`test_visibilidad_con_otro_arbol_que_tapa_el_del_impacto`).
  - **Camión estacionado:** en `peaton_cruce` tapa al peatón hasta 1.8 s antes del impacto (se ve a 21.6 m).
- **E6 con personas** (`eval/results/e6_performance.json`, mejor de 2 corridas, 1920×1080, cámara en movimiento, sin tope de vsync):

| Backend | Calidad | fps mínimo entre escenas | fps mediana | Escena más lenta |
| ------- | ------- | -----------------------: | ----------: | ---------------- |
| WebGPU  | baja    |                    102.5 |       118.3 | glorieta         |
| WebGPU  | media   |                     44.8 |        56.7 | frontal_curva    |
| WebGPU  | alta    |                     17.5 |        22.9 | nocturno_lluvia  |
| WebGL 2 | baja    |                    117.5 |       169.6 | nocturno_lluvia  |
| WebGL 2 | media   |                     61.4 |        69.5 | glorieta         |
| WebGL 2 | alta    |                     30.3 |        37.6 | glorieta         |

Con la política automática por escena: calidad media **61.4 fps** mínimo (escena más lenta objeto_fijo_arbol); alta **30.3 fps**; carga inicial máxima **3.1 MB** (incluye cuerpos y el WASM de Rapier). Presupuesto: media ≥ 60 ✔, alta ≥ 30 ✔, ≤ 8 MB ✔.

- **Pruebas:** pytest **286**, TS **336** (visor 157, web 11, solver-ts 7) y e2e **17** locales (las 20 capturas se generan en Linux por CI). Lint, tipos, Prettier y reproducibilidad de los cuerpos en verde.

### Dependencias y herramientas (F5)

- **Paquete Python `croquis-assets`** (`assets/pipeline`; NumPy y httpx, ya en el stack).
- **Paquete JS `@croquis/eval-js`** (`eval/js`; tsx del catálogo) para evaluaciones que usan el visor.
- **pypdf y PyMuPDF**, solo de forma efímera con `uv run --with`, para leer las tablas de los artículos de E4. No quedan en el proyecto.

### Decisiones (ver ADR 0008)

- Cuerpos de MakeHuman sin Blender (pipeline Python reproducible).
- Sin suponer sexo ni etnia.
- Ragdoll calibrado que ignora a los vehículos de su propio evento.
- Visibilidad calculada por el solver con geometría compartida con el visor.
- Volcadura como criterio físico en el solver y vueltas ilustrativas en el visor.

### Pendientes declarados

- **Visibilidad:** campo visual del conductor (pilares, espejos) y deslumbramiento.
- **Fase previa:** deslizamiento lateral, para que la volcadura de `volcadura` salga del criterio y no solo del relato.
- **Cinturón:** calibrar holgura y rigidez cuando haya datos accesibles de pruebas.
- **Volcadura 3D:** E5 no cubre volcaduras (ADR 0018). Validarla con casos de volcadura de CISS si traen medidas útiles; si no, queda como límite declarado.
- **E4:** sumar más casos publicados en cuanto haya conjuntos abiertos más grandes.
- **E6 con margen estrecho:** 61.4 fps en media y 30.3 en alta, contra 60 y 30; la laptop varía ±15 % según su temperatura. Siguientes optimizaciones sin bajar calidad, si una fase nueva lo empuja abajo: LOD de los cuerpos para ocupantes lejanos y fusión de más piezas fijas de los vehículos (el renderer está limitado por CPU por objeto).

### Resumen para René (F5)

Las personas ya son cuerpos articulados de MakeHuman (CC0, sin rasgos de sexo ni etnia, con ropa neutra):

- **Peatones:** caminan y salen proyectados con un ragdoll que cae dentro de los límites de Searle.
- **Ocupantes:** van en su asiento y se mueven en el impacto con aros azules neutros donde tocan el interior.
- **Conductores:** su cámara muestra qué podían ver y qué lo tapaba.
- **Volcadura:** se ve como secuencia ilustrativa.

Para probarlo:

1. Corre `pnpm dev` y abre `/visor?escena=peaton_cruce&camara=persona`; luego cambia a "Vista del conductor A" antes del impacto.
2. Revisa los paneles "Personas" y "Visibilidad".
3. Corre las evaluaciones: `uv run croquis-eval e4-pedestrian` y `pnpm --filter @croquis/eval-js ragdoll`.

No necesito nada nuevo de ti para F5. Lo bloqueado sigue en la tabla de arriba.

## F6 — Comprensión del relato

Criterio de aceptación (PLAN §13): E1 publicado con las tres alternativas (reglas, Haiku, Sonnet); fuga de PII medida; contrafactuales medidos.

### Plan (orden de trabajo)

1. **Glosario de español mexicano** versionado (`extraction/glosario.json`): expresión, variantes, significado y campo del contrato que afecta. Lo usan la línea base de reglas y el prompt.
2. **Redacción de PII local.** Referencia en Python y port TS con paridad, porque corre en el navegador antes de que el texto salga del dispositivo. Cubre nombres (diccionario con fuente), placas mexicanas, teléfonos, correos, CURP/RFC y direcciones con número.
3. **Relatos-MX.** Formato, herramientas y ≥ 300 relatos con su `EscenaSpec` de referencia, distribuidos como los tipos de ATUS:
   - **Relatos:** escritos a mano por el agente (marcados como sintéticos), con variaciones de registro (formal, coloquial, faltas de ortografía, desorden temporal) y contrafactuales de sexo, edad y tipo de vehículo.
   - **Partición y congelamiento:** división dev/test; el test se congela con hash antes de la primera evaluación.
4. **Línea base de reglas:** del relato redactado a una `EscenaSpec` parcial con evidencia literal.
5. **Verificador de evidencia:** todo campo con `fuente: relato` debe citar un fragmento literal; si no, baja a `supuesto`. Mide la tasa de alucinación de campo.
6. **Cliente de Claude:**
   - **Salida y modelos:** salida estructurada contra el esquema; modelo configurable (`claude-sonnet-5-5` por omisión; comparar con `claude-haiku-5-5`).
   - **Respuestas grabadas:** grabación y reproducción, que es lo que usa CI.
   - **Controles:** límite de gasto y medición de costo y latencia.
7. **Preguntas al usuario:**
   - **Contradicciones:** las banderas del solver se convierten en preguntas, no en acusaciones.
   - **Sensibilidad:** el solver muestrea con semilla los campos inciertos y estima cuánto reduce cada respuesta la varianza de la velocidad de impacto y las posiciones finales. Máximo 3 preguntas por ronda.
8. **E1:** F1 por campo, exactitud de categorías, error en numéricos, alucinación de campo, fuga de PII, cobertura de preguntas útiles, costo por 1 000 relatos, latencia p50/p95 y diferencia contrafactual. La línea base se mide ya; Haiku y Sonnet se graban cuando haya llave.
9. **Web:** página del relato con redacción en el navegador, extracción (reglas, o Claude si hay llave), preguntas y paso al croquis y al visor.

Riesgos: sin llave no hay columnas de Claude en E1 (queda bloqueado y documentado). Un benchmark escrito por el propio agente puede favorecer a la línea base de reglas: se mitiga con registros y estructuras variadas y declarándolo en las limitaciones.

### Qué se hizo (F6)

- **Relato en el dispositivo** (`packages/relato`, nuevo paquete `@croquis/relato`):
  - **Redactor y glosario en TypeScript:** port del redactor de datos personales y del glosario, que corren en el navegador antes de que el texto salga.
  - **Datos compartidos con Python:** patrones y pistas en `packages/relato/data/pii.json`. Se usa un subconjunto de regex que se comporta igual en `re.ASCII` y en `RegExp` sin `u`, y los espacios Unicode se normalizan uno a uno.
  - **Paridad:** `croquis-extraction golden build|check` escribe `fixtures/golden.json` (Relatos-MX completo más casos difíciles) y Vitest compara redacción, tramos y glosario en 517 textos.
  - **Cobertura del redactor:** nombres (diccionario de 491 nombres de DataMX, CC0, más pistas de contexto, minúsculas tras "se llama" y correferencia), placas, teléfonos (incluido 3-3-2-2), correos, CURP, RFC y números de domicilio. Los nombres de calles y lugares no se tocan.
- **Glosario de español mexicano** versionado (1.4.0): expresiones con su significado, el campo del contrato que afectan y la pregunta sugerida si son ambiguas ("camión" sin más, "camioneta", "se me cerró", "de noche"…).
- **Extracción:**
  - **Hechos:** representación de hechos con cita (`facts.py`) y constructor determinista de `EscenaSpec` (`spec_builder.py`): lo dicho va como `relato` con su cita literal; lo demás, como `supuesto` o `default`.
  - **Línea base de reglas** (`baseline.py`), ajustada solo con el dev.
  - **Verificador de evidencia** (`verify.py`).
  - **Cliente de Claude** (`claude_client.py`):
    - **Salida:** estructurada (`output_config.format`) sobre un esquema pequeño de hechos, que pasan por el mismo constructor (ADR 0009).
    - **Grabación:** grabación y reproducción por relato, hash del texto y huella del prompt.
    - **Gasto y respaldo:** tope de gasto diario y respaldo ante rechazos del servidor para Sonnet.
    - **Lotes:** `croquis-extraction claude record --split test` graba por lotes cuando haya llave.
- **Preguntas** (`questions.py`), máximo tres por ronda y sin culpa:
  - **Contradicciones:** salen de avisos estructurados que ahora emite el solver (`Reconstruction.avisos`, solo en Python; el resultado no cambia).
  - **Sensibilidad:** varía un campo a la vez con semilla y mide qué parte de la varianza de la velocidad al impacto y de la posición final explica.
  - **Ambigüedad:** sale de las expresiones ambiguas del glosario.
  - **Respuestas:** `apply_answers` las aplica como `fuente: usuario`.
- **Relatos-MX** (`data/relatos-mx`):
  - **Contenido:** 320 relatos sintéticos (160 dev, 160 test), distribuidos como los tipos de ATUS 2025 con mínimos para las categorías raras, en cinco registros, con 82 relatos con PII sintética y 197 variantes contrafactuales.
  - **Autoría y auditoría:** los lotes de test los escribieron agentes que no vieron la línea base, el glosario ni el redactor, y otros agentes los auditaron (52 correcciones) antes de congelar.
  - **Congelamiento:** el test está congelado sobre su contenido fuente (`test.lock`, `3454a815…`): mejorar el constructor no lo rompe.
  - **Licencia:** CC BY 4.0.
  - **Guía de anotación:** en su README.
- **E1** (`eval/croquis_eval/e1_extraction.py`):
  - **Métricas:** F1 por campo con equivalencias de valores genéricos, error de los números, número de vehículos, alucinación de campo antes y después del verificador, diferencia contrafactual, fuga de PII, cobertura de preguntas útiles, latencia y costo.
  - **Claude:** las columnas se miden solas en cuanto haya grabaciones.
- **API** (`services/api`):
  - **`POST /relato/extraer`:** vuelve a redactar en el servidor; usa Claude si hay llave y presupuesto (con límite por hora) y si no, reglas; verifica y devuelve las preguntas.
  - **Otras rutas:** `POST /relato/responder` y `POST /reconstruir`.
  - **CORS:** orígenes configurables.
- **Web** (`/relato`):
  - **Redacción a la vista:** escribes el relato y ves en vivo lo que se enviará, con los datos quitados.
  - **Glosario:** las expresiones ambiguas se marcan.
  - **Resultado:** se muestran los hechos con su fuente y su cita, y las preguntas se contestan ahí mismo.
  - **Croquis:** la escena se abre en `/croquis?fuente=relato` o se descarga.
- **Solver:** avisos estructurados con código y datos para cada bandera (`clase_sin_tabla`, `desvio_lateral`, `zonas_no_se_tocan`, `frenado_sin_distancia`, `frenado_detiene_antes`, `proyeccion_vs_velocidad`, `evento_sin_resolver`, `sin_reposo`, `persona_sin_posicion`, `volcadura_sin_velocidad`, `volcadura_no_mencionada`).

### Evidencia y números medidos (`eval/results/e1_extraction.json`, test congelado de 160 relatos; `e1_extraction_dev.json`, dev)

| Métrica (test congelado)                              | Reglas          | Claude Haiku 5.5 | Claude Sonnet 5.5 |
| ----------------------------------------------------- | --------------- | ---------------- | ----------------- |
| F1 micro / macro                                      | 0.714 / 0.557   | 0.852 / 0.878    | **0.875** / 0.904 |
| Precisión / exhaustividad (micro)                     | 0.816 / 0.635   | 0.901 / 0.808    | 0.898 / 0.853     |
| Número de vehículos exacto                            | 69.4 %          | 92.5 %           | 91.9 %            |
| Citas sin respaldo literal (antes del verificador)    | 0 de 997        | 8 de 1416        | 0 de 1468         |
| Citas sin respaldo tras el verificador                | 0               | 0                | 0                 |
| Diferencia contrafactual / al repetir el mismo relato | 3.8 % / 0.0 %   | 15.6 % / 21.2 %  | 11.2 % / 11.2 %   |
| Preguntas: errores cubiertos / no redundantes         | 32.8 % / 94.7 % | 8.6 % / 92.4 %   | 5.4 % / 92.1 %    |
| Latencia p50 / p95                                    | 2.3 / 4.2 ms    | 10.6 / 14.3 s    | 4.5 / 10.6 s      |
| Costo por 1,000 relatos                               | $0              | $1.31            | $9.96             |

Redactor de PII (común a los tres): **7.3 %** de fuga en el test (8 de 110: 6 NOMBRE, 2 PLACA), 2 tramos de más; en el dev, 0 de 64. Reglas en el dev: F1 micro 0.759.

Grabación de Claude (2026-10-14): 962 respuestas (por modelo, 160 relatos, 160 contrafactuales y 160 repeticiones del test, más una prueba en el dev). Gasto total registrado en `extraction/grabaciones/gasto.json`: **$5.33**, dentro del tope diario.

Lectura honesta:

- **Claude contra reglas:** Claude supera a las reglas en casi todos los campos (zonas de impacto, frenado, velocidad, clima, cinturón, casco, distancias).
- **Clase de vehículo:** es la excepción (F1 0.638 Sonnet, 0.614 Haiku, 0.802 reglas). Con un modelo nombrado ("Aveo", "Jetta"), el prompt v1 no trae la tabla modelo → clase y pide no precisar lo que no se dice, así que Claude omite la clase. Lo vio el coordinador al revisar pares agregados del test; por PLAN §5.2 no se ajustó el prompt contra el test.
- **Diferencia contrafactual:** en Claude es igual o menor que su propia variación al repetir el mismo relato (los modelos 5.5 no aceptan temperatura 0). No hay diferencia atribuible a sexo, edad o vehículo más allá del ruido. En las reglas, que son deterministas, el 3.75 % sí viene del cambio de palabras.
- **Brecha dev–test:** la línea base y el redactor se ajustaron solo con el dev; la brecha frente al test (0 % → 7.3 % de fuga; 0.759 → 0.714 de F1) mide cuánto generalizan. No se miró el contenido de las fugas del test.
- **Lo que vio el coordinador:** leyó los reportes de los auditores, que mencionan detalles de algunos relatos de test; después solo se cambió la línea base con evidencia del dev.
- **Cobertura de preguntas:** es baja con Claude porque sus errores restantes son sobre todo la clase omitida (dato que sí pregunta solo cuando pesa en la física) y valores que el relato dice y la extracción no tomó.
- **Autoría del benchmark:** todo el benchmark lo escribieron modelos; E9 lo contrastará con relatos de personas.

### Dependencias y herramientas (F6)

- **Paquete JS `@croquis/relato`:** sin dependencias nuevas (Vitest y fast-check del catálogo).
- **Python:** `croquis-extraction` ahora depende de `croquis-solver` (preguntas por sensibilidad). `anthropic` 1.13 ya estaba en el stack; la API se verificó con la documentación oficial del SDK.
- **Agentes de redacción y auditoría de Relatos-MX:** subagentes de Claude Code (8 escritores y 4 auditores). Las instrucciones quedaron en el scratchpad de la sesión; sus reglas están en `data/relatos-mx/README.md`.

### Decisiones (ver ADR 0009)

- **Claude produce hechos con cita**, no la `EscenaSpec` completa. El mismo constructor que usan la línea base y la referencia arma la spec; así el modelo nunca produce geometría ni números físicos.
- **Paridad de la redacción por datos compartidos** más salidas doradas, en vez de mantener dos copias de las regex.
- **Congelamiento sobre el contenido fuente**, no sobre la spec construida.
- **Puntuación justa:**
  - lo que la referencia trae como inferencia no castiga a quien lo afirma con el mismo valor;
  - un conductor de otro vehículo no es error;
  - los valores genéricos citados reciben crédito después de precisarse.
- **Caída de pasajero** como `inicio_frenado` o `arrastre`, porque el contrato no tiene un evento propio.

### Pendientes declarados

- **Prompt v2:** agregar la tabla modelo → clase (`modelos.json`) y aclarar que deducir la clase de un modelo nombrado no es adivinar. Se valida en el dev y se mide en el test nuevo de F7 (relatos adaptados de CISS), con su propio candado; el test actual queda con v1.
- **Relatos adaptados de casos CISS** (PLAN §5.2): se agregarán en F7, cuando se ingieran los datos de CISS, como un test aparte con su propio candado (el test actual ya está congelado).
- **Visor con escenas arbitrarias:** hoy la escena del relato se abre en el croquis; para verla en 3D, el visor necesita aceptar una spec y un resultado externos (la API ya tiene `POST /reconstruir`). Queda para F9 (demo y casos precargados), donde el visor deja de depender de las escenas canónicas.
- **Gasto persistente en el despliegue:** el tope se lleva en `extraction/grabaciones/gasto.json`; en F11 pasará a almacenamiento persistente del servidor.
- **Redactor:**
  - nombres comunes que también son palabras ("Rosa" al inicio de una oración);
  - nombres que no están en el diccionario de 2012 (por ejemplo, nombres jóvenes) y aparecen sin pista.

  La fuga del test (7.3 %) es la medida vigente.

- **Línea base:** zonas de impacto (F1 0.42), maniobras (0.57) y frenado (0.58) son los campos más débiles, y el clima (0.49).
- **Voz** (PLAN §5.1, paso 7): fase posterior.

### Resumen para René (F6)

Croquis ya entiende el relato:

1. **Redacción en tu dispositivo:** escribes en `/relato` y los datos personales se quitan en el navegador antes de enviar. Ves exactamente qué sale.
2. **Extracción:** Claude extrae los hechos con su cita literal y un verificador baja a "supuesto" lo que no esté en tu texto.
3. **Preguntas:** se pregunta, como máximo tres veces por ronda y sin culpar, lo que más cambia la reconstrucción.
4. **Croquis:** la escena se abre en el croquis.

En el test congelado de Relatos-MX:

- **Extracción:** Claude Sonnet 5.5 llega a F1 0.875, Haiku 5.5 a 0.852 y las reglas a 0.714.
- **Citas:** ninguna cita sin respaldo pasa el verificador.
- **Costo:** $9.96 por cada 1,000 relatos con Sonnet y $1.31 con Haiku.
- **Sesgo:** cambiar sexo, edad o vehículo no mueve velocidades ni maniobras más de lo que varía el modelo consigo mismo.
- **Datos personales:** el redactor deja pasar 7.3 % (nombres raros y dos placas); es lo más débil y se sigue midiendo.

Para probarlo:

1. Corre `uv run uvicorn croquis_api.main:app --port 8000` (con tu `.env.local` cargado) y `pnpm dev`.
2. Abre `/relato`.
3. Revisa los números con `uv run croquis-eval e1-extraction --split test`.

Gasté $5.33 de la API en grabar E1, dentro del tope que pusiste. No necesito nada nuevo de ti para F6.

## F7 — Inversión, Monte Carlo y consistencia

Criterio de aceptación (PLAN §13): E3 contra EDR y WinSmash; banderas de inconsistencia con pruebas.

### Plan (orden de trabajo)

1. **Ingesta de CISS 2017–2024** (`data/croquis_data/ciss.py`). Descarga los CSV de NHTSA con candado SHA-256 y arma una tabla por vehículo y evento con:
   - perfil de aplastamiento C1–C6, ancho, PDOF, plano CDC y objeto;
   - masa y dimensiones del vehículo;
   - ΔV de WinSmash (`CDC.DVTOTAL/DVLONG/DVLAT`, `DVBASIS`);
   - ΔV del EDR (`EDREVENT.MAXDVLONG/MAXDVLAT`, ligado por `CDCEVENT`);
   - el otro vehículo del evento.
2. **Inversión** (`solver/croquis_solver/inversion.py`, módulo 6.1.10):
   - **ΔV desde el daño:** CRASH3 con rigidez por clase y su dispersión, para choques entre dos vehículos y contra objeto.
   - **Velocidades desde la evidencia:** mínimos cuadrados robustos (SciPy `least_squares` con pérdida `soft_l1`) a partir de daños, posiciones finales, marcas de frenado y distancia de proyección.
   - **Distribución:** se obtiene muestreando las entradas inciertas con semilla.
3. **Monte Carlo** (módulo 6.1.11): muestrea todo campo con rango (masas, velocidades, fricción, frenado, rigidez) con semilla y da percentiles de la velocidad al impacto, ΔV y posiciones finales en el resultado. Cambia `resultado.schema.json` a 1.3.0, con el Zod generado, el panel del visor y las pruebas.
4. **Consistencia** (módulo 6.1.12): banderas cuando lo declarado no cabe en ninguna muestra física (marcas contra velocidad, reposo inalcanzable, proyección contra velocidad, daño contra velocidad), explicadas en lenguaje llano y sin culpa, con una prueba por bandera.
5. **E3** (`eval/croquis_eval/e3_ciss.py`): ΔV de Croquis desde el daño medido contra el ΔV del EDR, comparado con WinSmash contra el EDR. Reporta error absoluto medio, sesgo por rango de ΔV y cobertura del intervalo.
6. **Hipótesis en el visor:** comparar dos escenas (por ejemplo 40 contra 60 km/h) con vehículos fantasma y la diferencia de resultados en un panel.
7. **Pendientes de F6:**
   - **Relatos-MX:** test nuevo adaptado de narrativas públicas de CISS, con su propio candado.
   - **Prompt v2:** con la tabla modelo → clase, validado en el dev y medido en ese test nuevo.

Riesgos:

- **Datos de CISS:** solo una parte de los casos tiene EDR, y su ΔV es longitudinal y lateral por separado y con códigos centinela (888/997). Se filtra y se documenta cada exclusión.
- **Clases de vehículo:** la clasificación de CISS (BODYTYPE) es distinta de la nuestra y hace falta una tabla de correspondencia con fuente.
- **Rendimiento:** Monte Carlo es costoso en la laptop y su número de muestras se elige midiendo el tiempo.

### Hecho

- **CISS 2017–2024** (`data/croquis_data/ciss.py`, `croquis-data ciss download|build [--check]`):
  - CSV oficiales de NHTSA con candado SHA-256 por año, registrados en `data/SOURCES.md`.
  - Tabla por vehículo y evento en `data/processed/ciss/e3_vehiculos.csv` (8,975 filas), con perfil C1–C6, ancho, PDOF, objeto, masa, ΔV de WinSMASH, ΔV del EDR ligado por `CDCEVENT` y el otro vehículo.
  - Las exclusiones se cuentan en `e3_conteos.json`.
- **Inversión** (`solver/croquis_solver/inversion.py`, módulo 6.1.10):
  - **ΔV desde el daño:** CRASH3 con rigidez de NHTSA muestreada por bootstrap (A y B juntas) y error de modelo calibrado en CISS dev.
  - **Velocidades y rumbos desde la evidencia:** posición y rumbo final, marcas de frenado (fijan la distancia de frenado), proyección y daño. Mínimos cuadrados robustos (`soft_l1`) sobre el solver completo.
  - **Identificabilidad por Laplace:** "la evidencia no basta" en vez de un intervalo de los límites de búsqueda; las estimaciones en el límite se marcan.
  - **Distribución:** 12 reestimaciones con semilla por el método de la cuerda, con respaldo de ajuste completo.
- **Monte Carlo** (`montecarlo.py`, 6.1.11): 64 muestras uniformes con semilla y rangos según la fuente del dato. Resultado 1.3.0 con `incertidumbre`; el visor muestra el rango del 80 % bajo cada valor.
- **Consistencia** (`consistency.py`, 6.1.12): seis banderas contra el rango físico, en llano y sin culpa:
  - `detenido_con_velocidad`, `marcas_vs_velocidad`, `proyeccion_vs_velocidad`;
  - `dano_vs_velocidad`, `velocidad_vs_evidencia`, `reposo_inalcanzable`.

  En `/relato` son las primeras preguntas de cada ronda. La evidencia que una bandera ya cubre no se vuelve a preguntar con el aviso del solver.

- **Resultado 1.4.0:** `inversion` y `consistencia`, precalculados en las diez escenas; Zod regenerado. La API acepta `POST /reconstruir {analisis: true}`, con límite propio por hora (`CROQUIS_ANALYSIS_RATE_LIMIT_PER_HOUR`).
- **Visor:**
  - Panel "Lo que dice la evidencia física": evidencia usada, valor de partida contra lo que fija la evidencia, y "Datos que no cuadran".
  - Comparación de hasta tres hipótesis como vehículos fantasma (azul, naranja y violeta) con la diferencia en un panel (PLAN §7.6).
- **E3** (`eval/croquis_eval/e3_ciss.py`): ΔV de Croquis y de WinSMASH contra el EDR. Calibra en 2017–2021 y reporta en 2022–2024, por grupo de plano, contacto y rango de ΔV.
- **F7 en las escenas** (`eval/croquis_eval/f7_inversion.py`): parámetros identificables, banderas, tiempos y el intervalo sin la regla de identificabilidad.
- **Arreglo del solver:** un poste o árbol a muy baja energía disparaba una aserción (energía bajo el umbral de deformación permanente). Se acepta perfil cero y hay prueba de regresión con Hypothesis.
- **Documentación:** `docs/physics.md` §10–§12, ADR 0010 y README (filas y lectura honesta de E3, "Qué hay hoy").

### Evidencia (local, Windows, 2026-10-14)

| Comando                                                         | Resultado                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uv run ruff check .` · `ruff format --check .` · `pyright`     | sin errores                                                                                                                                                                                                                                                      |
| `uv run pytest`                                                 | **436 pruebas** en verde (inversión 19, consistencia 8, Monte Carlo 5, preguntas 12, API 12, objeto fijo con regresión)                                                                                                                                          |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `format:check`   | en verde; **899 pruebas** (relato 547, scene-schema 126, viewer 160, croquis-2d 35, web 24, solver-ts 7)                                                                                                                                                         |
| Playwright (`visor.spec.ts`: hipótesis y volcadura)             | en verde: dos hipótesis se suman y se quitan (fantasmas contados en la escena); la bandera de reposo inalcanzable se ve en la volcadura                                                                                                                          |
| `uv run croquis-solver reconstruct --check`                     | resultados 1.4.0 de las diez escenas al día (con `incertidumbre`, `inversion` y `consistencia`)                                                                                                                                                                  |
| `uv run croquis-eval e3-ciss`                                   | test 2022–2024, 2,205 vehículos: Croquis 11.49 km/h de error medio (WinSMASH 8.19); EDR ≥ 48 km/h: sesgo −3.14 (WinSMASH −14.37); traseros 16.59 (7.26); cobertura p10–p90 81.7 %                                                                                |
| `uv run croquis-eval f7-inversion`                              | en las diez escenas: 3 banderas (2 `velocidad_vs_evidencia`, 1 `reposo_inalcanzable`); sin la regla de identificabilidad, el p10–p90 sale 0.8–200 km/h (poste) y 0.2–200 (árbol); inversión más lenta 38.95 s (glorieta), Monte Carlo 10.16 s (frontal en curva) |
| `uv run croquis-eval e1-extraction --split test` (reproducción) | las preguntas ahora empiezan por la consistencia: cobertura sobre reglas 32.8 % → **33.9 %** (59 de 174); Sonnet y Haiku sin cambio (5.4 % y 8.6 %). README actualizado; la tabla de F6 queda como registro de su commit                                         |

Capturas revisadas (no versionadas): el visor con una hipótesis (fantasmas azules desplazados 4 m del vehículo real, tabla de diferencias) y el panel de evidencia en `peaton_cruce` y `glorieta` (velocidad que fija la evidencia, "la evidencia no basta", estimación en el límite).

Incidente: una corrida local de `pnpm test` falló una vez en `debris.test.ts` (horneado con Rapier, choque de frente) y no se reprodujo en 5 corridas más. Se dio a esas pruebas un límite explícito de 30 s por si fue el de 5 s por omisión. Si reaparece con otro mensaje, se investiga como bug.

### Pendientes registrados

1. **Relatos-MX, segundo test y prompt v2 (pendiente de F6). Hecho el 2026-10-14** (ver "F7 (continuación)" y ADR 0012).
   - **Fuente:** los CSV de CISS no traen narrativas y NHTSA no publica una API documentada para las del Crash Viewer (su API documentada es la de FARS). El test se construirá desde los campos codificados de CISS (maniobra, tipo de choque, superficie, luz, clima, clase): la verdad viene de NHTSA, no del autor de los relatos.
   - **Prompt v2:** con la tabla modelo → clase, validado en dev y medido en ese test nuevo.
2. **Rigidez lateral y trasera desde pruebas de NHTSA** (FMVSS 214 lateral y FMVSS 301 trasera). Es la debilidad medida en E3. No se ajusta con el EDR de CISS para no mezclar validación y calibración. Cambiará resultados y capturas. **Hecha el 2026-10-15:** lateral (ADR 0013) y trasera (ADR 0014).
3. **Inercia de guiñada medida** (Heydinger et al., SAE 1999-01-1336) en lugar de la placa uniforme. Cambia todas las trayectorias posteriores al impacto y las capturas. **Hecha el 2026-10-15** (ADR 0015).
4. **Marcas de derrape en la inversión.** El contrato no dice si son anteriores o posteriores al impacto; hace falta un campo y una versión del contrato. **Hecho el 2026-10-15** (ADR 0016).
5. **Procedencia del rumbo final.** Hoy es parte de la pose declarada. Si E9 muestra que las personas no lo dicen, se separa en el contrato.
6. **Port TS** de inversión, Monte Carlo y las banderas de consistencia que muestrean: F9, con E7. Con la migración (ADR 0011) ya no hay servidor Python al cual llamar.
7. **CMA-ES** si aparecen escenas multimodales; en las diez canónicas el ajuste local converge.

### Decisiones

- ADR 0010: partición por año en E3, rigidez muestreada, inversión sobre el solver completo, identificabilidad explícita, método de la cuerda, consistencia contra rangos, resultado 1.4.0 e hipótesis con fantasmas.
- La rigidez lateral y trasera se queda como `supuesto` hasta tener una fuente física. No se calibra con el EDR.
- Las hipótesis se reconstruyen en el servidor. En la demo sin red llegarán con el port TS (F9). **Actualizado por la migración (ADR 0011):** ahora se reconstruyen en el navegador, en un Web Worker con el solver TS.

### Resumen para René (F7)

Croquis ya no da un solo número cuando no lo sabe:

1. **Rangos:** cada velocidad, ΔV y posición final trae el intervalo del 80 % (Monte Carlo con semilla).
2. **Lo que dice la evidencia:** con posiciones finales, marcas de frenado, distancia de proyección o daño, Croquis busca las velocidades y direcciones con las que el solver la reproduce. Cuando la evidencia no basta (por ejemplo, contra un poste), lo dice en vez de inventar un intervalo.
3. **Datos que no cuadran:** se marcan en lenguaje llano, sin culpar, y en `/relato` se convierten en preguntas. Ejemplo: en el cruce peatonal, las marcas y la distancia de proyección piden 51–56 km/h y el relato dice "como a 40".
4. **Hipótesis:** en `/visor`, "¿y si iba a 60?" dibuja la otra reconstrucción como fantasma de color (hasta tres) y compara velocidades, ΔV y posición final.

E3 con 2,205 casos reales de NHTSA (2022–2024):

- **En conjunto:** Croquis estima el ΔV con 11.49 km/h de error medio, contra 8.19 de WinSMASH (la herramienta de NHTSA).
- **Choques fuertes:** Croquis tiene mucho menos sesgo (−3.14 contra −14.37 km/h).
- **Traseros:** son su punto débil, porque no hay rigidez medida para atrás ni para los lados.
- **Intervalo:** cubre el 81.7 % de los casos.

Cómo probarlo:

- **Visor:** `pnpm --filter @croquis/web dev` y abre `/visor?escena=peaton_cruce`. Mira el panel "Lo que dice la evidencia física".
- **Hipótesis:** necesitan la API corriendo (`uv run uvicorn croquis_api.main:app`).

Qué necesito de ti: nada nuevo. Siguen pendientes AWS y Vercel y las personas para E9.

## Migración a Vercel solo (decisión de René, 2026-10-14)

Despliegue solo en Vercel: la web y la API van juntas como Route Handlers de Next.js, sin AWS, CDK ni FastAPI, y en producción no corre Python (`CLAUDE.md` y `PLAN.md` nuevos). El solver Python y la extracción Python quedan como referencia para pruebas, paridad y evaluaciones.

René eligió portar ya el núcleo del solver a TS, para que nada deje de funcionar en Vercel: las preguntas por sensibilidad y las contradicciones de `/relato`, y las hipótesis del visor. La inversión y Monte Carlo en TS siguen en F9, como él pidió. Las banderas de consistencia que dependen de ellos (daño contra velocidad, reposo inalcanzable y velocidad contra evidencia) llegan a TS con ese port.

### Plan (orden de trabajo)

1. **Hecho:** `CLAUDE.md` y `PLAN.md` nuevos; `packages/relato` pasa a `packages/extraction` (`@croquis/extraction`).
2. **`packages/extraction` en TS:**
   - Hechos, constructor de `EscenaSpec`, verificador de evidencia, línea base de reglas y conversión de la salida de Claude.
   - Cliente de Claude con salida estructurada. Reproduce las grabaciones existentes, con la misma huella de prompt que Python.
   - Tope de gasto detrás de una interfaz: archivo en local y Upstash Redis en Vercel. Conectar Upstash requiere la cuenta de René.
   - **Paridad:** salidas doradas de Python sobre todo Relatos-MX (reglas y respuestas grabadas de Haiku y Sonnet), comparadas en Vitest sin llamar a la API.
3. **Núcleo del solver en `packages/solver-ts`:** todo lo que usa `reconstruct` (pre-impacto, impulso, CRASH3, objeto fijo, post-impacto, contacto, vía, objetos, personas, ocupantes, visibilidad y volcadura). Paridad E7 contra los resultados de las 10 escenas canónicas, con tolerancia documentada.
4. **Preguntas en TS:**
   - Contradicciones por los avisos del solver, sensibilidad con Mersenne Twister idéntico al `random` de Python, glosario, banderas de consistencia que no dependen de inversión ni Monte Carlo, y aplicación de respuestas.
   - **Paridad:** contra Python con el mismo conjunto de banderas.
5. **Route Handlers:**
   - `apps/web/src/app/api/relato/extraer` (con streaming) y `/api/relato/responder`, con límite de peticiones (Upstash en Vercel, memoria en local).
   - Las hipótesis del visor se reconstruyen en el navegador con solver-ts en un Web Worker.
6. **Evaluaciones:** E1 mide el pipeline TS desde Node (Python solo puntúa) y debe dar los mismos números. Si no, se depura. El test congelado no se toca.
7. **Limpieza:** se borran `services/api`, `infra/` y lo de AWS; se actualizan CI, `.env.example`, la documentación y ADR 0011 (Vercel solo); merge con todo en verde y regreso a F7.

Riesgos:

- **Regex Python contra JS:** `\b`, `\w` y lookbehind se comportan distinto. Se mitiga trabajando sobre el texto plegado y con la paridad dorada.
- **Posiciones:** Python cuenta puntos de código y JS unidades UTF-16. Se convierten al escribir la evidencia.
- **Paridad numérica del solver:** `Math` de V8 contra `libm`, que se amplifica en el contacto iterativo. La tolerancia se documenta en E7.

### Hecho

Los siete pasos del plan están terminados, y están en ADR 0011.

- **`packages/extraction` (TS):**
  - Hechos, constructor, verificador, línea base de reglas, conversión de la salida de Claude y preguntas, con paridad exacta contra Python sin llamar a la API.
  - Del lado del servidor: Claude con streaming, grabaciones, tope de gasto (Upstash o `gasto.json`) y límite de peticiones (Upstash o memoria).
  - El prompt y las grabaciones se mudaron al paquete; la huella del prompt no cambió y todas las grabaciones siguen valiendo.
- **`packages/solver-ts`:**
  - Núcleo completo del solver con paridad E7 en las diez escenas.
  - Aritmética con la semántica de CPython (`pymath`: suma compensada, redondeo al par, `%`, `radians`/`degrees`, `isclose`, `pvariance` exacta) y el Mersenne Twister de Python (`pyrandom`), todo contra valores que escribió CPython.
- **Banderas en TS:** las tres banderas de consistencia que no muestrean. Las otras llegan en F9 con la inversión y Monte Carlo.
- **Route Handlers:** `POST /api/relato/extraer` (NDJSON en streaming) y `POST /api/relato/responder`. La página del relato muestra el avance mientras Claude escribe.
- **Visor:** las hipótesis se reconstruyen en un Web Worker con el solver TS.
- **E1:** mide el pipeline TS (`scripts/e1-predict.ts`). `--pipeline py` puntúa la referencia.
- **Limpieza:** se borró `services/api` (FastAPI) y lo de AWS. Se actualizaron `.env.example` (Upstash), CI (verificación de los módulos generados de prompts y tablas del solver), README, ADR 0001, 0002 y 0011, y `docs/responsible-ai.md`.
- **Bug de la referencia encontrado por el port:** con la normal del impacto tomada de la velocidad relativa, el signo del ruido de redondeo de v_t decidía la fricción del contacto. Dos normales a un bit de distancia daban 15 540 J o 27 568 J disipados. Los dos solvers tratan ahora |v_t| ≤ 1e−9·|v_n| como cero. Hay prueba de regresión con el caso real, que falla sin el arreglo, y los resultados canónicos no cambian.

### Evidencia (local, Windows, 2026-10-14)

| Comando                                                                 | Resultado                                                                                                                                                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @croquis/extraction test`                                | paridad del pipeline en todo Relatos-MX (reglas, Haiku, Sonnet; con control negativo), huella del prompt idéntica, 70 rondas de preguntas idénticas, servidor con dobles del SDK |
| `pnpm --filter @croquis/solver-ts test`                                 | E7 en las diez escenas con la tolerancia de `reconstruct --check` (con control negativo), aritmética de CPython bit a bit                                                        |
| `pnpm --filter @croquis/solver-ts e7`                                   | 61,888 números comparados; diferencia máxima 4.3e-5 (un impulso en N·s); 0 diferencias de estructura o texto (`eval/results/e7_parity.json`)                                     |
| `uv run croquis-eval e1-extraction --split test` (TS) y `--pipeline py` | métricas idénticas salvo la latencia de las reglas (0.85 ms p50 en TS, 2.56 ms en Python); idénticas también a las publicadas antes de la migración, así que E1 sigue vigente    |
| Playwright `relato` e `hipótesis`                                       | en verde sobre el build de producción; el Web Worker del solver funciona con Turbopack                                                                                           |

### Pendientes registrados

1. **Análisis bajo pedido** (`/reconstruir {analisis: true}`, de F7): se fue con FastAPI y vuelve con la inversión y Monte Carlo en TS (F9). Los resultados de las escenas canónicas los siguen trayendo precalculados.
2. **Banderas que muestrean en TS** (daño, reposo, velocidad contra evidencia): F9. En el test de E1 no cambian ninguna métrica.
3. **Vercel:** René tiene que conectar el repo, configurar las variables (`ANTHROPIC_API_KEY`, el tope y las de Upstash) y elegir el plan. Sin Upstash, en producción solo responde la línea base de reglas.

## F7 (continuación) — Relatos-MX: test CISS y prompt v2

Rama `feat/f7-relatos-ciss`. Es el pendiente 1 de F7. La migración a Vercel ya se fusionó (PR #10).

### Plan

1. **Fichas desde CISS** (`data/croquis_data/ciss_relatos.py`, `croquis-data ciss relatos [--check]`):
   - Selección con semilla y por estratos de los casos 2017–2024, para que los tipos se parezcan a la distribución de ATUS.
   - Cada código de NHTSA se traduce al vocabulario del contrato, usando las etiquetas oficiales de `FORMAT24.sas`, que viene en el mismo zip, y el manual (DOT HS 813 771).
   - Lo que se traduce: ambiente (WEATHER, LIGHTCOND, SURFCOND, SURFTYPE), vía (ALIGNMENT, RELJCT2, TYP_INT), control (TRAFCONT), maniobra (PREMOVE), frenado (MANEUVER), clase (BODYTYPE con largo), zonas (GAD del primer evento), tipo y objeto (EVENT) y la velocidad antes del choque del EDR (EDRPRECRASH, código 1010).
   - Un código sin equivalente exacto deja el campo fuera de la ficha, con cada exclusión contada.
   - Salida: `data/relatos-mx/ciss/fichas.jsonl` y conteos.
2. **Relatos escritos desde las fichas:**
   - Los escriben agentes que no vieron la línea base de reglas, con los cinco registros y PII sintética.
   - Quien escribe solo pone el texto y las citas: `relatos check` exige que los hechos anotados sean exactamente los de la ficha.
   - Un segundo agente, independiente, revisa que el texto no afirme hechos fuera de la ficha.
3. **Partición `ciss` en Relatos-MX:** `fuente/ciss-*.toml`, `build/ciss.jsonl` y su propio candado `ciss.lock`. Se congela antes de la primera evaluación. El test actual no se toca: su hash solo cubre la partición `test`.
4. **E1 con `--split ciss`** sobre el pipeline TS: reglas, y Haiku y Sonnet con prompt v1 (grabaciones nuevas, dentro del tope diario).
5. **Prompt v2:** la tabla modelo → clase; se valida en dev y se mide en `ciss`.

Riesgos:

- **CISS es de EE. UU. y solo de vehículos de pasajeros remolcados.** Los relatos se adaptan a México (km/h, vías y modelos que circulan aquí) y la distribución de tipos no puede ser la de ATUS en todo: casi no hay motocicletas. Lo que no se pueda se documenta.
- **Velocidad narrada:** la gente redondea. La ficha guarda el valor del EDR y la velocidad narrada redondeada a 5 km/h, que es la verdad de la extracción. El error contra el EDR se reporta aparte.

### Avance (2026-10-14)

1. **Fichas, hecho.** `croquis-data ciss relatos`, con pruebas sintéticas de cada traducción, exclusión, clase y acoplamiento. Al escribir y revisar salieron cuatro reglas que se aplicaron al generador y a todos los relatos (ADR 0012 §9):
   - clase del relato aparte de la de E3: carrocería que decide sola, VPIC y `modelos.json` coinciden;
   - tamaño dicho en el texto cuando el modelo no está en la tabla;
   - hechos que van juntos (velocidad 0 con detenido; dispositivo del cruce con su tipo, también en 'Intersection-Related');
   - el ciclista en su bicicleta, como choque entre vehículos.
2. **Relatos, hecho.** Los 150 pasaron por cuatro etapas:
   - escritos por seis agentes que no vieron la línea base;
   - revisados por otros seis;
   - editados para decir el tamaño y los cruces acoplados;
   - validados por la verificación contra la ficha, el esquema y el validador semántico.
     Se leyó una muestra antes de congelar.
3. **Partición `ciss`, congelada** (`ciss.lock`, `bd16632a…`). `test.lock` sigue intacto. Las salidas doradas incluyen los relatos CISS y la paridad TS pasa en reglas y redacción.
4. **Prompt v2, hecho.** Tiene versión propia en Python y TS, con huellas, paridad y grabaciones en `grabaciones/extraccion_v2/`.
   - **Grabaciones:** v1 y v2 en dev y en `ciss`, con Haiku y Sonnet. Las repeticiones van en todo, salvo v1 en dev (abajo). El libro de gasto registra $18.57 en el día (`grabaciones/gasto.json`), dentro del tope de $20.
   - **Libro de gasto seguro para grabadores en paralelo:** usa candado y escritura atómica. En Windows, abrir un candado que otro está borrando da `PermissionError`; ahora se reintenta, y lo prueba un caso propio.
5. **E1 medido.** El orden fue: dev con v1 y v2, decisión, y después `ciss`.
6. **v2 a producción** (`PROMPT_VERSION` en Python y TS, ADR 0012 §10). Los resultados sin sufijo siguen siendo de v1.

### Evidencia y números medidos (`eval/results/e1_extraction_dev*.json`, `e1_extraction_ciss*.json`)

| Medida                                                  | v1            | v2                |
| ------------------------------------------------------- | ------------- | ----------------- |
| Dev, F1 micro Sonnet / Haiku                            | 0.895 / 0.872 | **0.937 / 0.918** |
| Dev, clase Sonnet / Haiku                               | 0.638 / 0.662 | 0.944 / 0.932     |
| `ciss`, F1 micro Sonnet / Haiku                         | 0.978 / 0.968 | **0.993 / 0.986** |
| `ciss`, clase Sonnet / Haiku                            | 0.851 / 0.819 | 0.975 / 0.942     |
| `ciss`, repetir el mismo relato (de 150) Sonnet / Haiku | 0 / 5         | 1 / 5             |
| `ciss`, costo por 1,000 relatos Sonnet / Haiku          | $8.42 / $0.99 | $9.42 / $1.05     |

- **Reglas en `ciss`:** F1 0.690, clase 0.514, vehículos exactos 53.3 %.
- **Fuga del redactor:** 2 de 163 datos personales (1.2 %), los dos nombres.
- **Velocidad contra el EDR:** de 113 relatos con velocidad, Claude la extrae en todos, con 1.47 km/h de error medio contra el EDR, igual al piso del redondeo a 5 km/h. Las reglas la extraen en 104, con 3.09 km/h.
- **Suites, local:**
  - Python: ruff, pyright y pytest en verde.
  - TS: format, lint, typecheck, tests (782 en extraction) y build en verde.
  - Al día: los `generate:check`, `golden check`, `relatos check` (los dos candados intactos) y `ciss relatos --check`.

### Pendientes registrados (de esta rama)

1. **v2 en el primer test. Hecho el 2026-10-15** (ver arriba). Sirve para la continuidad de la fila de E1, no para decidir: en ese test se descubrió el problema de la clase.
2. **Repeticiones de v1 en dev. Hechas el 2026-10-15.**
3. **Clase de E3 y clase del relato.** E3 agrupa la carrocería 14 de CISS (SUV compacta) por su código y el test CISS la separa por largo. No cambia E3 (la clase solo elige rigidez), pero conviene unificarlas cuando se revise la rigidez (pendiente 2 de F7).

### Resumen para René (F7, test CISS y prompt v2)

1. **Un test cuya verdad no escribí yo.** Son 150 relatos nuevos. Los hechos salen de los campos codificados de 150 choques reales de NHTSA CISS 2024, y la velocidad, del EDR del vehículo. Otros agentes escribieron el texto; el sistema rechaza un relato si sus hechos no son exactamente los de NHTSA.
2. **El problema de la clase quedó resuelto.** Claude omitía la clase cuando el relato solo nombraba el modelo ("mi Aveo"). El prompt v2 le da la tabla de modelos. Se probó primero en dev y después en el test nuevo:
   - clase con Sonnet, de 0.851 a 0.975;
   - F1 general, de 0.978 a 0.993.
     Ya es el prompt de producción.
3. **Velocidad:** Claude extrae la velocidad narrada sin error. Contra el EDR queda a 1.47 km/h, que es justo lo que se pierde al redondear a 5 km/h como lo diría una persona.

Cómo probarlo:

- `uv run croquis-eval e1-extraction --split ciss` reproduce los números desde las respuestas grabadas, sin gastar.
- `uv run croquis-extraction relatos check` verifica que los dos tests congelados siguen intactos.

Qué necesito de ti: nada nuevo. El gasto en Claude del día fue $18.57 de los $20 del tope. Siguen pendientes Vercel y Upstash y las personas para E9.

## F7 (continuación) — Rigidez lateral (pendiente 2)

Rama `feat/f7-rigidez-lateral`. ADR 0013.

### Plan

1. **Bajar las pruebas `ITV`** de la Vehicle Crash Test Database (impactor contra vehículo): `croquis-data nhtsa download|process --config ITV`.
2. **Derivar la rigidez con la inversa exacta del cálculo del solver** (`eval/croquis_eval/e2_mdb.py`, `croquis-eval e2-mdb`):
   - momento en 1-D con restitución cero;
   - CRASH3 con corrección por PDOF;
   - forma de WinSMASH con el $d_0$ de NHTSA.
3. **Escribir las zonas en `stiffness_classes.json`** sin pisar la frontal, en cualquier orden.
4. **Validar con E3** (test 2022–2024, que no ajusta nada); regenerar escenas canónicas, tablas del port TS y E7.

Riesgo: la API no trae el aplastamiento de la cara de la barrera deformable, así que la parte de energía que absorbe necesita una fuente.

### Hecho

1. **Datos:** 2,517 pruebas ITV (`data/processed/nhtsa/itv_tests.csv`; crudos en `data/raw/nhtsa/itv/`, no versionados). Quedan 1,265 pruebas laterales de FMVSS 214 y NCAP en 8 clases; los conteos de cada filtro están en `e2_mdb.json`.
2. **Método:**
   - la barrera se lleva el 13.6 % de la energía (Johnson 2011, 70 pruebas con el aplastamiento de la cara medido; NHTSA supone 5 %, y como sensibilidad se reportan esos coeficientes);
   - $d_0 = 63.3\ \sqrt{N}$ de NHTSA;
   - una prueba unitaria verifica que el solver reproduce el ΔV de cada prueba con su propia rigidez.
3. **Equilibrio de fuerzas, descartado antes de mirar E3:** daba a la barrera 54 % de la energía, incompatible con lo medido.
4. **La tabla de rigidez la escriben `e2-barrier` y `e2-mdb`;** una prueba exige que salga idéntica desde los CSV en los dos órdenes.
5. **Regenerados:**
   - E3 (σ recalibrado en dev a 0.4658);
   - las escenas `glorieta`, `lateral_interseccion`, `motociclista` y `volcadura`;
   - las tablas del port TS y E7.

   F7 en las escenas no cambia, salvo los tiempos.

### Evidencia (local, Windows, 2026-10-15)

| Comando                                        | Resultado                                                                                                                                                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uv run croquis-eval e2-mdb`                   | 1,265 pruebas laterales; dejar uno fuera: ΔV con error medio 6.19 km/h, contra 14.95 con el respaldo genérico                                                                                                                                       |
| `uv run croquis-eval e3-ciss` (test 2022–2024) | costados 11.04 → **8.51 km/h** (sesgo +6.26 → +2.44; ±10 km/h 56.3 % → 69.2 %; WinSMASH 7.32); conjunto 11.49 → **10.30** (WinSMASH 8.19); EDR ≥ 48 km/h 19.56 → 19.94 (sesgo −3.14 → −5.19); traseros sin cambio (16.45); cobertura p10–p90 82.0 % |
| `pnpm --filter @croquis/solver-ts e7`          | 61,888 números, diferencia máxima 4.3e-5, 0 diferencias de estructura                                                                                                                                                                               |
| suites                                         | ruff, pyright, pytest (455 en verde; las salidas doradas de extracción fallan solo en local, por las grabaciones sin versionar de la otra rama), format, lint, typecheck, tests TS, `generate:check`, build                                         |

- **La tabla en el navegador:** crece a ~170 KB y queda en un fragmento de 104 KB del worker del solver. El worker solo se crea con la primera hipótesis, así que la carga inicial de E6 no cambia.

### Pendientes

1. **Rigidez trasera desde los reportes PDF de FMVSS 301** (siguiente paso).
   - La API trae 170 pruebas desde 2007 sin masa, largo ni perfil del vehículo. Las completas son de modelos 1978–1994, y desde 1995 solo hay 8.
   - Cada prueba tiene un reporte PDF (~5 MB) con el peso de prueba, la masa de la barrera, la velocidad medida y el aplastamiento en tres puntos (izquierda, centro, derecha). Ejemplo: prueba 9643, Acura RDX 2008, 1,983.5 kg, barrera de 1,357.5 kg a 79.44 km/h, aplastamiento 384/418/311 mm.
   - Plan: bajar los reportes, extraer esos campos con un lector por laboratorio, validar contra la API donde coincidan, y aplicar el mismo método (la barrera deformable de la trasera se lleva la fracción medida en costados, como supuesto declarado).
2. **Fracción de la barrera por prueba:** hoy es un promedio. Si en algún momento la API o los reportes dan el aplastamiento de la cara, puede salir de cada prueba.
3. **Unificar la clase de E3 con la del test CISS** (carrocería 14 de CISS), como se anotó en el pendiente 3 del test CISS.

### Resumen para René (F7, rigidez lateral)

Los costados ya no usan una rigidez inventada. Sale de 1,265 choques de prueba de NHTSA contra el costado (FMVSS 214 y NCAP), con un método que reproduce cada prueba.

Contra lo que registraron los EDR de choques reales (CISS 2022–2024, que no se usó para ajustar nada):

- en costados, Croquis se equivoca 8.51 km/h en promedio, antes 11.04; WinSMASH, la herramienta de NHTSA, 7.32;
- en conjunto, 10.30 contra 11.49 antes;
- en los choques más fuertes empeoró un poco, y los traseros siguen igual.

La parte trasera es lo siguiente. Los datos modernos están en los reportes PDF de NHTSA y hay que leerlos uno por uno.

Cómo probarlo: `uv run croquis-eval e2-mdb` y `uv run croquis-eval e3-ciss` reproducen los números desde los CSV versionados.

Qué necesito de ti: nada nuevo.

## F7 (continuación) — Rigidez trasera (pendiente 2)

Rama `feat/f7-rigidez-trasera`. ADR 0014.

### Hecho

1. **Reportes PDF de FMVSS 301 revisados** en los tres laboratorios (casi todas las pruebas modernas tienen reporte).
   - Calspan trae el aplastamiento del vehículo en tres puntos.
   - KARCO trae el aplastamiento al centro y el de la cara de la barrera, que llega cerca del fondo.
   - MGA no trae el aplastamiento del vehículo en el texto.

   La parte de energía de la barrera deformable en la trasera es grande y no se conoce por prueba, así que no se usaron.

2. **Trasera desde las pruebas FMVSS 301 con barrera rígida** (no absorbe energía): 136 pruebas de modelos 1975–2004 en 6 clases, con el mismo método de ADR 0013.
3. **Regla fijada antes de correr E3:** adoptar solo si mejora los traseros del dev de E3. En el dev pasó de 13.20 a 7.21 km/h; se adoptó. El test solo se reporta.
4. **Regenerados:**
   - E3 (σ = 0.4319);
   - la escena `alcance`, la tabla del port TS y E7.

   F7 en las escenas no cambia, salvo los tiempos.

### Evidencia (local, Windows, 2026-10-15)

| Comando                                        | Resultado                                                                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uv run croquis-eval e2-mdb`                   | trasera: 136 pruebas; dejar uno fuera: ΔV con error medio 4.57 km/h, contra 33.94 con el respaldo                                                                                                                                     |
| `uv run croquis-eval e3-ciss` (test 2022–2024) | traseros 16.45 → **7.68 km/h** (sesgo +11.40 → −0.75; ±10 km/h 53.5 % → 78.1 %; WinSMASH 7.26); conjunto 10.30 → **8.85** (WinSMASH 8.19); EDR ≥ 48 km/h 19.94 → 16.26 (WinSMASH 17.54; sesgo −11.90 contra −14.37); cobertura 81.5 % |
| `pnpm --filter @croquis/solver-ts e7`          | 61,888 números, diferencia máxima 4.3e-5, 0 diferencias de estructura                                                                                                                                                                 |

### Pendientes

1. **Flota moderna para la trasera:** la rigidez viene de modelos 1975–2004. Se podría usar la de los reportes de Calspan (perfil de tres puntos) cuando haya una forma medida de repartir la energía con la barrera deformable cerca del fondo de su cara.
2. **SUV grande y autobús** siguen con el respaldo en la trasera (una prueba cada uno).

### Resumen para René (F7, rigidez trasera)

La parte trasera ya no usa una rigidez inventada. Sale de 136 choques de prueba de NHTSA contra la parte trasera con una barrera rígida.

Contra los EDR de choques reales (CISS 2022–2024):

- en traseros, Croquis se equivoca 7.68 km/h en promedio (antes 16.45; WinSMASH 7.26);
- en conjunto, 8.85 km/h contra 8.19 de WinSMASH.

El límite: esas pruebas son de autos de 1975–2004, porque las modernas no traen los datos necesarios. Por eso la regla para adoptarla se fijó antes, sobre los años de desarrollo.

Qué necesito de ti: nada nuevo.

## F7 (continuación) — E1 del prompt v2 en el primer test y contrafactuales pareados

Rama `feat/f7-e1-v2-test`.

### Hecho

1. **Grabaciones:** v2 en el primer test (relatos, contrafactuales y repeticiones) y las repeticiones de v1 en dev, con los dos modelos, dentro del tope diario (`grabaciones/gasto.json`).
2. **E1 en el primer test con v2** (`e1_extraction_v2.json`): Sonnet 0.875 → **0.919** (clase 0.638 → 0.921), Haiku 0.852 → **0.896** (clase 0.614 → 0.882). Se midió después de decidir el prompt.
3. **Contrafactuales pareados con la repetición:** E1 cuenta, por tipo (sexo, edad, vehículo), los pares en que cambia solo el contrafactual o solo la repetición del mismo relato, y aplica McNemar exacto. En los de sexo, también en qué versión sale más rápido el vehículo.
   - El sexo del relato base se lee de las palabras que cambian (`base_sex`); se probó contra los 102 pares de sexo de Relatos-MX.
   - Resultado: ningún tipo difiere del ruido. En el primer test, Sonnet v2 da 6 contra 2 en sexo (p = 0.29) y 7 contra 2 en edad (p = 0.18). Hubo 3 casos de velocidad más alta con hombre y 0 con mujer (p = 0.25), no concluyente.
   - Las reglas cambian con el modelo del vehículo en 6 de 52 pares (p = 0.03).

### Pendientes

1. **Más pares contrafactuales de sexo:** el sentido observado en Sonnet v2 (3 contra 0) no se puede confirmar ni descartar con 56 pares. Habría que ampliarlos en el dev, sin tocar los tests congelados, y repetir la medición.
2. **Reglas que dependen del modelo del vehículo:** revisar qué patrón de la línea base cambia con el nombre del modelo y corregirlo en el dev.

## F7 (continuación) — Inercia de guiñada medida (pendiente 3)

Rama `feat/f7-inercia-guinada`. ADR 0015.

### Hecho

1. **Datos:** la base de parámetros inerciales de vehículos ligeros de NHTSA (VRTC), con 495 vehículos (`croquis-data inercia download|build`, `data/processed/nhtsa/inercia.csv`).
   - El PDF oficial se baja del Internet Archive, fijado por SHA-256: NHTSA rechaza descargas automáticas.
   - Las tres tablas del PDF se emparejan por la posición de cada fila y se verifican campo por campo.
   - Dependencia nueva: `pypdf` en `croquis-data` (ADR 0001).
2. **Modelo y evaluación** (`croquis-eval inercia-guinada`): radio de giro $k = c\,L$ por grupo de carrocería, con 164 vehículos tras los filtros. Dejando uno fuera, el error de la inercia es 5.3 %, contra 10.0 % de la placa uniforme y 7.8 % de $m\,a\,b$.
3. **Solver y port TS:** `inertia.py` e `inertia.ts` leen la misma tabla. Cambian siete escenas canónicas, y la paridad E7 se mantiene (61,909 números, diferencia máxima 4.1e-5). F7 en las escenas cambia un poco.

### Pendientes

1. **Muestrear la dispersión de $c$ en Monte Carlo** (±3.5 % en el radio de giro).
2. **Vehículos actuales:** la base es de modelos 1971–1998.

## F7 (continuación) — Fase de las marcas (pendiente 4)

Rama `feat/f7-marcas-derrape`. ADR 0016.

### Hecho

1. **Contrato 1.1.0:** `evidencias[].fase` opcional (`antes_impacto` o `despues_impacto`).
   - Sin fase, el significado de 1.0.0: las de frenado, de antes del impacto; las de derrape, desconocidas.
   - La migración 1.0.0 → 1.1.0 está registrada en TS y Python (el registro estaba vacío). Una prueba migra una escena 1.0.0 y la valida.
   - Zod y Pydantic se regeneraron.
2. **Resultado 1.5.0:** la evidencia `marcas_despues:<vehículo>`.
3. **Solver:**
   - **Inversión:** las marcas de después del impacto restringen lo que el vehículo se desliza hasta el reposo, con σ = 1.5 m (supuesto).
   - **Consistencia (Python y TS):** solo compara las marcas de frenado de antes del impacto con la velocidad.
   - Hay pruebas de cada caso.
4. **Fixtures y regenerados:**
   - las siete marcas canónicas llevan su fase según el relato;
   - los constructores de specs emiten 1.1.0;
   - se regeneraron Relatos-MX (los dos candados intactos), las salidas doradas, los resultados de las escenas y E7 (sin cambios: 61,909 números, diferencia máxima 4.1e-5);
   - F7 en las escenas cambia solo en `motociclista`.

### Pendientes

1. **Moto caída que se desliza** (siguiente paso): con la raspadura como evidencia, el residuo de `motociclista` es −3.4 σ. **Hecho** (ADR 0017); el residuo queda en −3.1 σ.
2. **La fase en la extracción:** prompt, reglas y anotación del dev, sin tocar los tests congelados.
3. **Marcas de derrape de antes del impacto:** pedirían un modelo de velocidad crítica en curva.
4. **Ruido numérico entre máquinas en la inversión:** el álgebra lineal con varios hilos suma en otro orden. Ya pasó con `en_limite`, que se arregló con una tolerancia en unidades del parámetro (PR #15). Si vuelve a aparecer en otra clasificación, fijar un solo hilo en el solver de referencia.

## F7 (continuación) — Moto caída que se desliza

Rama `feat/f7-moto-caida`. ADR 0017.

### Hecho

1. **Arrastre medido:** Peck, Focha y Gloekler 2014 (ifz Forschungsheft 16), nominal 0.45 y rango 0.36–0.56.
   - Es `primaria` en asfalto y `supuesto` en otras superficies.
   - Está en `friction.json` (copiada al port TS) y registrado en `data/SOURCES.md`.
2. **Solver (Python y TS):** después del impacto, una motocicleta o un scooter se deslizan con todos sus contactos bloqueados y ese arrastre. La bicicleta conserva el modelo de llantas.
3. **Incertidumbre:** el arrastre se muestrea en Monte Carlo (`parametros.friccion_moto_caida`) y en cada reestimación de la inversión. Se sortea al final para no mover los demás sorteos.
4. **Resultado 1.6.0:** el parámetro `friccion_moto_caida` y la etiqueta en el panel del visor.
5. **Regenerados:** los resultados de las escenas, las salidas doradas, E7 y F7. Solo cambia `motociclista`: la moto se desliza 1.33 m y la raspadura dice 6 m (−3.1 σ).
6. **Pruebas:**
   - Python: tabla, monotonía del deslizamiento con el arrastre, auto sin cambios, parámetro solo con moto y muestreo en Monte Carlo.
   - TS: `friction.test.ts`.

### Pendientes

1. **Arrastre de una bicicleta caída:** falta una medición con fuente.
2. **Moto que cae antes del impacto y llega deslizándose:** pide una fase previa con caída que el contrato no describe.
3. **Separar en `motociclista`** un error del modelo de impacto moto–auto de un largo de raspadura impreciso. Hace falta un caso con datos medidos (por ejemplo, un expediente con raspadura y EDR).

## Decisión de René (2026-10-15) — BeamNG sale del proyecto

ADR 0018. PLAN.md y CLAUDE.md quedan con las versiones que dio René.

- **E5** ahora compara la deformación contra autos reales. La **F10** pasa a ser "Validación del daño contra autos reales".
  - **Fuentes:** los reportes de pruebas de NHTSA (fotos y aplastamiento medido) y los casos CISS con C1–C6.
  - **Conjuntos:** uno de desarrollo y uno de prueba que se congela antes de medir.
  - **Métricas:** error por punto C1–C6, profundidad máxima, ancho y área, por tipo de impacto, contra dos líneas base (deformación lineal y uniforme).
  - **Primer paso:** el inventario de muestras en `docs/data.md`.
- **Lo que existía de BeamNG:** solo una carpeta vacía `tools/beamng-bridge`, sin versionar; se borró. No había `eval/damage-beamng`. Las menciones en el README, en `docs/` y en este archivo se cambiaron al plan nuevo, y la licencia salió de "Bloqueado — necesita a René".
- **La volcadura 3D pierde su validación prevista:** E5 no cubre volcaduras. Queda como límite, salvo que CISS traiga casos con medidas útiles.

## Vercel conectado (2026-10-15)

René pidió que yo hiciera la conexión. La sesión de la CLI ya era suya (`renecanof-2888`).

- **Proyecto `croquis`** en `renecanof-gmailcoms-projects`: raíz `apps/web`, Next.js y Node 24.x.
  - Conectado al repo de GitHub: cada push a `main` despliega producción y cada rama, una vista previa.
- **Variables de producción y vista previa:**
  - `ANTHROPIC_API_KEY`, como secreto. Se cargó desde `.env.local` sin imprimirse.
  - `CROQUIS_LLM_MODEL=claude-sonnet-5-5`.
  - `CROQUIS_LLM_DAILY_BUDGET_USD=2`, el tope por omisión de `.env.example`; el de $20 era solo para las evaluaciones locales.
  - `CROQUIS_LLM_RATE_LIMIT_PER_HOUR=20`.
- **Producción:** https://croquis-sage.vercel.app, desplegada desde `main` (PR #17). La compilación tardó 58 s.
  - **Prueba de humo:** la página responde 200 y `POST /api/relato/extraer` devuelve una escena con `metodo: reglas`.
- **Upstash, hecho el mismo día:** René aceptó los términos y se instaló Upstash for Redis.
  - **Recurso:** plan gratuito, región `iad1`, recurso `croquis-redis`, conectado a producción y vista previa con `KV_REST_API_URL` y `KV_REST_API_TOKEN`. `budget.ts` ya acepta esos nombres.
  - **Despliegue:** se redesplegó con `vercel redeploy`, que no sube archivos.
  - **Prueba de humo:** `POST /api/relato/extraer` responde con `metodo: claude`; el tope de $2 al día y el límite por hora quedan en Redis.
  - **Archivos que no se pidieron:** la CLI instaló en el repo dos "skills" de Upstash para agentes (`.agents/`, `.claude/skills/` con enlaces y `skills-lock.json`). Son instrucciones de terceros que nadie pidió; no se versionaron y se borraron con el visto bueno de René (el proyecto usa su propio `budget.ts`).
- **Notas:**
  - Los despliegues desde la CLI quedaron bloqueados 24 h por el límite de subidas del plan gratuito (más de 5,000 archivos). Los de GitHub no pasan por ese límite.
  - `vercel link` agregó `.env*` al final de `.gitignore`, después de la excepción `!.env.example`; se revirtió porque el `.gitignore` existente ya ignora `.vercel` y `.env.local`.

## F7 (continuación) — La extracción lee la fase de las marcas

Rama `feat/f7-fase-extraccion`. ADR 0019.

### Hecho

1. **Campo `evidencias.marcas_fase`** en hechos, constructor de specs (Python y TS) y verificador. La cita de la fase va como segundo fragmento de la procedencia de las marcas.
2. **Reglas (Python y TS):** buscan la fase en la oración de las marcas y la anterior; lo explícito gana a lo deducido. Se escribieron antes de leer el lote nuevo.
3. **Prompt v3** = v2 más la regla de las marcas. v1 y v2 conservan esquema, huella y grabaciones.
4. **E1:**
   - puntúa la fase solo donde la referencia la anota (`ANNOTATED_ONLY`);
   - reporta `f1_micro_sin_campos_parciales` para comparar con versiones que no la conocen.
5. **Dev de 190 relatos:**
   - 6 relatos con marcas anotados;
   - lote `dev-006` con 30 relatos de marcas, escritos por un agente que no vio reglas, glosario ni prompts.

   Hay grabaciones de v1, v2 y v3 para todo el dev, con contrafactuales y repeticiones. v3 también se grabó en los dos tests congelados.

6. **Decisión con el criterio fijado antes de medir** (ADR 0019): v3 no empeora en dev ni en CISS y **pasa a producción**. Los números están en el README (filas de E1) y en el ADR.
   - **Fase en dev:** Sonnet F1 0.824, Haiku 0.868, reglas 0.182, sin ninguna inventada.
   - **Primer test, medido después:** Sonnet 0.924 y Haiku 0.902.
7. **README:**
   - las filas de E1 pasan a v3;
   - la fila de E7 se corrigió a lo medido: 61,912 números y 4.1e-5, porque se había quedado con los valores de antes de los PR #16 y #17.
8. **Gasto en Claude:** $15.00 el 2026-10-15 y $6.63 el 2026-10-16 (`grabaciones/gasto.json`).

### Pendientes

1. **Patrones de largo de las marcas en las reglas:** solo encuentran 4 de 36 en dev. Mejorarlos con relatos nuevos, no con el lote dev-006.
2. **Un test con la fase anotada,** congelado antes de medir.
3. **Qué vehículo deja las marcas:** hoy el constructor se las asigna al primero.
4. **Memoria de la laptop:** las grabaciones largas en segundo plano se detuvieron dos veces por falta de memoria. Correrlas por lotes, un modelo a la vez y con pocos programas abiertos.

### Resumen para René

- **Qué quedó:**
  - la extracción lee si las marcas fueron antes o después del choque;
  - producción ya usa el prompt v3;
  - Vercel y Upstash están conectados: https://croquis-sage.vercel.app extrae con Claude, con tope de $2 al día.
- **Cómo probarlo:** escribe en la app un relato con marcas ("después del golpe la moto se fue arrastrando como seis metros") y revisa la fase en la evidencia del croquis. Para la medición, `uv run croquis-eval e1-extraction --split dev --prompt extraccion_v3`.
- **Qué necesito de ti:** nada nuevo. Siguen pendientes la licencia MIT y el nombre, y las personas para E9.

## F8 — Entorno completo (plan)

Rama `feat/f8-entorno` y ramas por subfase. Criterio de aceptación (PLAN §13): una escena en una intersección real de Toluca generada desde OSM, con atribución, y capturas de clima.

Estado de partida (inventario del 2026-10-16):

- **Ya existe:** el sol según fecha, hora y lugar; la niebla exponencial; el piso oscuro y menos rugoso con lluvia; las luminarias que brillan de noche; y las banquetas, líneas y pasos peatonales.
- **Falta:**
  - OSM;
  - la atribución;
  - las partículas de lluvia y granizo;
  - el piso mojado según `estado_superficie`. Hoy `poste` dice mojado y sale seco;
  - la niebla según `visibilidad`;
  - las luces reales de alumbrado y faros;
  - las fases del semáforo y una malla por cada señal;
  - las guarniciones, el camellón elevado y las líneas como dispositivo;
  - los árboles instanciados;
  - las texturas PBR;
  - las capturas de clima.

Subfases, cada una con su PR, pruebas y E6 cuando toque el visor:

1. **F8a, clima y superficie:**
   - piso mojado desde `estado_superficie`;
   - niebla según `visibilidad`;
   - lluvia y granizo como partículas por nivel de calidad;
   - parámetros de URL `clima` e `iluminacion` para las capturas;
   - capturas de niebla, granizo, lluvia de día y noche sin alumbrado;
   - ADR 0020.
2. **F8b, alumbrado y faros con luz real:** luminarias con tope por nivel de calidad, faros según `luces_encendidas` y estacionados apagados. Se vuelve a medir E6.
3. **F8c, dispositivos y vía completa:**
   - semáforo con la luz de su fase en el tiempo;
   - una malla por cada señal;
   - guarniciones, camellón elevado y líneas;
   - árboles instanciados.
4. **F8d, vía desde OpenStreetMap:**
   - Overpass a geometría para `ubicacion_real`;
   - escena de una intersección real de Toluca;
   - atribución ODbL en pantalla y registro en `data/SOURCES.md`.
5. **F8e, texturas y cierre:** texturas PBR CC0 de Poly Haven en `assets/ASSETS.md`, E6 con todo y el resumen de la fase.

Riesgos:

- **Presupuesto E6:** WebGL alta queda en 30.3 fps en `nocturno_lluvia`. Las luces y partículas se limitan por nivel de calidad y se vuelve a medir.
- **Overpass en producción:** respuesta externa y no determinista. Se decide en el ADR de F8d.

## F8 — Estado (2026-10-16)

Las ramas van una encima de otra y se fusionan en este orden, cada una con su PR y CI en verde:

1. **`feat/f8-entorno`, PR #20, F8a y F8b** (ADR 0020 y 0021):
   - clima, piso según el estado, niebla por visibilidad, lluvia y granizo;
   - faros y alumbrado con luz real;
   - CI en verde y capturas revisadas.
   - **Falta E6** antes de fusionar: hay que medir el rendimiento con la lluvia y las luces.
2. **`feat/f8c-dispositivos`, F8c** (ADR 0022):
   - semáforos con fase en el tiempo y una placa por señal;
   - rayas del manual de la SEDATU/SCT, guarniciones, camellón elevado y árboles instanciados.
   - **Faltan** el PR, las capturas que cambian y su revisión.
3. **`feat/f8d-osm`, F8d** (ADR 0023):
   - **Contrato y datos:** contrato 1.2.0 (fuente `mapa`, `lugar.red_vial`), `croquis-data osm` y la conversión de Overpass.
   - **Dibujo y física:** la red de OSM en 2D y 3D con atribución, y la revisión `fuera_de_la_via_del_mapa` en Python y TS (resultado 1.7.0).
   - **Escena `interseccion_toluca`:** la undécima. E7 compara 68,127 números en 11 escenas, sin diferencias de estructura.
   - Revisión visual en el navegador hecha: atribución visible, calles de OSM y semáforos en su lugar.
   - **Faltan** el PR y las capturas.
4. **`feat/f8e-texturas`, F8e** (ADR 0024):
   - **Pipeline:** texturas PBR CC0 de Poly Haven (asfalto, concreto y pasto) con `croquis-assets textures`. Descarga fijada por MD5, WebP de 512 px reconstruido byte a byte en CI y registro en `assets/ASSETS.md`.
   - **Calibración:** el visor escala cada textura para que su promedio sea el color y la rugosidad calibrados del material liso. La textura agrega detalle y relieve sin cambiar el tono (seco y mojado, día y noche).
   - **Calidad y captura:** solo en calidad media y alta; `__croquisReady` espera a que se apliquen.
   - **Evidencia local:** todos los pasos de CI en verde, incluidas las 203 pruebas del visor, `textures check` y pytest completo. Se revisaron las capturas en el navegador: cruce seco, alcance mojado con lluvia y Toluca al atardecer, comparada con la versión sin texturas, mismo tono.
   - **Faltan** el PR, las capturas que cambian en calidad media (CI) y su revisión.

**E6 con F8 completo (2026-10-16): no cumple en calidad media** (ADR 0025).

- **Resultado:** `nocturno_lluvia` quedó en 50.8 fps de promedio, contra ≥ 60. Alta y carga inicial sí cumplen. La corrida está en `eval/results/e6_performance_f8_antes.json`; el `e6_performance.json` oficial sigue siendo el de antes de F8.
- **Ya corregido en `feat/f8-entorno` y llevado por merge a F8c, F8d y F8e:**
  - Los paneles se volvían a dibujar 15 veces por segundo y causaban tirones de JavaScript.
  - De noche ya no se calcula la sombra de la luna: no se ve (`eval/results/e6_sombra_luna.json`) y cuesta un pase completo.
- **En `feat/f8e-texturas`:** se probó un corte de las texturas por nivel de mip. No se nota a la vista (`eval/results/e6_corte_texturas.json`), pero es más lento en la GPU de referencia, así que se revirtió.
- **Segunda corrida de E6 (2026-10-17, René, terminal aparte):** no cumple. Media queda en 55.7 fps y alta en 27.3, las dos en `nocturno_lluvia` (`eval/results/e6_performance_f8_corte_mip.json`). Las escenas con más suelo bajaron aunque el equipo rindió más: el corte por mip las hizo más lentas en la GPU de referencia y se revirtió (ADR 0024 y 0025).
- **Por qué no hay números nuevos:** durante la sesión la batería bajó de 34 % a 27 % estando conectada. La laptop limitó su rendimiento y las mediciones de tiempo dejaron de ser comparables.

**Cambio de criterio de René (2026-10-17, ADR 0026):**

- **La laptop es el piso, no el techo.** Hay cuatro niveles (baja, media, alta y ultra), elegidos por la GPU y con cambio manual.
- **Alta y ultra:** máxima calidad visual, sin recortes por la laptop.
- **Baja y media:** se ajustan a la laptop (media ≥ 60 y baja ≥ 30 fps), primero optimizando sin cambiar el aspecto.
- **E6:** mediana de 3 repeticiones, re-medición si hay tirones externos y condiciones de la prueba registradas.
- **Tercera corrida de E6 (sin el corte por mip):** no se usa como resultado. WebGPU en alta dio repeticiones contradictorias (~20 contra ~65 fps), y WebGL 2 en media tuvo 13–15 tareas largas por escena, contra 0–4 en la corrida anterior (`eval/results/e6_performance_f8_tercera.json`).

**Estado de `feat/f8f-calidad` (PR #24):**

- **Hecho:** cuatro niveles (ultra y elección por GPU); alta y ultra completos (sombra de la luna, sombras de focos, GTAO y resplandor); E6 robusto.
- **Decisiones de medición** (ADR 0026, decisión 6): un navegador nuevo por medición y modo de energía «Mejor rendimiento» durante E6, restaurado al terminar.
- **Línea base real de media**, con navegador nuevo, en «Equilibrado» y mediana de 3: `glorieta` 54.4, `nocturno_lluvia` 55.6, `frontal_curva` 59.3 y `alcance` 59.8 fps.
- **Qué cuesta en `glorieta`:** sin las texturas del entorno gana ~4 ms por cuadro. El reparto entre color, normal, rugosidad y ruido no se pudo separar en «Equilibrado».

- **Reparto del costo en media:** medido con `eval/e6_ab.mjs`, con variantes intercaladas e IC 90 %.
  - `glorieta`: MSAA 4× 4.75 ms, texturas 3.07 ms y sombras del sol 1.91 ms.
  - `nocturno_lluvia`: MSAA 4× 6.22 ms, texturas 3.97 ms y los dos focos de faros 3.12 ms.
- **Intentos sin cambio visible:**
  - Rama de los focos: descartada porque cambiaba la imagen.
  - SMAA en lugar de MSAA: sin ahorro significativo.
- **Decisión de René (ADR 0026, decisión 7):** media usa MSAA 2× y superficies sin textura; alta y ultra conservan todo.
- **Antes → después** en media, mismas condiciones: `nocturno_lluvia` 54.2 → 62.7, `frontal_curva` 58.1 → 79.2, `alcance` 59.5 → 86.0 y `glorieta` 59.9 → 85.4 fps (`eval/results/e6_media_decision7_*.json`).
- **Regla nueva en `CLAUDE.md`:** los ajustes solo de baja o media que cumplen §7.8 se deciden sin preguntar y se documentan con antes y después.

**E6 oficial (2026-10-17, René, terminal aparte; `eval/results/e6_performance.json`, commit `78a9a5d`): cumple.**

- **Mínimo entre las 11 escenas en modo automático:** baja 104.5 fps y media 69.8 (`poste`); carga inicial 3.13 MB.
- **Condiciones válidas:** conectada al inicio y al final, «Mejor rendimiento» durante la medición y «Equilibrado» restaurado. Se re-midieron 21 repeticiones por tirones externos; quedan registradas.

### Resumen para René (F8)

- **Qué quedó:** entorno completo con su ADR y sus pruebas.
  - Clima con niebla por visibilidad, lluvia, granizo y piso según su estado (ADR 0020).
  - Faros y alumbrado con luz real (ADR 0021).
  - Semáforos con fase, señales, rayas del manual, guarniciones, camellón y árboles instanciados (ADR 0022).
  - Vía real de OpenStreetMap con la escena de Toluca y atribución ODbL (ADR 0023).
  - Texturas PBR CC0 con tono calibrado (ADR 0024).
  - Cuatro niveles de calidad, con alta y ultra completos: GTAO, resplandor, sombras de focos y luz de luna (ADR 0026).
- **Rendimiento:** E6 cumple en la laptop (baja ≥ 30 y media ≥ 60). Las correcciones de rendimiento están en ADR 0025 y 0026.
- **Cómo probarlo:** `pnpm dev` y abrir `/visor`. Para forzar ambientes: `?escena=nocturno_lluvia&calidad=ultra` o `?escena=interseccion_toluca`, y `?clima=granizo` o `?iluminacion=noche_sin_alumbrado`.
- **Qué necesito de ti:** la computadora de demo, para medir alta y ultra (meta ≥ 60 fps; en «Bloqueado»).
- **Pendientes de F8 que siguen abiertos** (lista de arriba): OSM en producción, rayas y banquetas sobre OSM, semáforo peatonal, textura de grava, corte del camellón en cruces y texturas en caras verticales.

**Siguiente paso:** fusionar #20 a #24 en orden (cada uno con CI en verde) y empezar F9 con el plan de `docs/PROGRESS.md` (sección F9, que se agrega al empezar).

1. `pnpm --filter @croquis/web build; node eval/e6_performance.mjs` (~70 min) en `feat/f8e-texturas`. Se corre en una terminal de PowerShell aparte, fuera de Claude Code: dentro de Claude Code, un proceso largo en segundo plano se detiene cuando falta memoria.
2. Si `nocturno_lluvia` sigue por debajo de 60 fps en media, decidir con René qué entra en cada nivel de calidad. Es una decisión de alcance y no se toma sin él.

**Siguiente paso concreto:**

- Con E6 medido: fusionar #20 y abrir los PR de F8c y F8d en orden. Para cada uno, regenerar las capturas en CI, revisarlas y fusionar.
- Al final, el PR de F8e con sus capturas, E6 con las texturas (el peso de carga cuenta para el presupuesto de ≤ 8 MB) y el resumen de cierre de F8 para René.
- **Pendientes de F8:**
  - OSM en producción (consultar al crear una escena del usuario con coordenadas, con caché);
  - rayas y banquetas sobre las calles de OSM;
  - semáforo peatonal;
  - sombras de los focos en alta;
  - texturas en caras verticales (guarnición, barda) con proyección triplanar, si E9 muestra que hacen falta.
  - grava suelta: las manchas de ruido de F8a (ADR 0020) se ven como camuflaje en el acercamiento de `objeto_fijo_arbol`; conviene una textura de grava CC0 en su lugar;
  - corte del camellón en los cruces peatonales (refugio a nivel de calle), visto en la captura de `peaton_cruce`.

## F9 — Demo offline y exportaciones (plan)

**Criterio (PLAN §13):** la demo funciona sin red; E7 (paridad) y E8 (determinismo) en verde.

**Alcance (PLAN §3, §7, §13):**

- **Port TS completo del solver:** los módulos que faltan son `inversion.py` (876 líneas) y `montecarlo.py` (230). Ya existen en TS `consistency`, `pyrandom` (el generador de Python) y el resto.
- **Web Workers:** Monte Carlo e inversión corren fuera del hilo principal.
- **E7 sin exclusiones:** hoy `parity.test.ts` excluye los bloques `incertidumbre`, `inversion` y `consistencia`. En F9 se comparan todos, con la misma tolerancia (relativa 1e-6, absoluta 1e-5).
- **E8:** misma escena y semilla ⇒ mismo resultado bit a bit en Chromium, Firefox y WebKit (Playwright). Abarca el solver TS y el horneado de Rapier (restos, volcaduras, ragdolls).
- **Casos precargados y sin red:** las escenas canónicas, sus resultados, los modelos (cuerpos de MakeHuman, vehículos) y las texturas quedan en caché con un service worker. La demo abre y reconstruye sin conexión; la extracción con Claude es lo único que requiere red, y la interfaz lo dice.
- **Exportaciones**, siempre con la leyenda de reconstrucción ilustrativa (PLAN §10):
  - informe PDF generado en el navegador: croquis, línea de tiempo, parámetros con fuente, supuestos, rangos, banderas, semilla, hash de entradas y atribución de OSM cuando aplique;
  - video WebM con MediaRecorder, y MP4 con ffmpeg.wasm;
  - cuadros PNG;
  - escena glTF con `GLTFExporter`;
  - croquis 2D en SVG, PNG y PDF.

**Riesgo principal y decisión propuesta (ADR 0027):**

- **El problema:** `inversion.py` usa `scipy.optimize.least_squares` (región de confianza reflectiva con límites y pérdida `soft_l1`), además de `pinv` y `lstsq` de NumPy. No hay equivalente en el navegador, y dos optimizadores distintos no coinciden a 1e-6 si paran por número de evaluaciones o siguen caminos distintos.
- **Propuesta:** la referencia Python deja SciPy en la inversión y usa un optimizador propio, escrito en Python puro y portado línea por línea a TS:
  - Levenberg–Marquardt con límites (proyección) y pérdida `soft_l1` por mínimos cuadrados reponderados;
  - álgebra lineal densa pequeña (Cholesky o QR con pivoteo) también propia.
- **Así,** la paridad se prueba como en el resto del solver: mismo algoritmo, misma aritmética de doble precisión y mismo orden de operaciones.
- **Por qué no basta un optimizador «equivalente»:**
  - `fit_evidence` usa `max_nfev=40`, así que muchas veces el ajuste para por presupuesto y no por convergencia: el valor final depende del camino exacto.
  - Además, `_chord_refit` usa `lstsq` (solución de norma mínima por SVD) y `_laplace` usa `pinv`. Con jacobianos de rango deficiente, eso no lo reproduce una solución por ecuaciones normales.
- **Álgebra lineal propia:** SVD de Jacobi de un lado (las matrices son de unos cuantos residuos por ≤ 6 parámetros), con `lstsq` y `pinv` encima, idéntica en Python y TS. Se prueba contra NumPy con Hypothesis a 1e-12.
- **Detalles que el port debe copiar tal cual:** la caché de residuos redondea el punto a 9 decimales; el jacobiano es de diferencias hacia adelante con paso fijo por tipo (hacia atrás junto al límite); y los cuantiles son `statistics.quantiles(..., method="inclusive")`.
- **Cómo se valida el cambio de optimizador:**
  - Pruebas de propiedades (Hypothesis): el nuevo encuentra el mismo mínimo que SciPy en problemas sintéticos con solución conocida.
  - E3 se vuelve a correr completo con el optimizador nuevo, y la diferencia contra el E3 actual se reporta tal cual en el README.
- **Alternativa descartada:** comparar la inversión con una tolerancia más laxa que el resto. Rompe la regla de una sola tolerancia para E7 y esconde diferencias de camino.

**Orden de trabajo (ramas `feat/f9-*`):**

1. **Optimizador propio en Python con pruebas de propiedades;** la inversión lo usa; E3 de nuevo y regeneración de resultados (`reconstruct --check`).
2. **`inversion.ts` y `montecarlo.ts`:** paridad E7 sin exclusiones en las 11 escenas.
3. **Web Workers** para el solver: la interfaz no se congela durante Monte Carlo (prueba e2e que mide las tareas largas, como E6).
4. **E8:** script `eval/e8_determinism.mjs` con Chromium, Firefox y WebKit, resultado en `eval/results/e8_determinism.json` y paso en CI.
5. **Service worker y modo sin red:** prueba e2e con la red cortada (`context.setOffline(true)`).
6. **Exportaciones:** PDF, video, PNG, glTF y croquis, con pruebas que abren cada archivo generado y verifican que lleva la leyenda.

**Dependencias nuevas previstas** (se verifican en su documentación oficial y se registran en el ADR 0001 al instalarlas): un generador de PDF para el navegador, `@ffmpeg/ffmpeg` para MP4 y el `GLTFExporter` de three.js (ya incluido).

**Paso 4 — E8 (2026-10-17, rama `feat/f9-e8`, ADR 0029):**

- **Qué se midió primero:** con `Math` nativo, el solver daba el mismo resultado en Chromium, Firefox y WebKit en 8 de 11 escenas. Firefox difería en `frontal_curva`, `glorieta` y `motociclista` desde el sexto decimal (`eval/results/e8_determinism_antes_dmath.json`).
- **Causa:** el estándar deja a cada motor la precisión de `Math.sin`, `cos`, `atan2`, `exp`, `log`, `hypot`, `pow`, etc. En el horneado, el ragdoll del motociclista también difería en Firefox en el último bit de `k` y de la distancia (`Math.hypot`).
- **Qué se hizo:**
  - `packages/solver-ts/src/dmath.ts`: port de fdlibm 5.3 (`sin`, `cos`, `tan`, `atan`, `atan2`, `acos`, `exp`, `log`) y `hypot`/`hypotN` con el algoritmo de V8. Es igual a `Math` de V8 bit a bit (pruebas con tabla de bits y propiedades), así que Chromium no cambia.
  - `** 1.5` → `q·√q`, `pow2` exacto en `ratioToDouble` y `√` en la distancia a segmento de `red-vial.ts`.
  - `packages/viewer/src/dthree.ts`: `quatFromAxisAngle`, `applyAxisAngle` y `slerp` de three.js r186 sobre `dmath`. Lo usan los archivos del horneado: restos, volcaduras, ragdolls, posturas y daño. El visor depende ahora de `@croquis/solver-ts` para usar `dmath`.
  - Regla de ESLint en el solver y en esos archivos: prohíbe `Math` del motor, `**` no entero y los ayudantes trigonométricos de three.js.
  - `eval/e8_determinism.mjs` empaqueta con esbuild el solver y el horneado (`eval/e8_hornear_entry.mjs`) y los corre en los tres navegadores con `page.route`; `--esperado` y `--check` para CI. Trabajo nuevo de CI: «E8 (mismo resultado en Chromium, Firefox y WebKit)».
  - `eval/e8_costo_dmath.mjs`: costo por función y del solver completo contra el commit anterior (800d41b), y comprobación de que en V8 el resultado no cambia.
  - Pendiente del paso 3: prueba e2e de que el cálculo completo no bloquea el hilo principal. Corre el worker del visor en una página sin 3D con la escena más costosa (`interseccion_toluca`) y exige que el cálculo dure más de 500 ms y que el mayor hueco entre latidos del hilo principal (cada 10 ms) sea menor que la mitad del cálculo.
- **Evidencia:**
  - `node eval/e8_determinism.mjs` → `{"cumple":true,"solver":"11/11","horneado":"11/11","igual_por_calidad":true}` (commit e840b4f).
  - `node eval/e8_costo_dmath.mjs --rondas 5` → total 9,064 → 11,075 ms (×1.222), `resultado_identico_en_v8: true`.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm format:check` en verde.
- **Instalado:** `esbuild` 0.28.2 como dependencia de desarrollo de la raíz (ADR 0001), y Firefox y WebKit de Playwright en `D:\dev-cache\ms-playwright`.

**Paso 5 — Demo sin red (2026-10-17, rama `feat/f9-offline`, ADR 0030):**

- **Service worker con Serwist 9.5.13.** Es la opción de la guía oficial de PWA de Next.js para Turbopack.
  - `src/sw.ts` define la precarga, con los parámetros de `/visor` ignorados salvo `_rsc`, `/` como respaldo y `/api` fuera.
  - `src/app/serwist/[path]/route.ts` lo genera en `next build`.
  - Se registra después de `load` y con el navegador ocioso.
  - Una versión nueva espera a que se cierren las pestañas.
- **El worker del solver deja el arranque de Turbopack.**
  - **El problema:** su configuración viaja en `#params=` y se pierde al servirlo desde la caché. Sin red, la escena propia fallaba con «Missing worker bootstrap config».
  - **La solución:** `apps/web/scripts/build-worker.mjs` lo empaqueta en `public/workers/reconstruct.js` antes de `next build` y `next dev`. El archivo está en `.gitignore`.
- **`/relato` sin red:** aviso y botón desactivado (`useEnLinea`), con prueba unitaria.
- **Playwright:** `serviceWorkers: "block"` global, porque `page.route` no ve lo que atiende un service worker. `sin-red.spec.ts` lo permite.
- **Evidencia:**
  - **Precarga:** `node eval/f9_precarga.mjs` → `{"cumple":true,"entradas":67,"mb_archivos":11.05,"faltan":0}`.
  - **Costo:** el A/B en E6 (con el service worker contra bloqueado) no muestra costo medible en media. En baja con WebGPU cuesta 0.10 ms por cuadro (IC 90 % 0.05 a 0.98). Ver la tabla del ADR 0030.
  - **Pruebas:** e2e `sin-red`, `visor-propia` y `relato` en verde; lint, tipos y unitarias en verde.
  - **WebGPU en media:** dio 37 fps en las dos variantes (GPU Intel; WebGL 75.2). Queda anotado para la próxima corrida completa de E6.
- **Instalado:** `serwist` 9.5.13, `@serwist/turbopack` 9.5.13 y `esbuild` 0.28.2 en `apps/web` (dev, ADR 0001). También `e6_ab.mjs` acepta la variante de contexto `_serviceWorkers`.

**Paso 6a — Cuadros PNG y glTF (2026-10-17, rama `feat/f9-exports`, ADR 0031):**

- **Leyenda compartida:** `packages/scene-schema/src/legend.ts` (`legendFor`, `legendLines` y `legendString`). La web la reexporta.
- **Visor:**
  - `SceneViewer` recibe `onExport` y entrega `captureFrame`, que dibuja un instante con `advance` y copia el lienzo en la misma tarea, y `exportGlb`.
  - `packages/viewer/src/export/`: `png.ts` (iTXt UTF-8 con CRC-32), `legend-band.ts` (franja con la marca), `capture.ts` (PNG con la marca) y `gltf.ts` (copia con `SkeletonUtils`, materiales clásicos y animación de posición, rotación, escala y pesos de daño a 30 cuadros por segundo).
- **Web:** panel «Exportar» (`export-panel.tsx`) y `lib/download.ts`.
- **Evidencia:**
  - **Unitarias:** 8 nuevas del viewer (PNG; glTF de `volcadura` y del peatón con esqueleto) y 3 de la leyenda.
  - **e2e:** `exportar.spec.ts` (2), que abre el PNG y el `.glb` descargados.
  - **WebGPU:** revisión local con GPU real. WebGPU y WebGL 2 dan el mismo cuadro a 1920 × 1080 con la marca.
  - lint, tipos y pruebas de todos los paquetes en verde.

**Paso 6b — Video (2026-10-17, rama `feat/f9-video`, ADR 0031):**

- **Video** (`packages/viewer/src/export/video.ts`): `renderVideo` usa WebCodecs con Mediabunny (MP4 con H.264 primero; WebM con VP9 primero) y cae en `recordWithMediaRecorder` si no hay WebCodecs.
  - **Cómo se recorre:** `captureSequence`, en el visor, cambia el tamaño una vez y dibuja cada instante k/fps.
  - **Respaldo:** `retimeWebm` vuelve a fechar la grabación de MediaRecorder sin recodificar.
- **Panel:** formato, tamaño (720p, 1080p, 4K), cuadros por segundo (24, 30, 60), avance y cancelar.
- **Defectos que encontraron las pruebas:**
  - **El respaldo grababa solo la cabecera.** El ciclo no cedía el hilo cuando dibujar tardaba más que un periodo.
  - **El respaldo perdía un cuadro de 124.** MediaRecorder codifica en tiempo real con la CPU ocupada. Ahora espera un periodo completo después de cada cuadro y avisa si aun así se pierden.
  - **Esperar el evento `start` bloqueaba.** Chrome no lo emite hasta recibir un cuadro; se descartó.
- **Evidencia:**
  - `exportar-video.spec.ts`: 3 en verde; el respaldo, 3 de 3 repeticiones con 124 cuadros.
  - Unitarias del video en verde.
- **Instalado:** `mediabunny` 1.61.6 (viewer; dev de web para las pruebas), registrado en ADR 0001.
- **Observación:** en una corrida de `pnpm test` con todos los paquetes en paralelo, `extraction/src/pipeline-parity.test.ts` (1,264 relatos) falló una vez en la laptop. Sola y en la siguiente corrida completa pasó (816 de 816). No se tocó `extraction`. Queda anotado por si se repite (posible límite de 30 s con la máquina cargada).

**Paso 6c — Croquis exportable (2026-10-17, rama `feat/f9-croquis-export`, ADR 0031):**

- **`croquis-2d`:**
  - **Modo `standalone` del componente `Croquis`:** `xmlns`, tamaño en píxeles, fondo como rectángulo y sin edición.
  - **Leyenda compartida y legible:** la de `@croquis/scene-schema` (texto, y semilla con el hash) sobre una franja clara.
  - **Barra de escala nueva:** `scaleBarMeters`.
  - **`croquisSvg`:** en la subruta `@croquis/croquis-2d/export`.
- **Web:**
  - **Botones en el croquis:** SVG, PNG y PDF.
  - **`lib/croquis-export.ts`:** el PNG a 2× con `iTXt`.
  - **`lib/pdf.ts`:** pdfmake con la marca al pie de cada página y en los metadatos.
- **Evidencia:**
  - **Pruebas:** 6 unitarias nuevas en `croquis-2d` y 3 e2e que abren cada archivo (el PDF con pdf.js).
  - **Revisión visual del PDF:** se corrigió la legibilidad de la marca sobre el asfalto con una franja clara.
- **Instalado:**
  - **En `apps/web`:** `pdfmake` 0.3.11 y, como dev, `@types/pdfmake` 0.3.3 y `pdfjs-dist` 6.4.299.
  - **La fuente:** Roboto 3.014 (OFL 1.1), registrada en `assets/ASSETS.md`.

**Paso 6d — Informe PDF (2026-10-17, rama `feat/f9-informe`, ADR 0031):**

- **`lib/informe.ts`:** `informeContenido` es una función pura que se prueba sin navegador; `informePdf` usa pdfmake y el croquis vectorial.
- **Textos compartidos:** `lib/textos-resultado.ts` concentra los textos de los paneles (clases, parámetros, fuentes, hora de reloj, evidencia y estimaciones) y `campoIncierto`, que dice en palabras los datos inciertos del Monte Carlo.
- **Visor:** botón «Informe PDF» en «Exportar». En la escena propia espera el resultado completo.
- **Evidencia:**
  - **Pruebas:** 8 unitarias nuevas (informe y datos inciertos) y una e2e que abre el PDF con pdf.js.
  - **Revisión visual** de las dos páginas.
  - **Correcciones de esa revisión:** el punto doble en la fecha y las rutas internas en los supuestos.
- **e2e locales:** viewer y exportaciones, 26 en verde.

### Resumen para René (F9)

- **Qué quedó:**
  - **Sin red:** la demo funciona sin internet (service worker). Solo entender el relato con Claude pide red, y la página lo dice.
  - **En el navegador:** el solver completo (Monte Carlo e inversión) corre en un Web Worker, con paridad con Python (E7) y el mismo resultado en Chromium, Firefox y WebKit (E8). Tu escena del relato o del croquis se ve en 3D.
  - **Exportaciones:** informe PDF, video MP4 o WebM, cuadros PNG, escena glTF animada y croquis en SVG, PNG y PDF, todos con la marca de reconstrucción ilustrativa, la semilla y el hash.
- **Cómo probarlo:**
  - **El visor:** en https://croquis-sage.vercel.app/visor, elige una escena y usa «Exportar» (informe, video, cuadro y glTF).
  - **El croquis:** en /croquis, usa SVG, PNG o PDF, o «Ver en 3D».
  - **Sin red:** abre la demo una vez con red, desconéctate y recarga.
- **Qué necesito de ti:** nada nuevo para F9. Sigue pendiente la computadora de la demo para medir alta y ultra (E6) y las pruebas con personas (E9).

**Pendientes de F8 que siguen abiertos:** OSM en producción, rayas y banquetas sobre calles de OSM, semáforo peatonal, textura de grava, corte del camellón en cruces y texturas en caras verticales. Las sombras de los focos ya están en alta y ultra (ADR 0026).

## F10 — Validación del daño contra autos reales (plan)

**Criterio (PLAN §13):** E5 publicado con tamaño de muestra, error por tipo de impacto contra las dos líneas base y galería de comparaciones con las fotos reales. Corre en la laptop, sin software con licencia.

**Qué existe (revisión del 2026-10-17):**

- **NHTSA** (`data/processed/nhtsa/vtb_tests.csv`, `itv_tests.csv`):
  - **Medidas:** perfil medido DPD1–DPD6, largo del daño L, desplazamiento D del centro, aplastamiento máximo y código CDC.
  - **Cobertura:** 2,820 pruebas contra barrera con seis puntos y L. En las de impactor (laterales y traseras) hay que quitar las filas de la barrera móvil.
  - **Fotos:** `get-multimedia-files/{prueba}` da fotos con nombre descriptivo («Post-Test Front View…») y el reporte PDF. Las pruebas viejas no traen fotos.
- **CISS** (`data/processed/ciss/e3_vehiculos.csv`): 8,975 vehículos con C1–C6 y L. Falta la posición del daño en la cara (`FIELDLD`, `CDCLONGLAT`, `CDC`); se vuelve a extraer de los zips que ya están en `data/raw/ciss/`.
- **Croquis:**
  - **Solver:** calcula el perfil (`perfil_m`, `ancho_m`, `centro_m`) desde la energía, la rigidez por clase y la forma según la zona del CDC.
  - **Visor:** deforma la malla y ya la mide con `measureCrushProfile` (prueba en `damage.test.ts`).
  - **Línea base uniforme:** existe en el solver (`uniform_crush_for_energy`).

**Definiciones (se fijan antes de medir, en el ADR 0032):**

- **Tipos de impacto:** frontal completo, frontal desplazado, lateral, alcance (trasero) y poste.
- **Reproducción:** cada caso se arma como escena de Croquis con la misma clase, masa, velocidad, ángulo y obstáculo (barrera rígida, barrera desplazada, poste o barrera móvil); en CISS, la energía del ΔV del EDR. El solver TS calcula el daño, el visor deforma la malla y el perfil se mide sobre la malla en las mismas seis estaciones donde se midió el vehículo real (D ± L/2).
- **Métricas por caso:**
  - error por punto (C1–C6, cm);
  - error en profundidad máxima;
  - error en ancho dañado (donde el aplastamiento pasa de 2 cm);
  - error en área del perfil.

  Se reportan por tipo de impacto, con mediana, media e IC del 90 % por bootstrap con semilla.

- **Líneas base** (PLAN §8):
  - **Deformación uniforme en la zona de impacto:** la misma energía repartida en profundidad constante sobre el ancho dañado.
  - **Deformación lineal simple:** perfil triangular con la misma energía, máximo en el centro del daño y cero en los bordes.
- **Desarrollo y test:**
  - **CISS:** 2017–2021 son de desarrollo y 2022–2024 de test, como en E3.
  - **NHTSA:** partición determinista por hash del número de prueba con semilla, 60/40 y estratificada por tipo.
  - **Congelado:** la lista del test se versiona con su SHA-256 antes de cualquier medición y no se vuelve a tocar.
  - **Ajuste:** caída, ancho y arrugas (y la elección de forma por zona del CDC) se ajustan solo con desarrollo.

**Orden de trabajo (ramas `feat/f10-*`):**

1. **Inventario:**
   - en `nhtsa_ctd.py`, descargar con caché la lista de multimedia de cada prueba candidata, sin las fotos todavía;
   - en `ciss.py`, extraer D, la zona horizontal y el CDC completo;
   - `croquis-eval e5-inventario` → `eval/results/e5_inventario.json` y una sección E5 en `docs/data.md` con el tamaño de muestra por fuente y tipo, y cuántos casos tienen foto útil.
2. **Partición congelada y ADR 0032:** métricas, líneas base y partición. La lista del test y su hash quedan versionados.
3. **Reproductor en TS** (`eval/js`): escena → solver TS → malla deformada → perfil medido, más las dos líneas base. Pruebas unitarias del reproductor con casos sintéticos de solución conocida.
4. **Desarrollo:** medición y ajuste de la deformación solo con desarrollo; cada cambio, con sus números de antes y después.
5. **Test:** una sola corrida → `eval/results/e5.json`, la fila de E5 en el README y PROGRESS.
6. **Galería** (PLAN E5 c):
   - **Fotos:** se descarga solo la foto posterior a la prueba del lado dañado, para una muestra del test estratificada por tipo, en `data/raw`.
   - **Render:** con la misma vista, generado con Playwright.
   - **Publicación:** derivados reducidos versionados, página o documento de galería con la marca ilustrativa, y licencia y fuente en `data/SOURCES.md`.

**Riesgos:**

- **Llamadas a la API:** la lista de multimedia es una llamada por prueba (~5,500). Va con caché, pausas y reintentos.
- **Espacio en la laptop:** las fotos pesan ~2 MB y se guardan en `D:`, solo las necesarias.
- **CISS sin velocidad:** CISS no trae la velocidad de impacto. Se usa la energía del ΔV del EDR (como E3), así que E5-CISS mide la forma y el reparto, no la cinemática.

**Paso 1 — Inventario (2026-10-17, rama `feat/f10-inventario`):**

- **Lista de multimedia:** `croquis-data nhtsa media` descargó la de las 5,274 pruebas con perfil medido completo, sin fallas.
  - **Hallazgo:** casi todos los laboratorios suben las fotos numeradas (`v10050P009.jpg`). La vista de cada número está en la lista de fotografías del reporte PDF, comprobado en la prueba 10050.
  - **Consecuencia:** los reportes (varios MB cada uno) se leerán solo para la muestra de la galería.
- **CISS:** columnas nuevas con la batalla, el CDC completo, la zona horizontal, el centro del daño D y CMAX. La tabla de E3 se regeneró (`ciss build --check` al día) y E3 no cambia: lee las columnas por nombre.
- **Casos e inventario:**
  - `eval/croquis_eval/e5_casos.py`: casos y tipo de impacto, con reglas escritas antes de medir.
  - `e5_inventario.py`: conteos, estado de las fotos y la convención de D comprobada contra `FIELDLLOCATION`.
- **Evidencia:** `uv run croquis-eval e5-inventario` y 28 pruebas nuevas (multimedia, casos e inventario); ruff, pyright y pytest de `data` y `eval` en verde.

**Paso 2 — Método y partición congelada (2026-10-17, rama `feat/f10-particion`, ADR 0032):**

- **ADR 0032**, escrito antes de medir:
  - **Reproducción:** misma etapa de daño que la reconstrucción y misma malla del visor. Croquis no recibe el L ni el D medidos.
  - **Métricas:** error por punto, profundidad máxima, ancho y área, por tipo, con IC del 90 % por bootstrap.
  - **Líneas base:** uniforme y triangular, con la misma energía, ancho y centro.
  - **Exclusiones, partición y galería.**
- **Partición** (`eval/croquis_eval/e5_particion.py`, `croquis-eval e5-particion`):
  - **NHTSA:** por vehículo (marca, modelo y año), para que un auto no caiga en los dos lados. 852 vehículos tienen más de una prueba. El 40 % de los vehículos va a test.
  - **CISS:** por año, como E3.
  - **Congelada:** archivo con SHA-256 fijo, `-text` en `.gitattributes` y fuera de Prettier. Hay pruebas de que coincide con su hash, de que los datos la reproducen y de que nunca parte un vehículo.

**Paso 3 — Reproductor en TS (2026-10-18, rama `feat/f10-reproductor`):**

- **`eval/js/e5/reproducir.ts`:** reproduce cada caso con la etapa de daño de la reconstrucción del solver TS:
  - **Barreras:** `planarImpact` con la PDOF del caso.
  - **Postes:** `narrowObject`.
  - **Barrera móvil:** con el criterio de E2.
  - **CISS:** la energía del ΔV del EDR, repartida por rigidez.
  - **Medición:** la malla del visor se mide en las estaciones del vehículo real. Las dos líneas base comparten energía, ancho y centro.
  - **Exportes del solver:** `crushShapeAndWidth`, `crushCenter` y sus constantes de impacto, sin cambio de comportamiento.
- **`eval/js/e5_dano.ts`:** agrega por fuente y tipo, con IC del 90 % por bootstrap y diferencias pareadas. El test solo corre con `--test-final`. Si hay cambios sin commit, el commit del resultado lleva el sufijo `-modificado`.
- **Reglas de validez, añadidas al ADR 0032 antes de cualquier corrida del test:**
  - centinelas de la fuente (perfiles de 9999 mm, L de 100 m, ancho −10 mm, masa 0);
  - zona «9» de CISS → la zona por defecto del solver;
  - barreras móviles fuera de las dos de E2: una plana rígida de cualquier masa se reproduce, y las caras deformables sin calibrar se excluyen y se cuentan.
- **Pruebas:**
  - el reproductor con solución conocida: energía, orden de C1–C6, estaciones, y la ida y vuelta en frente y costado con error < 2 cm;
  - la regla de adopción del ajuste;
  - la clasificación de barreras en Python.

**Paso 4 — Desarrollo y ajuste (2026-10-18, ADR 0033):**

- **Hallazgos** (ADR 0033):
  - **La malla no es la fuente del error:** reproduce el perfil del solver con una mediana por zona de 0.04 a 0.31 cm por estación, salvo frente/trasera C con la regla nueva (0.86 cm); el p95 es de a lo más 1.47 cm (`e5_desarrollo.json`, `diagnostico_desarrollo`).
  - **CISS mide frente y trasera de esquina a esquina de la defensa:** D = 0 en 3,600 de 3,609 casos y la mediana de L va de 0.75 a 0.80 del ancho.
  - **Diferencia de convención de energía:** E2 calibró con ½ m ΔV² y el solver usa la energía disipada. Explica −4.3 cm de aplastamiento medio en NHTSA frontal, que está dentro de muestra; con la de CRASH3 serían +0.4 cm (`uv run croquis-eval e5-energia` → `e5_convencion_energia.json`). No se cambia: CISS y E3, que son choques reales, no tienen sesgo con la convención actual. Queda como límite de E5-NHTSA.
- **Ajuste** (`eval/js/e5_ajuste.ts` → `eval/results/e5_ajuste.json`):
  - **Candidatos:** ancho igual a la mediana medida, con las cinco formas de Croquis o la empírica de desarrollo.
  - **Regla de adopción:** se adopta solo si ninguna métrica empeora.
  - **Cambian:** frente/trasera C (uniforme, 0.89 del ancho) y costados D (centro, 0.62), P (centro, 0.52), Z (uniforme, 0.37) y B (uniforme, 0.21).
  - **Se quedan como estaban:** las demás zonas del frente y la trasera, porque con el ancho real el error por punto empeoraba.
  - **Código:** la regla es una tabla en el solver Python y en el port TS, con pruebas en los dos.
- **Antes y después en desarrollo** (medianas en cm; `e5_desarrollo_antes_ajuste.json` en `1fb05ad`, `e5_desarrollo.json` en `54cba9f`):

  | Fuente y tipo            | Métrica            | Antes | Después |
  | ------------------------ | ------------------ | ----- | ------- |
  | CISS lateral             | por punto          | 4.99  | 4.67    |
  | CISS lateral             | ancho              | 93.43 | 78.67   |
  | CISS lateral             | área               | 6.33  | 5.90    |
  | NHTSA lateral            | profundidad máxima | 8.96  | 7.45    |
  | NHTSA lateral            | ancho              | 65.73 | 57.27   |
  | NHTSA frontal desplazado | profundidad máxima | 14.16 | 14.29   |
  | NHTSA frontal desplazado | ancho              | 24.24 | 24.83   |

  Los demás tipos no cambian. El frontal desplazado de NHTSA empeora poco y se reporta tal cual.

- **Lo que dice el desarrollo, sin el test:**
  - Croquis no le gana en todo a las líneas base.
  - **Lineal simple:** con la misma energía, ancho y centro, tiene menor error en la profundidad máxima en NHTSA (8.76 contra 11.47 cm) y en el ancho de CISS (48.87 contra 55.53 cm).
  - **Croquis:** gana en el error por punto en CISS (6.33 contra 6.66 de la uniforme y 7.21 de la lineal).
  - El test dirá lo que sea y se publica igual.
- **Regenerados:**
  - **Resultados de las escenas:** cambian solo el perfil y el ancho del daño; las trayectorias son idénticas.
  - **E8:** sigue cumpliendo, 11/11 en solver y horneado y en los tres navegadores, con hashes nuevos.
  - **E7:** la paridad no cambia; solo variaron los tiempos, por la carga de la máquina, así que se conserva el resultado versionado.
- **Incidente:** el sistema detuvo una corrida por falta de memoria. Se repitió una a la vez, sin otros procesos pesados.
- **Corrección:** tres números de este paso salieron primero de análisis sueltos: la fidelidad de la malla, el D de CISS y el sesgo por la convención de energía. Ahora salen de scripts versionados (`e5_dano.ts` en desarrollo y `croquis-eval e5-energia`). Los valores medidos corrigen lo que decían antes: la fidelidad en frente/trasera C es de 0.86 cm, no ≤ 0.3, y D vale 0 en 3,600 de 3,609 casos, no en todos.
- **CI:** cambió una sola referencia visual, `lateral_interseccion` con daño, que se regeneró en Linux y se revisó a ojo. El daño lateral de la pickup ahora se reparte en 0.62 del largo y es menos profundo (13.5 → 10.9 cm). Por eso la cámara de daño, que enfoca el aplastamiento mayor, muestra ahora el frente del hatchback. PR #44 fusionado con CI en verde.

**Paso 5 — Test de E5, una sola corrida (2026-10-18, rama `feat/f10-test`):**

- **Comprobaciones antes de correr:**
  - `e5-particion --check` en verde;
  - los casos reexportados son idénticos (mismo SHA-256);
  - el árbol estaba limpio en `e74d971` (main con el PR #44).
- **Corrida:** `pnpm --filter @croquis/eval-js e5 -- --test-final` → `eval/results/e5.json`. Fueron 5,613 casos, de los que se evaluaron 5,260, en 1,145 s. No se volvió a correr.
- **Resultado** (medianas en cm; detalle por tipo, IC y diferencias pareadas en el JSON y en el README):

  | Fuente             | Métrica            | Croquis  | Uniforme | Lineal simple |
  | ------------------ | ------------------ | -------- | -------- | ------------- |
  | CISS (3,208 casos) | por punto          | **7.50** | 7.69     | 8.03          |
  | CISS (3,889)       | profundidad máxima | 9.77     | 9.66     | **8.81**      |
  | CISS (3,889)       | ancho              | 52.24    | 50.57    | **45.91**     |
  | CISS (3,889)       | área (cm·m)        | **6.63** | 6.79     | 6.97          |
  | NHTSA (1,371)      | profundidad máxima | 11.38    | 11.99    | **8.71**      |
  | NHTSA (1,371)      | ancho              | 32.51    | 35.40    | **30.34**     |
  | NHTSA (1,371)      | área (cm·m)        | 13.76    | 13.98    | **13.22**     |

- **Pendiente** (ya no se puede ajustar con este test): la lineal simple predice mejor la profundidad máxima y el ancho, porque los perfiles reales tienen un pico más marcado que las formas de Croquis.
  - **Qué haría falta:** un modelo de forma con el pico más marcado.
  - **Cómo validarlo:** con datos que el test no haya visto, por ejemplo CISS 2025 cuando se publique, o una partición nueva registrada antes de medir.
  - **Poste:** queda peor que la uniforme en NHTSA (39 pruebas, IC amplio).

### Resumen para René (F10, pasos 3 a 5)

- **Qué quedó:** E5 medido.
  - **Cómo se mide:** cada auto real se reproduce con el mismo cálculo de daño que la reconstrucción y la misma malla del visor, y se mide en los puntos donde se midió el auto real.
  - **Muestra del test:** 5,260 casos (1,371 de NHTSA y 3,889 de CISS).
  - **Croquis mejora a las dos líneas base:** en el perfil punto por punto y en el área.
  - **Croquis queda peor:** en la profundidad máxima y el ancho, donde gana el perfil triangular.
  - **Publicación:** el resultado se publica tal cual en el README.
- **Cómo probarlo:**
  1. `uv run croquis-eval e5-casos`.
  2. `pnpm --filter @croquis/eval-js e5` para el desarrollo. El test ya se corrió y no se repite.
  3. `uv run croquis-eval e5-energia`.
- **Qué necesito de ti:** nada para el paso 6, la galería.

**Paso 6 — Galería (2026-10-18, rama `feat/f10-galeria`):**

- **`eval/croquis_eval/e5_galeria.py`** (`uv run croquis-eval e5-galeria` → `eval/results/e5_galeria.json`):
  - toma una muestra con semilla del test de NHTSA, 3 por tipo, entre las pruebas que Croquis reproduce;
  - busca la foto posterior de la cara dañada, por el nombre del archivo o en la lista de fotografías del reporte PDF;
  - guarda derivados de 960 px sin metadatos.
- **Hallazgos al armarla:**
  - **Nombres de archivo:** en las pruebas viejas llevan el número de la prueba con ceros a la izquierda (`v04887P007.jpg`).
  - **Números de foto:** el del reporte no siempre es el del archivo. Por eso hay revisión visual versionada (`eval/e5/galeria_revision.json`), con 6 fotos rechazadas: anteriores a la prueba, de maniquíes o de la parte de abajo.
  - **Reportes ilegibles:** hay algunos que son archivos de Word y otros truncados; se cuentan como ilegibles.
- **Renders** (`pnpm --filter @croquis/eval-js e5:galeria`):
  - el vehículo con la malla, los materiales y la pintura dañada del visor (`vehicleMaterials` ahora se exporta), con el daño que predice Croquis;
  - desde la vista de la foto, con la leyenda ilustrativa;
  - en Chromium con SwiftShader.
- **Resultado:** 9 pares (3 frontales, 3 laterales y 3 de poste). En frontal desplazado y alcance no hay foto verificable: casi ninguna prueba del test trae fotos, y las dos del desplazado que se encontraron eran de otra vista.
- **Lectura cualitativa:**
  - **Frontales:** Croquis deforma mucho menos que los autos reales, lo que coincide con E5.
  - **Laterales y postes:** el lugar y la forma del hundimiento se reconocen.
- **Fuentes:** fila nueva en `data/SOURCES.md` (reportes y fotos de NHTSA, datos públicos del gobierno de EE. UU.).
- **Pruebas:** la lectura de la lista de fotografías, la vista que corresponde a cada cara y los nombres de archivo con y sin ceros.

### Resumen para René (F10)

- **Qué quedó:** E5 completo.
  - **Medición:** cada auto real se reproduce con el mismo cálculo de daño y la misma malla del visor, y se mide en los puntos reales. Hay 5,260 casos en el test congelado.
  - **Resultado:** Croquis mejora a las dos líneas base en el perfil punto por punto y en el área. Pierde contra el perfil triangular en la profundidad máxima y el ancho.
  - **Publicación:** todo está en el README, con su lectura honesta, y la galería de fotos reales junto a Croquis está en `docs/galeria-e5/README.md`.
- **Cómo probarlo:**
  1. `uv run croquis-eval e5-casos`.
  2. `pnpm --filter @croquis/eval-js e5` para el desarrollo; el test no se vuelve a correr.
  3. `uv run croquis-eval e5-galeria` y `pnpm --filter @croquis/eval-js e5:galeria` para la galería.
- **Qué necesito de ti:** nada para F10. Siguen pendientes la computadora de demo (E6 en alta y ultra) y las pruebas con personas (E9).

## F11 — Producto final (plan)

**Criterio (PLAN §13):**

- página de historia, recorrido técnico, README completo y despliegue en Vercel (preview y producción);
- E9 con usuarios reales y guiones de video;
- el checklist del README (§15) completo con enlaces y el sitio en vivo.

**Orden de trabajo (ramas `feat/f11-*`):**

1. Historia y recorrido técnico (ADR 0034).
2. Demo «Tú eres…» con casos precargados sin servidor.
3. README contra el checklist de §15, con todos los enlaces.
4. Guiones de los tres videos en `docs/guiones/`: presentación, demo y recorrido técnico.
5. Kit de E9 listo para que René lo corra: protocolo, consentimiento, tareas, SUS e instrumentación del tiempo hasta la primera reconstrucción. La corrida con personas sigue «Bloqueado — necesita a René».
6. Pendientes abiertos de F8.

**Paso 1 — Historia y recorrido técnico (2026-10-18, rama `feat/f11-recorrido`, ADR 0034):**

- **`/recorrido`:** E1–E9 con barras generadas desde `eval/results/`.
  - La mejor barra se marca aunque no sea Croquis.
  - Cada evaluación enlaza su resultado.
  - E9 aparece como pendiente.
- **`/historia`:** sigue a una persona ficticia en la escena de Toluca.
  - **Datos de ATUS:** salen de `atus_summary.json`.
  - **CROQUIS letra por letra:** cada letra enlaza a su parte del producto.
  - **Imágenes:** dos capturas del visor en calidad alta (`scripts/capturas-historia.mjs`).
  - **Cierre:** «Lo que Croquis no es».
- **Generador y CI:** `apps/web/scripts/build-paginas.mjs`, con `--check` en CI (`pnpm --filter @croquis/web generate:check`).
- **Portada:** enlaza las dos páginas.
- **Sin red:** las dos páginas y sus imágenes entran a la precarga.
  - **Precarga medida de nuevo:** 80 entradas y 13.9 MiB, contra 67 y 11.05 en F9.
  - **Desglose por biblioteca** (`mib_por_modulo`): Rapier 4.33, three 1.21, pdfmake 1.01, Mediabunny 0.75 y las imágenes de la historia 0.14 MiB.
  - **De dónde sale el crecimiento:** sobre todo de las exportaciones de F9, que llegaron después de esa medición.
- **Pruebas:**
  - unitarias de formato y gráficas, incluida la que dibuja cada gráfica generada;
  - e2e de las dos páginas: textos, datos, imágenes cargadas, sin errores de consola y la mejor barra marcada en E3;
  - `sin-red` sigue en verde.

**Paso 2 — Demo «Tú eres…» (2026-10-18, rama `feat/f11-demo`, ADR 0035):**

- **Casos:** `pnpm --filter @croquis/extraction demo` → `apps/web/src/data/demo.json`, con `demo:check` en CI.
  - Son seis relatos del dev de Relatos-MX (alcance, moto, objeto fijo, peatón, volcadura y ciclista), pasados por el pipeline TS de producción con la respuesta grabada de Claude Sonnet.
  - Al generarlos, el verificador no corrigió ningún campo, y cada caso trae 3 preguntas en la primera ronda.
- **`/demo`:** el visitante elige el relato y ve cada campo con su origen (del relato, supuesto o por omisión) y la cita de donde salió.
  - **Preguntas:** las contesta en el navegador. `src/lib/responder.ts` ahora lo comparten la ruta del servidor y la demo.
  - **Croquis y 3D:** abre el croquis o el visor 3D con la escena propia, y desde ahí compara hipótesis.
- **Sin red:** la demo entra a la precarga, que queda en 83 entradas y 14.05 MiB (`f9_precarga.json`). La prueba `sin-red` contesta una ronda con la red cortada.
- **Enlaces:** la portada y la historia enlazan la demo.
- **Pruebas:**
  - unitarias de `DemoApp`: elegir un caso, contestar sin servidor y abrir el visor;
  - e2e: la demo completa hasta el visor sin ninguna petición a `/api/`, más `sin-red`, `relato` y `home`, todo en verde.

**Paso 3 — README contra PLAN §15 (2026-10-18, rama `feat/f11-readme`):**

| Punto de §15                                   | Dónde está                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Problema con fuentes                           | «Problema» (ATUS, `atus_summary.json`)                                                                       |
| Cómo probarlo en vivo y en local               | «Cómo probarlo»: producción con demo, historia y recorrido; comandos locales; cada evaluación con su comando |
| Resultados contra alternativas simples (E1–E9) | «Resultados medidos» y el recorrido técnico; E9 pendiente                                                    |
| Mapa del repo                                  | «Mapa del repo»                                                                                              |
| Datos con fuente y licencia y lo que no cubren | «Datos y lo que no cubren», `data/SOURCES.md` y `docs/data.md`                                               |
| IA responsable                                 | «IA responsable» y `docs/responsible-ai.md`                                                                  |
| Límites y siguiente paso                       | «Límites y siguiente paso» (medidos y de diseño)                                                             |
| Respaldo de cada afirmación                    | `eval/results/`, ADR, `docs/physics.md` y `PROGRESS.md` (en «Mapa del repo»)                                 |
| Pruebas                                        | «Pruebas»                                                                                                    |
| Licencia y atribución                          | «Licencia y atribución»                                                                                      |

- **Corrección:** el README decía «diez escenas canónicas»; son once desde la de Toluca (F8).

**Paso 4 — Guiones de video (2026-10-18, rama `feat/f11-guiones`):**

- **`docs/guiones/01-presentacion.md`** (≈ 2 min): de la historia de Toluca a CROQUIS, al recorrido técnico y a la leyenda.
- **`docs/guiones/02-demo.md`** (≈ 4 min): la demo «Tú eres…», el croquis, el visor, las hipótesis y las exportaciones.
- **`docs/guiones/03-recorrido-tecnico.md`** (≈ 6 min): E1–E8 con sus límites, los ADR y CI.
- **Cifras:** cada guion dice que las suyas salen de `eval/results/` y que se revisan contra el README del día antes de grabar.

**Paso 5 — Kit de E9 (2026-10-18):**

- **`/e9`** (sin indexar), para quien facilita:
  - código de participante y casilla de consentimiento;
  - mientras dura la sesión, la app anota solo el momento de cinco eventos en `localStorage`: relato enviado, ronda contestada, croquis abierto, corrección en el croquis y primera reconstrucción visible en 3D;
  - al final, el SUS (traducción propia, declarada como no validada), el resumen, la descarga del JSON y el borrado.
- **Ganchos:** en el relato, el croquis y el visor. No hacen nada sin una sesión activa (`src/lib/e9.ts`).
- **`uv run croquis-eval e9`** lee `data/e9/sesiones/` y calcula tiempo hasta la primera reconstrucción, correcciones, rondas y SUS, y si se cumple el mínimo de 5 personas.
  - **Validación:** rechaza archivos con campos de más, como el texto del relato.
  - **Sin sesiones:** no escribe nada, porque E9 sigue pendiente.
- **Documentos:** `docs/e9/protocolo.md` (procedimiento, consigna, qué se anota y límites) y `docs/e9/consentimiento.md`.
- **Pruebas:**
  - unitarias de `e9.ts`, con el mismo caso que la de Python;
  - pytest de la agregación y la validación;
  - e2e: una sesión completa hasta el 3D, SUS y descarga con solo métricas.

**Paso 6a — Grava suelta (2026-10-18, rama `feat/f8-grava`, ADR 0036):**

- **`road-surface.ts`:** las manchas de grava tienen grano de piedra (2.5 cm), bordes suaves (`edge`) y opacidad parcial (`opacity`). Los demás estados del piso no cambian.
- **Textura «Gravel Stones»** (Poly Haven, Amal Kumar, CC0): entra al pipeline (`polyhaven.lock.json`, `texturas.json`).
  - **Cuándo se carga:** solo con `grava_suelta` (`SceneGraph.wantedTextures` y `loadEnvTextures(…, names)`).
  - **Cómo se usa:** en alta y ultra llena las manchas con su color normalizado y su relieve.
- **Diagnóstico y medición:** el interruptor `gravaPrevia` (`window.__croquisDiag`) dibuja las manchas de antes para medir en E6 (`e6_ab_grava_*_webgpu.json`, sobre `5157fee`).
- **Precarga:** 87 entradas y 14.31 MiB (`f9_precarga.json`), porque la grava también se precarga para la demo sin red.
- **Revisión visual:** capturas con la GPU real en media (grano) y alta (textura). Las referencias de CI de `objeto_fijo_arbol` se regeneran en Linux y se revisan.
- **Pruebas:**
  - el aspecto de la grava;
  - la textura que solo se pide con grava;
  - el relieve de las manchas con y sin textura de asfalto;
  - el interruptor de diagnóstico.
- **Incidente:** una corrida local de las pruebas del visor dio 234 de 238 y tres más dieron 238 de 238. No se reprodujo. Se suma al antecedente de `debris.test.ts` (F3).

**Paso 6b — Corte del camellón en los pasos peatonales (2026-10-18, rama `feat/f8-camellon`, ADR 0037):**

- **El refugio:** donde un paso peatonal cruza el camellón, se corta a nivel de calle, sin guarniciones.
- **Las rayas:** las centrales y de carril se interrumpen en el paso; las orillas siguen.
- **Las demás escenas** tienen exactamente la misma geometría (prueba).
- **Revisión visual:** con la GPU real, en la cámara de la persona de `peaton_cruce`. La cebra ya no pasa bajo el camellón ni bajo las rayas amarillas.
- **Pruebas:** el área cortada es la del paso, no quedan guarniciones del camellón dentro del paso, las rayas centrales se interrumpen y sin pasos todo queda igual.

**Paso 6c — Semáforo peatonal (2026-10-19, rama `feat/f8-semaforo-peatonal`, ADR 0038):**

- **Contrato 1.3.0:** `semaforo_peatonal`, con migración identidad en TS y Python.
  - **Regenerados:** Zod y Pydantic, escenas canónicas, constructores de spec, Relatos-MX (candados de test intactos), salidas doradas y demo.
  - **Sin cambios:** los resultados del solver (`reconstruct --check`), así que E7 y E8 no cambian.
- **Fuera del esquema del LLM** (`NOT_ASKED_DEVICES` en TS y Python): la prueba de la huella del prompt sigue en verde y las respuestas grabadas siguen valiendo.
- **Visor:** cabeza con la figura detenida y la que camina, encendidas según la fase (`pedLampAt`), mirando a la persona de su fase.
- **Croquis:** icono con dos lentes.
- **Revisión visual:** una escena de prueba (`peaton_cruce` con un semáforo peatonal) en calidad alta. La figura que camina se ve encendida en verde y la cabeza mira al peatón.
- **Pruebas:**
  - las fases peatonales;
  - la cabeza con sus dos figuras y la orientación hacia la persona en la escena;
  - las migraciones (TS y Python) hasta 1.3.0.

**Paso 6d — Rayas, banquetas y guarniciones en las calles de OSM (2026-10-19, rama `feat/f8-osm-rayas`, ADR 0039):**

- **Rayas:** solo en las calles con `lanes` de OSM, con las reglas de las plantillas.
- **Banquetas y guarniciones:** según la escena, salvo en autopistas.
- **Cortes:** en los cruces de más de 30°, sin cortar las continuaciones. Las banquetas nunca caen sobre otra calzada.
- **El croquis 2D sigue sin rayas** en las calles del mapa (pendiente).
- **E6 antes y después** en `interseccion_toluca` (interruptor `osmSoloCalzada`): 0.62 ms por cuadro en media (71.4 fps) y nada medible en baja.
- **Imágenes de la historia** capturadas de nuevo. Las referencias de CI de `interseccion_toluca` se regeneran y se revisan.
- **Pruebas:**
  - sin `lanes` no hay rayas;
  - doble y un sentido;
  - las rayas no cruzan otra calzada y las continuaciones no se cortan;
  - banquetas según la escena y no en autopistas, cortadas en los cruces y fuera del otro cuerpo de una avenida.

**Paso 6e — OSM en producción (2026-10-19, rama `feat/f8-osm-produccion`, ADR 0040):**

- **Interfaz:** sección «Calles reales (OpenStreetMap)» en el croquis, con coordenadas y radio. Necesita red, y la interfaz lo dice.
- **`GET /api/osm`:**
  - valida y redondea el punto;
  - usa la consulta de los extractos;
  - cachea en Redis o en memoria y en la CDN (30 días);
  - limita a 60 consultas por hora por IP;
  - prueba tres instancias de Overpass, 15 s cada una, y responde un 502 claro si ninguna contesta.
- **`applyMap`:** con el cruce más cercano en el origen, pone la plantilla, `ubicacion_real` y `red_vial` (fuente `mapa`, conservando la evidencia). Reproduce la red de Toluca desde coordenadas cercanas a su cruce (prueba).
- **Prueba real (2026-10-19, 15:06 UTC):** las tres instancias públicas fallaban (502, 500 y 504 o sin respuesta). La ruta respondió su 502. Se repitió en el paso 6f.
- **Pruebas:** `croquis-2d` (4 nuevas), servidor (5), navegador (4) y e2e (2, con `/api/osm` simulado por el extracto).
- **Fuentes:** fila nueva en `data/SOURCES.md`.

**Paso 6f — Prueba real de OSM en producción (2026-10-19, PR #56 y rama `feat/f11-osm-reintentos`, ADR 0040):**

- **Scripts** (no corren en CI):
  - `eval/osm_produccion.mjs` pide las calles de Toluca a la ruta en producción, reintenta como lo haría una persona y compara con el extracto;
  - `eval/osm_instancias.mjs` manda la consulta una vez a cada instancia.
- **Producción, primera versión de la ruta:**
  - con radio 150 m, la respuesta es idéntica al extracto (22 calles, 80 elementos) y la repetición sale de la CDN;
  - con 148 m, un 502 y luego 200 a los 44.23 s;
  - con 149 m y 147 m, solo 502.
- **Instancias** (dos mediciones):
  - la principal responde 200 a los 40.93 s y 42.59 s;
  - VK Maps da 504 en 1.06 s y 200 en 13.36 s;
  - private.coffee no contesta en 60 s.
- **Cambio en la ruta:**
  - mail.ru primero (15 s), la principal después (45 s) y private.coffee al final (15 s);
  - hasta dos vueltas en 50 s;
  - cabecera `X-Croquis-Overpass` con la instancia que contestó.
- **Pruebas del servidor:** 7 (segunda vuelta y tiempo total nuevas).
- **Ruta nueva desplegada:**
  - **Radio 146 m:** 200 al primer intento, a los 45.87 s, desde VK Maps; las dos calles que faltan quedan fuera del radio (146.7 m y 147.7 m).
  - **Radio 145 m:** tres 502.
  - **Conclusión:** funciona, pero las públicas fallan seguido (`osm_produccion_v3_*.json`).
- **Opción:** NextGIS (gratis, pero pide cuenta y llave; solo René).

**Pasos 6g y 6h — Rayas de OSM en el croquis 2D y paso peatonal según la NOM-034 (2026-10-19, rama `feat/f8-paso-peatonal-nom`, ADR 0041 y 0042):**

- **Rayas en 2D (ADR 0041):**
  - `map-roads.ts` en `croquis-2d` reúne `MapVia`, `stripLineOffsets`, `mapCrossings` y `mapLaneLines`; el visor la usa sin cambios de comportamiento.
  - El croquis dibuja las rayas interiores con el trazo de las plantillas, solo en calles con `lanes`, cortadas en los cruces.
  - Se calculan una vez por escena, no en cada arrastre.
  - **Pruebas:** 4 nuevas en `map-roads.test.ts`, una de ellas una propiedad con fast-check (semilla 41, 200 casos), y la red de Toluca en `Croquis.test.tsx`.
- **Paso peatonal (ADR 0042):** NOM-034-SCT2/SEDATU-2022, DOF del 19 de septiembre de 2023, consultada el 2026-10-19.
  - **Franjas:** de 40 cm cada 80 cm, centradas en la calzada.
  - **Largo (Tabla 8):** 2 m en carretera, 6 m en calle primaria y 4 m en secundaria; nunca menos que la banqueta.
  - **Supuesto:** se toma como primaria la calle de dos carriles o más por sentido.
  - **Orillas:** continuas (5.5.1).
  - **Croquis 2D:** las franjas del símbolo pasan a 40 cm.
  - **Referencias visuales:** cambian solo las de `peaton_cruce` (las dos). Se regeneraron en CI (Linux) y se revisaron; las otras 24 salieron idénticas byte por byte.

**Paso 6j — Prompt v4: semáforo peatonal (2026-10-19, rama `feat/f11-prompt-v4`, ADR 0043):**

- **Orden de trabajo, con commits:**
  1. diseño, reglas, prompt y criterio (`2bc0f26`);
  2. el lote `dev-007` (`2b36b3b`);
  3. las grabaciones y la medición.
- **Huellas:** v1–v3 no cambian (prueba en Python y TS); la de v4 es 613dc7f7bc958502.
- **Tests congelados intactos:** con la métrica común, E1 de v3 en CISS y en el primer test da los mismos números que antes.
- **Dev de 220** (`e1_extraction_dev_v{3,4}_dev007.json`), F1 micro común:
  - **Sonnet:** 0.9354 → 0.9328;
  - **Haiku:** 0.9185 → 0.9218;
  - **reglas:** 0.7442.
- **`semaforo_peatonal`:**
  - **v4:** F1 0.9778 con los dos modelos;
  - **reglas:** 0.5333, con 8 de 22.
- **Repetición puntuada contra la referencia:**
  - **Sonnet:** v3 0.9300, v4 0.9360;
  - **Haiku:** v3 0.9138, v4 0.9196.
- **Decisión:** v4 no pasa (criterio 1). Por eso no se midieron los tests con v4.
- **Grabaciones:** las de v4 en `grabaciones/extraccion_v4`, y las de v3 de `dev-007`.
- **Gasto del día:** 5.58 USD (`gasto.json`).
