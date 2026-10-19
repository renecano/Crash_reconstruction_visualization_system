"""De hechos a EscenaSpec (contrato v1).

Lo usa la referencia de Relatos-MX y la línea base de reglas: cada hecho con cita pasa como
`fuente: relato` con su evidencia literal (posición del fragmento en el relato); lo que el relato no
dice se completa con valores por omisión marcados `default` o `supuesto`, nunca como `relato`.
La geometría es una disposición genérica coherente con el tipo de choque (se corrige en el croquis):
el LLM y las reglas no producen geometría.
"""

from __future__ import annotations

import hashlib
from typing import Any

from croquis_extraction.facts import Fact, Facts

JsonObj = dict[str, Any]

CREATED = "2026-10-13T00:00:00-06:00"
CONF_STATED = 0.9
CONF_ASSUMED = 0.4
CONF_DEFAULT = 0.3
LETTERS = "ABCDEFGH"
COLOR_HEX = {
    "blanco": "#f2f2f0",
    "blanca": "#f2f2f0",
    "negro": "#141414",
    "negra": "#141414",
    "gris": "#8a8d91",
    "plata": "#c0c3c7",
    "plateado": "#c0c3c7",
    "plateada": "#c0c3c7",
    "rojo": "#a8231c",
    "roja": "#a8231c",
    "azul": "#1f4e8c",
    "verde": "#2f6b3a",
    "amarillo": "#e3b51e",
    "amarilla": "#e3b51e",
    "naranja": "#d9701e",
    "cafe": "#5a3b25",
    "café": "#5a3b25",
    "vino": "#5e1626",
    "dorado": "#b8913a",
    "dorada": "#b8913a",
    "beige": "#d8c9a8",
    "morado": "#5b3a7a",
    "morada": "#5b3a7a",
}
ENUM_FIX = {
    ("lugar.tipo_via", "interseccion"): "interseccion_x",
    ("entorno.clima", "lluvia"): "lluvia_ligera",
    ("entorno.iluminacion", "noche"): "noche_con_alumbrado",
    ("clase", "suv_o_pickup"): "suv_compacta",
    ("clase", "camion_o_autobus"): "autobus",
    ("maniobra", "cambio_carril"): "cambio_carril_izquierda",
}
DEFAULTS = {
    "lugar.tipo_via": "recta",
    "lugar.superficie": "asfalto",
    "lugar.estado_superficie": "seco",
    "lugar.carriles_por_sentido": 2,
    "entorno.clima": "despejado",
    "entorno.iluminacion": "dia",
}


class EvidenceError(ValueError):
    """La cita no aparece literal en el relato."""


def _evidence(text: str, cita: str) -> list[JsonObj]:
    i = text.find(cita)
    if i < 0:
        msg = f"La cita no está en el relato: {cita!r}"
        raise EvidenceError(msg)
    return [{"inicio": i, "fin": i + len(cita), "texto": cita}]


def _fix(key: str, valor: Any) -> tuple[Any, bool]:
    """Valor válido para el contrato; True si hubo que precisarlo (pasa a supuesto)."""
    if isinstance(valor, str) and (key, valor) in ENUM_FIX:
        return ENUM_FIX[(key, valor)], True
    return valor, False


def _campo(
    text: str, key: str, fact: Fact | None, default: Any, extra: JsonObj | None = None
) -> JsonObj:
    if fact is None:
        out: JsonObj = {"valor": default, "fuente": "default", "confianza": CONF_DEFAULT}
    else:
        valor, fixed = _fix(key, fact.valor)
        stated = fact.stated and fact.cita is not None and not fixed
        out = {
            "valor": valor,
            "fuente": "relato" if stated else ("supuesto" if fact.cita or fixed else fact.fuente),
            "confianza": CONF_STATED if stated else CONF_ASSUMED,
        }
        if fact.cita:
            out["evidencia"] = _evidence(text, fact.cita)
        if fixed:
            out["nota"] = f"El relato dice '{fact.valor}'; se precisó como '{valor}' (confírmalo)."
    if out["fuente"] not in ("relato", "usuario", "supuesto", "default"):
        out["fuente"] = "supuesto"
    if extra:
        out.update(extra)
    return out


