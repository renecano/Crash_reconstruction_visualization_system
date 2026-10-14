"""Geometría de los objetos del entorno (árboles, postes, muros, vehículos estacionados…).

El solver es la referencia: calcula aquí las medidas con las que el visor dibuja cada objeto y con
las que el análisis de visibilidad decide qué tapa la vista, para que ambos usen exactamente lo
mismo. Lo que el relato no dice se completa con valores por defecto; la variación entre árboles
sale de un hash FNV-1a de la semilla y el id (igual al del visor), así que es determinista.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

JsonObj = dict[str, Any]

_LEN = {"m": 1.0, "cm": 0.01, "mm": 0.001, "km": 1000.0}
FLAT_TYPES = frozenset({"muro", "barda"})
TWO_WHEEL = frozenset({"motocicleta", "scooter", "bicicleta"})


def hash01(text: str) -> float:
    """FNV-1a de 32 bits sobre las unidades UTF-16 del texto, normalizado a [0, 1)."""
    h = 0x811C9DC5
    data = text.encode("utf-16-le")
    for i in range(0, len(data), 2):
        h ^= data[i] | (data[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h / 0x1_0000_0000


def _len(field: JsonObj | None) -> float | None:
    if not field:
        return None
    return float(field["valor"]) * _LEN.get(str(field.get("unidad", "m")), 1.0)


@dataclass(frozen=True)
class SceneObject:
    id: str
    tipo: str
    forma: str  # "arbol" | "cilindro" | "caja" | "senal"
    x: float
    y: float
    rumbo_deg: float
    largo: float  # caja: a lo largo de su rumbo; cilindro y árbol: diámetro
    ancho: float
    alto: float  # altura total
    radio: float = 0.0  # cilindro o tronco
    tronco_alto: float = 0.0  # árbol: altura del tronco
    copa_radio: float = 0.0  # árbol: radio de la copa
    copa_centro: float = 0.0  # árbol: altura del centro de la copa
    clase_vehiculo: str | None = None

    def to_dict(self) -> JsonObj:
        d: JsonObj = {
            "id": self.id,
            "tipo": self.tipo,
            "forma": self.forma,
            "x": round(self.x, 6),
            "y": round(self.y, 6),
            "rumbo_deg": round(self.rumbo_deg, 6),
            "largo_m": round(self.largo, 6),
            "ancho_m": round(self.ancho, 6),
            "alto_m": round(self.alto, 6),
        }
        if self.forma in ("arbol", "cilindro"):
            d["radio_m"] = round(self.radio, 6)
        if self.forma == "arbol":
            d["copa"] = {
                "radio_m": round(self.copa_radio, 6),
                "centro_m": round(self.copa_centro, 6),
                "tronco_alto_m": round(self.tronco_alto, 6),
            }
        if self.clase_vehiculo:
            d["clase_vehiculo"] = self.clase_vehiculo
        return d


def tree_geometry(seed: int, oid: str, trunk_d: float, total_h: float | None) -> SceneObject:
    """Tronco y copa de un árbol (si no se declara la altura, varía con el hash)."""
    u = hash01(f"{seed}:{oid}")
    crown_r = 1.8 + 1.6 * u + 2.0 * trunk_d
    if total_h is None:
        trunk_h = 3.5 + 2.5 * u
        crown_c = trunk_h + 0.7 * crown_r
        total = trunk_h + 1.7 * crown_r
    else:
        crown_r = min(crown_r, 0.35 * total_h)
        total = total_h
        crown_c = total_h - crown_r
        trunk_h = total_h - 1.7 * crown_r
    return SceneObject(
        oid,
        "arbol",
        "arbol",
        0.0,
        0.0,
        0.0,
        2 * crown_r,
        2 * crown_r,
        total,
        radio=trunk_d / 2,
        tronco_alto=trunk_h,
        copa_radio=crown_r,
        copa_centro=crown_c,
    )


def scene_objects(spec: JsonObj) -> list[SceneObject]:
    """Geometría de todos los objetos del entorno declarados."""
    seed = int(spec["meta"]["semilla"])
    out: list[SceneObject] = []
    for o in spec["entorno"].get("objetos", []):
        oid = str(o["id"])
        tipo = str(o["tipo"])
        pos = o["posicion"]
        x, y = float(pos["x"]), float(pos["y"])
        rumbo = float(o.get("rumbo_deg", 0.0))
        largo, ancho, alto = _len(o.get("largo")), _len(o.get("ancho")), _len(o.get("alto"))
        if tipo == "arbol":
            d = _len(o.get("diametro_tronco")) or 0.35
            t = tree_geometry(seed, oid, d, alto)
            out.append(
                SceneObject(
                    oid,
                    tipo,
                    "arbol",
                    x,
                    y,
                    rumbo,
                    t.largo,
                    t.ancho,
                    t.alto,
                    radio=t.radio,
                    tronco_alto=t.tronco_alto,
                    copa_radio=t.copa_radio,
                    copa_centro=t.copa_centro,
                )
            )
        elif tipo == "poste":
            d = _len(o.get("diametro_tronco")) or 0.3
            out.append(SceneObject(oid, tipo, "cilindro", x, y, rumbo, d, d, alto or 8.0, d / 2))
        elif tipo == "vehiculo_estacionado":
            clase_field: JsonObj = o.get("clase_vehiculo") or {}
            clase = str(clase_field.get("valor", "sedan_compacto"))
            two = clase in TWO_WHEEL
            out.append(
                SceneObject(
                    oid,
                    tipo,
                    "caja",
                    x,
                    y,
                    rumbo,
                    largo or (2.0 if two else 4.4),
                    ancho or 1.8,
                    alto or 1.5,
                    clase_vehiculo=clase,
                )
            )
        elif tipo == "senal":
            out.append(SceneObject(oid, tipo, "senal", x, y, rumbo, 0.6, 0.04, 2.6, 0.04))
        else:
            flat = tipo in FLAT_TYPES
            out.append(
                SceneObject(
                    oid,
                    tipo,
                    "caja",
                    x,
                    y,
                    rumbo,
                    largo or (6.0 if flat else 2.0),
                    ancho or (0.25 if flat else 1.5),
                    alto or (2.2 if flat else 2.0),
                )
            )
    return out


def footprint_radius(o: SceneObject) -> float:
    """Radio de un círculo que contiene la huella del objeto (para descartes rápidos)."""
    if o.forma == "arbol":
        return max(o.radio, o.copa_radio)
    if o.forma in ("cilindro", "senal"):
        return max(o.radio, 0.5 * o.largo)
    return 0.5 * math.hypot(o.largo, o.ancho)
