"""La parte de `croquis_render.py` que no usa Blender (R11, ADR 0085)."""

from __future__ import annotations

import importlib.util
import json
import math
import struct
import sys
from pathlib import Path
from typing import Any

import pytest

_RUTA = Path(__file__).resolve().parents[1] / "croquis_render.py"
_spec = importlib.util.spec_from_file_location("croquis_render", _RUTA)
assert _spec
assert _spec.loader
cr = importlib.util.module_from_spec(_spec)
# `dataclass` busca su módulo en sys.modules mientras se ejecuta.
sys.modules["croquis_render"] = cr
_spec.loader.exec_module(cr)


def _glb(gltf: dict[str, Any]) -> bytes:
    """Un .glb mínimo: cabecera y el bloque JSON (relleno con espacios a 4 bytes)."""
    datos = json.dumps(gltf).encode("utf-8")
    datos += b" " * (-len(datos) % 4)
    return (
        struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(datos))
        + struct.pack("<I4s", len(datos), b"JSON")
        + datos
    )


GLTF: dict[str, Any] = {
    "asset": {"version": "2.0", "copyright": "Reconstrucción ilustrativa · semilla 7"},
    "scene": 0,
    "scenes": [
        {
            "extras": {
                "leyenda": [
                    "Reconstrucción ilustrativa generada a partir de un relato.",
                    "semilla 7",
                ],
                "tiempo_inicio_s": -2.0,
                "tiempo_fin_s": 6.0,
                "fps": 30,
                "camara_principal": "Cinematográfica",
                "ambiente": {"direccion_luz": [0, 3, 4], "densidad_niebla": 0.0015},
            }
        }
    ],
    "nodes": [
        {"name": "vehiculo_V1", "mesh": 0},
        {"name": "Cinematográfica", "camera": 0},
        {"name": "Cenital", "camera": 1},
    ],
    "cameras": [
        {"type": "perspective", "perspective": {"yfov": math.radians(38)}},
        {"type": "perspective", "perspective": {"yfov": math.radians(40)}},
    ],
}


def test_opciones_por_omision_y_despues_del_separador_de_blender() -> None:
    o = cr.leer_opciones(["blender", "-b", "-P", "croquis_render.py", "--", "caso.glb"])
    assert o.glb == Path("caso.glb")
    assert o.salida == Path("caso.mp4")
    assert (o.motor, o.ancho, o.alto, o.muestras) == ("eevee", 1920, 1080, 64)
    assert o.camara is None
    assert not o.gpu
    assert not o.cuadros
    assert not o.solo_armar


def test_opciones_de_un_render_corto() -> None:
    o = cr.leer_opciones(
        [
            "caso.glb",
            "--motor",
            "cycles",
            "--resolucion",
            "480x270",
            "--desde",
            "-0.5",
            "--hasta",
            "1.5",
            "--cuadros",
            "--camara",
            "Daño",
        ]
    )
    assert (o.motor, o.ancho, o.alto, o.muestras) == ("cycles", 480, 270, 128)
    assert (o.desde, o.hasta) == (-0.5, 1.5)
    assert o.salida == Path("caso")
    assert o.camara == "Daño"


@pytest.mark.parametrize(
    "args",
    [
        ["caso.glb", "--resolucion", "1920"],
        ["caso.glb", "--resolucion", "0x10"],
        ["caso.glb", "--desde", "2", "--hasta", "1"],
        ["caso.glb", "--motor", "workbench"],
    ],
)
def test_opciones_invalidas(args: list[str]) -> None:
    with pytest.raises(SystemExit):
        cr.leer_opciones(args)


def test_lee_el_json_del_glb(tmp_path: Path) -> None:
    ruta = tmp_path / "caso.glb"
    ruta.write_bytes(_glb(GLTF))
    assert cr.leer_glb(ruta) == GLTF
    malo = tmp_path / "malo.glb"
    malo.write_bytes(b"no es glb" + b"\0" * 20)
    with pytest.raises(ValueError, match=r"glTF 2\.0"):
        cr.leer_glb(malo)


def test_la_leyenda_va_en_una_linea_y_nunca_falta() -> None:
    assert cr.texto_leyenda(GLTF) == (
        "Reconstrucción ilustrativa generada a partir de un relato. · semilla 7"
    )
    sin_extras = {**GLTF, "scenes": [{}]}
    assert cr.texto_leyenda(sin_extras) == "Reconstrucción ilustrativa · semilla 7"
    assert cr.texto_leyenda({"asset": {}}) == cr.LEYENDA_POR_OMISION


def test_la_camara_principal_o_la_pedida() -> None:
    assert cr.camara_elegida(GLTF, None) == "Cinematográfica"
    assert cr.camara_elegida(GLTF, "Cenital") == "Cenital"
    with pytest.raises(ValueError, match="Cinematográfica, Cenital"):
        cr.camara_elegida(GLTF, "Conductor V9")
    with pytest.raises(ValueError, match="no trae cámaras"):
        cr.camara_elegida({"nodes": []}, None)
    assert cr.yfov_de(GLTF, "Cenital") == pytest.approx(math.radians(40))


