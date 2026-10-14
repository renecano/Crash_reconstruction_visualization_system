"""Pipeline de cuerpos: factores de MakeHuman y estructura de los glTF versionados."""

from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from hypothesis import given
from hypothesis import strategies as st

from croquis_assets import humans

MANIFEST = humans.OUT_DIR / humans.MANIFEST_NAME


def test_edad_en_anios_como_makehuman() -> None:
    assert humans.age_value(1.0) == pytest.approx(0.0)
    assert humans.age_value(25.0) == pytest.approx(0.5)
    assert humans.age_value(90.0) == pytest.approx(1.0)
    assert humans.age_value(10.0) == pytest.approx(0.1875)


def test_factores_de_edad_en_los_nodos() -> None:
    assert humans.age_factors(0.0)["baby"] == pytest.approx(1.0)
    child = humans.age_factors(0.1875)
    assert child["child"] == pytest.approx(1.0, abs=1e-3)
    assert child["young"] == pytest.approx(0.0)
    assert humans.age_factors(0.5) == {"baby": 0.0, "child": 0.0, "young": 1.0, "old": 0.0}
    assert humans.age_factors(1.0)["old"] == pytest.approx(1.0)


@given(st.floats(min_value=0.0, max_value=1.0))
def test_factores_suman_uno(a: float) -> None:
    assert sum(humans.age_factors(a).values()) == pytest.approx(1.0, abs=2e-3)
    assert sum(humans.weight_factors(a).values()) == pytest.approx(1.0, abs=1e-12)


@given(st.floats(min_value=5.0, max_value=90.0), st.floats(min_value=0.0, max_value=1.0))
def test_pesos_de_targets_neutros_en_sexo_y_etnia(years: float, w: float) -> None:
    tw = humans.target_weights(years, w)
    ethnic = {k: v for k, v in tw.items() if not k.startswith("universal")}
    # Las tres etnias y los dos sexos pesan lo mismo para cada edad.
    by_age: dict[str, set[float]] = {}
    for k, v in ethnic.items():
        by_age.setdefault(k.split("-")[2], set()).add(round(v, 12))
    assert all(len(vals) == 1 for vals in by_age.values())
    # La suma de los universales es la suma de los factores de edad presentes (sexo 0.5 × 2).
    ages = humans.age_factors(humans.age_value(years))
    uni = sum(v for k, v in tw.items() if k.startswith("universal"))
    assert uni == pytest.approx(sum(f for f in ages.values() if f > 0), rel=1e-9)


def test_segmentos_de_los_huesos_del_rig() -> None:
    assert humans.croquis_bone("root") == "cadera"
    assert humans.croquis_bone("pelvis.L") == "cadera"
    assert humans.croquis_bone("spine05") == "abdomen"
    assert humans.croquis_bone("clavicle.R") == "pecho"
    assert humans.croquis_bone("finger2-3.L") == "mano_i"
    assert humans.croquis_bone("toe5-1.R") == "pie_d"
    assert humans.croquis_bone("upperleg02.L") == "muslo_i"
    assert humans.croquis_bone("jaw") == "cabeza"
    assert humans.croquis_bone("eye.R") == "cabeza"


def test_masas_suman_uno() -> None:
    total = 0.0
    for name, _, _ in humans.BONES:
        total += humans.MASS_FRACTION[name.split("_")[0]]
    assert total == pytest.approx(1.0, abs=1e-12)


def _read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67
    assert version == 2
    assert length == len(data)
    jlen, jtype = struct.unpack_from("<II", data, 12)
    assert jtype == 0x4E4F534A
    gltf: dict[str, Any] = json.loads(data[20 : 20 + jlen].decode("utf-8"))
    blen, btype = struct.unpack_from("<II", data, 20 + jlen)
    assert btype == 0x004E4942
    return gltf, data[28 + jlen : 28 + jlen + blen]


