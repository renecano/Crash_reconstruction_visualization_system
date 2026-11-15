# ADR 0117 · U8 · El visor de Unity dibuja el daño del solver, y el 3D se puede pausar y recorrer

- **Estado:** aceptado (2026-11-15). El código está probado; falta el build web y su publicación.
- **Fecha:** 2026-11-15
- **Frente:** U
- **Relacionados:** auditoría del 2026-11-15 (hallazgos C2, I3 y §2.3; Tanda 2 del plan), ADR 0111 (Unity solo reproduce), ADR 0116 (integración del visor), `docs/physics.md` («Del perfil del solver al daño visual»).

## Contexto

La regla del proyecto dice que en Unity todo movimiento sale del `Resultado` y el daño, de `dano.perfil_m`. La auditoría encontró que `CampoDano.Hornear`, el algoritmo probado en CI, no lo llamaba nadie al dibujar: los vehículos chocaban y quedaban sin deformar (C2). La bitácora decía lo contrario. Además, con Unity cargado el perito no podía pausar, repetir ni ir a un instante (I3), y un caso sin escenario no llevaba la leyenda ilustrativa (§2.3).

## Decisión

### 1. El daño

- **Unity sigue sin calcular daño.** Toma del `Resultado` el perfil de aplastamiento del solver, su ancho, su centro y la cara del CDC, y con ellos deforma la carrocería (`CampoDano`, sin cambios).
- **`Croquis.Core/DanoDelCaso.cs`** (probado con `dotnet test`, sin Unity) decide qué vehículo lleva daño, desde qué instante se ve y cómo queda cada vértice en el marco local de Unity.
- **`Visor/DanoVista.cs`** prepara, al armar cada vehículo, una copia deformada de cada pieza de la carrocería que el daño toca. `VehiculoVista.Colocar` pone la malla original antes del impacto y la deformada después; al regresar el tiempo, vuelve la original.
- **Desde cuándo se ve:** desde el primer impacto en el que participa ese vehículo (en una carambola, el de atrás se daña después).
- **Las normales** se rehacen solo donde la lámina se movió; el resto conserva las del modelo.
- **Lo que no se deforma:** las ruedas; un vehículo de dos ruedas (sin cara continua, como en el visor web); y la caja de respaldo de una clase sin modelo, que no tiene malla donde se note.
- **La sombra unida** de las calidades baja y media se arma con la carrocería original: no sigue al daño.

### 2. Los controles del 3D

`<VisorUnity>` lleva la barra de la maqueta 2D: reproducir y pausar, deslizador, ¼× ½× 1×, «Ir al impacto», «Ver todo» y «Repetir». Solo manda mensajes que el puente ya tenía (`velocidad` y `encuadrar` existían y nadie los enviaba), así que funciona con el build publicado. Va arriba de la leyenda del visor y se oculta al presentar y al editar en 3D.

### 3. La leyenda y la página de medición

- La leyenda va siempre: con escenario, «Reconstrucción ilustrativa · entorno procedural: no es el lugar real»; sin él, «Reconstrucción ilustrativa».
- `medir.html` sale del sitio publicado (queda en `tools/unity/`). `medir-e6.html`, que usa la medición de la computadora de demo, se queda y lleva `noindex`.

## Pruebas

- `Croquis.Core.Tests/DanoDelCasoTests.cs`: los vehículos con perfil del solver llevan daño; el instante es el de su primer impacto; en el marco de Unity el frente se hunde hacia atrás y lo demás no se mueve; y una prueba que **falla si el visor deja de preparar o de mostrar el daño**, que es justo lo que pasó.
- `Assets/Croquis/Tests/DanoEnUnityTests.cs` (EditMode, en Unity): la malla del `MeshFilter` cambia desde el impacto, vuelve al regresar el tiempo, espera al impacto de ese vehículo y no se inventa sin perfil.
- `reproduccion.test.ts` y `barra-reproduccion.test.tsx`: qué mensajes manda cada control.

## Lo que falta

- **El build web y su publicación.** El daño no se ve en producción hasta entonces. El build es pesado (va en la computadora del colaborador) y publicar necesita el token de René.
- **Verlo sobre los modelos reales.** Las pruebas usan una rejilla; la tolerancia de 2 cm o 6 % está medida en una caja con la densidad del visor. Faltan capturas de AXA después del impacto.
- **La sombra unida** con la carrocería deformada.
