"""Fichas del test CISS de Relatos-MX: traducción exacta de códigos, exclusiones y semilla."""

from __future__ import annotations

import csv
import io
import random
import zipfile
from collections import Counter

import pytest

from croquis_data import ciss
from croquis_data import ciss_relatos as cr

# Catálogo mínimo con las etiquetas que el módulo supone (las reales vienen en FORMAT24.sas).
_FORMATS = {
    "WEATHER24F": {
        1: "Clear",
        2: "Rain",
        4: "Snow",
        8: "Cloudy",
        9: "Blowing Snow",
        10: "Freezing Rain or Freezing Drizzle",
        99: "Unknown",
    },
    "LGTCOND24F": {k: v[0] for k, v in cr.LIGHT.items()},
    "SURCOND24F": {k: v[0] for k, v in cr.SURFCOND.items()} | cr.SURFCOND_EXCLUDE,
    "SURTYPE24F": {k: v[0] for k, v in cr.SURFTYPE.items()},
    "ALIGNMNT24F": cr.ALIGNMENT,
    "RELJCT224F": {"01": "Non-Junction", "02": "Intersection"},
    "TYP_INT24F": {k: v[0] for k, v in cr.TYP_INT.items()},
    "TRAFCONT24F": {k: v[0] for k, v in cr.TRAFDEV.items()},
    "PREMOVE24F": {k: v[0] for k, v in cr.PREMOVE.items()},
    "MANEUVER24F": cr.BRAKED | cr.NOT_BRAKED,
    "$GAD24F": cr.GAD,
    "OBJCONT24F": {k: v[0] for k, v in cr.OBJECTS.items()} | dict([cr.OBJ_ROLLOVER, cr.OBJ_ANIMAL]),
    "EOBJCLASS24F": dict(
        [
            cr.EOBJ_VEHICLE,
            cr.EOBJ_FIXED,
            cr.EOBJ_NONFIXED,
            cr.EOBJ_NONMOTORIST,
            cr.EOBJ_NONCOLLISION,
        ]
    ),
    "PTYPE24F": {k: v[0] for k, v in cr.PTYPE.items()},
    "BODYTYPE24F": {k: v[0] for k, v in cr.HEAVY_AND_CYCLES.items()},
    "CODETYPE24F": dict([cr.EDR_SPEED]),
    "SEX24F": {1: "Male", 2: "Female"},
}


def _sas(formats: dict[str, dict[object, str]]) -> str:
    return "".join(
        f"PROC FORMAT LIBRARY=LIBRARY PRINT; VALUE {name}\n"
        + "\n".join(f"{k}='{v}'" for k, v in table.items())
        + "\n;\n\n"
        for name, table in formats.items()
    )


def _csv(rows: list[dict[str, object]]) -> str:
    out = io.StringIO()
    keys: list[str] = []
    for r in rows:
        keys += [k for k in r if k not in keys]
    w = csv.DictWriter(out, fieldnames=keys)
    w.writeheader()
    w.writerows(rows)
    return out.getvalue()


def _gv(cid: str, vehno: int, body: int, **kw: object) -> dict[str, object]:
    base: dict[str, object] = {
        "CASEID": cid, "VEHNO": vehno, "BODYTYPE": body, "WEATHER": 1, "LIGHTCOND": 1,
        "SURFCOND": 1, "SURFTYPE": 2, "RELJCT2": 1, "TYP_INT": 1, "ALIGNMENT": 1, "TRAFDEV": 0,
        "PREMOVE": 1, "MANEUVER": 2,
    }  # fmt: skip
    return base | kw


