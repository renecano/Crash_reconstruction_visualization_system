"""Genera los archivos SVG maestros de la marca Croquis.

Uso: python3 -I make_brand.py <ruta_fuente_anybody_variable> <carpeta_salida>

El logotipo se convierte a contornos (paths) para no depender de que la fuente
esté instalada. Fuente: Anybody (SIL OFL 1.1), instancia wdth=150, wght=560,
espaciado 0.16 em, igual que el diseño aprobado.
"""
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONT, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

# Colores (ver tokens.json)
ASFALTO_NOCHE = "#0B0D0F"
ASFALTO_MOJADO = "#171B1F"
ASFALTO = "#2A2D30"
BLANCO_VIAL = "#F4F2EC"
TINTA = "#15181B"
AMARILLO_VIAL = "#F2B705"
NARANJA_MARCAJE = "#FF6A13"

# Geometría del símbolo (viewBox 0 0 120 120)
ARC = "M91.11 28.89 A44 44 0 1 0 91.11 91.11"
DASH = "52 25.6"
EQUIS = "M91 51 L109 69 M109 51 L91 69"


def simbolo(trazo, marca, grosor=13, grosor_x=6, extra="", filtros=False):
    f_arco = ' filter="url(#sombra)"' if filtros else ""
    f_x = ' filter="url(#brillo)"' if filtros else ""
    return (
        f'<path d="{ARC}" fill="none" stroke="{trazo}" stroke-width="{grosor}" '
        f'stroke-dasharray="{DASH}"{f_arco}{extra}/>'
        f'<path d="{EQUIS}" fill="none" stroke="{marca}" stroke-width="{grosor_x}" '
        f'stroke-linecap="round"{f_x}/>'
    )


DEFS_EFECTOS = f"""<defs>
<linearGradient id="pintura" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#ECE9E1"/><stop offset="1" stop-color="#A9ADB2"/>
</linearGradient>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#E9E6DE"/><stop offset="1" stop-color="#9EA3A8"/>
</linearGradient>
<filter id="brillo" x="-60%" y="-60%" width="220%" height="220%">
<feGaussianBlur stdDeviation="5" result="b"/>
<feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<filter id="sombra" x="-30%" y="-30%" width="160%" height="160%">
<feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.55"/>
</filter>
</defs>"""


def svg(w, h, cuerpo, titulo):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" '
        f'width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{titulo}">'
        f"<title>{titulo}</title>{cuerpo}</svg>\n"
    )


def escribir(nombre, contenido):
    (OUT / nombre).write_text(contenido, encoding="utf-8")
    print("escrito", nombre)


# ---------- Contornos del logotipo ----------
font = TTFont(FONT)
font = instancer.instantiateVariableFont(font, {"wdth": 150, "wght": 560})
upm = font["head"].unitsPerEm
gs = font.getGlyphSet()
cmap = font.getBestCmap()
cap = font["OS/2"].sCapHeight


def palabra(texto, tam, espaciado_em=0.16):
    """Devuelve (path_d, ancho, alto_mayuscula) en unidades del lienzo.

    La línea base queda en y = alto_mayuscula (la parte superior de las
    mayúsculas en y = 0)."""
    esc = tam / upm
    x = 0.0
    partes = []
    for i, ch in enumerate(texto):
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        tp = TransformPen(pen, (esc, 0, 0, -esc, x, cap * esc))
        gs[g].draw(tp)
        partes.append(pen.getCommands())
        x += gs[g].width * esc
        if i < len(texto) - 1:
            x += espaciado_em * tam
    return " ".join(partes), x, cap * esc


# Proporciones del diseño: símbolo 150 px, texto 104 px, separación 40 px.
# En unidades del símbolo (120): 1 u = 1.25 px.
TAM_TEXTO = 104 / 1.25
GAP = 40 / 1.25
d_palabra, ancho_palabra, alto_cap = palabra("CROQUIS", TAM_TEXTO)
MARGEN = 4  # aire para el brillo de la X y la sombra


def lockup(trazo, marca, color_texto, efectos=False, fondo=None, titulo="Croquis"):
    w = 120 + GAP + ancho_palabra + 2 * MARGEN
    h = 120 + 2 * MARGEN
    ty = MARGEN + 60 - alto_cap / 2  # mayúsculas centradas en el símbolo
    fill = "url(#metal)" if efectos else color_texto
    cuerpo = DEFS_EFECTOS if efectos else ""
    if fondo:
        cuerpo += f'<rect width="100%" height="100%" fill="{fondo}"/>'
    cuerpo += f'<g transform="translate({MARGEN} {MARGEN})">' + simbolo(
        "url(#pintura)" if efectos else trazo, marca, filtros=efectos
    ) + "</g>"
    cuerpo += (
        f'<g transform="translate({MARGEN + 120 + GAP:.2f} {ty:.2f})">'
        f'<path d="{d_palabra}" fill="{fill}"/></g>'
    )
    return svg(w, h, cuerpo, titulo)


