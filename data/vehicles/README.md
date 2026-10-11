# data/vehicles

`models_raw.json`: 47 modelos de vehículos comunes en México con masa en vacío, peso bruto vehicular, largo, ancho, alto y distancia entre ejes, cada uno con la URL de la ficha técnica consultada el 2026-10-10 (`fuente_tipo`: `oficial` = sitio o catálogo del fabricante; `secundaria` = copia de la ficha alojada por un distribuidor o publicación que cita al fabricante). Los valores derivados (por ejemplo masa = PBV − carga útil) están explicados en `notas`; los campos que la ficha no publica quedan en `null`.

Uso: solo masas y dimensiones por clase para la validación de plausibilidad (`packages/scene-schema/vehicle_classes.json`, generado con `uv run croquis-data vehicles build`). Croquis no usa logotipos ni modelos 3D de marcas (PLAN §7.2).

Cobertura (modelos completos / total): sedán compacto 2/3, sedán mediano 3/4, hatchback 2/3, SUV compacta 3/3, SUV grande 2/4, pickup 3/4, van 3/3, microbús/combi 1/3, autobús 0/3 (los fabricantes no publican tara), camión unitario 3/4, tractocamión 0/2, motocicleta 5/5, bicicleta 0/2 (solo masa, secundaria), scooter 1/4. Las clases sin fichas usan rangos de respaldo marcados `supuesto` en la tabla.
