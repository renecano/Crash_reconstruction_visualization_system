"""Fichas de casos CISS 2024 para el test `ciss` de Relatos-MX (PLAN §5.2).

Los CSV de CISS no traen narrativas, así que los relatos del test se escriben desde los campos
codificados: la verdad de cada hecho la pone NHTSA, no quien escribe el relato. Este módulo elige
los casos (con semilla y por estratos) y traduce cada código al vocabulario de la anotación de
Relatos-MX solo cuando la equivalencia es exacta; si no, el campo queda fuera de la ficha y la
exclusión se cuenta.

Solo se usa CISS 2024: es el único año cuyo zip trae el catálogo oficial de etiquetas
(`FORMAT24.sas`), y el *CISS 2024 Analytical User's Manual* (DOT HS 813 771) liga cada variable
con su formato (GV: WEATHER → WEATHER24F, LIGHTCOND → LGTCOND24F, SURFCOND → SURCOND24F,
SURFTYPE → SURTYPE24F, ALIGNMENT → ALIGNMNT24F, PREMOVE → PREMOVE24F, MANEUVER → MANEUVER24F,
RELJCT2 → RELJCT224F, TYP_INT → TYP_INT24F, TRAFDEV → TRAFCONT24F, BODYTYPE → BODYTYPE24F;
EVENT: OBJCLASS → EOBJCLASS24F, OBJCONT → OBJCONT24F, GAD1/GAD2 → $GAD24F; NONMOTORIST: PTYPE →
PTYPE24F; EDRPRECRASH: PCODE → CODETYPE24F). Cada traducción guarda la etiqueta que espera y
`build` falla si el catálogo dice otra cosa.

`build` escribe `data/relatos-mx/ciss/fichas.jsonl` (una ficha por caso: hechos esperados sin
citas, y contexto para escribir el relato) y `fichas_conteos.json` (casos elegibles, exclusiones
y campos omitidos por falta de equivalencia).
"""

from __future__ import annotations

import json
import random
import re
import unicodedata
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from croquis_data.ciss import RAW_DIR, SEDAN_CUT_CM, UTILITY_CUT_CM, num, rows, zip_path

YEAR = 2024
SEED = 20261014
ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "relatos-mx" / "ciss"
FICHAS = OUT_DIR / "fichas.jsonl"
CONTEOS = OUT_DIR / "fichas_conteos.json"

JsonObj = dict[str, Any]

# Cuántos relatos por tipo. Sigue la distribución de ATUS (README de Relatos-MX) dentro de lo que
# CISS tiene: CISS solo investiga vehículos de pasajeros remolcados, así que no hay relatos de
# motociclista, caída de pasajero ni salida del camino sin impacto, y las motocicletas solo
# aparecen como el otro vehículo.
QUOTAS = {
    "vv": 80,
    "moto": 10,
    "objeto": 22,
    "volcadura": 12,
    "peaton": 13,
    "ciclista": 10,
    "animal": 3,
}
REGISTERS = ("coloquial", "formal", "faltas", "desordenado", "breve")

# Probabilidad de que la ficha pida mencionar cada hecho. La gente no dice todo: un relato real
# rara vez nombra la superficie del piso. Los valores siguen viniendo de NHTSA; la semilla decide
# qué se menciona.
MENTION = {
    "lugar.tipo_via": 0.7,
    "lugar.superficie": 0.25,
    "lugar.estado_superficie": 0.5,
    "entorno.clima": 0.5,
    "entorno.iluminacion": 0.6,
    "dispositivos": 0.7,
    "zonas": 0.7,
    "velocidad_kmh": 0.85,
    "frenado": 0.6,
    "maniobra": 0.9,
    "clase_otro": 0.8,
}

# --- Traducciones: código → (etiqueta oficial en FORMAT24.sas, valor de la anotación) ----------

CodeMap = dict[int, tuple[str, str]]

