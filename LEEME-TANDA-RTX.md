# Croquis: lo pesado de una tanda, en la computadora con la RTX

Las pruebas y mediciones pesadas de Croquis no corren en la laptop de René. Esta computadora las corre con un doble clic y sube los resultados a GitHub.

## Los 3 pasos

1. **Trae lo último.** En la carpeta del repositorio de Croquis: `git pull` (o el botón de actualizar de tu programa de Git).
2. **Doble clic en `CORRER-TANDA-EN-RTX.bat`.** Se abre una ventana negra que dice qué paso va y cuánto lleva. No pregunta nada y no pide llaves ni contraseñas. No la cierres.
3. **Cuando diga «Avísale a René que ya terminó», avísale.** Los resultados ya están en GitHub, en una rama `resultados/<tanda>-<fecha>` (nunca en `main`). Presiona una tecla para cerrar la ventana.

## Lo que conviene saber

- **La primera vez es una prueba de 2 minutos.** Comprueba que el mecanismo sirve en esta computadora (herramientas, dependencias, un cálculo corto y la subida) y anota la tarjeta de video, la memoria y el disco libre. No anota el nombre del equipo ni el usuario.
- **Qué necesita:** Git con acceso al repositorio, Node y pnpm. Si falta algo, la ventana lo dice y no hace nada más.
- **Si un paso falla,** lo dice y sigue con el siguiente. Su salida queda en la misma rama para que René la vea.
- **Si se cerró a la mitad,** vuelve a hacer doble clic: lo que ya terminó ya está en GitHub.
- **Mientras corre algo largo,** no uses la computadora para otra cosa pesada.

## Para René

- La tanda que corre con doble clic es `vigente` en `tools/colaborador/tandas.json`; ahí va la lista de pasos de cada tanda.
- `CORRER-TANDA-EN-RTX.bat -Lista` dice qué hay; `-Tanda t3` corre otra; `-SinSubir` no sube nada.