def _proc(text: str, fact: Fact | None) -> JsonObj:
    if fact is None or not fact.cita:
        return {
            "fuente": "supuesto" if fact else "default",
            "confianza": CONF_ASSUMED if fact else CONF_DEFAULT,
        }
    return {
        "fuente": "relato" if fact.stated else "supuesto",
        "confianza": CONF_STATED,
        "evidencia": _evidence(text, fact.cita),
    }


def _pose(x: float, y: float, rumbo: float) -> JsonObj:
    return {
        "x": x,
        "y": y,
        "rumbo_deg": rumbo,
        "procedencia": {
            "fuente": "supuesto",
            "confianza": 0.3,
            "nota": "Disposición genérica; ajústala en el croquis.",
        },
    }


def _layout(n: int, zonas: dict[int, str], tipo_evento: str) -> list[tuple[float, float, float]]:
    """Poses genéricas (x, y, rumbo) que no se enciman y respetan el tipo de choque."""
    poses: list[tuple[float, float, float]] = [(-30.0, -1.75, 0.0)]
    za, zb = zonas.get(0), zonas.get(1)
    if n >= 2:
        if za == "F" and zb == "B":
            poses.append((-12.0, -1.75, 0.0))  # alcance: B adelante
        elif za == "B" and zb == "F":
            poses.append((-48.0, -1.75, 0.0))  # A golpeado por detrás
        elif za in ("L", "R") or zb in ("L", "R"):
            poses.append((0.0, -30.0 if zb != "R" else 30.0, 90.0 if zb != "R" else -90.0))
        elif za == "F" and zb == "F":
            poses.append((30.0, 1.75, 180.0))
        else:
            poses.append((25.0, 1.75, 180.0))
    for k in range(2, n):
        poses.append((-30.0 - 12.0 * k, -5.25, 0.0))
    _ = tipo_evento
    return poses


