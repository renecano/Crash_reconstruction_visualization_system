"""Cuerpos humanos para el visor a partir de los assets de MakeHuman (CC0).

Fuente: repositorio oficial `makehumancommunity/makehuman`, carpeta `makehuman/data`, en un commit
fijo. La malla base, los _targets_, el esqueleto y los pesos están bajo CC0 1.0
(`LICENSE.ASSETS.md` del mismo repositorio; la malla base lo declara en su encabezado).

Qué hace el pipeline (sin Blender, todo determinista):

1. **Forma.** Combina los _macro targets_ como MakeHuman (`apps/human.py`, `apps/humanmodifier.py`):
   el peso de cada _target_ es el producto de los factores de su nombre (sexo, edad, músculo,
   peso y etnia). El contrato no registra sexo ni etnia y Croquis no los supone: sexo 0.5 y las
   tres etnias a 1/3. La edad elige la variante (niñez, adultez, vejez); la complexión se exporta
   como dos _morph targets_ (peso mínimo y máximo) y la estatura se ajusta en el visor con escala.
2. **Malla.** Grupo `body` más los ojos; sin dientes, lengua ni ayudas. Sin anatomía sexual (la
   malla base 1.1 no la trae) y con ropa neutra por regiones (camisa, pantalón, zapatos, cabello).
3. **Esqueleto.** De los 163 huesos del rig `default` quedan 16 segmentos (cadera, abdomen, pecho,
   cuello, cabeza, brazos, antebrazos, manos, muslos, piernas y pies): los pesos de los huesos
   finos se suman en su segmento. Las articulaciones salen de los vértices de referencia del rig
   sobre la malla ya deformada, así que se ajustan a cada variante.
4. **Salida.** Un glTF binario por variante (piel, normales cuantizadas con
   `KHR_mesh_quantization`) y un manifiesto con huesos, radios de cápsula para el ragdoll y
   fracciones de masa por segmento (Winter 2009, tabla 4.1, a partir de Dempster).
"""

from __future__ import annotations

import hashlib
import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

ROOT = Path(__file__).resolve().parents[3]
COMMIT = "a8bc2d54ff0ac92e78ff71431b1023eda42bf482"
REPO_URL = f"https://raw.githubusercontent.com/makehumancommunity/makehuman/{COMMIT}/"
DATA_PREFIX = "makehuman/data/"
RAW_DIR = ROOT / "data" / "raw" / "makehuman"
LOCK_PATH = Path(__file__).resolve().parents[1] / "makehuman.lock.json"
OUT_DIR = ROOT / "apps" / "web" / "public" / "modelos" / "personas"
MANIFEST_NAME = "personas.json"

RACES = ("african", "asian", "caucasian")
GENDERS = ("female", "male")
GENDER_VALUE = 0.5  # sin dato de sexo: mezcla neutra
RACE_VALUE = 1.0 / 3.0  # sin dato de etnia: las tres por igual
MUSCLE = "averagemuscle"  # músculo 0.5
MIN_AGE, MID_AGE, MAX_AGE = 1.0, 25.0, 90.0  # MakeHuman (apps/human.py)

VARIANTS: dict[str, float] = {"nino": 10.0, "adulto": 30.0, "mayor": 75.0}
KEEP_GROUPS = ("body", "helper-l-eye", "helper-r-eye")

