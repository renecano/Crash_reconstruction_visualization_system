"""Genera los archivos SVG maestros de la marca Croquis desde `assets/brand/marca.json`.

Uso: python -I make_brand.py <ruta de la fuente Anybody variable> [carpeta de salida]

`marca.json` es la única fuente del logo (René, 2026-11-15): la forma es la de la portada pública
y los colores son tokens del sistema (`tokens.json`), no valores propios.
De ahí salen el símbolo, la palabra CROQUIS y los colores. La palabra se convierte a contornos para
no depender de que la fuente esté instalada: Anybody (SIL OFL 1.1) con el peso, el ancho y el
espaciado que dice `marca.json`, los mismos con que la portada la escribe.

Además de los SVG escribe `medidas.json` (el tamaño de cada archivo), que usa el sitio.
"""

import json
import math
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

AQUI = Path(__file__).resolve().parent.parent
FONT = Path(sys.argv[1])
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else AQUI
OUT.mkdir(parents=True, exist_ok=True)
M = json.loads((AQUI / "marca.json").read_text(encoding="utf-8"))
TOKENS = json.loads((AQUI / "tokens.json").read_text(encoding="utf-8"))["color"]


def token(clave: str) -> str:
    """El color del logo: el valor del token del sistema que nombra `marca.json`."""
    return TOKENS[M["colores"][clave]]["value"]


L = float(M["lienzo"])
CLARO = token("sobre_oscuro")
TINTA = token("sobre_claro")
SENAL = token("senal")
FONDO_ICONO = token("fondo_icono")
MX, MY = M["mira"]
CX, CY = M["centro"]
MEDIDAS: dict[str, dict[str, float]] = {}


def n(x: float) -> str:
    """Un número sin ceros de más."""
    return f"{x:.2f}".rstrip("0").rstrip(".")


def escala(e: dict) -> str:
    """Las rayas de la escala de transportador."""
    rayas = []
    a = e["desde"]
    while a <= e["hasta"]:
        r = math.radians(a)
        c, s = math.cos(r), math.sin(r)
        r1 = e["r_mayor"] if a % e["mayor_cada"] == 0 else e["r_menor"]
        rayas.append(
            f"M{n(CX + r1 * c)} {n(CY + r1 * s)}L{n(CX + e['r_fuera'] * c)} {n(CY + e['r_fuera'] * s)}"
        )
        a += e["paso"]
    return "".join(rayas)


def simbolo(clave: str, trazo: str, senal: str, efectos: bool = False) -> str:
    """El símbolo en su lienzo de 64: la C de trayectoria, su arco interior y la mira."""
    v = M[clave]
    f_arco = ' filter="url(#sombra)"' if efectos else ""
    f_mira = ' filter="url(#brillo)"' if efectos else ""
    partes = []
    if "escala" in v:
        e = v["escala"]
        partes.append(
            f'<path d="{escala(e)}" fill="none" stroke="{trazo}" stroke-width="{n(e["grosor"])}" '
            f'opacity="{n(e["opacidad"])}"/>'
        )
    partes.append(
        f'<path d="{M["arco"]}" fill="none" stroke="{trazo}" stroke-width="{n(v["arco_grosor"])}"{f_arco}/>'
    )
    if "interior" in v:
        i = v["interior"]
        partes.append(
            f'<path d="{i["d"]}" fill="none" stroke="{trazo}" stroke-width="{n(i["grosor"])}" '
            f'opacity="{n(i["opacidad"])}" stroke-dasharray="{i["guiones"]}"/>'
        )
    m = v["mira"]
    rayas = "".join(f"M{n(a)} {n(b)}L{n(c)} {n(d)}" for a, b, c, d in m.get("rayas", []))
    mira = (
        f'<circle cx="{n(MX)}" cy="{n(MY)}" r="{n(m["radio"])}" fill="none" stroke="{senal}" '
        f'stroke-width="{n(m["grosor"])}"/>'
    )
    if rayas:
        mira += f'<path d="{rayas}" fill="none" stroke="{senal}" stroke-width="{n(m["rayas_grosor"])}"/>'
    mira += f'<circle cx="{n(MX)}" cy="{n(MY)}" r="{n(m["punto"])}" fill="{senal}"/>'
    partes.append(f"<g{f_mira}>{mira}</g>")
    return "".join(partes)


