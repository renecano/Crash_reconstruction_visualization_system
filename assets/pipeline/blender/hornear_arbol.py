r"""Hornea un árbol de Poly Haven a tarjetas (T1.3b, ADR 0099). Corre en Blender 5.

Uso (lo llama ``uv run croquis-assets trees build``):

    blender -b --factory-startup -P hornear_arbol.py -- \
        <arbol.blend> <salida/> <px_frente> <px_planta>

Abre el ``.blend`` del modelo, lo centra en el origen con el pie en z = 0 y lo dibuja con Eevee,
fondo transparente y vista «Standard» (sin curva de cámara), desde dos cámaras ortográficas:

- **frente**: desde −Y (mira hacia +Y), encuadrando ancho y alto del árbol;
- **planta**: desde arriba, encuadrando la copa.

Para cada vista hay dos dibujos, cambiando el sombreador de cada material por una emisión (con el
alfa del material, así las hojas se recortan igual):

- ``*_diff.png``: emite el color base (la textura o el color del Principled): el color sin luz;
- ``*_nor.png``: emite la normal en el espacio de la cámara, de [−1, 1] a [0, 1]: en el visor es
  la normal en el espacio tangente de la tarjeta.

``medidas.json`` guarda ancho, alto, profundidad y la altura donde arranca la copa.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy  # type: ignore[import-not-found]
from mathutils import Vector  # type: ignore[import-not-found]

ACTIVOS: list = []


def mallas() -> list:
    return list(ACTIVOS)


def elegir_lod0() -> None:
    """Los modelos de Poly Haven traen varias copias (LOD0, LOD1, el objeto de nodos de geometría,
    las hojas sueltas): se dibuja solo la colección ``*_LOD0`` (o el objeto más grande, si no hay)
    y lo demás se oculta."""
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    lod0 = [o for o in objs if o.name.lower().endswith("_lod0") and len(o.data.vertices) > 1000]
    if not lod0:
        lod0 = [max(objs, key=lambda o: len(o.data.vertices))]
    elegidos = max(lod0, key=lambda o: len(o.data.vertices))
    # Todo lo que cuelga del elegido o de su colección (p. ej. tronco y copa separados).
    colecciones = {c.name for c in elegidos.users_collection}
    activos = [
        o
        for o in objs
        if o is elegidos
        or (o.parent is elegidos)
        or (colecciones & {c.name for c in o.users_collection} and "_lod1" not in o.name.lower())
    ]
    for o in objs:
        o.hide_render = o not in activos
        o.hide_viewport = o not in activos
    ACTIVOS[:] = activos


def caja(objs: list) -> tuple[Vector, Vector]:
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
            hi = Vector((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
    return lo, hi


def centrar() -> tuple[Vector, Vector]:
    """Centro de la planta en el origen y el pie (lo más bajo) en z = 0."""
    lo, hi = caja(mallas())
    delta = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    raices = {o for o in mallas() if o.parent is None or o.parent.type != "MESH"}
    for o in raices:
        o.location = o.location + delta
    bpy.context.view_layer.update()
    return caja(mallas())


def arranque_copa(lo: Vector, hi: Vector) -> float:
    """Altura donde el árbol se ensancha: la primera rebanada con más del 35 % del ancho máximo."""
    alto = hi.z - lo.z
    ancho_max = max(hi.x - lo.x, hi.y - lo.y)
    pasos = 40
    anchos = [0.0] * pasos
    for o in mallas():
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            k = min(pasos - 1, max(0, int((p.z - lo.z) / alto * pasos)))
            anchos[k] = max(anchos[k], abs(p.x), abs(p.y))
    # Desde arriba: la copa termina en la primera rebanada (bajando) que ya no llega al 35 % del
    # ancho máximo; así las raíces o una rama baja no cuentan como copa.
    for k in range(pasos - 1, -1, -1):
        if 2 * anchos[k] <= 0.35 * ancho_max:
            return lo.z + ((k + 1) / pasos) * alto
    return lo.z + 0.3 * alto


def preparar_render(px: int) -> None:
    sc = bpy.context.scene
    for motor in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = motor
            break
        except TypeError:
            continue
    sc.render.resolution_x = px
    sc.render.resolution_y = px
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    # Hojas con alfa: Eevee las recorta por el alfa del material.
    for m in bpy.data.materials:
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "DITHERED"
    if sc.world is None:
        sc.world = bpy.data.worlds.new("negro")


def _principled(nt) -> object | None:
    return next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)


def _fuentes(nt, salida) -> tuple[object | None, object | None, float, float]:
    """Dónde salen el color base y el alfa del material: (socket color, socket alfa, color
    por defecto, alfa por defecto). Entiende el Principled y los grupos de Poly Haven (entradas
    «Diffuse»/«Base Color»/«Color» y «Alpha»)."""
    sup = (
        salida.inputs["Surface"].links[0].from_node if salida.inputs["Surface"].is_linked else None
    )
    nodo = sup if sup is not None and sup.type in ("BSDF_PRINCIPLED", "GROUP") else _principled(nt)
    if nodo is None:
        return None, None, (1.0, 1.0, 1.0, 1.0), 1.0
    nombres_color = ("Base Color", "Diffuse", "Color", "Albedo")
    col = next((nodo.inputs[n] for n in nombres_color if n in nodo.inputs), None)
    alfa = nodo.inputs.get("Alpha", None)
    col_src = col.links[0].from_socket if col is not None and col.is_linked else None
    alfa_src = alfa.links[0].from_socket if alfa is not None and alfa.is_linked else None
    col_def = (
        tuple(col.default_value)[:4]
        if col is not None and hasattr(col, "default_value")
        else (1.0, 1.0, 1.0, 1.0)
    )
    alfa_def = float(alfa.default_value) if alfa is not None and not alfa.is_linked else 1.0
    return col_src, alfa_src, col_def, alfa_def


def _armar(nt, salida) -> None:
    """Arma, una vez por material: emisión + transparente mezclados por el alfa del Principled."""
    emi = nt.nodes.new("ShaderNodeEmission")
    emi.name = "croquis_emision"
    emi.inputs["Strength"].default_value = 1.0
    tra = nt.nodes.new("ShaderNodeBsdfTransparent")
    mezcla = nt.nodes.new("ShaderNodeMixShader")
    mezcla.name = "croquis_mezcla"
    nt.links.new(tra.outputs[0], mezcla.inputs[1])
    nt.links.new(emi.outputs[0], mezcla.inputs[2])
    col = nt.nodes.new("ShaderNodeRGB")
    col.name = "croquis_color_base"
    nt["croquis_color_src"] = ""
    col_src, alfa_src, col_def, alfa_def = _fuentes(nt, salida)
    col.outputs[0].default_value = col_def
    if alfa_src is not None:
        nt.links.new(alfa_src, mezcla.inputs["Fac"])
    else:
        mezcla.inputs["Fac"].default_value = alfa_def
    if col_src is not None:
        nt["croquis_color_src"] = f"{col_src.node.name}|{col_src.identifier}"
    # La normal en el espacio de la cámara, de [−1, 1] a [0, 1].
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    tr = nt.nodes.new("ShaderNodeVectorTransform")
    tr.vector_type = "NORMAL"
    tr.convert_from = "WORLD"
    tr.convert_to = "CAMERA"
    nt.links.new(geo.outputs["Normal"], tr.inputs[0])
    esc = nt.nodes.new("ShaderNodeVectorMath")
    esc.name = "croquis_normal01"
    esc.operation = "MULTIPLY_ADD"
    esc.inputs[1].default_value = (0.5, 0.5, 0.5)
    esc.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(tr.outputs[0], esc.inputs[0])
    nt.links.new(mezcla.outputs[0], salida.inputs["Surface"])


def emision(modo: str) -> None:
    """Cada material emite su color base (``diff``) o su normal de cámara (``nor``), con su alfa."""
    for m in bpy.data.materials:
        if not m.use_nodes or m.node_tree is None:
            continue
        nt = m.node_tree
        salida = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if salida is None:
            continue
        if "croquis_emision" not in nt.nodes:
            _armar(nt, salida)
        emi = nt.nodes["croquis_emision"]
        for link in list(nt.links):
            if link.to_node == emi and link.to_socket.name == "Color":
                nt.links.remove(link)
        if modo == "nor":
            nt.links.new(nt.nodes["croquis_normal01"].outputs[0], emi.inputs["Color"])
            continue
        src = str(nt.get("croquis_color_src", ""))
        if src:
            nombre, socket = src.split("|")
            nodo = nt.nodes[nombre]
            sock = next(s for s in nodo.outputs if s.identifier == socket)
            nt.links.new(sock, emi.inputs["Color"])
        else:
            nt.links.new(nt.nodes["croquis_color_base"].outputs[0], emi.inputs["Color"])


def camara(nombre: str, lo: Vector, hi: Vector, vista: str) -> None:
    sc = bpy.context.scene
    cam_data = bpy.data.cameras.new(nombre)
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new(nombre, cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    ancho = max(hi.x - lo.x, hi.y - lo.y)
    alto = hi.z - lo.z
    if vista == "frente":
        cam_data.ortho_scale = max(ancho, alto) * 1.04
        cam.location = Vector((0, -(ancho + alto) * 2, (lo.z + hi.z) / 2))
        cam.rotation_euler = (1.5707963, 0, 0)
    else:
        cam_data.ortho_scale = ancho * 1.04
        cam.location = Vector((0, 0, hi.z + ancho * 2))
        cam.rotation_euler = (0, 0, 0)
    cam_data.clip_end = (ancho + alto) * 6


def dibujar(ruta: Path) -> None:
    sc = bpy.context.scene
    sc.render.filepath = str(ruta)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :]
    blend, px_frente, px_planta = args[0], int(args[2]), int(args[3])
    # Ruta absoluta: Blender resuelve las relativas contra el .blend, no contra el directorio
    # actual.
    salida = Path(args[1]).resolve()
    salida.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=blend)
    elegir_lod0()
    lo, hi = centrar()
    copa = arranque_copa(lo, hi)
    for modo in ("diff", "nor"):
        emision(modo)
        for vista, px in (("frente", px_frente), ("planta", px_planta)):
            preparar_render(px)
            camara(f"cam_{vista}_{modo}", lo, hi, vista)
            dibujar(salida / f"{vista}_{modo}.png")
    (salida / "medidas.json").write_text(
        json.dumps(
            {
                "ancho_m": round(max(hi.x - lo.x, hi.y - lo.y), 3),
                "alto_m": round(hi.z - lo.z, 3),
                "profundidad_m": round(min(hi.x - lo.x, hi.y - lo.y), 3),
                "copa_desde_m": round(copa - lo.z, 3),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print("HORNEADO", blend)


if __name__ == "__main__":
    main()