# Segmentos (nombre, padre, hueso del rig cuya cabeza da la articulación).
BONES: tuple[tuple[str, str | None, str], ...] = (
    ("cadera", None, "root"),
    ("abdomen", "cadera", "spine04"),
    ("pecho", "abdomen", "spine02"),
    ("cuello", "pecho", "neck01"),
    ("cabeza", "cuello", "head"),
    ("brazo_i", "pecho", "upperarm01.L"),
    ("antebrazo_i", "brazo_i", "lowerarm01.L"),
    ("mano_i", "antebrazo_i", "wrist.L"),
    ("brazo_d", "pecho", "upperarm01.R"),
    ("antebrazo_d", "brazo_d", "lowerarm01.R"),
    ("mano_d", "antebrazo_d", "wrist.R"),
    ("muslo_i", "cadera", "upperleg01.L"),
    ("pierna_i", "muslo_i", "lowerleg01.L"),
    ("pie_i", "pierna_i", "foot.L"),
    ("muslo_d", "cadera", "upperleg01.R"),
    ("pierna_d", "muslo_d", "lowerleg01.R"),
    ("pie_d", "pierna_d", "foot.R"),
)
# Puntas de los segmentos terminales (cola de un hueso del rig).
TERMINAL_TAILS = {
    "cabeza": "head",
    "mano_i": "finger3-3.L",
    "mano_d": "finger3-3.R",
    "pie_i": "toe3-3.L",
    "pie_d": "toe3-3.R",
}
# Fracción de la masa corporal por segmento: Winter (2009), Biomechanics and Motor Control of
# Human Movement, 4.ª ed., tabla 4.1 (datos de Dempster). Cabeza y cuello (0.081) se reparten
# 0.069 / 0.012 (supuesto); tronco = pelvis 0.142 + abdomen 0.139 + tórax 0.216.
MASS_FRACTION = {
    "cadera": 0.142,
    "abdomen": 0.139,
    "pecho": 0.216,
    "cuello": 0.012,
    "cabeza": 0.069,
    "brazo": 0.028,
    "antebrazo": 0.016,
    "mano": 0.006,
    "muslo": 0.100,
    "pierna": 0.0465,
    "pie": 0.0145,
}
REGIONS = ("piel", "camisa", "pantalon", "zapatos", "cabello", "ojos")


def _side(name: str) -> str:
    return "i" if name.endswith(".L") else "d"


def croquis_bone(rig_bone: str) -> str:
    """Segmento de Croquis al que se suman los pesos de un hueso del rig `default`."""
    b = rig_bone
    if b in ("root",) or b.startswith("pelvis."):
        return "cadera"
    if b in ("spine05", "spine04", "spine03"):
        return "abdomen"
    if b in ("spine02", "spine01") or b.startswith(("clavicle.", "breast.")):
        return "pecho"
    if b.startswith("neck"):
        return "cuello"
    if b.startswith(("shoulder01.", "upperarm")):
        return f"brazo_{_side(b)}"
    if b.startswith("lowerarm"):
        return f"antebrazo_{_side(b)}"
    if b.startswith(("wrist.", "metacarpal", "finger")):
        return f"mano_{_side(b)}"
    if b.startswith("upperleg"):
        return f"muslo_{_side(b)}"
    if b.startswith("lowerleg"):
        return f"pierna_{_side(b)}"
    if b.startswith(("foot.", "toe")):
        return f"pie_{_side(b)}"
    return "cabeza"  # cabeza, mandíbula, ojos, lengua y músculos faciales


# ---- macro targets ---------------------------------------------------------------------------


def age_value(years: float) -> float:
    """Edad en años → valor del modificador de MakeHuman (`Human.setAgeYears`)."""
    if years < MID_AGE:
        return (years - MIN_AGE) / ((MID_AGE - MIN_AGE) * 2)
    return (years - MID_AGE) / ((MAX_AGE - MID_AGE) * 2) + 0.5


def age_factors(a: float) -> dict[str, float]:
    """Factores bebé/niñez/juventud/vejez (`Human._setAgeVals`, sistema A8)."""
    if a < 0.5:
        young = max(0.0, (a - 0.1875) * 3.2)
        return {
            "baby": max(0.0, 1 - a * 5.333),
            "child": max(0.0, min(1.0, 5.333 * a) - young),
            "young": young,
            "old": 0.0,
        }
    old = max(0.0, a * 2 - 1)
    return {"baby": 0.0, "child": 0.0, "young": 1 - old, "old": old}


def weight_factors(w: float) -> dict[str, float]:
    """Factores de peso (`Human._setWeightVals`)."""
    mx = max(0.0, w * 2 - 1)
    mn = max(0.0, 1 - w * 2)
    return {"minweight": mn, "averageweight": 1 - (mx + mn), "maxweight": mx}


