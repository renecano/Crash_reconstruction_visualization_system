# ADR 0093 — R12b: agentes especialistas con pizarra

- **Estado:** aceptado (2026-10-26). Desarrolla la parte R12b del ADR 0084.
- **Contexto:**
  - **Hoy el caso es una cadena fija:** la narración pasa por Claude, luego por la revisión de citas y el validador; después el perito coloca, el solver reconstruye, se verifica con el método de CESVI y se arma el dictamen.
  - **Lo que pide PLAN-CESVI R12b:**
    - que esos módulos sean agentes que actúan cuando aparece en la pizarra (el expediente) algo que les toca;
    - coordinación real: el Verificador rechaza un dato y pide releer; cuando la física no cuadra, el Físico pide evidencia al Preguntador;
    - un coordinador con orden determinista y una bitácora que sale en el dictamen;
    - la IA sigue sin producir números físicos finales.
  - **Listo cuando:**
    - el corpus de R4 da los mismos números (o mejores, medidos);
    - la bitácora de un caso sale en su dictamen;
    - el mismo caso con las mismas respuestas grabadas da la misma bitácora.

## Decisión

### 1. La pizarra y los agentes (`packages/cesvi/src/pizarra.ts`)

- **La pizarra** guarda:
  - la narración y las lecturas;
  - la conversión verificada, la escena y el expediente;
  - las preguntas, la reconstrucción, la verificación con el método de CESVI y la comparación con lo que concluyó CESVI;
  - la bitácora.
- **Cada agente** dice si tiene algo que hacer con lo que hay (`quiere`) y, si le toca, actúa (`actua`). Escribe en la pizarra y deja sus mensajes en la bitácora.

| Agente               | Actúa cuando                                                          | Hace (con el módulo de siempre)                                                                                            |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Lector IA            | hay narración sin lectura, o un pedido de relectura                   | lee con Claude (`/api/cesvi/escena`; grabada en pruebas y evaluaciones)                                                    |
| Verificador de citas | hay una lectura sin verificar                                         | `expedienteDeSalida`: descarta citas y números que no están en el texto; si descartó algo, rechaza y pide releer (una vez) |
| Validador            | hay conversión sin escena                                             | `escenaDeConversion` y `problemasExpediente`                                                                               |
| Preguntador          | hay escena sin preguntas publicadas, o un pedido del Físico           | las preguntas de la escena; con un pedido, la de la posición final o la de las huellas de frenado                          |
| Físico               | el perito pide reconstruir (o, en evaluaciones, en cuanto hay escena) | el solver; si una bandera dice que la física no cuadra o no alcanza, pide evidencia al Preguntador                         |
| Verificador CESVI    | el expediente cambió                                                  | `verificacionCesvi` (EBS por deformación)                                                                                  |
| Comparador           | hay conclusiones de CESVI y el expediente cambió                      | `comparar` (la de E-R4 y el paso «Croquis contra el reporte»)                                                              |
| Redactor             | el perito abre el dictamen                                            | deja dicho con qué se redactó; la bitácora va en la trazabilidad                                                           |

- **La relectura:**
  - el mensaje lleva las citas que no se encontraron, para que el modelo copie literal (`mensajeEscena(narracion, rechazadas)`);
  - la primera lectura usa el mensaje de siempre, así que las lecturas grabadas siguen valiendo;
  - el Verificador se queda con la relectura solo si rechaza menos datos que la primera;
  - sin relectura (sin respuesta grabada, o si Claude no responde), se sigue con lo ya verificado.
- **Las preguntas del Físico:**
  - solo para las banderas que el perito puede contestar con un dato del lugar: `reposo_inalcanzable` y `reposo_supuesto_vs_dano` (la posición final), y `velocidad_vs_evidencia` (las huellas de frenado);
  - la deformación no alcanzada no se pregunta: sus medidas C y L se revisan en el paso de los daños.

### 2. El coordinador

- **En cada paso actúa el primer agente** de `ORDEN_AGENTES` que quiere hacerlo, hasta que ninguno quiere (espera al perito) o se llega a 40 pasos.
- **Por qué es coordinación y no una cadena:**
  - el orden de los turnos sale de lo que hay en la pizarra;
  - un rechazo del Verificador hace que el Lector vuelva a actuar antes que el Validador;
  - un pedido del Físico hace que el Preguntador actúe después de la reconstrucción.
- **Determinista:** el mismo caso con las mismas respuestas da la misma pizarra y la misma bitácora. No hay reloj ni azar en la bitácora.
- **La IA solo entra por el Lector:** traduce la narración a filas con su cita. Los números los calculan el solver (Físico) y las fórmulas de CESVI (Verificador CESVI).

### 3. En la app

- **«Leer la narración»** corre la pizarra: el Lector, el Verificador de citas (con su relectura, que vuelve a llamar a la API), el Validador y el Preguntador.
- **Un caso que abre con su escena** (el ejemplo de AXA, uno guardado o un reporte) arranca con `pizarraDeEscena`.
- **Al reconstruir**, el Físico escribe la reconstrucción; sus pedidos se suman a las preguntas del hecho.
- **Al abrir el dictamen** escribe el Redactor.
- **La bitácora** se ve en el paso 4 («Bitácora de los agentes», plegada) y va en la trazabilidad del dictamen (PDF y Word).

### 4. E-R4 por la pizarra

- **`eval/cesvi_r4_reproduccion.mts medir`** corre cada narración por la pizarra, con la lectura grabada (una relectura no tiene respuesta grabada) y el Físico automático en la prueba.
- **Con `salida`** escribe en otro archivo sin tocar lo publicado. Así se midió antes (`cesvi_r12b_r4_antes.json`) y después (`cesvi_r12b_r4_despues.json`).

## Resultados (`eval/r12b_r4_igual.py` → `eval/results/r12b_r4_igual.json`)

- **E-R4 da los mismos números:**
  - 205 de 205 narraciones con la misma escena, la misma comparación con lo que concluyó CESVI y la misma reconstrucción (sin contar el tiempo);
  - el mismo resumen;
  - 205 escenas válidas y 205 reconstruidas en 3D, antes y después.
- **El Verificador de citas pidió releer en 2 narraciones.** Sin relectura grabada, se siguió con lo verificado; por eso no cambia nada.
- **La bitácora** tiene una mediana de 9 mensajes por narración y un máximo de 11.

## Consecuencias

- **Pruebas:**
  - `packages/cesvi/src/pizarra.test.ts` (7):
    - la escena es la misma que sin pizarra;
    - el mismo caso da la misma bitácora;
    - el rechazo y la relectura, con y sin respuesta;
    - el Físico le pide evidencia al Preguntador;
    - el mensaje de la relectura;
    - el Redactor.
  - `apps/web/src/lib/dictamen-caso.test.ts`: la bitácora en la trazabilidad;
  - la e2e `@flujo` del caso nuevo: la bitácora en el paso 4.
- **Límites:**
  - en la app, una relectura le cuesta otra lectura a la API (la cuida el mismo tope de gasto diario);
  - con lecturas grabadas no hay relecturas que medir: falta grabarlas para saber si la relectura mejora E-R4 (en «Endurecimiento pendiente»);
  - la bitácora no se guarda con el caso: al reabrirlo, empieza con «Abre el caso…».
