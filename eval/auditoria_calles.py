"""Auditoría de fidelidad de calles del visor 3D (René, 2026-11-27).

Compara, en el punto del choque de cada escena de la batería, lo que dice OpenStreetMap de la vía
(carriles, sentidos, dos cuerpos, laterales, ancho, banquetas, puentes, carriles de vuelta,
semáforos y pasos peatonales) contra lo que dibuja el 3D: una sección transversal del
paquete caso-3d,
perpendicular a la vía, que cuenta calzadas, rayas, acotamiento, camellón, guarniciones y
dispositivos.

    python eval/auditoria_calles.py   →   eval/results/auditoria_calles.json y .md

No cambia nada: mide. Lo que sale «mal» va a la bitácora (docs/progress/U.md) con su arreglo o,
si toca la física o la colocación, para René.
"""

from __future__ import annotations

import itertools
import json
import math
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DIR = RAIZ / "packages/scene-schema/fixtures/caso3d-ciudad"
SALIDA = RAIZ / "eval/results"
R = 6371008.8
VEHICULARES = {
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "unclassified",
    "residential",
    "living_street",
    "service",
    "motorway_link",
    "trunk_link",
    "primary_link",
    "secondary_link",
    "tertiary_link",
}
# Una escena por lugar.
ESCENAS = [
    ("tollocan", "Paseo Tollocan (Toluca)"),
    ("metepec-arbol", "Paseo Tollocan (Metepec)"),
    ("toluca-poste", "Centro de Toluca"),
    ("reforma-poste", "Paseo de la Reforma (glorieta del Ángel)"),
    ("insurgentes-arbol", "Insurgentes (glorieta de Insurgentes)"),
    ("viaducto", "Viaducto Miguel Alemán (lateral, paso a desnivel)"),
    ("periferico", "Anillo Periférico (CU)"),
    ("circuito-interior", "Circuito Interior (Río Mixcoac)"),
    ("axa", "MEX 15D (AXA)"),
    ("mex57-alcance", "MEX 57 (dos cuerpos)"),
    ("son100-kino", "SON 100 (dos carriles, Sonora)"),
]


def enu(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    k = math.pi / 180 * R
    return (lon - lon0) * k * math.cos(math.radians(lat0)), (lat - lat0) * k


def dist_seg(p, a, b) -> tuple[float, float]:
    """Distancia de p al segmento ab y el rumbo del segmento."""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    ll = dx * dx + dy * dy
    t = 0.0 if ll == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / ll))
    return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)), math.atan2(dy, dx)


class Indice:
    """Los triángulos de una capa en una rejilla de 4 m: dice rápido si un punto cae en ella."""

    def __init__(self, tris):
        self.celdas: dict[tuple[int, int], list] = {}
        for t in tris:
            xs, ys = t[0::2], t[1::2]
            for gx in range(math.floor(min(xs) / 4), math.floor(max(xs) / 4) + 1):
                for gy in range(math.floor(min(ys) / 4), math.floor(max(ys) / 4) + 1):
                    self.celdas.setdefault((gx, gy), []).append(t)

    def __call__(self, x, y) -> bool:
        return dentro(self.celdas.get((math.floor(x / 4), math.floor(y / 4)), []), x, y)


def dentro(tris, x, y) -> bool:
    for ax, ay, bx, by, cx, cy in tris:
        d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by)
        d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy)
        d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay)
        if not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0)):
            return True
    return False


def capas(e) -> dict[str, list]:
    out: dict[str, list] = {}
    for c in (e.get("via") or {}).get("capas", []):
        p, i = c["posiciones"], c["indices"]
        out.setdefault(c["nombre"], []).extend(
            (
                p[2 * i[k]],
                p[2 * i[k] + 1],
                p[2 * i[k + 1]],
                p[2 * i[k + 1] + 1],
                p[2 * i[k + 2]],
                p[2 * i[k + 2] + 1],
            )
            for k in range(0, len(i) - 2, 3)
        )
    return out