WEATHER: CodeMap = {
    1: ("Clear", "despejado"),
    2: ("Rain", "lluvia"),  # sin intensidad: el genérico de la anotación
    8: ("Cloudy", "nublado"),
}
# Sin equivalente exacto: 3 'Sleet or Hail' (aguanieve ≠ granizo), 5 'Fog, Smog, Smoke' (humo ≠
# niebla), 6, 7, 98, 99. Nieve y hielo descartan el caso (no se adaptan a México).
WEATHER_EXCLUDE = {
    4: "Snow",
    9: "Blowing Snow",
    10: "Freezing Rain or Freezing Drizzle",
}
LIGHT: CodeMap = {
    1: ("Daylight", "dia"),
    2: ("Dark", "noche_sin_alumbrado"),
    3: ("Dark,but lighted", "noche_con_alumbrado"),
    4: ("Dawn", "amanecer"),
    5: ("Dusk", "atardecer"),
}
SURFCOND: CodeMap = {
    1: ("Dry", "seco"),
    2: ("Wet", "mojado"),
    6: ("Water (Standing, Moving)", "encharcado"),
    9: ("Oil", "aceite"),
}
# 7 'Sand' y 8 'Mud, Dirt, Gravel' mezclan valores de la anotación (lodo, grava suelta).
SURFCOND_EXCLUDE = {3: "Snow", 4: "Slush", 5: "Ice/Frost"}
SURFTYPE: CodeMap = {
    1: ("Concrete", "concreto"),
    2: ("Bituminous (asphalt)", "asfalto"),
    3: ("Brick or Block", "adoquin"),
    5: ("Dirt", "terraceria"),
}
# 4 'Slag, gravel, or stone' puede ser empedrado o grava: sin equivalente exacto.
ALIGNMENT: dict[int, str] = {1: "Straight", 2: "Curve Right", 3: "Curve Left"}
RELJCT2_INTERSECTION = (2, "Intersection")
RELJCT2_NON_JUNCTION = (1, "Non-Junction")
TYP_INT: CodeMap = {
    2: ("Four-Way Intersection", "interseccion_x"),
    3: ("T-Intersection", "interseccion_t"),
    6: ("Roundabout", "glorieta"),
    4: ("Y-Intersection", "interseccion"),
    7: ("Five Point, or More", "interseccion"),
    10: ("L-Intersection", "interseccion"),
}
TRAFDEV: CodeMap = {
    1: ("Traffic control signal (not RR crossing)", "semaforo"),
    2: ("Stop Sign", "alto"),
    3: ("Yield Sign", "ceda_el_paso"),
}
PREMOVE: CodeMap = {
    1: ("Going straight", "recto"),
    5: ("Stopped in road", "detenido"),
    7: ("Disabled or parked in travel lane", "estacionado"),
    10: ("Turning right", "vuelta_derecha"),
    11: ("Turning left", "vuelta_izquierda"),
    12: ("Making a U-turn", "vuelta_u"),
    13: ("Backing up (other than for parking position)", "reversa"),
    15: ("Changing lanes", "cambio_carril"),  # sin lado: el genérico de la anotación
    16: ("Merging", "incorporacion"),
}
# MANEUVER (acción para evitar el choque): con freno o sin freno.
BRAKED: dict[int, str] = {
    2: "Braking",
    3: "Braking and steering left",
    4: "Braking and steering right",
    5: "Braking and unknown steering direction",
}
NOT_BRAKED: dict[int, str] = {
    1: "No Avoidance Maneuver",
    7: "Steering left",
    8: "Steering right",
    9: "Accelerating",
    10: "Accelerating and steering left",
    11: "Accelerating and steering right",
}
GAD: dict[str, str] = {
    "F": "Front",
    "B": "Back/Truck Back",
    "L": "Left Side",
    "R": "Right Side",
    "T": "Top",
    "U": "Undercarriage",
}
# OBJCONT del primer evento → objeto de la anotación.
OBJECTS: CodeMap = {
    41: ("Tree (<= 10 cm in diameter)", "arbol"),
    42: ("Tree (> 10 cm in diameter)", "arbol"),
    46: ("Tree (diameter unknown)", "arbol"),
    45: ("Breakaway pole or post (any diameter)", "poste"),
    50: ("Nonbreakaway Pole or post (<= 10 cm in diameter)", "poste"),
    51: ("Nonbreakaway Pole or post (> 10 cm but <= 30 cm in diameter)", "poste"),
    52: ("Nonbreakaway Pole or post (> 30 cm in diameter)", "poste"),
    53: ("Nonbreakaway Pole or post (diameter unknown)", "poste"),
    58: ("Wall", "muro"),
}
OBJ_ROLLOVER = (31, "Overturn - rollover (excludes end-over-end)")
OBJ_ANIMAL = (76, "Animal")
EOBJ_VEHICLE = (1, "Vehicle")
EOBJ_FIXED = (3, "Collision with Fixed Object")
EOBJ_NONFIXED = (4, "Collision with Nonfixed Object")
EOBJ_NONMOTORIST = (7, "Nonmotorist")
EOBJ_NONCOLLISION = (2, "Noncollision")
PTYPE: CodeMap = {5: ("Pedestrian", "peaton"), 6: ("Bicyclist", "ciclista")}
# BODYTYPE del otro vehículo fuera de los de pasajeros (los de pasajeros: `ciss.clase_ciss`).
HEAVY_AND_CYCLES: CodeMap = {
    50: ("School Bus", "autobus"),
    51: ("Cross Country/Intercity Bus", "autobus"),
    52: ("Transit Bus (City Bus)", "autobus"),
    61: (
        "Single-unit straight truck or Cab-Chassis (GVWR range 10,001 to 19,500 lbs.)",
        "camion_unitario",
    ),
    62: (
        "Single-unit straight truck or Cab-Chassis (GVWR range 19,501 to 26,000 lbs.)",
        "camion_unitario",
    ),
    63: (
        "Single-unit straight truck or Cab-Chassis (GVWR greater than 26,000 lbs.)",
        "camion_unitario",
    ),
    64: ("Single-unit straight truck or Cab-Chassis (GVWR unknown)", "camion_unitario"),
    66: (
        "Truck-tractor (Cab only, or with any number of trailing unit; any weight)",
        "tractocamion",
    ),
    80: ("Two Wheel Motorcycle (excluding motor scooters)", "motocicleta"),
    84: ("Motor Scooter", "scooter"),
}
# Clase del relato: la carrocería de GV debe decidir la clase sola y coincidir con la de VPIC
# (BodyClass). Los códigos que mezclan carrocerías no deciden: convertible (1), coupé (2, 17),
# vagoneta (6, puede ser auto o SUV: el Subaru Outback y la GMC Acadia vienen así), "otro
# automóvil" (9) y pickups o paneles sobre auto (10, 11). La tabla de E3 (`ciss.clase_ciss`) agrupa
# más porque solo elige rigidez.
SEDAN_BODIES = {4: "4-door sedan, hardtop", 8: "Sedan/Hardtop, number of doors unknown"}
HATCH_BODIES = {
    3: "3-door/2-door hatchback",
    5: "5-door/4-door hatchback",
    7: "Hatchback, number of doors unknown",
}
SMALL_MID_UTILITY = (14, 'Compact Utility (Utility Vehicle Categories "Small" and "Midsize")')
LARGE_UTILITY_BODIES = {
    15: 'Large utility (ANSI D16.1 Utility Vehicle Categories and "Full Size" and "Large")',
    16: "Utility station wagon (includes suburban limousines, Suburban, Travellall, Grand Wagoneer)",  # noqa: E501 (etiqueta oficial)
}
UNKNOWN_UTILITY = (19, "Utility Vehicle, Unknown body type")
VAN_BODIES = {
    20: "Minivan (Chrysler Town and Country, Caravan, Grand Caravan, Voyager, Voyager, Honda-Odyssey, ...)",  # noqa: E501 (etiqueta oficial)
    21: "Large Van-Includes van-based buses (B150-B350, Sportsman, Royal Maxiwagon, Ram, Tradesman,...)",  # noqa: E501 (etiqueta oficial)
}
PICKUP_BODIES = {34: "Light Pickup"}
# VPIC BodyClass compatible con cada clase del relato.
VPIC_GROUPS: dict[str, set[str]] = {
    "sedan": {"Sedan/Saloon"},
    "hatchback": {"Hatchback/Liftback/Notchback"},
    "suv": {
        "Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)",
        "Crossover Utility Vehicle (CUV)",
    },
    "van": {"Minivan", "Van", "Cargo Van"},
    "pickup": {"Pickup"},
    "tractocamion": {"Truck-Tractor"},
    "camion_unitario": {
        "Truck",
        "Incomplete - Chassis Cab (Single Cab)",
        "Incomplete - Chassis Cab (Double Cab)",
        "Incomplete - Chassis Cab (Number of Cab Unknown)",
    },
    "autobus": {"Bus - School Bus", "Bus", "Bus - Transit/City Bus", "Bus - Intercity/Coach"},
    "motocicleta": {
        "Motorcycle - Sport",
        "Motorcycle - Standard",
        "Motorcycle - Cruiser",
        "Motorcycle - Touring / Sport Touring",
        "Motorcycle - Dual Sport / Adventure / Supermoto / On/Off-road",
        "Motorcycle - Street",
    },
    "scooter": {"Motorcycle - Scooter"},
}
GROUP_OF = {
    "sedan_compacto": "sedan",
    "sedan_mediano": "sedan",
    "hatchback": "hatchback",
    "suv_compacta": "suv",
    "suv_grande": "suv",
    "van": "van",
    "pickup": "pickup",
    "tractocamion": "tractocamion",
    "camion_unitario": "camion_unitario",
    "autobus": "autobus",
    "motocicleta": "motocicleta",
    "scooter": "scooter",
}
EDR_SPEED = (1010, "Vehicle Speed (kmph)")
PVALUE_INVALID = {99996.0, 99997.0}  # PVALUE24F: dato no válido, no reportado
DRIVER_ROLE = 1  # OCC.ROLE: conductor
SEX = {1: "hombre", 2: "mujer"}  # SEX24F 1 'Male'; 2–6 'Female' (con o sin embarazo)


