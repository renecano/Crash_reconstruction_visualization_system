# ADR 0108 — Laboratorio: tokens con los roles de siempre, actos sobre los pasos y transición en CSS

- **Fecha:** 2026-11-05
- **Estado:** aceptada
- **Contexto:** rediseño «Laboratorio» de `/cesvi` (prompt en `docs/cesvi/rediseno/laboratorio/`, René 2026-11-04), con sus cambios: transiciones solo con `transform`, `opacity` y `clip-path`, y ninguna tarea larga de más de 100 ms.

## Decisiones

1. **Los colores del Laboratorio se asignan a los roles que ya usan los componentes**, no a nombres nuevos.
   - Los roles son `--fondo`, `--superficie`, `--texto`, `--accion` y los demás.
   - Van bajo `data-diseno="laboratorio"` y `data-tema` en `styles/sistema.css`, con los valores en `assets/brand/tokens.json`.
   - Así el rediseño cambia todo `/cesvi` sin tocar cada componente, y el resto del sitio queda igual.
   - Los roles nuevos que pide el prompt (`--suave`, `--tip-fondo`, `--sombra-hoja`, los de la escena) se agregan en el mismo bloque.
2. **Los seis actos agrupan los ocho pasos.** La lógica de cada paso, lo obligatorio, el estado y las pruebas no cambian; la tabla está en `docs/DISENO.md`. Los botones de los actos llevan el `data-testid` del primer paso de cada acto, así que las pruebas que los usan siguen valiendo.
3. **La transición está hecha con CSS** (`@keyframes` en `styles/sistema.css`), no con Framer Motion.
   - Es una sola secuencia sin estado que no necesita la biblioteca.
   - Las duraciones llegan como variables, para la versión completa y la corta.
4. **La C se «traza» con `clip-path`**: un barrido de izquierda a derecha, no con `stroke-dashoffset` como dice el prompt. `stroke-dashoffset` no está entre las propiedades que René permitió para las transiciones.
5. **El acto nuevo ya está montado debajo de la cortina:** cuando la cortina sube, el contenido ya cargó. La transición no bloquea la carga del acto (prompt §11.3).
6. **Las rutas por acto quedan para la siguiente parte:** se recargaría el estado del recorrido y hay que hacerlo con cuidado.

## Consecuencias

- **Las demás páginas:** la portada y `/visor` no cambian. Solo `/cesvi` tiene el diseño, por su `layout.tsx`.
- **Las pruebas:**
  - Las e2e de `/cesvi` pasan sin cambios.
  - Las capturas manuales de las primeras décimas de segundo pueden salir con la cortina. Para capturar sin ella se apaga «Transiciones» (`croquis.cesvi.transiciones` = `no`).
