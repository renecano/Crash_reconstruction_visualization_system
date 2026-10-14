"""NHTSA CISS 2017–2024 para E3 (PLAN §8): daño medido, ΔV de WinSmash y ΔV del EDR.

Fuente: Crash Investigation Sampling System, archivos CSV anuales de NHTSA
(`static.nhtsa.gov/nhtsa/downloads/CISS/<año>/CISS_<año>_CSV_files.zip`). Las definiciones y los
códigos salen del *CISS 2024 Analytical User's Manual* (NHTSA, DOT HS 813 771): `GV.BODYTYPE`
(p. 50–52), `CDC` (perfil C1–C6 en cm, `FIELDL` en cm, `PDOF`, `DVTOTAL/DVLONG/DVLAT` de
WinSMASH en km/h, `DVBASIS`; p. 118–137), `EDREVENT` (`MAXDVLONG/MAXDVLAT` del EDR en km/h,
888 = dato no válido, 997 = no reportado; `CDCEVENT` liga el registro con el evento; p. 159–170),
`VEHSPEC` (`CURBWT` en kg, `OAL` y `MAXWIDTH` en cm; p. 99–100).

`build` escribe `data/processed/ciss/e3_vehiculos.csv`: una fila por vehículo y evento con EDR
válido y perfil de aplastamiento medido, con los datos del otro vehículo cuando el evento fue entre
dos vehículos, y `e3_conteos.json` con cada exclusión contada.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import zipfile
from collections import Counter, defaultdict
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx

DATA_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = DATA_DIR / "raw" / "ciss"
OUT_DIR = DATA_DIR / "processed" / "ciss"
URL = "https://static.nhtsa.gov/nhtsa/downloads/CISS/{y}/CISS_{y}_CSV_files.zip"
MANUAL = "https://crashstats.nhtsa.dot.gov/Api/Public/ViewPublication/813771"
# SHA-256 de los archivos descargados el 2026-10-14 (Last-Modified 2026-02-04 en el servidor).
SHA256 = {
    2017: "486b7774459f2fb6b7b9d8b04a0131f07b9564795ae3b4e3e273a729246b5b74",
    2018: "d78d561490694723c96e2d3e823ff79e561bfba0f70ff05dd4a9803d6b84ab80",
    2019: "256e69f5a987000893c10d80812bd22c977924d651d5dd2e5b226a55f8742cca",
    2020: "f411c4c5276b5f1025048f5e5554cde41c738fd82751101bae156fb54ee09d88",
    2021: "88414ae318a15baded08e58b641259f1697c179ee61b41fd5f6a54d1cde5e50b",
    2022: "d4d1a33988aff255790d20ad96b996cff93d5afa9dabfd742b8b4769d29c1173",
    2023: "1ae9fe6672f007f00407ede3a498900ff33e2118bef13825387e783cbc8966c4",
    2024: "adb602e31742fbab4782abf1df0bbc2eaab5e771bfef72ed3f0c8f202446a9de",
}
YEARS = tuple(sorted(SHA256))

# GV.BODYTYPE → clase del contrato (manual p. 50–52). Autos por largo como en E2 (4.55 m).
SEDANS = {1, 2, 4, 6, 8, 9, 17}
HATCHBACKS = {3, 5, 7}
SMALL_UTILITY = {14}
LARGE_UTILITY = {15, 16}
UNKNOWN_UTILITY = {19}
VANS = {20, 21, 22, 28, 29}
PICKUPS = {10, 32, 33, 34, 39}
SEDAN_CUT_CM = 455
UTILITY_CUT_CM = 475
OCCUPANT_KG = 75.0  # supuesto: masa por ocupante sumada al peso vacío (mínimo 1, el conductor)

# OBJCONT de objetos rígidos para el modelo de barrera (manual p. 118–119): árbol > 10 cm, poste
# no desprendible > 10 cm, barrera de concreto, muro, edificio, puente.
RIGID_OBJECTS = {
    42: "arbol",
    51: "poste",
    52: "poste",
    54: "barrera",
    58: "muro",
    59: "muro",
    64: "puente",
}
PLANES = {"F", "B", "L", "R"}
SMASH_BASIS = {1, 2, 3, 4}  # DVBASIS: WinSMASH calculó el ΔV
INCOMPLETE_FILE = {0.0, 8.0}  # EDREVENT.FILEREC: 0 = no se completó, 8 = dato no válido (p. 160)

FIELDS = [
    "anio",
    "caseid",
    "caso",
    "vehno",
    "evento",
    "peso_caso",
    "clase",
    "bodytype",
    "masa_kg",
    "largo_cm",
    "ancho_cm",
    "plano",
    "pdof",
    "perfil_cm",
    "ancho_dano_cm",
    "contacto",
    "objeto",
    "otro_vehno",
    "otro_clase",
    "otro_masa_kg",
    "otro_plano",
    "otro_pdof",
    "otro_perfil_cm",
    "otro_ancho_dano_cm",
    "dv_winsmash_kmh",
    "dv_winsmash_long_kmh",
    "dv_winsmash_lat_kmh",
    "dv_base_winsmash",
    "dv_edr_long_kmh",
    "dv_edr_lat_kmh",
    "dv_edr_kmh",
    "dv_edr_componentes",
]


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def zip_path(year: int, raw_dir: Path = RAW_DIR) -> Path:
    return raw_dir / f"CISS_{year}_CSV_files.zip"


def download(raw_dir: Path = RAW_DIR, force: bool = False) -> list[Path]:
    """Descarga los años que falten y verifica cada archivo contra su SHA-256 fijado."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    with httpx.Client(timeout=120, follow_redirects=True, headers={"User-Agent": "croquis"}) as c:
        for y in YEARS:
            p = zip_path(y, raw_dir)
            if force or not p.exists():
                r = c.get(URL.format(y=y))
                r.raise_for_status()
                p.write_bytes(r.content)
            got = sha256_of(p)
            if got != SHA256[y]:
                msg = f"CISS {y}: SHA-256 distinto ({got}); NHTSA pudo republicar el archivo."
                raise RuntimeError(msg)
            out.append(p)
    return out


