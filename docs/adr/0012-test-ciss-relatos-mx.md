# ADR 0012 — Segundo test de Relatos-MX desde los campos codificados de CISS

- **Estado:** aceptado (2026-10-14; pendiente 1 de F7)
- **Contexto:** PLAN §5.2 pide relatos basados en narrativas públicas de casos CISS. Los CSV de CISS no traen narrativas y NHTSA no publica una API documentada para las del Crash Viewer. Además, el primer test de Relatos-MX lo escribió el mismo agente que la línea base de reglas: su verdad depende de quien escribe (limitación declarada en el README del benchmark).

## Decisiones

1. **La verdad viene de los campos codificados de CISS, no del texto.** Cada relato se escribe desde una ficha (`croquis-data ciss relatos`). Quien escribe solo pone el texto y las citas; `relatos check` exige que los hechos sin citas sean exactamente los de la ficha y que todos lleven cita.
2. **Solo CISS 2024.** Es el único año cuyo zip trae el catálogo oficial de etiquetas (`FORMAT24.sas`), y su manual (DOT HS 813 771) liga cada variable con su formato.
   - La traducción va por código, pero cada código guarda la etiqueta que supone y `build` falla si el catálogo dice otra cosa. Un cambio de codificación no puede pasar en silencio.
   - Los años anteriores no traen catálogo y podrían haber cambiado códigos.
3. **Solo equivalencias exactas.** Ejemplos de lo que queda fuera:
   - 'Sleet or Hail' no es granizo y 'Fog, Smog, Smoke' no es niebla;
   - 'Slag, gravel, or stone' puede ser empedrado o grava;
   - un cambio de carril sin lado va como el genérico `cambio_carril`;
   - 'Fence' no se traduce a barda.
     Lo que no tiene equivalente queda fuera de la ficha y se cuenta. La nieve y el hielo descartan el caso: no se adaptan a México.
4. **Velocidad desde el EDR.** Se toma el código 1010 de EDRPRECRASH en el último punto válido (t ≤ 0) del registro del EDR ligado al primer evento (`EDREVENT.CDCEVENT = 1`), sin centinelas 99996/99997.
   - El relato dice ese valor redondeado a 5 km/h, como lo diría una persona, y esa es la verdad de la extracción. El valor original queda en la ficha.
   - Se eligen primero los casos con velocidad del EDR; el sesgo hacia vehículos con EDR queda declarado.
5. **Narra quien maneja el vehículo investigado.** Si los dos tienen EDR, narra el que pega. Con motocicleta, narra quien va en el auto, porque CISS no investiga motos. La velocidad del otro solo se dice si estaba detenido.
6. **Menciones con semilla.** La gente no dice todo: cada hecho se pide con una probabilidad fija (`MENTION`), con semilla 20261014. La clase del vehículo de quien narra y el tipo de evento siempre van.
7. **Escritura y revisión por agentes distintos.**
   - Seis agentes escriben 25 relatos cada uno, sin ver la línea base, el glosario ni las otras partes del benchmark.
   - Otros seis, independientes, revisan cada lote: buscan hechos que el texto afirme fuera de la ficha y citas que no respalden su valor. Pueden cambiar texto y citas, nunca los valores.
8. **Candado propio** (`ciss.lock`), escrito antes de la primera evaluación. `test.lock` no se toca.
9. **Reglas que salieron de escribir y revisar.** Cada una se aplicó al generador y a todos los relatos, no caso por caso:
   - **Clase del relato aparte de la de E3.** La agrupación de E3 (`ciss.clase_ciss`) solo elige rigidez: una GMC Acadia 2011 codificada como vagoneta salía sedán. Para el relato:
     - la carrocería de GV debe decidir la clase sola: vagoneta, coupé, convertible y "otro automóvil" no deciden;
     - debe coincidir con la BodyClass de VPIC;
     - si el modelo está en `modelos.json`, debe coincidir con la tabla. La única excepción es el hatchback de un modelo que la tabla da como sedán, que se nombra con su carrocería ("Rio hatchback").
       Si no hay clase exacta: para quien narra, el caso se descarta; para el otro, se quita la clase y el relato no lo nombra.
   - **Tamaño dicho en el texto.** Fuera de la tabla, compacto o mediano y compacta o grande salen del corte por largo, y el nombre del modelo no lo deja ver. El relato lo dice junto al modelo ("mi sedán mediano Accord").
   - **Hechos que van juntos.** Velocidad 0 con maniobra `detenido`/`estacionado`. Un semáforo, alto o ceda el paso con el tipo de cruce, también cuando NHTSA codifica el choque como 'Intersection-Related' (en la entrada del cruce). Se aplican después del sorteo, sin sortear de nuevo.
   - **Ciclista en su bicicleta.** Como en el resto de Relatos-MX, la bicicleta es un vehículo y el choque es `impacto_vehiculo_vehiculo`.