# ---------- Logotipo integrado: el símbolo hace de C ----------
d_roquis, ancho_roquis, _ = palabra("ROQUIS", TAM_TEXTO)


def integrado(trazo, marca, color_texto, titulo="Croquis"):
    # Símbolo escalado para que su diámetro exterior iguale ~1.3× la altura de mayúscula
    s = (alto_cap * 1.32) / 102  # 102 = diámetro exterior del arco con su grosor
    lado = 120 * s
    gap = 0.02 * TAM_TEXTO
    w = lado + gap + ancho_roquis + 2 * MARGEN
    h = lado + 2 * MARGEN
    ty = MARGEN + lado / 2 - alto_cap / 2
    cuerpo = (
        f'<g transform="translate({MARGEN} {MARGEN}) scale({s:.4f})">'
        + simbolo(trazo, marca, grosor=13, grosor_x=6)
        + "</g>"
        + f'<g transform="translate({MARGEN + lado + gap:.2f} {ty:.2f})">'
        f'<path d="{d_roquis}" fill="{color_texto}"/></g>'
    )
    return svg(w, h, cuerpo, titulo)


# ---------- Archivos ----------
def sym(nombre, trazo, marca, efectos=False, titulo="Símbolo de Croquis"):
    cuerpo = (DEFS_EFECTOS if efectos else "") + simbolo(
        "url(#pintura)" if efectos else trazo, marca, filtros=efectos
    )
    escribir(nombre, svg(120, 120, cuerpo, titulo))


sym("simbolo.svg", BLANCO_VIAL, NARANJA_MARCAJE)
sym("simbolo-sobre-claro.svg", TINTA, NARANJA_MARCAJE)
sym("simbolo-blanco.svg", "#FFFFFF", "#FFFFFF")
sym("simbolo-negro.svg", "#000000", "#000000")
sym("simbolo-efectos.svg", BLANCO_VIAL, NARANJA_MARCAJE, efectos=True)

escribir("logotipo.svg", lockup(BLANCO_VIAL, NARANJA_MARCAJE, BLANCO_VIAL))
escribir("logotipo-sobre-claro.svg", lockup(TINTA, NARANJA_MARCAJE, TINTA))
escribir("logotipo-blanco.svg", lockup("#FFFFFF", "#FFFFFF", "#FFFFFF"))
escribir("logotipo-negro.svg", lockup("#000000", "#000000", "#000000"))
escribir("logotipo-efectos.svg", lockup(BLANCO_VIAL, NARANJA_MARCAJE, BLANCO_VIAL, efectos=True))

escribir("logotipo-integrado.svg", integrado(BLANCO_VIAL, NARANJA_MARCAJE, BLANCO_VIAL))
escribir("logotipo-integrado-sobre-claro.svg", integrado(TINTA, NARANJA_MARCAJE, TINTA))

# Favicon: trazos más gruesos para que se lea a 16 px
fav = (
    f'<rect width="120" height="120" rx="26" fill="{ASFALTO_NOCHE}"/>'
    f'<g transform="translate(14 14) scale(0.7667)">'
    + simbolo(BLANCO_VIAL, NARANJA_MARCAJE, grosor=18, grosor_x=11)
    + "</g>"
)
escribir("favicon.svg", svg(120, 120, fav, "Croquis"))

# Ícono de app (maestro 1024): asfalto con volumen, símbolo con luz
icono = f"""<defs>
<linearGradient id="fondo" x1="0" y1="0" x2="0.6" y2="1">
<stop offset="0" stop-color="#33393F"/><stop offset="0.45" stop-color="#1A1E22"/><stop offset="1" stop-color="{ASFALTO_NOCHE}"/>
</linearGradient>
<linearGradient id="filo" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/><stop offset="0.08" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
</defs>
<rect width="1024" height="1024" rx="232" fill="url(#fondo)"/>
<rect width="1024" height="1024" rx="232" fill="url(#filo)"/>
{DEFS_EFECTOS}
<g transform="translate(134 134) scale(6.3)">{simbolo("url(#pintura)", NARANJA_MARCAJE, grosor=12, grosor_x=6, filtros=True)}</g>"""
escribir("app-icon.svg", svg(1024, 1024, icono, "Croquis"))
