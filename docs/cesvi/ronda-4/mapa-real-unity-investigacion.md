# Modo «mapa real» en el visor Unity: investigación (anexo)

> Anexo de `mapa-real-unity.md` (ronda 4, punto 9). Lo escribió un agente de investigación el 2026-11-18; la propuesta y la recomendación están en el otro documento. Las mediciones propias que valen son las de `eval/results/ronda4_mapa_real_datos.json` (`eval/ronda4_mapa_real_datos.mjs`): la foto de Esri se repitió ahí en 12 puntos y los edificios se contaron en las teselas de OpenFreeMap. El conteo con Overpass que hizo el agente no se pudo repetir (el servicio estaba saturado) y se quitó de este anexo.

Fecha: 2026-11-18. Solo lectura y búsqueda en la web. No se tocó el repositorio, no se corrió Unity, ni builds, ni pruebas.

**Este documento no recomienda.** Compara, cita y deja las preguntas para decidir.

## Cómo leer las marcas

- **[V]** Verificado hoy en la fuente oficial (leí el texto de la página o del PDF).
- **[M]** Medido ese día por el agente con una consulta pública. Lo que se repitió con un script del repositorio está en `eval/results/ronda4_mapa_real_datos.json`.
- **[I]** Inferido por mí a partir de lo verificado. No lo dice ninguna fuente tal cual.
- **[T]** De terceros (foros, blogs, artículos). No es fuente oficial.
- **[NV]** No verificado. Está en la lista del final.

---

## 0. Lo que más pesa, en corto

1. **Cesium for Unity sí compila a Web, pero es experimental y obliga a encender hilos.** Eso cambia el build de Unity y los encabezados HTTP de todo el sitio. Hoy el proyecto tiene los hilos apagados (`webGLThreadsSupport: 0`). [V]
2. **Google no deja guardar nada.** Ni caché, ni uso sin red, ni captura en documentos. La demo local sin internet queda fuera con Google, y las fotos del dictamen también. [V]
3. **Google 3D sale barato en dinero:** 1 000 cargas al mes gratis y 6 USD por cada 1 000 después. El costo real es el esfuerzo y las restricciones, no la factura. [V]
4. **La foto satelital de Esri en México es buena y reciente:** 0.31–0.5 m por pixel y fechas de 2025–2026 en los diez puntos que medí, incluidas tres carreteras rurales. Pero su exactitud declarada es de 5 a 8.47 m. [M]
5. **Solo OpenStreetMap (y, en principio, INEGI) permite caché, uso sin red, PDF y video sin pedir permiso.** Todos los comerciales lo limitan o lo prohíben. [V]
6. **Los edificios de OSM en México están incompletos y casi sin alturas.** Fuera de los centros hay muy pocas huellas; las cifras medidas están en `eval/results/ronda4_mapa_real_datos.json`. Las alturas de Microsoft no cubren el centro del país. [M]
7. **No pude saber qué ciudades mexicanas tienen fotogrametría 3D de Google.** La cobertura oficial es un mapa interactivo, no una lista. [NV]

---

## 1. Con qué se trabaja hoy (del repositorio)

| Dato                  | Valor                                                                                                    | Archivo                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Unity                 | 6000.3.28f1 (Unity 6.3 LTS)                                                                              | `apps/visor-unity/ProjectSettings/ProjectVersion.txt` |
| Render                | URP 17.3.0                                                                                               | `apps/visor-unity/Packages/manifest.json`             |
| Carga de modelos      | glTFast 6.20.0, Draco 5.6.0, KTX 3.8.0                                                                   | mismo                                                 |
| Red desde Unity       | módulos `unitywebrequest` y `unitywebrequesttexture` ya incluidos                                        | mismo                                                 |
| Hilos en Web          | **apagados** (`webGLThreadsSupport: 0`)                                                                  | `ProjectSettings.asset` línea 585                     |
| Memoria Web           | inicial 32 MB, máxima 2 048 MB                                                                           | `ProjectSettings.asset` líneas 587–588                |
| Encabezados COOP/COEP | no hay ninguno en `apps/web/next.config.ts`                                                              | búsqueda en el repo                                   |
| Puente                | versión 1.2.0; `cargarCaso` lleva el paquete caso-3d como texto; `captura` devuelve PNG en base64        | `packages/scene-schema/visor-puente.md`               |
| Origen geográfico     | el caso-3d ya trae `OrigenRelieve` con `lat`, `lon`, `x`, `y`                                            | `packages/scene-schema/caso3d.schema.json`            |
| Edificios             | `EdificioEscenario` es una caja (`x`, `y`, `largo_m`, `fondo_m`, `alto_m`, `rumbo_rad`…), no un polígono | mismo                                                 |
| Mapa en la web        | MapLibre con teselas vectoriales de OpenFreeMap; Nominatim y Photon; Overpass con tres instancias        | `apps/web/src/server/osm.ts`, `lugar.ts`              |
| Overpass              | la consulta actual **no** pide edificios (no aparece `building` en `packages/croquis-2d/src`)            | búsqueda en el repo                                   |
| Demo local            | `CORRER-DEMO-LOCAL.bat`; una e2e la prueba con la red de afuera cortada                                  | `docs/adr/0120-uso-de-vercel-y-demo-local.md`         |

Nota de presupuesto: el encargo habla de Vercel Pro (20 USD al mes). El ADR 0120, del 17 de noviembre, describe los límites de Hobby (10 GB de Blob). No lo aclaré; no cambia los costos de proveedores de este documento.

Consecuencias directas:

- El modo nuevo necesita un cambio de contrato (`caso3d.schema.json` y puente 1.3.0). Es un PR `contract:`.
- Ya existe un origen con latitud y longitud. No hay que inventar la georreferencia.
- Las fotos del dictamen salen de Unity con `capturar`. Lo que esté en pantalla en ese momento termina en un PDF. Esto choca con varias licencias (ver cada opción).

---

## 2. Supuestos de cálculo

**Zona:** 300 m de radio = un cuadro de 600 × 600 m.

**Teselas ráster de 256 px** (cálculo propio, latitud 19.3°, Web Mercator) [I]:

| Zoom | Ancho de tesela | Metros por pixel | Teselas para 600 × 600 m |
| ---- | --------------- | ---------------- | ------------------------ |
| 18   | 144.3 m         | 0.56             | 25 a 36                  |
| 19   | 72.1 m          | 0.28             | 81 a 100                 |
| 20   | 36.1 m          | 0.14             | 289 a 324                |

- **Supuesto base: 100 teselas por carga (zoom 19).** Es el zoom que iguala la resolución real de las imágenes en México (0.3–0.5 m). Pedir zoom 20 no agrega detalle donde la fuente es de 0.3 m.
- **Supuesto alto: 324 teselas (zoom 20).** Lo doy donde cambia el precio.
- **Sin caché entre cargas.** Cada carga vuelve a pedir todo. Es el peor caso, y además es lo que exigen las licencias que prohíben guardar.
- **Teselas 3D:** Google cobra por petición del `root.json`, no por tesela. **1 carga de escena = 1 petición raíz.** Recargar la página cuenta otra vez. [V]
- **Volúmenes:** 100, 1 000 y 10 000 cargas al mes.

---

## 3. A1 · Mapa de OpenStreetMap como piso

### 3.1 Proveedor y producto

- **OpenFreeMap**, instancia pública. Teselas vectoriales, esquema OpenMapTiles. Es lo que la web ya usa. https://openfreemap.org/
- Alternativa: **teselas ráster de `tile.openstreetmap.org`**. https://operations.osmfoundation.org/policies/tiles/
- Datos: OpenStreetMap, licencia ODbL. https://www.openstreetmap.org/copyright

### 3.2 Costo

- OpenFreeMap: **0 USD en los tres volúmenes.** [V]
  > «Using our public instance is completely free: there are no limits on the number of map views or requests. There's no registration, no user database, no API keys, and no cookies.» — https://openfreemap.org/
