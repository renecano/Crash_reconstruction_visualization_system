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
- **Los reflejos salen del cielo sin girar,** así que el sol reflejado en el asfalto mojado puede no coincidir con el del cielo girado. Se corrige con una sonda de reflexión en U5 si se nota.
- **Qué funciona en WebGL** se comprueba con el build, no con la documentación: las capturas finales y `eval/unity_build.mjs` salen de ahí.
