# Croquis: correr una tanda en tu computadora

Eres respaldo del otro colaborador: si él no puede, tú corres la tanda completa, con el mismo doble clic. No se reparten partes.

## Una sola vez

1. **Pide a René que invite tu cuenta de GitHub** al repositorio, y acepta la invitación.
2. **Instala Git** desde <https://git-scm.com/download/win> (o, en una terminal: `winget install --id Git.Git -e`).
3. **Instala Google Chrome**, si no lo tienes: las pruebas del 3D corren en él.
4. **Clona el repositorio** en una terminal, en la carpeta donde lo quieras:

   ```
   git clone https://github.com/renecano/Crash_reconstruction_visualization_system.git
   ```

   Node.js y pnpm no hace falta instalarlos: el doble clic los instala si faltan.

## Cada vez

- **Doble clic en `CORRER-TANDA-EN-RTX.bat`**, en la carpeta del repositorio. Es lo mismo que corre el otro colaborador: baja lo último solo y corre la tanda vigente completa.
- Si el otro equipo ya la corrió completa, pregunta si se corre de nuevo (s/n): contesta lo que te dijo René.
- Si Git abre el navegador, inicia sesión en GitHub con tu cuenta. Nunca pide tokens ni contraseñas.
- No uses la computadora mientras corre. Cuando diga «Avísale a René que ya terminó», avísale.
- Si al final dice que un zip **no se subió** (por ejemplo, `recorrido-solo-cesvi.zip`), mándaselo a René por WhatsApp o Drive. No lo subas a ningún otro lado.

Más detalle: `LEEME-TANDA-RTX.md`.
