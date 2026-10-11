# ADR 0003 — TypeScript 6.0 en lugar de 7.0

- **Estado:** aceptado (2026-10-10)
- **Contexto:** El 8 de julio de 2026 se publicó TypeScript 7.0 (compilador nativo en Go). Según el anuncio oficial, 7.0 **no incluye API programática** (llegará con 7.1 y será distinta), y el equipo recomienda mantener `typescript` apuntando a 6.0 para herramientas que la importan, como typescript-eslint. En el registro npm, `typescript-eslint` 8.71.1 declara `typescript >=4.8.4 <6.1.0`.
- **Decisión:** el catálogo fija `typescript@6.0.3` (última 6.x estable). Next.js 16.4 requiere ≥ 5.1, así que es compatible. No se usa el alias `@typescript/native` todavía.
- **Consecuencias:** `tsc` es el de 6.0 (más lento que 7, aceptable para el tamaño del repo). Cuando typescript-eslint y Vitest soporten la API de 7.1, se abre un ADR para migrar; mientras, Dependabot propondrá la actualización y se rechazará con referencia a este ADR.
