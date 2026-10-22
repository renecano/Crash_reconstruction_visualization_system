"""Funciones trascendentes deterministas (ADR 0029 y 0065): el port Python de `dmath`.

Tres niveles: la misma tabla de bits de fdlibm que `packages/solver-ts/src/dmath.test.ts`; igualdad
bit a bit con los valores que calcula `dmath` de TS (`solver/tests/data/dmath_ts.json`, lo escribe
`packages/solver-ts/scripts/dmath-fixture.ts`); y a lo más 1 ulp de la libm del sistema.
"""

from __future__ import annotations

import ast
import json
import math
import random
import struct
from pathlib import Path
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from croquis_solver import dmath

DATA = Path(__file__).parent / "data" / "dmath_ts.json"
SOLVER = Path(__file__).parent.parent / "croquis_solver"


def _hex(x: float) -> str:
    return struct.pack(">d", x).hex()


def _from_hex(h: str) -> float:
    return struct.unpack(">d", bytes.fromhex(h))[0]


def _ulps(a: float, b: float) -> int:
    if a == b or (math.isnan(a) and math.isnan(b)):
        return 0
    x = struct.unpack("<q", struct.pack("<d", a))[0]
    y = struct.unpack("<q", struct.pack("<d", b))[0]
    x = -(x & 0x7FFFFFFFFFFFFFFF) if x < 0 else x
    y = -(y & 0x7FFFFFFFFFFFFFFF) if y < 0 else y
    return abs(x - y)


UNARIAS: list[tuple[str, float, str]] = [
    ("acos", 0.1, "3ff787b22ce3f590"),
    ("acos", 0.49, "3ff0f0764decac8b"),
    ("acos", 0.5, "3ff0c152382d7366"),
    ("acos", 0.75, "3fe720a392c1d955"),
    ("acos", 0.9999, "3f8cf69d216bd74b"),
    ("acos", -0.3, "3ffe0200bbc96ad8"),
    ("acos", -0.5, "4000c152382d7366"),
    ("acos", -0.9, "400586476251e745"),
    ("acos", 1e-10, "3ff921fb543d4de0"),
    ("sin", 0.5, "3fdeaee8744b05f0"),
    ("sin", 1, "3feaed548f090cee"),
    ("sin", 2.5, "3fe326af0dcfcab0"),
    ("sin", -3, "bfc210386db6d55b"),
    ("sin", 10, "bfe1689ef5f34f52"),
    ("sin", 1000000, "bfd6664b2568d867"),
    ("sin", 1e22, "bfeb453ab76bf397"),
    ("sin", 1e300, "bfea2c16b010e385"),
    ("sin", 0.7853981633974483, "3fe6a09e667f3bcc"),
    ("sin", 3.141592653589793, "3ca1a62633145c07"),
    ("cos", 0.5, "3fec1528065b7d50"),
    ("cos", 1, "3fe14a280fb5068c"),
    ("cos", 2.5, "bfe9a2f7ef858b7d"),
    ("cos", -3, "bfefae04be85e5d2"),
    ("cos", 10, "bfead9ac890c6b1f"),
    ("cos", 1000000, "3fedf9df9906d32c"),
    ("cos", 1e22, "3fe0be2cef01c8f4"),
    ("cos", 1e300, "bfe2699022adc4c1"),
    ("cos", 1.5707963267948966, "3c91a62633145c07"),
    ("tan", 0.5, "3fe17b4f5bf3474a"),
    ("tan", 1, "3ff8eb245cbee3a6"),
    ("tan", 1.5, "402c33ed50b88777"),
    ("tan", -2.5, "3fe7e79b4e00bb15"),
    ("tan", 100, "bfe2ca74d62b5d38"),
    ("tan", 10000000000, "bfe1de000f443f50"),
    ("tan", 0.7853981633974483, "3fefffffffffffff"),
    ("atan", 0.3, "3fd2a73a661eaf06"),
    ("atan", 0.5, "3fddac670561bb4f"),
    ("atan", 1, "3fe921fb54442d18"),
    ("atan", 1.7, "3ff0a00a3bce369f"),
    ("atan", 3, "3ff3fc176b7a8560"),
    ("atan", -40, "bff8bb9a63718f45"),
    ("atan", 1e20, "3ff921fb54442d18"),
    ("exp", -700, "00d14f2b0fb9307f"),
    ("exp", -1, "3fd78b56362cef38"),
    ("exp", 0.1, "3ff1aec7b35a00d4"),
    ("exp", 0.5, "3ffa61298e1e069c"),
    ("exp", 1, "4005bf0a8b145769"),
    ("exp", 2.5, "40285d6fd931e0bb"),
    ("exp", 20, "41bceb088b68e804"),
    ("exp", 700, "7f0d945df4f8ec8e"),
    ("log", 1e-310, "c0864e69394d9508"),
    ("log", 1e-5, "c027069e2aa2aa5b"),
    ("log", 0.5, "bfe62e42fefa39ef"),
    ("log", 0.9999999, "be7ad7f2b1049b9f"),
    ("log", 1.0000001, "3e7ad7f2847b6492"),
    ("log", 2, "3fe62e42fefa39ef"),
    ("log", 10, "40026bb1bbb55516"),
    ("log", 1e300, "4085963447f87fb5"),
]
BINARIAS: list[tuple[str, float, float, str]] = [
    ("atan2", 1, 2, "3fddac670561bb4f"),
    ("atan2", -1, 2, "bfddac670561bb4f"),
    ("atan2", 1, -2, "40056c6e7397f5ae"),
    ("atan2", -1, -2, "c0056c6e7397f5ae"),
    ("atan2", 3, 0.001, "3ff9209dcdc8c77a"),
    ("atan2", 1e-300, 1e300, "0000000000000000"),
    ("hypot", 3, 4, "4014000000000000"),
    ("hypot", 1e-200, 1e-200, "167151f68876f410"),
    ("hypot", 1e200, 3e200, "69908669e596b4f8"),
    ("hypot", 0.1, 0.2, "3fcc9f25c5bfedda"),
]


