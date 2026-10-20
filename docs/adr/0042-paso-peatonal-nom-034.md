# ADR 0042 — Paso peatonal y orillas según la NOM-034-SCT2/SEDATU-2022 (pendiente de ADR 0037, F11)

- **Estado:** aceptado (2026-10-19). Cierra el pendiente del ADR 0037 («revisar en el manual las orillas en los pasos») y reemplaza las medidas del paso peatonal de ese ADR.
- **Contexto:** el ADR 0037 dejó pendiente si las rayas de orilla se interrumpen en un paso peatonal, porque no se había consultado la norma. Al consultarla también salió que el paso peatonal del visor no la seguía. Tenía franjas de 50 cm cada metro y 3 m de largo, una elección visual sin fuente.
- **Fuente:** NOM-034-SCT2/SEDATU-2022, «Señalización y dispositivos viales para calles y carreteras», publicada en el DOF el 19 de septiembre de 2023 (https://dof.gob.mx/nota_detalle.php?codigo=5702233&fecha=19/09/2023), consultada el 2026-10-19 en el texto del DOF.

## Lo que dice la norma

- **5.5.1, raya en la orilla derecha (M-3.1):** «debe ser de color blanco reflejante marcada en toda la longitud de las calles que no cuenten con estacionamiento marcado». El texto no dice que se interrumpa en los pasos peatonales.
- **5.9, raya para cruce de peatones (M-7):**
  - **Franjas:** «una sucesión de rayas de cuarenta (40) centímetros de ancho separadas entre sí cuarenta (40) centímetros, paralelas a la trayectoria de los vehículos».
  - **Ancho del paso:** se traza «en todo el ancho de la calle o carretera».
  - **Largo de las franjas:** el de la Tabla 8, «pero nunca menor al ancho de las banquetas que las unen».
- **Tabla 8, longitud mínima:**
  - carretera, 2 m;
  - calle primaria, 6 m;
  - calles secundaria y terciaria, 4 m.
- **5.8, raya de alto (M-6):** 60 cm de ancho, 1.20 m antes del paso peatonal; sin paso, entre 1.20 m y 5 m de la orilla de la vía que se cruza, en todos los carriles del mismo sentido. Croquis no la dibujaba; quedó como pendiente. **Actualización:** la dibuja desde el ADR 0044, con los accesos que salen de `aplica_a` y de las fases de cada dispositivo.

## Decisión

1. **Orillas:** siguen continuas en el paso peatonal, como ya estaban; la norma no las interrumpe. Las rayas centrales y de carril siguen cortándose en el paso, como decidió el ADR 0037, porque las franjas del paso ocupan todo el ancho.
2. **Franjas del paso:**
   - **Medidas:** 40 cm de ancho, separadas 40 cm (`CROSSWALK_STRIPE`, `CROSSWALK_GAP`).
   - **Posición:** paralelas a la vía y centradas en el ancho de la calzada, sin salirse de ella.
3. **Largo, según la Tabla 8 (`crosswalkLength`):**
   - **Valores:** 2 m en carretera y autopista, 6 m en calle primaria y 4 m en secundaria y terciaria. Nunca es menor que la banqueta (2.5 m) si la escena la tiene.
   - **Supuesto:** el contrato no guarda si una calle es primaria. Se toma como primaria la de dos carriles o más por sentido, y como secundaria o terciaria la de uno. Es un supuesto, no un dato.
   - **Otros usos del largo:** el corte del camellón y de las rayas centrales (ADR 0037) usa el largo de cada paso, así que también cambia con él.
4. **Croquis 2D:** el símbolo del paso peatonal conserva su tamaño de símbolo, pero sus franjas pasan a 40 cm separadas 40 cm.

## Efectos

- **Escena canónica afectada:** solo `peaton_cruce` tiene paso peatonal. Es una recta con dos carriles por sentido y banquetas, así que su paso pasa de 3 m a 6 m de largo.
- **Referencias visuales:** cambian `peaton-cruce` y `peaton-cruce-dano`. Se regeneran en CI y se revisan antes de versionarlas.
- **Costo:** misma malla y mismo material, sin llamadas de dibujo nuevas; solo cambian las franjas de un paso.

## Pruebas

- **Franjas:** 15 en una calzada de 12 m, cada una de 0.4 m por el largo del paso, centradas y dentro de la calzada.
- **Tabla 8:** carretera 2 m, primaria 6 m y secundaria 4 m; con banqueta, nunca menos de 2.5 m.
- **Camellón (ADR 0037):** el corte es el largo del paso por el ancho del camellón.
