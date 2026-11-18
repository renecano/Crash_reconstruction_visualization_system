# ADR 0123 · Las versiones en el 3D: alternar ahora, fantasma superpuesto después

- **Fecha:** 2026-11-18
- **Estado:** aceptada (alternar). El fantasma superpuesto se hará en un build nuevo, con el colaborador.
- **Pedido:** René, ronda 4, punto 8: «En esta ronda, alternar entre versiones con la misma cámara e instante. En paralelo, el build nuevo de Unity con el fantasma superpuesto, en el paquete del colaborador; si está listo antes de la demo, se cambia.»

## Decisión

### 1. Alternar, con el build publicado

- **`VisorUnity` recibe `version`:** la escena de la declaración (o `null` en un «¿y si…?», que usa la reconstruida) y su resultado ya calculado. Unity solo lo reproduce: no se recalcula nada.
- **El mismo instante:** al alternar, la barra queda en el mismo `t`, recortado a lo que dura la otra versión. Unity recibe `fijarTiempo`.
- **La misma cámara:** Unity conserva el modo de cámara al cargar otro caso (`CamaraVisor.Abrir`).
  - **Límite del build publicado:** un giro hecho a mano en la órbita vuelve a su ángulo inicial, porque la escena se recarga. Lo resuelve el fantasma superpuesto, que no recarga.
- **Lo que se descarga sigue siendo la reconstrucción:** el paquete 3D y las fotos del dictamen. «Descargar video» no se ofrece mientras se ve una versión.
- **El visor ligero de respaldo** ya dibuja la versión como fantasma (T6.2) y lo sigue haciendo.

### 2. El fantasma superpuesto (build nuevo)

- **El contrato:** un campo opcional en `caso-3d` con el resultado de la versión y su etiqueta, dentro de 2.3.0.
- **En Unity:** los vehículos de la versión, translúcidos y sin daño, siguiendo su propio resultado con el mismo reloj.
- **El build:** lo compila el colaborador con su paquete (`tools/colaborador`). Se publica solo cuando la medición cumpla en la laptop y en la RTX (René, Pro).