- Uso comercial permitido: «Is commercial usage allowed? Yes.» [V]
- Sin garantía de servicio: «THE SITE IS PROVIDED "AS-IS"…» y «may discontinue it at any time without notice». [V] https://openfreemap.org/tos/ (actualizado el 14 de octubre de 2026)
- Teselas por carga: de 1 a 4 teselas vectoriales (zoom 14, unos 2.3 km por tesela). [I]

### 3.3 Licencia

- **Atribución obligatoria.** [V]
  > «Attribution is required. If you are using MapLibre, they are automatically added, you have nothing to do. If you are using alternative clients, or if you are using this in printed media or video, you must add the following attribution: OpenFreeMap © OpenMapTiles Data from OpenStreetMap. You do not need to display the OpenFreeMap part, but it is nice if you do.» — https://openfreemap.org/
- **Sin red: sí, con tope.** [V]
  > «Your app may let users download areas for offline use if each download is: at most 3,000 tiles or 50 MB; made with at most 4 parallel requests; sent with a unique User-Agent identifying your app.» — https://openfreemap.org/tos/
- **PDF, imagen fija y video: sí, con atribución.** [V]
  > «Static images must be generally attributed the same way as interactive maps. However, if multiple static images appear on the same document, one instance of attribution is sufficient.» — https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
  - La misma guía tiene apartados para libros, video y «Computer games and simulations». [V]
  - Excepción útil: «static images of areas less than 10,000 m2 do not require attribution». Nuestra zona mide 360 000 m², así que sí lleva. [V]
- **Fuera de un mapa del proveedor: sí.** La ODbL no ata los datos a un visor. [V]
- **Repo público:** los datos se pueden guardar y redistribuir con atribución. Una base derivada (teselas vectoriales recortadas) hereda la ODbL. [I]
- **Uso pericial o legal:** no encontré ninguna cláusula que lo restrinja. Tampoco hay garantía de exactitud. [V]
- **Las teselas ráster de `tile.openstreetmap.org` no sirven para esto.** [V]
  > Prohibido: «Bulk download ("scrape") tiles or offer prefetch features.» … «Availability is best-effort: there is no SLA or guarantee.» — https://operations.osmfoundation.org/policies/tiles/

### 3.4 Cómo llega a Unity WebGL

Tres caminos [I]:

1. **La web dibuja y manda la imagen.** MapLibre ya está en la página con su estilo (`estilo-mapa-escena.ts`). Se dibuja el cuadro en un lienzo fuera de pantalla, se saca un PNG y se pasa a Unity por el puente. Unity lo pone como textura en un plano. No hay CORS que resolver ni llaves.
2. **Unity pide las teselas** con `UnityWebRequest`. OpenFreeMap contesta `access-control-allow-origin: *` [M], así que funcionaría. Pero Unity tendría que dibujar teselas vectoriales, y eso es mucho más trabajo.
3. **Escritorio:** Unity no tiene MapLibre. O recibe el PNG ya hecho (de la web o de la demo local), o pide ráster a otro servicio.

Tamaño de la textura [I]: 2 048 px para 600 m da 0.29 m por pixel y ocupa unos 16 MB sin comprimir. 4 096 px da 0.15 m y ocupa unos 64 MB. El tope de memoria Web hoy es 2 048 MB.

### 3.5 Calidad en México

- Las **calles** ya salen de OSM en el modo procedural. El piso de mapa agrega: huellas de edificios en planta, uso de suelo, nombres de calles, parques, agua.
- Las huellas de edificios están muy incompletas fuera de los centros (ver §6.5). [M]
- Las teselas vectoriales llegan a zoom 14 (`maxzoom: 14` en su TileJSON). [M] Más cerca, se estiran. La precisión geométrica es de unos 0.6 m por unidad de tesela. [I]
- **No trae fotos:** ni carriles pintados, ni topes, ni árboles reales.

### 3.6 Esfuerzo y riesgos

- **3 a 5 días** [I]: contrato (campo de piso en caso-3d y puente 1.3.0), dibujo fuera de pantalla en la web, plano con textura en Unity que apaga el entorno procedural, atribución, caché de la demo local, una e2e.
- Riesgos: aporta poco sobre lo que ya hay (las calles reales ya están). La instancia pública puede caerse sin aviso.
- **Demo sin internet: sí.** El PNG o las teselas de cada caso de demo se guardan con el caso.

---

## 4. A2 · Foto satelital como piso

Para las cuatro opciones comerciales, el camino a Unity es el mismo [I]:

- **Web:** la página (o Unity con `UnityWebRequestTexture`) pide las teselas directo al proveedor. En WebGL esto pasa por `fetch`, así que el proveedor debe permitir CORS.
- **CORS medido hoy** con `Origin: https://example.org` [M]:
  - Google `tile.googleapis.com`: devuelve `Access-Control-Allow-Origin` con el origen (aun en el 403 sin llave).
  - Esri `server.arcgisonline.com` e `ibasemaps-api.arcgis.com`: `Access-Control-Allow-Origin: *`.
  - MapTiler: `Access-Control-Allow-Origin: *`.
  - Mapbox: el 401 sin llave no trae el encabezado. Con llave válida no lo pude probar. [NV]
- **Proxy en Vercel:** Mapbox y MapTiler lo prohíben por contrato (citas abajo). Con Google y Esri no hace falta: la llave se restringe por dominio.
- **Escritorio:** no hay dominio que restringir. La llave quedaría dentro del ejecutable. [I]

### 4.1 Google · Map Tiles API, teselas 2D satelitales

**Producto.** Map Tiles API, `mapType: satellite`. Requiere un token de sesión (dura dos semanas). https://developers.google.com/maps/documentation/tile/session_tokens [V]

**Costo.** Lista global vigente, página actualizada el 2026-11-17. https://developers.google.com/maps/billing-and-pricing/pricing [V]

| SKU «Map Tiles API: 2D Map Tiles» (Essentials) | USD por 1 000   |
| ---------------------------------------------- | --------------- |
| Gratis al mes                                  | 100 000 teselas |
| Hasta 1 000 000                                | 0.60            |
| 1 000 001 – 5 000 000                          | 0.48            |
| 5 000 001 – 10 000 000                         | 0.36            |

| Cargas al mes | 100 teselas (zoom 19)                  | 324 teselas (zoom 20)        |
| ------------- | -------------------------------------- | ---------------------------- |
| 100           | 10 000 → **0 USD**                     | 32 400 → **0 USD**           |
| 1 000         | 100 000 → **0 USD** (justo en el tope) | 324 000 → **134.40 USD**     |
| 10 000        | 1 000 000 → **540 USD**                | 3 240 000 → **1 615.20 USD** |

- **Cuota diaria por omisión: 15 000 teselas 2D por proyecto.** [V] Con 100 teselas son 150 cargas al día. Para 10 000 cargas al mes hay que pedir aumento.
  > «Maximum 15,000 2D Tile, Street View Tile, Thumbnail, or Street View PanoID queries per project per day.» — https://developers.google.com/maps/documentation/tile/usage-and-billing
- Se puede fijar un tope diario propio para no pasar nunca de lo gratis. [V]
- El crédito mensual de 200 USD ya no existe: el resumen de la página de uso y facturación de Map Tiles dice que estuvo disponible «until February 28, 2025». [V]
- Para usar la API hay que activar la facturación: «you must enable billing on each of your projects». [V]

**Licencia.** Términos de Google Maps Platform, última modificación 26 de agosto de 2026. https://cloud.google.com/maps-platform/terms [V]