def _rows(z: zipfile.ZipFile, table: str) -> Iterator[dict[str, str]]:
    names = {n.split("/")[-1].upper(): n for n in z.namelist()}
    with z.open(names[f"{table}.CSV"]) as f:
        reader = csv.reader(io.TextIOWrapper(f, encoding="latin-1", newline=""))
        header = [h.strip().upper().lstrip("﻿") for h in next(reader)]
        for row in reader:
            yield dict(zip(header, row, strict=False))


def _num(raw: str | None) -> float | None:
    try:
        return float(raw) if raw not in (None, "") else None
    except ValueError:
        return None


def clase_ciss(bodytype: int, largo_cm: float | None) -> str | None:
    """Clase del contrato para un BODYTYPE de CISS (None: fuera del alcance de E3)."""
    if bodytype in HATCHBACKS:
        return "hatchback"
    if bodytype in SEDANS:
        if largo_cm is None:
            return None
        return "sedan_compacto" if largo_cm < SEDAN_CUT_CM else "sedan_mediano"
    if bodytype in SMALL_UTILITY:
        return "suv_compacta"
    if bodytype in LARGE_UTILITY:
        return "suv_grande"
    if bodytype in UNKNOWN_UTILITY:
        if largo_cm is None:
            return None
        return "suv_compacta" if largo_cm < UTILITY_CUT_CM else "suv_grande"
    if bodytype in VANS:
        return "van"
    if bodytype in PICKUPS:
        return "pickup"
    return None


def crush_profile(cdc: dict[str, str]) -> list[float] | None:
    """Perfil medido en cm (C1–C6 válidos, en orden); None si hay menos de dos puntos."""
    vals = [_num(cdc.get(f"C{i}")) for i in range(1, 7)]
    good = [v for v in vals if v is not None and 0 <= v <= 250]
    return good if len(good) >= 2 and len(good) in (2, 3, 4, 6) else None