def test_el_tramo_de_cuadros_sale_de_los_segundos_de_la_reconstruccion() -> None:
    # La animación empieza en t_inicio = −2 s, en el cuadro 0 de Blender, a 30 fps.
    assert cr.tramo_cuadros(0, 30, -2.0, 6.0, None, None) == (0, 240)
    assert cr.tramo_cuadros(0, 30, -2.0, 6.0, -0.5, 1.5) == (45, 105)
    assert cr.tramo_cuadros(1, 30, -2.0, 6.0, -9.0, 99.0) == (
        1,
        241,
    )  # se recorta a la reconstrucción
    with pytest.raises(ValueError, match="fuera de la reconstrucción"):
        cr.tramo_cuadros(0, 30, -2.0, 6.0, 7.0, 8.0)


def test_el_sol_y_la_niebla() -> None:
    assert cr.hacia_el_sol(GLTF["scenes"][0]["extras"]["ambiente"]) == pytest.approx((0, 0.6, 0.8))
    # Con la niebla del visor para una visibilidad V, el volumen deja pasar 1/20 de la luz a V.
    v = 120.0
    densidad = math.sqrt(math.log(20)) / v
    assert math.exp(-cr.sigma_niebla(densidad) * v) == pytest.approx(1 / 20)
    assert cr.color_hex("#ffffff") == pytest.approx((1, 1, 1))
    assert cr.color_hex("#000000") == (0, 0, 0)
    assert cr.color_hex("#808080")[0] == pytest.approx(0.2158605, rel=1e-6)


def test_las_superficies_del_piso() -> None:
    assert cr.es_superficie_del_piso(-0.03, -0.03)  # el suelo
    assert cr.es_superficie_del_piso(0.0, 0.0)  # la calzada
    assert cr.es_superficie_del_piso(0.012, 0.012)  # las rayas
    assert not cr.es_superficie_del_piso(0.0, 1.6)  # un vehículo
    assert not cr.es_superficie_del_piso(0.0, 0.15)  # una banqueta: tiene altura
    assert not cr.es_superficie_del_piso(3.0, 3.01)  # algo plano pero en alto


def test_de_donde_salen_los_modelos(tmp_path: Path) -> None:
    script = tmp_path / "tools" / "blender" / "croquis_render.py"
    script.parent.mkdir(parents=True)
    script.write_text("", encoding="utf-8")
    # Fuera del repositorio: el sitio de Croquis.
    assert cr.origen_de_modelos(None, script, {}) == cr.MODELOS_PRODUCCION
    # Dentro del repositorio (la computadora de la demo): la carpeta versionada.
    repo = tmp_path / "apps" / "web" / "public" / "modelos" / "vehiculos"
    repo.mkdir(parents=True)
    assert cr.origen_de_modelos(None, script, {}) == str(repo)
    # La variable de entorno y la opción mandan sobre lo demás.
    assert cr.origen_de_modelos(None, script, {"CROQUIS_MODELOS": "D:/m"}) == "D:/m"
    assert cr.origen_de_modelos("E:/x", script, {"CROQUIS_MODELOS": "D:/m"}) == "E:/x"


def test_las_clases_con_modelo_y_sus_archivos() -> None:
    gltf = {
        "materials": [
            {"name": "pintura"},
            {
                "name": "UCB_BOTTOM",
                "extras": {"material_modelo": {"clase": "sedan", "material": "UCB_BOTTOM"}},
            },
            {"name": "Tire", "extras": {"material_modelo": {"clase": "moto", "material": "Tire"}}},
            {
                "name": "Tire.001",
                "extras": {"material_modelo": {"clase": "sedan", "material": "Tire"}},
            },
        ]
    }
    assert cr.clases_con_modelo(gltf) == ["moto", "sedan"]
    assert cr.clases_con_modelo({"materials": [{"name": "x"}]}) == []
    assert cr.ruta_del_modelo("https://a.b/modelos/vehiculos/", "suv") == (
        "https://a.b/modelos/vehiculos/suv-blender.glb"
    )
    assert cr.ruta_del_modelo("D:/repo/modelos", "suv") == str(
        Path("D:/repo/modelos/suv-blender.glb")
    )
    assert cr.sin_sufijo("UCB_BOTTOM.001") == "UCB_BOTTOM"
    assert cr.sin_sufijo("Kiri10_bodymat") == "Kiri10_bodymat"


def test_la_leyenda_lleva_la_atribucion_de_los_modelos() -> None:
    gltf = {
        "scenes": [
            {
                "extras": {
                    "leyenda": ["Reconstrucción ilustrativa."],
                    "creditos_modelos": [
                        {
                            "modelo": "Kiri '10",
                            "autor": "Daniel Zhabotinsky",
                            "licencia": "CC-BY 4.0",
                        },
                        {"modelo": "Enduro bike", "autor": "Zaborchik", "licencia": "CC-BY 4.0"},
                    ],
                }
            }
        ]
    }
    assert cr.texto_leyenda(gltf) == (
        "Reconstrucción ilustrativa. · Vehículos 3D: «Kiri '10» de Daniel Zhabotinsky "
        "(CC-BY 4.0); «Enduro bike» de Zaborchik (CC-BY 4.0)"
    )
