r"""Hornea un árbol de Poly Haven a un impostor de vistas alrededor (U2, segunda pasada). Corre en Blender 5.

Uso (lo llama ``node tools/unity/impostores.mjs``):

    blender -b --factory-startup -P hornear_impostor.py -- <arbol.blend> <salida/> <px> <vistas>

Reúsa el horneado de tarjetas del visor web (``assets/pipeline/blender/hornear_arbol.py``, ADR 0099):
el mismo modelo LOD0, centrado con el pie en z = 0, y los mismos dos dibujos por vista (el color sin
luz y la normal en el espacio de la cámara, con el alfa de las hojas). Lo que cambia es la cámara: en
vez de un frente y una planta, ``vistas`` cámaras ortográficas a la altura media del árbol, repartidas
alrededor. La vista 0 mira desde −Y, como el frente de las tarjetas, y las siguientes giran en sentido
antihorario visto desde arriba.

Todas las vistas comparten un cuadro del mismo lado (``lado_m``), centrado en el eje del árbol, para
que el impostor no cambie de tamaño al girar. ``impostor.json`` guarda ese lado, el alto del modelo y
cuántas vistas hay.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy  # type: ignore[import-not-found]
from mathutils import Vector  # type: ignore[import-not-found]

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "assets" / "pipeline" / "blender"))
import hornear_arbol as base  # noqa: E402


def radio_en_planta() -> float:
    """El punto del árbol más lejos de su eje, en planta: el cuadro tiene que cubrirlo en toda vista."""
    r = 0.0
    for o in base.mallas():
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            r = max(r, math.hypot(p.x, p.y))
    return r


def camara(nombre: str, angulo: float, lado: float, alto: float) -> None:
    sc = bpy.context.scene
    datos = bpy.data.cameras.new(nombre)
    datos.type = "ORTHO"
    datos.ortho_scale = lado
    cam = bpy.data.objects.new(nombre, datos)
    sc.collection.objects.link(cam)
    sc.camera = cam
    lejos = (lado + alto) * 2
    cam.location = Vector((math.sin(angulo) * lejos, -math.cos(angulo) * lejos, alto / 2))
    # Mira al eje del árbol, con la vertical hacia arriba.
    cam.rotation_euler = (math.pi / 2, 0, angulo)
    datos.clip_end = lejos * 3


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :]
    blend, px, vistas = args[0], int(args[2]), int(args[3])
    salida = Path(args[1]).resolve()
    salida.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=blend)
    base.elegir_lod0()
    lo, hi = base.centrar()
    alto = hi.z - lo.z
    lado = max(2 * radio_en_planta(), alto) * 1.04
    for modo in ("diff", "nor"):
        base.emision(modo)
        for k in range(vistas):
            base.preparar_render(px)
            camara(f"cam_{k}_{modo}", 2 * math.pi * k / vistas, lado, alto)
            base.dibujar(salida / f"az{k}_{modo}.png")
    (salida / "impostor.json").write_text(
        json.dumps({"lado_m": round(lado, 3), "alto_m": round(alto, 3), "vistas": vistas}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    print("IMPOSTOR", blend)


if __name__ == "__main__":
    main()