10. **El prompt v2 queda en producción** (`PROMPT_VERSION = "extraccion_v2"` en Python y TS). v2 es v1 más una regla: la clase de un modelo nombrado sale de la tabla `modelos.json`, que va dentro del prompt. Se decidió en este orden, sin volver atrás:
    1. **Dev** (160 relatos; `e1_extraction_dev.json` contra `e1_extraction_dev_v2.json`). Criterio fijado antes de medir: v2 pasa si no empeora en dev.
       - Sonnet: F1 micro 0.895 → **0.937**, clase 0.638 → 0.944.
       - Haiku: 0.872 → **0.918**, clase 0.662 → 0.932.
       - Citas sin respaldo literal antes del verificador: Sonnet 3 → 1, Haiku 5 → 3.
       - Lo único que baja es el tipo de vía, menos de 0.02 (Sonnet 0.857 → 0.840, Haiku 0.810 → 0.803).
    2. **Test `ciss`**, medido solo después, con las dos versiones (`e1_extraction_ciss.json` y `e1_extraction_ciss_v2.json`):
       - Sonnet: 0.978 → **0.993**, clase 0.851 → 0.975.
       - Haiku: 0.968 → **0.986**, clase 0.819 → 0.942.
       - Repetir el mismo relato: Sonnet 0 → 1 de 150 pares, Haiku 5 → 5.
       - Contrafactuales: Sonnet 0 → 1 de 65, Haiku 3 → 1.
    - **Costo:** el prompt crece con la tabla. Sonnet pasa de $8.42 a $9.42 por 1,000 relatos en `ciss`; Haiku, de $0.99 a $1.05.
    - **Lo que mide la mejora:** la clase verdadera de un modelo que está en la tabla debe coincidir con la tabla (§9). Así que la mejora mide que el modelo use la tabla, no que la tabla sea correcta; eso depende de `modelos.json`, armada con fichas técnicas de fabricantes (`data/SOURCES.md`).
    - **Repeticiones de v1 en dev:** se grabaron al día siguiente (2026-10-15). Repetir el mismo relato cambia 23 de 160 pares en Sonnet y 16 en Haiku, contra 22 y 14 con v2.
    - **Primer test, medido después de decidir** (2026-10-15, `e1_extraction_v2.json`): Sonnet 0.875 → **0.919** (clase 0.638 → 0.921), Haiku 0.852 → **0.896** (clase 0.614 → 0.882). En ese test se descubrió el problema de la clase, así que no entró en la decisión.
    - **Contrafactuales, pareados con la repetición** (E1 desde 2026-10-15, `contrafactual_por_tipo`). En el primer test las diferencias crudas de Sonnet con v2 subieron a 31 de 160 pares, contra 20 al repetir; con v1 eran 18 y 18. Por par se cuenta si cambia solo el contrafactual o solo la repetición, y McNemar exacto compara los dos.
      - Ningún tipo difiere del ruido: sexo 6 contra 2 (p = 0.29), edad 7 contra 2 (p = 0.18), vehículo 5 contra 3 (p = 0.73); en Haiku, edad 6 contra 1 (p = 0.13).
      - En los pares de sexo con velocidad distinta, Sonnet v2 da más rápido al hombre en 3 y a la mujer en 0 (p = 0.25). No es concluyente con tan pocos pares; se reporta en cada corrida de E1.
      - Las reglas son deterministas y cambian con el modelo del vehículo en 6 de 52 pares (p = 0.03). Es un efecto real de la línea base, que es lo que responde cuando Claude no está disponible.

## Consecuencias

- E1 se mide también con `--split ciss` sobre el pipeline TS. El prompt v2 se validó en dev y se midió en `ciss` (§10).
- Los resultados de E1 sin sufijo son de v1, el prompt con que se midió E1 en F6. Los de otras versiones llevan la suya (`_v2`), aunque sea la de producción, para que ningún nombre cambie de significado.
- **Cobertura de tipos:** el test no cubre relatos de motociclista, caída de pasajero ni salida del camino sin impacto. Esos tipos siguen medidos solo en el primer test.
- **Texto sintético:** el texto sigue siendo de un modelo (marcado `sintetico: true`). Lo que cambia es de dónde sale la verdad.
