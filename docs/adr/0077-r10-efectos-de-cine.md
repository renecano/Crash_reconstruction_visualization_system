# ADR 0077 — R10, primera parte: efectos de cine en alta y ultra

- **Estado:** aceptado (2026-10-23). R10 sigue abierto: falta que René apruebe las capturas, las mediciones de alta y ultra en la computadora de demo, y la fuente de los modelos de vehículos.
- **Contexto:** R10 (`docs/cesvi/PLAN-CESVI.md`) pide que la reconstrucción se vea muy por encima de lo que hay, en three.js con WebGPU:
  - vehículos realistas, materiales físicos, luz HDRI;
  - postprocesado: oclusión ambiental, bloom, tone mapping de cine, antialiasing temporal, profundidad de campo en las cámaras cinemáticas y desenfoque de movimiento en el impacto;
  - escenario, marcas en el piso, daño deformado y cámaras cinemáticas.
  - **Ya estaban:** pintura y vidrio físicos, cromo, reflejos del cielo horneado, GTAO, bloom, texturas PBR del entorno, sombras, daño por perfil y cámara cinemática.

## Decisión

1. **Cuatro efectos nuevos, solo en alta y ultra** (`QualityProfile`):
   - `temporalAA` (TRAA);
   - `depthOfField` (con la cámara cinemática, enfocada a la distancia de su objetivo, con una zona nítida de 60 % de esa distancia y al menos 6 m);
   - `motionBlur` (peso pleno a 0.15 s del primer impacto, se apaga a 0.6 s y solo al reproducir);
   - `screenReflections` (SSR con dieléctricos, para el asfalto mojado; solo ultra).
     **Baja y media no cambian.** Su presupuesto de §7.8 queda igual y no hace falta volver a medir E6 en la laptop.
2. **El orden en `PostEffects`:** escena → reflejos → resplandor → TRAA → profundidad de campo → desenfoque. Sigue el patrón de los ejemplos de three r186 (`SSRNode`, `TRAANode`, `DepthOfFieldNode`, `MotionBlur`).
   - `motionBlur` muestrea su entrada como textura, así que el color se convierte con `convertToTexture`. Sin eso, el cuadro sale negro (`e.sample is not a function`).
3. **El enfoque y el peso del desenfoque se calculan en funciones puras** (`cinematic-fx.ts`, con pruebas). La escena los escribe cada cuadro en un `FxState` que lee `PostEffects`.

## Evidencia

- **Capturas de antes y después** en `docs/cesvi/r10/`:
  - las mismas escenas (`alcance` y `nocturno_lluvia`), calidad (alta y ultra), cámara cinemática e instante (t = 0.2 s);
  - el antes es la producción de `main`; el después, esta rama;
  - mismo equipo y Chromium headless (backend WebGL 2: la laptop no levanta WebGPU en headless).
- **Lectura honesta:**
  - el cambio se nota poco: bordes más limpios, el fondo y la lluvia suavizados por la profundidad de campo, y el piso mojado con algo de reflejo en ultra;
  - la distancia con la meta (un juego de autos actual) no está en el postprocesado: está en los vehículos (procedurales, de pocas caras), el escenario y la escena nocturna, que casi no se ve.

## Pendiente (lo grande de R10)

- **Vehículos realistas por clase:**
  - los únicos modelos libres y sin cuenta que se encontraron (Quaternius, CC0) son de pocas caras: no mejoran a los procedurales;
  - los realistas con licencia libre están en Sketchfab (CC-BY, piden cuenta) o son de pago;
  - **elegir la fuente es de René** («Bloqueado»).
  - El proceso ya está pensado: escalar a las dimensiones del contrato conservando el radio de las llantas, nombrar las piezas para el daño y quitar marcas.
- **Escenario y escena nocturna:** banquetas, camellones, vegetación y postes del lugar real; más luz de faros y alumbrado para que la noche se vea.
- **HDRI:** Poly Haven (CC0) para el reflejo y la luz de alta y ultra.
- **Medición de alta y ultra:** en la computadora de demo (E6, «Bloqueado»).