# --- Catálogo oficial ---------------------------------------------------------------------------

_VALUE = re.compile(r"VALUE\s+(\$?\w+)\s*\n(.*?)\n;", re.S)
_LABEL = re.compile(r"^(-?\w+)='(.*)'\s*$", re.M)


def formats(z: zipfile.ZipFile) -> dict[str, dict[str, str]]:
    """Etiquetas de `FORMAT24.sas`: formato → código → etiqueta."""
    names = {n.split("/")[-1].upper(): n for n in z.namelist()}
    text = z.read(names["FORMAT24.SAS"]).decode("latin-1")
    return {name.lstrip("$"): dict(_LABEL.findall(body)) for name, body in _VALUE.findall(text)}


def _expect(fmt: dict[str, dict[str, str]], name: str, pairs: dict[Any, str]) -> list[str]:
    table = fmt.get(name, {})
    return [
        f"{name} {code}: se esperaba {label!r} y el catálogo dice {table.get(str(code))!r}"
        for code, label in pairs.items()
        if table.get(str(code)) != label
    ]


def label_problems(fmt: dict[str, dict[str, str]]) -> list[str]:
    """Toda etiqueta que este módulo supone y que el catálogo oficial no confirma."""

    def lab(m: CodeMap) -> dict[Any, str]:
        return {k: v[0] for k, v in m.items()}

    out: list[str] = []
    out += _expect(fmt, "WEATHER24F", lab(WEATHER) | WEATHER_EXCLUDE)
    out += _expect(fmt, "LGTCOND24F", lab(LIGHT))
    out += _expect(fmt, "SURCOND24F", lab(SURFCOND) | SURFCOND_EXCLUDE)
    out += _expect(fmt, "SURTYPE24F", lab(SURFTYPE))
    out += _expect(fmt, "ALIGNMNT24F", ALIGNMENT)
    out += _expect(
        fmt, "RELJCT224F", {"02": RELJCT2_INTERSECTION[1], "01": RELJCT2_NON_JUNCTION[1]}
    )
    out += _expect(fmt, "TYP_INT24F", lab(TYP_INT))
    out += _expect(fmt, "TRAFCONT24F", lab(TRAFDEV))
    out += _expect(fmt, "PREMOVE24F", lab(PREMOVE))
    out += _expect(fmt, "MANEUVER24F", BRAKED | NOT_BRAKED)
    out += _expect(fmt, "GAD24F", GAD)
    out += _expect(fmt, "OBJCONT24F", lab(OBJECTS) | dict([OBJ_ROLLOVER, OBJ_ANIMAL]))
    out += _expect(
        fmt,
        "EOBJCLASS24F",
        dict([EOBJ_VEHICLE, EOBJ_FIXED, EOBJ_NONFIXED, EOBJ_NONMOTORIST, EOBJ_NONCOLLISION]),
    )
    out += _expect(fmt, "PTYPE24F", lab(PTYPE))
    out += _expect(fmt, "BODYTYPE24F", lab(HEAVY_AND_CYCLES))
    out += _expect(
        fmt,
        "BODYTYPE24F",
        SEDAN_BODIES
        | HATCH_BODIES
        | LARGE_UTILITY_BODIES
        | VAN_BODIES
        | PICKUP_BODIES
        | dict([SMALL_MID_UTILITY, UNKNOWN_UTILITY]),
    )
    out += _expect(fmt, "CODETYPE24F", dict([EDR_SPEED]))
    out += _expect(fmt, "SEX24F", {1: "Male", 2: "Female"})
    return out