def target_weights(years: float, weight: float) -> dict[str, float]:
    """Peso de cada archivo de _target_ (ruta relativa a `targets/macrodetails/`)."""
    ages = age_factors(age_value(years))
    weights = weight_factors(weight)
    out: dict[str, float] = {}
    for g in GENDERS:
        for age, fa in ages.items():
            if fa <= 0:
                continue
            for race in RACES:
                out[f"{race}-{g}-{age}.target"] = RACE_VALUE * GENDER_VALUE * fa
            for wname, fw in weights.items():
                if fw > 0:
                    name = f"universal-{g}-{age}-{MUSCLE}-{wname}.target"
                    out[name] = GENDER_VALUE * fa * fw
    return out


def required_targets() -> list[str]:
    names: set[str] = set()
    for years in VARIANTS.values():
        for w in (0.0, 0.5, 1.0):
            names.update(target_weights(years, w))
    return sorted(names)


def required_files() -> list[str]:
    """Rutas dentro del repositorio de MakeHuman que el pipeline necesita."""
    files = [
        "LICENSE.ASSETS.md",
        DATA_PREFIX + "3dobjs/base.obj",
        DATA_PREFIX + "rigs/default.mhskel",
        DATA_PREFIX + "rigs/default_weights.mhw",
    ]
    files += [DATA_PREFIX + "targets/macrodetails/" + t for t in required_targets()]
    return files


def local_path(repo_path: str) -> Path:
    return RAW_DIR / repo_path.removeprefix(DATA_PREFIX)


# ---- lectura ---------------------------------------------------------------------------------


@dataclass
class BaseMesh:
    vertices: NDArray[np.float64]  # (N, 3) en decímetros, y arriba, mirando a +z
    faces: list[tuple[list[int], str]]  # índices de vértice (0-based) y grupo


def read_obj(path: Path) -> BaseMesh:
    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[list[int], str]] = []
    group = ""
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("v "):
            _, x, y, z = line.split()[:4]
            verts.append((float(x), float(y), float(z)))
        elif line.startswith("g "):
            group = line[2:].strip()
        elif line.startswith("f "):
            idx = [int(tok.split("/")[0]) - 1 for tok in line.split()[1:]]
            faces.append((idx, group))
    return BaseMesh(np.asarray(verts, dtype=np.float64), faces)


