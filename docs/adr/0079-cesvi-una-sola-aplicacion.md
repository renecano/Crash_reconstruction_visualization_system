# ADR 0079 — /cesvi como una sola aplicación

- **Estado:** aceptado (2026-10-23).
- **Contexto:**
  - **El pedido de René (2026-10-23):** unificar `/cesvi`. Una lista de casos; todo caso (nuevo, importado o de ejemplo) en el mismo recorrido de pasos, con Presentar / Trabajar y los temas; el caso de AXA como caso de ejemplo; «Reproducción de reportes» como página de evidencia; las rutas viejas redirigen.
  - **Lo que había:**
    - el recorrido de 8 pasos de AXA en `/cesvi`;
    - «Caso nuevo» (`/cesvi/caso`) como una página larga aparte;
    - «Cargar un reporte» (`/cesvi/importar`), que abría esa misma página larga;
    - cada reporte de la reproducción (`/cesvi/reproduccion/[id]`) con una vista propia.
  - Eran dos flujos distintos.

## Decisión

1. **`/cesvi` es la lista de casos** (`components/cesvi/lista-casos.tsx`):
   - «Caso nuevo» y «Cargar un reporte»;
   - los casos guardados en este equipo;
   - los de ejemplo: AXA A2010930, los primeros 6 reportes de la reproducción y el enlace a los 205.
2. **Rutas** (`lib/casos.ts`, `RUTAS`):
   - `/cesvi/casos/a2010930` (AXA);
   - `/cesvi/casos/nuevo`;
   - `/cesvi/casos/importar`;
   - `/cesvi/casos/reporte/[id]` (se generan al construir);
   - `/cesvi/casos/guardado/[id]`.
     `/cesvi/caso`, `/cesvi/importar` y `/cesvi/reproduccion/[id]` redirigen a las nuevas (`next.config.ts`).
3. **La misma barra y los mismos pasos para todo caso** (`recorrido/barra.tsx`):
   - la marca vuelve a la lista;
   - los pasos al presentar;
   - Presentar / Trabajar, el tema y «Exportar».
     AXA la usa con sus acciones propias (estado de la IA, «Llenar a mano», «Deshacer») y conserva todo lo que mostraba.
4. **Los casos de expediente** (nuevo, importado, de la reproducción o guardado) usan `caso/recorrido-caso.tsx`, con los pasos de AXA llenos con lo que hacía «Caso nuevo»:
   1. **El caso:** la carga del reporte o abrir un archivo de caso.
   2. **El hecho:** la narración, lo que leyó Croquis y las preguntas.
   3. **El lugar:** el vehículo, la fase y el rumbo; se coloca tocando el mapa.
   4. **La reconstrucción:** el solver, las velocidades con rango, carambolas, el 3D y la declaración del conductor.
   5. **Los daños:** los narrados, y la cara, C1–C6, la energía y Δv que calcula la reconstrucción.
   6. **Los números:** las velocidades y la verificación con el método de CESVI.
   7. **Croquis contra el reporte de CESVI**, solo si el caso tiene reporte. Usa `comparar()` de E-R4: modalidad, zonas, primer impacto, posiciones y velocidades con su diferencia y su porcentaje.
   8. **El dictamen:** PDF y Word, «Guardar en este equipo» y «Descargar el archivo del caso».
5. **El escenario:**
   - el mapa se queda montado todo el recorrido, para que el dictamen tome el croquis sobre las calles (ADR 0074);
   - el 3D, una vez abierto, se queda montado detrás del mapa, para los cuadros del dictamen;
   - se cambia entre los dos con «Mapa» y «3D».
6. **Los casos guardados viven en el navegador del perito** (`localStorage`), con el mismo archivo de caso (ADR 0075):
   - el archivo gana `titulo` y `reporte_cesvi` opcionales, así que un reporte importado guarda lo que concluyó CESVI (límite de ADR 0075);
   - la lista se lee con `useSyncExternalStore`;
   - nada va a un servidor.
7. **«Reproducción de reportes» sigue como página de evidencia;** cada renglón abre su caso en el recorrido.
8. **Los 205 casos de la reproducción no entran al código del navegador:** los nombres de modalidades y caras están en `lib/nombres-cesvi.ts`, y cada página de reporte recibe solo su caso.

## Pruebas

- **Unitarias:**
  - el catálogo (rutas, el caso de un reporte, guardar, listar, abrir y borrar en este equipo, un almacén dañado);
  - el marco con sus dos secciones;
  - el caso guardado con su reporte.
- **e2e `@flujo` en Chromium:**
  - AXA abierto desde la lista y recorrido hasta el PDF;
  - un caso nuevo desde la lista, del hecho al dictamen (PDF y Word), guardado en este equipo, vuelto a abrir desde la lista y desde su archivo;
  - una carambola;
  - cargar un reporte en PDF y recorrerlo hasta «Croquis contra el reporte de CESVI»;
  - la reproducción, un reporte abierto en el recorrido y las redirecciones.

## Límites

- **AXA conserva su propio modelo** (`CasoCesvi`, las dos versiones y la reproducción de los cálculos del reporte) dentro de la misma barra y los mismos pasos.
  - Llevarlo a un expediente genérico (`expedienteDelRecorrido` ya lo arma para el 3D) perdería lo que muestra hoy.
- **Los casos guardados están en un solo navegador.** Para llevarlos a otro equipo está el archivo del caso.
