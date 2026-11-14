"""Mide en los modelos de vehículo el ancho del habitáculo a cada altura (U6, ADR 0116).

El visor dibuja a los ocupantes dentro de una caja por clase (`Croquis.Core.Cabina`). Del
cinturón para arriba, la carrocería se mete hacia adentro (los vidrios laterales y el techo), así
que el medio ancho de la lámina de abajo deja que una mano asome por el vidrio. Este script mide,
en cada modelo `-blender.glb` del manifiesto, el medio ancho de la carrocería a cada altura dentro
de la cabina; el visor lo usa para estrechar la caja a la altura de los hombros y de la cabeza.

Corre dentro de Blender (Windows):

    blender -b --factory-startup --python tools/blender/medir_cabina.py -- \
        apps/web/public/modelos/vehiculos eval/results/u6_cabina_perfil.json \
        apps/visor-unity/Assets/Croquis/Core/PerfilCabina.cs

Para cada altura z (como fracción del alto del modelo, de 0.30 a 1.00 cada 0.025) y cada 0.10 m
a lo largo de la cabina, lanza un rayo desde cada costado hacia el centro y toma dónde toca la
carrocería. Con las ruedas: a su altura, la llanta es el costado, y sin ellas los rayos entrarían
por el hueco de la salpicadera. Los vidrios cuentan, porque son el límite. De los puntos a lo
largo, el percentil 20, para que un espejo (unos cuantos rayos que tocan antes) no cuente como
habitáculo. El resultado va como fracción del medio ancho del manifiesto. Una altura donde menos
de la mitad de los rayos toca lámina (una ventana sin vidrio en el modelo, como el tractocamión)
toma la medida de la altura de abajo: el límite sigue siendo la puerta.

Escribe también `apps/visor-unity/Assets/Croquis/Core/PerfilCabina.cs` (generado; no se edita).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy  # type: ignore[import-not-found]
from mathutils import Vector  # type: ignore[import-not-found]
from mathutils.bvhtree import BVHTree  # type: ignore[import-not-found]

PASO_Z = 0.025
Z_DESDE = 0.30
REBANADA_M = 0.10
PERCENTIL = 0.20

# La cabina de cada modelo a lo largo (x adelante desde el centro), como en `Cabina.De`.
CABINA_X = {
    "camion": lambda largo: (largo / 2 - 2.6, largo / 2 - 0.45),
    "tracto": lambda largo: (largo / 2 - 2.6, largo / 2 - 0.45),
    "autobus": lambda largo: (-largo / 2 + 0.3, largo / 2 - 0.45),
    "pickup": lambda largo: (-0.16 * largo, 0.26 * largo),
}


def cabina_x(modelo: str, largo: float) -> tuple[float, float]:
    f = CABINA_X.get(modelo, lambda la: (-la / 2 + 0.25, 0.26 * la))
    return f(largo)


def percentil(valores: list[float], p: float) -> float:
    v = sorted(valores)
    i = p * (len(v) - 1)
    lo = int(i)
    hi = min(lo + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (i - lo)


def carroceria(ruta: Path) -> tuple[BVHTree, list[tuple[float, float, float]]]:
    """La carrocería con sus ruedas, como árbol para lanzar rayos, y sus vértices."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ruta))
    puntos: list[tuple[float, float, float]] = []
    caras: list[tuple[int, ...]] = []
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        m = ob.matrix_world
        base = len(puntos)
        for v in ob.data.vertices:
            w = m @ v.co
            # Blender importa el glTF con z arriba: x adelante, y a la izquierda.
            puntos.append((w.x, w.y, w.z))
        for poly in ob.data.polygons:
            caras.append(tuple(base + i for i in poly.vertices))
    return BVHTree.FromPolygons(puntos, caras), puntos


