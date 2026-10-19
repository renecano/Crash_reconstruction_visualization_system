# ADR 0040 — Calles de OpenStreetMap en producción, para escenas del usuario (F8, pendiente cerrado en F11)

- **Estado:** aceptado (2026-10-19).
- **Contexto:** ADR 0023 trajo las calles reales solo para la escena canónica de Toluca, desde un extracto versionado. Faltaba el caso del usuario: que una escena tome las calles de su cruce real.

## Decisión

1. **Dónde:** el croquis tiene una sección «Calles reales (OpenStreetMap)». La persona pega las coordenadas del cruce y elige un radio (100, 150 o 200 m). No se geocodifican direcciones: se evita depender de otro servicio y de adivinar.
2. **Servidor** (`GET /api/osm?lat&lon&radio`, `src/server/osm.ts`):
   - **Validación:** valida y redondea el punto a ~1 m (5 decimales).
   - **Consulta:** la misma que los extractos (`overpassQuery`), con su User-Agent.
   - **Caché:** en Redis si está configurado (30 días) o en memoria, y en la CDN de Vercel (`Cache-Control: s-maxage` de 30 días). El mismo punto no vuelve a Overpass.
   - **Límite:** 60 consultas nuevas por hora por IP (`CROQUIS_OSM_RATE_PER_HOUR`); lo que ya está en caché no cuenta.
   - **Instancias:** las públicas de Overpass se saturan seguido, así que se prueban tres en orden, 15 s cada una (la principal y dos espejos públicos de la lista de la wiki de OSM). Si están saturadas (429 o 5xx) o no responden, se prueba la siguiente; un 4xx no se reintenta.
   - **Si ninguna responde:** 502 con un mensaje claro.
3. **Navegador** (`applyMap` en `@croquis/croquis-2d`):
   - **Origen:** el cruce de calles más cercano (a menos de 60 m, con tres brazos o más) queda en el origen, con la calle principal sobre +X.
   - **Plantilla:** tipo, sentidos, carriles y ancho de carril salen del cruce (`templateFromCrossing`), con la fuente `mapa` y la evidencia del relato que tuvieran.
   - **Red:** se guarda en `lugar.red_vial` (`redVialFrom`). Son las mismas funciones que arman la escena de Toluca, y una prueba comprueba que dan su misma red.
   - **Sin cruce cerca:** error con instrucciones, en vez de inventar una orientación.
4. **Determinismo y sin red:** la red queda dentro de la escena. Una vez traída, la escena es determinista y funciona sin conexión. Solo traerla necesita red, y la interfaz lo dice.
5. **Atribución:** la de OSM (ODbL) aparece en la leyenda del croquis, en el visor y en las exportaciones, como en ADR 0023.

## Prueba real del 2026-10-19

A las 15:06 UTC, las tres instancias públicas no respondían:

- **overpass-api.de:** «at capacity», 502, o se agotó el tiempo.
- **private.coffee:** 500, incluso con una consulta mínima.
- **mail.ru:** 504.

La ruta respondió su 502 con el mensaje esperado. **Pendiente:** repetir la prueba real cuando respondan. Ya pasó en ADR 0023, cuya primera consulta también dio «at capacity».

## Pruebas

- **`croquis-2d`:**
  - la consulta es igual a la del extracto;
  - el cruce más cercano y ninguno a más de 60 m;
  - aplicar el mapa reproduce la red y la plantilla de Toluca y conserva la evidencia.
- **Servidor:** validación, User-Agent y consulta, caché, cambio de instancia, falla de todas, 4xx sin reintento y límite por IP.
- **Navegador:** lectura de coordenadas, aplicación y validación contra el contrato, y errores.
- **e2e:** el flujo completo con `/api/osm` simulado por el extracto versionado (CI nunca llama a Overpass), y el caso sin cruce.