def edr_delta_v(
    rows: list[dict[str, str]], plane: str
) -> tuple[float, float | None, float | None, str] | None:
    """ΔV del EDR para el evento: resultante, longitudinal, lateral y componentes usadas."""
    best: tuple[float, float | None, float | None, str] | None = None
    for r in rows:
        if _num(r.get("FILEREC")) in INCOMPLETE_FILE:
            continue  # el EDR no terminó de grabar el evento (FILEREC 0) o el dato no es válido
        lon = _num(r.get("MAXDVLONG"))
        lat = _num(r.get("MAXDVLAT"))
        lon = lon if lon is not None and abs(lon) <= 150 else None
        lat = lat if lat is not None and abs(lat) <= 150 else None
        if lon is not None and lat is not None:
            cand = (math.hypot(lon, lat), lon, lat, "long+lat")
        elif lon is not None and plane in ("F", "B"):
            # Frontal o trasero sin lateral reportado: la longitudinal domina (se marca).
            cand = (abs(lon), lon, None, "solo_long")
        else:
            continue
        if best is None or cand[0] > best[0]:
            best = cand
    return best


def build_year(year: int, raw_dir: Path = RAW_DIR) -> tuple[list[dict[str, Any]], Counter[str]]:
    z = zipfile.ZipFile(zip_path(year, raw_dir))
    counts: Counter[str] = Counter()
    veh: dict[tuple[str, int], dict[str, Any]] = {}
    for g in _rows(z, "GV"):
        key = (g["CASEID"], int(g["VEHNO"]))
        veh[key] = {
            "bodytype": int(_num(g.get("BODYTYPE")) or 99),
            "curb_gv": _num(g.get("CURBWT")),
            "peso": g.get("CASEWGT", ""),
        }
    for s in _rows(z, "VEHSPEC"):
        key = (s["CASEID"], int(s["VEHNO"]))
        if key in veh:
            veh[key].update(
                curb=_num(s.get("CURBWT")), largo=_num(s.get("OAL")), ancho=_num(s.get("MAXWIDTH"))
            )
    occ: Counter[tuple[str, int]] = Counter()
    for o in _rows(z, "OCC"):
        occ[(o["CASEID"], int(o["VEHNO"]))] += 1
    case_no = {c["CASEID"]: c.get("CASENUMBER", "") for c in _rows(z, "CRASH")}

    def vehicle(key: tuple[str, int]) -> dict[str, Any] | None:
        v = veh.get(key)
        if v is None:
            return None
        curb = v.get("curb")
        if curb is None or not 450 <= curb <= 4536:
            curb = v.get("curb_gv")
        largo = v.get("largo") if v.get("largo") is not None and 100 <= v["largo"] <= 650 else None
        ancho = v.get("ancho") if v.get("ancho") is not None and 100 <= v["ancho"] <= 350 else None
        clase = clase_ciss(v["bodytype"], largo)
        if curb is None or not 450 <= curb <= 4536 or clase is None:
            return None
        return {
            "clase": clase,
            "bodytype": v["bodytype"],
            "masa_kg": round(curb + OCCUPANT_KG * max(1, occ[key]), 1),
            "largo_cm": largo,
            "ancho_cm": ancho,
            "peso_caso": v["peso"],
        }

    cdcs: dict[tuple[str, int, int], dict[str, str]] = {}
    for c in _rows(z, "CDC"):
        cdcs[(c["CASEID"], int(c["VEHNO"]), int(c["EVENTNO"]))] = c
    edr: dict[tuple[str, int, int], list[dict[str, str]]] = defaultdict(list)
    for e in _rows(z, "EDREVENT"):
        ev = _num(e.get("CDCEVENT"))
        if ev is not None and 1 <= ev <= 30:
            edr[(e["CASEID"], int(e["VEHNO"]), int(ev))].append(e)

    def damage(c: dict[str, str]) -> tuple[str, float, list[float], float] | None:
        plane = c.get("CDCPLANE", "").strip()
        pdof = _num(c.get("PDOF"))
        width = _num(c.get("FIELDL"))
        prof = crush_profile(c)
        if plane not in PLANES or pdof is None or not 0 <= pdof <= 350:
            return None
        if width is None or not 1 <= width <= 1000 or prof is None:
            return None
        return plane, pdof, prof, width

    out: list[dict[str, Any]] = []
    for key, records in sorted(edr.items()):
        caseid, vehno, event = key
        counts["eventos_con_edr"] += 1
        c = cdcs.get(key)
        if c is None:
            counts["sin_cdc_del_evento"] += 1
            continue
        d = damage(c)
        if d is None:
            counts["sin_perfil_medido_o_pdof"] += 1
            continue
        plane, pdof, prof, width = d
        dv = edr_delta_v(records, plane)
        if dv is None:
            incomplete = all(_num(r.get("FILEREC")) in INCOMPLETE_FILE for r in records)
            counts["edr_registro_incompleto" if incomplete else "edr_sin_dv_valido"] += 1
            continue
        v = vehicle((caseid, vehno))
        if v is None:
            counts["vehiculo_fuera_de_clase_o_sin_masa"] += 1
            continue
        objcont = int(_num(c.get("OBJCONT")) or 0)
        row: dict[str, Any] = {
            "anio": year,
            "caseid": caseid,
            "caso": case_no.get(caseid, ""),
            "vehno": vehno,
            "evento": event,
            **v,
            "plano": plane,
            "pdof": int(pdof),
            "perfil_cm": json.dumps(prof),
            "ancho_dano_cm": width,
        }
        if 1 <= objcont <= 30:
            row["contacto"] = "vehiculo"
            row["otro_vehno"] = objcont
            other = vehicle((caseid, objcont))
            oc = cdcs.get((caseid, objcont, event))
            od = damage(oc) if oc is not None else None
            if other is not None:
                row["otro_clase"] = other["clase"]
                row["otro_masa_kg"] = other["masa_kg"]
            if od is not None:
                row["otro_plano"], row["otro_pdof"] = od[0], int(od[1])
                row["otro_perfil_cm"], row["otro_ancho_dano_cm"] = json.dumps(od[2]), od[3]
        elif objcont in RIGID_OBJECTS:
            row["contacto"] = "objeto_rigido"
            row["objeto"] = RIGID_OBJECTS[objcont]
        else:
            counts["contacto_no_modelado"] += 1
            continue
        total = _num(c.get("DVTOTAL"))
        basis = int(_num(c.get("DVBASIS")) or 0)
        row["dv_base_winsmash"] = basis
        if total is not None and 1 <= total <= 160 and basis in SMASH_BASIS:
            row["dv_winsmash_kmh"] = total
            lon = _num(c.get("DVLONG"))
            lat = _num(c.get("DVLAT"))
            row["dv_winsmash_long_kmh"] = lon if lon is not None and abs(lon) <= 160 else None
            row["dv_winsmash_lat_kmh"] = lat if lat is not None and abs(lat) <= 160 else None
        row["dv_edr_kmh"] = round(dv[0], 3)
        row["dv_edr_long_kmh"] = dv[1]
        row["dv_edr_lat_kmh"] = dv[2]
        row["dv_edr_componentes"] = dv[3]
        counts["filas"] += 1
        out.append(row)
    return out, counts


