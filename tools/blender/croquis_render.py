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
    --cuadros              PNG cuadro por cuadro en vez de MP4; sin sobrescribir: si se corta, la
                           siguiente corrida sigue desde el cuadro donde se quedó
    --plan RUTA            escribe antes de renderizar un JSON con los cuadros (desde, hasta,
                           total, fps): el botón de la demo lo usa para mostrar el avance
    --unir CARPETA         junta los PNG de una carpeta (de --cuadros) en el MP4 de --salida, sin
                           escena: `blender -b -P croquis_render.py -- --unir C --salida V.mp4`
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
import textwrap
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
# Los vehículos se sirven desde Vercel Blob desde el 2026-11-05 (ADR 0107): la ruta lleva la huella
# de la carpeta, que está en `apps/web/recursos.json`. Esta es la de esa fecha, por si no hay repo.
MODELOS_PRODUCCION = (
    "https://fmb6kf9hhoc8c9mk.public.blob.vercel-storage.com/recursos/modelos/vehiculos/"
    "be5de74b8e245430/"
)
SITIO = "https://croquis-sage.vercel.app"


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
    plan: Path | None = None


def leer_opciones(argv: list[str]) -> Opciones:
    """Las opciones que siguen a `--` en la línea de Blender (o todas, fuera de Blender)."""
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    p = argparse.ArgumentParser(prog="croquis_render.py", description=__doc__.split("\n")[0])
    p.add_argument("glb", type=Path, nargs="?")
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
    p.add_argument("--plan", type=Path)
    a = p.parse_args(argv)
    if a.glb is None:
        p.error("falta la escena (.glb)")
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
        plan=a.plan,
    )


# --- Lo que está en el repositorio: texturas, árboles y HDRI (R11 con el escenario de T1) --------


def carpeta_publica(script: Path) -> Path | None:
    """La carpeta `apps/web/public` del repositorio si el script está en él (la computadora de la
    demo); si no, None y los archivos se piden al sitio."""
    partes = script.resolve().parents
    if len(partes) > 2:
        publica = partes[2] / "apps" / "web" / "public"
        if publica.is_dir():
            return publica
    return None


def origen_publico(script: Path) -> str:
    """De dónde leer texturas, árboles y HDRI: la carpeta del repositorio o el sitio de Croquis.

    Los HDRI se sirven desde Vercel Blob (ADR 0107): sin repositorio, solo las texturas y los
    árboles salen del sitio; el HDRI se omite y queda el cielo físico.
    """
    publica = carpeta_publica(script)
    return str(publica) if publica else SITIO


def archivo_publico(origen: str, *partes: str) -> str:
    if origen.startswith(("http://", "https://")):
        return origen.rstrip("/") + "/" + "/".join(partes)
    return str(Path(origen, *partes))


def archivos_de_textura(manifiesto: dict[str, Any], nombre: str) -> dict[str, str]:
    """Los tres mapas (color, normal de OpenGL y rugosidad) de una textura de `texturas.json`."""
    entrada = (manifiesto.get("texturas") or {}).get(nombre)
    if not entrada:
        raise KeyError(f"texturas.json no trae «{nombre}»")
    a = entrada["archivos"]
    return {
        "diff": a["diff"]["archivo"],
        "nor": a["nor_gl"]["archivo"],
        "rough": a["rough"]["archivo"],
    }


def ganancia_de_color(
    color: str, media_rgb: list[float] | tuple[float, ...]
) -> tuple[float, float, float]:
    """El factor por canal que lleva el promedio de la textura al color calibrado (lineal), como
    `colorGain` del visor: la textura aporta detalle, no tono."""
    lin = color_hex(color)  # ya en lineal
    return (
        lin[0] / max(media_rgb[0], 1e-6),
        lin[1] / max(media_rgb[1], 1e-6),
        lin[2] / max(media_rgb[2], 1e-6),
    )


def cuadros_incompletos(carpeta: Path) -> list[Path]:
    """Los PNG de una corrida cortada que no sirven: vacíos (el «lugar apartado» del cuadro que se
    estaba renderizando) o sin el fin de archivo (escritos a medias). Se borran y se rehacen."""
    malos = []
    for f in sorted(carpeta.glob("cuadro_*.png")):
        datos = f.read_bytes()[-12:] if f.stat().st_size >= 12 else b""
        if f.stat().st_size == 0 or b"IEND" not in datos:
            malos.append(f)
    return malos


def plan_de_cuadros(a: int, b: int, fps: int, carpeta: Path) -> dict[str, Any]:
    """Lo que el botón de la demo necesita para mostrar el avance."""
    return {"desde": a, "hasta": b, "total": b - a + 1, "fps": fps, "carpeta": str(carpeta)}


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
    # La semilla no va en el video (René, 2026-11-05): queda en el glTF, el dictamen y la
    # trazabilidad.
    texto = " · ".join(p for p in texto.split(" · ") if not re.match(r"semilla\b", p.strip()))
    texto = texto or LEYENDA_POR_OMISION
    creditos = extras.get("creditos_modelos")
    if isinstance(creditos, list) and creditos:
        modelos = "; ".join(
            f"«{c.get('modelo')}» de {c.get('autor')} ({c.get('licencia')})"
            for c in creditos
            if isinstance(c, dict)
        )
        texto += f" · Vehículos 3D: {modelos}"
    return texto


