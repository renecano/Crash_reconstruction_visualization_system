# Datos de Croquis

Qué datos externos se usan, cómo se obtienen de forma reproducible y qué **no** cubren.
El registro formal de cada fuente (origen, URL, fecha, licencia, script) está en `data/SOURCES.md`.

## Principios

- Nada se descarga a mano: cada fuente tiene un script en `data/croquis_data/` con verificación de integridad (tamaño y SHA-256 en un `manifest.json`).
- Lo crudo vive en `data/raw/` (no versionado). Lo procesado y pequeño vive en `data/processed/` y las cifras que cita el README en `eval/results/`.
- Si un dato no es accesible por formato o licencia, se documenta aquí y se sustituye por la mejor alternativa con fuente. No se inventan números.

## Fuentes por uso

| Uso                                                                        | Fuente                                                                                                                    | Fase | Estado                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| Magnitud del problema y distribución de tipos de accidente para Relatos-MX | INEGI ATUS (datos abiertos 1997–2025)                                                                                     | F0   | **listo**: `eval/results/atus_summary.json`                                                       |
| Rigidez CRASH3 por clase y validación E2                                   | NHTSA Vehicle Crash Test Database (API)                                                                                   | F2   | **listo**: `eval/results/e2_barrier.json`                                                         |
| Validación E3 contra EDR                                                   | NHTSA CISS                                                                                                                | F7   | pendiente                                                                                         |
| Dimensiones y masas por modelo común en México                             | Fichas técnicas de fabricantes (47 modelos)                                                                               | F1   | **listo**: `data/vehicles/models_raw.json`                                                        |
| Coeficientes de fricción por superficie y estado                           | Literatura (cita por valor)                                                                                               | F2   | **listo**: `solver/croquis_solver/data/friction.json`                                             |
| Geometría de vías reales                                                   | OpenStreetMap (ODbL, atribución visible)                                                                                  | F8   | pendiente                                                                                         |
| Texturas, HDRI, modelos                                                    | Poly Haven, Quaternius, Kenney (CC0)                                                                                      | F3   | pendiente                                                                                         |
| Personas                                                                   | MakeHuman / MPFB (CC0)                                                                                                    | F5   | pendiente                                                                                         |
| Deformación medida en autos reales (E5)                                    | NHTSA Vehicle Crash Test Database (reportes con fotos y aplastamiento posterior a la prueba) y CISS (aplastamiento C1–C6) | F10  | pendiente: inventario de pruebas y casos con medidas completas y fotos útiles (PLAN §9, ADR 0018) |

## INEGI ATUS

### Cómo se obtuvo

La pestaña "Datos abiertos" de https://www.inegi.org.mx/programas/accidentes/ se renderiza con JavaScript; las ligas se localizaron con Chromium headless (Playwright) y con la API de descarga masiva del INEGI (`/app/api/descarga/componente/descargamasiva/lista/archivoscompaginacion?...&idBiinegi=7&datosAbiertos=1`), que lista el conjunto `conjunto_de_datos_atus_anual` con cobertura `1997|2025`.

```powershell
uv run croquis-data atus download   # 140 MB → data/raw/atus/ + manifest.json
uv run croquis-data atus process    # ~3 min en la laptop de referencia → data/processed/atus/*.csv
uv run croquis-eval atus-summary    # → eval/results/atus_summary.json
```

El zip trae un CSV por año (29 archivos, 2.85 GB descomprimidos). El script extrae un año a la vez a un archivo temporal, lo agrega con `polars` en modo streaming y lo borra; la memoria se mantiene acotada.

### Verificación de la ingesta

- El total de 2021 recalculado (340,415 accidentes) coincide exactamente con la cifra que citaba PLAN §1 (INEGI, ATUS 2021).
- Los totales de 2024 (374,949) y 2025 (380,391) coinciden con los que la prensa reportó del comunicado del INEGI de julio de 2026.
- Pruebas unitarias con un zip sintético cubren: exclusión de "Certificado cero", suma de víctimas por rol, unión con el catálogo de entidades, compatibilidad con los nombres de columna antiguos y verificación de tamaño de la descarga.