def medir(modelo: str, ruta: Path, largo: float, ancho: float, alto: float) -> dict[str, object]:
    arbol, pts = carroceria(ruta)
    zs = [p[2] for p in pts]
    ys = [abs(p[1]) for p in pts]
    medido = {"alto_m": max(zs) - min(zs), "medio_ancho_m": max(ys)}
    x0, x1 = cabina_x(modelo, largo)
    n = max(1, int((x1 - x0) / REBANADA_M))
    perfil: list[dict[str, object]] = []
    k = 0
    while True:
        zf = round(Z_DESDE + k * PASO_Z, 4)
        if zf > 1.0 + 1e-9:
            break
        z = zf * alto
        por_rebanada: list[float] = []
        for i in range(n + 1):
            x = x0 + i * (x1 - x0) / n
            for lado in (1.0, -1.0):
                golpe = arbol.ray_cast(Vector((x, 5.0 * lado, z)), Vector((0.0, -lado, 0.0)), 10.0)
                if golpe[0] is not None:
                    por_rebanada.append(abs(golpe[0].y))
        de = 2 * (n + 1)
        if len(por_rebanada) * 2 >= de:
            mitad = round(percentil(por_rebanada, PERCENTIL) / (ancho / 2), 4)
            de_abajo = False
        else:
            mitad = float(perfil[-1]["medio_ancho"]) if perfil else 1.0  # type: ignore[arg-type]
            de_abajo = True
        perfil.append(
            {
                "z": zf,
                "medio_ancho": mitad,
                "rayos": len(por_rebanada),
                "de": de,
                "de_abajo": de_abajo,
            }
        )
        k += 1
    return {
        "modelo": modelo,
        "archivo": ruta.name,
        "manifiesto": {"largo_m": largo, "ancho_m": ancho, "alto_m": alto},
        "medido": {k2: round(v2, 4) for k2, v2 in medido.items()},
        "cabina_x_m": [round(x0, 4), round(x1, 4)],
        "perfil": perfil,
    }


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :]
    carpeta = Path(args[0])
    salida = Path(args[1])
    manifiesto = json.loads((carpeta / "vehiculos.json").read_text(encoding="utf-8"))
    modelos = []
    for nombre, c in manifiesto["clases"].items():
        if nombre == "moto":
            continue
        ruta = carpeta / c["archivos"]["blender"]["archivo"]
        modelos.append(medir(nombre, ruta, c["largo_m"], c["ancho_m"], c["alto_m"]))
        print(f"{nombre}: listo", flush=True)
    salida.write_text(
        json.dumps(
            {
                "nombre": "u6_cabina_perfil",
                "descripcion": (
                    "Medio ancho de la carrocería a cada altura dentro de la cabina, como "
                    "fracción del medio ancho del manifiesto (rayos desde cada costado cada "
                    "0.10 m a lo largo; percentil 20; con las ruedas). Lo usa "
                    "Croquis.Core.Cabina para que ningún punto del ocupante salga por el vidrio."
                ),
                "script": "tools/blender/medir_cabina.py",
                "blender": bpy.app.version_string,
                "paso_z": PASO_Z,
                "rebanada_m": REBANADA_M,
                "percentil": PERCENTIL,
                "modelos": modelos,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    if len(args) > 2:
        escribir_cs(Path(args[2]), modelos)


def escribir_cs(ruta: Path, modelos: list[dict[str, object]]) -> None:
    zs = [p["z"] for p in modelos[0]["perfil"]]  # type: ignore[index]
    lineas = [
        "// Generado por tools/blender/medir_cabina.py (eval/results/u6_cabina_perfil.json)."
        " No se edita.",
        "using System.Collections.Generic;",
        "",
        "namespace Croquis.Core",
        "{",
        "    /// <summary>",
        "    /// El medio ancho de la carrocería a cada altura dentro de la cabina, medido en"
        " cada modelo, como",
        "    /// fracción del medio ancho (las alturas, como fracción del alto). Ver"
        " `Cabina.MedioAncho`.",
        "    /// </summary>",
        "    public static class PerfilCabina",
        "    {",
        "        public static readonly double[] Z = { "
        + ", ".join(f"{z:.3f}" for z in zs)
        + " };",  # type: ignore[union-attr]
        "",
        "        public static readonly Dictionary<string, double[]> MedioAncho ="
        " new Dictionary<string, double[]>",
        "        {",
    ]
    for m in modelos:
        vals = ", ".join(f"{p['medio_ancho']:.4f}" for p in m["perfil"])  # type: ignore[index, union-attr]
        lineas.append(f'            {{ "{m["modelo"]}", new[] {{ {vals} }} }},')
    lineas += ["        };", "    }", "}", ""]
    ruta.write_text(chr(10).join(lineas), encoding="utf-8")


main()
