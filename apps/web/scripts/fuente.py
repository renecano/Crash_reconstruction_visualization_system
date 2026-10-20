"""Anybody con la «í» legible (ADR 0045 §1, revisión de diseño de F11a).

En Anybody, la «í» es un compuesto de «ı» (i sin punto) y el acento agudo, con el acento solo 2
unidades (de 2000) arriba del fuste: a tamaño de lectura (14–18 px) se funden y «contarías» se lee
«contarias»: a 1 px de alto, el acento se lee como el punto de una «i». Este script, en una copia
del corte latino de `@fontsource-variable/anybody`, dibuja el acento de la «í» ESCALA veces más
grande, centrado sobre el fuste y separado de él; nada más cambia (las variaciones de un compuesto
se aplican a sus componentes y a su desplazamiento, así que la «í» sigue al peso y al ancho).

La licencia SIL OFL 1.1 permite versiones modificadas; como lo es, la copia cambia su nombre interno
a «Anybody Croquis» (el CSS la sigue llamando «Anybody Variable»).

Uso (desde apps/web): `uv run --with fonttools --with brotli python -I scripts/fuente.py`.
Escribe `public/fuente/anybody-latin-croquis.woff2` y `public/fuente/fuente.json` (SHA-256 del
original); `node scripts/fuente.mjs --check` comprueba en CI que sigan al día.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

WEB = Path(__file__).resolve().parent.parent
ORIGEN = WEB / "node_modules/@fontsource-variable/anybody/files/anybody-latin-standard-normal.woff2"
SALIDA = WEB / "public/fuente/anybody-latin-croquis.woff2"
HUELLA = WEB / "public/fuente/fuente.json"
ESCALA = 1.4
SEPARACION = 120  # unidades (2000 por em) entre el fuste y el acento: ~1 px a 16 px
NOMBRE = "Anybody Croquis"


def main() -> None:
    f = TTFont(str(ORIGEN))
    glifo = f["glyf"]["iacute"]
    assert glifo.isComposite(), "se esperaba la «í» compuesta de ı y el acento"
    acento = next(c for c in glifo.components if c.glyphName == "acute")
    gs = f.getGlyphSet()
    caja = BoundsPen(gs)
    gs["acute"].draw(caja)
    x0, y0, x1, _ = caja.bounds
    fuste = BoundsPen(gs)
    gs["dotlessi"].draw(fuste)
    fx0, _, fx1, fy1 = fuste.bounds
    # Puntos finales = ESCALA·p + (dx, dy): centro del acento sobre el centro del fuste y su base a
    # SEPARACION unidades de la punta del fuste (en la instancia por omisión; el resto la sigue).
    acento.transform = [[ESCALA, 0], [0, ESCALA]]
    acento.x = round((fx0 + fx1) / 2 - ESCALA * (x0 + x1) / 2)
    acento.y = round(fy1 + SEPARACION - ESCALA * y0)
    # Las cajas del glifo y de la fuente se recalculan al guardar (recalcBBoxes).
    for registro in f["name"].names:
        if registro.nameID in (1, 4, 16, 21) and NOMBRE not in registro.toUnicode():
            registro.string = registro.toUnicode().replace("Anybody", NOMBRE, 1)
        if registro.nameID in (6, 20, 25):
            registro.string = registro.toUnicode().replace("Anybody", "AnybodyCroquis", 1)
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    f.flavor = "woff2"
    f.save(str(SALIDA))
    HUELLA.write_text(
        json.dumps(
            {
                "origen": ORIGEN.name,
                "sha256_origen": hashlib.sha256(ORIGEN.read_bytes()).hexdigest(),
                "escala_acento_iacute": ESCALA,
                "separacion_acento_iacute": SEPARACION,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(SALIDA)


if __name__ == "__main__":
    main()
