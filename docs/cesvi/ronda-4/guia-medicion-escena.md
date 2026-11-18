# Guía de 5 minutos: cuánto tarda alguien nuevo en dejar lista La escena

Para René, en la segunda ronda (decisión del 2026-11-18). Se mide lo mismo en las dos versiones de La escena:

- **«Antes»:** la de una pregunta a la vez, la de hoy.
- **«Después»:** la escena ya armada por Croquis, con la lista a la izquierda.

**Lo que interesa:** cuánto tarda en dejarla lista y dónde se atora. Ningún número de la reconstrucción entra aquí.

## Antes de empezar (1 min)

- **Persona:** alguien que nunca haya usado Croquis. Mejor si es perito o conoce de hechos de tránsito.
- **Computadora:** la laptop conectada a la corriente, con Chrome y la ventana maximizada. Un cronómetro (el del teléfono).
- **El caso:** el del Periférico a la altura de Viaducto, el que ya conoces.
  - **«Después»:** <https://croquis-sage.vercel.app/cesvi/casos/reporte/cesvi-cf708e9fed/escena>
  - **«Antes»:** la misma liga con `?escena=anterior` al final.
- **Orden:** con cada persona, la mitad de las veces empieza por «antes» y la otra mitad por «después». Así lo aprendido en la primera no favorece siempre a la misma.
- **Datos personales:** ninguno. Cada persona va con su código: P01, P02, …

## La tarea (hasta 4 min por versión)

1. **Abre la liga, pasa a «Trabajar» y entrega el ratón.** Dile solo esto, en voz alta:

   > «Este es un choque que ya narró un perito. Deja la escena lista para reconstruirla: que cada vehículo esté donde y como debe estar. Cuando Croquis te deje ver la reconstrucción, avísame. Si algo no te queda claro, dilo en voz alta.»

2. **El cronómetro corre desde que suelta la consigna** y se detiene cuando se activa «Ver la reconstrucción». No hace falta que la abra.
3. **No ayudes.** Si se atora más de 1 minuto, anota dónde y dale una sola pista: «busca dónde se marca dónde quedó el vehículo».
4. **A los 4 minutos,** detente aunque no termine, y anota «no terminó».

## Qué anotar (al terminar, 1 min)

En la tabla de abajo, una fila por persona y versión:

- **Tiempo:** mm:ss hasta que se activa «Ver la reconstrucción», o «no terminó».
- **Dónde se atoró:** el paso o el botón, y lo que dijo en voz alta.
- **Pistas:** cuántas le diste.
- **Dos preguntas al final**, con sus palabras:
  1. «¿Qué fue lo más difícil?»
  2. «Del 1 al 5, ¿qué tan seguro estás de que la escena quedó como el choque?»

## Hoja de registro

Copia esta tabla en `docs/cesvi/ronda-5/medicion-escena.md`, o mándamela tal cual y yo la paso a `eval/results/`.

| Persona | Versión | Empezó por | Tiempo | Dónde se atoró | Pistas | Lo más difícil | Seguridad (1–5) |
| ------- | ------- | ---------- | ------ | -------------- | ------ | -------------- | --------------- |
| P01     | antes   | antes      |        |                |        |                |                 |
| P01     | después | antes      |        |                |        |                |                 |
| P02     | después | después    |        |                |        |                |                 |
| P02     | antes   | después    |        |                |        |                |                 |

## Qué hago yo con esto

- **La mediana del tiempo** de cada versión, con cuántas personas terminaron. Con 3 a 5 personas no hay estadística: se reporta tal cual, sin porcentajes inventados.
- **La lista de dónde se atoran:** cada punto se vuelve un arreglo, con su captura antes y después.