# --- Lectura del año ----------------------------------------------------------------------------


def _int(raw: str | None) -> int | None:
    v = num(raw)
    return None if v is None else int(v)


class Year:
    """Las tablas de CISS 2024 que usan las fichas, indexadas por caso y vehículo."""

    def __init__(self, z: zipfile.ZipFile):
        self.crash = {r["CASEID"]: r for r in rows(z, "CRASH")}
        self.gv: dict[tuple[str, int], dict[str, str]] = {
            (r["CASEID"], int(r["VEHNO"])): r for r in rows(z, "GV")
        }
        self.spec: dict[tuple[str, int], dict[str, str]] = {
            (r["CASEID"], int(r["VEHNO"])): r for r in rows(z, "VEHSPEC")
        }
        self.vpic: dict[tuple[str, int], dict[str, str]] = {
            (r["CASEID"], int(r["VEHNO"])): r for r in rows(z, "VPICDECODE")
        }
        self.events: dict[str, list[dict[str, str]]] = defaultdict(list)
        for e in rows(z, "EVENT"):
            self.events[e["CASEID"]].append(e)
        self.driver: dict[tuple[str, int], dict[str, str]] = {}
        for o in rows(z, "OCC"):
            if _int(o.get("ROLE")) == DRIVER_ROLE:
                self.driver[(o["CASEID"], int(o["VEHNO"]))] = o
        self.nonmotorists: dict[str, list[dict[str, str]]] = defaultdict(list)
        for n in rows(z, "NONMOTORIST"):
            self.nonmotorists[n["CASEID"]].append(n)
        # Velocidad del EDR en el último punto antes del primer evento del caso.
        first_event: set[tuple[str, int, str, str]] = set()
        for e in rows(z, "EDREVENT"):
            if _int(e.get("CDCEVENT")) == 1:
                first_event.add((e["CASEID"], int(e["VEHNO"]), e["EDRSUMMNO"], e["EDREVENTNO"]))
        best: dict[tuple[str, int], tuple[float, float]] = {}
        for p in rows(z, "EDRPRECRASH"):
            if _int(p.get("PCODE")) != EDR_SPEED[0]:
                continue
            key = (p["CASEID"], int(p["VEHNO"]), p["EDRSUMMNO"], p["EDREVENTNO"])
            if key not in first_event:
                continue
            t, v = num(p.get("PTIME")), num(p.get("PVALUE"))
            if t is None or v is None or v in PVALUE_INVALID or t > 0 or v < 0:
                continue
            k = (p["CASEID"], int(p["VEHNO"]))
            if k not in best or t > best[k][0]:
                best[k] = (t, v)
        self.edr_speed = {k: v for k, (_, v) in best.items()}

    def first_event(self, cid: str) -> dict[str, str] | None:
        evs = [e for e in self.events[cid] if _int(e.get("EVENTNO")) == 1]
        return evs[0] if len(evs) == 1 else None


# --- Traducción de un caso ----------------------------------------------------------------------


