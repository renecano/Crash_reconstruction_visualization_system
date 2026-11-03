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
    if "wheelstock" in n or "wheelcustom" in n:
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


# --- Modelos genéricos (T1.4, ADR 0097) ---------------------------------------------------------
# Para modelos de otros autores, sin los nombres de pieza de Daniel Zhabotinsky: la configuración
# (en ``vehicles.py``) da el largo real, el giro al frente +X y el papel de cada material. Las
# llantas y las luces se reconocen por geometría: los componentes redondos de los materiales de
# llanta son ruedas; los componentes de los materiales de luces, al frente y abajo son faros y
# atrás, calaveras.


def _material(o) -> str:
    return next((m.name for m in o.data.materials if m), "")


def fusionar_vertices(o, dist: float = 1e-4) -> None:
    """Une los vértices repetidos: muchos modelos llegan como caras sueltas y los componentes
    (ruedas, luces) solo se reconocen por conectividad."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(o.data)
    bm.free()


def _es_disco(a: Vector, b: Vector, radio_min: float, ancho_max: float = 0.7) -> bool:
    """Redondo en XZ, delgado en Y y con el centro a la altura de su radio (toca el piso)."""
    d = b - a
    r = max(d.x, d.z) / 2
    cz = (a.z + b.z) / 2
    return (
        r >= radio_min
        and abs(d.x - d.z) < 0.2 * max(d.x, d.z)
        and d.y < ancho_max * d.x
        and abs(cz - r) < 0.3 * r
    )


def _caras_en_cilindro(o, c: Vector, r: float, ancho: float) -> set[int]:
    """Caras cuyo centro cae dentro del cilindro de la rueda (eje Y) centrado en c."""
    out: set[int] = set()
    for f in o.data.polygons:
        p = f.center
        if (p.x - c.x) ** 2 + (p.z - c.z) ** 2 <= r * r and abs(p.y - c.y) <= ancho / 2:
            out.add(f.index)
    return out


def _caras_por_lado(o, caras: list[int]) -> tuple[list[int], list[int]]:
    """Las caras de un componente a cada lado del plano Y = centro (llantas unidas por su eje)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    ys = [bm.faces[i].calc_center_median().y for i in caras]
    ym = (min(ys) + max(ys)) / 2
    izq = [i for i, y in zip(caras, ys, strict=True) if y >= ym]
    der = [i for i, y in zip(caras, ys, strict=True) if y < ym]
    bm.free()
    return izq, der