- **Caché y sin red: prohibidos.**
  > «(a) No Scraping. Customer will not export, extract, or otherwise scrape Google Maps Content for use outside the Services. For example, Customer will not: (i) pre-fetch, index, store, reshare, or rehost Google Maps Content outside the services; (ii) bulk download Google Maps tiles, Street View images, geocodes…»
  > «(b) No Caching. Customer will not cache Google Maps Content except as expressly permitted under the Maps Service Specific Terms.»
  - Los Service Specific Terms (modificados el 28 de octubre de 2026) **no tienen sección de Map Tiles API**. No hay permiso de caché para teselas. [V] https://cloud.google.com/maps-platform/terms/maps-service-terms
  - La política de Map Tiles lo repite [V]:
    > «You may not use Map Tiles API for any non-visualization use cases, such as: Image analysis; Machine interpretation; Object detection or identification; Geodata extraction or resale; Offline uses, including for any of the above» — https://developers.google.com/maps/documentation/tile/policies (actualizada el 2026-11-09)
  - Solo se respeta la caché HTTP que mande la respuesta (`max-age`, `private`…). [V]
- **PDF del dictamen:** no hay permiso. Guardar la captura es «store… outside the services». [I]
- **Video:** solo promocional.
  > «The promotional video must be no more than 30 seconds in length… must be clearly marked, "for promotional purposes only"…» — misma página de políticas [V]
  - Un video de la reconstrucción para un expediente no cabe ahí. [I]
- **Atribución:** logo de Google Maps y el texto de `copyright` que devuelve la API, visibles y sin tapar. [V]
  > «You must include clear Google Maps attribution when displaying content from Google Maps Platform APIs in your app or website.»
- **Junto a mapas que no son de Google:** prohibido.
  > «(e) No Use With Non-Google Maps. … Customer will not use the Google Maps Core Services with or near a non-Google Map in a Customer Application. For example, Customer will not … (iii) link a Google Map to non-Google Maps Content or a non-Google Map.»
  - La web de Croquis usa MapLibre con OSM. No podrían estar en la misma pantalla. [I]
- **No trazar ni derivar** contenido de las imágenes. [V]
- **Aviso en los términos del sitio:** hay que decir que la aplicación usa Google Maps y enlazar sus términos y su política de privacidad (§3.2.2(a)). [V]
- **Uso pericial o legal:** no hay cláusula específica. Solo se excluyen «High Risk Activities» (muerte, lesiones, daño grave), que no aplica. [V]

**Unity WebGL.** Funciona como textura [I]. Cesium for Unity trae `CesiumGoogleMapTilesRasterOverlay` desde la v1.19.0 [V], pero usarlo arrastra todo lo de Cesium (§5.4).

**Calidad en México.** La tabla oficial marca México con «⬤ / ⬤» en «Map Tiles 2D / 3D»: «The feature is available in the area, with good data quality and availability.» [V] https://developers.google.com/maps/coverage (actualizada el 2026-11-10). Resolución y fecha por ciudad: no las pude medir sin llave. [NV]

**Esfuerzo.** A1 más 2 o 3 días [I]: llave (René, con tarjeta), sesión, mosaico, logo y atribución, quitar el mapa OSM de la pantalla, bloquear `capturar` en este modo.

**Demo sin internet: no.**

### 4.2 Mapbox · Mapbox Satellite

**Producto.** Raster Tiles API con el tileset `mapbox.satellite`, o Static Images API (una sola imagen de hasta 1 280 × 1 280 px, `@2x`). https://docs.mapbox.com/data/tilesets/reference/mapbox-satellite

**Costo.** https://www.mapbox.com/pricing (la página no trae fecha) [V]

| Producto          | Gratis al mes   | Después                                      |
| ----------------- | --------------- | -------------------------------------------- |
| Raster Tiles API  | 750 000 teselas | 0.25 USD por 1 000 (hasta 2 M); 0.20 (2–4 M) |
| Static Images API | 50 000 imágenes | 1.00 USD por 1 000 (hasta 500 000)           |
| Static Tiles API  | 200 000 teselas | 0.50 USD por 1 000 (hasta 2 M)               |

| Cargas al mes | Raster, 100 teselas       | Raster, 324 teselas        | Static Images (1 por carga) |
| ------------- | ------------------------- | -------------------------- | --------------------------- |
| 100           | **0 USD**                 | **0 USD**                  | **0 USD**                   |
| 1 000         | **0 USD**                 | **0 USD**                  | **0 USD**                   |
| 10 000        | 1 000 000 → **62.50 USD** | 3 240 000 → **560.50 USD** | **0 USD**                   |