def _key(name: str) -> str:
    """Clave de `modelos.json`: minúsculas y sin acentos."""
    nfd = unicodedata.normalize("NFD", name.strip().lower())
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def body_class(y: Year, cid: str, vehno: int) -> tuple[str | None, str]:
    """Clase según NHTSA (carrocería de GV, largo de VEHSPEC y BodyClass de VPIC); None y el
    motivo si la carrocería no decide la clase o GV y VPIC no coinciden."""
    g = y.gv.get((cid, vehno))
    body = _int(g.get("BODYTYPE")) if g else None
    if body is None:
        return None, "sin carrocería"
    largo = num(y.spec.get((cid, vehno), {}).get("OAL"))
    clase: str | None
    if body in HEAVY_AND_CYCLES:
        clase = HEAVY_AND_CYCLES[body][1]
    elif body in SEDAN_BODIES:
        clase = (
            None
            if largo is None
            else ("sedan_compacto" if largo < SEDAN_CUT_CM else "sedan_mediano")
        )
    elif body in HATCH_BODIES:
        clase = "hatchback"
    elif body in (SMALL_MID_UTILITY[0], UNKNOWN_UTILITY[0]):
        # 'Small and Midsize' no es una sola clase del contrato: decide el largo (como E3
        # con el 19).
        clase = (
            None if largo is None else ("suv_compacta" if largo < UTILITY_CUT_CM else "suv_grande")
        )
    elif body in LARGE_UTILITY_BODIES:
        clase = "suv_grande"
    elif body in VAN_BODIES:
        clase = "van"
    elif body in PICKUP_BODIES:
        clase = "pickup"
    else:
        return None, "carrocería que no decide la clase"
    if clase is None:
        return None, "sin largo para decidir la clase"
    vpic = y.vpic.get((cid, vehno), {}).get("BODYCLASS", "").strip()
    if vpic and vpic not in VPIC_GROUPS[GROUP_OF[clase]]:
        return None, "carrocería de GV distinta de la de VPIC"
    return clase, ""


def story_class(
    y: Year, cid: str, vehno: int, models: dict[str, str]
) -> tuple[str | None, str, str]:
    """Clase del vehículo en el relato, cómo nombrarlo y, si no hay clase, por qué.

    Quien escribe nombra el vehículo por su modelo, así que la clase debe ser la que un extractor
    deduce de ese nombre: la de `modelos.json` si el modelo está ahí (README de Relatos-MX). Si la
    tabla y NHTSA no coinciden, no hay clase exacta; la única excepción es un hatchback de un
    modelo que la tabla da como sedán, que el relato nombra con su carrocería ("Rio hatchback").
    """
    clase, why = body_class(y, cid, vehno)
    if clase is None:
        return None, "no", why
    v = y.vpic.get((cid, vehno), {})
    table = models.get(_key(v.get("MODEL", ""))) if v.get("MODEL") else None
    if table is None or table == clase:
        return clase, ("modelo" if v.get("MODEL") else "clase"), ""
    if clase == "hatchback" and table in ("sedan_compacto", "sedan_mediano"):
        return clase, "modelo_y_carroceria", ""
    return None, "no", "clase de NHTSA distinta de la de modelos.json"


def vehicle_class(y: Year, cid: str, vehno: int) -> str | None:
    """Clase según NHTSA (para clasificar el caso: moto, pesado o pasajeros)."""
    return body_class(y, cid, vehno)[0]


def _model(y: Year, cid: str, vehno: int) -> str | None:
    v = y.vpic.get((cid, vehno))
    if not v:
        return None
    # `_rows` pasa los encabezados a mayúsculas (VPICDECODE trae Make, Model, ModelYear).
    make, model = v.get("MAKE", "").strip(), v.get("MODEL", "").strip()
    if not make or not model:
        return None
    year = v.get("MODELYEAR", "").strip()
    return f"{make.title()} {model}" + (f" ({year})" if year else "")


def classify(y: Year, cid: str) -> tuple[str | None, str]:
    """Tipo de relato del caso y, si no sirve, por qué (para los conteos)."""
    c = y.crash[cid]
    ev = y.first_event(cid)
    if ev is None:
        return None, "sin primer evento único"
    n_veh = _int(c.get("VEHICLES")) or 0
    cls, obj = _int(ev.get("OBJCLASS")), _int(ev.get("OBJCONT"))
    if cls == EOBJ_VEHICLE[0]:
        if n_veh != 2:
            return None, "choque entre vehículos con más de dos"
        a, b = _int(ev.get("VEHNUM")), obj
        if a is None or b is None:
            return None, "vehículos del evento sin número"
        ca, cb = vehicle_class(y, cid, a), vehicle_class(y, cid, b)
        if "motocicleta" in (ca, cb) or "scooter" in (ca, cb):
            return "moto", ""
        return "vv", ""
    if n_veh != 1:
        return None, "un solo evento con objeto pero varios vehículos"
    if cls == EOBJ_FIXED[0]:
        return ("objeto", "") if obj in OBJECTS else (None, "objeto fijo sin equivalente")
    if cls == EOBJ_NONFIXED[0] and obj == OBJ_ANIMAL[0]:
        return "animal", ""
    if cls == EOBJ_NONCOLLISION[0] and obj == OBJ_ROLLOVER[0]:
        return "volcadura", ""
    if cls == EOBJ_NONMOTORIST[0]:
        nms = y.nonmotorists[cid]
        if len(nms) != 1:
            return None, "más de una persona fuera de vehículo"
        pt = _int(nms[0].get("PTYPE"))
        return (
            (PTYPE[pt][1], "")
            if pt in PTYPE
            else (None, "persona fuera de vehículo sin equivalente")
        )
    return None, "primer evento sin equivalente"


