# ADR 0087 — El botón de la computadora de la demo

- **Estado:** aceptado (2026-10-24).
- **Contexto:**
  - **Dos cosas solo se pueden medir en la computadora de la demo:**
    - el video de R11 en calidad completa (ADR 0085), que en la laptop de desarrollo no cabe: 8 GB y sin tarjeta de video;
    - la meta de PLAN §7.8, ≥ 60 fps en alta o ultra (E6).
  - **Quién la va a correr:** un colaborador con Git y Chrome, sin Claude Code ni Node.
  - **Lo que pidió René (2026-10-24):**
    - un solo archivo de doble clic;
    - que nada se descargue sin verificar;
    - que no pida más contraseñas que las que Git ya tenga;
    - que no toque nada fuera de su carpeta;
    - que suba los resultados a una rama, nunca a `main`;
    - que, si algo falla, siga con lo demás y lo diga al final, en español.

## Decisión

1. **`EJECUTAR-EN-COMPUTADORA-DEMO.bat`** en la raíz:
   - solo texto ASCII, para que `cmd` lo lea bien en cualquier página de códigos;
   - llama a `tools/demo/computadora-demo.ps1` con Windows PowerShell 5.1, que trae todo Windows 10 y 11;
   - `-ExecutionPolicy Bypass` vale solo para ese proceso y no cambia la configuración del equipo.
2. **El script de PowerShell** hace los pasos en orden. Cada uno va en su `try`, y el resumen final dice qué salió, cuánto tardó y qué falló:
   1. **Revisa Git y Chrome.**
   2. **Blender 5.2.3 portátil,** del zip oficial de blender.org:
      - el SHA-256 se fija en el script, copiado del archivo que publica blender.org;
      - si la descarga no coincide, se borra y no se usa;
      - se descomprime una vez en la carpeta de trabajo y las siguientes corridas lo reutilizan.
   3. **Los videos de R11:**
      - el caso de AXA y una carambola, con `tools/blender/croquis_render.py`;
      - en Cycles con la tarjeta de video si hay una NVIDIA, AMD Radeon RX/Pro o Intel Arc; si no, en EEVEE;
      - a 1920×1080.
   4. **La medición E6 en Chrome:**
      - abre `/medicion?auto=1` de producción en un perfil propio de Chrome, que no toca el del usuario, y guarda las descargas en la carpeta de trabajo;
      - va a pantalla completa y sin el límite de cuadros (`--disable-gpu-vsync --disable-frame-rate-limit`), como E6;
      - el modo automático de `/medicion` empieza solo y descarga el JSON al terminar; el script espera el archivo hasta 150 minutos y luego cierra Chrome. La medición de E6 son 132 mediciones (11 escenas, alta y ultra, WebGPU y WebGL, 3 repeticiones) de unos 20 s, 44 minutos; con hasta dos reintentos por tirones, cabe en 132 minutos.
   5. **Los datos de la máquina** (`maquina.json`):
      - CPU, núcleos e hilos, RAM, tarjetas de video y sus controladores;
      - las versiones de Windows, Chrome, Git y Blender;
      - el plan de energía, el commit del repositorio y la duración de cada paso.
   6. **Commit y push** a una rama nueva, `resultados/computadora-demo-<fecha>`:
      - usa las credenciales que Git ya tenga;
      - si Git no tiene nombre ni correo, el commit va como «Computadora de la demo»;
      - los videos de más de 95 MB no caben en GitHub: se quedan en la carpeta y se anotan en `no-subidos.txt`;
      - al final vuelve a la rama en la que estaba.
3. **Fuera del repositorio** solo usa su carpeta: `%LOCALAPPDATA%\CroquisDemo`, con Blender y el perfil de Chrome. No instala nada ni cambia la configuración de Windows.
4. **Las escenas** van versionadas en `demo/escenas-r11/`:
   - **la carambola** es la escena canónica `carambola`, exportada del visor en alta;
   - **AXA** sale de `tools/demo/escena-axa.mts`:
     - el expediente del caso de ejemplo (la lectura grabada del reporte, con las medidas C y L);
     - las posiciones de la reconstrucción de Croquis (la versión de la evidencia, con los restos a 15.89 m), orientadas con el rumbo de MEX 15D en el punto ilustrativo;
     - las calles del tramo de OpenStreetMap ya versionado;
     - reconstruida con el solver de producción.
     - V2 sale a 63.89 km/h antes del impacto, el mismo valor que Croquis muestra contra el dictamen en el paso 7 (63.90 km/h, contra 63.15 de CESVI).
   - Las dos se exportan del visor en alta, con los modelos de R10.