def build_spec(
    facts: Facts,
    text: str,
    *,
    spec_id: str,
    titulo: str | None = None,
    origen: str = "escrito",
    sintetico: bool = True,
) -> JsonObj:
    sc = facts.escalares
    seed = int(hashlib.sha256(spec_id.encode()).hexdigest()[:8], 16) % 1_000_000
    lugar: JsonObj = {
        "tipo_via": _campo(
            text, "lugar.tipo_via", sc.get("lugar.tipo_via"), DEFAULTS["lugar.tipo_via"]
        ),
        "carriles_por_sentido": _campo(
            text, "lugar.carriles_por_sentido", sc.get("lugar.carriles_por_sentido"), 2
        ),
        "ancho_carril": {
            "valor": 3.5,
            "unidad": "m",
            "fuente": "default",
            "confianza": CONF_DEFAULT,
        },
        "sentidos": {"valor": "doble_sentido", "fuente": "default", "confianza": CONF_DEFAULT},
        "superficie": _campo(text, "lugar.superficie", sc.get("lugar.superficie"), "asfalto"),
        "estado_superficie": _campo(
            text, "lugar.estado_superficie", sc.get("lugar.estado_superficie"), "seco"
        ),
    }
    if facts.dispositivos:
        lugar["dispositivos"] = [
            {
                "id": f"disp-{i + 1}",
                "tipo": d.valor,
                "posicion": {"x": 0.0, "y": 0.0},
                "procedencia": _proc(text, d),
            }
            for i, d in enumerate(facts.dispositivos)
        ]
    entorno: JsonObj = {
        "clima": _campo(text, "entorno.clima", sc.get("entorno.clima"), "despejado"),
        "iluminacion": _campo(text, "entorno.iluminacion", sc.get("entorno.iluminacion"), "dia"),
    }
    obj_fact = sc.get("evento.objeto")
    objetos: list[JsonObj] = []
    if obj_fact is not None:
        objetos.append(
            {
                "id": "obj-1",
                "tipo": obj_fact.valor,
                "posicion": {"x": 6.0, "y": -6.0},
                "procedencia": _proc(text, obj_fact),
            }
        )
        entorno["objetos"] = objetos
    n = max(1, len(facts.vehiculos))
    zonas = {k: str(v.valor) for k, v in facts.zonas.items()}
    ev_fact = sc.get("evento.tipo")
    tipo_evento = str(ev_fact.valor) if ev_fact else ""
    poses = _layout(n, zonas, tipo_evento)
    vehiculos: list[JsonObj] = []
    for i in range(n):
        vf = facts.vehiculos[i] if i < len(facts.vehiculos) else {}
        letter = LETTERS[i]
        maniobra = _campo(text, "maniobra", vf.get("maniobra"), "recto")
        quieto = maniobra["valor"] in ("detenido", "estacionado")
        vel = vf.get("velocidad_kmh")
        velocidad = (
            _campo(text, "velocidad_kmh", vel, 0.0, {"unidad": "km/h"})
            if vel is not None
            else {
                "valor": 0.0 if quieto else 40.0,
                "unidad": "km/h",
                "fuente": "default" if quieto else "supuesto",
                "confianza": CONF_DEFAULT,
            }
        )
        color_fact = vf.get("color")
        color_name = _campo(text, "color", color_fact, "gris")
        x, y, rumbo = poses[i]
        v: JsonObj = {
            "id": f"veh-{letter.lower()}",
            "rol": letter,
            "clase": _campo(text, "clase", vf.get("clase"), "sedan_compacto"),
            "color": {
                "nombre": color_name,
                "hex": COLOR_HEX.get(str(color_name["valor"]).lower(), "#8a8d91"),
            },
            "maniobra": maniobra,
            "velocidad_previa": velocidad,
            "posicion_inicial": _pose(x, y, rumbo),
        }
        if "frenado" in vf:
            v["frenado"] = {"aplico": _campo(text, "frenado", vf["frenado"], False)}
        vehiculos.append(v)
    personas: list[JsonObj] = []
    seats: dict[int, int] = {}
    have_driver = {
        int(p["vehiculo"].valor)
        for p in facts.personas
        if "vehiculo" in p and p.get("rol") and p["rol"].valor == "conductor"
    }
    plist = list(facts.personas)
    if facts.narrador_vehiculo is not None and facts.narrador_vehiculo not in have_driver:
        plist.insert(
            0,
            {
                "rol": Fact("conductor", None, "supuesto"),
                "vehiculo": Fact(facts.narrador_vehiculo, None, "supuesto"),
            },
        )
    for j, pf in enumerate(plist):
        rol = _campo(text, "rol", pf.get("rol"), "conductor")
        p: JsonObj = {"id": f"per-{j + 1}", "rol": rol}
        veh = pf.get("vehiculo")
        if veh is not None and int(veh.valor) < len(vehiculos):
            vi = int(veh.valor)
            p["vehiculo_id"] = vehiculos[vi]["id"]
            k = seats.get(vi, 0)
            seats[vi] = k + 1
            if rol["valor"] in ("conductor", "pasajero"):
                seat = (
                    "conductor"
                    if rol["valor"] == "conductor"
                    else ("copiloto" if k <= 1 else "trasero_derecho")
                )
                p["asiento"] = {"valor": seat, "fuente": "supuesto", "confianza": CONF_ASSUMED}
            if facts.narrador_vehiculo == vi and rol["valor"] == "conductor":
                rol["nota"] = "narrador"
        elif rol["valor"] in ("peaton", "ciclista"):
            p["posicion_inicial"] = _pose(0.0, -5.0, 90.0)
        for key in ("cinturon", "casco"):
            if key in pf:
                p[key] = _campo(text, key, pf[key], False)
        personas.append(p)
    for v in vehiculos:
        aboard = [p["id"] for p in personas if p.get("vehiculo_id") == v["id"]]
        if aboard:
            v["ocupantes"] = aboard
    # Evento principal.
    actores = [v["id"] for v in vehiculos[: 2 if not objetos else 1]]
    if not tipo_evento:
        if objetos:
            tipo_evento = "impacto_vehiculo_objeto"
        elif any(
            p["rol"]["valor"] in ("peaton", "ciclista") and "vehiculo_id" not in p for p in personas
        ):
            tipo_evento = "impacto_vehiculo_persona"
        elif len(vehiculos) >= 2:
            tipo_evento = "impacto_vehiculo_vehiculo"
        else:
            tipo_evento = "derrape"
    if tipo_evento == "impacto_vehiculo_objeto" and objetos:
        actores = [vehiculos[0]["id"], objetos[0]["id"]]
    elif tipo_evento == "impacto_vehiculo_persona":
        peaton = next((p for p in personas if "vehiculo_id" not in p), None)
        actores = [vehiculos[0]["id"]] + ([peaton["id"]] if peaton else [])
    elif tipo_evento in ("volcadura", "derrape"):
        actores = [vehiculos[0]["id"]]
    evento: JsonObj = {
        "id": "ev-1",
        "orden": 0,
        "tipo": tipo_evento,
        "actores": actores,
        "procedencia": _proc(text, ev_fact),
    }
    if zonas:
        evento["zonas_impacto"] = [
            {"vehiculo_id": vehiculos[i]["id"], "cdc": {"lado": lado}}
            for i, lado in sorted(zonas.items())
            if i < len(vehiculos) and vehiculos[i]["id"] in actores
        ]
        if not evento["zonas_impacto"]:
            del evento["zonas_impacto"]
    evidencias: list[JsonObj] = []
    dp = sc.get("evidencias.distancia_proyeccion_m")
    if dp is not None:
        e: JsonObj = {
            "id": "evid-proyeccion",
            "tipo": "distancia_proyeccion",
            "longitud": _campo(text, "evidencias.distancia_proyeccion_m", dp, 0.0, {"unidad": "m"}),
            "procedencia": _proc(text, dp),
        }
        peaton = next((p for p in personas if "vehiculo_id" not in p), None)
        if peaton:
            e["persona_id"] = peaton["id"]
        evidencias.append(e)
    mk = sc.get("evidencias.marcas_m")
    if mk is not None:
        marcas: JsonObj = {"id": "evid-marcas", "tipo": "marcas_frenado"}
        proc = _proc(text, mk)
        fase = sc.get("evidencias.marcas_fase")
        if fase is not None:
            marcas["fase"] = fase.valor
            # La cita de la fase va como segundo fragmento de la procedencia (`facts_from_spec`).
            if fase.cita and fase.stated and "evidencia" in proc:
                proc["evidencia"] = proc["evidencia"] + _evidence(text, fase.cita)
        marcas["vehiculo_id"] = vehiculos[0]["id"]
        marcas["longitud"] = _campo(text, "evidencias.marcas_m", mk, 0.0, {"unidad": "m"})
        marcas["procedencia"] = proc
        evidencias.append(marcas)
    meta: JsonObj = {
        "id": spec_id,
        "version_esquema": "1.3.0",
        "idioma": "es-MX",
        "semilla": seed,
        "creado": CREATED,
        "relato": text,
        "origen_relato": origen,
        "sintetico": sintetico,
    }
    if titulo:
        meta["titulo"] = titulo
    return {
        "meta": meta,
        "lugar": lugar,
        "entorno": entorno,
        "vehiculos": vehiculos,
        "personas": personas,
        "eventos": [evento],
        "danos_declarados": [],
        "evidencias": evidencias,
    }