def _zip(tmp_path: object) -> zipfile.ZipFile:
    """Seis casos sintéticos: choque con EDR, nieve, árbol, volcadura, peatón y moto."""
    crash = [
        {"CASEID": c, "CASENUMBER": f"1-1-2024-{c}", "VEHICLES": n}
        for c, n in [("A", 2), ("B", 1), ("C", 1), ("D", 1), ("E", 1), ("F", 2)]
    ]
    gv = [
        _gv("A", 1, 4, TRAFDEV=1, RELJCT2=2, TYP_INT=3, WEATHER=99),
        _gv("A", 2, 14, PREMOVE=5),
        _gv("B", 1, 4, WEATHER=4),
        _gv("C", 1, 14, PREMOVE=99, MANEUVER=99),
        _gv("D", 1, 34),
        _gv("E", 1, 20, LIGHTCOND=3),
        _gv("F", 1, 4),
        _gv("F", 2, 80),
    ]
    spec = [{"CASEID": "A", "VEHNO": 1, "OAL": 440}, {"CASEID": "B", "VEHNO": 1, "OAL": 470},
            {"CASEID": "F", "VEHNO": 1, "OAL": 480}]  # fmt: skip
    vpic = [{"CASEID": "A", "VEHNO": 1, "Make": "TOYOTA", "Model": "Corolla", "ModelYear": "2019"}]
    ev_keys = ("CASEID", "EVENTNO", "VEHNUM", "GAD1", "OBJCLASS", "OBJCONT", "GAD2")
    event = [
        dict(zip(ev_keys, row, strict=True))
        for row in [
            ("A", 1, 1, "F", 1, 2, "B"),
            ("B", 1, 1, "F", 3, 42, ""),
            ("C", 1, 1, "R", 3, 52, ""),
            ("D", 1, 1, "T", 2, 31, ""),
            ("E", 1, 1, "F", 7, 1, ""),
            ("F", 1, 2, "F", 1, 1, "L"),
        ]
    ]
    occ = [{"CASEID": "A", "VEHNO": 1, "ROLE": 1, "AGE": 41, "SEX": 2}]
    nm = [{"CASEID": "E", "PTYPE": 5, "AGE": 70, "SEX": 1}]
    edr = {"CASEID": "A", "VEHNO": 1, "EDRSUMMNO": 1, "EDREVENTNO": 1}
    edrevent = [edr | {"CDCEVENT": 1}]
    # Velocidad (1010): el último punto antes del choque no es válido (99997) y se salta; el
    # freno (1040) no es velocidad.
    pre = [
        edr | {"PCODE": code, "PTIME": t, "PVALUE": v}
        for code, t, v in [
            (1010, -5.0, 80.0),
            (1010, -1.0, 63.0),
            (1010, -0.5, 99997),
            (1040, -0.5, 1),
        ]
    ]
    path = f"{tmp_path}/CISS_2024_CSV_files.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("FORMAT24.sas", _sas(_FORMATS))  # type: ignore[arg-type]
        for name, rows in [
            ("CRASH", crash), ("GV", gv), ("VEHSPEC", spec), ("VPICDECODE", vpic),
            ("EVENT", event), ("OCC", occ), ("NONMOTORIST", nm), ("EDREVENT", edrevent),
            ("EDRPRECRASH", pre),
        ]:  # fmt: skip
            z.writestr(f"{name}.csv", _csv(rows))  # type: ignore[arg-type]
    return zipfile.ZipFile(path)


def test_catalogo_confirma_cada_etiqueta(tmp_path: object) -> None:
    z = _zip(tmp_path)
    assert cr.label_problems(cr.formats(z)) == []
    wrong = cr.formats(z)
    wrong["WEATHER24F"]["2"] = "Snow"  # un código que cambió de significado
    assert any("WEATHER24F 2" in p for p in cr.label_problems(wrong))


def test_clasifica_cada_tipo(tmp_path: object) -> None:
    y = cr.Year(_zip(tmp_path))
    assert [cr.classify(y, c)[0] for c in "ABCDEF"] == [
        "vv", "objeto", "objeto", "volcadura", "peaton", "moto",
    ]  # fmt: skip