def tramos(muestras: list[bool], paso: float) -> list[tuple[float, float]]:
    """Los tramos [inicio, fin] (m sobre la sección) donde la muestra es verdadera."""
    out, ini = [], None
    for k, s in enumerate([*muestras, False]):
        if s and ini is None:
            ini = k
        elif not s and ini is not None:
            out.append((ini * paso, (k - 1) * paso))
            ini = None
    return out


def auditar(clave: str, nombre: str, indice: dict) -> dict:
    c = json.loads((DIR / f"{clave}.json").read_text())
    lugar = indice[clave]["lugar"]
    osm = json.loads((RAIZ / f"data/osm/{lugar}.overpass.json").read_text())["elements"]
    u = c["escena"]["lugar"]["ubicacion_real"]
    lat0, lon0 = u["lat"], u["lon"]
    pi = c["resultado"]["punto_impacto"]
    p = (pi["x"], pi["y"])
    nodos = {e["id"]: e for e in osm if e["type"] == "node"}
    xy = {i: enu(n["lat"], n["lon"], lat0, lon0) for i, n in nodos.items()}
    vias = [
        e for e in osm if e["type"] == "way" and e.get("tags", {}).get("highway") in VEHICULARES
    ]

    def cerca(w):
        mejor = (1e9, 0.0)
        pts = [xy[i] for i in w["nodes"] if i in xy]
        for a, b in itertools.pairwise(pts):
            mejor = min(mejor, dist_seg(p, a, b))
        return mejor

    medidas = sorted(((cerca(w), w) for w in vias), key=lambda x: x[0][0])
    (d0, rumbo), w0 = medidas[0]
    t0 = w0.get("tags", {})
    nom = t0.get("name", "")
    otro_cuerpo = [
        w
        for (d, r), w in medidas[1:]
        if d < 60
        and nom
        and w.get("tags", {}).get("name") == nom
        and w.get("tags", {}).get("oneway") == "yes"
    ]

    def paralela(r):
        a = abs((r - rumbo + math.pi / 2) % math.pi - math.pi / 2)
        return a < math.radians(20)

    laterales = [
        w
        for (d, r), w in medidas[1:]
        if d < 60
        and paralela(r)
        and w not in otro_cuerpo
        and (
            w["tags"].get("highway") in ("service", "secondary", "tertiary")
            or "lateral" in w["tags"].get("name", "").lower()
        )
        and w["tags"].get("name") != nom
    ]
    radio = 80.0

    def nodos_con(pred):
        return sum(
            1 for i, n in nodos.items() if pred(n.get("tags", {})) and math.dist(xy[i], p) < radio
        )

    semaforos = nodos_con(lambda t: t.get("highway") == "traffic_signals")
    cruces = nodos_con(lambda t: t.get("highway") == "crossing" or "crossing" in t)
    puentes = sorted(
        {
            w["tags"].get("name", w["tags"].get("highway"))
            for (d, r), w in medidas
            if d < radio
            and (w["tags"].get("bridge") == "yes" or w["tags"].get("layer", "0") not in ("0", "-0"))
        }
    )

    # La sección transversal del 3D: en el punto del choque o, si ahí cae un cruce, en el primer
    # lugar     # limpio a lo largo de la vía (hasta 60 m).
    e = c.get("escenario") or {}
    cs = capas(e)
    idx = {
        n: Indice(cs.get(n, []))
        for n in (
            "calzada",
            "acotamiento",
            "rayas_blancas",
            "rayas_amarillas",
            "banqueta",
            "camellon",
            "paso_peatonal",
        )
    }
    nx, ny = -math.sin(rumbo), math.cos(rumbo)
    tx, ty = math.cos(rumbo), math.sin(rumbo)
    paso, mitad = 0.1, 70.0
    esperado = (int(t0["lanes"]) if str(t0.get("lanes", "")).isdigit() else 2) * 3.5 * 1.8 + 4

    def seccion(q):
        pts = [
            (q[0] + nx * (k * paso - mitad), q[1] + ny * (k * paso - mitad))
            for k in range(int(2 * mitad / paso) + 1)
        ]
        en = {
            n: [idx[n](x, y) for x, y in pts]
            for n in ("calzada", "acotamiento", "banqueta", "camellon", "paso_peatonal")
        }
        # Las rayas de 21 secciones a lo largo de 10 m de vía: no se pierde una discontinua.
        raya = [False] * len(pts)
        for k in range(-10, 11):
            o = k * 0.5
            for j, (x, y) in enumerate(pts):
                if not raya[j] and (
                    idx["rayas_blancas"](x + tx * o, y + ty * o)
                    or idx["rayas_amarillas"](x + tx * o, y + ty * o)
                ):
                    raya[j] = True
        calz = tramos(en["calzada"], paso)
        rayas = []
        for r in tramos(raya, paso):
            # Una doble raya (la amarilla del centro) es una sola división.
            if rayas and r[0] - rayas[-1][1] < 0.5:
                rayas[-1] = (rayas[-1][0], r[1])
            else:
                rayas.append(r)
        # Carriles por calzada: las divisiones de en medio más uno. Las líneas a menos de 2.6 m de
        # la         # orilla son de orilla (el acotamiento pavimentado), no dividen carriles.
        # Una raya de carril mide centímetros; una transversal (alto, cebra) cruza la sección.
        rayas = [r for r in rayas if r[1] - r[0] <= 0.8]
        carriles = [
            len([r for r in rayas if a + 2.6 < (r[0] + r[1]) / 2 < b - 2.6]) + 1 for a, b in calz
        ]
        principal = next((k for k, (a, b) in enumerate(calz) if a - 0.5 <= mitad <= b + 0.5), None)
        return calz, carriles, principal, en

    calz, carriles, principal, en = seccion(p)
    desplazada = 0.0
    if principal is None or calz[principal][1] - calz[principal][0] > esperado:
        for t in (10, -10, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60):
            q = (p[0] + tx * t, p[1] + ty * t)
            r = seccion(q)
            if r[2] is not None and r[0][r[2]][1] - r[0][r[2]][0] <= esperado:
                calz, carriles, principal, en = r
                desplazada = float(t)
                break
    huecos = [round(calz[k + 1][0] - calz[k][1], 1) for k in range(len(calz) - 1)]
    via = e.get("via") or {}
    red = [
        v
        for v in (c["escena"]["lugar"].get("red_vial") or {}).get("vias", [])
        if v.get("id_osm") == w0["id"]
    ]
    return {
        "escena": clave,
        "calle": nombre,
        "osm": {
            "via": nom,
            "highway": t0.get("highway"),
            "lanes": t0.get("lanes"),
            "lanes:forward": t0.get("lanes:forward"),
            "lanes:backward": t0.get("lanes:backward"),
            "oneway": t0.get("oneway"),
            "width": t0.get("width"),
            "sidewalk": t0.get("sidewalk"),
            "turn:lanes": t0.get("turn:lanes")
            or t0.get("turn:lanes:forward")
            or t0.get("turn:lanes:backward"),
            "otro_cuerpo": len(otro_cuerpo),
            "laterales": sorted({w["tags"].get("name", w["tags"]["highway"]) for w in laterales}),
            "semaforos_80m": semaforos,
            "pasos_peatonales_80m": cruces,
            "puentes_80m": puentes,
            "distancia_al_eje_m": round(d0, 1),
        },
        "lo_que_entendio_la_web": red[0] if red else None,
        "3d": {
            "calzadas_en_la_seccion": len(calz),
            "anchos_m": [round(b - a, 1) for a, b in calz],
            "carriles_por_calzada": carriles,
            "calzada_del_choque": principal,
            "seccion_a_m_del_choque": desplazada,
            "separaciones_m": huecos,
            "acotamiento": any(en["acotamiento"]),
            "banqueta": any(en["banqueta"]),
            "guarniciones": len(via.get("guarniciones") or []),
            "barreras": len(via.get("barreras") or []),
            "semaforos": sum(
                1 for d in e.get("dispositivos") or [] if "semaforo" in str(d.get("tipo", ""))
            ),
            "pasos_peatonales": any(en["paso_peatonal"]),
        },
    }


