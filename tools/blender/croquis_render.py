"""Croquis → Blender: el video cinematográfico de una reconstrucción (R11, ADR 0085).

Arma en Blender la escena que exporta Croquis con «Exportar a Blender» (un `.glb` con la animación
del solver, las cámaras del visor, los materiales y el ambiente) y renderiza el video con la leyenda
de reconstrucción de apoyo en cada cuadro. El cielo y la luz salen del mismo sol que calcula el
visor para el lugar y la hora del hecho; nada de la reconstrucción se cambia aquí.

Uso (Blender 5.2 o posterior, sin abrir la interfaz):

    blender -b --factory-startup -P croquis_render.py -- escena.glb [opciones]

Opciones:
    --salida RUTA          el video (.mp4) o, con --cuadros, la carpeta de los PNG
                           (por omisión, junto a la escena y con su nombre)
    --camara NOMBRE        la cámara del visor («Cinematográfica», «Cenital», «Daño»,
                           «Conductor V1»…); por omisión, la principal de la escena
    --motor eevee|cycles   (eevee)
    --resolucion AxB       (1920x1080)
    --muestras N           (64 en eevee, 128 en cycles)
    --gpu                  cycles en la tarjeta de video (OptiX, CUDA, HIP, oneAPI o Metal)
    --desde S, --hasta S   el tramo en segundos de la reconstrucción (por omisión, completa)
    --cuadros              PNG cuadro por cuadro en vez de MP4
    --blend RUTA           guarda la escena armada para abrirla y ajustarla en Blender
    --solo-armar           arma (y guarda con --blend) sin renderizar
    --modelos RUTA|URL     los vehículos de Sketchfab con sus texturas (R10): por omisión, los del
                           repositorio si el script está ahí, o los del sitio de Croquis

La parte que no usa Blender (leer el `.glb`, las opciones, el tramo, el sol) son funciones puras con
pruebas en `tools/blender/tests`; `bpy` solo se importa dentro de Blender.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import struct
import sys
import tempfile
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

VERSION_MINIMA = (5, 2, 0)
MOTORES = {"eevee": "BLENDER_EEVEE", "cycles": "CYCLES"}
MUESTRAS = {"eevee": 64, "cycles": 128}
# Sin niebla visible por debajo de esta densidad (la del visor con cielo despejado es 0.0015).
NIEBLA_MINIMA = 0.004
LEYENDA_POR_OMISION = "Reconstrucción ilustrativa de apoyo: el dictamen es del perito."
MODELOS_PRODUCCION = "https://croquis-sage.vercel.app/modelos/vehiculos/"


@dataclass(frozen=True)
class Opciones:
    glb: Path
    salida: Path
    camara: str | None
    motor: str
    ancho: int
    alto: int
    muestras: int
    gpu: bool
    desde: float | None
    hasta: float | None
    cuadros: bool
    blend: Path | None
    solo_armar: bool
    modelos: str | None = None


def leer_opciones(argv: list[str]) -> Opciones:
    """Las opciones que siguen a `--` en la línea de Blender (o todas, fuera de Blender)."""
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    p = argparse.ArgumentParser(prog="croquis_render.py", description=__doc__.split("\n")[0])
    p.add_argument("glb", type=Path)
    p.add_argument("--salida", type=Path)
    p.add_argument("--camara")
    p.add_argument("--motor", choices=sorted(MOTORES), default="eevee")
    p.add_argument("--resolucion", default="1920x1080")
    p.add_argument("--muestras", type=int)
    p.add_argument("--gpu", action="store_true")
    p.add_argument("--desde", type=float)
    p.add_argument("--hasta", type=float)
    p.add_argument("--cuadros", action="store_true")
    p.add_argument("--blend", type=Path)
    p.add_argument("--solo-armar", action="store_true")
    p.add_argument("--modelos")
    a = p.parse_args(argv)
    try:
        ancho, alto = (int(x) for x in a.resolucion.lower().split("x"))
    except ValueError:
        p.error(f"--resolucion debe ser ANCHOxALTO, no «{a.resolucion}»")
    if ancho <= 0 or alto <= 0:
        p.error("--resolucion debe ser positiva")
    if a.desde is not None and a.hasta is not None and a.hasta <= a.desde:
        p.error("--hasta debe ser mayor que --desde")
    salida = a.salida or a.glb.with_suffix("" if a.cuadros else ".mp4")
    return Opciones(
        glb=a.glb,
        salida=salida,
        camara=a.camara,
        motor=a.motor,
        ancho=ancho,
        alto=alto,
        muestras=a.muestras or MUESTRAS[a.motor],
        gpu=a.gpu,
        desde=a.desde,
        hasta=a.hasta,
        cuadros=a.cuadros,
        blend=a.blend,
        solo_armar=a.solo_armar,
        modelos=a.modelos,
    )


def leer_glb(ruta: Path) -> dict[str, Any]:
    """El JSON de un `.glb` (su primer bloque), sin Blender."""
    datos = ruta.read_bytes()
    magia, version, _ = struct.unpack_from("<4sII", datos, 0)
    if magia != b"glTF" or version != 2:
        raise ValueError(f"{ruta} no es un .glb de glTF 2.0")
    largo, tipo = struct.unpack_from("<I4s", datos, 12)
    if tipo != b"JSON":
        raise ValueError(f"{ruta}: el primer bloque no es JSON")
    return json.loads(datos[20 : 20 + largo].decode("utf-8"))


def extras_de(gltf: dict[str, Any]) -> dict[str, Any]:
    """Los `extras` de la escena que exporta Croquis (leyenda, tiempos, cámaras y ambiente)."""
    escenas = gltf.get("scenes") or [{}]
    return dict(escenas[gltf.get("scene", 0)].get("extras") or {})


def texto_leyenda(gltf: dict[str, Any]) -> str:
    """La leyenda de reconstrucción de apoyo, en una línea, para cada cuadro del video.

    Con vehículos de Sketchfab (R10) lleva su atribución (CC-BY pide nombrar al autor y la
    licencia donde se ve el modelo).
    """
    extras = extras_de(gltf)
    lineas = extras.get("leyenda")
    if isinstance(lineas, list) and lineas:
        texto = " · ".join(str(x) for x in lineas)
    else:
        texto = str(gltf.get("asset", {}).get("copyright") or LEYENDA_POR_OMISION)
    creditos = extras.get("creditos_modelos")
    if isinstance(creditos, list) and creditos:
        modelos = "; ".join(
            f"«{c.get('modelo')}» de {c.get('autor')} ({c.get('licencia')})"
            for c in creditos
            if isinstance(c, dict)
        )
        texto += f" · Vehículos 3D: {modelos}"
    return texto


def camara_elegida(gltf: dict[str, Any], pedida: str | None) -> str:
    """El nombre de la cámara a usar: la pedida (si existe) o la principal de la escena."""
    nombres = [n["name"] for n in gltf.get("nodes", []) if "camera" in n and "name" in n]
    if not nombres:
        raise ValueError("La escena no trae cámaras: expórtala de nuevo desde Croquis.")
    if pedida is None:
        principal = extras_de(gltf).get("camara_principal")
        return principal if principal in nombres else nombres[0]
    if pedida not in nombres:
        raise ValueError(f"No hay cámara «{pedida}». Las de esta escena: {', '.join(nombres)}.")
    return pedida


def yfov_de(gltf: dict[str, Any], camara: str) -> float:
    """El campo de visión vertical (rad) de la cámara del visor."""
    for n in gltf.get("nodes", []):
        if n.get("name") == camara and "camera" in n:
            return float(gltf["cameras"][n["camera"]]["perspective"]["yfov"])
    raise ValueError(f"No hay cámara «{camara}»")


def tramo_cuadros(
    inicio_animacion: float,
    fps: int,
    t_inicio: float,
    t_fin: float,
    desde: float | None,
    hasta: float | None,
) -> tuple[int, int]:
    """Los cuadros de Blender del tramo pedido (en segundos de la reconstrucción).

    La animación del `.glb` empieza en `t_inicio` y Blender la pone a partir del cuadro
    `inicio_animacion`; el tramo se recorta a lo que dura la reconstrucción.
    """
    a = max(t_inicio, desde if desde is not None else t_inicio)
    b = min(t_fin, hasta if hasta is not None else t_fin)
    if b <= a:
        raise ValueError(f"El tramo pedido queda fuera de la reconstrucción ({t_inicio}–{t_fin} s)")
    return (
        round(inicio_animacion + (a - t_inicio) * fps),
        round(inicio_animacion + (b - t_inicio) * fps),
    )


def hacia_el_sol(ambiente: dict[str, Any]) -> tuple[float, float, float]:
    """Hacia la luz principal en el marco de Blender (X este, Y norte, Z arriba), unitaria.

    El visor ya la da en el marco del solver, que es el mismo de Blender al importar el glTF.
    """
    x, y, z = (float(v) for v in ambiente["direccion_luz"])
    n = math.sqrt(x * x + y * y + z * z) or 1.0
    return (x / n, y / n, z / n)


def sigma_niebla(densidad_visor: float) -> float:
    """Coeficiente de extinción (1/m) con la misma visibilidad que la niebla del visor.

    El visor usa niebla exponencial cuadrática (`FogExp2`): a la distancia de visibilidad V deja
    pasar 1/20 de la luz con densidad √(ln 20)/V. Un volumen de Blender atenúa con exp(-σd); para
    dejar pasar lo mismo a V, σ = ln 20 / V = √(ln 20) · densidad.
    """
    return math.sqrt(math.log(20)) * densidad_visor


def origen_de_modelos(opcion: str | None, script: Path, entorno: Mapping[str, str]) -> str:
    """De dónde salen los vehículos de Sketchfab con sus texturas (``<clase>-blender.glb``).

    La opción, luego ``CROQUIS_MODELOS``, luego la carpeta del repositorio si el script está en
    él (la computadora de la demo) y, al final, el sitio de Croquis.
    """
    if opcion:
        return opcion
    if entorno.get("CROQUIS_MODELOS"):
        return entorno["CROQUIS_MODELOS"]
    partes = script.resolve().parents
    if len(partes) > 2:
        repo = partes[2] / "apps" / "web" / "public" / "modelos" / "vehiculos"
        if repo.is_dir():
            return str(repo)
    return MODELOS_PRODUCCION


def clases_con_modelo(gltf: dict[str, Any]) -> list[str]:
    """Las clases de vehículo de Sketchfab cuyos materiales vienen sin texturas (R10)."""
    clases = set()
    for m in gltf.get("materials", []):
        ref = (m.get("extras") or {}).get("material_modelo")
        if isinstance(ref, dict) and ref.get("clase"):
            clases.add(str(ref["clase"]))
    return sorted(clases)


def ruta_del_modelo(origen: str, clase: str) -> str:
    """El archivo del modelo de una clase, en una carpeta o en una URL."""
    nombre = f"{clase}-blender.glb"
    if origen.startswith(("http://", "https://")):
        return origen.rstrip("/") + "/" + nombre
    return str(Path(origen) / nombre)


def sin_sufijo(nombre: str) -> str:
    """El nombre de un material sin el sufijo que pone Blender a los repetidos (``.001``)."""
    return re.sub(r"\.\d{3}$", "", nombre)


def es_superficie_del_piso(z_min: float, z_max: float) -> bool:
    """Si una malla es una superficie del piso: plana (menos de 5 cm de alto) y a ras del suelo.

    La calzada del visor junta tramos y uniones redondas que se enciman en el mismo plano. En
    Cycles, la luz que sale de una cara choca de inmediato con su gemela y la zona sale negra (en
    EEVEE y en el visor no pasa). Estas superficies reciben sombras, pero no las proyectan ni
    aparecen en los rayos secundarios: no cambia nada que se vea, y se quitan las manchas.
    """
    return z_max - z_min < 0.05 and z_max < 0.2


def color_hex(c: str) -> tuple[float, float, float]:
    """Un color `#rrggbb` del visor (sRGB) en lineal, como lo usa Blender."""
    c = c.lstrip("#")
    srgb = [int(c[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lineal = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in srgb]
    return (lineal[0], lineal[1], lineal[2])


# --- Dentro de Blender ----------------------------------------------------------------------------


def armar(o: Opciones, gltf: dict[str, Any]) -> tuple[int, int]:  # pragma: no cover - en Blender
    import bpy

    if bpy.app.version < VERSION_MINIMA:
        raise SystemExit(f"Hace falta Blender 5.2 o posterior (este es {bpy.app.version_string}).")
    extras = extras_de(gltf)
    fps = int(extras.get("fps") or 30)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    escena = bpy.context.scene
    # El importador pasa los segundos del glTF a cuadros con los fps de la escena.
    escena.render.fps = fps
    escena.render.fps_base = 1.0
    bpy.ops.import_scene.gltf(filepath=str(o.glb), import_scene_extras=True)

    nombre = camara_elegida(gltf, o.camara)
    cam = next(ob for ob in escena.objects if ob.type == "CAMERA" and ob.name == nombre)
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = yfov_de(gltf, nombre)
    cam.data.clip_start = 0.1
    cam.data.clip_end = 2000.0
    escena.camera = cam

    inicio = min((a.frame_range[0] for a in bpy.data.actions), default=float(escena.frame_start))
    t0 = float(extras.get("tiempo_inicio_s", 0.0))
    t1 = float(extras.get("tiempo_fin_s", t0 + (escena.frame_end - inicio) / fps))
    a, b = tramo_cuadros(inicio, fps, t0, t1, o.desde, o.hasta)
    escena.frame_start, escena.frame_end = a, b

    piso(escena)
    materiales_de_modelos(escena, o, gltf)
    ambiente = extras.get("ambiente")
    cielo_y_luz(escena, ambiente if isinstance(ambiente, dict) else None)
    motor(escena, o)
    leyenda(escena, texto_leyenda(gltf), o.alto)
    salida(escena, o)
    if o.blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(o.blend.resolve()))
    return a, b


def materiales_de_modelos(
    escena: Any, o: Opciones, gltf: dict[str, Any]
) -> list[str]:  # pragma: no cover
    """Los materiales de los vehículos de Sketchfab con sus texturas (WebP), por su nombre."""
    import bpy

    clases = clases_con_modelo(gltf)
    if not clases:
        return []
    origen = origen_de_modelos(o.modelos, Path(__file__), os.environ)
    hechas = []
    for clase in clases:
        ruta = ruta_del_modelo(origen, clase)
        if ruta.startswith(("http://", "https://")):
            with urllib.request.urlopen(ruta, timeout=120) as r:
                datos = r.read()
            local = Path(tempfile.gettempdir()) / f"croquis-{clase}-blender.glb"
            local.write_bytes(datos)
            ruta = str(local)
        antes_m = set(bpy.data.materials)
        antes_o = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=ruta, import_webp_texture=True)
        nuevos = {sin_sufijo(m.name): m for m in bpy.data.materials if m not in antes_m}
        for ob in [ob for ob in bpy.data.objects if ob not in antes_o]:
            bpy.data.objects.remove(ob, do_unlink=True)
        for ob in escena.objects:
            for slot in getattr(ob, "material_slots", []):
                ref = slot.material.get("material_modelo") if slot.material else None
                if ref and ref.get("clase") == clase and ref.get("material") in nuevos:
                    slot.material = nuevos[ref["material"]]
        hechas.append(clase)
    print(f"Vehículos con sus texturas: {', '.join(hechas)} ({origen}).")
    return hechas


def piso(escena: Any) -> None:  # pragma: no cover - en Blender
    """Las superficies del piso no proyectan sombra ni salen en rayos secundarios (ver arriba)."""
    for ob in escena.objects:
        if ob.type != "MESH" or not ob.data.vertices:
            continue
        zs = [(ob.matrix_world @ v.co).z for v in ob.data.vertices]
        if es_superficie_del_piso(min(zs), max(zs)):
            ob.visible_shadow = False
            ob.visible_diffuse = False
            ob.visible_glossy = False


def cielo_y_luz(escena: Any, ambiente: dict[str, Any] | None) -> None:  # pragma: no cover
    """El sol del lugar y la hora del hecho como lámpara, y el cielo físico (o la noche)."""
    import bpy
    from mathutils import Vector

    mundo = bpy.data.worlds.new("Croquis")
    escena.world = mundo
    mundo.use_nodes = True
    nodos = mundo.node_tree.nodes
    fondo = nodos["Background"]
    if ambiente is None:
        fondo.inputs["Color"].default_value = (0.5, 0.6, 0.7, 1)
        fondo.inputs["Strength"].default_value = 1.0
        return
    noche = bool(ambiente.get("noche"))
    if noche:
        r, g, b = color_hex(str(ambiente.get("color_cielo", "#18223d")))
        fondo.inputs["Color"].default_value = (r, g, b, 1)
        fondo.inputs["Strength"].default_value = 0.4 * float(ambiente["intensidad_ambiente"])
    else:
        cielo = nodos.new("ShaderNodeTexSky")
        cielo.sky_type = "MULTIPLE_SCATTERING"
        cielo.sun_disc = False  # el sol que da sombras es la lámpara
        elev = math.radians(float(ambiente["sol"]["elevacion_deg"]))
        az = math.radians(float(ambiente["sol"]["azimut_deg"]))
        cielo.sun_elevation = max(elev, 0.0)
        # El cielo de Blender mide la rotación del sol igual que el visor su azimut: desde el norte
        # (+Y) hacia el este (+X). Medido en Blender 5.2.3 (`calibrar_cielo.py`): 0° al norte, 90°
        # al este, −90° al oeste.
        cielo.sun_rotation = az
        mundo.node_tree.links.new(cielo.outputs["Color"], fondo.inputs["Color"])
        fondo.inputs["Strength"].default_value = 0.25
    densidad = float(ambiente.get("densidad_niebla", 0.0))
    if densidad > NIEBLA_MINIMA:
        vol = nodos.new("ShaderNodeVolumePrincipal")
        vol.inputs["Density"].default_value = sigma_niebla(densidad)
        mundo.node_tree.links.new(vol.outputs["Volume"], nodos["World Output"].inputs["Volume"])

    luz = bpy.data.lights.new("Sol" if not noche else "Luna", type="SUN")
    luz.energy = 1.6 * float(ambiente["intensidad_luz"])
    luz.angle = math.radians(0.53)
    if noche:
        luz.color = (0.72, 0.78, 1.0)
    obj = bpy.data.objects.new(luz.name, luz)
    escena.collection.objects.link(obj)
    # La lámpara alumbra hacia su −Z: su +Z apunta al sol.
    obj.rotation_euler = Vector(hacia_el_sol(ambiente)).to_track_quat("Z", "Y").to_euler()


def motor(escena: Any, o: Opciones) -> None:  # pragma: no cover - en Blender
    import bpy

    escena.render.engine = MOTORES[o.motor]
    escena.render.resolution_x = o.ancho
    escena.render.resolution_y = o.alto
    escena.render.resolution_percentage = 100
    escena.render.use_motion_blur = True
    if o.motor == "eevee":
        escena.eevee.taa_render_samples = o.muestras
        escena.eevee.use_shadows = True
        escena.eevee.use_raytracing = True
        escena.eevee.volumetric_end = 400.0
        return
    escena.cycles.samples = o.muestras
    escena.cycles.use_denoising = True
    escena.cycles.use_adaptive_sampling = True
    if o.gpu:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for tipo in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = tipo
            except TypeError:
                continue
            prefs.get_devices()
            if any(d.type == tipo for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == tipo
                escena.cycles.device = "GPU"
                print(f"Cycles en la tarjeta de video ({tipo}).")
                return
        print("No se encontró una tarjeta de video para Cycles: se usa el procesador.")


def leyenda(escena: Any, texto: str, alto: int) -> None:  # pragma: no cover - en Blender
    """La leyenda de reconstrucción de apoyo impresa en cada cuadro (sello de Blender)."""
    r = escena.render
    r.use_stamp = True
    for campo in (
        "date",
        "time",
        "render_time",
        "frame",
        "frame_range",
        "memory",
        "hostname",
        "camera",
        "lens",
        "scene",
        "marker",
        "filename",
        "sequencer_strip",
    ):
        setattr(r, f"use_stamp_{campo}", False)
    r.use_stamp_note = True
    r.stamp_note_text = texto
    r.use_stamp_labels = False
    r.stamp_font_size = max(12, round(alto / 48))
    r.stamp_foreground = (1, 1, 1, 1)
    r.stamp_background = (0, 0, 0, 0.6)


def salida(escena: Any, o: Opciones) -> None:  # pragma: no cover - en Blender
    f = escena.render.image_settings
    if o.cuadros:
        o.salida.mkdir(parents=True, exist_ok=True)
        f.media_type = "IMAGE"
        f.file_format = "PNG"
        escena.render.filepath = str(o.salida.resolve() / "cuadro_")
        return
    f.media_type = "VIDEO"
    f.file_format = "FFMPEG"
    ff = escena.render.ffmpeg
    ff.format = "MPEG4"
    ff.codec = "H264"
    ff.constant_rate_factor = "HIGH"
    ff.ffmpeg_preset = "GOOD"
    escena.render.filepath = str(o.salida.resolve())


def main(argv: list[str]) -> None:  # pragma: no cover - en Blender
    import bpy

    o = leer_opciones(argv)
    gltf = leer_glb(o.glb)
    a, b = armar(o, gltf)
    if o.solo_armar:
        print(f"Escena armada: cuadros {a}–{b}{f', guardada en {o.blend}' if o.blend else ''}.")
        return
    print(
        f"Renderizando {b - a + 1} cuadros ({o.motor}, {o.ancho}x{o.alto}, {o.muestras} muestras)…"
    )
    bpy.ops.render.render(animation=True)
    print(f"Listo: {o.salida}")


if __name__ == "__main__":  # pragma: no cover
    main(sys.argv)