@pytest.mark.parametrize(("f", "x", "bits"), UNARIAS)
def test_bits_exactos_de_fdlibm_unarias(f: str, x: float, bits: str) -> None:
    assert _hex(getattr(dmath, f)(float(x))) == bits


@pytest.mark.parametrize(("f", "a", "b", "bits"), BINARIAS)
def test_bits_exactos_de_fdlibm_binarias(f: str, a: float, b: float, bits: str) -> None:
    assert _hex(getattr(dmath, f)(float(a), float(b))) == bits


@pytest.mark.parametrize(
    ("xs", "bits"),
    [
        ([1.0, 2.0, 3.0], "400deeea11683f48"),
        ([0.1, -0.2, 0.3, 0.4], "3fe186f174f88473"),
        ([1e-200, 2e-200, 3e-200], "1686e994ecad50fe"),
    ],
)
def test_bits_exactos_de_hypot_n(xs: list[float], bits: str) -> None:
    assert _hex(dmath.hypot_n(xs)) == bits


def _same(a: float, b: float) -> bool:
    return _hex(a) == _hex(b)


def test_casos_especiales_de_ieee_754() -> None:
    assert _same(dmath.sin(-0.0), -0.0)
    assert _same(dmath.tan(-0.0), -0.0)
    assert _same(dmath.atan(-0.0), -0.0)
    assert dmath.cos(0.0) == 1.0
    assert dmath.exp(0.0) == 1.0
    assert dmath.exp(1.0) == math.e
    assert dmath.exp(-math.inf) == 0.0
    assert dmath.exp(math.inf) == math.inf
    assert dmath.exp(710.0) == math.inf
    assert dmath.exp(-746.0) == 0.0
    assert dmath.log(1.0) == 0.0
    assert dmath.log(0.0) == -math.inf
    assert dmath.log(math.inf) == math.inf
    assert dmath.atan(math.inf) == math.pi / 2
    for f in (dmath.sin, dmath.cos, dmath.tan):
        assert math.isnan(f(math.inf))
        assert math.isnan(f(math.nan))
    assert math.isnan(dmath.log(-1.0))
    assert math.isnan(dmath.exp(math.nan))


