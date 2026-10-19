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
   - **Instancias:** las públicas de Overpass se saturan seguido. Se prueban las tres globales sin llave de la lista de la wiki de OSM: la principal y dos espejos. Si una está saturada (429 o 5xx) o no responde, se prueba la siguiente; un 4xx no se reintenta.
   - **Orden y esperas** (revisados con lo medido; ver «Prueba real»):
     - VK Maps (mail.ru) va primero, hasta 15 s;
     - la principal, hasta 45 s;
     - private.coffee, hasta 15 s.
   - **Vueltas:** hasta dos, con 50 s en total para quedar dentro del límite de 60 s de la función.
   - **Diagnóstico:** la respuesta dice qué instancia contestó (`X-Croquis-Overpass`).
   - **Si ninguna responde:** 502 con un mensaje claro.
3. **Navegador** (`applyMap` en `@croquis/croquis-2d`):
   - **Origen:** el cruce de calles más cercano (a menos de 60 m, con tres brazos o más) queda en el origen, con la calle principal sobre +X.
   - **Plantilla:** tipo, sentidos, carriles y ancho de carril salen del cruce (`templateFromCrossing`), con la fuente `mapa` y la evidencia del relato que tuvieran.
   - **Red:** se guarda en `lugar.red_vial` (`redVialFrom`). Son las mismas funciones que arman la escena de Toluca, y una prueba comprueba que dan su misma red.
   - **Sin cruce cerca:** error con instrucciones, en vez de inventar una orientación.
4. **Determinismo y sin red:** la red queda dentro de la escena. Una vez traída, la escena es determinista y funciona sin conexión. Solo traerla necesita red, y la interfaz lo dice.
5. **Atribución:** la de OSM (ODbL) aparece en la leyenda del croquis, en el visor y en las exportaciones, como en ADR 0023.

## Prueba real del 2026-10-19

Los resultados están en `eval/results/`. Salen de dos scripts que no corren en CI:

- `eval/osm_produccion.mjs` pide las calles de Toluca a la ruta en producción y las compara con el extracto versionado.
- `eval/osm_instancias.mjs` manda la misma consulta una vez a cada instancia.

1. **15:06 UTC, en local:** las tres instancias fallaban (502, 500 y 504 o sin respuesta). La ruta respondió su 502 con el mensaje esperado.
2. **Producción, primera versión de la ruta** (tres instancias, 15 s cada una, una vuelta):
   - **Radio 150 m** (`osm_produccion_v1_r150.json`):
     - la respuesta coincide elemento por elemento con el extracto versionado: 22 calles y 80 elementos;
     - la segunda petición salió de la CDN (`X-Vercel-Cache: HIT`);
     - la primera salió de la caché del servidor, porque una petición anterior ya había traído ese punto.
   - **Radio 149 m** (`osm_produccion_v1_r149.json`): dos 502 seguidos.
   - **Radio 148 m** (`osm_produccion_v1_r148.json`): un 502 a los 32.34 s, y el segundo intento inmediato llegó a Overpass y dio 200 a los 44.23 s, con las mismas 22 calles del extracto. Las fallas son intermitentes.
   - **Segunda versión del script, radio 147 m** (`osm_produccion_v2_r147.json`): tres intentos, tres 502.
3. **Cada instancia, desde esta máquina** (`osm_instancias_1.json` y `osm_instancias_2.json`):

   | Instancia      | Primera medición      | Segunda medición      |
   | -------------- | --------------------- | --------------------- |
   | Principal      | 200 a los 40.93 s     | 200 a los 42.59 s     |
   | VK Maps        | 504 a los 1.06 s      | 200 a los 13.36 s     |
   | private.coffee | Sin respuesta en 60 s | Sin respuesta en 60 s |

   La principal no estaba caída, sino encolando: con 15 s de espera, la ruta la cortaba antes de que respondiera. De ahí el orden y las esperas actuales.

4. **Producción, ruta nueva** (orden y esperas de arriba, dos vueltas en 50 s):
   - **Radio 146 m** (`osm_produccion_v3_r146.json`): 200 al primer intento, a los 45.87 s, desde VK Maps; la repetición salió de la CDN.
     - Faltan dos calles del extracto, a 146.7 m y 147.7 m del punto: quedan fuera del radio, y no llegó ninguna que no esté en el extracto.
     - El criterio del script se corrigió para comparar por radio con la geometría del extracto, en vez de exigir el extracto completo.
   - **Radio 145 m** (`osm_produccion_v3_r145.json`): tres intentos y tres 502, a los 50.74 s, 50.64 s y 32.85 s. La ruta agotó sus vueltas y su tiempo como se diseñó.

**Conclusión:** la ruta funciona contra Overpass real y trae las calles correctas, pero las instancias públicas fallan seguido: hay que contar con que a veces la persona tenga que volver a intentar, y la interfaz se lo dice.

**Opción para más disponibilidad:** NextGIS ofrece una instancia global sin pago, pero pide cuenta y llave, y eso solo lo puede dar René.

## Pruebas

- **`croquis-2d`:**
  - la consulta es igual a la del extracto;
  - el cruce más cercano y ninguno a más de 60 m;
  - aplicar el mapa reproduce la red y la plantilla de Toluca y conserva la evidencia.
- **Servidor:** validación, User-Agent y consulta, caché, cambio de instancia, segunda vuelta, tiempo total, falla de todas, 4xx sin reintento y límite por IP.
- **Navegador:** lectura de coordenadas, aplicación y validación contra el contrato, y errores.
- **e2e:** el flujo completo con `/api/osm` simulado por el extracto versionado (CI nunca llama a Overpass), y el caso sin cruce.