def _env(g: dict[str, str], omitted: Counter[str]) -> tuple[JsonObj, str | None]:
    """Hechos de lugar y entorno del vehículo de quien narra; motivo si el caso se descarta."""
    w, s = _int(g.get("WEATHER")), _int(g.get("SURFCOND"))
    if w in WEATHER_EXCLUDE:
        return {}, "nieve o hielo (no se adapta a México)"
    if s in SURFCOND_EXCLUDE:
        return {}, "nieve o hielo (no se adapta a México)"
    out: JsonObj = {}

    def put(key: str, table: CodeMap, code: int | None) -> None:
        if code in table:
            out[key] = table[code][1]
        else:
            omitted[key] += 1

    put("entorno.clima", WEATHER, w)
    put("entorno.iluminacion", LIGHT, _int(g.get("LIGHTCOND")))
    put("lugar.estado_superficie", SURFCOND, s)
    put("lugar.superficie", SURFTYPE, _int(g.get("SURFTYPE")))
    rel, ti, al = _int(g.get("RELJCT2")), _int(g.get("TYP_INT")), _int(g.get("ALIGNMENT"))
    if rel == RELJCT2_INTERSECTION[0] and ti in TYP_INT:
        out["lugar.tipo_via"] = TYP_INT[ti][1]
    elif rel == RELJCT2_NON_JUNCTION[0] and al == 1:
        out["lugar.tipo_via"] = "recta"
    elif rel == RELJCT2_NON_JUNCTION[0] and al in (2, 3):
        out["lugar.tipo_via"] = "curva"
    else:
        omitted["lugar.tipo_via"] += 1
    dev = _int(g.get("TRAFDEV"))
    if dev in TRAFDEV:
        out["dispositivos"] = [TRAFDEV[dev][1]]
    return out, None


def _vehicle_facts(
    y: Year,
    cid: str,
    vehno: int,
    *,
    narrator: bool,
    omitted: Counter[str],
    models: dict[str, str],
) -> tuple[JsonObj, JsonObj]:
    """Hechos de un vehículo y su contexto (modelo, cómo nombrarlo, velocidad del EDR)."""
    g = y.gv[(cid, vehno)]
    facts: JsonObj = {}
    ctx: JsonObj = {"vehno": vehno}
    if narrator:
        facts["narrador"] = True
    clase, nombrar, why = story_class(y, cid, vehno, models)
    if clase is not None:
        facts["clase"] = clase
    else:
        omitted[f"clase: {why}"] += 1
    ctx["modelo"] = _model(y, cid, vehno)
    ctx["nombrar"] = nombrar
    pm = _int(g.get("PREMOVE"))
    if pm in PREMOVE:
        facts["maniobra"] = PREMOVE[pm][1]
    else:
        omitted["maniobra"] += 1
    mv = _int(g.get("MANEUVER"))
    if mv in BRAKED:
        facts["frenado"] = True
    elif mv in NOT_BRAKED:
        facts["frenado"] = False
    else:
        omitted["frenado"] += 1
    if facts.get("maniobra") in ("detenido", "estacionado"):
        facts["velocidad_kmh"] = 0
        facts.pop("frenado", None)
    elif (cid, vehno) in y.edr_speed:
        raw = y.edr_speed[(cid, vehno)]
        ctx["velocidad_edr_kmh"] = raw
        # La gente redondea: la verdad de la extracción es lo que dice el relato.
        facts["velocidad_kmh"] = max(5, 5 * round(raw / 5))
    elif narrator:
        omitted["velocidad_kmh"] += 1
    d = y.driver.get((cid, vehno))
    if d is not None:
        age, sex = _int(d.get("AGE")), _int(d.get("SEX"))
        ctx["conductor"] = {
            "edad": age if age is not None and 0 < age < 120 else None,
            "sexo": SEX.get(1 if sex == 1 else 2 if sex in (2, 3, 4, 5, 6) else 0),
        }
    return facts, ctx


