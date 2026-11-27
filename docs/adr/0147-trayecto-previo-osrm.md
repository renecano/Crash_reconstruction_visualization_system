# ADR 0147 · El trayecto previo ilustrativo: la ruta por las calles con OSRM

- **Fecha:** 2026-11-27
- **Estado:** aceptada.
- **Pedido:** René, para la demo con CESVI: «los peritos quieren ver el choque desde donde venía cada vehículo, a veces desde unos kilómetros antes… el recorrido sigue las calles reales (ruta sobre el grafo de OSM, respetando sentidos)… hasta ~5 km».

## Decisión

1. **La ruta la traza OSRM sobre OpenStreetMap**, con el perfil de auto: respeta los sentidos únicos y las vueltas prohibidas. Va por un Route Handler (`/api/ruta`, `apps/web/src/server/ruta.ts`):
   - con caché de 30 días en Redis o en memoria, más la CDN de Vercel;
   - con el mismo limitador por cliente que `/api/osm` (60 por hora);
   - con el User-Agent del proyecto;
   - con tope de 5.5 km por las calles; más largo, el perito ve un aviso y marca más cerca.
   - **Por qué no Overpass y un Dijkstra propio:** `/api/osm` admite 300 m de radio. Una caja de 5 km en la Ciudad de México trae decenas de miles de vías, varios MB y unos 40 s de Overpass cuando está saturado (lo estuvo el 2026-11-27). OSRM responde en menos de un segundo con la ruta ya hecha.
   - **Lo que se acepta:** el servidor público de OSRM es de demostración (una consulta por segundo, sin garantía). Para la demo y la ronda alcanza; si se usa más, se cambia a un OSRM propio o a otro enrutador sobre OSM sin cambiar el contrato.
2. **El punto de inicio va con el caso, fuera del expediente** (`trayectos_previos` en el archivo `.croquis`). No entra a `escena.schema.json`, al solver ni a ninguna cifra.
3. **El perfil de velocidad** (`apps/web/src/lib/trayecto-previo.ts`):
   - la velocidad reconstruida antes del impacto, nunca más;
   - en cada curva, a lo más √(a_lat · R) con a_lat = 0.35 g, el extremo bajo de la aceleración lateral cómoda con que los conductores eligen su velocidad en curvas cerradas («Automobiles on Horizontal Curves: Experiments and Observations», TRR 1628, doi 10.3141/1628-07);
   - frena a 3.4 m/s², la tasa que AASHTO toma como cómoda para la mayoría de los conductores;
   - arranca a 1.5 m/s², un **supuesto ilustrativo sin fuente** (en «Endurecimiento pendiente»).

   Termina en el primer punto de la reconstrucción, a su velocidad y en su instante.

4. **En el paquete caso-3d** va como `escenario.vehiculos[].trayecto_previo` (contrato #375; `docs/contrato-unity.md` §4). Unity lo recorre antes de `t_inicio`, con la ruta punteada y el letrero «Trayecto ilustrativo: no es evidencia» (#377).

## Consecuencias

- Sin red o sin ruta, el 3D va como siempre: no se inventa un trayecto en línea recta.
- La e2e de CI usa una ruta grabada de OSRM (`apps/web/e2e/datos/ruta-crucero.json`): CI no llama a servicios externos.
