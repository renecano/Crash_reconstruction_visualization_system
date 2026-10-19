# ADR 0037 — Corte del camellón y rayas interrumpidas en los pasos peatonales (F8, pendiente cerrado en F11)

- **Estado:** aceptado (2026-10-18).
- **Contexto:** en `peaton_cruce`, el paso peatonal pasaba por debajo del camellón elevado (15 cm), y las rayas amarillas de sus orillas cruzaban la cebra.
  - **En la vía real** el camellón se corta a nivel de calle donde cruza el peatón (refugio), y las rayas se interrumpen en el paso.
  - **Fue un pendiente de F8,** visto en la captura de esa escena.

## Decisión

- **Corte del camellón** (`road-geometry.ts`):
  - **Dónde:** donde un paso peatonal (franja de `CROSSWALK_LENGTH` = 3 m a lo largo de la vía) cruza el camellón.
  - **Cómo:** los tramos de 2 m que lo tocan se parten en piezas de 0.25 m y se omiten las que caen en el paso, junto con sus guarniciones.
  - **El resto no cambia:** los tramos que no tocan un paso quedan igual, así que las escenas sin paso tienen la misma geometría (hay una prueba).
- **Rayas:** las centrales y las de carril se interrumpen en el paso. Las orillas siguen. No se consultó el manual de la SEDATU/SCT sobre las orillas en los pasos, así que se dejan como estaban hasta revisarlo; queda como pendiente. **Actualización (ADR 0042):** la NOM-034-SCT2/SEDATU-2022 (5.5.1) marca la orilla en toda la longitud de la calle, así que las orillas siguen; el largo del paso ya no es de 3 m fijos, sino el de la Tabla 8 de la norma.
- **Rendimiento:** no se midió E6. El cambio quita unas piezas del camellón y agrega otras más chicas en una sola escena (`peaton_cruce`); no toca materiales ni sombreadores.

## Consecuencias

- Las referencias visuales de `peaton_cruce` se regeneran en CI y se revisan.
