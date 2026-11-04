# ADR 0104 — Carga progresiva del 3D y reproducción sin tirones

- Fecha: 2026-11-04
- Estado: aceptado
- Origen: René, 2026-11-04 (MacBook Pro M1 con Chrome: el 3D de `/cesvi/casos/a2010930` y de
  `/visor` se congelaba, «Preparando el dibujo 3D…» indefinido y «Page Unresponsive»).

## Contexto

En la MacBook M1 de René (Chrome, WebGL 2 sobre ANGLE/Metal) el 3D tardaba más de 30 s en
mostrar algo, se congelaba al reproducir y al pulsar las cámaras, y en alta (a donde subía solo el
modo automático) Chrome avisaba «Page Unresponsive». Con las trazas de Chrome y el perfil de CPU
(`apps/web/e2e/tirones-recorrido.spec.ts`) en la laptop de referencia (Intel UHD, WebGL 2 sobre
ANGLE/D3D11) se encontraron estas causas, todas en el hilo principal:

1. **Todo se precompilaba de una vez y al final.** `renderer.compileAsync(todo el grafo)` generaba
   los sombreadores de la escena completa en una sola cadena de microtareas (23 s con la CPU
   limitada ×4) y nada se veía hasta terminar: el primer cuadro llegaba a los 45 s.
2. **Los programas de sombras no se precompilaban.** `compileAsync` no pasa por el pase de
   sombras; cada vehículo compilaba el suyo al entrar en el marco de la sombra del sol, a media
   reproducción (tirones de 100–350 ms en t ≈ −2.2 s de AXA). Un «calentamiento» con todo visible
   los compilaba todos en una sola tarea (11 s).
3. **Cada llegada regeneraba todo.** Modelos de los vehículos, HDRI, texturas, árboles, restos y
   personas llegaban por separado y cada uno volvía a compilar el grafo entero (hasta 2 s de
   congelamiento durante la reproducción).
4. **Cambiar de cámara regeneraba los sombreadores.** La luz de la cabina se encendía y apagaba
   con `visible`, y cambiar el número de luces cambia el código de todos los materiales.
5. **La calidad automática subía a alta a media sesión** (por fps de una escena a medio cargar) y
   cada cambio vuelve a crear el renderer: congelamiento de 1 s (×1) a 5 s (×4). En la M1 además
   el dpr salía 3 (`min(devicePixelRatio, 2) × 1.5` del perfil alta): lienzo de 3767 × 1562 px y
   516 MB de memoria de pantalla.
6. **El mapa del caso seguía montado bajo el 3D** y los avisos del reloj a 15 Hz volvían a dibujar
   toda la página: dos contextos dibujando y la página a 10 fps.
7. **El clic de cámara tardaba 4–6 cuadros** en llegar al dibujo (el reconciliador de R3F
   propaga las propiedades de forma asíncrona).

## Decisión

1. **Precompilado progresivo, objeto por objeto** (`packages/viewer/src/precompile.ts`,
   `Precompilador`). En cuanto están la base del grafo, los modelos, las texturas, los árboles y el
   HDRI, el grafo se monta con todos sus objetos escondidos en una capa (`CAPA_OCULTA`, 31) y se
   compilan uno por uno, cediendo el hilo entre objetos, en **orden de revelado** (lo más grande de
   lo que ve la cámara, luego los vehículos, luego el resto de lo visible, al final lo de fuera
   del encuadre; `ordenDeRevelado`). Cada objeto aparece en cuanto sus programas están listos.
   Primero todos los programas de dibujo (y el revelado) y después los de sombras: mientras un
   objeto no tiene el suyo, no proyecta sombra, para que ningún cuadro real lo compile al vuelo.
   Al terminar, el grafo queda «listo» y arranca la reproducción automática.
2. **Programas de sombras calentados uno por uno**: un cuadro a 8 × 8 con una copia de la cámara
   que solo ve las luces y un «cebo» (una malla diminuta que recibe sombra: three dibuja el mapa de
   sombras al dibujar un objeto iluminado, una vez por cámara y por cuadro); el objeto va en una
   capa que la cámara de la sombra sí ve (`CAPA_SOMBRA`, 29) y los demás no. Cada cuadro es
   síncrono: los cuadros reales nunca ven el estado intermedio.