def _accessor(gltf: dict[str, Any], binary: bytes, i: int) -> np.ndarray[Any, Any]:
    acc = gltf["accessors"][i]
    view = gltf["bufferViews"][acc["bufferView"]]
    dtype = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5126: np.float32}[
        acc["componentType"]
    ]
    comps = {"SCALAR": 1, "VEC3": 3, "VEC4": 4, "MAT4": 16}[acc["type"]]
    item = np.dtype(dtype).itemsize
    stride = view.get("byteStride", comps * item)
    raw = np.frombuffer(binary, dtype=np.uint8, count=view["byteLength"], offset=view["byteOffset"])
    rows = raw.reshape(acc["count"], stride)[:, : comps * item].copy()
    return rows.view(dtype).reshape(acc["count"], comps)


@pytest.fixture(scope="module")
def manifest() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return data


def test_manifiesto_coincide_con_los_archivos(manifest: dict[str, Any]) -> None:
    assert manifest["fuente"]["commit"] == humans.COMMIT
    assert [v["variante"] for v in manifest["variantes"]] == list(humans.VARIANTS)
    for v in manifest["variantes"]:
        data = (humans.OUT_DIR / v["archivo"]).read_bytes()
        assert hashlib.sha256(data).hexdigest() == v["sha256"]
        assert len(data) == v["bytes"]
        assert len(data) < 1_000_000  # presupuesto de carga (PLAN §7.8)


@pytest.mark.parametrize("variant", list(humans.VARIANTS))
def test_glb_valido_con_piel(variant: str, manifest: dict[str, Any]) -> None:
    gltf, binary = _read_glb(humans.OUT_DIR / f"{variant}.glb")
    prim = gltf["meshes"][0]["primitives"][0]
    attrs = prim["attributes"]
    pos = _accessor(gltf, binary, attrs["POSITION"])
    joints = _accessor(gltf, binary, attrs["JOINTS_0"])
    weights = _accessor(gltf, binary, attrs["WEIGHTS_0"])
    idx = _accessor(gltf, binary, prim["indices"])
    region = _accessor(gltf, binary, attrs["_REGION"])
    n_bones = len(humans.BONES)
    assert pos.min(axis=0)[1] == pytest.approx(0.0, abs=1e-6)  # pies en el piso
    assert pos.max(axis=0)[1] == pytest.approx(1.0, abs=1e-3)  # altura normalizada
    assert int(joints.max()) < n_bones
    assert (weights.astype(np.int64).sum(axis=1) == 255).all()
    assert int(idx.max()) < len(pos)
    assert len(idx) % 3 == 0
    assert set(np.unique(region).astype(int)) <= set(range(len(humans.REGIONS)))
    for name in ("camisa", "pantalon", "zapatos", "cabello", "piel", "ojos"):
        assert (region == humans.REGIONS.index(name)).any(), name
    # Morph targets de complexión: desplazamientos pequeños (< 10 % de la altura).
    for t in prim["targets"]:
        d = _accessor(gltf, binary, t["POSITION"]).astype(np.float64) / 32767.0
        assert np.abs(d).max() < 0.1
        assert np.abs(d).max() > 0.001
    # Esqueleto: las matrices inversas de enlace deshacen la cabeza de cada hueso.
    skin = gltf["skins"][0]
    ibm = _accessor(gltf, binary, skin["inverseBindMatrices"]).reshape(n_bones, 4, 4)
    entry = next(v for v in manifest["variantes"] if v["variante"] == variant)
    for i, bone in enumerate(entry["huesos"]):
        m = ibm[i].T  # guardadas por columnas
        assert m[:3, 3] == pytest.approx([-x for x in bone["cabeza"]], abs=1e-5)
        # Cada articulación queda dentro del contorno del cuerpo.
        assert 0.0 <= bone["cabeza"][1] <= 1.0
        assert bone["radio"] > 0


def test_lado_izquierdo_en_x_positivo(manifest: dict[str, Any]) -> None:
    for v in manifest["variantes"]:
        bones = {b["nombre"]: b for b in v["huesos"]}
        assert bones["brazo_i"]["cabeza"][0] > 0 > bones["brazo_d"]["cabeza"][0]
        assert bones["pie_i"]["cabeza"][1] < bones["pierna_i"]["cabeza"][1]
        assert bones["pierna_i"]["cabeza"][1] < bones["muslo_i"]["cabeza"][1]
        assert bones["cabeza"]["cabeza"][1] > bones["cuello"]["cabeza"][1]