# Ancho de una letra del sello de Blender (monoespaciado) entre su tamaño: 62 letras de 20 px miden
# unos 730 px (Blender 5.2, 2026-11-05); con margen.
ANCHO_DE_LETRA = 0.62


def tamano_de_leyenda(alto: int) -> int:
    """El tamaño de la letra del sello: 22 px en 1080p, nunca menos de 12."""
    return max(12, round(alto / 48))


def lineas_de_leyenda(texto: str, ancho_px: int, tamano: int) -> str:
    """La leyenda en renglones que caben en el cuadro: el sello de Blender no los parte y cortaba
    la atribución de los modelos (CC-BY) al borde. Parte entre las piezas « · » y, si una pieza
    sola no cabe, entre palabras."""
    limite = max(20, int(0.96 * ancho_px / (ANCHO_DE_LETRA * tamano)))
    renglones: list[str] = []
    for parte in texto.split(" · "):
        trozos = textwrap.wrap(parte, limite) or [""]
        for i, trozo in enumerate(trozos):
            if i == 0 and renglones and len(renglones[-1]) + 3 + len(trozo) <= limite:
                renglones[-1] += " · " + trozo
            else:
                renglones.append(trozo)
    return "\n".join(renglones)


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


def factor_niebla(densidad_visor: float, distancia: float) -> float:
    """Cuánto de la niebla del visor hay a una profundidad: `FogExp2` de three.js, 1 − exp(−(ρz)²).

    three la aplica por píxel con la profundidad de la vista y mezcla hacia el color del cielo; el
    compositor hace lo mismo con la pasada de profundidad (`niebla`). Un volumen homogéneo no puede
    reproducirla: atenúa como exp(−σz), no con el cuadrado de la distancia.
    """
    return 1.0 - math.exp(-((densidad_visor * distancia) ** 2))


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
    entorno_de_t1()
    ambiente = extras.get("ambiente")
    cielo_y_luz(escena, ambiente if isinstance(ambiente, dict) else None)
    hdri_de_luz(escena, ambiente if isinstance(ambiente, dict) else None)
    niebla(escena, ambiente if isinstance(ambiente, dict) else None)
    motor(escena, o)
    leyenda(escena, texto_leyenda(gltf), o.ancho, o.alto)
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


