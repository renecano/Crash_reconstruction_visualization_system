r"""Mide hacia dónde pone el sol el cielo físico de Blender según `sun_rotation` (R11, ADR 0085).

`croquis_render.py` orienta el cielo con el azimut del sol que calcula el visor (desde el norte
hacia el este). Este script comprueba la convención de Blender en lugar de suponerla: con una
cámara equirectangular que mira al norte y un cubo de referencia al este, renderiza el disco del sol
con `sun_rotation` de 0°, 90° y −90° (40° de elevación) y anota en qué columna y fila cae.

Uso (desde la raíz; escribe eval/results/r11_cielo_blender.json):
    blender -b --factory-startup -P tools/blender/calibrar_cielo.py -- \
        eval/results/r11_cielo_blender.json
"""

from __future__ import annotations

import json
import math
import sys
import tempfile
from pathlib import Path

import bpy  # type: ignore[import-not-found]

ELEVACION_DEG = 40
ANCHO, ALTO = 360, 180


def medir(rotacion_deg: int, carpeta: Path) -> dict[str, object]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.view_settings.view_transform = "Standard"
    s.cycles.samples = 4
    s.cycles.use_denoising = False
    s.render.resolution_x, s.render.resolution_y = ANCHO, ALTO
    mundo = bpy.data.worlds.new("cielo")
    s.world = mundo
    mundo.use_nodes = True
    cielo = mundo.node_tree.nodes.new("ShaderNodeTexSky")
    cielo.sky_type = "MULTIPLE_SCATTERING"
    cielo.sun_disc = True
    cielo.sun_elevation = math.radians(ELEVACION_DEG)
    cielo.sun_rotation = math.radians(rotacion_deg)
    fondo = mundo.node_tree.nodes["Background"]
    mundo.node_tree.links.new(cielo.outputs["Color"], fondo.inputs["Color"])
    # El cielo, tenue: así el disco del sol es lo más brillante aunque no se recorte a 1.
    fondo.inputs["Strength"].default_value = 0.01
    datos = bpy.data.cameras.new("panorama")
    datos.type = "PANO"
    datos.panorama_type = "EQUIRECTANGULAR"
    cam = bpy.data.objects.new("panorama", datos)
    s.collection.objects.link(cam)
    s.camera = cam
    cam.rotation_euler = (math.radians(90), 0, 0)  # mira hacia +Y (norte): el centro de la imagen
    # Referencia: un cubo rojo emisivo al este (+X), en el horizonte.
    bpy.ops.mesh.primitive_cube_add(size=4, location=(50, 0, 0))
    m = bpy.data.materials.new("rojo")
    m.use_nodes = True
    em = m.node_tree.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1, 0, 0, 1)
    em.inputs["Strength"].default_value = 0.05
    m.node_tree.links.new(em.outputs["Emission"], m.node_tree.nodes["Material Output"].inputs[0])
    bpy.context.active_object.data.materials.append(m)
    s.render.image_settings.file_format = "OPEN_EXR"
    s.render.filepath = str(carpeta / f"cielo_{rotacion_deg}.exr")
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(s.render.filepath)
    px = list(img.pixels)
    w = img.size[0]
    n = len(px) // 4
    # Las filas cuentan desde abajo; sobre el horizonte (fila ALTO/2) solo está el cielo.
    sol = max(
        (i for i in range(n) if i // w > ALTO // 2 + 10), key=lambda i: sum(px[4 * i : 4 * i + 3])
    )
    este = max(range(n), key=lambda i: px[4 * i] - px[4 * i + 1] - px[4 * i + 2])
    return {
        "sun_rotation_deg": rotacion_deg,
        # Cada pixel es 1°: columna 180 = norte, 270 = este, 90 = oeste; fila 90 = horizonte.
        "sol_columna": sol % w,
        "sol_fila": sol // w,
        "azimut_medido_deg": (sol % w - ANCHO // 2) % 360,
        "elevacion_medida_deg": sol // w - ALTO // 2,
        "referencia_este_columna": este % w,
    }


def main() -> None:
    salida = Path(sys.argv[sys.argv.index("--") + 1])
    with tempfile.TemporaryDirectory() as tmp:
        medidas = [medir(r, Path(tmp)) for r in (0, 90, -90)]
    resultado = {
        "blender": bpy.app.version_string,
        "elevacion_pedida_deg": ELEVACION_DEG,
        "medidas": medidas,
        "conclusion": "sun_rotation se mide desde el norte hacia el este, como el azimut del visor",
    }
    salida.write_text(json.dumps(resultado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(resultado, ensure_ascii=False))


main()
