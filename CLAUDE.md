# CLAUDE.md — Reglas permanentes de Croquis

Lee este archivo y `PLAN.md` al inicio de cada sesión. `PLAN.md` dice **qué** construir; este archivo dice **cómo** trabajar.

## Contexto

- Dueño: René (ITC, Tec de Monterrey Campus Toluca). Reto personal con alcance máximo.
- Máquina de desarrollo: **Windows, 8 GB de RAM**. Comandos compatibles con PowerShell. No asumir WSL ni GPU dedicada. No levantar más procesos pesados de los necesarios a la vez.
- Idioma: interfaz, documentación y mensajes al usuario en **español de México**; identificadores de código, nombres de archivos de código y commits en inglés.

## Estándar de calidad (no negociable)

1. Nunca bajar calidad ni alcance. No proponer versiones "light", atajos, mocks permanentes ni "lo dejamos para después" sin registrarlo como pendiente en `docs/PROGRESS.md`.
2. Si parece necesario recortar algo, pregunta a René antes de hacerlo (es la única pregunta obligatoria). Si falta tiempo, cambia el orden de trabajo, no la calidad.
3. Toda afirmación numérica en README o docs sale de un script en `eval/` cuyo resultado está en `eval/results/`. Nunca escribas un número que no hayas medido.
4. Todo dato externo se registra en `data/SOURCES.md` (origen, URL, fecha de descarga, licencia, script). Todo asset en `assets/ASSETS.md` (autor, licencia, URL).
5. Nada de logotipos ni marcas en los modelos 3D. Nada de contenido gráfico de personas lesionadas.
6. Respeta §10 de `PLAN.md` (IA responsable): sin culpas, sin diagnósticos, leyenda ilustrativa en vistas y exportaciones.

## Autonomía

Trabajas de forma autónoma. **No pidas visto bueno para planes, decisiones técnicas ni para pasar de fase.** Las pruebas son la aprobación: si una fase cumple su criterio de aceptación con todo en verde, haz merge y sigue con la siguiente.

- Decisiones técnicas: tómalas tú con buen criterio, regístralas en un ADR (`docs/adr/`) y sigue.
- Decisiones abiertas de `PLAN.md` §16: usa la opción por defecto marcada ahí y regístrala.
- Dependencias y herramientas de desarrollo (npm, pip/uv, winget): instálalas tú y anota en `docs/PROGRESS.md` qué instalaste y para qué.
- Si algo falla, depúralo hasta que funcione. No marques nada como hecho con pruebas en rojo, saltadas o borradas para que pase.

**Solo te detienes por:**

1. Un recorte de calidad o alcance que parezca inevitable (pregúntale a René antes).
2. Algo que solo René puede dar: llaves de API, licencia de BeamNG, cuentas de despliegue, pruebas con personas reales (E9).

Si algo está bloqueado por el punto 2, **no te detengas**: anótalo en la sección "Bloqueado — necesita a René" de `docs/PROGRESS.md`, avanza con todo lo que no dependa de eso y retómalo cuando esté disponible.

## Flujo por fase

1. Lee la fase en `PLAN.md` y su criterio de aceptación.
2. Escribe un plan corto en `docs/PROGRESS.md` (archivos, pruebas, riesgos) y empieza de inmediato.
3. Implementa en una rama `feat/fN-<tema>` con commits pequeños (Conventional Commits).
4. Escribe pruebas junto con el código: propiedades físicas con Hypothesis, unitarias, e2e y snapshots visuales cuando aplique.
5. Corre todo localmente: lint, tipos, pruebas, paridad y la evaluación de la fase.
6. Actualiza `docs/PROGRESS.md` con: qué se hizo, evidencia (comandos y salidas, capturas), números medidos, pendientes y decisiones.
7. Con todo en verde y el criterio de aceptación cumplido: merge a `main`, push, y empieza la siguiente fase.
8. `docs/PROGRESS.md` siempre debe permitir que otra sesión retome el trabajo sin contexto previo: fase actual, siguiente paso concreto y bloqueos.
9. Al final de cada fase deja un resumen breve para René en `PROGRESS.md`: qué quedó, cómo probarlo y qué necesitas de él.

## Reglas técnicas

- `packages/scene-schema/escena.schema.json` es el único contrato. Zod y Pydantic se **generan**; no se editan a mano.
- El solver Python es la referencia. Cualquier cambio en él exige actualizar el port TS y que las pruebas de paridad pasen.
- El LLM solo produce `EscenaSpec`. Nunca genera geometría, trayectorias ni números físicos finales.
- Todo lo aleatorio recibe semilla explícita.
- Usa la versión estable vigente de cada dependencia y regístrala en `docs/adr/0001-stack.md`. Verifica APIs en la documentación oficial antes de usarlas; no confíes en memoria.
- Secretos solo en variables de entorno (`.env.local`, nunca versionado). Incluye `.env.example`.
- CI no llama a la API de Claude: usa respuestas grabadas.

## Qué no hacer

- No borrar datos crudos ni resultados de evaluación sin pedirlo.
- No modificar el test congelado de Relatos-MX después de congelarlo.
- No hacer merge a `main` con CI en rojo.
- No reescribir la historia de `main` (nada de `push --force`).
