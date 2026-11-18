# ADR 0142 · Las condiciones del lugar y las personas en el expediente

- **Fecha:** 2026-11-18
- **Estado:** aceptada. René aprobó los cambios de cifras el 2026-11-18, después de comprobar que las que CESVI ya vio no cambian (`eval/results/ronda4_cifras_estables.json`).
- **Pedido:** René, ronda 4:
  - **A1:** «Crucero de noche» y «Carambola de noche con lluvia» se veían de día y en seco. Lo correcto es que la lluvia use la fricción de mojado y que el 3D se vea de noche y mojado.
  - **A3:** colocar peatones y ciclistas en La escena, porque los atropellos son una modalidad clave.

## Decisión

### 1. Dos campos opcionales en el expediente, dentro de 2.3.0

- **`caso.condiciones`:** la superficie de rodamiento, su estado, el clima y la iluminación, cada uno con su fuente y su cita.
- **`personas[]`:** el peatón o el ciclista, dónde estaba cuando lo golpearon, hacia dónde iba y dónde quedó. Además, `impacto.persona`, que dice quién fue golpeado.
- **Sin subir la versión:** las versiones anteriores la subían en cada campo opcional, pero el build publicado de Unity lee la escena dentro de `caso-3d` y rechaza cualquier versión que no sea «2.3.0» (`VersionEsquemaConverter` en `Caso3d.cs`). Subirla rompería el 3D en producción hasta publicar un build nuevo. En cambio, Newtonsoft ignora los campos que no conoce (la configuración por omisión), así que estos dos campos opcionales no rompen nada.
  - **Pendiente:** el próximo build de Unity debe aceptar un rango de versiones; anotado en `docs/PROGRESS.md`.

### 2. Las condiciones salen de la narración, sin IA

- **`condiciones.ts`** lee la narración (o el dictamen importado) con el vocabulario de los peritos: «carpeta asfáltica mojada», «se registraba lluvia ligera», «de concreto hidráulico», «iluminación artificial funcionando».
- **Cada condición lleva su frase literal.** La lectura con Claude no las pide: cambiar su prompt obligaría a volver a grabar las lecturas.
- **Lo que no describe la vía no cuenta:** «acotamiento de terracería», «poste de concreto», «faro de niebla» y una «mancha de aceite» que dejó el choque.
- **Cómo entran al cálculo:**
  - La superficie y su estado, como dichos por el perito (`usuario`), fijan la fricción.
  - Si llueve y la narración no dice cómo estaba la carpeta, se supone mojada y queda declarado.
- **La luz sale de la hora del relato** (`iluminacion.ts`) y nunca se supone «noche sin alumbrado», la única luz que entra al cálculo. Esa luz solo cuenta si la narración la dice y la hora es de noche.
- **La medición:** `eval/results/ronda4_condiciones.json`.
  - En los cinco ejemplos solo cambia «Carambola de noche con lluvia»: de 34 a 30 km/h (−11.8 %), porque es concreto mojado (μ 0.55) y no asfalto seco (μ 0.70).
  - En el corpus de CESVI, 80 de 671 narraciones leen una superficie o un estado distinto del asfalto seco que se suponía.

### 3. El atropello, con la persona que coloca el perito

- **Al solver solo pasa la persona del atropello,** la del impacto contra un peatón o un ciclista: con ella la escena lleva `impacto_vehiculo_persona`.
- **Si el perito marca dónde quedó,** la distancia de proyección entra como evidencia y el solver estima con ella la velocidad del vehículo (`pedestrian.ts`).
- **Las demás personas solo se dibujan.** Si entraran como hechos, `buildSpec` convertiría un choque entre vehículos en atropello.
- **«Peatón» ya no es un objeto fijo:** antes la contraparte «peatón» de la lectura se calculaba como un objeto. Ahora, si falta la persona, Croquis avisa que hay que colocarla.

## Consecuencias

- **Las cifras cambian** en los casos con lluvia, con otra superficie o con atropello; René lo aprobó el 2026-11-18.
- **Lo marcado contra lo reconstruido:** si el perito marcó dónde quedó la persona y la reconstrucción la proyecta fuera de ese punto (fuera de su rango), un límite lo dice con las dos cifras, y el 2D dibuja las dos.
- **El 3D se ve de noche y mojado** sin un build nuevo: `caso-3d` ya lleva la noche y lo mojado desde la escena (`environmentFor`).
