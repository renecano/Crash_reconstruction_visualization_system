# Croquis en la computadora de la demo

Con un doble clic, esta computadora hace dos cosas para Croquis:

- **Los videos de la reconstrucción:** el caso de AXA y una carambola, en calidad completa.
- **La medición del visor 3D** en alta y ultra.

Cada vez que termina una de esas partes, sube lo que ya está a GitHub para que René lo vea.

## Antes de empezar

- **Lo que necesita la computadora:** Git, con acceso al repositorio de Croquis, y Google Chrome. Si falta alguno, el programa lo dice.
- **Conéctala a la corriente y a internet.** La primera vez descarga Blender (unos 400 MB) de su sitio oficial.
- **Tarda varias horas.** No uses la computadora mientras corre: la medición necesita el equipo libre.

## Pasos

1. Abre la carpeta del repositorio de Croquis y trae lo último: `git pull`. También puedes usar el botón de actualizar de tu programa de Git.
2. Haz doble clic en **`EJECUTAR-EN-COMPUTADORA-DEMO.bat`**.
3. Se abre una ventana negra que va diciendo lo que hace.
   - **Mientras renderiza un video,** muestra cada pocos segundos en qué cuadro va («Cuadro 120 de 450»), cuánto lleva y cuánto falta. El título de la ventana dice lo mismo.
   - **Un aviso fijo dice «No cierres esta ventana; tarda unas X horas».** Que la ventana no cambie durante minutos es normal mientras se arma la escena; el número de cuadro sí debe avanzar.
   - **A la mitad, Chrome se abre solo a pantalla completa** para medir. No lo cierres: se cierra solo.
4. Al final, la ventana muestra un resumen: qué hizo, cuánto tardó y si algo falló. Presiona una tecla para cerrarla.

## Si se cerró a la mitad

Vuelve a hacer doble clic **el mismo día**:

- **Lo que ya terminó se salta:** los videos completos y la medición.
- **El video que iba a la mitad sigue desde el cuadro donde se quedó.**
- **Lo que ya terminó, ya está en GitHub:** se sube al acabar cada parte.

Si es otro día, empieza de nuevo desde el principio.

## Si algo falla

El programa no se detiene: dice qué falló y sigue con lo demás. Tómale una foto al resumen y mándasela a René.

Si René pide repetir solo una parte, abre una ventana de PowerShell en la carpeta del repositorio y escribe una de estas:

```
.\EJECUTAR-EN-COMPUTADORA-DEMO.bat -SoloRender
.\EJECUTAR-EN-COMPUTADORA-DEMO.bat -SoloMedicion
```

## Qué toca y qué no

- **Fuera del repositorio,** solo usa su carpeta: `%LOCALAPPDATA%\CroquisDemo`. Ahí van Blender, los cuadros del video mientras se renderiza y un perfil de Chrome aparte, que no toca el tuyo.
- **En el repositorio,** guarda los resultados en `resultados/computadora-demo/<fecha>/`: los videos, la medición y los datos de la máquina.
  - Los sube a la rama `resultados/computadora-demo-<fecha>`, nunca a `main`; la misma rama todo el día.
  - No pide contraseñas: usa las que Git ya tenga guardadas.
- **No instala nada en Windows** ni cambia su configuración.
- **Solo descarga Blender,** de blender.org, y verifica que el archivo sea exactamente el publicado (SHA-256) antes de usarlo.
