# Guion de la demo con CESVI (en vivo, unos 15 minutos)

Para la demo en vivo con los peritos de CESVI. El video grabado tiene su propio guion (`docs/cesvi/video/guion.md`, del 23 de octubre, sin el 3D).

- **Ensayado** el 2026-11-15 en producción con `apps/web/e2e/ensayo-demo.spec.ts`: los 10 tramos salieron, sin errores de página. Tiempos de máquina y capturas en `eval/results/ensayo_demo.json` y `docs/cesvi/demo/ensayo/`.
- **Cifras:** solo las que muestra la pantalla. Las de abajo son las del 2026-11-15; si la pantalla dice otra cosa, manda la pantalla.
- **Nada juzga al conductor:** el perito concluye. Croquis es una reconstrucción de apoyo.
- **Antes de empezar:** Chrome con caché (no incógnito), la laptop conectada a la corriente, y el 3D de AXA abierto una vez antes (así el build ya está en caché: la primera carga tarda unos 10 s; las siguientes, 3 a 4 s).

## 0 · Apertura (1 min)

> Pantalla: la portada; «Entrar a Croquis».

Croquis reconstruye un hecho de tránsito con física a partir de lo que narra el perito, lo muestra en 3D y arma el dictamen con la estructura de sus reportes. La IA solo ordena lo narrado; los números salen de la física.

## 1 · AXA A2010930: un caso que CESVI ya analizó (5 min)

> Lista de casos → AXA. Pasos 1 a 3 de corrido; paso 4, «Reconstruir» (unos 9 s).

- **La cifra:** V2 a 57 km/h, con su rango de 55 a 78. Es el mejor ajuste de la física, no un promedio.
- **Dos hipótesis:** el reposo que el reporte no da (supuesto) y la deformación medida no caben juntos. Se ve «La más cercana al daño medido»; la otra, «Cuadra con el reposo supuesto» (34 km/h), va marcada como supuesto. El perito elige.
- **Lo que explica el daño:** queda en el borde bajo de la energía que da la deformación medida. Croquis lo dice; no lo esconde.

> «Ver en 3D» → Unity → «Ir al impacto» (unos 14 s con la carga).

- **El 3D reproduce el resultado:** no calcula nada. Después del impacto, la carrocería se deforma con el perfil de daño del solver. Pausar, ¼×, «Ir al impacto», «Ver todo».
- **Leyenda:** reconstrucción ilustrativa; el entorno es procedural, no el lugar real.
- **La nota bajo el 3D** dice de qué vehículo y qué velocidad es, con el nombre del panel: «B · Tacoma (V2) antes del impacto: Croquis 57 km/h (55–78) · CESVI 63.15 km/h de barrera equivalente por la deformación (EBS)» y «A · Silverado 2500 (V1) al salir del impacto: Croquis 31 km/h · CESVI 60.27 km/h por los restos». Presentar y el dictamen lo nombran igual.

> Paso 7, «Contra CESVI».

- **El método de CESVI con los datos del reporte:** 63.90 km/h por deformación, contra los 63.15 de su reporte (+0.75 km/h, +1.19 %); por la separación de los restos, 60.27, igual que el reporte.
- **Toda diferencia va con su valor y su porcentaje.**

> Paso 8, el dictamen (PDF y Word).

## 2 · Un caso nuevo, en vivo (4 min)

> Lista → «Narrar un hecho nuevo» → paso 2 → «Usar una narración de ejemplo» (o una narración que dicte un perito) → «Leer» (Claude, unos 13 s).

- **Cada dato con su cita:** lo que la narración no dice queda como supuesto, a la vista. Los datos personales se quitan antes de enviar el texto.
- **Colocar:** una pregunta a la vez en el mapa (dónde fue, por dónde venía cada vehículo, dónde quedó).
- **Reconstruir y ver en 3D** (unos 5 s; el 3D ya está en caché).

**Plan B:** si Claude no responde, la pantalla lo dice y conserva la narración; se sigue con el caso de AXA o se llena la escena a mano.

## 3 · Importar un reporte (2 min)

> Lista → «Cargar un reporte de CESVI» → el archivo del reporte → «Leer» (Claude, unos 22 s).

Croquis lee el reporte completo de CESVI y arma el expediente con la cita de cada dato. Se revisa contra el texto: lo que no está en el reporte no entra.

**Plan B:** si tarda, mientras tanto se muestra la reproducción de reportes.

## 4 · Una carambola de sus reportes (2 min)

> Lista → «Ver los 205 reportes de la reproducción…» → el reporte `257e13` → colocar → reconstruir → 3D (unos 17 s).

- **Los impactos en orden,** en 3D.
- **Sin las posiciones del perito,** la evidencia no fija ninguna velocidad, y la pantalla lo dice así. En la prueba con 33 carambolas, todas se reconstruyen y se ven en 3D; ocurren 20 de 31 impactos posteriores.

## 5 · Cierre (1 min)

- **Lo que no hace:** no asigna culpa, no estima lesiones, no sustituye al perito.
- **Límites que conviene decir:** el rango contuvo la velocidad verdadera 410 de 578 veces (70.9 %) en casos fabricados, y lo esperado es cerca de 80 %; la rigidez por clase viene de pruebas de vehículos de Estados Unidos.
- **Lo que les pedimos:** sus comentarios y qué más necesitan.

## Antes y durante la demo

- **Tope de Claude:** 10 USD diarios (`/api/version`). La secuencia de arriba cuesta unos 0.20 USD; con el ensayo del mismo día, sobra.
- **Sin red:** el caso de AXA y la reproducción funcionan sin llamar a Claude; el 3D necesita haberse abierto una vez antes.
- **Detalle que se nota en pantalla:** la barra de reproducción tapa una esquina del minimapa. La leyenda ilustrativa del 3D ya lleva su recuadro y se lee sobre cualquier fondo (WCAG AA).