5. **`/medicion?auto=1`:** con el equipo detectado, mide con la configuración de E6 (o la de la URL) y descarga el JSON sin que nadie toque nada. Sin `auto`, la página sigue igual.
6. **`-Prueba`, para la laptop:**
   - render corto en EEVEE a 480×270;
   - una medición de 2 s en alta;
   - la rama `resultados/prueba-<fecha>`.
   - `-SinSubir` no hace commit ni push; `-Url` mide en otro sitio, por ejemplo el servidor local antes de desplegar; `-LimiteRam` fija el tope de memoria.

## Arreglos que salieron al probarlo

- **Niebla en Blender:**
  - el script creaba `ShaderNodeVolumePrincipal`, un nombre que no existe (es `Principled`); ninguna escena probada antes tenía niebla;
  - aun con el nombre bien, un volumen que dispersa el sol deja el cuadro en blanco, y uno homogéneo no reproduce la niebla del visor, que crece con el cuadrado de la distancia (`FogExp2`);
  - ahora la niebla se calcula en el compositor: con la profundidad de cada píxel, 1 − exp(−(ρz)²), mezclando hacia el color del cielo, como three.js. El cielo, como en el visor, no lleva niebla.
- **Calles que cruzan sin vértices cerca:**
  - `redVialFrom` solo tomaba una calle si tenía dos vértices a menos de 1.5 radios del impacto;
  - en una carretera recta, OSM pone los vértices a cientos de metros, así que MEX 15D se quedaba fuera y el 3D dibujaba la vía genérica;
  - ahora la calle que cruza el círculo sin dos vértices dentro entra recortada en el borde. Las que ya entraban no cambian.
  - La escena canónica de Toluca gana un tramo de la calle Benito Juárez que cruza el área.

- **Descompresión de Blender:**
  - `Expand-Archive` de PowerShell 5.1 es lento y pide mucha memoria con un zip de 406 MB;
  - en la prueba en la laptop, Claude Code detuvo la corrida por falta de memoria a la mitad de la descompresión;
  - ahora se usa `tar.exe`, que trae Windows 10 y 11 y descomprime mientras lee, en una carpeta aparte que se renombra al final, para que una descompresión interrumpida no pase por completa en la siguiente corrida.

## Prueba en la laptop (2026-10-24)

René pidió correrla completa con `-Prueba` antes de que el colaborador use el botón, sin pasar del 70 % de la RAM. La laptop ya estaba en 70 % antes de empezar (Claude Code, servicios del sistema, Defender y Edge), así que René fijó el límite en 85 %.

1. **Primera corrida** (`-Prueba`, en producción, `-LimiteRam 85`):
   - **Bien:**
     - Git y Chrome;
     - el SHA-256 del zip;
     - la descompresión con `tar.exe` (8 s);
     - los datos de la máquina;
     - el push.
   - **Detenidos por el vigilante de RAM:**
     - los dos renders, en 86 y 87 % (EEVEE en la tarjeta integrada toma su memoria de la RAM);
     - la medición en alta, en 96 %.
   - **Dos fallas del script, que se arreglaron:**
     - **No volvía a la rama de antes:** la bitácora se seguía escribiendo después del commit y Git no podía cambiar de rama con ese archivo modificado; el repositorio se quedaba en `resultados/prueba-…`. Ahora el commit se arma con un índice temporal (`GIT_INDEX_FILE`) y se sube directo a `refs/heads/<rama>`: la copia de trabajo y la rama del repositorio no cambian nunca.
     - **Subía videos a medias** (48 bytes) cuando el render se detenía. Ahora un render que falla borra su video.
   - **El vigilante de RAM** es nuevo:
     - cada paso anota su RAM máxima;
     - si un proceso pasa de `-LimiteRam` (95 % por omisión), se detiene y el paso falla con la causa, sin congelar el equipo;
     - `maquina.json` guarda la RAM al empezar y la máxima.
2. **Segunda corrida,** con `-Prueba` en lo más liviano (Cycles en CPU a 320×180 y 4 muestras, 0.5 s de cada escena, y medición de 2 s en baja): **los 7 pasos bien, en 1 min 35 s, con RAM entre 65 % y 78 %.**
   - **Los videos:** 16 cuadros cada uno, con las texturas de los modelos de R10 (22 KB y 18 KB).
   - **La medición:** en la tarjeta real de la laptop (Intel UHD, `ANGLE … D3D11`), 235 fps en baja. Llegó al tercer intento por tirones del equipo ocupado, como pide el criterio de E6.
   - **El commit de la rama** tiene como padre el commit actual, y el repositorio se quedó en su rama. La rama de prueba se borró después.
3. **La e2e de `/medicion?auto=1`** (`medicion-auto.spec.ts`), contra producción con una configuración temporal sin servidor local: pasó en 14 s.

## Límites

- **La tarjeta de video se detecta por su nombre.** Una tarjeta que no esté en la lista se renderiza en EEVEE, más rápido y algo menos fiel.
- **Si el colaborador usa la computadora** mientras mide, la medición sale peor. La guía le pide que no lo haga.