def translate(
    y: Year, cid: str, tipo: str, omitted: Counter[str], models: dict[str, str] | None = None
) -> tuple[JsonObj | None, str]:
    """Hechos esperados (sin citas) y contexto de un caso; None y el motivo si se descarta."""
    ev = y.first_event(cid)
    assert ev is not None
    models = load_models() if models is None else models
    if tipo in ("vv", "moto"):
        a, b = int(ev["VEHNUM"]), int(ev["OBJCONT"])
        # Narra quien tiene velocidad del EDR; si los dos, el que pega.
        narr, other = (b, a) if (cid, a) not in y.edr_speed and (cid, b) in y.edr_speed else (a, b)
        if tipo == "moto" and vehicle_class(y, cid, narr) in ("motocicleta", "scooter"):
            narr, other = other, narr  # CISS no investiga motos: narra quien va en el auto
    else:
        narr, other = int(ev["VEHNUM"]), None
    g = y.gv.get((cid, narr))
    if g is None:
        return None, "sin datos del vehículo de quien narra"
    env, why = _env(g, omitted)
    if why:
        return None, why
    v0, c0 = _vehicle_facts(y, cid, narr, narrator=True, omitted=omitted, models=models)
    if "clase" not in v0:
        return None, "clase de quien narra ambigua o distinta de modelos.json"
    vehicles, ctx_vehicles = [v0], [c0]
    zones: JsonObj = {}
    gad_a, gad_b = ev.get("GAD1", "").strip(), ev.get("GAD2", "").strip()
    zone_narr = gad_a if narr == _int(ev.get("VEHNUM")) else gad_b
    if zone_narr in GAD:
        zones["0"] = zone_narr
    persons: list[JsonObj] = [{"rol": "conductor", "vehiculo": 0}]
    event: JsonObj = {}
    ctx_extra: JsonObj = {}
    if other is not None:
        v1, c1 = _vehicle_facts(y, cid, other, narrator=False, omitted=omitted, models=models)
        # Quien narra no conoce la velocidad del otro: solo queda si estaba parado.
        if v1.get("velocidad_kmh") != 0:
            v1.pop("velocidad_kmh", None)
        c1.pop("velocidad_edr_kmh", None)
        vehicles.append(v1)
        ctx_vehicles.append(c1)
        zone_other = gad_b if narr == _int(ev.get("VEHNUM")) else gad_a
        if zone_other in GAD:
            zones["1"] = zone_other
        event["evento.tipo"] = "impacto_vehiculo_vehiculo"
        if v1.get("clase") in ("motocicleta", "scooter"):
            persons.append({"rol": "motociclista", "vehiculo": 1})
    elif tipo in ("objeto", "animal"):
        event["evento.tipo"] = "impacto_vehiculo_objeto"
        event["evento.objeto"] = OBJECTS[int(ev["OBJCONT"])][1] if tipo == "objeto" else "otro"
        ctx_extra["objeto_ciss"] = (
            OBJECTS[int(ev["OBJCONT"])][0] if tipo == "objeto" else OBJ_ANIMAL[1]
        )
    elif tipo == "volcadura":
        event["evento.tipo"] = "volcadura"
        zones.pop("0", None)  # la volcadura no tiene un lado de impacto único
    else:  # peaton, ciclista
        # Como en el resto de Relatos-MX: la bicicleta es un vehículo, así que el choque con un
        # ciclista es entre vehículos; el atropello de un peatón es impacto con persona.
        event["evento.tipo"] = (
            "impacto_vehiculo_vehiculo" if tipo == "ciclista" else "impacto_vehiculo_persona"
        )
        nm = y.nonmotorists[cid][0]
        if tipo == "ciclista":
            # La bicicleta es un vehículo del contrato y el ciclista va en ella (validador E010).
            vehicles.append({"clase": "bicicleta"})
            ctx_vehicles.append({"nombrar": "clase"})
            persons.append({"rol": tipo, "vehiculo": 1})
        else:
            persons.append({"rol": tipo})
        age, sex = _int(nm.get("AGE")), _int(nm.get("SEX"))
        ctx_extra["persona"] = {
            "edad": age if age is not None and 0 < age < 120 else None,
            "sexo": SEX.get(1 if sex == 1 else 2 if sex in (2, 3, 4, 5, 6) else 0),
        }
    hechos: JsonObj = {**env, **event, "vehiculos": vehicles, "personas": persons}
    if zones:
        hechos["zonas"] = zones
    return {"hechos": hechos, "contexto": {"vehiculos": ctx_vehicles, **ctx_extra}}, ""


def _mention(hechos: JsonObj, rng: random.Random) -> JsonObj:
    """Quita, con la semilla, los hechos que este relato no menciona (la gente no dice todo)."""
    out: JsonObj = {}
    for k, v in hechos.items():
        if k in ("vehiculos", "personas", "evento.tipo", "evento.objeto"):
            continue
        if rng.random() < MENTION[k]:
            out[k] = v
    out["evento.tipo"] = hechos["evento.tipo"]
    if "evento.objeto" in hechos:
        out["evento.objeto"] = hechos["evento.objeto"]
    vehicles: list[JsonObj] = []
    for i, v in enumerate(hechos["vehiculos"]):
        nv: JsonObj = {}
        for k, val in v.items():
            if k == "narrador":
                nv[k] = val
            elif k == "clase":
                always = i == 0 or val in ("motocicleta", "scooter", "bicicleta")
                if always or rng.random() < MENTION["clase_otro"]:
                    nv[k] = val
            elif rng.random() < MENTION[k]:
                nv[k] = val
        vehicles.append(nv)
    out["vehiculos"] = vehicles
    out["personas"] = hechos["personas"]
    return _couple(hechos, out)


STOPPED = ("detenido", "estacionado")
JUNCTION_DEVICES = ("semaforo", "alto", "ceda_el_paso")