**Licencia.** Product Terms, «Last Updated: October 20, 2026» (PDF enlazado desde https://www.mapbox.com/legal/product-terms). Términos de servicio del 31 de marzo de 2024: https://www.mapbox.com/legal/tos [V]

- **Caché: 30 días, solo en el dispositivo y solo llenada desde la API. Proxy y capturas, prohibidos.**
  > «2.8.1. For Licensed Map Content delivered through a Mapping API, Customer may cache that Licensed Map Content on an End User's device but caching is limited to thirty (30) days on the same device making the Mapping API request. … Customer shall not distribute Licensed Map Content, including from a cache, by proxying, or by using a screenshot or other static image instead of accessing Licensed Map Content directly from the Mapping APIs.»
  > «1.9. … Customer shall … (iv) only access Licensed Map Content (other than Data Products) directly from Mapbox APIs, and (v) not export, download, cache or store Licensed Map Content or other results from the Service Offerings.»
- **PDF e impresión: no para satélite.**
  > «1.7. Print or Video Use. Customer may not use any Licensed Map Content in any printed or video media except expressly as set forth in this Section. Printed media are limited to printed paper copies and static digital copies such as PDF, JPG, PNG…»
  > «1.7.3. Print Right Limitations. All print rights are limited to: Mapbox Streets v8 or later excluding Japan map data…»
  - El satélite no está en esa lista. Los derechos extra se compran por pedido (§1.7.4). [V]
- **Video:** gratis solo para promover la aplicación y con el mapa «shown only incidentally» (§1.7.1). [V]
- **Atribución:** logo de Mapbox, «© Mapbox», «© OpenStreetMap» e «Improve this map» (§1.4). El satélite pide además la atribución de su TileJSON. [V] https://docs.mapbox.com/help/dive-deeper/attribution/
- **No trazar:** §1.6. [V]
- **Categorías con licencia aparte:** vehículos (aplicaciones para usarse dentro de un vehículo), inteligencia de negocios, bienes raíces, entre otras. Un peritaje no aparece en la lista. [I]
- **Uso pericial o legal:** sin cláusula específica. [V]

**Unity WebGL.** Como textura, pidiendo directo a la API desde el navegador [I]. El SDK de Mapbox para Unity no ayuda: su v2 «is no longer in active development» y la v3 sigue en desarrollo [T].

**Calidad en México.** [V, documentación; no medido por ciudad]

> «This tileset includes global coverage to zoom 16 (1–2 m resolution), regional coverage to zoom 18 (0.6–0.3 m resolution), and select coverage to zoom 21+ (7.5 cm+).» … «A base of 50 cm imagery for the world… Higher resolution imagery in certain areas in the US, Canada, Europe, and Australia/NZ.»

México no está entre las zonas de mayor resolución. Fechas por ciudad: [NV].

**Esfuerzo.** A1 más 2 o 3 días [I].

**Demo sin internet: no** (salvo lo que el navegador de esa misma máquina haya guardado en los últimos 30 días, que es frágil). [I]

### 4.3 Esri · World Imagery

**Producto.** ArcGIS Location Platform, servicio de mapas base, estilo de imágenes (World Imagery). https://location.arcgis.com/pricing/

**Costo.** [V]

> «Basemap tiles … 2M free then $0.15 per 1,000 tiles» · «Basemap sessions … 1K free then $4 per 1,000 sessions» · «Static maps … 1K free then $0.9 per 1,000 static maps»

| Cargas al mes | 100 teselas (zoom 19) |
| ------------- | --------------------- |
| 100           | 10 000 → **0 USD**    |
| 1 000         | 100 000 → **0 USD**   |
| 10 000        | 1 000 000 → **0 USD** |

- El zoom 20 no aplica: en los puntos medidos el zoom máximo es 18 o 19. [M]
- Con 324 teselas y 10 000 cargas serían 3.24 M → 186 USD. [I]

**Licencia.** ArcGIS Location Platform Agreement, E204 Platform Legal, 21 de noviembre de 2025 (https://www.esri.com/content/dam/esrisites/en-us/media/legal/platform/platform-legal.pdf). Términos por producto E300, 10 de noviembre de 2026. [V]

- **Caché: solo la que marquen los encabezados HTTP.**
  > «6. Neither Customer nor Application Users may scrape, download, or extract Resultant Output, nor cache or store Resultant Output except as outlined herein: A. Customer may allow pre-caching of Resultant Output as permitted by the caching headers (HTTP/1.1 standard or future standard) returned by Location Services to the extent necessary for enabling or optimizing the use of the Customer Application;»
  - La tesela pública de World Imagery contestó `Cache-Control: max-age=86400` (24 horas). [M]
- **PDF e imagen fija: sí, de forma explícita.**
  > «B. Customers and Application Users may use Resultant Output in a static format (i.e. PDF, GIF, JPEG, HTML), in an unalterable final form;»
  - Con atribución: «Customer must affix an attribution statement to Resultant Output from the Basemap location service, acknowledging Esri and, or its applicable licensor(s) as the source». [V]
  - Texto sugerido por Esri para mapas estáticos: «Map image is the intellectual property of Esri and is used herein under license. Copyright © 2025 Esri and its licensors. All rights reserved.» [V] https://doc.arcgis.com/en/arcgis-online/reference/static-maps.htm
- **Video:** la lista dice PDF, GIF, JPEG, HTML. El video no aparece. [NV]
- **Sin red:** solo con «Esri Content Packages» y los SDK nativos de ArcGIS. No aplica a Unity ni a la web. [V]
  > «c. Customer may not otherwise scrape, download, or store Data, except as follows: 1. Customer may take Online Services basemaps offline through Esri Content Packages and subsequently deliver (transfer) them to any device for use with licensed ArcGIS Runtime SDKs (ArcGIS Maps SDKs for Native Apps) applications and ArcGIS Desktop or ArcGIS Pro.» — Master Agreement E204, 14 de agosto de 2026, apartado «3.2 Permitted Uses» de la sección de datos. https://www.esri.com/content/dam/esrisites/en-us/media/legal/ma-full/ma-full.pdf
- **Exportar en masa:** prohibido. «Programmatic use of session tokens (e.g., exporting volumes of basemap tiles) is not permitted.» (E300, nota 10) [V]
- **Solo para ver, y solo dentro de la aplicación:** «may only use Resultant Output for visualization purposes and only within Customer Applications». [V]
- **Aplicaciones comerciales: permitidas** con ArcGIS Location Platform. [V] https://location.arcgis.com/help/licensing-and-attribution/
- **Atribución:** «Powered by Esri» más la de las fuentes de datos. [V]
- **Uso pericial o legal:** sin cláusula específica. El acuerdo dice que la plataforma no está pensada para entornos donde un fallo cause muerte o daño físico; no aplica. [V]

**Unity WebGL.** Como textura [I]. El SDK de ArcGIS para Unity **no sirve en Web**: un empleado de Esri contestó «Unfortunately we do not support WebGL» [T, foro de Esri].

**Calidad en México.** Consulta `identify` al servicio público de World Imagery, hoy [M]:

| Punto                             | Fuente                     | Fecha de la imagen | Resolución (m) | Exactitud (m) | Zoom máx. |
| --------------------------------- | -------------------------- | ------------------ | -------------- | ------------- | --------- |
| CDMX, Zócalo                      | Vantor, Vivid Advanced     | 2025-02-24         | 0.50           | 8.47          | 19        |
| Ecatepec (periferia)              | Vantor, Vivid Advanced     | 2025-02-26         | 0.34           | 8.47          | 19        |
| Toluca, centro                    | Vantor, Vivid Advanced     | 2026-01-28         | 0.34           | 8.47          | 19        |
| Metepec, residencial              | Vantor, Vivid Advanced     | 2026-01-28         | 0.34           | 8.47          | 19        |
| Guadalajara, centro               | Vantor, Vivid Mosaic Metro | 2025-11-16         | 0.31           | 8.47          | 19        |
| Monterrey, centro                 | Vantor, Vivid Advanced     | 2026-01-18         | 0.31           | 8.47          | 18        |
| Atlacomulco (ciudad chica)        | Vantor, Vivid              | 2025-03-01         | 0.34           | 5             | 18        |
| Autopista México–Querétaro, rural | Vantor, Vivid              | 2026-05-15         | 0.31           | 5             | 18        |
| Carretera 15, Sonora, rural       | Vantor, Vivid              | 2025-02-03         | 0.34           | 5             | 18        |
| Carretera Oaxaca–Istmo, rural     | Vantor, Vivid              | 2026-01-10         | 0.34           | 5             | 18        |

- Diez puntos no son una muestra del país. Sí muestran que ciudad y carretera rural tienen resolución parecida.
- **La exactitud de 5 a 8.47 m importa.** La foto puede quedar corrida varios metros respecto a las calles de OSM y a las coordenadas del caso. Habría que dejar al perito ajustar el piso, o declararlo como ilustrativo. [I]
- Una foto satelital trae los coches que había ese día. Quedan pintados en el piso, bajo los vehículos 3D. [I]

**Esfuerzo.** A1 más 2 o 3 días [I], más 1 día si se agrega el ajuste manual del piso.

**Demo sin internet: no** como teselas. Queda abierta una duda: si una imagen fija «en forma final inalterable» puede usarse como piso de un caso guardado. No lo dice el acuerdo. [NV]

### 4.4 MapTiler · Satellite

**Producto.** MapTiler Cloud, teselas ráster XYZ del mapa satelital. https://www.maptiler.com/cloud/pricing/

**Costo.** [V el precio de los planes; las cuotas incluidas las leí con la herramienta de lectura, no en el texto crudo de la página]

- **Free, 0 USD:** «Suitable for testing, PoC, prototyping, personal, or non-commercial use.» Logo de MapTiler en el mapa. 100 000 peticiones al mes.
- **Flex, 30 USD al mes:** 500 000 peticiones incluidas; 0.15 USD por cada 1 000 extra.
- La tabla de funciones tiene una fila «Commercial use», pero sus marcas son imágenes y no las pude leer. Me baso en la frase del plan Free. Croquis es un producto para CESVI, así que el plan gratis no aplicaría. [I]

| Cargas al mes | 100 teselas                       |
| ------------- | --------------------------------- |
| 100           | **30 USD**                        |
| 1 000         | **30 USD**                        |
| 10 000        | 1 000 000 → 30 + 75 = **105 USD** |

Supongo 1 tesela = 1 petición. [I]

**Licencia.** https://www.maptiler.com/terms/ y https://www.maptiler.com/terms/cloud/ (© 2026, sin fecha de versión) [V]

- **Caché: solo la personal y temporal.**
  > «End-user Device Caching. Results of requests can be stored in a temporary personal cache (browser cache, mobile app cache, etc.) for use by a single end-user only.»
- **Proxy, exportar y capturas en lugar de la API: prohibidos.**
  > «Proxy. Unless otherwise agreed in writing with MapTiler, individual end-users must generate direct requests directly to MapTiler infrastructure…»
  > «Export Usage. Unless otherwise agreed in writing with MapTiler, it is prohibited to export map content for usage outside the Service.»
  > «Server-side Proxy & Caching. It is prohibited to store, save, and/or redistribute any map content from a server-side cache or temporary storage or by using a screenshot or other static image, instead of directly accessing via our APIs.»
- **Impresión:** «Limited Prints. To produce printed maps for an internal purpose (e.g. company flyers) with a maximum size of A4 at 300 DPI…». Un dictamen que sale de la empresa no es claramente «uso interno». [I]
- **Video:** «Limited Videos… for usage in internet channels (YouTube, Vimeo, etc.) with a maximum 100,000 subscribers.» La tabla de planes pone «Export for videos & games: contact us for commercial use». [V]
- **Atribución:** «© MapTiler» con enlace, y «© OpenStreetMap» si aplica. En impresos y video, texto visible junto al mapa. [V]
- **Uso pericial o legal:** sin cláusula específica. [V]

**Calidad en México.** Resolución y fechas: [NV].

**Esfuerzo.** Igual que 4.2.

**Demo sin internet: no.**

### 4.5 INEGI

**Producto.** No encontré un servicio público de teselas de ortofotos del INEGI que se pueda consumir desde una aplicación. [NV]

- Lo único con URL que apareció es un WMS del **mapa topográfico** (no fotos), citado en la wiki de OSM como «funcionando a partir de junio de 2025»: `https://gaiamapas3.inegi.org.mx/mdmCache/service/wms?LAYERS=MapaBaseTopograficov61_sinsombreado…` [T] https://wiki.openstreetmap.org/wiki/ES:INEGI
- El sitio del INEGI me bloqueó la descarga directa con un captcha. No intenté saltarlo. La página de ortoimágenes llegó vacía a la herramienta de lectura. [NV]
- Ortofotos históricas: un artículo de 2005 habla de resolución de 1.5 y 2 m para casi todo el país. [T, viejo]
- El visor de imágenes de muy alta resolución (SIDAISAR) está sujeto a «condiciones de licenciamiento, convenios y restricciones». [T]

**Costo.** 0 USD.

**Licencia.** Términos de Libre Uso de la Información del INEGI. https://www.inegi.org.mx/inegi/terminos.html [V con la herramienta de lectura; el captcha no me dejó cotejar el texto crudo]

> «Puede hacer y distribuir copias de la información, sin alterar ni suprimir sus metadatos.» · «Puede difundir y publicar la información.» · «Puede adaptar y reordenar la información.» · «Puede explotar comercialmente la información, utilizándola como insumo para generar otros productos o servicios.»

- Crédito: «Fuente: INEGI, nombre del producto de donde se extrae la información».
- Restricción: «No debe aparentar que el uso que haga de la información representa una postura oficial del INEGI».
- Con esos términos, caché, uso sin red, PDF y video quedan permitidos. [I]

**Calidad.** Si la resolución es de 1.5–2 m, no alcanza para ver carriles. [I sobre T]

**Esfuerzo.** No estimable sin saber qué producto existe. Si hubiera que bajar ortofotos por zona y servirlas nosotros, el peso iría a Blob. [I]

**Demo sin internet: sí**, por licencia.

---

## 5. B1 · Google Photorealistic 3D Tiles con Cesium for Unity

### 5.1 Proveedor y producto

- **Google Map Tiles API, Photorealistic 3D Tiles.** https://developers.google.com/maps/documentation/tile/3d-tiles (actualizada el 2026-11-09)
- **Cesium for Unity**, paquete `com.cesium.unity`, versión **1.26.1 (2026-11-02)**, licencia Apache 2.0. https://github.com/CesiumGS/cesium-unity
- No hace falta Cesium ion: Cesium for Unity puede leer el `root.json` de Google con la llave propia. [I]

### 5.2 Costo

[V] https://developers.google.com/maps/billing-and-pricing/pricing

| SKU «Map Tiles API: Photorealistic 3D Tiles» (Enterprise) | USD por 1 000 peticiones raíz |
| --------------------------------------------------------- | ----------------------------- |
| Gratis al mes                                             | 1 000                         |
| Hasta 100 000                                             | 6.00                          |
| 100 001 – 500 000                                         | 5.10                          |

| Cargas al mes | Peticiones raíz | Costo                          |
| ------------- | --------------- | ------------------------------ |
| 100           | 100             | **0 USD**                      |
| 1 000         | 1 000           | **0 USD**                      |
| 10 000        | 10 000          | 9 000 × 6 / 1 000 = **54 USD** |

- Por qué 1 carga = 1 petición [V]:
  > «Timed session tokens allow for up to three hours of renderer tile requests from a single root tileset request.» … «Unlimited renderer-originating tile requests per day.» — https://developers.google.com/maps/documentation/tile/usage-and-billing
- Cuota por omisión: 10 000 peticiones raíz al día. [V]
- Las teselas viajan de Google al navegador. No pasan por Vercel ni por Blob. [I]
- Cesium for Unity es gratis: «Cesium for Unity is free for both commercial and non-commercial use.» [V]

### 5.3 Licencia

Todo lo de §4.1 aplica igual (mismos términos). Además [V]:

- **Geometría propia encima: sí, si no sale de las teselas.**
  > «You may overlay your own 3D objects on Photorealistic 3D Tiles as long as the 3D objects aren't extracted, traced, or otherwise derived by hand or machine from Photorealistic 3D Tiles.» — https://developers.google.com/maps/documentation/tile/policies
  - Los vehículos y las personas de Croquis son objetos propios. Entran. [I]
- **Hay que decir qué es de Google y qué no.**
  > «…consider combining Photorealistic 3D Tiles (as background filler) with your own photorealistic models (in the foreground). Users could be confused… you must clearly state in your UI attribution string or user flow which part of the scene originates from Google Maps data.»
- **Atribución en el renderizador.**
  > «You must aggregate, sort, and display in a line, all attributions for displayed tiles» y, para Cesium for Unity, activar «Show Credits On Screen». El logo de Google no puede quedar tapado por otro logo.
- **Documentos:** por Cesium ion la prohibición es literal. Los términos de Cesium para contenido de Google (20 de agosto de 2025) dicen: «You will not: … (vi) include any Google Maps Content in any electronic or printed documents.» https://cesium.com/legal/terms-for-google/ [V]
  - Con llave directa de Google esa frase no está, pero sí «store… outside the services». [V + I]
- **Calles de OSM dibujadas encima:** zona gris frente a «link a Google Map to non-Google Maps Content». [I]

### 5.4 ¿Funciona en Unity WebGL?

**Sí, como soporte experimental.** [V]

- Registro de cambios: «v1.20.0 - 2025-12-01 … Added experimental support for Web builds.» https://github.com/CesiumGS/cesium-unity/blob/main/CHANGES.md
- Ninguna versión posterior (hasta la 1.26.1) lo saca de experimental. La 1.25.0 agregó Unity 6.5 y Linux. [V]
- Plataformas, documentación de la 1.26.1 [V]:
  > «Cesium for Unity supports the Web as a Unity Player platform. Both WebGL and WebGPU are supported. Unity 6 or later is required.»
  > «You must turn on "Enable Native C/C++ Multithreading" in the Player Settings.»
  > Encabezados obligatorios: «Cross-Origin-Opener-Policy: same-origin», «Cross-Origin-Embedder-Policy: require-corp», «Cross-Origin-Resource-Policy: cross-origin». «Failure to set these headers will result in a popup when the application loads saying, "Your web browser does not support multithreading."»
  > — https://cesium.com/learn/cesium-unity/ref-doc/supported-platforms.html
- Blog de Cesium, 16 de marzo de 2026 [V]:
  > «Web support in Cesium for Unity is currently experimental, so careful optimization may be required for high-memory applications to stay within browser memory limits.»
  > «Increase Memory Limits: You may want to increase the maximum memory limits for the web player to handle more memory-intensive tilesets. Unity currently supports a maximum memory limit of 4GB.»
  > — https://cesium.com/blog/2026/03/16/introducing-cesium-for-unity-web/
- Unity también llama experimental al ajuste de hilos: «the experimental Player setting Native C/C++ Multithreading». Y C# sigue en un solo hilo: «applications built using the Web platform must run on a single C# thread». [V con la herramienta de lectura] https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/webgl/intro/technical-overview
- El `package.json` pide Unity 2022.3 como mínimo; para Web, Unity 6. El proyecto usa 6000.3.28f1: cumple. [V]
- Canalización de render: la documentación de plataformas no dice cuáles soporta. En el foro hay usuarios con URP y con HDRP, y reportes de fallos distintos en cada una. [T] Soporte oficial de URP 17.3: [NV].

**Limitaciones conocidas** [T, foro de Cesium, enero–febrero de 2026, Cesium for Unity 1.20.0]:

- Memoria: un usuario reportó el montón entre «6 to 7 Gig» al cambiar de escena varias veces, con pantallas negras. La respuesta fue un enlace a la documentación de memoria de Unity; no hubo arreglo de Cesium. https://community.cesium.com/t/webgpu-cesium-unity-1-20-0-observations-comments-possible-bugs/44849
- Otro hilo (Unity 6000.3.5f2): la memoria nativa de Cesium no la ve el sistema de recursos de Unity y no se libera al descargar. https://community.cesium.com/t/high-memory-usage-and-persistent-memory-footprint-when-loading-large-3d-tilesets-removal-doesn-t-free-memory-unity-6000-3-5f2/46533
- El build creció de unos 32 MB a 54 MB en ese proyecto.
- Carga lenta y pantalla negra en móviles.
- PhysX llenaba la consola con avisos por los triángulos de las teselas de Google; se corrige desde Unity 6000.3.3f1 bajando «Log Verbosity».

**Qué significa para Croquis** [I]:

- Hay que **encender los hilos** en el build Web. Hoy están apagados. Cambia todo el build, no solo el modo nuevo.
- Hay que **mandar COOP y COEP en la página** que aloja el visor. Con `require-corp`, cada recurso de otro origen debe venir con CORS o con CORP: el build y los modelos en Vercel Blob, las teselas de OpenFreeMap, fuentes e imágenes. Lo que no cumpla deja de cargar. Hoy `next.config.ts` no manda ninguno.
- Memoria máxima hoy: 2 048 MB. Las teselas fotorrealistas piden más. La regla del proyecto de «nunca más de 100 ms» y las máquinas de 8 GB quedan en riesgo.
- El build de Unity pesa más, y cada visitante lo baja de Blob (ADR 0120 ya marca ese gasto como el mayor).
- **`capturar` no puede usarse** con las teselas de Google en pantalla. El dictamen lleva tres fotos de Unity.
- Cesium for Unity no corre en CI ni en la laptop de 8 GB. Todo se mide en la RTX.

### 5.5 Calidad en México

- País: «⬤ / ⬤» en «Map Tiles 2D / 3D» y «⬤» en «Maps 3D». [V] https://developers.google.com/maps/coverage
- **Ciudades:** la cobertura de fotogrametría es un mapa interactivo. [V]
  > «3D terrain data is available worldwide. 3D surface data is limited to the areas highlighted in blue on the map below. Use the search box to check for coverage in a specific location. Coverage data is updated daily at 11:00 UTC.» — https://developers.google.com/maps/documentation/javascript/3d/coverage
  - No hay lista en texto. No pude sacar qué ciudades mexicanas están en azul. **[NV]**
  - Fuera de las zonas azules solo hay terreno con la foto satelital encima, sin edificios. [I]
- A nivel de calle, la fotogrametría aérea se ve derretida: fachadas borrosas, coches y árboles fundidos con el piso. Las cámaras «conductor», «acera» y «cerca» de Croquis están justo a esa altura. [I, sin medir]
- El piso de la malla no es plano. Los vehículos 3D tendrían que asentarse sobre ella o sobre un parche plano. [I]

### 5.6 Esfuerzo y riesgos

- **10 a 20 días, con riesgo alto** [I]:
  - instalar el paquete (registro de Cesium) y armar la georreferencia con el origen del caso;
  - encender hilos y volver a medir todo el build Web;
  - COOP/COEP en Next y revisar cada recurso de otro origen;
  - memoria, calidad por nivel, y regreso al entorno procedural si falla;
  - asentar vehículos sobre la malla;
  - atribución en pantalla, quitar el mapa OSM de esa vista, bloquear capturas y video;
  - llave de Google con tarjeta (René), restringida por dominio y con tope diario;
  - contrato: puente 1.3.0 y campo de modo en caso-3d.
- Riesgos: soporte experimental; memoria; cobertura desconocida en México; el dictamen se queda sin fotos de este modo; términos de Google que cambian con 30 días de aviso.
- **Demo sin internet: no.** Ni por licencia ni por técnica. La demo local tendría que esconder el modo o caer al procedural.

---

## 6. B2 · Edificios reales extruidos por nosotros (OSM u Overture)

### 6.1 Proveedor y producto

- **OpenStreetMap vía Overpass.** El proyecto ya lo consulta para las calles. Faltaría pedir `building`.
- **Overture Maps, tema «buildings».** https://docs.overturemaps.org/guides/buildings/ — junta OSM, Esri Community Maps, Microsoft ML Buildings y Google Open Buildings. Se baja como GeoParquet desde S3 o Azure.
- Fuentes sueltas: Microsoft Global ML Building Footprints (https://github.com/microsoft/GlobalMLBuildingFootprints) y Google Open Buildings v3 (https://sites.research.google/gr/open-buildings/).
- **Una vía que ya está a la mano:** las teselas vectoriales de OpenFreeMap que la web ya baja traen una capa `building` (zoom 13–14) con los campos `render_height` y `render_min_height`. [M, TileJSON de `tiles.openfreemap.org/planet`] Son los mismos datos de OSM. Cómo se llena `render_height` cuando OSM no trae altura: [NV].

### 6.2 Costo

- **0 USD en los tres volúmenes.** No hay precio por consulta. [V]
- Overpass público no tiene garantía. Hoy, en dos corridas de ocho puntos, 12 de 16 quedaron sin respuesta (502 o 504). La segunda corrida probó las tres instancias que usa el proyecto. [M]
- Overture no tiene API por zona: hay que leer el GeoParquet con una herramienta (DuckDB u otra) o preparar recortes. [V]

### 6.3 Licencia

- **OSM:** ODbL. Atribución «© OpenStreetMap». Se puede guardar, usar sin red, imprimir y poner en video. [V]
- **Overture, edificios:** ODbL. [V]
  > «Because it includes OpenStreetMap data, the buildings theme is published under the ODbL license.»
  - Atribución: «© OpenStreetMap contributors, Overture Maps Foundation». https://docs.overturemaps.org/attribution/
- **Microsoft:** «freely available for download and use under CDLA Permissive 2.0». [V]
- **Google Open Buildings:** CC BY 4.0 u ODbL, a elegir. [V]
- **Repo público:** se pueden versionar los recortes por caso, con atribución. [I]
- **Uso pericial o legal:** sin restricción. Sin garantía de exactitud. [V]

### 6.4 Unity WebGL

- No depende de ningún paquete nuevo. La web pide los polígonos, los pasa a metros de la escena y los manda en el caso-3d. Unity los extruye. [I]
- `EdificioEscenario` hoy es una caja. Una huella real necesita un polígono: cambio de contrato. [V del esquema]
- La triangulación puede vivir en `Croquis.Core` y probarse con `dotnet test`. [I]
- Sin hilos, sin COOP/COEP, sin llaves. [I]

### 6.5 Calidad en México

**OSM, medido** [M]: el conteo por punto está en `eval/results/ronda4_mapa_real_datos.json` (figuras de edificios en las teselas de OpenFreeMap a 300 m de nueve puntos). El patrón: los centros de las ciudades grandes tienen huellas; las zonas residenciales, la periferia y las ciudades chicas, casi ninguna.

- No sé cuántos edificios hay en realidad en cada círculo, así que no puedo dar un porcentaje de completitud. [NV]
- **Estudio** (Arroyo Ohori y Stoter, ISPRS Archives, 2026) [T]:
  > «In Mexico, while national topographic and elevation datasets exist, they lack crucial features like individual building footprints and road polygons…» … «the generated building footprints are often more accurate than those in global datasets (Microsoft, Google), particularly for non-rectilinear buildings…» … «missing approximately 30% of smaller buildings».
  > — https://isprs-archives.copernicus.org/articles/XLVIII-3-W4-2025/3/2026/
- **Overture reconoce el problema** [V]:
  > «Many Overture Maps buildings are derived from ML sources (e.g. Microsoft and Google Open Buildings), which have lower footprint precision. This is most pronounced in the Global South, due to the high share of ML-derived buildings there.»
- **Microsoft sí cubre México en planta:** una entrega de 2023 sumó «Mexico (17M)», con 0.1 % de falsos positivos en 2 000 edificios revisados (imágenes de inicios de 2022). [V]
- **Alturas de Microsoft: no en el centro del país.** Probé su mapa de cobertura de alturas: CDMX, Toluca, Guadalajara, Monterrey, Puebla y Mérida quedan fuera; Tijuana queda dentro. Ojo: ese archivo es del 7 de noviembre de 2024. [M]
- **Google Open Buildings v3 incluye México** («MEX Mexico» en su lista). Su producto «2.5D Temporal» trae alturas estimadas desde Sentinel-2, con resolución efectiva de 4 m, 2016–2023. Es un ráster, no una altura por edificio. [V]
- Cifras de completitud de huellas o de alturas por ciudad mexicana: no encontré. [NV]

Resultado práctico [I]: huellas reales donde las haya; altura **supuesta** en casi todos los casos (pisos × 3 m o un valor por zona). Las fachadas serían lisas: no hay textura real.

### 6.6 Esfuerzo y riesgos

- **5 a 8 días** [I]: consulta de edificios, conversión a la escena, polígonos en el contrato, extrusión en Unity con pruebas en `Croquis.Core`, altura supuesta declarada, atribución, caché por caso, una e2e.
- Con Overture en lugar de solo OSM: 3 a 5 días más para preparar y servir recortes. [I]
- Riesgos: zonas sin huellas (se vería vacío o habría que mezclar con lo procedural); alturas inventadas, que chocan con «ningún número inventado» si no se declaran como supuesto; Overpass caído.
- **Demo sin internet: sí.** Los polígonos de cada caso se guardan con el caso.

---

## 7. B3 · Otras teselas 3D serias

### 7.1 Cesium ion (Google 3D y Cesium OSM Buildings)

- **Producto:** Cesium ion sirve los Photorealistic 3D Tiles de Google y su propia capa «Cesium OSM Buildings» («over 350 million buildings»; la altura que falta se estima con 3 m por nivel). https://cesium.com/platform/cesium-ion/content/cesium-osm-buildings/ [V]
- **Costo** [V] https://cesium.com/platform/cesium-ion/pricing/ (© 2026, sin fecha):

| Plan       | Precio                      | Uso                                 | Google 3D            |
| ---------- | --------------------------- | ----------------------------------- | -------------------- |
| Community  | gratis                      | «Personal and non-commercial use»   | 1 000 raíces al mes  |
| Commercial | 149 USD al mes (individual) | comercial dentro de la organización | 5 000 raíces al mes  |
| Premium    | 499 USD al mes (individual) | igual                               | 10 000 raíces al mes |

- 100 y 1 000 cargas: **149 USD al mes**. 10 000 cargas: **499 USD al mes**. No hay precio por excedente publicado. [V + I]
- Queda muy por encima del presupuesto. Con llave directa de Google sale 0, 0 y 54 USD.
- **Licencia:** para Google, los mismos límites y además la prohibición literal de documentos (§5.3). [V]
- **Unity WebGL:** igual que B1; es el mismo Cesium for Unity. [I]
- **Demo sin internet:** no. «Cesium ion Self-Hosted» solo por ventas. [V]
- **México:** Cesium OSM Buildings hereda los huecos de OSM (§6.5). [I]

### 7.2 Esri

- La lista de productos de Esri (E300, 10 de noviembre de 2026) incluye «Google Photorealistic 3D Basemap (13; 72)». Nota 72: «May be used for the internal business purposes of Customer's organization.» Nota 13: «Customer may not extract, or store results in external databases, nor create derivative works…». [V]
- El SDK de ArcGIS para Unity no soporta Web. [T]
- Precio de ese mapa base 3D: [NV].

### 7.3 Mapbox y MapTiler

- No encontré un producto de teselas 3D fotorrealistas para Unity en ninguno. La página de precios de Mapbox no lista ninguno. [V]
- Sus edificios 3D son huellas de OSM con altura dentro de teselas vectoriales: es B2 con más restricciones (Mapbox prohíbe extraer datos, §1.6). [I]
- MapTiler cobra «3D sessions» (6 USD por 1 000 en Flex) y exige su logo en ellas. [V con la herramienta de lectura]

### 7.4 Lo que no revisé

Azure Maps, HERE, Nearmap, Vexcel, Bing. [NV]

---

## 8. Tabla comparativa

Costos en USD al mes para 100 / 1 000 / 10 000 cargas, con 100 teselas por carga donde aplica.

| Opción                                  | Costo 100 / 1 000 / 10 000          | Caché y sin red                            | PDF del dictamen     | Video exportado                                  | Unity WebGL                               | Calidad en México                                      | Esfuerzo                     | Demo sin internet |
| --------------------------------------- | ----------------------------------- | ------------------------------------------ | -------------------- | ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------ | ---------------------------- | ----------------- |
| **A1** Mapa OSM (OpenFreeMap)           | 0 / 0 / 0                           | Sí (≤ 3 000 teselas o 50 MB por descarga)  | Sí, con atribución   | Sí, con atribución                               | Textura; sin cambios al build             | Calles bien; edificios en planta incompletos; sin foto | 3–5 días                     | Sí                |
| **A2** Google 2D satélite               | 0 / 0 / 540                         | No                                         | Sin permiso          | Solo promocional ≤ 30 s                          | Textura                                   | «Buena» según Google; sin medir                        | A1 + 2–3 días                | No                |
| **A2** Mapbox Satellite                 | 0 / 0 / 62.50 (0 con Static Images) | 30 días en el mismo dispositivo; sin proxy | No para satélite     | Solo promocional                                 | Textura                                   | 50 cm de base según su documentación                   | A1 + 2–3 días                | No                |
| **A2** Esri World Imagery               | 0 / 0 / 0                           | Solo caché HTTP (24 h medidas)             | **Sí, explícito**    | No lo dice                                       | Textura                                   | 0.31–0.5 m, 2025–2026, exactitud 5–8.47 m (medido)     | A1 + 2–4 días                | No (duda abierta) |
| **A2** MapTiler Satellite               | 30 / 30 / 105                       | Solo caché personal temporal               | Solo uso interno, A4 | Hasta 100 000 suscriptores; comercial, preguntar | Textura                                   | Sin datos                                              | A1 + 2–3 días                | No                |
| **A2** INEGI                            | 0 / 0 / 0                           | Sí                                         | Sí, «Fuente: INEGI…» | Sí                                               | Textura, si existe el servicio            | Sin servicio verificado; histórico 1.5–2 m             | No estimable                 | Sí                |
| **B1** Google 3D + Cesium for Unity     | 0 / 0 / 54                          | No                                         | No                   | Solo promocional ≤ 30 s                          | **Experimental**; exige hilos y COOP/COEP | Ciudades con fotogrametría: sin verificar              | 10–20 días, riesgo alto      | No                |
| **B2** Edificios OSM/Overture extruidos | 0 / 0 / 0                           | Sí                                         | Sí, con atribución   | Sí, con atribución                               | Geometría propia; sin cambios al build    | Huellas incompletas; alturas casi nulas (medido)       | 5–8 días (+3–5 con Overture) | Sí                |
| **B3** Cesium ion                       | 149 / 149 / 499                     | No                                         | No (literal)         | No                                               | Igual que B1                              | Igual que B1 o que OSM                                 | Igual que B1                 | No                |

---

## 9. Preguntas que René tendría que contestar

1. **¿El modo «mapa real» debe salir en las fotos del dictamen y en el video exportado?** Si sí, quedan fuera Google (2D y 3D), Mapbox satélite y, en la práctica, MapTiler. Quedan OSM, Esri (solo imagen fija) e INEGI.
2. **¿Debe funcionar en la demo local sin internet?** Si sí, solo quedan A1, B2 e INEGI. Si basta con que ahí caiga al entorno procedural, entran todas.
3. **¿Qué necesita ver el perito: el lugar como foto desde arriba, o los edificios con volumen a nivel de calle?** Lo primero es A2. Lo segundo es B1 (fotogrametría, donde exista) o B2 (cajas con altura supuesta).
4. **¿Se acepta encender hilos y COOP/COEP en todo el sitio, y volver a medir el visor Web completo, por una función que Cesium y Unity llaman experimental?** Es la puerta de entrada a B1.
5. **¿Puede dar una llave con tarjeta (Google) o una cuenta (Esri, Mapbox) con tope de gasto en cero?** Sin eso no se puede probar la calidad real de Google ni de Mapbox en los lugares de los casos de CESVI, ni saber qué ciudades tienen 3D.

---

## 10. Lo que NO pude verificar

1. **Qué ciudades mexicanas tienen fotogrametría 3D de Google.** La fuente oficial es un mapa interactivo sin lista. Hay que buscar a mano cada lugar en https://developers.google.com/maps/documentation/javascript/3d/coverage.
2. **Resolución y fecha de la foto satelital de Google, Mapbox y MapTiler en México.** Sin llaves no se puede medir. De Mapbox solo tengo lo que dice su documentación general.
3. **Si Cesium for Unity 1.26.1 funciona bien con URP 17.3 en Web.** La documentación oficial no lista canalizaciones. Solo hay reportes de foro.
4. **Memoria, peso del build y fps de Cesium for Unity en Web con las teselas de Google.** No corrí nada. Las cifras de memoria y de tamaño son de un usuario del foro.
5. **Cuántos MB baja una escena de 300 m de radio con teselas 3D de Google.**
6. **Si existe un servicio público de ortofotos del INEGI** (WMS, WMTS o teselas), con qué resolución y de qué año. El sitio me bloqueó con captcha.
7. **El texto crudo de los Términos de Libre Uso del INEGI.** Las citas vienen de la herramienta de lectura; no pude cotejarlas carácter por carácter.
8. **Las cuotas incluidas de MapTiler** (100 000 y 500 000 peticiones, 0.15 USD por 1 000). La página las arma con JavaScript; las leí con la herramienta de lectura, no en el texto crudo. Tampoco confirmé que una tesela ráster cuente como una petición.
9. **Si Mapbox responde con CORS** a una petición con llave válida desde el navegador.
10. **Si Esri permite video** con sus imágenes, y si una imagen fija «en forma final inalterable» puede servir de piso guardado para la demo local.
11. **Completitud de huellas y de alturas por ciudad mexicana** en OSM y Overture. No encontré cifras publicadas. Mi muestra de Overpass son cuatro puntos (otros cuatro fallaron: Zócalo, Toluca centro, Monterrey centro y Atlacomulco) y no tengo el número real de edificios para comparar. No consulté Overture directamente (no hay DuckDB instalado y no instalé nada).
12. **Precio del «Google Photorealistic 3D Basemap» de Esri** y si se puede usar fuera de sus SDK.
13. **Azure Maps, HERE, Nearmap, Vexcel y Bing.** No los revisé.
14. **Si las cuentas gratuitas de Esri y Mapbox piden tarjeta.**
15. **La fecha de la página de precios de Mapbox y de Cesium ion.** Ninguna la muestra.
16. **Los plazos en días.** Son estimaciones mías, sin haber abierto el código de Unity del entorno.

---

## 11. Fuentes y evidencia

**Términos y precios (leídos hoy):**

- Google, precios: https://developers.google.com/maps/billing-and-pricing/pricing (2026-11-17)
- Google, uso y cuotas de Map Tiles: https://developers.google.com/maps/documentation/tile/usage-and-billing (2026-11-09)
- Google, políticas de Map Tiles: https://developers.google.com/maps/documentation/tile/policies (2026-11-09)
- Google, términos: https://cloud.google.com/maps-platform/terms (26 de agosto de 2026)
- Google, términos por servicio: https://cloud.google.com/maps-platform/terms/maps-service-terms (28 de octubre de 2026)
- Google, cobertura: https://developers.google.com/maps/coverage (2026-11-10) y https://developers.google.com/maps/documentation/javascript/3d/coverage (2026-11-18)
- Cesium for Unity: https://github.com/CesiumGS/cesium-unity/blob/main/CHANGES.md · https://cesium.com/learn/cesium-unity/ref-doc/supported-platforms.html · https://cesium.com/blog/2026/03/16/introducing-cesium-for-unity-web/ · https://cesium.com/learn/unity/building-an-app-for-the-web/
- Cesium ion: https://cesium.com/platform/cesium-ion/pricing/ · https://cesium.com/legal/terms-for-google/
- Unity, hilos en Web: https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/webgl/intro/technical-overview
- Mapbox: https://www.mapbox.com/pricing · https://www.mapbox.com/legal/tos · https://www.mapbox.com/legal/product-terms (PDF del 20 de octubre de 2026) · https://docs.mapbox.com/help/dive-deeper/attribution/
- Esri: https://location.arcgis.com/pricing/ · https://www.esri.com/content/dam/esrisites/en-us/media/legal/platform/platform-legal.pdf · https://www.esri.com/content/dam/esrisites/en-us/media/legal/product-specific-terms-of-use/e300.pdf · https://www.esri.com/content/dam/esrisites/en-us/media/legal/ma-full/ma-full.pdf · https://doc.arcgis.com/en/arcgis-online/reference/static-maps.htm
- MapTiler: https://www.maptiler.com/cloud/pricing/ · https://www.maptiler.com/terms/ · https://www.maptiler.com/terms/cloud/
- OSM y OpenFreeMap: https://openfreemap.org/ · https://openfreemap.org/tos/ · https://operations.osmfoundation.org/policies/tiles/ · https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- Overture, Microsoft y Google Open Buildings: https://docs.overturemaps.org/guides/buildings/ · https://docs.overturemaps.org/attribution/ · https://github.com/microsoft/GlobalMLBuildingFootprints · https://sites.research.google/gr/open-buildings/
- INEGI: https://www.inegi.org.mx/inegi/terminos.html

**Mediciones propias (scripts y salidas en el scratchpad de esta sesión):**

- `tools/esri_meta.py` → `dl/esri_meta_mx.json`: metadatos de World Imagery en diez puntos.
- `tools/osm_bld2.py` → `dl/osm_bld_mx.json` y `dl/osm_bld_mx_corrida1.json`: edificios de OSM por Overpass.
- `tools/pip.py` sobre `dl/ms/height-coverage.geojson`: cobertura de alturas de Microsoft.
- Encabezados CORS y de caché: una petición `curl` por proveedor.

El scratchpad se borra solo. Si estas cifras van a un documento del repo, hay que volver a correrlas desde `eval/` y dejar el resultado en `eval/results/`.
