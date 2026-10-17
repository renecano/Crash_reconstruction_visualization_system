# ADR 0021 — Faros y alumbrado con luz real (F8b)

- **Estado:** aceptado (2026-10-16)
- **Contexto:** de noche el visor solo hacía brillar materiales: faros, calaveras y luminarias emisivas, más una luz ambiental cálida si había alumbrado. No había conos de luz. Además:
  - **Faros:** se encendían en todos los vehículos de noche, incluidos los estacionados y los que la escena declara con luces apagadas.
  - **Luminarias:** brillaban también en una noche sin alumbrado.
  - **Consistencia:** el solver ya decide qué se ve de noche con el cono de los faros (semiángulo de 30°, ADR 0008), y el visor no lo mostraba.

## Decisiones

1. **Faros con luz real** (`night-lights.ts`):
   - **Foco:** un `SpotLight` por vehículo con luces, montado en el vehículo, entre sus faros. Apunta al piso unos 25 m adelante.
   - **Cono:** el mismo semiángulo de 30° que usa el solver, así que lo que el visor ilumina coincide con lo que el análisis de visibilidad da por visible.
   - **Faros rotos:** si el daño los rompe (ADR 0007), la intensidad baja en proporción a los faros que siguen sanos desde el impacto.
   - **Luces encendidas:** sin `luces_encendidas` declarado, las luces van encendidas, como en el solver. Con `false`, ni foco ni brillo.
   - **Estacionados:** siempre apagados.
2. **Alumbrado con luz real:** cada poste de la escena lleva un foco hacia abajo (semiángulo de 55°), solo si la escena declara alumbrado público. Sin postes, el alumbrado sigue siendo la luz ambiental cálida: el visor no inventa postes que la escena no tiene. La luminaria solo brilla si hay alumbrado.
3. **Tope por nivel de calidad**, porque cada luz cuesta en cada píxel que toca (E6):
   - **baja:** ninguna luz real, solo los materiales brillan;
   - **media:** 2 vehículos y 2 postes;
   - **alta:** 4 y 4.

   Primero los vehículos involucrados y los postes más cercanos a la acción. Los focos no proyectan sombra (costo); queda pendiente para alta si E6 lo permite.

4. **Intensidades ilustrativas** (candelas de three.js), calibradas contra la luz ambiental de la escena, que tampoco es fotométrica:
   - **Faro:** a 20 m da más o menos la luz ambiental (E = I/d²: 600, alcance 70 m).
   - **Luminaria:** a 8 m de alto da un poco más bajo ella (220, alcance 35 m).
   - **Verificación:** con capturas locales de `poste` y de `peaton_cruce` de noche sin alumbrado. Con 40 y 55, que fue el primer intento, los focos casi no se veían.

## Consecuencias

- **Capturas que cambian:** las nocturnas (`poste`, `nocturno_lluvia` y la de clima de noche sin alumbrado).
- **E6:** se vuelve a medir junto con F8a antes de fusionar.
- **Pendientes:**
  - sombras de los focos en alta;
  - luminarias a lo largo de la vía cuando la escena venga de OSM con postes reales (F8d);
  - que la lluvia nocturna se ilumine con los faros. Las gotas no reciben luz porque su material no se ilumina; se dejó así por costo.
