# CLAUDE.md — Reglas permanentes de Croquis

Lee este archivo y `docs/cesvi/PLAN-CESVI.md` al inicio de cada sesión. `PLAN-CESVI.md` dice **qué** construir y manda sobre `PLAN.md` (que sigue valiendo para lo ya construido); este archivo dice **cómo** trabajar.

## Contexto
- Dueño: René (ITC, Tec de Monterrey Campus Toluca). Producto para los peritos de CESVI México.
- Máquina de desarrollo: **Windows, 8 GB de RAM**. Comandos compatibles con PowerShell. No asumir WSL ni GPU dedicada. Un solo proceso pesado a la vez: Unity en modo batch, las pruebas de Python y Playwright nunca corren juntos, y antes de cada paso pesado se verifica que no quede ningún proceso de Unity vivo. El Editor con el MCP se abre solo para inspeccionar la escena, y se cierra al terminar.
- Idioma: interfaz, documentación y mensajes al usuario en **español de México**; identificadores de código, nombres de archivos de código y commits en inglés.

## Para quién y qué tan lejos (manda sobre todo lo demás)

Croquis es para los **peritos de CESVI México**. El alcance lo define lo que ellos necesitan y van a usar, no lo que sería impresionante. Desde el 20 de octubre de 2026 estas reglas son permanentes y mandan sobre cualquier otra de este archivo o de `PLAN.md` que las contradiga:

- **Funciona como CESVI lo pide.** Que los números sean correctos, que el flujo del perito sea claro y que el dictamen salga con la estructura de sus reportes: esa es la calidad que importa. No construyas funciones, variantes ni pulido que un perito no vaya a usar. Si dudas, pregúntate si aparece en un reporte de CESVI o en `docs/cesvi/`; si no, no va. El centro es la reconstrucción con física y su visualización en 3D a partir de lo que narra el perito (PLAN-CESVI §1); los reportes de CESVI sirven para demostrar que Croquis reproduce lo que ellos ya analizaron, y la comparación con la declaración del conductor es un complemento opcional.
- **Las pruebas cuestan menos que el código.** Si una tarea toma 1 hora de código, sus pruebas no toman 8.
  - **Bloquean el merge solo:** lint, tipos, pruebas unitarias de lógica y cálculos (en especial, las que reproducen los números de los dictámenes) y una e2e por flujo principal, solo en Chromium.
  - **CI completo en menos de 10 minutos.** Si tarda más, recorta lo que lo hace lento, no las pruebas de cálculo.
  - **No se hacen por defecto:** Firefox y WebKit, capturas de referencia, Lighthouse y axe, evaluaciones largas (E-series), barridos, Hypothesis en código de interfaz, revisión independiente de diseño, pulido visual fino. Corren solo a mano, cuando René lo pide o antes de una demo con CESVI.
  - **No esperes CI con los brazos cruzados:** si CI tarda, sigue con la siguiente tarea.
- **El visor 3D es Unity** (plan v4, por pedido de CESVI) y es central. El visor three.js se queda como respaldo y `packages/viewer` queda congelado. La portada de lanzamiento y la historia siguen en pausa hasta que René las reactive.
- **Lo que no cambia nunca:** ningún número inventado; toda diferencia con un reporte de CESVI se muestra con su valor y su porcentaje; los reportes de CESVI son de uso libre para este proyecto (CESVI los entregó con ese fin; muchos son casos elaborados por ellos): se pueden usar en fixtures, pruebas, evaluaciones y demos, y los lotes crudos siguen fuera de git solo por tamaño; IA responsable (§10).
- **Lo que se pospone no se borra:** anótalo en `docs/PROGRESS.md`, sección "Endurecimiento pendiente".
- Trabaja directo, con commits frecuentes, y despliega a Vercel en cuanto haya algo que mostrar.

## El visor en Unity y los dos frentes (plan v4; ADR 0111)

El plan tiene dos frentes, U y W. Desde el 2026-11-09 el Claude Code de René lleva los dos, porque el compañero no ha subido nada de W. Antes de empezar una fase W, haz `git fetch` y revisa si existe una rama o un PR `feat/w<n>` de esa fase: si existe, no la tomes y sigue con la siguiente. Cada fase W que tomes, anótala en `docs/progress/W.md`. El detalle está en `docs/cesvi/PLAN-CESVI.md` §3.

