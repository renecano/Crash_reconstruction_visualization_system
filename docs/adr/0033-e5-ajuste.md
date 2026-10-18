# ADR 0033 — E5: ajuste de la forma y el ancho del daño por zona, solo con desarrollo (F10)

- **Estado:** aceptado (2026-10-18). Se escribió **antes de correr el test** de E5, que sigue sin correrse. Todo lo de aquí usa solo la partición de desarrollo del ADR 0032.
- **Relación:** completa el «Ajustes: solo con desarrollo» del ADR 0032.

## Lo que mostró la primera corrida de desarrollo

`eval/results/e5_desarrollo_antes_ajuste.json` (`pnpm --filter @croquis/eval-js e5`) y su resultado por caso (`eval/e5/resultados_desarrollo.jsonl`, no versionado):

- **La malla no es la fuente del error.** En las estaciones del propio solver, la malla del visor reproduce su perfil con una mediana por zona de 0.04 a 0.31 cm por estación, salvo frente/trasera C con la regla nueva (0.86 cm), y un p95 de a lo más 1.47 cm (`diagnostico_desarrollo.fidelidad_malla` en `eval/results/e5_desarrollo.json`). Los errores salen de las reglas de forma, ancho y centro del solver.
- **Frente y trasera en CISS se miden de esquina a esquina de la defensa** («LFBC to RFBC»). Por eso D vale 0 en 3,600 de 3,609 casos de desarrollo (`diagnostico_desarrollo.ciss_frente_trasera_d`) y la mediana de L va de 0.75 a 0.80 del ancho del vehículo en las zonas D, L, R, Y y Z (`e5_ajuste.json`). Croquis usa 1.0 en la zona D, 0.66 en Y/Z y 0.4 en L, R y C.
- **Costados:** D sí varía. Los anchos reales son menores que los de Croquis: medianas de 0.20 del largo en F y B, 0.52 en P y 0.62 en D (`e5_ajuste.json`).
- **Energía:** en CISS (fuera de muestra) el área del perfil no tiene sesgo apreciable. En NHTSA frontal (dentro de muestra) Croquis se queda corto: −4.3 cm de aplastamiento medio en la población de E2 y −13.8 cm en modelos anteriores a 1995, que E2 no usó (`uv run croquis-eval e5-energia` → `eval/results/e5_convencion_energia.json`). La causa de los −4.3 cm es una diferencia de convención; con la energía de CRASH3 el sesgo sería +0.4 cm:
  - **E2** calibró A y B con la energía de CRASH3, ½ m ΔV² con ΔV = v (1 + e).
  - **El solver** reparte la energía disipada, ½ m v² (1 − e²), como `crash3.delta_v_barrier`.

  No se cambia: con la convención actual, los datos de choques reales no tienen sesgo (E3: −0.6 km/h en test; E5-CISS: área sin sesgo), y Croquis reconstruye choques reales. Queda como límite documentado de E5-NHTSA.

## Qué se ajusta y cómo se elige

Solo la regla `crushShapeAndWidth` (forma y ancho por cara y zona del CDC; el ADR 0032 permite ajustar «la elección de forma por zona»). Los centros no cambian: el ADR 0032 no los incluye entre lo que se puede ajustar. Los postes y los objetos angostos no entran, porque su forma sale de `narrowObject`.

Por grupo (frente/trasera o costado, y zona), con `eval/js/e5_ajuste.ts`:

1. **Ancho candidato:** la mediana de L medido / largo de la cara, con las dos fuentes.
2. **Formas candidatas:** las cinco que ya tiene Croquis (uniforme, izquierda, derecha, centro, poste) y una **empírica**:
   - **De dónde sale:** la media de los perfiles medidos normalizados a su máximo, en los casos de CISS con el orden de C1–C6 conocido.
   - **Simetría en frente y trasera:** L se junta con R espejado y Y con Z espejado; D y C se hacen simétricas.
   - **Costados:** P y D se hacen simétricas. F y B no se juntan, porque la parte delantera y la trasera del costado no son espejo.
   - **Mínimo de casos:** solo existe con ≥ 15 casos ordenados después de juntar.
   - **Escala:** máximo 1 y piso de 0.05, como las demás formas.
3. **Métricas:** las cuatro del ADR 0032, como mediana del error absoluto: por punto (CISS con orden conocido; cuenta solo con ≥ 15 casos), profundidad máxima, ancho y área. Se calculan con el perfil del solver en las estaciones reales (la malla lo reproduce, punto 1) y se confirman con la corrida completa sobre la malla.
4. **Regla de adopción:**
   - **Qué entra:** un candidato (ancho nuevo × forma) solo se adopta si **ninguna** métrica empeora respecto a la regla actual.
   - **Cuál gana:** entre los que cumplen, el de menor error por punto. Sin error por punto, el de menor suma de las otras tres.
   - **Si no hay ninguno:** la regla actual se queda.

**Cómo se decidió la regla de adopción:** después de una primera búsqueda solo con las formas existentes. Esa búsqueda mostró que el ancho real mejora mucho el error de ancho, pero empeora el error por punto en varios grupos: con el ancho real, las formas actuales caen menos que el perfil medido. Por eso se agregó la forma empírica y una regla que no deja empeorar ninguna métrica.

## Resultado de la búsqueda

`eval/results/e5_ajuste.json`:

- **Se adoptan:** frente/trasera C (uniforme, 0.89 del ancho; 18 casos, sin error por punto) y costados D (centro, 0.62), P (centro, 0.52), Z (uniforme, 0.37) y B (uniforme, 0.21).
- **Se quedan como estaban:** frente/trasera D, L, R, Y y Z, y costados F e Y. Ningún candidato mejoró sin empeorar alguna métrica.
- **La confirmación sobre la malla** (antes y después por fuente y tipo) está en `docs/PROGRESS.md`, paso 4 de F10.

## Consecuencias

- El cambio va al solver de referencia en Python y a su port TS a la vez, con las pruebas de paridad, los artefactos de E7/E8 y los snapshots actualizados.
- **Resultados de desarrollo:**
  - `eval/results/e5_ajuste.json` guarda cada grupo con sus candidatos y la elección.
  - `e5_desarrollo_antes_ajuste.json` guarda el antes. Los dos se midieron en el commit `1fb05ad`, limpio y con la regla anterior; si se vuelve a correr la búsqueda ahora, compara contra la regla nueva.
  - `e5_desarrollo.json` guarda el después, medido en el commit de la regla nueva.
- El test de E5 se corre una vez al final con la regla ya fija.