def read_target(path: Path) -> tuple[NDArray[np.int64], NDArray[np.float64]]:
    idx: list[int] = []
    delta: list[tuple[float, float, float]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        idx.append(int(parts[0]))
        delta.append((float(parts[1]), float(parts[2]), float(parts[3])))
    return np.asarray(idx, dtype=np.int64), np.asarray(delta, dtype=np.float64).reshape(-1, 3)


def morphed(base: BaseMesh, years: float, weight: float) -> NDArray[np.float64]:
    v = base.vertices.copy()
    for name, w in sorted(target_weights(years, weight).items()):
        idx, delta = read_target(RAW_DIR / "targets" / "macrodetails" / name)
        if len(idx):
            v[idx] += w * delta
    return v


# ---- esqueleto y pesos -----------------------------------------------------------------------


def joint_positions(skel: dict[str, Any], v: NDArray[np.float64]) -> dict[str, NDArray[np.float64]]:
    joints: dict[str, list[int]] = skel["joints"]
    return {name: v[np.asarray(ix, dtype=np.int64)].mean(axis=0) for name, ix in joints.items()}


def rig_head(
    skel: dict[str, Any], jp: dict[str, NDArray[np.float64]], bone: str
) -> NDArray[np.float64]:
    return jp[skel["bones"][bone]["head"]]


def rig_tail(
    skel: dict[str, Any], jp: dict[str, NDArray[np.float64]], bone: str
) -> NDArray[np.float64]:
    return jp[skel["bones"][bone]["tail"]]


def segment_weights(mhw: dict[str, Any], n_vertices: int) -> NDArray[np.float64]:
    """Matriz (N, 16+1) de pesos por segmento sumando los huesos finos del rig."""
    names = [b[0] for b in BONES]
    col = {n: i for i, n in enumerate(names)}
    w = np.zeros((n_vertices, len(names)), dtype=np.float64)
    weights: dict[str, list[list[float]]] = mhw["weights"]
    for bone, pairs in weights.items():
        c = col[croquis_bone(bone)]
        for vi, wi in pairs:
            w[int(vi), c] += float(wi)
    return w


# ---- construcción ----------------------------------------------------------------------------


@dataclass
class BuiltBody:
    name: str
    years: float
    positions: NDArray[np.float32]
    normals: NDArray[np.float32]
    indices: NDArray[np.uint16]
    joints: NDArray[np.uint8]
    weights: NDArray[np.uint8]
    region: NDArray[np.float32]
    morphs: dict[str, NDArray[np.float32]]
    bone_heads: NDArray[np.float64]  # (16+1, 3) normalizado
    bone_tails: NDArray[np.float64]
    bone_radius: NDArray[np.float64]
    height_m: float


def _normals(pos: NDArray[np.float64], tris: NDArray[np.int64]) -> NDArray[np.float64]:
    n = np.zeros_like(pos)
    a, b, c = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    length = np.linalg.norm(n, axis=1, keepdims=True)
    length[length == 0] = 1.0
    return n / length


def _segment_distance(
    p: NDArray[np.float64], a: NDArray[np.float64], b: NDArray[np.float64]
) -> NDArray[np.float64]:
    ab = b - a
    denom = float(ab @ ab) or 1.0
    t = np.clip(((p - a) @ ab) / denom, 0.0, 1.0)
    q = a + t[:, None] * ab
    return np.linalg.norm(p - q, axis=1)


def build_variant(
    name: str, years: float, base: BaseMesh, skel: dict[str, Any], mhw: dict[str, Any]
) -> BuiltBody:
    v_avg = morphed(base, years, 0.5)
    v_min = morphed(base, years, 0.0)
    v_max = morphed(base, years, 1.0)
    keep_faces = [(f, g) for f, g in base.faces if g in KEEP_GROUPS]
    used = sorted({i for f, _ in keep_faces for i in f})
    remap = {old: new for new, old in enumerate(used)}
    tris: list[tuple[int, int, int]] = []
    tri_group: list[str] = []
    for f, g in keep_faces:
        r = [remap[i] for i in f]
        for k in range(1, len(r) - 1):
            tris.append((r[0], r[k], r[k + 1]))
            tri_group.append(g)
    tri_arr = np.asarray(tris, dtype=np.int64)
    used_arr = np.asarray(used, dtype=np.int64)

    jp = joint_positions(skel, v_avg)
    heads = np.stack([rig_head(skel, jp, rb) for _, _, rb in BONES])
    names = [b[0] for b in BONES]
    parent_idx = [names.index(p) if p else -1 for _, p, _ in BONES]
    tails = np.zeros_like(heads)
    for i, (bn, _, _) in enumerate(BONES):
        if bn in TERMINAL_TAILS:
            tails[i] = rig_tail(skel, jp, TERMINAL_TAILS[bn])
        else:
            kids = [j for j, p in enumerate(parent_idx) if p == i]
            # El hijo "principal": el que sigue la cadena (abdomen→pecho→cuello…).
            chain = {"cadera": "abdomen", "pecho": "cuello"}
            kid = names.index(chain[bn]) if bn in chain else kids[0]
            tails[i] = heads[kid]

    # Normalización: pies en y = 0, cadera en x = z = 0, altura total 1.
    body_mask = np.zeros(len(base.vertices), dtype=bool)
    for f, g in keep_faces:
        if g == "body":
            body_mask[f] = True
    ys = v_avg[body_mask, 1]
    height = float(ys.max() - ys.min())
    origin = np.array([heads[0][0], float(ys.min()), heads[0][2]])

    def norm(p: NDArray[np.float64]) -> NDArray[np.float64]:
        return (p - origin) / height

    pos = norm(v_avg[used_arr])
    heads_n, tails_n = norm(heads), norm(tails)

    sw = segment_weights(mhw, len(base.vertices))[used_arr]
    # Vértices sin pesos (no debería pasar en `body`): al segmento más cercano.
    empty = sw.sum(axis=1) <= 0
    if empty.any():
        d = np.stack(
            [_segment_distance(pos[empty], heads_n[i], tails_n[i]) for i in range(len(BONES))],
            axis=1,
        )
        sw[np.where(empty)[0], d.argmin(axis=1)] = 1.0
    order = np.argsort(-sw, axis=1, kind="stable")[:, :4]
    top = np.take_along_axis(sw, order, axis=1)
    top = top / top.sum(axis=1, keepdims=True)
    # Cuantización a u8 que suma exactamente 255.
    q = np.floor(top * 255.0 + 0.5).astype(np.int64)
    q[:, 0] += 255 - q.sum(axis=1)
    joints_u8 = order.astype(np.uint8)
    weights_u8 = np.clip(q, 0, 255).astype(np.uint8)
    dominant = order[:, 0]

    # Regiones de ropa neutra.
    region = np.zeros(len(used), dtype=np.float32)
    seg = np.asarray(names)[dominant]
    region[np.isin(seg, ["abdomen", "pecho", "brazo_i", "brazo_d"])] = 1
    region[np.isin(seg, ["cadera", "muslo_i", "muslo_d", "pierna_i", "pierna_d"])] = 2
    region[np.isin(seg, ["pie_i", "pie_d"])] = 3
    head_i = names.index("cabeza")
    hc = heads_n[head_i]
    ht = tails_n[head_i]
    head_len = float(np.linalg.norm(np.asarray(ht - hc, dtype=np.float64)))
    is_head = seg == "cabeza"
    rel = pos - hc
    hair = is_head & (
        (rel[:, 1] > 0.62 * head_len)
        | ((rel[:, 2] < -0.12 * head_len) & (rel[:, 1] > 0.15 * head_len))
    )
    region[hair] = 4
    eye_vertices = {remap[i] for f, g in keep_faces if g != "body" for i in f}
    region[np.asarray(sorted(eye_vertices), dtype=np.int64)] = 5

    normals = _normals(pos, tri_arr)
    morphs = {
        "peso_min": ((v_min[used_arr] - v_avg[used_arr]) / height).astype(np.float32),
        "peso_max": ((v_max[used_arr] - v_avg[used_arr]) / height).astype(np.float32),
    }
    radius = np.zeros(len(BONES))
    for i in range(len(BONES)):
        mask = dominant == i
        if mask.any():
            radius[i] = float(np.median(_segment_distance(pos[mask], heads_n[i], tails_n[i])))
    return BuiltBody(
        name=name,
        years=years,
        positions=pos.astype(np.float32),
        normals=normals.astype(np.float32),
        indices=tri_arr.astype(np.uint16).reshape(-1),
        joints=joints_u8,
        weights=weights_u8,
        region=region,
        morphs=morphs,
        bone_heads=heads_n,
        bone_tails=tails_n,
        bone_radius=radius,
        height_m=height / 10.0,  # la malla base está en decímetros
    )


# ---- glTF ------------------------------------------------------------------------------------


def _pad4(b: bytes, fill: bytes = b"\x00") -> bytes:
    return b + fill * ((4 - len(b) % 4) % 4)


def write_glb(body: BuiltBody, path: Path) -> bytes:
    """glTF 2.0 binario con piel, normales en BYTE y _morph targets_ en SHORT normalizados."""
    chunks: list[bytes] = []
    views: list[dict[str, Any]] = []
    accessors: list[dict[str, Any]] = []
    offset = 0

    def add(data: bytes, *, stride: int | None = None, target: int | None = None) -> int:
        nonlocal offset
        view: dict[str, Any] = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if stride:
            view["byteStride"] = stride
        if target:
            view["target"] = target
        views.append(view)
        padded = _pad4(data)
        chunks.append(padded)
        offset += len(padded)
        return len(views) - 1

    def accessor(view: int, ctype: int, count: int, atype: str, **extra: Any) -> int:
        accessors.append(
            {"bufferView": view, "componentType": ctype, "count": count, "type": atype, **extra}
        )
        return len(accessors) - 1

    n = len(body.positions)
    pos = body.positions
    a_pos = accessor(
        add(pos.tobytes(), target=34962),
        5126,
        n,
        "VEC3",
        min=[float(x) for x in pos.min(axis=0)],
        max=[float(x) for x in pos.max(axis=0)],
    )
    nb = np.zeros((n, 4), dtype=np.int8)
    nb[:, :3] = np.clip(np.round(body.normals * 127.0), -127, 127).astype(np.int8)
    a_nrm = accessor(add(nb.tobytes(), stride=4, target=34962), 5120, n, "VEC3", normalized=True)
    a_jnt = accessor(add(body.joints.tobytes(), target=34962), 5121, n, "VEC4")
    a_wgt = accessor(add(body.weights.tobytes(), target=34962), 5121, n, "VEC4", normalized=True)
    a_reg = accessor(add(body.region.tobytes(), target=34962), 5126, n, "SCALAR")
    a_idx = accessor(add(body.indices.tobytes(), target=34963), 5123, len(body.indices), "SCALAR")
    targets: list[dict[str, int]] = []
    for name in ("peso_min", "peso_max"):
        d = body.morphs[name]
        q = np.zeros((n, 4), dtype=np.int16)
        q[:, :3] = np.clip(np.round(d * 32767.0), -32767, 32767).astype(np.int16)
        mn = q[:, :3].min(axis=0)
        mx = q[:, :3].max(axis=0)
        a_m = accessor(
            add(q.tobytes(), stride=8, target=34962),
            5122,
            n,
            "VEC3",
            normalized=True,
            min=[int(x) for x in mn],
            max=[int(x) for x in mx],
        )
        targets.append({"POSITION": a_m})
    names = [b[0] for b in BONES]
    ibm = np.zeros((len(BONES), 16), dtype=np.float32)
    for i in range(len(BONES)):
        m = np.eye(4, dtype=np.float32)
        m[:3, 3] = -body.bone_heads[i]
        ibm[i] = m.T.reshape(-1)  # columnas primero
    a_ibm = accessor(add(ibm.tobytes()), 5126, len(BONES), "MAT4")

    nodes: list[dict[str, Any]] = [
        {"name": f"persona_{body.name}", "mesh": 0, "skin": 0},
    ]
    for i, (bn, parent, _) in enumerate(BONES):
        head = body.bone_heads[i]
        ph = body.bone_heads[names.index(parent)] if parent else np.zeros(3)
        nodes.append({"name": bn, "translation": [float(x) for x in head - ph]})
    for i, (_, parent, _) in enumerate(BONES):
        if parent:
            pnode = nodes[1 + names.index(parent)]
            pnode.setdefault("children", []).append(1 + i)
    gltf: dict[str, Any] = {
        "asset": {
            "version": "2.0",
            "generator": "croquis-assets (MakeHuman CC0)",
            "copyright": "MakeHuman, CC0 1.0 Universal",
        },
        "extensionsUsed": ["KHR_mesh_quantization"],
        "extensionsRequired": ["KHR_mesh_quantization"],
        "scene": 0,
        "scenes": [{"nodes": [0, 1]}],
        "nodes": nodes,
        "meshes": [
            {
                "name": f"cuerpo_{body.name}",
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": a_pos,
                            "NORMAL": a_nrm,
                            "JOINTS_0": a_jnt,
                            "WEIGHTS_0": a_wgt,
                            "_REGION": a_reg,
                        },
                        "indices": a_idx,
                        "targets": targets,
                    }
                ],
                "weights": [0.0, 0.0],
                "extras": {"targetNames": ["peso_min", "peso_max"]},
            }
        ],
        "skins": [
            {
                "name": "esqueleto",
                "joints": list(range(1, 1 + len(BONES))),
                "skeleton": 1,
                "inverseBindMatrices": a_ibm,
            }
        ],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": offset}],
    }
    js = _pad4(json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), b" ")
    binary = b"".join(chunks)
    total = 12 + 8 + len(js) + 8 + len(binary)
    out = (
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(js), 0x4E4F534A)
        + js
        + struct.pack("<II", len(binary), 0x004E4942)
        + binary
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(out)
    return out