def _caja_caras(o, caras: list[int]) -> tuple[Vector, Vector]:
    pts = [o.data.vertices[v].co for i in caras for v in o.data.polygons[i].vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def _empaquetar_ruedas(ruedas_c: list, piezas: dict[int, list]) -> list[dict]:
    """Un vacío por rueda con sus piezas (llanta y rin) adentro; nombres como en los autos."""
    datos: list[dict] = []
    for k, (c, r) in enumerate(ruedas_c):
        frente = "f" if c.x > 0 else "r"
        nombre = f"wheel_{frente}{'l' if c.y > 0 else 'r'}"
        while any(d["nombre"] == nombre for d in datos):
            nombre += "2"
        vacio = bpy.data.objects.new(nombre, None)
        bpy.context.scene.collection.objects.link(vacio)
        vacio.location = c
        vacio["radius"] = round(r, 4)
        for j, o in enumerate(piezas.get(k, [])):
            o.data.transform(Matrix.Translation(-c))
            o.parent = vacio
            o.location = (0, 0, 0)
            o.name = f"{nombre}_rueda_{j}"
            o["role"] = "rueda"
        datos.append(
            {
                "nombre": nombre,
                "centro": [round(v, 4) for v in c],
                "radio": round(r, 4),
                "piezas": len(piezas.get(k, [])),
            }
        )
    return sorted(datos, key=lambda d: d["nombre"])


def preparar_generico(cfg: dict) -> dict:
    roles: dict[str, str] = cfg.get("roles", {})
    # 1. Frente hacia +X y largo real.
    giro = float(cfg.get("giro_z_deg", 0))
    if giro:
        m_giro = Matrix.Rotation(math.radians(giro), 4, "Z")
        for o in mallas():
            o.data.transform(m_giro)
    lo, hi = caja(mallas())
    s = float(cfg["largo_m"]) / (hi.x - lo.x)
    for o in mallas():
        o.data.transform(Matrix.Scale(s, 4))
    lo, hi = caja(mallas())
    mover(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    for o in mallas():
        fusionar_vertices(o)
    # 2. Ruedas: componentes redondos (plano XZ, delgados en Y) de los materiales de llanta,
    #    agrupados por centro (llanta y rin de la misma rueda).
    radio_min = float(cfg.get("radio_min_m", 0.25))
    ruedas_c: list[tuple[Vector, float]] = []
    asignacion: list[tuple[int, object, list[int]]] = []
    # 2a. Ruedas por cilindro (modelos con las llantas fundidas en la carrocería, como el
    #     autobús): la configuración da los centros y el radio; se recortan las caras de los
    #     materiales indicados que caen dentro de cada cilindro.
    cil = cfg.get("ruedas_cilindro")
    if cil:
        r_cil = float(cil["radio_m"])
        for cx, cy, cz in cil["centros"]:
            c = Vector((cx, cy, cz))
            k = len(ruedas_c)
            ruedas_c.append((c, r_cil))
            for o in list(mallas()):
                if _material(o) not in cil["materiales"]:
                    continue
                caras = _caras_en_cilindro(o, c, r_cil * 1.05, float(cil["ancho_m"]))
                if caras:
                    asignacion.append((k, o, sorted(caras)))
    # 2b. Ruedas por conectividad: componentes redondos de los materiales de llanta.
    discos: list[tuple[Vector, float, object, list[int]]] = []
    otros: list[tuple[Vector, object, list[int]]] = []
    for o in list(mallas()):
        if roles.get(_material(o)) != "rueda":
            continue
        for caras, a, b in componentes(o):
            d = b - a
            redondo = abs(d.x - d.z) < 0.2 * max(d.x, d.z)
            # Dos llantas unidas por su eje: un componente ancho en Y; se parte por la mitad y
            # cada mitad (llanta más medio eje) cuenta como disco aunque sea ancha.
            if redondo and d.y > 0.7 * d.x and max(d.x, d.z) / 2 >= radio_min:
                for lado in _caras_por_lado(o, caras):
                    if not lado:
                        continue
                    aa, bb = _caja_caras(o, lado)
                    if _es_disco(aa, bb, radio_min, ancho_max=1.2):
                        discos.append(((aa + bb) / 2, max(bb.x - aa.x, bb.z - aa.z) / 2, o, lado))
                    else:
                        otros.append(((aa + bb) / 2, o, lado))
            elif _es_disco(a, b, radio_min):
                discos.append(((a + b) / 2, max(b.x - a.x, b.z - a.z) / 2, o, caras))
            else:
                otros.append(((a + b) / 2, o, caras))

    def rueda_de(c: Vector) -> int | None:
        for k, (cw, rw_) in enumerate(ruedas_c):
            cerca = abs(c.x - cw.x) < 0.35 * rw_ and abs(c.z - cw.z) < 0.35 * rw_
            if cerca and abs(c.y - cw.y) < 0.45:
                return k
        return None

    for c, r, o, caras in sorted(discos, key=lambda d: -d[1]):
        k = rueda_de(c)
        if k is None:
            ruedas_c.append((c, r))
            k = len(ruedas_c) - 1
        asignacion.append((k, o, caras))
    # Rines, tapones y tuercas: lo demás de los materiales de llanta que cae en una rueda.
    for c, o, caras in otros:
        k = rueda_de(c)
        if k is not None:
            asignacion.append((k, o, caras))
    if not ruedas_c:
        msg = "No se encontraron ruedas: revisa los materiales de llanta de la configuración"
        raise ValueError(msg)
    # El piso lo ponen las ruedas: la más baja toca z = 0.
    dz = min(c.z - r for c, r in ruedas_c)
    mover(Vector((0, 0, -dz)))
    ruedas_c = [(c - Vector((0, 0, dz)), r) for c, r in ruedas_c]
    piezas: dict[int, list] = {}
    por_objeto: dict[str, dict[int, set[int]]] = {}
    for k, o, caras in asignacion:
        por_objeto.setdefault(o.name, {}).setdefault(k, set()).update(caras)
    for nombre, por_rueda in por_objeto.items():
        o = bpy.data.objects[nombre]
        # Al separar un conjunto de caras los índices del resto cambian: se recorre de mayor a
        # menor índice y se traducen los conjuntos que quedan.
        pendientes = {k: set(caras) for k, caras in por_rueda.items()}
        for k in list(pendientes):
            caras = pendientes.pop(k)
            if not caras:
                continue
            piezas.setdefault(k, []).append(separar_caras(o, caras, f"rueda_{k}_{nombre}"))
            quitadas = sorted(caras)
            for k2, resto in pendientes.items():
                nuevo: set[int] = set()
                for i in resto:
                    if i in caras:
                        continue
                    # Cuántas caras quitadas había antes de i.
                    desplaza = sum(1 for q in quitadas if q < i)
                    nuevo.add(i - desplaza)
                pendientes[k2] = nuevo
        if not o.data.polygons:
            bpy.data.objects.remove(o, do_unlink=True)
    # 3. Luces por geometría: al frente y abajo, faros (izquierdo y derecho); atrás, calaveras.
    lo, hi = caja(mallas())
    faros: list = []
    papeles: dict[str, int] = {}
    for o in list(mallas()):
        papel = roles.get(_material(o))
        # Los faros también pueden venir en el material del vidrio (micas): al frente y abajo.
        if papel not in ("luces", "vidrio"):
            continue
        frente_caras: set[int] = set()
        atras_caras: set[int] = set()
        for caras, a, b in componentes(o):
            c = (a + b) / 2
            if c.x > 0.8 * hi.x and c.z < 0.4 * hi.z and (b - a).x < 0.6:
                frente_caras.update(caras)
            elif papel == "luces" and c.x < 0.8 * lo.x and c.z < 0.6 * hi.z:
                atras_caras.update(caras)
        if frente_caras:
            faros.append(separar_caras(o, frente_caras, f"faros_{o.name}"))
        if atras_caras:
            cal = separar_caras(o, atras_caras, f"calaveras_{o.name}")
            cal["role"] = "calavera"
            papeles["calavera"] = papeles.get("calavera", 0) + 1
        if not o.data.polygons:
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        if papel == "luces":
            o["role"] = "plastico"
            papeles["plastico"] = papeles.get("plastico", 0) + 1
    for k, f in enumerate(faros):
        for parte in separar_por_lado(
            f,
            "headlight_l" if k == 0 else f"faro_l_{k}",
            "headlight_r" if k == 0 else f"faro_r_{k}",
        ):
            if parte.data.polygons:
                parte["role"] = "faro"
                papeles["faro"] = papeles.get("faro", 0) + 1
            else:
                bpy.data.objects.remove(parte, do_unlink=True)
    # 4. Los demás papeles, por material; el parabrisas es el vidrio más al frente.
    vidrios: list = []
    for o in mallas():
        if "role" in o or o.parent is not None:
            continue
        papel = roles.get(_material(o), "plastico")
        if papel in ("rueda", "luces"):
            papel = "plastico"
        o["role"] = papel
        papeles[papel] = papeles.get(papel, 0) + 1
        if papel == "vidrio":
            vidrios.append(o)
    if vidrios:
        parabrisas = max(vidrios, key=lambda o: caja([o])[1].x)
        parabrisas.name = "windshield"
    datos = _empaquetar_ruedas(ruedas_c, piezas)
    return {"papeles": papeles, "ruedas": datos}


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :]
    clase, entrada, salida, manifiesto = args[:4]
    cfg = json.loads(args[4]) if len(args) > 4 and args[4] else {}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=entrada)
    aplanar()
    quitados = quitar_marcas()
    lo, hi = caja(mallas())
    mover(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    if cfg:
        info = preparar_generico(cfg)
    else:
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


if __name__ == "__main__":
    main()
