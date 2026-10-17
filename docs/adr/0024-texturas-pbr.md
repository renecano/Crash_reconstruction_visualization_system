# ADR 0024 — Texturas PBR del entorno (F8e)

- **Estado:** aceptado (2026-10-16)
- **Contexto:** PLAN §7.1 pide un entorno creíble: asfalto, banquetas y suelo con material, no solo color liso. Las mallas de la vía (plantillas y red de OSM) no tienen coordenadas UV. El color de cada superficie ya está calibrado: seco contra mojado (ADR 0020) y día contra noche (ADR 0021). Las capturas de referencia dependen de esa calibración.

## Decisiones

1. **Fuente: Poly Haven, CC0 1.0.** Sin atribución obligatoria, pero se registra en `assets/ASSETS.md`.
   - **Asfalto:** «Asphalt Track» (Dimitrios Savva). Se descartó «Asphalt 02»: sus grietas grandes se repetían a la vista con mosaico de 4 m.
   - **Concreto:** «Concrete Pavement» (Charlotte Baglioni), para banquetas y camellón.
   - **Suelo:** «Leafy Grass» (Charlotte Baglioni). Se descartó «Aerial Grass Rock»: su tono amarillento no correspondía al suelo calibrado.
   - **Mapas:** color, normal (convención OpenGL) y rugosidad. Ni desplazamiento ni oclusión: la vía es plana.
2. **Pipeline reproducible** (`croquis-assets textures`):
   - **Descarga:** los JPG de 1k, con URL y MD5 fijados en `assets/pipeline/polyhaven.lock.json`.
   - **Conversión:** 512 px con Lanczos y WebP con Pillow 12.3.0 fijo. La rugosidad va en gris; con pérdida, los canales difieren unos niveles y el material lee solo el rojo.
   - **Verificación:** CI descarga y reconstruye byte a byte (`check`).
   - **Peso:** los nueve mapas pesan menos de 1 MB (lo afirma `test_textures.py`), una fracción del presupuesto de carga de E6.
   - **Manifiesto:** `texturas.json` se excluye de Prettier porque `check` compara sus bytes.
3. **La textura aporta detalle, no tono.**
   - **Promedios:** el pipeline calcula, sobre el WebP ya codificado, el color medio en RGB lineal y la rugosidad media, y los guarda en el manifiesto.
   - **Escalado:** el visor escala la textura por canal para que su promedio sea exactamente el color y la rugosidad calibrados del material liso al que reemplaza.
   - **Qué se conserva:** seco contra mojado, día contra noche, charcos, aceite y lodo siguen como estaban, y la diferencia con calidad baja es solo de detalle.
   - **Motivo:** la primera prueba sin normalizar dejó la calzada casi negra, porque «Asphalt Track» promedia 0.0164 en el canal rojo lineal (`media` del manifiesto) contra 0.0437 del asfalto seco calibrado (`#3b3e42` convertido de sRGB a lineal).
   - **Manifiesto incompleto:** si no trae los promedios, la carga falla y quedan los colores lisos. Nunca se aplica una textura sin calibrar.
4. **Proyección en planta.** Las coordenadas de textura son las del mundo (x, z) entre el tamaño del mosaico: 4 m el asfalto, 2 m el concreto y 8 m el pasto.
   - **Normal:** `normalMap` de TSL deriva las tangentes en pantalla.
   - **Guarnición:** conserva su material liso; en sus caras verticales la proyección en planta se vería rayada.
   - **Pasto:** se le agrega un ruido de brillo de 23 m (±15 %) para que no se note la repetición en superficies grandes.
   - **Asfalto con agua:** el relieve se suaviza con agua: escala del normal 0.5 mojado y 0.4 encharcado.
5. **Calidad.** Solo en calidad media y alta; en baja no se descargan.
   - **Captura lista:** `__croquisReady` espera a que las texturas estén aplicadas o descartadas, para que las capturas de referencia sean deterministas.
   - **Si falla la carga** (p. ej. sin red): se registra el error y quedan los colores lisos; el visor no se rompe.
6. **Corte por nivel de mip (E6, ADR 0025).** El suelo cubre casi toda la pantalla y se ve rasante, así que leer sus tres mapas en cada píxel es de lo más caro del cuadro.
   - **Corte:** cada píxel calcula, con derivadas fuera de cualquier rama, cuántos texeles cubre. Desde 2^4.5 texeles la textura se funde con su promedio y desde 2^6 ya no se lee.
   - **Por qué no se nota:** el promedio es justo el color calibrado (decisión 3), que es a lo que tiende la textura filtrada a esa distancia.
   - **Normal sin derivadas:** se arma con el marco tangente conocido de una superficie horizontal con UV en planta (T = +X, B = +Z, N = +Y). Es el mismo marco que da el método de derivadas de three.js (`perturbNormal2Arb`) para esta proyección, y permite leerla dentro de la rama con gradiente explícito.
   - **Medición:** `eval/e6_corte_texturas.mjs` compara el cuadro con el corte y sin él (`window.__croquisDiag.texturasSinCorte`). En las 11 escenas canónicas, en calidad media y alta, la diferencia máxima es de 8.1 niveles de gris de 255; ningún píxel cambia 8 niveles o más y a lo más el 1.73 % cambia 3 o más (`eval/results/e6_corte_texturas.json`). Es la franja lejana y rasante del suelo.

## Consecuencias

- Las capturas de referencia en calidad media cambian (detalle y relieve, mismo tono): se regeneran en CI (Linux) y se revisan una por una.
- Cambiar una textura es editar `TEXTURAS` en el pipeline, renovar el lock, reconstruir y registrar en `ASSETS.md`. La calibración no se toca.
- Pendiente fuera de F8e: texturas para las caras verticales (guarnición, barda) con proyección triplanar, si E9 muestra que hacen falta.
