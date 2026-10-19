# E9 — Protocolo de la prueba de usabilidad

**Qué mide (PLAN §8):**

- el tiempo hasta la primera reconstrucción;
- las correcciones necesarias;
- el SUS (System Usability Scale).

Son **al menos 5 personas reales**, contando un percance propio o ficticio. No hay línea base: es la primera medición con personas.

**Quién la corre:** René, o alguien que él designe, como facilitador. Este documento, la página `/e9` y `uv run croquis-eval e9` son todo lo necesario.

## Antes de empezar

1. **Computadora y red:** una computadora con navegador actualizado, conectada a internet (el relato usa Claude en el servidor), abierta en https://croquis-sage.vercel.app.
2. **Confirmar el tope de gasto** de la API en Vercel: entre 5 y 10 relatos cuestan muy poco, pero el tope protege.
3. **Ventana limpia:** abrir `/e9` en una ventana normal, no de incógnito, para que la sesión sobreviva a una recarga.
4. **Material:** tener a la mano el consentimiento (`docs/e9/consentimiento.md`) impreso o en pantalla.

## Con cada persona (≈ 20 min)

1. **Consentimiento (2 min).** Leerlo juntos. Si acepta, marcar la casilla en `/e9`.
2. **Código.** Escribir el código de participante (`P01`, `P02`, …), nunca su nombre, y pulsar «Empezar la sesión». Desde aquí cuenta el tiempo.
3. **Tarea (hasta 15 min).** Darle solo esta consigna, en voz alta:

   > «Cuéntale a Croquis un percance vial que hayas vivido o que te inventes, como se lo contarías a alguien. Luego trata de llegar a verlo en 3D. Si algo no te queda claro, dilo en voz alta.»
   - **Qué hace el facilitador:** pulsar «Ir a contar qué pasó» y ceder el teclado.
   - **No ayudar.** Si la persona se atora más de 2 minutos, se anota «se atoró en…», se le da una pista y se sigue.
   - **Pedir que piense en voz alta.** El facilitador anota a mano lo que dice; esas notas no van al JSON.
   - **Datos personales:** no deben usarse nombres ni placas reales, aunque el redactor intente quitarlos.

4. **SUS (3 min).** Al terminar la tarea, o a los 15 minutos, volver a `/e9`. La persona contesta las 10 afirmaciones del 1 al 5.
5. **Cierre.** «Terminar la sesión» → «Descargar `e9-P0X.json`» → «Borrar la sesión de este dispositivo».

## Qué se anota y qué no

- **Lo que anota la app:** solo el momento de cinco eventos:
  - enviar el relato;
  - contestar una ronda de preguntas;
  - abrir el croquis;
  - cada corrección en el croquis, una por arrastre;
  - la primera vez que la escena propia queda lista en 3D.

  Además guarda el SUS.

- **Lo que nunca anota:** el texto del relato. Todo se guarda en el navegador hasta que el facilitador descarga el archivo.
- **Validación:** `croquis-eval e9` rechaza cualquier archivo con otros campos.
- **Notas a mano:** solo lo que la persona dijo en voz alta sobre la herramienta, sin datos personales. Si se quieren citar en el README, se pide permiso explícito.

## Después de las sesiones

1. **Archivos:** copiar los JSON a `data/e9/sesiones/` (uno por persona).
2. **Agregar:** `uv run croquis-eval e9` → `eval/results/e9.json`, con la mediana del tiempo hasta la primera reconstrucción, las correcciones, las rondas y el SUS. También dice si se cumplió el mínimo de 5 personas.
3. **Publicar:** la fila de E9 se escribe en el README y en el recorrido técnico (`pnpm --filter @croquis/web paginas`). Las notas cualitativas van en `docs/PROGRESS.md`.

## Límites que se reportan

- **La muestra es pequeña y de conveniencia;** no representa a toda la población.
- **El SUS es una traducción propia,** no una versión validada en español.
- **El tiempo incluye leer y escribir el relato,** que depende de cada persona.