DEFS_EFECTOS = """<defs>
<linearGradient id="pintura" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#ECE9E1"/><stop offset="1" stop-color="#A9ADB2"/>
</linearGradient>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#E9E6DE"/><stop offset="1" stop-color="#9EA3A8"/>
</linearGradient>
<filter id="brillo" x="-80%" y="-80%" width="260%" height="260%">
<feGaussianBlur stdDeviation="2.6" result="b"/>
<feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<filter id="sombra" x="-30%" y="-30%" width="160%" height="160%">
<feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.55"/>
</filter>
</defs>"""


def svg(w: float, h: float, cuerpo: str, titulo: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" '
        f'width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{titulo}">'
        f"<title>{titulo}</title>{cuerpo}</svg>\n"
    )


def escribir(nombre: str, w: float, h: float, cuerpo: str, titulo: str = "Croquis") -> None:
    (OUT / nombre).write_text(svg(w, h, cuerpo, titulo), encoding="utf-8", newline="\n")
    MEDIDAS[nombre.removesuffix(".svg")] = {"w": round(w, 2), "h": round(h, 2)}
    print("escrito", nombre)


# ---------- La palabra, en contornos ----------
P = M["palabra"]
font = instancer.instantiateVariableFont(TTFont(FONT), {"wdth": P["ancho"], "wght": P["peso"]})
upm = font["head"].unitsPerEm
gs = font.getGlyphSet()
cmap = font.getBestCmap()
cap = font["OS/2"].sCapHeight


def palabra(texto: str, tam: float) -> tuple[str, float, float]:
    """(path, ancho, alto de mayúscula). La parte superior de las mayúsculas queda en y = 0."""
    esc = tam / upm
    x = 0.0
    partes = []
    for i, ch in enumerate(texto):
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=lambda v: n(v))
        gs[g].draw(TransformPen(pen, (esc, 0, 0, -esc, x, cap * esc)))
        partes.append(pen.getCommands())
        x += gs[g].width * esc
        if i < len(texto) - 1:
            x += P["espaciado_em"] * tam
    return " ".join(partes), x, cap * esc


TAM = P["tam_sobre_simbolo"] * L
GAP = P["separacion_sobre_simbolo"] * L
MARGEN = 3.0  # aire para el brillo de la mira y la sombra
d_palabra, ancho_palabra, alto_cap = palabra(P["texto"], TAM)
d_resto, ancho_resto, _ = palabra(P["texto"][1:], TAM)


def logotipo(trazo: str, senal: str, efectos: bool = False) -> tuple[float, float, str]:
    """El símbolo y la palabra, con las mayúsculas centradas en el símbolo."""
    w = L + GAP + ancho_palabra + 2 * MARGEN
    h = L + 2 * MARGEN
    ty = MARGEN + L / 2 - alto_cap / 2
    cuerpo = DEFS_EFECTOS if efectos else ""
    cuerpo += f'<g transform="translate({n(MARGEN)} {n(MARGEN)})">' + simbolo(
        "simbolo", "url(#pintura)" if efectos else trazo, senal, efectos
    )
    cuerpo += "</g>"
    cuerpo += (
        f'<g transform="translate({n(MARGEN + L + GAP)} {n(ty)})">'
        f'<path d="{d_palabra}" fill="{"url(#metal)" if efectos else trazo}"/></g>'
    )
    return w, h, cuerpo