def test_atan2_en_los_ejes_y_con_infinitos() -> None:
    assert _same(dmath.atan2(0.0, 0.0), 0.0)
    assert _same(dmath.atan2(-0.0, 0.0), -0.0)
    assert dmath.atan2(0.0, -0.0) == math.pi
    assert dmath.atan2(-0.0, -0.0) == -math.pi
    assert dmath.atan2(1.0, 0.0) == math.pi / 2
    assert dmath.atan2(-1.0, -0.0) == -math.pi / 2
    assert dmath.atan2(math.inf, math.inf) == math.pi / 4
    assert dmath.atan2(-math.inf, -math.inf) == -3 * math.pi / 4
    assert dmath.atan2(1.0, -math.inf) == math.pi
    assert math.isnan(dmath.atan2(math.nan, 1.0))


def test_acos_en_los_extremos_y_fuera_del_dominio() -> None:
    assert dmath.acos(1.0) == 0.0
    assert dmath.acos(-1.0) == math.pi
    assert dmath.acos(0.0) == math.pi / 2
    assert math.isnan(dmath.acos(1.0000001))
    assert math.isnan(dmath.acos(-2.0))
    assert math.isnan(dmath.acos(math.nan))


def test_hipotenusas_con_ceros_infinitos_y_nan() -> None:
    assert dmath.hypot_n([]) == 0.0
    assert dmath.hypot_n([-0.0, 0.0, -0.0]) == 0.0
    assert dmath.hypot_n([math.nan, math.inf, 1.0]) == math.inf
    assert math.isnan(dmath.hypot_n([math.nan, 1.0, 2.0]))
    assert dmath.hypot_n([2.0, 3.0, 6.0]) == 7.0
    assert dmath.hypot(0.0, 0.0) == 0.0
    assert dmath.hypot(-0.0, -0.0) == 0.0
    assert dmath.hypot(math.inf, math.nan) == math.inf
    assert dmath.hypot(math.nan, -math.inf) == math.inf
    assert math.isnan(dmath.hypot(math.nan, 1.0))
    assert dmath.hypot(-5.0, 12.0) == 13.0


def test_pow2_es_exacto_en_todo_el_rango() -> None:
    for k in range(-1074, 1024):
        assert dmath.pow2(k) == math.ldexp(1.0, k)
    assert dmath.pow2(1024) == math.inf
    with pytest.raises(TypeError):
        dmath.pow2(0.5)  # pyright: ignore[reportArgumentType]


def _cases() -> dict[str, list[list[str]]]:
    data: dict[str, Any] = json.loads(DATA.read_text(encoding="utf-8"))
    return data["casos"]


@pytest.mark.parametrize("name", ["sin", "cos", "tan", "atan", "acos", "exp", "log"])
def test_igual_a_dmath_de_ts_bit_a_bit_unarias(name: str) -> None:
    f = getattr(dmath, name)
    rows = _cases()[name]
    assert len(rows) > 400
    bad = [(x, want, _hex(f(_from_hex(x)))) for x, want in rows if _hex(f(_from_hex(x))) != want]
    assert bad == []


def test_igual_a_dmath_de_ts_bit_a_bit_binarias() -> None:
    cases = _cases()
    for name, f in (("atan2", dmath.atan2), ("hypot", dmath.hypot)):
        for a, b, want in cases[name]:
            assert _hex(f(_from_hex(a), _from_hex(b))) == want, (name, a, b)
    for row in cases["hypotN"]:
        assert _hex(dmath.hypot_n([_from_hex(h) for h in row[:-1]])) == row[-1], row


def _fin(lo: float, hi: float) -> st.SearchStrategy[float]:
    return st.floats(min_value=lo, max_value=hi, allow_nan=False, allow_infinity=False)