def build(raw_dir: Path = RAW_DIR, out_dir: Path = OUT_DIR, check: bool = False) -> bool:
    """Escribe (o verifica) la tabla de E3. Devuelve True si quedó al día."""
    rows: list[dict[str, Any]] = []
    counts: dict[str, dict[str, int]] = {}
    for y in YEARS:
        r, c = build_year(y, raw_dir)
        rows += r
        counts[str(y)] = dict(sorted(c.items()))
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=FIELDS, lineterminator="\n")
    w.writeheader()
    for row in rows:
        w.writerow({k: ("" if row.get(k) is None else row.get(k)) for k in FIELDS})
    summary = {
        "_generado_por": "uv run croquis-data ciss build (data/croquis_data/ciss.py)",
        "fuente": "NHTSA CISS 2017–2024, archivos CSV; códigos del manual " + MANUAL,
        "sha256": {str(k): v for k, v in SHA256.items()},
        "conteos_por_anio": counts,
        "filas": len(rows),
    }
    texts = {
        out_dir / "e3_vehiculos.csv": buf.getvalue(),
        out_dir / "e3_conteos.json": json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
    }
    if check:
        return all(p.exists() and p.read_text(encoding="utf-8") == t for p, t in texts.items())
    out_dir.mkdir(parents=True, exist_ok=True)
    for p, t in texts.items():
        p.write_text(t, encoding="utf-8", newline="\n")
    return True