3. **En cada contexto de dibujo.** En alta y ultra la posproducción dibuja la escena en sus pases
   (otro destino y otro MRT): el precompilado compila en esos contextos (`PostEffects` los publica)
   para que el cuadro real reutilice lo compilado. Antes compilaba para el contexto directo y en
   alta el primer cuadro real volvía a generar todo.
4. **Lo que llega después se esconde y se compila en segundo plano** (restos, personas, fantasmas)
   y se revela al terminar. El HDRI, las texturas y los árboles se esperan antes del primer
   revelado; los restos y las personas no. Los restos y las personas solo se hornean sobre el grafo
   definitivo (con modelos), y mientras se esperan los modelos el grafo provisional va sin entorno.
5. **Nada cambia la cuenta de luces**: la luz de la cabina siempre está presente, con intensidad 0
   fuera de la cámara del conductor.
6. **Calidad automática conservadora**: el nivel inicial lo da la GPU (Apple Silicon e integradas:
   media; `gpu-tier.ts`); en WebGL el tope es media; en la sesión solo baja, y la bajada no vuelve a
   crear el visor abierto: queda como techo de la sesión (`sessionStorage`) y se aplica al volver a
   abrir el 3D. Sin prueba de backend por medición: manda lo elegido a mano (clave nueva
   `croquis.backend.manual`; lo que guardó la prueba vieja se ignora), si no, WebGL 2 en GPU
   integrada y WebGPU en las demás (`defaultBackendFor`). `?backend=webgl` es alias de
   `?renderer=webgl`.
7. **dpr por nivel y memoria de pantalla** (`packages/viewer/src/dpr.ts`): nunca más de
   `min(devicePixelRatio, 2)`; baja 1, media 1.5, alta y ultra 2; y en todos los niveles se baja de
   0.25 en 0.25 (hasta 1) hasta que la memoria de pantalla estimada cabe en 150 MB.
8. **El caso**: el mapa se desmonta mientras el 3D está a la vista (nunca dos contextos dibujando
   a la vez; el 3D inactivo bajo el mapa no dibuja ni corre el reloj), el reloj avisa a lo más 4
   veces por segundo y no mueve el mapa cuando está desmontado, el paso «Los daños» reutiliza el
   mismo visor, el trozo de `three/webgpu` y los modelos de los vehículos se bajan al entrar al
   caso, y `?diag=1` muestra las últimas tareas largas con su causa (la última marca:
   `marcar()` deja también una marca de usuario visible en la pestaña Performance).
9. **Cámara «viva»**: el botón escribe la cámara en una referencia que el siguiente cuadro ya usa,
   sin esperar a React.
10. **Lo que el conductor no ve**: en su cámara no se dibuja la bolsa de aire del propio vehículo
    (las de los demás y las demás cámaras sí).

## Lo que no entra aquí (pendiente, `docs/PROGRESS.md`)

- **Alta en segundo plano en Apple.** René pidió que en GPU de Apple el automático suba a alta
  solo si alta ya está precompilada en segundo plano. Hoy el automático se queda en media (WebGL
  y Apple) y no sube en la sesión; subir sin volver a crear el visor exige un grafo que no se
  rearme al cambiar de perfil (pasto, árboles extra, sombras de los focos y la posproducción como
  añadidos) y precompilar en los pases de alta mientras se dibuja media.
- **CPU limitada ×4.** Con la CPU ×4 ya no se compila nada durante la reproducción ni al cambiar
  de cámara, pero cada cuadro del dibujo cuesta 110–185 ms de hilo principal (71 llamadas de
  dibujo, el recorrido de nodos de three por objeto): la meta de ninguna tarea de más de 100 ms
  ahí pide menos objetos y menos trabajo por cuadro, no más precompilado.
- **Primer cuadro ≤ 5 s** en la laptop de referencia: 8.4 s, dominado por la llegada de los
  modelos de los vehículos (7.5 s: decodificación en el hilo principal mientras se hornean cielo y
  texturas).

## Consecuencias

- Medido antes y después en `eval/results/t1_tirones.json` (`antes`, `antes_carga`, `antes_dpr`,
  `despues`), con la CPU normal y ×4, el caso de AXA y el visor suelto como lo probó René (dpr 2
  en media, dpr 3 en alta, WebGL). Las trazas crudas y la lista de programas por fase quedan en
  `apps/web/test-results/` (fuera del repositorio).
- `precompile.ts`, `dpr.ts` y las políticas de backend y calidad tienen pruebas unitarias; el
  spec de medición no bloquea el merge.