@settings(max_examples=3000, deadline=None, derandomize=True)
@given(_fin(-1e9, 1e9), _fin(-1e6, 1e6), _fin(-1, 1), _fin(-745, 709), _fin(5e-324, 1e308))
def test_a_lo_mas_un_ulp_de_la_libm(
    big: float, mid: float, unit: float, e: float, pos: float
) -> None:
    assert _ulps(dmath.sin(big), math.sin(big)) <= 1
    assert _ulps(dmath.cos(big), math.cos(big)) <= 1
    assert _ulps(dmath.tan(mid), math.tan(mid)) <= 1
    assert _ulps(dmath.atan(big), math.atan(big)) <= 1
    assert _ulps(dmath.acos(unit), math.acos(unit)) <= 1
    assert _ulps(dmath.exp(e), math.exp(e)) <= 1
    assert _ulps(dmath.log(pos), math.log(pos)) <= 1
    assert _ulps(dmath.atan2(mid, big), math.atan2(mid, big)) <= 1
    # El algoritmo de V8 (escala por el máximo) no redondea correctamente como `math.hypot` de
    # CPython: hasta 2 ulp. La igualdad que importa es con TS, bit a bit (prueba de arriba).
    assert _ulps(dmath.hypot(mid, big), math.hypot(mid, big)) <= 2


def test_random_es_el_de_cpython_salvo_gauss_determinista() -> None:
    a, b = dmath.Random(7), random.Random(7)
    assert [a.random() for _ in range(5)] == [b.random() for _ in range(5)]
    assert a.uniform(1.0, 3.0) == b.uniform(1.0, 3.0)
    assert a.randint(0, 100) == b.randint(0, 100)
    g = [dmath.Random(11).gauss(2.0, 0.5) for _ in range(2)]
    assert g[0] == g[1]
    r = dmath.Random(11)
    first, second = r.gauss(), r.gauss()  # Box–Muller: el segundo es el guardado
    u = dmath.Random(11)
    x2pi = u.random() * 2.0 * math.pi
    g2rad = math.sqrt(-2.0 * dmath.log(1.0 - u.random()))
    assert (first, second) == (dmath.cos(x2pi) * g2rad, dmath.sin(x2pi) * g2rad)


# --- Guardia (como la regla de ESLint del ADR 0029) -----------------------------------------------

PROHIBIDAS = {
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "asinh",
    "acosh", "atanh", "exp", "exp2", "expm1", "log", "log2", "log10", "log1p", "pow", "hypot",
    "dist", "cbrt", "erf", "erfc", "gamma", "lgamma",
}  # fmt: skip


def _int_pow(node: ast.BinOp) -> bool:
    """`**` entre literales enteros (por ejemplo, `2**40`): aritmética entera exacta."""
    return all(
        isinstance(x, ast.Constant) and type(x.value) is int for x in (node.left, node.right)
    )


def _violaciones(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out: list[str] = []
    for node in ast.walk(tree):
        where = f"{path.name}:{getattr(node, 'lineno', 0)}"
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            mod, attr = node.value.id, node.attr
            if mod in {"math", "np", "numpy", "cmath"} and attr in PROHIBIDAS:
                out.append(f"{where}: {mod}.{attr}")
        if isinstance(node, ast.ImportFrom) and node.module in {"math", "cmath", "numpy"}:
            names = {a.name for a in node.names} & PROHIBIDAS
            if names:
                out.append(f"{where}: from {node.module} import {sorted(names)}")
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow) and not _int_pow(node):
            out.append(f"{where}: ** (usa productos o dmath; `**` usa la pow de la libm)")
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "random"
        ):
            out.append(f"{where}: random.{node.func.attr}() (usa dmath.Random)")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "pow":
            out.append(f"{where}: pow()")
    return out


def test_el_solver_no_usa_la_libm_del_sistema() -> None:
    """Fuera de `dmath.py`, el solver no llama funciones de `math` (ni `**` ni `pow`) que dependan
    de la libm; `math.sqrt` es exacta y se permite."""
    files = sorted(p for p in SOLVER.glob("*.py") if p.name != "dmath.py")
    assert files
    found = [v for p in files for v in _violaciones(p)]
    assert found == []


def test_la_guardia_detecta_lo_prohibido(tmp_path: Path) -> None:
    src = tmp_path / "x.py"
    src.write_text(
        "import math, random\na = math.sin(1.0)\nb = 2.0 ** 0.5\nr = random.Random(1)\n",
        encoding="utf-8",
    )
    assert len(_violaciones(src)) == 3
