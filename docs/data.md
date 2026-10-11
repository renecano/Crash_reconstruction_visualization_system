# Datos de Croquis

Qué datos externos se usan, cómo se obtienen de forma reproducible y qué **no** cubren.
El registro formal de cada fuente (origen, URL, fecha, licencia, script) está en `data/SOURCES.md`.

## Principios

- Nada se descarga a mano: cada fuente tiene un script en `data/croquis_data/` o `data/scripts/` con verificación de integridad (tamaño o hash).
- Lo crudo vive en `data/raw/` (no versionado). Lo procesado y pequeño vive en `data/processed/` y las cifras que cita el README en `eval/results/`.
- Si un dato no es accesible por formato o licencia, se documenta aquí y se sustituye por la mejor alternativa con fuente. No se inventan números.

## Fuentes por uso

| Uso                                                                        | Fuente                                   | Fase  | Estado                          |
| -------------------------------------------------------------------------- | ---------------------------------------- | ----- | ------------------------------- |
| Magnitud del problema y distribución de tipos de accidente para Relatos-MX | INEGI ATUS (datos abiertos)              | F0    | en curso: ver `data/SOURCES.md` |
| Rigidez CRASH3 por clase y validación E2                                   | NHTSA Vehicle Crash Test Database (API)  | F2    | pendiente                       |
| Validación E3 contra EDR                                                   | NHTSA CISS                               | F7    | pendiente                       |
| Dimensiones y masas por modelo común en México                             | Fichas técnicas de fabricantes           | F1/F2 | pendiente                       |
| Coeficientes de fricción por superficie y estado                           | Literatura (cita por valor)              | F2    | pendiente                       |
| Geometría de vías reales                                                   | OpenStreetMap (ODbL, atribución visible) | F8    | pendiente                       |
| Texturas, HDRI, modelos                                                    | Poly Haven, Quaternius, Kenney (CC0)     | F3    | pendiente                       |
| Personas                                                                   | MakeHuman / MPFB (CC0)                   | F5    | pendiente                       |
| Deformación de alta fidelidad                                              | BeamNG.tech (licencia académica)         | F10   | bloqueado: necesita licencia    |

## Lo que los datos no cubren (se irá completando)

- ATUS registra hechos de tránsito en zonas urbanas y suburbanas reportados por autoridades municipales; no incluye carreteras federales (eso lo cubre la Policía Federal/Guardia Nacional) ni percances no reportados.
