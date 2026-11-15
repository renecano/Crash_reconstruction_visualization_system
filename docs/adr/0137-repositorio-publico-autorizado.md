# ADR 0137 · El repositorio es público con autorización de CESVI

- **Estado:** aceptado (2026-11-15).
- **Fecha:** 2026-11-15
- **Frente:** W (datos de CESVI); aplica a todo el repositorio.
- **Relacionados:** ADR 0049 (acceso protegido al caso real, ya reemplazado), ADR 0133 (redacción de datos personales en las rutas de CESVI), auditoría del 2026-11-15 (`docs/auditoria/2026-11-15-fable.md`, hallazgo C4).

## Contexto

La auditoría del 2026-11-15 marcó como crítico (C4) que el repositorio de GitHub es público, con licencia MIT, y lleva material de CESVI: el caso A2010930 (aseguradora, número de siniestro como identificador, fecha, kilómetro, municipio, vehículos y la declaración del conductor), el corpus estructurado derivado de los 671 reportes (`data/cesvi/corpus`, `data/cesvi/r4`) y un dictamen casi completo en las grabaciones. `CLAUDE.md` decía que los reportes son «de uso libre para este proyecto», que no es lo mismo que publicarlos. La auditoría no sabía si CESVI había autorizado la publicación y lo dejó como pregunta para René.

## Decisión

René decidió el 2026-11-15 que **el repositorio se queda público: CESVI lo autorizó**. Con eso el hallazgo C4 queda resuelto por decisión de René.

Este ADR registra la decisión de René y lo que él informa de CESVI; no hay en el repositorio un documento de CESVI que la respalde.

## Lo que sigue igual

- **Datos personales:** nombres, placas, teléfonos, pólizas, VIN y folios no entran al repositorio ni se envían a Claude (ADR 0133). La auditoría no encontró ninguno en lo versionado.
- **Lotes crudos:** `data/raw/cesvi/` sigue fuera de git, por tamaño.
- **Llaves y tokens:** solo en `.env.local`, nunca versionados.
- **IA responsable (PLAN §10):** sin culpas ni diagnósticos, y con la leyenda ilustrativa en vistas y exportaciones.

## Consecuencias

- No se pasa el repositorio a privado ni se sacan `data/cesvi/corpus` y `data/cesvi/r4`; tampoco se seudonimiza el caso de AXA.
- El release público `fotos-promo` y los paquetes de caso en Vercel Blob quedan cubiertos por la misma autorización.
- Si CESVI retira o acota la autorización, el camino es el que proponía la auditoría: repositorio privado, o sacar los datos derivados a almacenamiento privado y seudonimizar el identificador y la aseguradora del caso. Borrar los archivos no los quita de la historia de git ni de las copias que ya existan.
