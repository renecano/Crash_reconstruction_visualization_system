# Bitácora del frente U · Visor Unity, contratos e integración

Plan: `docs/cesvi/PLAN-CESVI.md` §3.3. Reglas: `CLAUDE.md`. ADR del bloque 0110–0129 (el 0110 ya estaba usado, así que este frente empieza en el 0111).

## Estado

- **Fase actual:** U0. PR de organización (este) y PR de contrato 2.3.0.
- **Siguiente paso:** U1, en cuanto U0 esté en `main`.

## U-pre (hecho, #181)

AXA abre con su escena colocada, un número por cantidad y Lighthouse medido. El detalle y las cifras están en `docs/PROGRESS.md`, sección «AXA abre con su escena colocada».

## U0

- **Plan:** contrato 2.3.0 (§2.2) con migración de fixtures, `caso3d.schema.json`, `armarCaso3d`, generador de C#, `visor-puente.md`, fixtures caso-3d, ADR 0111, estas bitácoras, `CLAUDE.md` y el plan.
- **Decisiones:** ADR 0111, sección «Lo que se decidió al verificar».
- **Instalado:** .NET SDK 10.0.403 en `D:\dotnet-sdk` (783 MB, sin tocar C: ni el PATH), para compilar `Croquis.Core` y sus pruebas; `quicktype` 26.0.0 como dependencia de desarrollo de `@croquis/scene-schema`.
- **Evidencia:** los tipos C# leyeron y reescribieron los 20 paquetes de `fixtures/caso3d/` sin diferencias. Suites locales: scene-schema 175, extraction 851, solver-ts 188, cesvi 306. Con cesvi corriendo junto a otra instalación, una prueba pasó su límite de tiempo; sola pasa, y sin esa carga también (22 de 22 en su archivo).

## Necesito del otro frente

Nada por ahora.

## Bloqueado

- **Unity 6.3 LTS:** en esta laptop solo está 6000.4.2f1 (`D:\Unity\Editor`), que no es LTS. El plan pide 6.3 LTS, y §5 deja la instalación a René. Se resuelve antes de U1.
