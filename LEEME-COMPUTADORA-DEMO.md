# Croquis en la computadora de la demo

Con un doble clic, esta computadora hace dos cosas para Croquis:

- **Los videos de la reconstrucción:** el caso de AXA y una carambola, en calidad completa.
- **La medición del visor 3D** en alta y ultra.

Al terminar, sube los resultados a GitHub para que René los vea.

## Antes de empezar

- **Lo que necesita la computadora:** Git, con acceso al repositorio de Croquis, y Google Chrome. Si falta alguno, el programa lo dice.
- **Conéctala a la corriente y a internet.** La primera vez descarga Blender (unos 400 MB) de su sitio oficial.
- **Calcula unas 2 o 3 horas** y no uses la computadora mientras corre: la medición necesita el equipo libre.

## Pasos

1. Abre la carpeta del repositorio de Croquis y trae lo último: `git pull`. También puedes usar el botón de actualizar de tu programa de Git.
2. Haz doble clic en **`EJECUTAR-EN-COMPUTADORA-DEMO.bat`**.
3. Se abre una ventana negra que va diciendo lo que hace. A la mitad, Chrome se abre solo a pantalla completa para medir. No lo cierres: se cierra solo.
4. Al final, la ventana muestra un resumen: qué hizo, cuánto tardó y si algo falló. Presiona una tecla para cerrarla.

## Si algo falla

El programa no se detiene: dice qué falló y sigue con lo demás. Tómale una foto al resumen y mándasela a René.

## Qué toca y qué no

- **Fuera del repositorio,** solo usa su carpeta: `%LOCALAPPDATA%\CroquisDemo`. Ahí van Blender y un perfil de Chrome aparte, que no toca el tuyo.
- **En el repositorio,** guarda los resultados en `resultados/computadora-demo/<fecha>/`: los videos, la medición y los datos de la máquina.
  - Los sube a una rama nueva, `resultados/computadora-demo-<fecha>`, nunca a `main`.
  - No pide contraseñas: usa las que Git ya tenga guardadas.
- **No instala nada en Windows** ni cambia su configuración.
- **Solo descarga Blender,** de blender.org, y verifica que el archivo sea exactamente el publicado (SHA-256) antes de usarlo.
