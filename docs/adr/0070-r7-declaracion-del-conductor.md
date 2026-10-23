# ADR 0070 — R7: comparar la declaración del conductor con la reconstrucción

- **Estado:** aceptado (2026-10-22).
- **Contexto:** R7 de `docs/cesvi/PLAN-CESVI.md` es un complemento opcional. El perito pega una o más declaraciones; Croquis arma esa versión y la muestra en 3D y 2D, lado a lado o superpuesta, contra la reconstrucción.
  - Debe mostrar «Qué cambia entre versiones» e indicadores de correspondencia de daños.
  - Una sugerencia solo si el perito la activa. Sin culpas.
  - El prototipo de AXA ya lo hace, pero para dos vehículos A y B y sin el solver. «Caso nuevo» tiene N vehículos (V1, V2…) y la reconstrucción física.

## Decisión

- **Lectura** (`declaracion.ts`, prompt `declaracion-caso-v1`, `POST /api/cesvi/declaracion`):
  - Claude ordena la declaración en las filas del corpus (C0), con los vehículos del caso en el mensaje (`descripcionVehiculo`) y quién conducía el declarante. Así «mi carro» o «el Jetta azul» quedan como V1, V2…
  - **Lo que se lee:**
    - `movimiento`: maniobra y velocidad declarada; la sección suma el campo `velocidad`;
    - `impacto`: participantes y la cara de contacto;
    - `posicion`: dónde dice que quedó.
  - **Revisión:** `versionDeclarada` revisa cada cita contra la declaración y cada velocidad contra su cita. Lo que no está se descarta y se cuenta.
- **La versión declarada** (`especDeclarada`):
  - parte de la escena de la reconstrucción (mismo lugar, mismos vehículos y punto de impacto);
  - cambia lo que declara el conductor (maniobras, velocidades y caras de contacto del primer impacto), con fuente «usuario» y la nota «Lo declara el conductor.»;
  - sin velocidad declarada, un vehículo va a la que fija la reconstrucción, marcada y dicha en los límites;
  - se quitan las posiciones finales del perito, que son evidencia: el solver la simula hacia adelante.
- **«Qué cambia entre versiones»** (`compararDeclarada`), por vehículo y con su fuente:
  - **Velocidad previa:** la declarada contra el rango p10–p90 que fija la inversión. Coincide si cae dentro. No es indicador.
  - **Posición final:** dónde la deja la versión declarada contra la reconstrucción. Coincide a menos de un largo del vehículo.
  - **Zona de contacto:** la de la versión declarada contra las caras dañadas que observó el perito.
  - **Dirección de la deformación:** la que deja la cara que dice el conductor o, si no la dice, la fuerza principal simulada (±1 h del reloj; las oblicuas no dan dirección). Contra la dirección observada.
  - **Altura:** de los daños de las dos caras que se tocan según la versión declarada; coincide si los rangos se traslapan.
- **Sugerencia** (`sugerirDeclarada`):
  - sale solo si el perito marca «Mostrar la sugerencia de Croquis»;
  - cuenta los indicadores con dato y habla de compatibilidad de los daños y la evidencia con la versión, no de personas;
  - la regla se le muestra al perito, que confirma o descarta.
- **En «Caso nuevo»:**
  - un panel plegado, después de la reconstrucción;
  - la versión declarada entra al visor como hipótesis (`VisorEscena.hipotesisExternas`): fantasmas sobre la reconstrucción o «Comparar lado a lado», con lo que ya tenía el visor desde F7. El panel de hipótesis no la quita.
- **Pruebas:**
  - unitarias con la lectura grabada (`data/cesvi/grabaciones/declaracion/declaracion-e2e.json`, 0.0146 USD, `data/cesvi/scripts/declaracion-e2e.mts`);
  - la e2e `@flujo` de «Caso nuevo» pega la declaración del conductor de V2, la compara, ve los fantasmas en 3D y lado a lado, pide la sugerencia y la descarta.

## Límites

- **Geometría:** la versión declarada conserva la geometría del impacto de la evidencia (dónde y con qué rumbos se encontraron). Una declaración que cambia el rumbo o el lugar no se simula; se compara lo que sí cambia.
- **El 2D:** el croquis no dibuja la versión declarada; está en el 3D y en la tabla. Va en «Endurecimiento pendiente».
- **Declaraciones:** una por vez. Para comparar otra, se pega otra.
- **Las caras:** solo se aplican las del primer impacto que dice el conductor.

## Consecuencias

- **El perito puede ver la versión de un conductor** al lado de lo que reconstruyó con la evidencia, con las diferencias medidas y sin veredicto, salvo que lo pida.