def test_traduce_solo_equivalencias_exactas(tmp_path: object) -> None:
    y = cr.Year(_zip(tmp_path))
    omitted: Counter[str] = Counter()
    tr, _ = cr.translate(y, "A", "vv", omitted)
    assert tr is not None
    h = tr["hechos"]
    # Clima desconocido (99): fuera de la ficha y contado; nada inventado.
    assert "entorno.clima" not in h
    assert omitted["entorno.clima"] == 1
    assert h["lugar.tipo_via"] == "interseccion_t"
    assert h["dispositivos"] == ["semaforo"]
    v0, v1 = h["vehiculos"]
    # El EDR dice 63 km/h en el último punto válido antes del choque; el relato dice 65.
    assert v0 == {"narrador": True, "clase": "sedan_compacto", "maniobra": "recto",
                  "frenado": True, "velocidad_kmh": 65}  # fmt: skip
    assert tr["contexto"]["vehiculos"][0]["velocidad_edr_kmh"] == 63.0
    assert tr["contexto"]["vehiculos"][0]["modelo"] == "Toyota Corolla (2019)"
    assert tr["contexto"]["vehiculos"][0]["conductor"] == {"edad": 41, "sexo": "mujer"}
    # El otro estaba detenido: velocidad 0 sin frenado.
    assert v1 == {"clase": "suv_compacta", "maniobra": "detenido", "velocidad_kmh": 0}
    assert h["zonas"] == {"0": "F", "1": "B"}


def test_nieve_descarta_el_caso(tmp_path: object) -> None:
    y = cr.Year(_zip(tmp_path))
    tr, why = cr.translate(y, "B", "objeto", Counter())
    assert tr is None
    assert "nieve" in why


def test_objeto_volcadura_peaton_y_moto(tmp_path: object) -> None:
    y = cr.Year(_zip(tmp_path))
    omitted: Counter[str] = Counter()
    c, _ = cr.translate(y, "C", "objeto", omitted)
    assert c is not None
    assert c["hechos"]["evento.objeto"] == "poste"
    assert "maniobra" not in c["hechos"]["vehiculos"][0]
    assert omitted["maniobra"] == 1
    d, _ = cr.translate(y, "D", "volcadura", omitted)
    assert d is not None
    assert d["hechos"]["evento.tipo"] == "volcadura"
    assert "zonas" not in d["hechos"]
    e, _ = cr.translate(y, "E", "peaton", omitted)
    assert e is not None
    assert e["hechos"]["lugar.tipo_via"] == "recta"
    assert e["hechos"]["entorno.iluminacion"] == "noche_con_alumbrado"
    assert e["hechos"]["personas"][1] == {"rol": "peaton"}
    assert e["contexto"]["persona"] == {"edad": 70, "sexo": "hombre"}
    f, _ = cr.translate(y, "F", "moto", omitted)
    assert f is not None
    # La moto pega, pero narra quien va en el auto (CISS no investiga motos).
    v0, v1 = f["hechos"]["vehiculos"]
    assert v0["narrador"]
    assert v0["clase"] == "sedan_mediano"
    assert v1["clase"] == "motocicleta"
    assert f["hechos"]["zonas"] == {"0": "L", "1": "F"}
    assert {"rol": "motociclista", "vehiculo": 1} in f["hechos"]["personas"]


def test_mencion_conserva_lo_esencial_y_es_reproducible(tmp_path: object) -> None:
    y = cr.Year(_zip(tmp_path))
    tr, _ = cr.translate(y, "A", "vv", Counter())
    assert tr is not None
    a = cr._mention(tr["hechos"], random.Random(3))  # pyright: ignore[reportPrivateUsage]
    b = cr._mention(tr["hechos"], random.Random(3))  # pyright: ignore[reportPrivateUsage]
    assert a == b
    for seed in range(40):
        m = cr._mention(tr["hechos"], random.Random(seed))  # pyright: ignore[reportPrivateUsage]
        assert m["evento.tipo"] == "impacto_vehiculo_vehiculo"
        assert m["vehiculos"][0]["narrador"]
        assert m["vehiculos"][0]["clase"] == "sedan_compacto"
        # Lo que queda es un subconjunto exacto de lo que dijo NHTSA.
        for k, v in m.items():
            if k not in ("vehiculos", "personas"):
                assert tr["hechos"][k] == v
        for full, kept in zip(tr["hechos"]["vehiculos"], m["vehiculos"], strict=True):
            assert all(full[k] == v for k, v in kept.items())


def test_fichas_al_dia_si_hay_datos_crudos() -> None:
    if not ciss.zip_path(cr.YEAR).exists():
        pytest.skip("Sin CISS 2024 en data/raw/ciss (uv run croquis-data ciss download)")
    with zipfile.ZipFile(ciss.zip_path(cr.YEAR)) as z:
        assert cr.label_problems(cr.formats(z)) == []
    assert cr.build(check=True)
