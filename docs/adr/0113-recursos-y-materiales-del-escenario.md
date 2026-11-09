# ADR 0113 — Recursos y materiales del escenario en Unity

- **Fecha:** 2026-11-09
- **Estado:** aceptada
- **Contexto:** la meta de U2–U5 (René, 2026-11-09; plan v4 §3.3) es que la escena completa se vea como un juego actual de autos, con recursos CC0 o CC-BY sin marcas, fuera de git, y todo funcionando en el build WebGL.

## Decisiones

1. **Los mismos recursos CC0 del visor web,** ya registrados en `assets/ASSETS.md`: las 8 texturas PBR de Poly Haven, los 4 cielos HDRI y las tarjetas horneadas de los 3 árboles. No entra ningún recurso nuevo.
2. **Los trae `tools/unity/recursos.mjs`** a `apps/visor-unity/Assets/Croquis/Recursos/`, que está en `.gitignore`:
   - **Texturas a 1k,** bajadas de Poly Haven (el visor web las usa a 512 px), con una máscara para URP Lit armada de su mapa «arm»: metal en R, oclusión en G y lisura en el alfa.
   - **Árboles:** las tarjetas de `apps/web/public/arboles/`, de WebP a PNG, porque Unity no importa WebP.
   - **Cielos:** los `.hdr` de `apps/web/public/hdri/`, tal cual.
3. **Van dentro del build,** comprimidos con Crunch (`ImportarRecursos.cs`). El build ya se sirve desde Blob, así que los recursos también quedan «servidos desde Blob y fuera de git». Cargarlos sueltos en tiempo de ejecución (KTX2) queda como opción si el peso del build no cumple el presupuesto.
4. **Los materiales se crean como assets antes del build** (`PrepararEscenario.cs`) y en tiempo de ejecución solo se copian y se tiñen. Un build solo lleva las variantes de sombreador que usa algún material del proyecto: un material creado al vuelo con normales, recorte por alfa o transparencia saldría sin ellas en WebGL.
5. **Forward, no Deferred.** La documentación de URP dice que Deferred no corre en las API de OpenGL, WebGL 2 incluido. Luces adicionales por pixel, hasta 8 por objeto.
6. **Sin proyectores de calcomanías.** Las rayas, las huellas, los charcos y las parcelas son geometría pegada al piso con transparencia. Así no dependen de la técnica de calcomanías de URP, que cambia entre plataformas.
7. **El cielo es el HDRI,** girado para que su sol caiga en el azimut del sol del hecho (fecha, hora y latitud). La luz de ambiente y los reflejos salen del mismo cielo.
8. **El escenario se arma sobre una función de altura** (`Terreno.Z(x, y)`, hoy plana). Las mallas en planta se subdividen solas cuando el piso no es plano, para que el relieve, la ondulación y los topes de W5 entren sin rehacer las vías.
9. **Capturas de trabajo desde el editor** (`Capturas.cs`, modo batch): un build WebGL tarda de 5 a 8 minutos y deja la laptop sin memoria; una pasada de capturas tarda uno o dos. Las capturas que aprueba René salen del build WebGL.

## Límites

- **Los árboles son tarjetas,** no geometría. Los modelos CC0 de origen tienen de 0.3 a 4.6 millones de polígonos y pesan de 60 a 208 MB cada uno: no caben en un build web. El plan del entorno los pone a 22 m o más de la acción. Si de cerca no convencen, la salida es hornear una malla reducida de cada especie con Blender, y se anota para U5.
- **La palmera no tiene tarjeta:** se arma con geometría (tronco y hojas en arco).
- **Qué funciona en WebGL** se comprueba con el build, no con la documentación: las capturas finales y `eval/unity_build.mjs` salen de ahí.

## Luz y color (segunda pasada de U2, 2026-11-09)

- **Exposición y color por ambiente.** El perfil base lleva tono ACES, resplandor con tope y viñeta. Cada ambiente (día, nublado o lluvia, sol bajo, noche) ajusta exposición, contraste, saturación y filtro sobre la copia del volumen (`EscenarioVista.Gradacion`).
- **Oclusión ambiental a escala de calle.** El radio de fábrica de URP es 3.5 cm y no oscurece nada a la distancia de una cámara de escena. Va en 0.55 m, a media resolución.
- **Sombra de contacto.** URP no tiene sombras de contacto. Cada vehículo lleva una mancha suave bajo la carrocería (`sombra_contacto`), que lo asienta con cualquier luz; la sombra del sol sigue saliendo del mapa de sombras, con sesgos bajos.
- **Sonda de reflejos.** Al armar el escenario se toma un cubo desde el centro de la acción (128 px, proyección de caja de 90 m). La pintura, los vidrios y el asfalto mojado reflejan fachadas, árboles y luminarias. Los vehículos van en la capa 1 y no entran en ella: se mueven y la sonda se toma una vez.
- **Noche legible.** Es un visor forense: el perito tiene que distinguir vehículos, vía y evidencias.
  - La luz ambiente es una sonda explícita (`AmbientMode.Custom`): al cambiar el modo en ejecución, los modos de color no la actualizaban y las caras sin luz directa salían negras.
  - La luna alumbra tenue y azul. La niebla nocturna tiene tope: con lluvia tapaba la acera de enfrente.
  - Solo las 6 luminarias más cercanas a la acción llevan luz real, con cono abierto y sin núcleo. Todas dejan su charco de luz pintado en el piso (una mancha que se suma), que no cuesta una luz.
- **Lluvia.** Gotas más finas y transparentes, y salpicaduras: anillos que se abren y se apagan a ras del piso, alrededor de donde mira la cámara.

### Por qué el resplandor quemaba la imagen en WebGL

Se midió con builds de diagnóstico que apagan una cosa a la vez (`depurar` en el puente, fuera del contrato).

- **La causa son pixeles sin número (NaN).** El resplandor reparte cada pixel entre sus vecinos; un solo NaN se riega a toda la imagen, y en WebGL sale blanco. En el Editor (Direct3D) el mismo pixel sale negro y no se riega.
- **Primera fuente: normales de largo cero.** Una cara doble que compartía vértices anulaba sus normales (así salía negro el tope). `Malla.Cuadro` ahora duplica los vértices.
- **Segunda fuente: la sonda de reflejos con HDR.** En WebGL, una sonda en tiempo real con HDR devuelve NaN en todo lo que la usa. Con HDR, el 37.5 % de la captura de `lateral_interseccion` salía negra; sin HDR, el 0.5 %. En WebGL la sonda va sin HDR.
- **Defensas que se quedan:** la cámara corta los NaN antes del posproceso (`stopNaN`) y el resplandor tiene tope (`clamp` 6).
- **El resplandor queda encendido en WebGL.**
