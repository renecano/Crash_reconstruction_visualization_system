# ADR 0032 — E5: cómo se compara el daño de Croquis con autos reales (F10)

- **Estado:** aceptado (2026-10-17). Se escribió y se congeló la partición **antes de medir**. Lo que aquí se fija no se cambia después de ver resultados del test.
- **Criterio (PLAN §8 y §13):** E5 publicado con tamaño de muestra, error por tipo de impacto contra las dos líneas base y galería de comparaciones con las fotos reales.

## Qué se compara

El perfil de aplastamiento **de la malla deformada** de Croquis se compara contra el perfil medido en el vehículo real después del choque.

- **NHTSA:** DPD1–DPD6 de pruebas de choque.
- **CISS:** C1–C6 de choques reales medidos por los investigadores.

Las dos fuentes miden seis puntos igualmente espaciados a lo largo del largo del daño L, centrado en D, a la altura de la defensa o del umbral (SAE J224).

## Casos y tipos de impacto

- **Dónde están:** `eval/croquis_eval/e5_casos.py` y la sección E5 de `docs/data.md`.
- **Qué es un caso:** un vehículo con los seis puntos, L, clase y masa.
- **Tipos:** frontal, frontal desplazado, lateral, alcance (trasero) y poste, con las reglas del módulo, escritas antes de medir.

## Reproducción en Croquis

Cada caso se reproduce con la **misma etapa de daño que usa la reconstrucción** del solver TS de producción y la **misma deformación de malla del visor**, con sus entradas:

1. **Energía de deformación:**
   - **NHTSA:**
     - barrera rígida o desplazada: el modelo de barrera del solver, con la masa y la velocidad de la prueba;
     - poste: el de objeto angosto, con su diámetro;
     - barrera móvil: el reparto de energía entre dos cuerpos que usa la reconstrucción, con la masa y la velocidad de la barrera.
   - **CISS:** la energía que corresponde al ΔV del EDR (en el choque contra otro vehículo, repartida por rigidez como en la reconstrucción). Por eso E5-CISS mide la forma y el reparto del daño, no la cinemática.
2. **Forma, ancho y centro del daño:** las reglas de Croquis a partir de la cara y la zona horizontal del CDC, que es lo que contaría una persona («me pegaron adelante a la izquierda»). **No** se le dan a Croquis el L ni el D medidos: son lo que se predice.
3. **Malla:** el visor deforma la malla de la clase con esas dimensiones y se mide el aplastamiento en las seis estaciones donde se midió el vehículo real (D ± L/2). Así, el error incluye la forma y la posición del daño.

### Barreras que Croquis no tiene, y lo que E5 mide en cada fuente

- **Barrera móvil de NHTSA** (laterales, FMVSS 301 y la oblicua de 15°): no es una clase de vehículo de Croquis. Se reproduce con el mismo criterio con el que E2 calibró la rigidez lateral y trasera (ADR 0013 y 0014):
  - **Energía total:** momento en una dimensión, ½ μ v².
  - **Cara deformable:** la barrera deformable se lleva la fracción de Johnson (2011) que usa `e2_mdb.py`.
  - **Barrera rígida:** no se lleva nada.
- **Barrera desplazada deformable (EEVC):** Croquis la ve como un muro rígido, que es como la modelaría al reconstruir. El aplastamiento predicho tenderá a ser mayor que el real, y se reporta por tipo tal cual.
- **NHTSA dentro de la muestra en la magnitud:** la rigidez de Croquis por clase y zona se calibró con pruebas de NHTSA (E2): frontal con las de barrera y lateral y trasera con las de barrera móvil. Por eso E5-NHTSA no es independiente en _cuánto_ se hunde el vehículo. Sí mide la forma, el ancho y la posición del daño sobre la malla.
- **CISS fuera de la muestra:** es la prueba fuera de la muestra (rigidez de pruebas de laboratorio y choques reales de la calle). Las conclusiones de E5 se apoyan sobre todo en CISS.

## Métricas por caso

- **Error por punto:** media de |predicho − medido| en las seis estaciones (cm).
- **Error en profundidad máxima:** |máx. predicho − máx. medido| en las estaciones (cm).
- **Error en ancho dañado:** |ancho donde la malla se hunde más de 2 cm − L| (cm).
- **Error en área del perfil:** |área predicha − área medida|, con regla del trapecio sobre las seis estaciones (cm·m).

**Reporte:**

- **Por fuente y tipo de impacto:** n, mediana y media de cada métrica.
- **Intervalos:** del 90 % por bootstrap (2,000 remuestreos, semilla 20261017).
- **Comparación:** pareada contra cada línea base. Mediana de la diferencia por caso, con su intervalo.

## Líneas base (PLAN §8)

Las dos usan **la misma energía, el mismo ancho y el mismo centro** que Croquis. Solo cambia la forma del perfil, para aislar lo que aporta el modelo de deformación:

- **Uniforme en la zona de impacto:** profundidad constante sobre el ancho del daño.
- **Lineal simple:** perfil triangular, máximo en el centro del daño y cero en los bordes.

Croquis, en cambio, usa la forma según la zona del CDC (`profile_for_energy`) más la caída, el ancho y las arrugas de la malla.

## Exclusiones (se cuentan y se reportan por tipo)

1. Falta lo necesario para pasar D al marco de Croquis.
   - **Para pasarlo:** la mitad de la batalla en CISS y la posición del CG en NHTSA.
   - **Antes de usar la convención de NHTSA:** se verifica con un script cuyo resultado queda en `eval/results`, como se hizo con CISS en el inventario.
2. CISS contra otro vehículo sin la clase o la masa del otro (no se puede repartir la energía).
3. Clases sin malla en el visor (dos ruedas).

## Partición congelada

- **Archivo:** `eval/e5/particion.json`, SHA-256 `2a894e0915db754fa484f0dc83b809389b134760b02e00ba7b8c4d9b784b0213`. Lo genera `uv run croquis-eval e5-particion`; `--check` lo verifica y las pruebas fallan si cambia.
- **NHTSA:** por vehículo (marca, modelo y año), no por prueba, porque un auto suele tener varias pruebas (NCAP, FMVSS 208…). Va a test el 40 % de los vehículos, con un número uniforme del SHA-256 de `semilla|vehículo` (semilla 20261017).
- **CISS:** 2017–2021 desarrollo y 2022–2024 test, como E3.
- **Ajustes:** solo con desarrollo.
  - **Qué se puede ajustar:** la caída en profundidad, el ancho de transición fuera del daño, la amplitud de las arrugas y la elección de forma por zona del CDC.
  - **Registro:** cada cambio se registra con sus números de desarrollo antes y después.
- **Test:** se corre **una vez** al final, con todo ya fijo.

## Galería (PLAN E5 c)

- **Muestra:** del test de NHTSA, estratificada por tipo, entre las pruebas con fotos.
- **La foto:** la posterior de la cara dañada.
  - **Cuando las fotos vienen numeradas:** el número sale de la lista de fotografías del reporte PDF.
  - **Al lado:** un render de Croquis con una vista parecida y la marca de reconstrucción ilustrativa.
- **Lo que no se publica:** la galería es cualitativa y no lleva números que no salgan del script de E5.

## Consecuencias

- E5 dice cuánto se acerca la malla de Croquis a autos reales y si su modelo de forma mejora a una profundidad uniforme o triangular con la misma energía.
- **Lo que no dice:** si la energía misma es correcta. Eso lo miden E2 (rigidez contra pruebas de barrera) y E3 (ΔV contra el EDR).