| Frente | Solo este frente cambia |
| --- | --- |
| **U · Visor Unity, contratos e integración** | `apps/visor-unity/**`, `tools/unity/**`, `packages/scene-schema/caso3d*`, `visor-puente.md`, `fixtures/caso3d/**`, `apps/web/public/visor-unity/**`, el componente `<VisorUnity>` y, al final, `README.md`, `docs/ESTADO.md` y `docs/historial/**` |
| **W · Web y física** | `apps/web/src/app/cesvi/**` y sus componentes (salvo `<VisorUnity>`), `packages/cesvi/**`, `packages/croquis-2d/**`, `packages/extraction/**`, `extraction/**`, `solver/**`, `packages/solver-ts/**`, `eval/**`, `data/**`, `apps/web/src/app/api/relieve/**` y las e2e de la web |

- **Compartidos:** `escena.schema.json`, `resultado.schema.json`, `CLAUDE.md`, `docs/cesvi/PLAN-CESVI.md`, `.github/workflows/**`, `package.json`, `pnpm-lock.yaml` y el índice de `docs/PROGRESS.md`. Se cambian solo con un PR pequeño `contract:` o `chore:`, y el otro frente rebasa. Si `pnpm-lock.yaml` tiene conflicto, se regenera con `pnpm install`.
- **Ramas:** `feat/u<n>-<tema>` y `feat/w<n>-<tema>`, de vida corta y rebasadas sobre `main` antes del PR.
- **Fusiones:** fusiona tú con «Create a merge commit» cuando CI esté en verde (René, 2026-11-09). Los PR del compañero también, si solo tocan carpetas de W; sus PR `contract:` o `chore:` sobre archivos compartidos se le enseñan a René antes.
- **Bitácora:** `docs/progress/U.md` y `docs/progress/W.md`, con plan, evidencia, cifras, pendientes, siguiente paso y «Necesito del otro frente». `docs/PROGRESS.md` queda como índice y «Estado actual»; solo lo actualiza U al integrar.
- **ADR por bloques:** U del 0110 al 0129; W del 0130 al 0169.
- **Contratos primero:** nadie consume `caso-3d`, el puente ni los campos 2.3.0 antes de que estén en `main`.

Reglas del visor:

- **Unity solo reproduce.** No usa la física de Unity para el choque ni recalcula: todo movimiento sale del `Resultado` y el daño, de `dano.perfil_m`. Si el perito edita en 3D, Unity manda la edición, la web corre el solver y vuelve a cargar el caso.
- **Una sola entrada:** el paquete caso-3d (`caso3d.schema.json`, `armarCaso3d`). El puente es `packages/scene-schema/visor-puente.md`.
- **`Croquis.Core` no depende de Unity** y se prueba con `dotnet test` en CI. Los builds de Unity no corren en CI: necesitan licencia y pasan de 10 minutos.
- **Nada de binarios pesados en git:** los modelos se cargan de Vercel Blob; el build web va a Blob y el de escritorio, a un release de GitHub.

## Estándar de calidad
1. No dejes mocks permanentes ni "lo dejamos para después" sin registrarlo como pendiente en `docs/PROGRESS.md`.
2. Recortar lo que CESVI no usa no requiere preguntar. Pregunta a René solo antes de quitar algo que un perito sí usa o que ya está en `docs/cesvi/`.
3. Toda afirmación numérica en README o docs sale de un script en `eval/` cuyo resultado está en `eval/results/`. Nunca escribas un número que no hayas medido.
4. Todo dato externo se registra en `data/SOURCES.md` (origen, URL, fecha de descarga, licencia, script). Todo asset en `assets/ASSETS.md` (autor, licencia, URL).
5. Nada de logotipos ni marcas en los modelos 3D. Nada de contenido gráfico de personas lesionadas.
6. Respeta §10 de `PLAN.md` (IA responsable): sin culpas, sin diagnósticos, leyenda ilustrativa en vistas y exportaciones.
7. Diseño: §11 de `PLAN.md` es el estándar visual. Nada de estilos por defecto de plantillas, nada de video, maquetas ni imágenes de stock: todo lo que se ve lo calcula el sistema. Inspiración en las presentaciones de lanzamiento de primer nivel, sin copiar logotipos ni recursos de ninguna empresa. Tipografías: se permiten las de licencia libre (SIL Open Font License, Google Fonts), registradas en `assets/ASSETS.md`; lo prohibido es copiar fuentes propietarias de una marca (aclaración de René, 2026-10-24).

## Autonomía
Trabajas de forma autónoma. **No pidas visto bueno para planes, decisiones técnicas ni para pasar de fase.** Las pruebas son la aprobación: si una fase cumple su criterio de aceptación con todo en verde, fusiona y sigue con la siguiente. Al cerrar cada fase deja el «Resumen para René» con capturas: él revisa cuando puede y se corrige lo que marque. Las capturas de U2, U3, U5 y W4b son las que más le importan.

