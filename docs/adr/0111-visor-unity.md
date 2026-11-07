# ADR 0111 — El visor en Unity y el contrato 2.3.0

- **Fecha:** 2026-11-07
- **Estado:** aceptada
- **Contexto:** CESVI pidió el 3D en Unity y tres cosas para la escena: puntos intermedios, objetos que se mueven y un terreno que afecta la física. Las decisiones vienen de `docs/cesvi/PLAN-CESVI.md` §2. Aquí se registran, junto con lo que cambió al verificarlas.

## Decisiones del plan (§2.1)

1. **Unity 6.3 LTS con URP:** una sola canalización para web y escritorio. Licencia Personal, sin la pantalla «Made with Unity».
2. **El proyecto vive en `apps/visor-unity/`.** Los modelos se cargan en tiempo de ejecución desde Vercel Blob con glTFast: no van binarios pesados a git.
3. **Una sola entrada: el paquete caso-3d v1** (`escena`, `resultado`, `relieve` opcional y `convenciones`). Lo arma `armarCaso3d`.
4. **Los tipos C# se generan** del esquema y CI revisa que estén al día.
5. **Unity solo reproduce.** No usa la física de Unity para el choque ni recalcula.
6. **`Croquis.Core` no depende de Unity:** asmdef con `noEngineReferences` y pruebas con `dotnet test` en CI. En Unity, posición = (x, z, y) y yaw = 90° − rumbo.
7. **El puente** vive en `packages/scene-schema/visor-puente.md`, con tipos TS y versión.
8. **Distribución:** WebGL en Blob con manifiesto versionado, guardando los 2 últimos builds; Windows como zip en un release de GitHub.
9. **Respaldo:** el visor three.js, como «Visor ligero».
10. **Fotos del dictamen:** con `capturar`.
11. **Los builds no corren en CI:** necesitan licencia y pasan de 10 minutos.

## Lo que se decidió al verificar

- **La fuente del perito es `usuario`, no `perito`.** §2.2 dice `procedencia.fuente = "perito"`, pero el enum `Fuente` de la escena no tiene ese valor. Ya existe `usuario` («lo escribió o corrigió la persona»), que es lo que usa hoy la evidencia del perito (`DEL_PERITO` en `packages/cesvi`). Agregar otro valor con el mismo significado obligaría a tratar los dos en cada lectura. Sí existe `perito` en el expediente (`FuenteExpediente`), que es otro enum.
- **Solo faltaban dos tipos de objeto.** `vehiculo_estacionado` y `senal` ya existían. Se agregan `barrera` y `guarnicion`; «pared» es `muro`.
- **`superficies[].tipo` tiene su propio enum,** con los valores de `lugar.superficie` más `grava`, `pasto`, `tierra` y `lodo`. `lugar.superficie` no se toca.
- **`precision_m` es opcional.** Si falta, vale la incertidumbre de una posición medida del solver. No se fija un número en el contrato.
- **Los ángulos nuevos del resultado (`cabeceo`, `alabeo`) van en radianes,** como `rumbo`. La escena sigue en grados (`rumbo_deg`). Lo dice `convenciones`.
- **El evento `cruce_tope` lleva su velocidad en `detalle.velocidad_cruce_kmh`.**
- **Los `$ref` del caso-3d citan el `$id` de cada esquema:** `$id` de la escena `…/escena/1.0.0/…` y del resultado `…/resultado/1.9.0`. Esos números ya no siguen a la versión, que vive en su `const`. No se cambian para no mover referencias.
- **quicktype, con los tres esquemas unidos.** Hay un reporte de que no resuelve bien los `$ref` a otros archivos, así que `generate-csharp.ts` los junta en memoria antes de llamarlo. Si dos esquemas definen el mismo nombre, se le pone prefijo `Resultado` al del resultado.
- **Los paquetes de `fixtures/caso3d/` son 20, no 16.** Las 13 escenas canónicas traen su `Resultado` versionado. Las 3 de inversión (entre ellas, AXA) y las 4 de agentes solo guardan su parte, así que el completo se calcula con el solver TS al generar. `--check` no corre el solver, para no gastar tiempo de CI: en esas 7 revisa la escena y la versión.
- **El `pattern` de `evidencia` del resultado se quedó atrás, y se corrige.** Admitía 6 etiquetas y el solver ya produce otras 4 (`dano_minimo`, `reposo_supuesto`, `rumbo_final_supuesto`, `orden_alcance`). Nadie validaba esos resultados contra el esquema hasta que `armarCaso3d` los empaquetó: el de AXA no pasaba. El solver no cambia.
- **El prompt no aprende los objetos nuevos.** El enum de `evento.objeto` de la extracción sale del esquema, así que `barrera` y `guarnicion` habrían cambiado la huella e invalidado todas las grabaciones. Se filtran en TS y en Python: esos objetos los coloca el perito, y un prompt nuevo se mide antes de usarse.
- **Comprobación de los tipos C#:** con .NET 10.0.403 y Newtonsoft.Json 13.0.3, `Caso3D.FromJson` y `ToJson` leyeron y reescribieron los 20 paquetes sin una sola diferencia (tolerancia numérica 1e-9). Fue una corrida a mano; la prueba en CI llega con `Croquis.Core` en U1.

## Límites y pendientes

- **El límite de carga para caer al visor ligero (§2.1.9):** 45 s, de forma provisional. No está medido: se revisa con la medición de U1 (`eval/results/unity_build.json`).
- **La compresión del build web:** se decide en U6, al verificar qué encabezados sirve Blob.
- **Unity:** la versión exacta se anota en `docs/adr/0001-stack.md` al instalar. El proyecto de prueba de la carpeta del Tec usa 6000.4.2f1, que no es LTS.
- **El solver no recibe la malla de relieve.** `lugar.terreno.relieve.malla_id` solo la cita, y la malla viaja en el paquete caso-3d. Para W5, el solver necesita las alturas: W decide cómo dárselas y, si cambia el contrato, lo sube en su PR.
