# Bitácora del frente U · Visor Unity, contratos e integración

Plan: `docs/cesvi/PLAN-CESVI.md` §3.3. Reglas: `CLAUDE.md`. ADR del bloque 0110–0129 (el 0110 ya estaba usado, así que este frente empieza en el 0111).

## Estado

- **Fase actual:** U1, en pausa. El sistema detuvo el build WebGL por falta de memoria en el paso 323 de 331.
- **Siguiente paso:** René decide si se repite con el manifiesto recortado o si el build se mueve a otra computadora. Después, medir peso y carga con `eval/unity_build.mjs`.

## U-pre (hecho, #181)

AXA abre con su escena colocada, un número por cantidad y Lighthouse medido. El detalle y las cifras están en `docs/PROGRESS.md`, sección «AXA abre con su escena colocada».

## U0

- **Plan:** contrato 2.3.0 (§2.2) con migración de fixtures, `caso3d.schema.json`, `armarCaso3d`, generador de C#, `visor-puente.md`, fixtures caso-3d, ADR 0111, estas bitácoras, `CLAUDE.md` y el plan.
- **Decisiones:** ADR 0111, sección «Lo que se decidió al verificar».
- **Instalado:** .NET SDK 10.0.403 en `D:\dotnet-sdk` (783 MB, sin tocar C: ni el PATH), para compilar `Croquis.Core` y sus pruebas; `quicktype` 26.0.0 como dependencia de desarrollo de `@croquis/scene-schema`.
- **Evidencia:** los tipos C# leyeron y reescribieron los 20 paquetes de `fixtures/caso3d/` sin diferencias. Suites locales: scene-schema 175, extraction 851, solver-ts 188, cesvi 306. Con cesvi corriendo junto a otra instalación, una prueba pasó su límite de tiempo; sola pasa, y sin esa carga también (22 de 22 en su archivo).

## U1

Rama `feat/u1-visor`. La primera mitad (`Croquis.Core` y su job de CI) va en #184.

- **`Croquis.Core`:** 13 pruebas `dotnet` en verde en CI, sobre los 20 paquetes.
- **Dentro de Unity (6000.3.28f1):** el proyecto compila y 3 de 3 pruebas EditMode pasan: posición, rumbo, cabeceo y alabeo en un `Transform` real.
- **Sin medir todavía:** peso y tiempo de carga (`eval/results/unity_build.json`). No hay ningún build WebGL terminado.

### Memoria en esta laptop (2026-11-07)

8 GB de RAM, Unity solo en modo batch, con el navegador y la otra sesión cerrados. Muestras cada 5 s; las crudas quedaron en `D:\croquis-logs\`, fuera de git.

| Paso                | Duración              | Pico de Unity y sus procesos | Mínimo libre | Máximo comprometido | Cómo terminó                                  |
| ------------------- | --------------------- | ---------------------------- | ------------ | ------------------- | --------------------------------------------- |
| Importación inicial | 6 min                 | 3,136 MB                     | 47 MB        | 12,732 MB           | Bien                                          |
| Pruebas EditMode    | menos de 1 min        | 2,001 MB                     | 699 MB       | 11,497 MB           | Bien                                          |
| Build WebGL         | 9.5 min, sin terminar | 2,595 MB                     | 342 MB       | 13,458 MB           | Detenido por el sistema en el paso 323 de 331 |

- **Lo detuvo Claude Code, no un error de Unity:** su protección de memoria mata los comandos en segundo plano cuando la sesión está inactiva. El log de Unity no trae ningún error.
- **Iba en el enlazado final:** `wasm-opt` seguía vivo con 1,006 MB y lo detuve a mano, igual que un `python` de 23 MB. Quedaron 0 procesos de Unity y 3,032 MB libres.
- **Un primer intento,** con la 6000.4.2f1 en una copia aparte y sin haber cerrado el navegador, se detuvo igual durante las pruebas EditMode, con 398 MB libres.

### Hallazgo: el manifiesto se había inflado

Como el proyecto no tenía `ProjectSettings`, Unity lo trató como nuevo y agregó unos 40 paquetes a `Packages/manifest.json`, entre ellos `purchasing`, `analytics`, `timeline`, `ai.navigation`, `collab-proxy` y todos los módulos. También creó `Assets/Resources/BillingMode.json` y dos archivos de pruebas de rendimiento. El visor no usa nada de eso.

Se regresó el manifiesto a lo que el visor necesita y se quitaron esos archivos. **Sin comprobar:** todavía no se corre Unity con el manifiesto recortado, así que no se sabe cuánta memoria ahorra, ni si Unity vuelve a agregar los paquetes.

### Instalado

- **Unity 6000.3.28f1** en `D:\Unity\Editor`, con WebGL y Windows IL2CPP. Lo instaló el Hub, con René aceptando los permisos.
- **Unity 6000.4.2f1** sigue instalada: René pidió desinstalarla cuando todo pase con 6.3 LTS.

### Pendiente del visor

- **Color del caso:** los modelos marcan sus piezas de pintura en `extras.role`, y glTFast no lo importa por defecto. Por ahora salen con su color de fábrica.
- **Bicicleta y scooter:** no tienen modelo; son una caja de sus medidas hasta U3.
- **Sin implementar aún:** `calidad` (U5), `capturar` y `modoEdicion` (U6) y las cámaras que no son cenital u órbita (U4). Hoy contestan con `error`.
- **La leyenda ilustrativa** todavía no sale en el visor: llega con el escenario y las cámaras.

## Necesito del otro frente

Nada por ahora.

## Bloqueado

- **Dónde se hacen los builds WebGL:** ver «Memoria en esta laptop». Lo decide René.
