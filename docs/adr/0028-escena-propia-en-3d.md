# ADR 0028 — La escena propia en el visor 3D, con resultado progresivo (F9)

- **Estado:** aceptado (2026-10-17)
- **Contexto:** la escena que arma la persona usuaria llegaba del relato al croquis 2D, pero el visor 3D solo abría las escenas canónicas, cuyos resultados están precalculados con la referencia Python.
  - **Qué cambió:** desde F9, paso 2, el solver TS produce el resultado completo (`fullResult`: reconstrucción, Monte Carlo, inversión y consistencia) con paridad E7. Ya se puede reconstruir cualquier escena en el navegador, sin servidor y sin red.
  - **El costo:** el resultado completo tarda segundos (Monte Carlo y la inversión reconstruyen la escena decenas de veces), mientras que la sola reconstrucción tarda décimas.

## Decisiones

1. **`/visor?escena=propia`** abre la escena guardada en `sessionStorage` de la pestaña (`croquis:escena-propia`), validada contra el contrato al leerla.
   - **Privacidad:** la escena nunca sale del navegador.
   - **Sin escena guardada:** el visor explica cómo crearla.
   - **«Ver en 3D»** en el croquis la guarda con los cambios aplicados y abre el visor.
2. **El Web Worker responde en dos fases:**
   - primero la reconstrucción, que es lo que se dibuja;
   - después el resultado completo, para los paneles: incertidumbre, evidencia e inversión, consistencia.

   La página nunca se congela. Mientras llega lo segundo, el visor lo dice en un aviso de estado.

3. **El visor 3D se queda con la primera respuesta.** Las trayectorias del resultado completo son las mismas, y reemplazar el objeto haría que el visor reconstruyera la escena 3D y sus restos y ragdolls horneados. Solo los paneles se actualizan.
4. **Las escenas canónicas siguen cargando su resultado precalculado,** que es el que comparan E7 y las capturas de referencia.

## Consecuencias

- El flujo relato → croquis → 3D funciona de punta a punta en el navegador. Las pruebas e2e cubren los tres casos: sin escena, escena guardada con el resultado completo y «Ver en 3D» desde el croquis.
- Es la base de la demo sin red del criterio de F9: falta que la página y sus datos queden en caché (service worker).