- Decisiones técnicas: tómalas tú con buen criterio, regístralas en un ADR (`docs/adr/`) y sigue.
- Decisiones abiertas de `PLAN.md` §16: usa la opción por defecto marcada ahí y regístrala.
- Dependencias y herramientas de desarrollo (npm, pip/uv, winget): instálalas tú y anota en `docs/PROGRESS.md` qué instalaste y para qué.
- Si algo falla, depúralo hasta que funcione. No marques nada como hecho con pruebas en rojo, saltadas o borradas para que pase.
- **No le preguntes a René decisiones técnicas, de medición, de herramientas ni de configuración.** Elige tú la opción que recomiendes, regístrala en `docs/PROGRESS.md` (y en un ADR si es de arquitectura) y sigue trabajando sin esperar.
- Cambios en la computadora de René que sean reversibles y se restauren solos (por ejemplo, el modo de energía durante una medición) también los decides tú, siempre que quede registrado en el resultado.

- Ajustes que solo tocan baja o media también los decides tú, si cumplen las cuatro condiciones siguientes. Los documentas en E6 y en `docs/PROGRESS.md` con los números de antes y después, y sigues.
  - Con ellos se cumple §7.8 de `PLAN.md`.
  - Primero intentaste optimizar sin cambiar el aspecto.
  - Alta y ultra conservan todo.
  - No se pierde ninguna función (por ejemplo, la visibilidad nocturna).

**Solo le preguntas a René en dos casos:**
1. Un recorte de calidad o alcance que afecte a alta o ultra, o que quite una función o una evaluación.
2. Algo que solo René puede dar: llaves de API, cuentas de despliegue, la computadora de demo, pruebas con personas reales (E9).

Si algo está bloqueado por el punto 2, **no te detengas**: anótalo en la sección "Bloqueado — necesita a René" de `docs/PROGRESS.md`, avanza con todo lo que no dependa de eso y retómalo cuando esté disponible.

## Flujo por fase
1. Lee la fase en `PLAN.md` y su criterio de aceptación.
2. Escribe un plan corto en la bitácora de tu frente, `docs/progress/<U o W>.md` (archivos, pruebas, riesgos), y empieza de inmediato.
3. Implementa en una rama `feat/u<n>-<tema>` o `feat/w<n>-<tema>` con commits pequeños (Conventional Commits).
4. Escribe solo las pruebas que pide "Para quién y qué tan lejos": unitarias de lógica y cálculos, y una e2e por flujo principal en Chromium.
5. Corre localmente lint, tipos y esas pruebas (y paridad si tocaste el solver). Las evaluaciones largas solo cuando René las pida.
6. Actualiza la bitácora de tu frente con: qué se hizo, evidencia (comandos y salidas, capturas), números medidos, pendientes y decisiones.
7. Con todo en verde y el criterio de aceptación cumplido: fusiona con «Create a merge commit» y empieza la siguiente fase.
8. La bitácora de tu frente siempre debe permitir que otra sesión retome el trabajo sin contexto previo: fase actual, siguiente paso concreto y bloqueos.
9. Al final de cada fase deja en ella un «Resumen para René»: qué quedó, cómo probarlo y qué necesitas de él.

## Reglas técnicas
- `packages/scene-schema/escena.schema.json`, `resultado.schema.json` y `caso3d.schema.json` son el contrato. Zod, Pydantic y C# se **generan**; no se editan a mano.
- El solver Python es la referencia. Cualquier cambio en él exige actualizar el port TS y que las pruebas de paridad pasen.
- El LLM solo produce `EscenaSpec`. Nunca genera geometría, trayectorias ni números físicos finales.
- Todo lo aleatorio recibe semilla explícita.
- Usa la versión estable vigente de cada dependencia y regístrala en `docs/adr/0001-stack.md`. Verifica APIs en la documentación oficial antes de usarlas; no confíes en memoria.
- Secretos solo en variables de entorno (`.env.local`, nunca versionado). Incluye `.env.example`.
- CI no llama a la API de Claude: usa respuestas grabadas.
- Despliegue **solo en Vercel** (web y API como Route Handlers de Next.js). Nada de AWS, CDK ni servidores propios. En producción no corre Python: el solver de producción es el port TS; Python queda para referencia, pruebas y evaluaciones.

## Qué no hacer
- No borrar datos crudos ni resultados de evaluación sin pedirlo.
- No modificar el test congelado de Relatos-MX después de congelarlo.
- No hacer merge a `main` con CI en rojo.
- No reescribir la historia de `main` (nada de `push --force`).
