# ADR 0086 — R10: vehículos realistas de Sketchfab

- **Estado:** aceptado (2026-10-24).
- **Contexto:**
  - **La meta de R10:** que la reconstrucción se acerque a un juego de autos actual (PLAN-CESVI R10). Lo que más la alejaba eran los vehículos paramétricos (ADR 0005), de pocas caras (ADR 0077).
  - **René abrió una cuenta de Sketchfab** (2026-10-24). Pidió:
    - un modelo descargable por clase, CC0 o CC-BY;
    - sin marca ni modelo real reconocible (regla 5);
    - optimizado para la web, cuidando los niveles §7.8;
    - integrado con el color del caso y el daño;
    - con la atribución en el visor y en el dictamen;
    - los mismos modelos en el video de Blender (R11).

## Decisión

1. **Selección:**
   - **El orden:** la tabla de candidatos se escribió en `docs/PROGRESS.md` antes de descargar.
   - **La licencia** se verifica en el detalle de cada modelo en el API (`license.slug`): solo `by` (CC-BY 4.0) o `cc0`.
   - **Los elegidos:**
     - sedán, Kiri '10;
     - hatchback, Sigil '07;
     - SUV, Urban '10;
     - pickup, Lightbody '90 MD Pickup;
     - camión, LCT 3000 '07;
     - los cinco de Daniel Zhabotinsky, con el mismo estilo y sistema de materiales;
     - moto, Enduro bike de Zaborchik.
     - Todos son CC-BY 4.0.
   - **Descartados:**
     - por copiar un modelo reconocible: Mini, Lancia Delta, Fiat Punto, Chevrolet Sonic, Smart, la parrilla de BMW;
     - por traer marca;
     - por ser de juguete o ciencia ficción;
     - la primera moto elegida («Red motorcycle»), al revisarla: una sola malla con iluminación horneada, el emblema azul y los colores de un modelo real.
2. **El pipeline** (`uv run croquis-assets vehicles download|build|check`):
   - **Descarga:**
     - el API de Sketchfab con `SKETCHFAB_API_TOKEN` del entorno; nunca se escribe ni se imprime;
     - el SHA-256 de cada original queda fijado en `assets/pipeline/sketchfab.lock.json`, y los originales van en `data/raw/sketchfab/`, fuera de git;
     - se usa `urllib`: la protección del API responde 202 sin cuerpo a `httpx`.
   - **Preparación en Blender 5.2** (`assets/pipeline/blender/preparar_vehiculo.py`):
     - quita las placas y los emblemas, que en estos modelos son objetos con su propio material, y anota cada uno en el manifiesto;
     - aplana la jerarquía;
     - deja el frente hacia +x, la izquierda hacia −z y las llantas sobre el piso;
     - le da a cada pieza el papel y el nombre que usa el visor (`windshield`, `headlight_l`/`headlight_r`, `bumper_front`/`bumper_rear`);
     - arma las ruedas `wheel_*` con su radio. La moto lleva su propio arreglo: sus piezas no tienen nombre y venía fuera de escala.
   - **Tres versiones** con gltf-transform 4.5.1 y KTX-Software 4.4.2:
     - completa para alta y ultra (KTX2 de 1024 px y Draco);
     - ligera para media (la mitad de los triángulos, KTX2 de 512 px);
     - para Blender (WebP, porque el video no puede leer KTX2).
   - **Baja usa el vehículo paramétrico,** sin nada que descargar: la laptop es el piso de §7.8 y baja no pierde ninguna función.
   - **`vehiculos.json`** guarda el tamaño, el SHA-256, las dimensiones, las ruedas, lo que se quitó y la atribución. `check` verifica los archivos versionados en CI, sin Blender.
   - **Draco y no meshopt:** meshopt cuantiza las posiciones y deja la escala en el nodo, lo que complica deformar y subdividir las piezas para el daño.
