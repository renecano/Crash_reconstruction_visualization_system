"""Validación semántica de una EscenaSpec (PLAN §4.2): lo que el JSON Schema no puede expresar.

Referencia de paridad: ``packages/scene-schema/src/check.ts``. Ambos producen la misma lista de
problemas (``codigo`` + ``ruta``) para los casos de ``fixtures/semantic/cases.json``. Los mensajes
están en lenguaje llano y nunca asignan culpa (PLAN §10).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal, cast

from croquis_scene_schema import SCHEMA_VERSION, load_vehicle_classes

Severidad = Literal["error", "advertencia"]
Vec = tuple[float, float]
JsonObj = dict[str, Any]

CONFIANZA_BAJA = 0.3
MASA_A_KG = {"kg": 1.0, "t": 1000.0, "lb": 0.45359237}
LONGITUD_A_M = {"m": 1.0, "cm": 0.01, "mm": 0.001, "km": 1000.0}
VELOCIDAD_A_KMH = {"km/h": 1.0, "m/s": 3.6}


@dataclass(frozen=True, order=True)
class Problema:
    ruta: str
    codigo: str
    severidad: Severidad
    mensaje: str

    def as_dict(self) -> dict[str, str]:
        return {
            "codigo": self.codigo,
            "severidad": self.severidad,
            "ruta": self.ruta,
            "mensaje": self.mensaje,
        }


def masa_kg(campo: JsonObj) -> float:
    return float(campo["valor"]) * MASA_A_KG.get(campo.get("unidad", "kg"), 1.0)


def longitud_m(campo: JsonObj) -> float:
    return float(campo["valor"]) * LONGITUD_A_M.get(campo.get("unidad", "m"), 1.0)


def velocidad_kmh(campo: JsonObj) -> float:
    return float(campo["valor"]) * VELOCIDAD_A_KMH.get(campo.get("unidad", "km/h"), 1.0)


def corners(pose: JsonObj, largo: float, ancho: float) -> list[Vec]:
    th = math.radians(float(pose["rumbo_deg"]))
    c, s = math.cos(th), math.sin(th)
    hl, hw = largo / 2, ancho / 2
    local: list[Vec] = [(hl, hw), (hl, -hw), (-hl, -hw), (-hl, hw)]
    x0, y0 = float(pose["x"]), float(pose["y"])
    return [(x0 + x * c - y * s, y0 + x * s + y * c) for x, y in local]


def boxes_overlap(a: list[Vec], b: list[Vec]) -> bool:
    """Separating Axis Theorem para dos rectángulos orientados."""
    axes: list[Vec] = []
    for poly in (a, b):
        for i in range(2):
            (px, py), (qx, qy) = poly[i], poly[i + 1]
            ex, ey = qx - px, qy - py
            axes.append((-ey, ex))
    for ax, ay in axes:
        amin, amax = _proj(a, ax, ay)
        bmin, bmax = _proj(b, ax, ay)
        if amax <= bmin or bmax <= amin:
            return False
    return True


def _proj(poly: list[Vec], ax: float, ay: float) -> tuple[float, float]:
    ds = [x * ax + y * ay for x, y in poly]
    return min(ds), max(ds)


def _is_campo(o: object) -> bool:
    return isinstance(o, dict) and "fuente" in cast(JsonObj, o)


def check_escena(spec: JsonObj, clases: dict[str, JsonObj] | None = None) -> list[Problema]:
    """Problemas semánticos de una escena ya válida contra el JSON Schema.

    ``clases``: rangos por clase; por defecto ``vehicle_classes.json``; pasa ``{}`` para omitirlos.
    """
    tabla = load_vehicle_classes() if clases is None else clases
    problemas: list[Problema] = []

    def err(codigo: str, ruta: str, mensaje: str) -> None:
        problemas.append(Problema(ruta, codigo, "error", mensaje))

    def warn(codigo: str, ruta: str, mensaje: str) -> None:
        problemas.append(Problema(ruta, codigo, "advertencia", mensaje))

    meta = cast(JsonObj, spec["meta"])
    relato = cast(str | None, meta.get("relato"))
    vehiculos = cast(list[JsonObj], spec["vehiculos"])
    personas = cast(list[JsonObj], spec["personas"])
    objetos = cast(list[JsonObj], cast(JsonObj, spec["entorno"]).get("objetos", []))
    dispositivos = cast(list[JsonObj], cast(JsonObj, spec["lugar"]).get("dispositivos", []))
    eventos = cast(list[JsonObj], spec["eventos"])
    danos = cast(list[JsonObj], spec["danos_declarados"])
    evidencias = cast(list[JsonObj], spec["evidencias"])

    if meta["version_esquema"] != SCHEMA_VERSION:
        warn(
            "W002",
            "/meta/version_esquema",
            f"La escena usa la versión {meta['version_esquema']}; la vigente es {SCHEMA_VERSION}. "
            "Conviene migrarla.",
        )

    # --- Ids y referencias ---------------------------------------------------------------
    kinds: dict[str, str] = {}
    seen: dict[str, str] = {}

    def register(id_: str, kind: str, ruta: str) -> None:
        prev = seen.get(id_)
        if prev is not None:
            err("E001", ruta, f"El id “{id_}” se repite (ya se usó en {prev}).")
        else:
            seen[id_] = ruta
            kinds[id_] = kind

    for i, v in enumerate(vehiculos):
        register(v["id"], "vehiculo", f"/vehiculos/{i}/id")
    for i, p in enumerate(personas):
        register(p["id"], "persona", f"/personas/{i}/id")
    for i, o in enumerate(objetos):
        register(o["id"], "objeto", f"/entorno/objetos/{i}/id")
    for i, d in enumerate(dispositivos):
        register(d["id"], "dispositivo", f"/lugar/dispositivos/{i}/id")
    for i, e in enumerate(eventos):
        register(e["id"], "evento", f"/eventos/{i}/id")
    for i, e in enumerate(evidencias):
        register(e["id"], "evidencia", f"/evidencias/{i}/id")

    def expect_ref(id_: str | None, allowed: list[str], ruta: str) -> None:
        if id_ is None:
            return
        k = kinds.get(id_)
        if k is None:
            err("E002", ruta, f"“{id_}” no corresponde a ningún elemento de la escena.")
        elif k not in allowed:
            err("E002", ruta, f"“{id_}” es un {k}; aquí se esperaba {' o '.join(allowed)}.")

    for i, v in enumerate(vehiculos):
        for j, pid in enumerate(v.get("ocupantes", [])):
            expect_ref(pid, ["persona"], f"/vehiculos/{i}/ocupantes/{j}")
    for i, p in enumerate(personas):
        expect_ref(p.get("vehiculo_id"), ["vehiculo"], f"/personas/{i}/vehiculo_id")
    for i, d in enumerate(dispositivos):
        for j, vid in enumerate(d.get("aplica_a", [])):
            expect_ref(vid, ["vehiculo"], f"/lugar/dispositivos/{i}/aplica_a/{j}")
    for i, e in enumerate(eventos):
        actores = cast(list[str], e["actores"])
        for j, aid in enumerate(actores):
            expect_ref(aid, ["vehiculo", "persona", "objeto"], f"/eventos/{i}/actores/{j}")
        for j, z in enumerate(cast(list[JsonObj], e.get("zonas_impacto", []))):
            vid = cast(str, z["vehiculo_id"])
            expect_ref(vid, ["vehiculo"], f"/eventos/{i}/zonas_impacto/{j}/vehiculo_id")
            if kinds.get(vid) == "vehiculo" and vid not in actores:
                err(
                    "E015",
                    f"/eventos/{i}/zonas_impacto/{j}/vehiculo_id",
                    f"El vehículo “{vid}” tiene zona de impacto pero no está entre los actores "
                    "del evento.",
                )
    for i, d in enumerate(danos):
        expect_ref(d["vehiculo_id"], ["vehiculo"], f"/danos_declarados/{i}/vehiculo_id")
    for i, e in enumerate(evidencias):
        expect_ref(e.get("vehiculo_id"), ["vehiculo"], f"/evidencias/{i}/vehiculo_id")
        expect_ref(e.get("persona_id"), ["persona"], f"/evidencias/{i}/persona_id")

    # --- Procedencia: evidencia y rangos -------------------------------------------------
    def walk(node: object, ruta: str) -> None:
        if isinstance(node, list):
            for i, v in enumerate(cast(list[object], node)):
                walk(v, f"{ruta}/{i}")
            return
        if not isinstance(node, dict):
            return
        obj = cast(JsonObj, node)
        if _is_campo(obj):
            ev = cast(list[JsonObj], obj.get("evidencia", []))
            if obj.get("fuente") == "relato" and len(ev) == 0:
                err("E003", ruta, "El dato se atribuye al relato pero no cita ningún fragmento.")
            for i, e in enumerate(ev):
                inicio, fin = int(e["inicio"]), int(e["fin"])
                if fin <= inicio:
                    err(
                        "E004",
                        f"{ruta}/evidencia/{i}",
                        "El fragmento citado tiene fin antes del inicio.",
                    )
                elif relato is not None and relato[inicio:fin] != e["texto"]:
                    err(
                        "E004",
                        f"{ruta}/evidencia/{i}",
                        "El fragmento citado no coincide con el relato en esas posiciones.",
                    )
            rango = obj.get("rango")
            valor = obj.get("valor")
            if rango is not None and isinstance(valor, int | float) and not isinstance(valor, bool):
                lo, hi = cast(list[float], rango)
                if lo > hi:
                    err(
                        "E005",
                        f"{ruta}/rango",
                        "El rango está invertido (mínimo mayor que máximo).",
                    )
                elif valor < lo or valor > hi:
                    err(
                        "E005",
                        f"{ruta}/valor",
                        f"El valor {_num(valor)} queda fuera de su propio rango "
                        f"[{_num(lo)}, {_num(hi)}].",
                    )
        for k, v in obj.items():
            walk(v, f"{ruta}/{k}")

    walk(spec, "")

    # --- Vehículos: clase, dimensiones, velocidad, superposición -------------------------
    boxes: list[tuple[int, list[Vec]]] = []
    dims = [
        ("largo", "largo_m"),
        ("ancho", "ancho_m"),
        ("alto", "alto_m"),
        ("distancia_entre_ejes", "distancia_entre_ejes_m"),
    ]
    for i, v in enumerate(vehiculos):
        base = f"/vehiculos/{i}"
        clase_nombre = cast(str, cast(JsonObj, v["clase"])["valor"])
        clase = tabla.get(clase_nombre)
        if clase is not None:
            if "masa" in v:
                m = masa_kg(cast(JsonObj, v["masa"]))
                lo, hi = cast(list[float], clase["masa_kg"])
                if m < lo or m > hi:
                    err(
                        "E006",
                        f"{base}/masa/valor",
                        f"Una {clase_nombre} suele pesar entre {_num(lo)} y {_num(hi)} kg; "
                        f"aquí dice {round(m)} kg.",
                    )
            for key, rk in dims:
                if key not in v:
                    continue
                x = longitud_m(cast(JsonObj, v[key]))
                lo, hi = cast(list[float], clase[rk])
                if x < lo or x > hi:
                    err(
                        "E007",
                        f"{base}/{key}/valor",
                        f"El {key.replace('_', ' ')} de una {clase_nombre} suele estar entre "
                        f"{_num(lo)} y {_num(hi)} m; aquí dice {_num(x)} m.",
                    )
            vel = velocidad_kmh(cast(JsonObj, v["velocidad_previa"]))
            vmax = float(clase["velocidad_max_kmh"])
            if vel > vmax:
                err(
                    "E008",
                    f"{base}/velocidad_previa/valor",
                    f"Una {clase_nombre} difícilmente supera {_num(vmax)} km/h; "
                    f"aquí dice {round(vel)} km/h.",
                )
        for key in ("velocidad_previa", "maniobra", "clase"):
            if float(cast(JsonObj, v[key])["confianza"]) < CONFIANZA_BAJA:
                warn(
                    "W001",
                    f"{base}/{key}/confianza",
                    f"Hay poca certeza sobre {key.replace('_', ' ')} del vehículo {v['rol']}; "
                    "conviene preguntar.",
                )
        tipico = cast(JsonObj, clase["tipico"]) if clase is not None else None
        largo = longitud_m(cast(JsonObj, v["largo"])) if "largo" in v else _tip(tipico, "largo_m")
        ancho = longitud_m(cast(JsonObj, v["ancho"])) if "ancho" in v else _tip(tipico, "ancho_m")
        if largo is not None and ancho is not None:
            boxes.append((i, corners(cast(JsonObj, v["posicion_inicial"]), largo, ancho)))
    for a in range(len(boxes)):
        for b in range(a + 1, len(boxes)):
            ia, ca = boxes[a]
            ib, cb = boxes[b]
            if boxes_overlap(ca, cb):
                ra, rb = vehiculos[ia]["rol"], vehiculos[ib]["rol"]
                err(
                    "E009",
                    f"/vehiculos/{ib}/posicion_inicial",
                    f"Los vehículos {ra} y {rb} empiezan uno encima del otro; ajusta sus "
                    "posiciones iniciales en el croquis.",
                )
    tipo_via = cast(JsonObj, cast(JsonObj, spec["lugar"])["tipo_via"])
    if float(tipo_via["confianza"]) < CONFIANZA_BAJA:
        warn(
            "W001",
            "/lugar/tipo_via/confianza",
            "Hay poca certeza sobre el tipo de vía; conviene preguntar.",
        )
    if len(vehiculos) == 0:
        warn(
            "W003",
            "/vehiculos",
            "La escena no tiene vehículos; el solver no tendrá nada que reconstruir.",
        )

    # --- Personas y ocupantes ------------------------------------------------------------
    ocupado_por: dict[str, str] = {}
    for v in vehiculos:
        for pid in cast(list[str], v.get("ocupantes", [])):
            ocupado_por[pid] = cast(str, v["id"])
    for i, p in enumerate(personas):
        base = f"/personas/{i}"
        rol = cast(str, cast(JsonObj, p["rol"])["valor"])
        vid = cast(str | None, p.get("vehiculo_id"))
        if rol == "peaton" and vid is not None:
            err("E011", f"{base}/vehiculo_id", "Un peatón no va a bordo de un vehículo.")
        if rol != "peaton" and vid is None:
            err("E010", f"{base}/vehiculo_id", f"Un {rol} debe ir asociado a un vehículo.")
        if vid is not None and kinds.get(vid) == "vehiculo" and ocupado_por.get(p["id"]) != vid:
            err(
                "E012",
                f"{base}/vehiculo_id",
                f"La persona “{p['id']}” dice ir en “{vid}” pero ese vehículo no la lista entre "
                "sus ocupantes.",
            )
    personas_por_id: dict[str, JsonObj] = {}
    for p in personas:
        personas_por_id.setdefault(cast(str, p["id"]), p)  # primera aparición, como en TS
    for i, v in enumerate(vehiculos):
        for j, pid in enumerate(cast(list[str], v.get("ocupantes", []))):
            p = personas_por_id.get(pid)
            if p is not None and p.get("vehiculo_id") != v["id"]:
                err(
                    "E012",
                    f"/vehiculos/{i}/ocupantes/{j}",
                    f"“{pid}” aparece como ocupante de “{v['id']}” pero la persona no lo indica.",
                )

    # --- Eventos -------------------------------------------------------------------------
    ordenes: dict[int, int] = {}
    for i, e in enumerate(eventos):
        orden = int(e["orden"])
        prev = ordenes.get(orden)
        if prev is not None:
            err(
                "E013",
                f"/eventos/{i}/orden",
                f"El orden {orden} se repite (ya lo usa el evento {prev}).",
            )
        else:
            ordenes[orden] = i
        actores = cast(list[str], e["actores"])
        n_veh = sum(1 for a in actores if kinds.get(a) == "vehiculo")
        n_per = sum(1 for a in actores if kinds.get(a) == "persona")
        tipo = e["tipo"]
        if tipo == "impacto_vehiculo_vehiculo" and n_veh < 2:
            err(
                "E014",
                f"/eventos/{i}/actores",
                "Un impacto entre vehículos necesita al menos dos vehículos como actores.",
            )
        if tipo == "impacto_vehiculo_persona" and (n_veh < 1 or n_per < 1):
            err(
                "E014",
                f"/eventos/{i}/actores",
                "Un impacto con persona necesita un vehículo y una persona como actores.",
            )
        if tipo == "impacto_vehiculo_objeto" and n_veh < 1:
            err(
                "E014",
                f"/eventos/{i}/actores",
                "Un impacto con objeto necesita al menos un vehículo como actor.",
            )

    return sorted(problemas, key=lambda p: (p.ruta, p.codigo))


def _tip(tipico: JsonObj | None, key: str) -> float | None:
    return None if tipico is None else float(tipico[key])


def _num(x: float) -> str:
    """Formato de número igual al de JavaScript (sin .0 en enteros)."""
    return str(int(x)) if float(x).is_integer() else repr(float(x))


def errores_de(problemas: list[Problema]) -> list[Problema]:
    return [p for p in problemas if p.severidad == "error"]
