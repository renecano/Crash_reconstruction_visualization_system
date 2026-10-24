r"""Prepara un vehículo de Sketchfab para el visor de Croquis (R10, ADR 0086). Corre en Blender.

Uso (lo llama ``uv run croquis-assets vehicles build``):

    blender -b --factory-startup -P preparar_vehiculo.py -- \
        <clase> <entrada.glb> <salida.glb> <manifiesto.json>

Deja el modelo con la misma estructura que el vehículo paramétrico del visor
(``vehicle-geometry.ts``), para que el color del caso, las luces de noche, el daño en la zona
narrada y los restos funcionen igual:

1. **Limpieza (regla 5):** quita las placas y los emblemas (objetos con los materiales de placas o
   insignias) y anota cada objeto quitado.
2. **Jerarquía plana:** cada pieza queda como hija directa del vehículo, con su transformación
   aplicada (el daño deforma las hijas directas del grupo).
3. **Marco:** frente hacia +X, izquierda hacia +Y (−z en three.js), centro de la planta en el origen
   y llantas sobre el piso (z = 0).
4. **Papeles** (``role`` en los extras → ``userData.role``): ``pintura``, ``vidrio``, ``faro``,
   ``calavera``, ``plastico``, ``rueda``; con los nombres que usa el visor: ``windshield``,
   ``headlight_l``/``headlight_r``, ``bumper_front``/``bumper_rear``.
5. **Ruedas:** un vacío ``wheel_fl``, ``wheel_fr``, ``wheel_rl``, ``wheel_rr`` (o ``wheel_f`` y
   ``wheel_r`` en la moto) en el centro de cada rueda, con su radio (``radius``) y la malla adentro.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bmesh  # type: ignore[import-not-found]
import bpy  # type: ignore[import-not-found]
from mathutils import Matrix, Vector  # type: ignore[import-not-found]

QUITAR = {"Carbadges_misc_U", "Numberplates_Misk_U"}


def mallas() -> list:
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def caja(objs: list) -> tuple[Vector, Vector]:
    # De los vértices: ``bound_box`` no se actualiza al transformar la malla.
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def aplanar() -> None:
    """Hijas directas de la escena, con su transformación aplicada; sin vacíos."""
    for o in mallas():
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in [o for o in bpy.context.scene.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in mallas():
        if o.data.users > 1:
            o.data = o.data.copy()
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)


def quitar_marcas() -> list[str]:
    quitados = []
    for o in mallas():
        mats = {m.name for m in o.data.materials if m}
        if mats & QUITAR:
            quitados.append(o.name)
            bpy.data.objects.remove(o, do_unlink=True)
    return sorted(quitados)


def mover(delta: Vector) -> None:
    for o in mallas():
        o.data.transform(Matrix.Translation(delta))


def separar_por_lado(o, izq: str, der: str) -> list:
    """Parte una malla en su mitad izquierda (+Y) y derecha (−Y) por el centro de cada cara."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    der_caras = [f for f in bm.faces if f.calc_center_median().y < 0]
    copia = o.copy()
    copia.data = o.data.copy()
    bpy.context.scene.collection.objects.link(copia)
    bmesh.ops.delete(bm, geom=der_caras, context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    bm = bmesh.new()
    bm.from_mesh(copia.data)
    izq_caras = [f for f in bm.faces if f.calc_center_median().y >= 0]
    bmesh.ops.delete(bm, geom=izq_caras, context="FACES")
    bm.to_mesh(copia.data)
    bm.free()
    o.name, copia.name = izq, der
    return [o, copia]


def papel_de_auto(nombre: str, material: str) -> tuple[str, str | None]:
    """El papel de una pieza de los modelos de Daniel Zhabotinsky y su nombre en el visor."""
    n = nombre.lower()
    if material.lower().endswith("bodymat"):
        if "bumper" in n and "front" in n:
            return "pintura", "bumper_front"
        if "bumper" in n and "rear" in n:
            return "pintura", "bumper_rear"
        return "pintura", None
    if "windshield" in n:
        return "vidrio", "windshield"
    if "transperent" in material.lower():
        return "vidrio", None
    if "headlight" in n:
        return "faro", "headlights"
    if "brakelight" in n or "taillight" in n:
        return "calavera", None
    if "wheelstock" in n:
        return "rueda", "rueda"
    return "plastico", None


def ruedas(lista: list, ejes_ruedas: dict) -> list[dict]:
    """Un vacío por rueda, en su centro, con su radio; la malla de la rueda adentro."""
    datos = []
    for o in lista:
        lo, hi = caja([o])
        centro = (lo + hi) / 2
        radio = max(hi.x - lo.x, hi.z - lo.z) / 2
        frente = "f" if centro.x > 0 else "r"
        if ejes_ruedas.get("dos_ruedas"):
            nombre = f"wheel_{frente}"
        else:
            nombre = f"wheel_{frente}{'l' if centro.y > 0 else 'r'}"
        # Ruedas que repiten nombre (eje doble): la segunda lleva un 2.
        if any(d["nombre"] == nombre for d in datos):
            nombre += "2"
        o.data.transform(Matrix.Translation(-centro))
        vacio = bpy.data.objects.new(nombre, None)
        bpy.context.scene.collection.objects.link(vacio)
        vacio.location = centro
        vacio["radius"] = round(radio, 4)
        o.parent = vacio
        o.location = (0, 0, 0)
        o.name = f"{nombre}_rueda"
        o["role"] = "rueda"
        datos.append(
            {"nombre": nombre, "centro": [round(v, 4) for v in centro], "radio": round(radio, 4)}
        )
    return sorted(datos, key=lambda d: d["nombre"])


def preparar_auto() -> dict:
    piezas_rueda = []
    faros = []
    papeles: dict[str, int] = {}
    for o in mallas():
        mat = next((m.name for m in o.data.materials if m), "")
        papel, nombre = papel_de_auto(o.name, mat)
        if papel == "rueda":
            piezas_rueda.append(o)
            continue
        if nombre == "headlights":
            faros.append(o)
            continue
        o["role"] = papel
        if nombre:
            o.name = nombre
        papeles[papel] = papeles.get(papel, 0) + 1
    # Faros: los que dan luz se parten en izquierdo y derecho (el visor rompe cada uno).
    for k, f in enumerate(faros):
        for parte in separar_por_lado(
            f,
            "headlight_l" if k == 0 else f"faro_l_{k}",
            "headlight_r" if k == 0 else f"faro_r_{k}",
        ):
            parte["role"] = "faro"
            papeles["faro"] = papeles.get("faro", 0) + 1
    return {"papeles": papeles, "ruedas": ruedas(piezas_rueda, {})}


# La moto (Enduro bike de Zaborchik): piezas sin nombre, de frente hacia −Y y fuera de escala. Su
# pintura es el material naranja «Material»; las llantas, «shini».
MOTO_LARGO_M = 2.15
MOTO_PINTURA = "Material"


def componentes(o) -> list[tuple[list[int], Vector, Vector]]:
    """Las piezas sueltas de una malla: índices de sus caras y su caja."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    vistas: set[int] = set()
    out = []
    for f in bm.faces:
        if f.index in vistas:
            continue
        pila, caras = [f], []
        while pila:
            a = pila.pop()
            if a.index in vistas:
                continue
            vistas.add(a.index)
            caras.append(a.index)
            for e in a.edges:
                pila.extend(g for g in e.link_faces if g.index not in vistas)
        pts = [v.co for i in caras for v in bm.faces[i].verts]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        out.append((caras, lo, hi))
    bm.free()
    return out


def separar_caras(o, caras: set[int], nombre: str):
    """Una copia de la malla con solo esas caras; a la original se le quitan."""
    copia = o.copy()
    copia.data = o.data.copy()
    bpy.context.scene.collection.objects.link(copia)
    copia.name = nombre
    for obj, quedan in ((copia, caras), (o, None)):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        borrar = [
            f
            for f in bm.faces
            if (f.index not in quedan if quedan is not None else f.index in caras)
        ]
        bmesh.ops.delete(bm, geom=borrar, context="FACES")
        bm.to_mesh(obj.data)
        bm.free()
    return copia


def preparar_moto() -> dict:
    # Frente hacia +X (estaba hacia −Y) y largo real.
    lo, hi = caja(mallas())
    s = MOTO_LARGO_M / (hi.y - lo.y)
    giro = Matrix.Rotation(math.radians(90), 4, "Z")
    for o in mallas():
        o.data.transform(Matrix.Scale(s, 4) @ giro)
    lo, hi = caja(mallas())
    mover(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    # Ejes: los discos de las llantas (piezas grandes y planas en el plano XZ).
    ejes = []
    for o in mallas():
        for _, a, b in componentes(o):
            d = b - a
            if d.x > 0.4 and d.z > 0.4 and abs(d.x - d.z) < 0.15 * d.x and d.y < 0.2:
                ejes.append(((a + b) / 2, max(d.x, d.z) / 2))
    frente = max(ejes, key=lambda e: e[0].x)
    atras = min(ejes, key=lambda e: e[0].x)
    # El piso lo ponen las llantas (la pata de apoyo bajaba el modelo): la más baja toca z = 0.
    dz = min(c.z - r for c, r in (frente, atras))
    mover(Vector((0, 0, -dz)))
    frente = (frente[0] - Vector((0, 0, dz)), frente[1])
    atras = (atras[0] - Vector((0, 0, dz)), atras[1])
    piezas: dict[str, list] = {"wheel_f": [], "wheel_r": []}
    papeles: dict[str, int] = {}
    for o in list(mallas()):
        mat = next((m.name for m in o.data.materials if m), "")
        por_rueda: dict[str, set[int]] = {"wheel_f": set(), "wheel_r": set()}
        for caras, a, b in componentes(o):
            for nombre, (c, r) in (("wheel_f", frente), ("wheel_r", atras)):
                dentro = all(
                    abs(v) <= r * 1.05 for v in (a.x - c.x, b.x - c.x, a.z - c.z, b.z - c.z)
                )
                if dentro and abs((a.y + b.y) / 2) < 0.2 and b.y - a.y < 0.3:
                    por_rueda[nombre].update(caras)
        for nombre, caras in por_rueda.items():
            if caras:
                piezas[nombre].append(separar_caras(o, caras, f"{nombre}_{o.name}"))
        if not o.data.polygons:
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        papel = "pintura" if mat == MOTO_PINTURA else "plastico"
        o["role"] = papel
        papeles[papel] = papeles.get(papel, 0) + 1
    datos = []
    for nombre, (c, r) in (("wheel_f", frente), ("wheel_r", atras)):
        vacio = bpy.data.objects.new(nombre, None)
        bpy.context.scene.collection.objects.link(vacio)
        vacio.location = c
        vacio["radius"] = round(r, 4)
        for k, o in enumerate(piezas[nombre]):
            o.data.transform(Matrix.Translation(-c))
            o.parent = vacio
            o.location = (0, 0, 0)
            o.name = f"{nombre}_rueda_{k}"
            o["role"] = "rueda"
        datos.append(
            {
                "nombre": nombre,
                "centro": [round(v, 4) for v in c],
                "radio": round(r, 4),
                "piezas": len(piezas[nombre]),
            }
        )
    return {"papeles": papeles, "ruedas": datos}


def main() -> None:
    clase, entrada, salida, manifiesto = sys.argv[sys.argv.index("--") + 1 :][:4]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=entrada)
    aplanar()
    quitados = quitar_marcas()
    lo, hi = caja(mallas())
    mover(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    info = preparar_moto() if clase == "moto" else preparar_auto()
    # Las ruedas cambiaron de padre: sin actualizar, su ``matrix_world`` sigue siendo la anterior.
    bpy.context.view_layer.update()
    lo, hi = caja(mallas())
    caras = sum(len(o.data.polygons) for o in mallas())
    for o in mallas():
        o["modelo"] = clase
    bpy.ops.export_scene.gltf(
        filepath=salida,
        export_format="GLB",
        export_extras=True,
        export_yup=True,
        export_apply=True,
        export_image_format="AUTO",
    )
    Path(manifiesto).write_text(
        json.dumps(
            {
                "clase": clase,
                "largo_m": round(hi.x - lo.x, 4),
                "ancho_m": round(hi.y - lo.y, 4),
                "alto_m": round(hi.z - lo.z, 4),
                "caras": caras,
                "quitados": quitados,
                **info,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print("PREPARADO", clase, caras, "caras")


main()