3. **En el visor** (`packages/viewer/src/vehicle-models.ts`):
   - **Carga:** la escena se arma de inmediato con los paramétricos y se vuelve a armar con los modelos cuando llegan, como las texturas del entorno.
   - **Ajuste a las dimensiones del caso:** la carrocería se escala en cada eje y las ruedas igual en todos, con la escala del alto, para que sigan redondas.
   - **Materiales:**
     - la pintura toma el color del caso, metálica con barniz, el mismo material del paramétrico;
     - las demás piezas conservan el material del modelo: vidrios, llantas, rines, plásticos e interior;
     - los faros y las calaveras encienden de noche.
   - **Daño en la zona narrada:**
     - es el mismo campo de desplazamiento del paramétrico;
     - antes de hornearlo, la carrocería y las defensas de los vehículos con daño se subdividen a aristas de 10 cm, porque los paneles del modelo tienen pocos vértices y el paramétrico se segmenta cada ~8 cm;
     - el parabrisas recibe coordenadas planas para dibujar la grieta.
   - **Lo que se queda igual que en el paramétrico:**
     - los restos y las defensas que se desprenden toman su tamaño de la caja de la pieza, no de un `BoxGeometry`;
     - las bolsas de aire y los vidrios laterales usan las cotas del habitáculo del paramétrico.
   - **Las clases sin modelo** siguen paramétricas: van, combi, autobús, tractocamión, bicicleta y scooter.
4. **Atribución (CC-BY):**
   - el visor expone los créditos de los modelos que se ven (`vehicleCredits`);
   - van en la leyenda del 3D, en el dictamen cuando lleva cuadros del 3D, y en la leyenda de cada cuadro del video de R11.
5. **R11:**
   - la exportación quita las texturas KTX2 de los materiales de los modelos y anota en sus extras de qué modelo y material salen;
   - el script de Blender los cambia por los del modelo con WebP (`<clase>-blender.glb`), del repositorio si el script está en él, o del sitio.
6. **El service worker no precarga los modelos** (unos 18 MB en las tres versiones) ni sus decodificadores: se piden cuando hacen falta. Sin red, el visor usa los paramétricos.

## Evidencia

- **Tamaños** (`vehiculos.json`), por versión completa / ligera / Blender:
  - sedán: 1.62 / 0.55 / 1.29 MB;
  - hatchback: 1.64 / 0.56 / 1.32 MB;
  - SUV: 1.63 / 0.54 / 1.30 MB;
  - pickup: 1.92 / 0.66 / 1.42 MB;
  - camión: 1.66 / 0.55 / 1.31 MB;
  - moto: 0.22 / 0.21 / 0.22 MB.
  - El original del sedán pesaba 7.1 MB.
- **Pruebas:**
  - el pipeline: las licencias permitidas y rechazadas, el manifiesto, los archivos versionados contra su SHA-256 y, en cada versión, las piezas, los papeles, las ruedas, sin placas ni emblemas y las extensiones;
  - el visor: el ajuste a las dimensiones, las ruedas sobre el piso, la pintura del caso, los materiales del modelo, el daño horneado en la carrocería subdividida y el parabrisas;
  - la exportación sin KTX2;
  - el dictamen con la atribución;
  - el script de Blender con los modelos y la atribución en la leyenda;
  - e2e (no bloquea): los modelos completos en alta con su atribución, los ligeros en media y ninguno en baja.
- **R11 con los modelos** (2026-10-24, `lateral_interseccion` exportada desde el visor en media):
  - el `.glb` pesa 13.2 MB y no lleva imágenes;
  - 49 materiales llevan su referencia al modelo (hatchback y pickup), y los créditos de los dos van en los extras;
  - en Blender, el script tomó los materiales con WebP del repositorio. El cuadro sale con los rines, el interior, los vidrios y las molduras del modelo, la pintura del caso, la deformación al frente y la atribución en la leyenda.
  - **En alta, sin tarjeta de video,** la exportación no terminó en 5 minutos (cada cuadro se dibuja por software). Queda para medirla en la computadora de la demo.
- **Carga en Chromium sin tarjeta de video:** 4 s en media y unos 30 s en alta, porque alta dibuja cada cuadro por software. En la computadora de la demo se mide con el botón de la computadora de la demo (E6).

## Límites

- **El paso entre ejes:**
  - la carrocería se ajusta al largo, ancho y alto del caso, pero las ruedas quedan donde el modelo tiene sus arcos;
  - si el paso entre ejes del caso es muy distinto del del modelo, las ruedas del 3D no caen exactamente donde las pone el solver;
  - la física no cambia.
- **La pintura usa el color del caso,** no la textura de pintura del modelo.
- **La moto es de campo (enduro),** no la de trabajo de 125 cc, que es la más común en México: no hubo una de trabajo con licencia libre, piezas separadas y sin marca.
- **La subdivisión para el daño cuesta tiempo** de carga en los vehículos con daño.
- **KTX-Software se instaló sin elevar permisos** (`__COMPAT_LAYER=RunAsInvoker`) en `D:\dev-cache\tools\ktx`.
