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

## Consecuencias

- E1 se mide también con `--split ciss` sobre el pipeline TS. El prompt v2 (tabla modelo → clase) se valida en dev y se mide en `ciss`, que ningún prompt ha visto.
- **Cobertura de tipos:** el test no cubre relatos de motociclista, caída de pasajero ni salida del camino sin impacto. Esos tipos siguen medidos solo en el primer test.
- **Texto sintético:** el texto sigue siendo de un modelo (marcado `sintetico: true`). Lo que cambia es de dónde sale la verdad.
