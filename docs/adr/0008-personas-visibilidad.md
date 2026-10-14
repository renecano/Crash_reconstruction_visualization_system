# ADR 0008 — Personas, ocupantes, visibilidad y volcadura (F5)

- **Estado:** aceptado (2026-10-13, F5)
- **Contexto:** PLAN §7.4 pide cuerpos de MakeHuman/MPFB con variación por edad, estatura y complexión, animaciones (caminar, de pie, manejar), ragdolls Rapier con límites articulares y zonas de contacto neutras. §6.1.6–6.1.9 piden la volcadura (criterio de inicio y secuencia ilustrativa), la proyección de peatones y ciclistas con un ragdoll calibrado contra Searle, la cinemática de ocupantes sin lesiones y la visibilidad desde el ojo de cada conductor. Criterio de F5: ragdoll dentro de los límites de Searle en ≥ 95 % de corridas con semilla, E4 corrido y visibilidad probada en la escena del árbol.

## Decisiones

1. **Cuerpos de MakeHuman sin Blender.** La malla base, los _macro targets_, el rig `default` y sus pesos están en el repositorio oficial `makehumancommunity/makehuman` (carpeta `makehuman/data`) bajo CC0 1.0 (`LICENSE.ASSETS.md`). El pipeline `assets/pipeline` (Python, NumPy):
   - **Descarga:** baja 52 archivos de un commit fijo y los verifica con un candado SHA-256.
   - **Forma:** combina los _targets_ con el algoritmo de MakeHuman (peso = producto de los factores de su nombre, copiado de `apps/human.py` y `apps/humanmodifier.py`).
   - **Esqueleto:** reduce el rig de 163 huesos a 16 segmentos sumando pesos.
   - **Salida:** escribe un glTF por variante (niñez, adultez y vejez; 762 KB cada uno, normales cuantizadas con `KHR_mesh_quantization`) más un manifiesto con articulaciones, radios y fracciones de masa.
   - **Reproducibilidad:** CI descarga los insumos y reconstruye byte a byte (`croquis-assets humans check`).

   No se usa Blender ni MPFB: no hacen falta para estos pasos y evitan una dependencia pesada en una laptop de 8 GB. Los vehículos ya eran paramétricos (ADR 0005).

2. **Sin suponer sexo ni etnia.** El contrato no los registra (privacidad), así que los cuerpos usan sexo 0.5 y las tres etnias a 1/3.
   - **Edad:** elige la variante.
   - **Complexión:** sale del IMC (masa y estatura del relato; cortes de la OMS en adultos) y se aplica como dos _morph targets_.
   - **Estatura:** se ajusta por escala.
   - **Apariencia:** ropa neutra por regiones de la malla (camisa, pantalón, zapatos, cabello) y sin anatomía sexual (la malla base 1.1 no la trae). La paleta de camisas evita tonos que se confundan con la piel.
3. **Posturas por direcciones de segmento** (cinemática directa sobre un esqueleto con rotaciones de reposo nulas):
   - **Marcha:** curvas de cadera, rodilla y tobillo con puntos de control de las curvas normativas de Winter (2009), Catmull-Rom periódica, y cadencia desde la velocidad del solver con paso de 0.415 × estatura (**supuesto**).
   - **Otras posturas:** de pie, al volante, de copiloto o pasajero y montado.
   - **Ocupantes:** inclinan el torso según el desplazamiento del solver.

   Se eligió esto en lugar de captura de movimiento porque las curvas normativas tienen fuente, son deterministas y se aplican directo al esqueleto reducido; una captura exigiría reajustarla (_retargeting_) a ese esqueleto.

4. **Ragdoll Rapier con límites articulares propios.**
   - **Cuerpos:** 16 segmentos con cápsulas y masas de Winter (tabla 4.1).
   - **Articulaciones:** esféricas con fricción articular (motores de velocidad cero).
   - **Límites:** rangos AAOS en cadera, rodilla, hombro y codo (tabla suplementaria de Hendriks et al. 2020) y supuestos en columna, cuello, muñeca y tobillo. Rapier JS no tiene límites en articulaciones esféricas (y crea la esférica como genérica, sin exponer sus motores en la clase JS, así que se configuran por el conjunto crudo), así que tras cada paso este módulo descompone la rotación relativa en balanceo y torsión y corrige la velocidad angular relativa hacia el rango, de forma determinista.
   - **Arranque:** la persona sale en t = 0 con la velocidad de lanzamiento del solver y un giro de cabeceo.
   - **Calibración:** un factor k sobre esa velocidad se ajusta por secante para que el centro de masa termine a la distancia del solver.
   - **Colisiones:** el ragdoll **no vuelve a chocar con los vehículos de su evento**, porque su interacción ya está en la velocidad de lanzamiento (con el auto cinemático incluido se contaba dos veces la transferencia de momento y la calibración perdía sensibilidad). Con los demás vehículos y objetos sí choca.
   - **Horneado:** se hace al cargar, igual que los restos (ADR 0007).
