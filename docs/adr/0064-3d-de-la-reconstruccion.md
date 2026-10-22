# ADR 0064 — El 3D de la reconstrucción en «Caso nuevo» (R3)

- **Estado:** aceptado (2026-10-21).
- **Contexto:** R3 de `docs/cesvi/PLAN-CESVI.md` (plan v2). Hay que reactivar el visor 3D y llevarlo al flujo del perito:
  - lo que calculó el solver;
  - el daño en las zonas que narró el perito;
  - restos, huellas y objetos fijos;
  - cámaras libre, cenital y de conductor;
  - la línea de tiempo sincronizada con el croquis 2D;
  - y sin que los cuerpos se atraviesen.

  El visor ya tenía cámaras, niveles de calidad (§7.8), marcas en el piso derivadas de las trayectorias, restos generados, objetos fijos y un componente embebible (`VisorEscena`), que usa el flujo guiado.

## Decisión

- **El 3D en «Caso nuevo»** (`/cesvi/caso`) usa `VisorEscena` con la escena reconstruida.
  - **Velocidades:** `especReconstruida` escribe en la escena las que estimó la inversión con la evidencia del perito, con fuente `supuesto`, su rango p10–p90 y una nota. Así el 3D anima la reconstrucción, no las velocidades por omisión, y no las presenta como del perito.
  - **Arranque:** se abre con la cámara cinemática y reproduciendo, como el flujo guiado. Las demás cámaras (libre, cenital, conductor) son las del visor.
- **El daño en la zona narrada.** El tercio o el vértice que narró el perito pasa a la zona horizontal CDC del impacto (`zonaHorizontal`):
  - en el frente y la parte posterior, L, C o R;
  - en los costados, F, P o B.

  El solver centra el daño ahí (`crushCenter`) y el visor lo deforma en ese lugar. Medido en el crucero de R1: el centro del daño se mueve +0.52 m, 0 y −0.52 m para los tercios izquierdo, centro y derecho.

- **El croquis 2D sigue al reloj del 3D.**
  - **En el visor:** `VisorEscena` avisa el tiempo del reloj (`onTiempo`).
  - **De vuelta al mapa:** `posicionesEnTiempo` interpola la trayectoria del solver en ese instante y la regresa al mapa desde el punto de impacto (latitud, longitud y rumbo desde el norte).
  - **En «Caso nuevo»:** el mapa dibuja ahí a cada vehículo.
- **Restos, huellas y objetos fijos:**
  - las huellas y los restos que dibuja el visor salen de las trayectorias del solver (ADR 0030 y siguientes);
  - el objeto fijo narrado entra a la escena como objeto del entorno (`buildSpec`).

  No se dibuja una zona de restos con la longitud narrada sin su ubicación en el mapa: no se inventa dónde está.

- **La interpenetración** se mide con `eval/r3_interpenetracion.mts` y se corrige en el solver (ADR 0063).

## Consecuencias

- **La e2e `@flujo` de `/cesvi/caso`** abre el 3D, comprueba que dibuja y que los vehículos de la reconstrucción se mueven en el mapa.
- **Capturas y fps** se miden a mano antes de una demo, como pide CLAUDE.md.
- **Pendiente** (en «Endurecimiento pendiente»): el recorrido de ocho pasos del caso de AXA sigue sin 3D. La demo de esta semana lo pidió así; cuando el recorrido se generalice a N vehículos, usará este mismo visor.