def integrado(trazo: str, senal: str) -> tuple[float, float, str]:
    """El símbolo hace de C: su arco mide lo que una mayúscula y le sigue ROQUIS."""
    diametro = 40 + M["simbolo"]["arco_grosor"]  # el arco con su grosor, en el lienzo de 64
    s = (alto_cap * 1.32) / diametro
    lado = L * s
    gap = 0.02 * TAM
    w = lado + gap + ancho_resto + 2 * MARGEN
    h = lado + 2 * MARGEN
    ty = MARGEN + lado / 2 - alto_cap / 2
    cuerpo = (
        f'<g transform="translate({n(MARGEN)} {n(MARGEN)}) scale({s:.4f})">'
        + simbolo("simbolo", trazo, senal)
        + "</g>"
        + f'<g transform="translate({n(MARGEN + lado + gap)} {n(ty)})"><path d="{d_resto}" fill="{trazo}"/></g>'
    )
    return w, h, cuerpo


# ---------- Archivos ----------
for nombre, trazo, senal in (
    ("simbolo.svg", CLARO, SENAL),
    ("simbolo-sobre-claro.svg", TINTA, SENAL),
    ("simbolo-blanco.svg", "#FFFFFF", "#FFFFFF"),
    ("simbolo-negro.svg", "#000000", "#000000"),
):
    escribir(nombre, L, L, simbolo("simbolo", trazo, senal), "Símbolo de Croquis")
escribir("simbolo-detalle.svg", L, L, simbolo("simbolo_detalle", CLARO, SENAL), "Símbolo de Croquis")
escribir(
    "simbolo-detalle-sobre-claro.svg",
    L,
    L,
    simbolo("simbolo_detalle", TINTA, SENAL),
    "Símbolo de Croquis",
)
escribir(
    "simbolo-efectos.svg",
    L,
    L,
    DEFS_EFECTOS + simbolo("simbolo_detalle", "url(#pintura)", SENAL, efectos=True),
    "Símbolo de Croquis",
)

for nombre, trazo, senal in (
    ("logotipo.svg", CLARO, SENAL),
    ("logotipo-sobre-claro.svg", TINTA, SENAL),
    ("logotipo-blanco.svg", "#FFFFFF", "#FFFFFF"),
    ("logotipo-negro.svg", "#000000", "#000000"),
):
    escribir(nombre, *logotipo(trazo, senal))
escribir("logotipo-efectos.svg", *logotipo(CLARO, SENAL, efectos=True))
escribir("logotipo-integrado.svg", *integrado(CLARO, SENAL))
escribir("logotipo-integrado-sobre-claro.svg", *integrado(TINTA, SENAL))

# La palabra sola: junto al símbolo cuando este se dibuja aparte.
for nombre, color in (("palabra.svg", CLARO), ("palabra-sobre-claro.svg", TINTA)):
    escribir(nombre, ancho_palabra, alto_cap, f'<path d="{d_palabra}" fill="{color}"/>')

# Favicon: trazos más gruesos y sin detalle, para que se lea a 16 px.
fav = (
    f'<rect width="{n(L)}" height="{n(L)}" rx="14" fill="{FONDO_ICONO}"/>'
    f'<g transform="translate(5.4 5.4) scale(0.83)">' + simbolo("icono", CLARO, SENAL) + "</g>"
)
escribir("favicon.svg", L, L, fav)

# Ícono de app (maestro de 1024): asfalto con volumen y el símbolo con luz.
icono = f"""<defs>
<linearGradient id="fondo" x1="0" y1="0" x2="0.6" y2="1">
<stop offset="0" stop-color="#33393F"/><stop offset="0.45" stop-color="#1A1E22"/><stop offset="1" stop-color="{FONDO_ICONO}"/>
</linearGradient>
<linearGradient id="filo" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/><stop offset="0.08" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
</defs>
<rect width="1024" height="1024" rx="232" fill="url(#fondo)"/>
<rect width="1024" height="1024" rx="232" fill="url(#filo)"/>
{DEFS_EFECTOS}
<g transform="translate(112 112) scale(12.5)">{simbolo("simbolo", "url(#pintura)", SENAL, efectos=True)}</g>"""
escribir("app-icon.svg", 1024, 1024, icono)

(OUT / "medidas.json").write_text(
    json.dumps(MEDIDAS, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
)
print("escrito medidas.json")