def manifest_entry(body: BuiltBody, file_name: str, data: bytes) -> dict[str, Any]:
    names = [b[0] for b in BONES]
    bones: list[dict[str, Any]] = []
    for i, (bn, parent, _) in enumerate(BONES):
        kind = bn.split("_")[0]
        bones.append(
            {
                "nombre": bn,
                "padre": parent,
                "cabeza": [round(float(x), 6) for x in body.bone_heads[i]],
                "punta": [round(float(x), 6) for x in body.bone_tails[i]],
                "radio": round(float(body.bone_radius[i]), 6),
                "fraccion_masa": MASS_FRACTION[kind],
            }
        )
    assert abs(sum(b["fraccion_masa"] for b in bones) - 1.0) < 1e-9, names
    return {
        "variante": body.name,
        "edad_anios": body.years,
        "archivo": file_name,
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
        "altura_base_m": round(body.height_m, 6),
        "vertices": len(body.positions),
        "triangulos": len(body.indices) // 3,
        "huesos": bones,
    }


def build_all(out_dir: Path = OUT_DIR) -> dict[str, Any]:
    base = read_obj(RAW_DIR / "3dobjs" / "base.obj")
    skel: dict[str, Any] = json.loads(
        (RAW_DIR / "rigs" / "default.mhskel").read_text(encoding="utf-8")
    )
    mhw: dict[str, Any] = json.loads(
        (RAW_DIR / "rigs" / "default_weights.mhw").read_text(encoding="utf-8")
    )
    entries: list[dict[str, Any]] = []
    for name, years in VARIANTS.items():
        body = build_variant(name, years, base, skel, mhw)
        file_name = f"{name}.glb"
        data = write_glb(body, out_dir / file_name)
        entries.append(manifest_entry(body, file_name, data))
    manifest: dict[str, Any] = {
        "_generado_por": "uv run croquis-assets humans build "
        "(assets/pipeline/croquis_assets/humans.py)",
        "fuente": {
            "repositorio": "https://github.com/makehumancommunity/makehuman",
            "commit": COMMIT,
            "licencia": "CC0 1.0 Universal (LICENSE.ASSETS.md)",
        },
        "unidades": "Altura normalizada a 1 (pies en y = 0, mirando a +z); el visor escala a la "
        "estatura.",
        "regiones": list(REGIONS),
        "morph_targets": ["peso_min", "peso_max"],
        "fuente_fracciones_masa": "Winter (2009), Biomechanics and Motor Control of Human "
        "Movement, tabla 4.1 (Dempster); reparto cabeza/cuello supuesto",
        "variantes": entries,
    }
    (out_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifest


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_lock() -> list[str]:
    """Diferencias entre los archivos descargados y el candado (vacío si todo coincide)."""
    lock: dict[str, Any] = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    errors: list[str] = []
    for repo_path, info in lock["archivos"].items():
        p = local_path(repo_path)
        if not p.exists():
            errors.append(f"falta {repo_path}")
        elif sha256_file(p) != info["sha256"]:
            errors.append(f"SHA-256 distinto: {repo_path}")
    return errors


__all__ = [
    "BONES",
    "COMMIT",
    "VARIANTS",
    "age_factors",
    "age_value",
    "build_all",
    "check_lock",
    "croquis_bone",
    "required_files",
    "target_weights",
    "weight_factors",
]