def juicio(a: dict) -> list[tuple[str, str, str, str]]:
    """(etiqueta, lo de OSM, lo del 3D, bien/mal) por cada cosa que se compara."""
    o, d = a["osm"], a["3d"]
    out = []
    k = d["calzada_del_choque"]
    lanes = o["lanes"]
    if lanes:
        dib = d["carriles_por_calzada"][k] if k is not None else None
        ancho = d["anchos_m"][k] if k is not None else None
        # Una calzada mucho más ancha de lo que piden sus carriles: un cruce o una glorieta.
        cruce = ancho is not None and ancho > int(lanes) * 3.5 * 1.8 + 4
        out.append(
            (
                "carriles",
                f"lanes={lanes}" + (f", oneway={o['oneway']}" if o["oneway"] else ""),
                (
                    f"{dib} en {ancho} m"
                    + (
                        f" (a {d['seccion_a_m_del_choque']:+.0f} m)"
                        if d["seccion_a_m_del_choque"]
                        else ""
                    )
                )
                if dib is not None
                else "el choque no cae en una calzada",
                "revisar (cruce o glorieta)"
                if cruce or dib is None
                else "bien"
                if dib == int(lanes)
                else "mal",
            )
        )
    if o["lanes:forward"] or o["lanes:backward"]:
        out.append(
            (
                "carriles por sentido",
                f"forward={o['lanes:forward']}, backward={o['lanes:backward']}",
                "no llega al paquete",
                "mal",
            )
        )
    if o["otro_cuerpo"]:
        out.append(
            (
                "dos cuerpos (camellón)",
                f"{o['otro_cuerpo']} vía(s) del otro sentido",
                f"{d['calzadas_en_la_seccion']} calzadas, separación {d['separaciones_m']} m",
                "bien" if d["calzadas_en_la_seccion"] >= 2 else "mal",
            )
        )
    if o["laterales"]:
        esperadas = 1 + (1 if o["otro_cuerpo"] else 0) + len(o["laterales"])
        out.append(
            (
                "laterales",
                ", ".join(o["laterales"]),
                f"{d['calzadas_en_la_seccion']} calzadas",
                "bien" if d["calzadas_en_la_seccion"] >= esperadas else "mal",
            )
        )
    if o["width"]:
        out.append(("ancho", f"width={o['width']}", f"{d['anchos_m']}", "revisar"))
    if o["sidewalk"] and o["sidewalk"] != "no":
        out.append(
            (
                "banquetas",
                f"sidewalk={o['sidewalk']}",
                f"banqueta={d['banqueta']}, guarniciones={d['guarniciones']}",
                "bien" if d["banqueta"] or d["guarniciones"] else "mal",
            )
        )
    if o["puentes_80m"]:
        out.append(
            (
                "puente / desnivel",
                ", ".join(map(str, o["puentes_80m"])),
                "sin desnivel en el 3D",
                "mal",
            )
        )
    if o["turn:lanes"]:
        out.append(("carriles de vuelta", f"turn:lanes={o['turn:lanes']}", "sin flechas", "mal"))
    if o["semaforos_80m"]:
        out.append(
            (
                "semáforos",
                str(o["semaforos_80m"]),
                str(d["semaforos"]),
                "bien" if d["semaforos"] else "mal",
            )
        )
    if o["pasos_peatonales_80m"]:
        out.append(
            (
                "pasos peatonales",
                str(o["pasos_peatonales_80m"]),
                "sí" if d["pasos_peatonales"] else "no",
                "bien" if d["pasos_peatonales"] else "mal",
            )
        )
    return out


def main() -> None:
    indice = {c["clave"]: c for c in json.loads((DIR / "indice.json").read_text())["casos"]}
    filas = [auditar(clave, nombre, indice) for clave, nombre in ESCENAS]
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / "auditoria_calles.json").write_text(
        json.dumps(filas, ensure_ascii=False, indent=2) + "\n"
    )
    md = [
        "| Calle | Qué | Etiqueta de OSM | Qué dibuja el 3D | ¿Bien? |",
        "| --- | --- | --- | --- | --- |",
    ]
    for a in filas:
        for et, o, d, j in juicio(a):
            md.append(f"| {a['calle']} | {et} | {o} | {d} | {j} |")
    (SALIDA / "auditoria_calles.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))  # noqa: T201


if __name__ == "__main__":
    main()