def _couple(full: JsonObj, kept: JsonObj) -> JsonObj:
    """Hechos que no se pueden decir uno sin el otro van juntos (sin más sorteos).

    - Velocidad 0 y maniobra `detenido`/`estacionado`: decir "estaba parado" afirma las dos.
    - Semáforo, alto o ceda el paso y el tipo de vía: el dispositivo deja ver dónde fue, así que
      si NHTSA sabe el tipo de vía, se menciona.
    """
    for fv, kv in zip(full["vehiculos"], kept["vehiculos"], strict=True):
        stopped = kv.get("velocidad_kmh") == 0 or kv.get("maniobra") in STOPPED
        if stopped:
            for k in ("velocidad_kmh", "maniobra"):
                if k in fv:
                    kv[k] = fv[k]
    devices = kept.get("dispositivos", [])
    if any(d in JUNCTION_DEVICES for d in devices) and "lugar.tipo_via" in full:
        kept["lugar.tipo_via"] = full["lugar.tipo_via"]
    return kept


def load_models() -> dict[str, str]:
    """Modelo → clase de `packages/extraction/data/modelos.json`."""
    path = ROOT / "packages" / "extraction" / "data" / "modelos.json"
    data: dict[str, dict[str, str]] = json.loads(path.read_text(encoding="utf-8"))["modelos"]
    return {k: v["clase"] for k, v in data.items()}


def _naming(ctx: JsonObj, hechos: JsonObj) -> JsonObj:
    """Si la ficha no pide la clase de un vehículo, el relato no lo nombra (ni por su modelo)."""
    out = {**ctx, "vehiculos": [dict(v) for v in ctx["vehiculos"]]}
    for v, h in zip(out["vehiculos"], hechos["vehiculos"], strict=True):
        if "clase" not in h:
            v["nombrar"] = "no"
            v.pop("modelo", None)
    return out


def select(y: Year) -> tuple[list[JsonObj], JsonObj]:
    """Elige y traduce los casos por estratos, con semilla. Devuelve fichas y conteos."""
    rng = random.Random(SEED)
    models = load_models()
    reasons: Counter[str] = Counter()
    omitted: Counter[str] = Counter()
    by_type: dict[str, list[str]] = defaultdict(list)
    for cid in sorted(y.crash):
        tipo, why = classify(y, cid)
        if tipo is None:
            reasons[why] += 1
        else:
            by_type[tipo].append(cid)
    fichas: list[JsonObj] = []
    taken: Counter[str] = Counter()
    with_speed = {cid for cid, _ in y.edr_speed}
    for tipo in QUOTAS:
        pool = list(by_type[tipo])
        rng.shuffle(pool)
        # Primero los casos con velocidad del EDR en algún vehículo del primer evento: así el
        # error en velocidad se mide contra NHTSA en más relatos. Sesga hacia autos con EDR
        # (más nuevos); se documenta en el README de Relatos-MX.
        pool.sort(key=lambda cid: cid not in with_speed)  # estable: conserva el barajado
        for cid in pool:
            if taken[tipo] >= QUOTAS[tipo]:
                break
            tr, why = translate(y, cid, tipo, omitted, models)
            if tr is None:
                reasons[f"{tipo}: {why}"] += 1
                continue
            reg = REGISTERS[taken[tipo] % len(REGISTERS)]
            taken[tipo] += 1
            c = y.crash[cid]
            fichas.append(
                {
                    "tipo": tipo,
                    "registro": reg,
                    "ciss": {"anio": YEAR, "caseid": cid, "caso": c.get("CASENUMBER", "")},
                    "hechos": (hechos := _mention(tr["hechos"], random.Random(f"{SEED}-{cid}"))),
                    "contexto": _naming(tr["contexto"], hechos),
                }
            )
    rng.shuffle(fichas)
    for i, f in enumerate(fichas, 1):
        f["id"] = f"rmx-c{i:03d}"
    fichas.sort(key=lambda f: str(f["id"]))
    conteos = {
        "anio": YEAR,
        "semilla": SEED,
        "casos": len(y.crash),
        "elegibles_por_tipo": {t: len(v) for t, v in sorted(by_type.items())},
        "cuota_por_tipo": QUOTAS,
        "fichas_por_tipo": dict(sorted(taken.items())),
        "descartados": dict(sorted(reasons.items())),
        "campos_sin_equivalente": dict(sorted(omitted.items())),
        "probabilidad_de_mencion": MENTION,
    }
    return fichas, conteos


def _texts(fichas: list[JsonObj], conteos: JsonObj) -> dict[Path, str]:
    lines = "".join(json.dumps(f, ensure_ascii=False, sort_keys=True) + "\n" for f in fichas)
    return {
        FICHAS: lines,
        CONTEOS: json.dumps(conteos, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    }


def build(raw_dir: Path = RAW_DIR, check: bool = False) -> bool:
    """Escribe (o verifica) las fichas. Devuelve True si están al día o se escribieron."""
    with zipfile.ZipFile(zip_path(YEAR, raw_dir)) as z:
        problems = label_problems(formats(z))
        if problems:
            raise ValueError(
                "Etiquetas de CISS distintas de las supuestas:\n" + "\n".join(problems)
            )
        fichas, conteos = select(Year(z))
    texts = _texts(fichas, conteos)
    if check:
        return all(p.exists() and p.read_text(encoding="utf-8") == t for p, t in texts.items())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for p, t in texts.items():
        p.write_text(t, encoding="utf-8", newline="\n")
    return True


def load() -> list[JsonObj]:
    return [json.loads(x) for x in FICHAS.read_text(encoding="utf-8").splitlines() if x.strip()]


__all__ = ["YEAR", "build", "classify", "formats", "label_problems", "load", "select", "translate"]