def entorno_de_t1() -> list[str]:  # pragma: no cover - en Blender
    """Rearma lo que el glTF lleva como dato (R11 con el escenario de T1): las texturas en planta de
    la vía, las banquetas y el suelo, las tarjetas de los árboles con su color y su alfa, y las
    hojas de las matas de pasto."""
    import bpy

    origen = origen_publico(Path(__file__))
    hechos: list[str] = []
    manifiesto: dict[str, Any] | None = None
    imagenes: dict[str, Any] = {}

    def imagen(ruta: str, color: bool) -> Any:
        if ruta not in imagenes:
            if ruta.startswith(("http://", "https://")):
                with urllib.request.urlopen(ruta, timeout=120) as r:
                    datos = r.read()
                local = Path(tempfile.gettempdir()) / ("croquis-" + ruta.rsplit("/", 1)[-1])
                local.write_bytes(datos)
                ruta_local = str(local)
            else:
                ruta_local = ruta
            im = bpy.data.images.load(ruta_local, check_existing=True)
            im.colorspace_settings.name = "sRGB" if color else "Non-Color"
            imagenes[ruta] = im
        return imagenes[ruta]

    def operacion(nt: Any, tipo: str, a: Any, b: Any = None, c: Any = None) -> Any:
        """Un nodo Math: cada entrada es una salida de otro nodo o un número."""
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = tipo
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = float(v)
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs[0]

    def uv_del_visor(nt: Any) -> tuple[Any, Any, Any]:
        """(u, v, vector) con la v del visor. Los materiales sin textura salen de three.js con su
        UV tal cual (origen abajo) y el importador de Blender les da la vuelta (glTF lo tiene
        arriba): sin esto, el árbol salía de cabeza y las hojas del pasto, como dientes hacia
        abajo (2026-11-05)."""
        uvn = nt.nodes.new("ShaderNodeUVMap")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(uvn.outputs["UV"], sep.inputs[0])
        v = operacion(nt, "SUBTRACT", 1.0, sep.outputs["Y"])
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(sep.outputs["X"], comb.inputs["X"])
        nt.links.new(v, comb.inputs["Y"])
        return sep.outputs["X"], v, comb.outputs[0]

    def follaje(nt: Any, bsdf: Any, color: Any, alfa: Any) -> None:
        """Hojas delgadas: reflejan y dejan pasar la luz, y se recortan por alfa. En Cycles una
        tarjeta solo recibe el sol por la cara que lo ve y la otra salía negra; el visor ilumina
        las dos."""
        salida = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        trasluz = nt.nodes.new("ShaderNodeBsdfTranslucent")
        nt.links.new(color, trasluz.inputs["Color"])
        # Suma, no mezcla: cada cara junta su medio cielo y el total queda cerca del suelo, como
        # el visor (que ilumina la tarjeta con la normal hacia arriba).
        hoja = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(bsdf.outputs["BSDF"], hoja.inputs[0])
        nt.links.new(trasluz.outputs["BSDF"], hoja.inputs[1])
        hueco = nt.nodes.new("ShaderNodeBsdfTransparent")
        recorte = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(alfa, recorte.inputs["Fac"])
        nt.links.new(hueco.outputs["BSDF"], recorte.inputs[1])
        nt.links.new(hoja.outputs["Shader"], recorte.inputs[2])
        for enlace in list(bsdf.inputs["Alpha"].links):
            nt.links.remove(enlace)
        bsdf.inputs["Alpha"].default_value = 1.0
        nt.links.new(recorte.outputs["Shader"], salida.inputs["Surface"])

    texturas_fachada: dict[str, Any] = {}

    def textura_de(nombre: str) -> Any:
        """La imagen de color de una textura del manifiesto (yeso, tabique, lámina)."""
        nonlocal manifiesto
        if nombre not in texturas_fachada:
            if manifiesto is None:
                ruta_m = archivo_publico(origen, "texturas", "texturas.json")
                if ruta_m.startswith("http"):
                    with urllib.request.urlopen(ruta_m, timeout=60) as r:
                        manifiesto = json.loads(r.read().decode("utf-8"))
                else:
                    manifiesto = json.loads(Path(ruta_m).read_text(encoding="utf-8"))
            arch = archivos_de_textura(manifiesto, nombre)
            texturas_fachada[nombre] = imagen(
                archivo_publico(origen, "texturas", arch["diff"]), True
            )
        return texturas_fachada[nombre]

    def fachada(nt: Any, bsdf: Any, noche: bool) -> None:
        """La fachada de `facades.ts` con la misma cuenta: aplanado teñido o tabique, ventanas con
        herrería y marco, zócalo, cornisa con su sombra y cortina metálica en la planta baja que
        da a la calle. Cada edificio es su propio objeto con sus medidas, su color y sus banderas
        (propiedades `croquis_*` que llegan de los extras del nodo)."""
        coords = nt.nodes.new("ShaderNodeTexCoord")
        pos = nt.nodes.new("ShaderNodeSeparateXYZ")
        nor = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(coords.outputs["Object"], pos.inputs[0])
        nt.links.new(coords.outputs["Normal"], nor.inputs[0])

        def propiedad(nombre: str) -> Any:
            a = nt.nodes.new("ShaderNodeAttribute")
            a.attribute_type = "OBJECT"
            a.attribute_name = nombre
            return a.outputs["Vector"]

        def partes(v: Any) -> tuple[Any, Any, Any]:
            n = nt.nodes.new("ShaderNodeSeparateXYZ")
            nt.links.new(v, n.inputs[0])
            return n.outputs["X"], n.outputs["Y"], n.outputs["Z"]

        o = operacion
        # Los ejes de three: x = X, y = Z, z = −Y de Blender (el importador gira Y arriba a Z).
        px3, py3 = pos.outputs["X"], pos.outputs["Z"]
        pz3 = o(nt, "MULTIPLY", pos.outputs["Y"], -1.0)
        nx3, ny3 = nor.outputs["X"], nor.outputs["Z"]
        nz3 = o(nt, "MULTIPLY", nor.outputs["Y"], -1.0)
        dx, dy, dz = partes(propiedad("croquis_dims"))
        tinte = propiedad("croquis_tinte")
        # Las banderas son 4: lado del frente, tabique, cortina, ventanas encendidas. Un vector de
        # Blender lleva 3; la cuarta va en el alfa del atributo.
        banderas = nt.nodes.new("ShaderNodeAttribute")
        banderas.attribute_type = "OBJECT"
        banderas.attribute_name = "croquis_banderas"
        fx, fy, fz = partes(banderas.outputs["Vector"])
        fw = banderas.outputs["Alpha"]

        def mezcla(f: Any, a: Any, b: Any) -> Any:
            """a + f·(b − a) entre números."""
            return o(nt, "ADD", a, o(nt, "MULTIPLY", f, o(nt, "SUBTRACT", b, a)))

        def paso(borde: Any, x: Any) -> Any:
            """step(borde, x) de GLSL: 1 si x ≥ borde."""
            return o(nt, "SUBTRACT", 1.0, o(nt, "LESS_THAN", x, borde))

        def suave(e0: Any, e1: Any, x: Any) -> Any:
            """smoothstep(e0, e1, x) de GLSL, también con e0 > e1."""
            t = o(nt, "DIVIDE", o(nt, "SUBTRACT", x, e0), o(nt, "SUBTRACT", e1, e0))
            t = o(nt, "MINIMUM", o(nt, "MAXIMUM", t, 0.0), 1.0)
            return o(
                nt,
                "MULTIPLY",
                o(nt, "MULTIPLY", t, t),
                o(nt, "SUBTRACT", 3.0, o(nt, "MULTIPLY", t, 2.0)),
            )

        def por(*fs: Any) -> Any:
            r = fs[0]
            for f in fs[1:]:
                r = o(nt, "MULTIPLY", r, f)
            return r

        def color_mezcla(f: Any, a: Any, b: Any) -> Any:
            m = nt.nodes.new("ShaderNodeMix")
            m.data_type = "RGBA"
            for entrada, v in (("Factor", f), ("A", a), ("B", b)):
                if isinstance(v, (int, float)):
                    m.inputs[entrada].default_value = float(v)
                elif isinstance(v, tuple):
                    m.inputs[entrada].default_value = (*v, 1.0)
                else:
                    nt.links.new(v, m.inputs[entrada])
            return m.outputs["Result"]

        def color_por(v: Any, k: Any, suma: float = 0.0) -> Any:
            """v·k + suma, con k número o salida."""
            m = nt.nodes.new("ShaderNodeVectorMath")
            m.operation = "MULTIPLY_ADD"
            nt.links.new(v, m.inputs[0])
            if isinstance(k, (int, float)):
                m.inputs[1].default_value = (float(k),) * 3
            else:
                nt.links.new(k, m.inputs[1])
            m.inputs[2].default_value = (suma,) * 3
            return m.outputs["Vector"]

        def muestra(nombre: str, mosaico: float, u: Any, v: Any) -> Any:
            c = nt.nodes.new("ShaderNodeCombineXYZ")
            nt.links.new(o(nt, "DIVIDE", u, mosaico), c.inputs["X"])
            nt.links.new(o(nt, "DIVIDE", v, mosaico), c.inputs["Y"])
            t = nt.nodes.new("ShaderNodeTexImage")
            t.image = textura_de(nombre)
            t.extension = "REPEAT"
            nt.links.new(c.outputs[0], t.inputs["Vector"])
            return t.outputs["Color"]

        lado_x = o(nt, "GREATER_THAN", o(nt, "ABSOLUTE", nx3), 0.5)
        along = mezcla(lado_x, o(nt, "MULTIPLY", px3, dx), o(nt, "MULTIPLY", pz3, dz))
        up = o(nt, "MULTIPLY", py3, dy)
        pared_k = o(nt, "LESS_THAN", o(nt, "ABSOLUTE", ny3), 0.5)
        frente = por(
            o(nt, "GREATER_THAN", o(nt, "ABSOLUTE", nz3), 0.5),
            o(nt, "COMPARE", o(nt, "SIGN", nz3), fx, 0.5),
        )
        yeso_t = muestra("yeso", 2.0, along, up)
        yeso = color_mezcla(0.7, tinte, color_por(color_por(yeso_t, tinte), 2.1))
        tabique = color_por(muestra("tabique", 2.0, along, up), 1.25)
        pared = color_mezcla(fy, yeso, tabique)
        wx = o(nt, "FRACT", o(nt, "ADD", o(nt, "DIVIDE", along, 3.0), 0.5))
        wy = o(nt, "FRACT", o(nt, "DIVIDE", up, 3.2))
        bajo_pretil = o(nt, "LESS_THAN", up, o(nt, "SUBTRACT", dy, 0.6))
        en_ventana = por(
            paso(0.33, wx), paso(wx, 0.67), paso(0.36, wy), paso(wy, 0.7), bajo_pretil, pared_k
        )
        lx = o(nt, "DIVIDE", o(nt, "SUBTRACT", wx, 0.33), 0.34)
        ly = o(nt, "DIVIDE", o(nt, "SUBTRACT", wy, 0.36), 0.34)
        barrotes = o(
            nt,
            "MAXIMUM",
            paso(0.88, o(nt, "FRACT", o(nt, "MULTIPLY", lx, 4.0))),
            paso(0.9, o(nt, "FRACT", o(nt, "MULTIPLY", ly, 2.0))),
        )
        vidrio = color_mezcla(barrotes, color_hex("#283240"), color_hex("#1a1a1a"))
        sx = o(nt, "FRACT", o(nt, "DIVIDE", along, 8.0))
        cortina = por(paso(0.12, sx), paso(sx, 0.52), paso(up, 2.6), frente, fz)
        lamina = color_por(muestra("lamina", 2.7, along, up), 0.8)
        sin_cortina = o(nt, "SUBTRACT", 1.0, cortina)
        ventana = o(nt, "MULTIPLY", en_ventana, sin_cortina)
        zocalo = o(nt, "MULTIPLY", suave(1.2, 0.8, up), pared_k)
        cornisa = o(
            nt,
            "MULTIPLY",
            suave(o(nt, "SUBTRACT", dy, 0.3), o(nt, "SUBTRACT", dy, 0.2), up),
            pared_k,
        )
        sombra = por(
            suave(o(nt, "SUBTRACT", dy, 0.3), o(nt, "SUBTRACT", dy, 0.45), up),
            suave(o(nt, "SUBTRACT", dy, 0.7), o(nt, "SUBTRACT", dy, 0.5), up),
            pared_k,
        )
        en_marco = por(
            paso(0.29, wx), paso(wx, 0.71), paso(0.32, wy), paso(wy, 0.74), bajo_pretil, pared_k
        )
        marco = por(en_marco, o(nt, "SUBTRACT", 1.0, en_ventana), sin_cortina)
        f = color_mezcla(zocalo, pared, color_por(pared, 0.74))
        f = color_mezcla(sombra, f, color_por(f, 0.82))
        f = color_mezcla(cornisa, f, color_por(f, 0.35, 0.6))
        f = color_mezcla(marco, f, color_por(f, 0.3, 0.62))
        f = color_mezcla(cortina, f, lamina)
        nt.links.new(color_mezcla(ventana, f, vidrio), bsdf.inputs["Base Color"])
        nt.links.new(mezcla(ventana, 0.92, 0.35), bsdf.inputs["Roughness"])
        bsdf.inputs["Metallic"].default_value = 0.0
        if noche:
            # Ventanas encendidas en casi la mitad de los edificios, como el visor.
            luz = por(ventana, fw, o(nt, "SUBTRACT", 1.0, barrotes))
            bsdf.inputs["Emission Color"].default_value = (1.0, 0.82, 0.5, 1.0)
            nt.links.new(o(nt, "MULTIPLY", luz, 2.2), bsdf.inputs["Emission Strength"])

    def rotulo(nt: Any, bsdf: Any, tipo: str, noche: bool) -> None:
        """Toldos con rayas y letreros con su franja blanca (sin texto ni marca), del color de cada
        uno (`croquis_color` del objeto)."""
        a = nt.nodes.new("ShaderNodeAttribute")
        a.attribute_type = "OBJECT"
        a.attribute_name = "croquis_color"
        u, v, _ = uv_del_visor(nt)
        o = operacion
        if tipo == "letrero":
            franja = o(
                nt,
                "MULTIPLY",
                o(nt, "SUBTRACT", 1.0, o(nt, "LESS_THAN", v, 0.32)),
                o(nt, "SUBTRACT", 1.0, o(nt, "LESS_THAN", 0.68, v)),
            )
        else:
            franja = o(
                nt,
                "SUBTRACT",
                1.0,
                o(nt, "LESS_THAN", o(nt, "FRACT", o(nt, "MULTIPLY", u, 6.0)), 0.5),
            )
        m = nt.nodes.new("ShaderNodeMix")
        m.data_type = "RGBA"
        nt.links.new(franja, m.inputs["Factor"])
        nt.links.new(a.outputs["Vector"], m.inputs["A"])
        m.inputs["B"].default_value = (0.95, 0.95, 0.93, 1.0)
        nt.links.new(m.outputs["Result"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.8
        if noche and tipo == "letrero":
            # La mitad de los letreros, encendidos: al azar por objeto, como el visor por instancia.
            info = nt.nodes.new("ShaderNodeObjectInfo")
            nt.links.new(m.outputs["Result"], bsdf.inputs["Emission Color"])
            encendido = o(nt, "LESS_THAN", info.outputs["Random"], 0.5)
            nt.links.new(o(nt, "MULTIPLY", encendido, 0.9), bsdf.inputs["Emission Strength"])

    for mat in bpy.data.materials:
        tex = mat.get("croquisTextura")
        arbol = mat.get("croquisArbol")
        pasto = mat.get("croquisPasto")
        edificio = mat.get("croquisFachada")
        letrero = mat.get("croquisRotulo")
        if not tex and not arbol and not pasto and not edificio and not letrero:
            continue
        if hasattr(mat, "surface_render_method") and (arbol or pasto):
            mat.surface_render_method = "DITHERED"  # EEVEE: recorte por alfa, como el visor
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        if edificio is not None:
            fachada(nt, bsdf, bool(edificio.get("noche")))
            hechos.append("fachadas")
            continue
        if letrero is not None:
            rotulo(nt, bsdf, str(letrero.get("tipo")), bool(letrero.get("noche")))
            hechos.append(f"{letrero.get('tipo')}s")
            continue
        if tex:
            if manifiesto is None:
                ruta_m = archivo_publico(origen, "texturas", "texturas.json")
                if ruta_m.startswith("http"):
                    with urllib.request.urlopen(ruta_m, timeout=60) as r:
                        manifiesto = json.loads(r.read().decode("utf-8"))
                else:
                    manifiesto = json.loads(Path(ruta_m).read_text(encoding="utf-8"))
            arch = archivos_de_textura(manifiesto, str(tex["nombre"]))
            # En planta, como el visor: (x, z) de three son (X, −Y) de Blender, entre el mosaico.
            geo = nt.nodes.new("ShaderNodeNewGeometry")
            sep = nt.nodes.new("ShaderNodeSeparateXYZ")
            comb = nt.nodes.new("ShaderNodeCombineXYZ")
            neg = nt.nodes.new("ShaderNodeMath")
            neg.operation = "MULTIPLY"
            neg.inputs[1].default_value = -1.0
            esc = nt.nodes.new("ShaderNodeVectorMath")
            esc.operation = "SCALE"
            esc.inputs["Scale"].default_value = 1.0 / float(tex["mosaico_m"])
            nt.links.new(geo.outputs["Position"], sep.inputs[0])
            nt.links.new(sep.outputs["X"], comb.inputs["X"])
            nt.links.new(sep.outputs["Y"], neg.inputs[0])
            nt.links.new(neg.outputs[0], comb.inputs["Y"])
            nt.links.new(comb.outputs[0], esc.inputs[0])
            nodos = {}
            for k, color in (("diff", True), ("nor", False), ("rough", False)):
                n = nt.nodes.new("ShaderNodeTexImage")
                n.image = imagen(archivo_publico(origen, "texturas", arch[k]), color)
                n.extension = "REPEAT"
                nt.links.new(esc.outputs["Vector"], n.inputs["Vector"])
                nodos[k] = n
            gan = nt.nodes.new("ShaderNodeVectorMath")
            gan.operation = "MULTIPLY"
            gan.inputs[1].default_value = ganancia_de_color(
                str(tex["color"]), list(tex["media_rgb"])
            )
            nt.links.new(nodos["diff"].outputs["Color"], gan.inputs[0])
            nt.links.new(gan.outputs["Vector"], bsdf.inputs["Base Color"])
            rug = nt.nodes.new("ShaderNodeMath")
            rug.operation = "MULTIPLY"
            rug.use_clamp = True
            rug.inputs[1].default_value = float(tex["rugosidad"]) / max(
                float(tex["media_rugosidad"]), 1e-6
            )
            nt.links.new(nodos["rough"].outputs["Color"], rug.inputs[0])
            nt.links.new(rug.outputs[0], bsdf.inputs["Roughness"])
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(nodos["nor"].outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
            hechos.append(f"textura {tex['nombre']}")
        elif pasto:
            # Tres hojas por tarjeta que se estrechan hacia la punta, como `grass-tufts.ts`:
            # hoja = |fract(3u) − 0.5|·2, ancho = 1 − 0.85v, alfa = ancho ≥ hoja.
            u, v, _ = uv_del_visor(nt)
            franja = operacion(nt, "FRACT", operacion(nt, "MULTIPLY", u, 3.0))
            hoja = operacion(
                nt,
                "MULTIPLY",
                operacion(nt, "ABSOLUTE", operacion(nt, "SUBTRACT", franja, 0.5)),
                2.0,
            )
            ancho = operacion(nt, "MULTIPLY_ADD", v, -0.85, 1.0)
            base = color_hex(str(pasto["color"]))
            k = 0.6 if pasto.get("noche") else 1.0
            mezcla = nt.nodes.new("ShaderNodeMix")
            mezcla.data_type = "RGBA"
            mezcla.inputs["A"].default_value = (*(c * 0.85 * k for c in base), 1)
            mezcla.inputs["B"].default_value = (*((c * 1.35 + 0.03) * k for c in base), 1)
            nt.links.new(v, mezcla.inputs["Factor"])
            nt.links.new(mezcla.outputs["Result"], bsdf.inputs["Base Color"])
            bsdf.inputs["Roughness"].default_value = 0.95
            follaje(nt, bsdf, mezcla.outputs["Result"], operacion(nt, "GREATER_THAN", ancho, hoja))
            # La normal hacia arriba en las dos caras, como el visor (se ilumina como el suelo); si
            # no, la cara de atrás de cada hoja sale negra.
            arriba = nt.nodes.new("ShaderNodeCombineXYZ")
            arriba.inputs["Z"].default_value = 1.0
            nt.links.new(arriba.outputs[0], bsdf.inputs["Normal"])
            hechos.append("matas de pasto")
        else:
            _, _, uv = uv_del_visor(nt)
            diff = nt.nodes.new("ShaderNodeTexImage")
            diff.image = imagen(archivo_publico(origen, "arboles", str(arbol["diff"])), True)
            nor = nt.nodes.new("ShaderNodeTexImage")
            nor.image = imagen(archivo_publico(origen, "arboles", str(arbol["nor"])), False)
            for n in (diff, nor):
                nt.links.new(uv, n.inputs["Vector"])
            color_final = diff.outputs["Color"]
            tinte = arbol.get("tinte")
            if tinte:
                mezcla = nt.nodes.new("ShaderNodeMix")
                mezcla.data_type = "RGBA"
                mezcla.inputs["Factor"].default_value = 0.35
                r, g, b = color_hex(str(tinte))
                mezcla.inputs["B"].default_value = (r, g, b, 1)
                nt.links.new(diff.outputs["Color"], mezcla.inputs["A"])
                color_final = mezcla.outputs["Result"]
            if arbol.get("noche"):
                # De noche el follaje casi no refleja el cielo, como en el visor.
                oscuro = nt.nodes.new("ShaderNodeVectorMath")
                oscuro.operation = "MULTIPLY"
                oscuro.inputs[1].default_value = (0.75, 0.78, 0.8)
                nt.links.new(color_final, oscuro.inputs[0])
                color_final = oscuro.outputs["Vector"]
            nt.links.new(color_final, bsdf.inputs["Base Color"])
            # Recorte a 0.5, como el visor (`alphaTest`); la tarjeta vista de canto se desvanece
            # (la «costura» de las tarjetas cruzadas, T1.3c): |n·v| de 0.08 a 0.38.
            geo = nt.nodes.new("ShaderNodeNewGeometry")
            punto = nt.nodes.new("ShaderNodeVectorMath")
            punto.operation = "DOT_PRODUCT"
            nt.links.new(geo.outputs["Normal"], punto.inputs[0])
            nt.links.new(geo.outputs["Incoming"], punto.inputs[1])
            canto = nt.nodes.new("ShaderNodeMapRange")
            canto.interpolation_type = "SMOOTHSTEP"
            canto.inputs["From Min"].default_value = 0.08
            canto.inputs["From Max"].default_value = 0.38
            nt.links.new(operacion(nt, "ABSOLUTE", punto.outputs["Value"]), canto.inputs["Value"])
            alfa = operacion(nt, "MULTIPLY", diff.outputs["Alpha"], canto.outputs["Result"])
            follaje(nt, bsdf, color_final, operacion(nt, "GREATER_THAN", alfa, 0.5))
            # La tangente de Blender sale de la UV importada (con la v al revés): el verde del
            # mapa de normales se invierte para que el relieve quede como en el visor.
            canales = nt.nodes.new("ShaderNodeSeparateColor")
            nt.links.new(nor.outputs["Color"], canales.inputs["Color"])
            junta = nt.nodes.new("ShaderNodeCombineColor")
            nt.links.new(canales.outputs["Red"], junta.inputs["Red"])
            nt.links.new(
                operacion(nt, "SUBTRACT", 1.0, canales.outputs["Green"]), junta.inputs["Green"]
            )
            nt.links.new(canales.outputs["Blue"], junta.inputs["Blue"])
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(junta.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
            hechos.append(f"árbol {arbol['especie']} ({arbol['tarjeta']})")
    if hechos:
        print(f"Entorno de T1 rearmado: {len(hechos)} materiales ({origen}).")
    return hechos


def hdri_de_luz(escena: Any, ambiente: dict[str, Any] | None) -> bool:  # pragma: no cover
    """La luz de ambiente con el mismo HDRI que el visor (T1.1): ilumina y se refleja, y la
    cámara sigue viendo el cielo físico, como en el visor (`Is Camera Ray`)."""
    import bpy

    hdri = (ambiente or {}).get("hdri")
    publica = carpeta_publica(Path(__file__))
    if not hdri or publica is None:
        return False
    manifiesto = json.loads((publica / "hdri" / "hdri.json").read_text(encoding="utf-8"))
    entrada = (manifiesto.get("hdri") or manifiesto).get(str(hdri["nombre"]))
    archivo = entrada.get("archivo") if isinstance(entrada, dict) else None
    if not archivo:
        return False
    nt = escena.world.node_tree
    fondo_cielo = nt.nodes["Background"]
    salida = next(n for n in nt.nodes if n.type == "OUTPUT_WORLD")
    tex = nt.nodes.new("ShaderNodeTexEnvironment")
    tex.image = bpy.data.images.load(str(publica / "hdri" / archivo), check_existing=True)
    mapeo = nt.nodes.new("ShaderNodeMapping")
    mapeo.inputs["Rotation"].default_value[2] = float(hdri.get("giro_rad", 0.0))
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["Generated"], mapeo.inputs["Vector"])
    nt.links.new(mapeo.outputs["Vector"], tex.inputs["Vector"])
    fondo_luz = nt.nodes.new("ShaderNodeBackground")
    fondo_luz.inputs["Strength"].default_value = float(hdri.get("intensidad", 1.0))
    nt.links.new(tex.outputs["Color"], fondo_luz.inputs["Color"])
    camino = nt.nodes.new("ShaderNodeLightPath")
    mezcla = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(camino.outputs["Is Camera Ray"], mezcla.inputs["Fac"])
    nt.links.new(fondo_luz.outputs["Background"], mezcla.inputs[1])
    nt.links.new(fondo_cielo.outputs["Background"], mezcla.inputs[2])
    nt.links.new(mezcla.outputs["Shader"], salida.inputs["Surface"])
    print(f"Luz de ambiente con el HDRI «{hdri['nombre']}».")
    return True


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
    luz = bpy.data.lights.new("Sol" if not noche else "Luna", type="SUN")
    luz.energy = 1.6 * float(ambiente["intensidad_luz"])
    luz.angle = math.radians(0.53)
    if noche:
        luz.color = (0.72, 0.78, 1.0)
    obj = bpy.data.objects.new(luz.name, luz)
    escena.collection.objects.link(obj)
    # La lámpara alumbra hacia su −Z: su +Z apunta al sol.
    obj.rotation_euler = Vector(hacia_el_sol(ambiente)).to_track_quat("Z", "Y").to_euler()


def niebla(escena: Any, ambiente: dict[str, Any] | None) -> None:  # pragma: no cover
    """La niebla del visor en el compositor: con la profundidad de cada píxel, mezcla hacia el color
    del cielo con `factor_niebla`. Como en el visor, el cielo (el fondo) no lleva niebla."""
    import bpy

    densidad = float((ambiente or {}).get("densidad_niebla", 0.0))
    if densidad <= NIEBLA_MINIMA:
        return
    escena.view_layers[0].use_pass_z = True
    arbol = bpy.data.node_groups.new("Niebla", "CompositorNodeTree")
    arbol.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    escena.compositing_node_group = arbol
    n, enlaces = arbol.nodes, arbol.links
    capas = n.new("CompositorNodeRLayers")
    salida_grupo = n.new("NodeGroupOutput")

    def operacion(tipo: str, a: Any, b: float | None = None) -> Any:
        m = n.new("ShaderNodeMath")
        m.operation = tipo
        enlaces.new(a, m.inputs[0])
        if b is not None:
            m.inputs[1].default_value = b
        return m.outputs[0]

    profundidad = capas.outputs["Depth"]
    rz = operacion("MULTIPLY", profundidad, densidad)
    cuadrado = operacion("POWER", rz, 2.0)
    transmision = operacion("EXPONENT", operacion("MULTIPLY", cuadrado, -1.0))
    factor = operacion("SUBTRACT", transmision)
    factor.node.inputs[0].default_value = 1.0
    enlaces.new(transmision, factor.node.inputs[1])
    # El cielo no tiene profundidad finita: ahí el factor es 0, como el fondo del visor.
    geometria = operacion("LESS_THAN", profundidad, 1e6)
    final = n.new("ShaderNodeMath")
    final.operation = "MULTIPLY"
    enlaces.new(factor, final.inputs[0])
    enlaces.new(geometria, final.inputs[1])
    mezcla = n.new("ShaderNodeMix")
    mezcla.data_type = "RGBA"
    enlaces.new(final.outputs[0], mezcla.inputs["Factor"])
    enlaces.new(capas.outputs["Image"], mezcla.inputs["A"])
    noche = bool((ambiente or {}).get("noche"))
    r, g, b = color_hex(str((ambiente or {}).get("color_cielo", "#18223d" if noche else "#9aa3ad")))
    mezcla.inputs["B"].default_value = (r, g, b, 1)
    enlaces.new(mezcla.outputs["Result"], salida_grupo.inputs[0])


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


def leyenda(escena: Any, texto: str, ancho: int, alto: int) -> None:  # pragma: no cover
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
    tamano = tamano_de_leyenda(alto)
    r.stamp_note_text = lineas_de_leyenda(texto, ancho, tamano)
    r.use_stamp_labels = False
    r.stamp_font_size = tamano
    r.stamp_foreground = (1, 1, 1, 1)
    # Opaco: el sello se dibuja antes de la transformación de color, y un fondo a medias sobre un
    # cielo claro quedaba casi blanco con la letra blanca encima (2026-11-05).
    r.stamp_background = (0, 0, 0, 1)


def salida(escena: Any, o: Opciones) -> None:  # pragma: no cover - en Blender
    f = escena.render.image_settings
    if o.cuadros:
        o.salida.mkdir(parents=True, exist_ok=True)
        f.media_type = "IMAGE"
        f.file_format = "PNG"
        escena.render.filepath = str(o.salida.resolve() / "cuadro_")
        # Retomable: los cuadros que ya están no se rehacen; el que se está haciendo aparta su
        # lugar (un archivo vacío) y, si la corrida se corta, `cuadros_incompletos` lo borra.
        escena.render.use_overwrite = False
        escena.render.use_placeholder = True
        return
    f.media_type = "VIDEO"
    f.file_format = "FFMPEG"
    ff = escena.render.ffmpeg
    ff.format = "MPEG4"
    ff.codec = "H264"
    ff.constant_rate_factor = "HIGH"
    ff.ffmpeg_preset = "GOOD"
    escena.render.filepath = str(o.salida.resolve())


def unir_cuadros(carpeta: Path, video: Path, fps: int) -> None:  # pragma: no cover - en Blender
    """El MP4 de una carpeta de PNG (de `--cuadros`): el secuenciador de Blender, sin escena."""
    import bpy

    cuadros = sorted(carpeta.glob("cuadro_*.png"))
    if not cuadros:
        raise SystemExit(f"No hay cuadros en {carpeta}.")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    escena = bpy.context.scene
    ed = escena.sequence_editor_create()
    # «strips» desde Blender 4.4 («sequences» ya no existe en 5.x); vacía es falsa: no usar «or».
    tira_col = ed.strips if hasattr(ed, "strips") else ed.sequences
    tira = tira_col.new_image("cuadros", str(cuadros[0]), 1, 1)
    for c in cuadros[1:]:
        tira.elements.append(c.name)
    im = bpy.data.images.load(str(cuadros[0]))
    escena.render.resolution_x, escena.render.resolution_y = im.size[0], im.size[1]
    escena.render.resolution_percentage = 100
    escena.render.fps = fps
    escena.frame_start, escena.frame_end = 1, len(cuadros)
    o = Opciones(
        glb=carpeta,
        salida=video,
        camara=None,
        motor="eevee",
        ancho=im.size[0],
        alto=im.size[1],
        muestras=1,
        gpu=False,
        desde=None,
        hasta=None,
        cuadros=False,
        blend=None,
        solo_armar=False,
    )
    salida(escena, o)
    print(f"Uniendo {len(cuadros)} cuadros en {video}…")
    bpy.ops.render.render(animation=True)
    print(f"Listo: {video}")


def main(argv: list[str]) -> None:  # pragma: no cover - en Blender
    import bpy

    if "--unir" in argv:
        args = argv[argv.index("--") + 1 :] if "--" in argv else argv
        p = argparse.ArgumentParser(prog="croquis_render.py --unir")
        p.add_argument("--unir", type=Path, required=True)
        p.add_argument("--salida", type=Path, required=True)
        p.add_argument("--fps", type=int, default=30)
        a = p.parse_args(args)
        plan = a.unir / "plan.json"
        fps = json.loads(plan.read_text(encoding="utf-8"))["fps"] if plan.exists() else a.fps
        unir_cuadros(a.unir, a.salida, int(fps))
        return
    o = leer_opciones(argv)
    gltf = leer_glb(o.glb)
    a, b = armar(o, gltf)
    if o.solo_armar:
        print(f"Escena armada: cuadros {a}–{b}{f', guardada en {o.blend}' if o.blend else ''}.")
        return
    if o.cuadros:
        for malo in cuadros_incompletos(o.salida):
            malo.unlink()
        fps = bpy.context.scene.render.fps
        plan = plan_de_cuadros(a, b, fps, o.salida)
        (o.salida / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
        if o.plan:
            o.plan.write_text(json.dumps(plan), encoding="utf-8")
        hechos = len(list(o.salida.glob("cuadro_*.png")))
        if hechos:
            print(f"Se retoma: ya están {hechos} de {b - a + 1} cuadros.")
    print(
        f"Renderizando {b - a + 1} cuadros ({o.motor}, {o.ancho}x{o.alto}, {o.muestras} muestras)…"
    )
    bpy.ops.render.render(animation=True)
    print(f"Listo: {o.salida}")


if __name__ == "__main__":  # pragma: no cover
    main(sys.argv)
