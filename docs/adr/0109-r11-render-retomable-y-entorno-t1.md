# ADR 0109 — R11: render retomable con avance, subida por paso y el escenario de T1 en Blender

- **Fecha:** 2026-11-05
- **Estado:** aceptada
- **Contexto:**
  - El colaborador cerró la corrida del 2026-11-03 de la computadora de la demo a la mitad del render de AXA. Parecía trabada: pasó horas sin escribir nada.
  - No se subió nada, porque el botón solo subía al final.
  - René pidió volver a exportar las escenas con el escenario de T1 y que el exportador a Blender lo incluya.
  - También pidió:
    - avance visible y un aviso fijo de no cerrar la ventana;
    - retomar el mismo día;
    - las opciones `-SoloMedicion` y `-SoloRender`;
    - subir lo que esté listo al terminar cada paso.

## Decisiones

1. **El render va cuadro por cuadro** en PNG, en la carpeta de trabajo (`%LOCALAPPDATA%\CroquisDemo\render-<tipo>-<fecha>\<escena>`).
   - Blender no sobrescribe (`use_overwrite = False`) y aparta el lugar de cada cuadro (`use_placeholder`). Así, una segunda corrida sigue desde donde se quedó.
   - Antes de retomar se borran los cuadros vacíos o sin fin de archivo, el que se estaba haciendo al cortar (`cuadros_incompletos`).
   - Al terminar, `croquis_render.py --unir` arma el MP4 con el secuenciador de Blender, sin otra dependencia. El video aparece en la carpeta de resultados solo completo.
2. **El avance sale de los archivos,** no de la salida de Blender: cada 2 s se cuentan los cuadros listos contra el `plan.json` que escribe el script.
   - Cada 5 s el botón muestra «Cuadro N de M · lleva … · faltan unas …», también en el título de la ventana.
   - Con los dos primeros cuadros de la corrida calcula el total y fija el aviso «No cierres esta ventana; tarda unas X horas».
3. **Todo lo de la corrida va por día** (`yyyy-MM-dd`): la carpeta de resultados, la de trabajo y la rama `resultados/<tipo>-<fecha>`. Correr de nuevo el mismo día salta lo terminado (el video ya armado, la medición ya guardada). Otro día empieza de cero.
4. **Se sube después de cada paso.**
   - El commit se arma con un índice temporal sobre la punta de la rama del día, o sobre el commit actual la primera vez, y se sube con `push` normal (avance rápido).
   - No toca la copia de trabajo. Si no puede subir, lo dice y sigue: lo que está queda en la carpeta y sube en el siguiente paso.
5. **El escenario de T1 viaja como dato en el glTF:**
   - **Por qué:** el exportador solo puede llevar el color plano de los materiales de nodos (TSL).
   - **Suelo, banquetas y asfalto:** llevan en `extras` su textura (nombre, mosaico, color medio y el color calibrado). Blender la rearma en planta con los mismos archivos del repositorio y la misma calibración (`colorGain`).
   - **Tarjetas de los árboles:** llevan sus archivos, su tinte y si es de noche. Blender les pone color, normal y el mismo recorte que el visor: alfa a 0.5 y la tarjeta vista de canto desvanecida.
   - **Matas de pasto:** llevan el color del suelo y si es de noche. Blender rearma las tres hojas por tarjeta con la misma cuenta que el visor; sin esto salían como cuadros blancos.
   - **La v de las UV:** los materiales sin textura salen de three.js con su UV tal cual (origen abajo) y el importador de Blender les da la vuelta. Blender usa 1 − v en las tarjetas y las matas, e invierte el verde del mapa de normales de los árboles; sin esto el árbol salía de cabeza.
   - **Hojas translúcidas:** en Cycles una tarjeta solo recibe el sol por la cara que lo ve, y la otra salía negra. Las hojas suman un BSDF translúcido al de la superficie y se recortan con un BSDF transparente; así quedan cerca del brillo del suelo, como en el visor.
   - **El HDRI de la luz de ambiente:** nombre, intensidad y giro van en `ambiente`. En Blender ilumina y se refleja, mientras la cámara sigue viendo el cielo físico (`Is Camera Ray`), como en el visor.
6. **La cinematográfica se exporta con el ajuste sin obstáculos** que usa el visor (#162).
   - **Fachadas de T1.3b y T1.3c (René, 2026-11-05, noche):** cada edificio sale como su propio nodo con sus medidas, su color y sus banderas en los `extras` (`croquis_dims`, `croquis_tinte`, `croquis_banderas`); los toldos y letreros, con su color. Blender lee esos datos como propiedades del objeto y rearma la fachada con la misma cuenta que el visor: aplanado teñido o tabique, ventanas con herrería y marco, zócalo, cornisa con su sombra, cortina metálica en la planta baja y ventanas encendidas de noche. Las cornisas, los balcones y los tinacos ya eran geometría. Antes salían como cajas blancas.
   - **La leyenda del video ya no lleva la semilla:** queda en el glTF, en el dictamen y en la trazabilidad.
7. **Lo que se quedó fuera del video, igual que en las fotos del dictamen (ADR 0106):**
   - Los marcadores de interfaz (`userData.interfaz`: el anillo del impacto, las líneas de visión y los indicadores de contacto) salen de la copia que se exporta, con sus pistas de animación.
   - Los atributos por instancia (tintes y medidas de los edificios, colores de los restos) no viajan como atributos de vértice: el importador de Blender se caía con la carambola.
8. **La leyenda (§10) se parte en renglones** que caben en el cuadro. El sello de Blender es de una línea y cortaba la atribución CC-BY de los modelos; con letra de 22 px en 1080p caben unas 135 letras por renglón.
   - El fondo del sello es opaco: Blender lo dibuja antes de la transformación de color, y un negro al 60 % sobre un cielo claro quedaba casi blanco, con la letra blanca encima.
9. **Blender devuelve error si su script falla** (`--python-exit-code 1`). Antes, un error del script terminaba con código 0 y el botón solo lo notaba porque faltaba el plan.
10. **El acotamiento del lado derecho estaba volteado** (`road-decor.ts`): sus triángulos iban en sentido horario. El material de una cara lo descartaba en el visor (se veía el suelo) y Blender lo dibujaba negro. Ahora toda franja va en sentido antihorario en planta, como la calzada. Esto también cambia el visor: en autopistas y carreteras se ve la grava de los dos lados.
11. **Blender se descomprime con el `tar` de Windows** (`System32\tar.exe`). El de Git, si está primero en el PATH, no abre ZIP y lee `D:\…` como un servidor remoto.

## Límites que quedan

- **Lo que no viaja a Blender:**
  - La variación de brillo a 23 m y las manchas de tierra del pasto.
  - Las rodadas del asfalto.
  - El vaivén de los árboles.
- **La palmera procedural** sale con su color plano.
- **Los árboles** son tarjetas, como en el visor: en un acercamiento se notan planos.
- **El tiempo restante** es una estimación con la velocidad de los cuadros de la corrida actual.
- **El alfa de los árboles a lo lejos:** el visor lo sube con la distancia por los mipmaps; Blender no lo necesita y no lo hace.