5. **Criterio y evaluación (`eval/js/ragdoll_searle.ts`).** Se mide en las escenas canónicas (50 semillas cada una) y en un barrido sintético (20–70 km/h, tres cuerpos, 20 semillas por combinación). El objetivo y la banda del barrido salen del port TS del solver, con paridad probada. La alternativa simple es el ragdoll sin calibrar (k = 1). Como la calibración apunta al centro de la banda, su tasa es alta casi por construcción; la cifra informativa es la del ragdoll sin calibrar y la cercanía de k a 1.
6. **Ocupantes por cinemática relativa con fuentes y supuestos declarados.**
   - **Pulso:** media onda senoidal con ΔV y duración 2C/ΔV.
   - **Sin cinturón:** espacio de vuelo de Michie (MASH).
   - **Con cinturón:** holgura más resorte amortiguado (supuestos).
   - **Contacto:** zona y velocidad relativa al tocar el interior.
   - **Sin lesiones:** no se estima ninguna lesión (§16.2). Sin dato de cinturón se muestran ambas variantes.
   - **Visor:** marca la zona con un aro neutro.
7. **Visibilidad en el solver, geometría compartida.** El solver (referencia) calcula la geometría de los objetos del entorno (`scene_objects.py`, mismo hash FNV-1a que el visor) y la publica en `resultado.objetos`. El visor dibuja, choca y analiza con ella.
   - **Línea de vista:** 2.5D con oclusores exactos (cilindros, esferas y cajas) y los vehículos en movimiento.
   - **Ojo:** alturas AASHTO.
   - **Noche:** alcance y cono de faros.
   - **Clima:** visibilidad meteorológica declarada.
   - **Visor:** líneas de vista y aros de color en la cámara del conductor (verde si se veía, naranja si algo lo tapaba) y contorno del oclusor.
   - **Lenguaje:** describe líneas de vista y distancias; no dice si el percance era evitable ni asigna responsabilidad (PLAN §10).
8. **Volcadura: criterio físico en el solver, vueltas ilustrativas en el visor.** El solver evalúa el tropiezo con la velocidad crítica de deslizamiento (SSF) y marca la inconsistencia si el relato dice que se volcó y la física no alcanza. Esto pasa en `volcadura`, porque la fase previa no modela deslizamiento lateral. El visor simula la secuencia con Rapier desde el giro alrededor de la arista del tropiezo, con la velocidad de alabeo del solver o, si solo el relato la declara, la mínima que la produce con un 25 % de margen. Se etiqueta como ilustrativa y desde el tropiezo no se dibujan marcas de la trayectoria plana.
9. **Resultado 1.2.0.** Agrega:
   - `personas[].ocupante`;
   - la proyección ampliada: banda de Searle, fricción, ángulo, altura del centro de masa y rumbo;
   - las fases `montado`;
   - los eventos `proyeccion` y `volcadura`;
   - `vehiculos[].volcadura`, `objetos` y `visibilidad`;
   - los parámetros nuevos con su fuente.
10. **Fixtures corregidos con sus relatos.** En `peaton_cruce` el peatón arranca en la banqueta sur, junto al frente del camión estacionado ("salió de atrás de un camión"). En `frontal_curva` la vegetación pasa al interior real de la curva (al sur, porque la curva es a la izquierda para A) y son tres árboles. Las posiciones eran supuestos; no se tocaron datos del relato.

11. **Rendimiento sin bajar calidad (E6).** Con personas, el visor quedó debajo de 60 fps en `glorieta` en calidad media. El perfil mostró dos límites.
    - **CPU por objeto dibujado:** el hilo principal casi nunca descansa en `updateForRender` y `_renderObjectDirect` de three.js. Se resolvió así:
      - los ocupantes no proyectan sombra (la da la carrocería);
      - rines, faros, calaveras y vidrios salen del pase de sombras;
      - cada rueda es una sola malla, con un material que elige entre llanta y rin por vértice;
      - todos los aros de contacto son una `InstancedMesh`;
      - las posturas se recalculan solo cuando cambian.
    - **Relleno en `glorieta`:** los fps se duplican a media resolución. Se resolvió así:
      - el pasto se dibuja después de lo que lo tapa;
      - la vía se parte en la zona que toca el cuadrado de la cámara de sombra del sol y la que no; la segunda se dibuja sin muestrear el mapa de sombras, porque ahí ninguna sombra puede caer.

    La imagen es la misma: CI compara las 20 capturas. El protocolo de E6 alterna el orden de las escenas entre repeticiones y deja una pausa entre mediciones, porque la laptop se calienta y la última escena de cada calidad se medía siempre en peores condiciones.

## Consecuencias

- El port TS completo (F9) debe reproducir `occupant`, `visibility`, `rollover`, `scene_objects` y la proyección de jinetes; la de Searle ya está con paridad.
- Las capturas de referencia cambian (personas visibles); CI las regenera.
- Pendientes declarados en `docs/PROGRESS.md`: campo visual (pilares, espejos) y deslumbramiento en la visibilidad, deslizamiento lateral en la fase previa (para que la volcadura salga del criterio), calibrar los parámetros del cinturón con datos de pruebas cuando sean accesibles y validar la volcadura 3D (E5 con BeamNG, F10).