### Lo que ATUS no cubre

- Carreteras federales (las reporta la Guardia Nacional / SICT) ni percances no reportados a la autoridad municipal.
- Fallecimientos posteriores al accidente (ATUS cuenta muertos **en el lugar**).
- Velocidades, trayectorias, deformaciones ni ninguna variable física: ATUS sirve para dimensionar el problema y para la distribución de tipos de accidente del benchmark, no para validar el solver.
- Para 2025 el INEGI advierte que las víctimas del accidente del Puente de la Concordia (CDMX, 2025-09-10) están bajo resguardo y no aparecen en los conteos.

## Fichas técnicas de vehículos

47 modelos consultados el 2026-10-10 (URL por fila en `data/vehicles/models_raw.json`). 28 tienen masa en vacío, largo, ancho, alto y distancia entre ejes; el resto tiene huecos que los fabricantes no publican (ningún fabricante de autobuses en México publica la tara; Kenworth y Freightliner no publican largo ni alto del tractocamión; las marcas de bicicletas rinden la tabla de pesos con JavaScript). `uv run croquis-data vehicles build` convierte las fichas en rangos de plausibilidad por clase y marca por campo si el rango sale de fichas, de una fuente secundaria, del PBV o de un supuesto de respaldo. Los topes de velocidad por clase son constantes de diseño del validador (`VELOCIDAD_MAX_KMH`), no mediciones.

### Lo que estas fichas no cubren

- Rigidez estructural (coeficientes A/B de CRASH3): sale de las pruebas de choque de NHTSA (sección siguiente).
- Masa real al momento del percance (ocupantes y carga): el rango usa el PBV como tope.

## NHTSA Vehicle Crash Test Database (E2)

### Cómo se obtuvo

La API pública de NHTSA (`nrd.api.nhtsa.dot.gov/nhtsa/vehicle`, especificación OpenAPI en `/v3/api-docs`) expone las pruebas de choque de la agencia. `croquis-data nhtsa download` lista las pruebas vehículo contra barrera (3388) y baja por prueba el detalle del vehículo, de la barrera y de la prueba. Guarda una respuesta por prueba en `data/raw/nhtsa/`, de modo que la descarga se reanuda si se corta. `croquis-data nhtsa process` arma `data/processed/nhtsa/vtb_tests.csv`.

```powershell
uv run croquis-data nhtsa download --workers 4   # reanudable; una respuesta por prueba
uv run croquis-data nhtsa process
uv run croquis-eval e2-barrier                   # → eval/results/e2_barrier.json y stiffness_classes.json
```

### Filtros de E2

E2 usa pruebas frontales a 0° contra barrera rígida plana (`FLAT BARRIER` o `LOAD CELL BARRIER`, sin desplazamiento, ángulo ni poste), de vehículos de producción, modelo 1995 o posterior, a 40–65 km/h y con los seis puntos de perfil presentes. Quedan 1316 pruebas. Los conteos de descarte por criterio están en `eval/results/e2_barrier.json` (`conteos`).

Mapeo de carrocería NHTSA a clases del contrato (`classify` en `eval/croquis_eval/e2_barrier.py`):

- pickup → pickup; bus → autobús; van o minivan → van; truck o chassis → camión unitario.
- utility, SUV o MPV → SUV compacta si mide menos de 4.75 m, si no SUV grande.
- hatchback de 3 o 5 puertas → hatchback.
- sedán, cupé, convertible o vagoneta → sedán compacto si mide menos de 4.55 m, si no sedán mediano.

### Lo que E2 no cubre

- Zonas lateral y trasera. Las pruebas laterales usan barrera deformable móvil y el método de barrera rígida no aplica; el solver usa el respaldo marcado `supuesto`.
- Motocicletas, bicicletas, scooters, autobuses y tractocamiones: no hay pruebas frontales de barrera rígida utilizables. Camión unitario tiene 5, apenas el mínimo para evaluar.
- La flota mexicana: son vehículos vendidos en EE. UU. Las clases se definen por geometría y masa, no por marca.
- Velocidades fuera de 40–65 km/h: el modelo lineal de CRASH3 se extrapola fuera de ese rango.
