"""Funciones trascendentes deterministas: port de `packages/solver-ts/src/dmath.ts` (fdlibm 5.3).

`math.sin`, `cos`, `tan`, `atan`, `atan2`, `acos`, `exp`, `log`, `hypot` y `pow` vienen de la libm
del sistema (MSVC en Windows, glibc en Linux) y pueden diferir en el último bit entre sistemas y
contra el solver TS. Cerca del reposo la física amplifica ese bit (ADR 0065). Aquí todo es
aritmética IEEE 754 de doble precisión (suma, resta, producto, división y `math.sqrt`, que es
exacta) y manejo de bits con `struct`, en el mismo orden que el port TS: el resultado es el mismo,
bit a bit, en cualquier sistema y en TS. Error < 1 ulp, como fdlibm.

`Random` es `random.Random` con `gauss` sobre estas funciones (la de CPython usa la libm).

====================================================
Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.

Developed at SunSoft, a Sun Microsystems, Inc. business.
Permission to use, copy, modify, and distribute this
software is freely granted, provided that this notice
is preserved.
====================================================
"""

from __future__ import annotations

import math
import random
import struct
from collections.abc import Iterable

_D = struct.Struct("<d")
_Q = struct.Struct("<Q")
_II = struct.Struct("<Ii")  # palabra baja sin signo, alta con signo
_INF = float("inf")
_NAN = float("nan")


def _high_word(x: float) -> int:
    """Palabra alta con signo (int32), como `Int32Array` en TS."""
    return _II.unpack(_D.pack(x))[1]


def _low_word(x: float) -> int:
    """Palabra baja sin signo (uint32)."""
    return _II.unpack(_D.pack(x))[0]


def _from_words(hi: int, lo: int) -> float:
    return _D.unpack(_Q.pack(((hi & 0xFFFFFFFF) << 32) | (lo & 0xFFFFFFFF)))[0]


def _with_low_word(x: float, lo: int) -> float:
    return _from_words(_high_word(x), lo)


# Umbrales de la palabra alta como valores: para |x| ≥ 0, ix < H ⟺ |x| < from_words(H, 0), porque
# los patrones de bits de los dobles no negativos tienen el mismo orden que sus valores.
_HW_3E400000 = _from_words(0x3E400000, 0)
_HW_3FD33333 = _from_words(0x3FD33333, 0)
_HW_3FE90001 = _from_words(0x3FE90001, 0)
_HW_3FE921FC = _from_words(0x3FE921FC, 0)


# --- Reducción de argumento: x − n·π/2 ------------------------------------------------------------

_TWO_OVER_PI = (
    0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163,
    0xABDEBB, 0xC561B7, 0x246E3A, 0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129,
    0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C, 0x7026B4, 0x5F7E41, 0x3991D6, 0x398353, 0x39F49C,
    0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D, 0x367ECF,
    0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7, 0x8A5292,
    0xEA6BFB, 0x5FB11F, 0x8D5D08, 0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3,
    0x91615E, 0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880, 0x4D7327, 0x310606, 0x1556CA,
    0x73A8C9, 0x60E27B, 0xC08C6B,
)  # fmt: skip

_PIO2 = (
    1.57079625129699707031,
    7.54978941586159635335e-8,
    5.39030252995776476554e-15,
    3.28200341580791294123e-22,
    1.27065575308067607349e-29,
    1.22933308981111328932e-36,
    2.73370053816464559624e-44,
    2.16741683877804819444e-51,
)

_TWO24 = 1.6777216e7
_TWON24 = 5.9604644775390625e-8


def _kernel_rem_pio2(x: list[float], y: list[float], e0: int, nx: int, prec: int) -> int:
    """`__kernel_rem_pio2` de fdlibm: x (en trozos de 24 bits) − n·π/2 para argumentos enormes."""
    jk = (2, 3, 4, 6)[prec]
    jp = jk
    jx = nx - 1
    jv = int((e0 - 3) / 24)
    jv = max(jv, 0)
    q0 = e0 - 24 * (jv + 1)
    f = [0.0] * 20
    q = [0.0] * 20
    fq = [0.0] * 20
    iq = [0] * 20
    j = jv - jx
    m = jx + jk
    for i in range(m + 1):
        f[i] = 0.0 if j < 0 else float(_TWO_OVER_PI[j])
        j += 1
    for i in range(jk + 1):
        fw = 0.0
        for jj in range(jx + 1):
            fw += x[jj] * f[jx + i - jj]
        q[i] = fw
    jz = jk
    while True:
        i = 0
        j = jz
        z = q[jz]
        while j > 0:
            fw = float(math.trunc(_TWON24 * z))
            iq[i] = math.trunc(z - _TWO24 * fw)
            z = q[j - 1] + fw
            i += 1
            j -= 1
        z = _scalbn(z, q0)
        z -= 8.0 * math.floor(z * 0.125)
        n = math.trunc(z)
        z -= n
        ih = 0
        if q0 > 0:
            i = iq[jz - 1] >> (24 - q0)
            n += i
            iq[jz - 1] -= i << (24 - q0)
            ih = iq[jz - 1] >> (23 - q0)
        elif q0 == 0:
            ih = iq[jz - 1] >> 23
        elif z >= 0.5:
            ih = 2
        if ih > 0:
            n += 1
            carry = 0
            for i in range(jz):
                jj = iq[i]
                if carry == 0:
                    if jj != 0:
                        carry = 1
                        iq[i] = 0x1000000 - jj
                else:
                    iq[i] = 0xFFFFFF - jj
            if q0 > 0:
                if q0 == 1:
                    iq[jz - 1] &= 0x7FFFFF
                elif q0 == 2:
                    iq[jz - 1] &= 0x3FFFFF
            if ih == 2:
                z = 1.0 - z
                if carry != 0:
                    z -= _scalbn(1.0, q0)
        if z == 0:
            jj = 0
            for i in range(jz - 1, jk - 1, -1):
                jj |= iq[i]
            if jj == 0:
                k = 1
                while iq[jk - k] == 0:
                    k += 1
                for i in range(jz + 1, jz + k + 1):
                    f[jx + i] = float(_TWO_OVER_PI[jv + i])
                    fw = 0.0
                    for jjj in range(jx + 1):
                        fw += x[jjj] * f[jx + i - jjj]
                    q[i] = fw
                jz += k
                continue
        break
    if z == 0:
        jz -= 1
        q0 -= 24
        while iq[jz] == 0:
            jz -= 1
            q0 -= 24
    else:
        z = _scalbn(z, -q0)
        if z >= _TWO24:
            fw = float(math.trunc(_TWON24 * z))
            iq[jz] = math.trunc(z - _TWO24 * fw)
            jz += 1
            q0 += 24
            iq[jz] = math.trunc(fw)
        else:
            iq[jz] = math.trunc(z)
    fw = _scalbn(1.0, q0)
    for i in range(jz, -1, -1):
        q[i] = fw * iq[i]
        fw *= _TWON24
    for i in range(jz, -1, -1):
        fw = 0.0
        k = 0
        while k <= jp and k <= jz - i:
            fw += _PIO2[k] * q[i + k]
            k += 1
        fq[jz - i] = fw
    # prec 2 (doble precisión con cola): y[0], y[1].
    fw = 0.0
    for i in range(jz, -1, -1):
        fw += fq[i]
    y[0] = fw if ih == 0 else -fw
    fw = fq[0] - fw
    for i in range(1, jz + 1):
        fw += fq[i]
    y[1] = fw if ih == 0 else -fw
    return n & 7


def _scalbn(x: float, n: int) -> float:
    """x · 2ⁿ exacto (como `scalbn` de fdlibm, para los rangos que usa la reducción)."""
    r = x
    k = n
    while k > 1023:
        r *= 8.98846567431158e307  # 2^1023
        k -= 1023
    while k < -1022:
        r *= 2.2250738585072014e-308  # 2^-1022
        k += 1022
    return r * _from_words((k + 1023) << 20, 0)


_INVPIO2 = 6.36619772367581382433e-1
_PIO2_1 = 1.57079632673412561417
_PIO2_1T = 6.07710050650619224932e-11
_PIO2_2 = 6.0771005063039659766e-11
_PIO2_2T = 2.02226624879595063154e-21
_PIO2_3 = 2.0222662487111664558e-21
_PIO2_3T = 8.47842766036889956997e-32
_NPIO2_HW = (
    0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB,
    0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB,
    0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
    0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB,
)  # fmt: skip


def _rem_pio2(x: float) -> tuple[int, float, float]:
    """`__ieee754_rem_pio2`: (n, y0, y1) con y0 + y1 = x − n·π/2 y |y0| ≤ π/4."""
    hx = _high_word(x)
    ix = hx & 0x7FFFFFFF
    if ix <= 0x3FE921FB:
        return 0, x, 0.0
    if ix < 0x4002D97C:
        # |x| < 3π/4: n = ±1
        if hx > 0:
            z = x - _PIO2_1
            if ix != 0x3FF921FB:
                y0 = z - _PIO2_1T
                return 1, y0, z - y0 - _PIO2_1T
            z -= _PIO2_2
            y0 = z - _PIO2_2T
            return 1, y0, z - y0 - _PIO2_2T
        z = x + _PIO2_1
        if ix != 0x3FF921FB:
            y0 = z + _PIO2_1T
            return -1, y0, z - y0 + _PIO2_1T
        z += _PIO2_2
        y0 = z + _PIO2_2T
        return -1, y0, z - y0 + _PIO2_2T
    if ix <= 0x413921FB:
        # |x| ≤ 2^19·(π/2): reducción media (Cody–Waite en tres partes)
        t = abs(x)
        n = math.trunc(t * _INVPIO2 + 0.5)
        fn = float(n)
        r = t - fn * _PIO2_1
        w = fn * _PIO2_1T
        if n < 32 and ix != _NPIO2_HW[n - 1]:
            y0 = r - w
        else:
            jj = ix >> 20
            y0 = r - w
            i = jj - ((_high_word(y0) >> 20) & 0x7FF)
            if i > 16:
                tt = r
                w = fn * _PIO2_2
                r = tt - w
                w = fn * _PIO2_2T - (tt - r - w)
                y0 = r - w
                i = jj - ((_high_word(y0) >> 20) & 0x7FF)
                if i > 49:
                    tt = r
                    w = fn * _PIO2_3
                    r = tt - w
                    w = fn * _PIO2_3T - (tt - r - w)
                    y0 = r - w
        y1 = r - y0 - w
        if hx < 0:
            return -n, -y0, -y1
        return n, y0, y1
    if ix >= 0x7FF00000:
        y0 = x - x
        return 0, y0, y0
    # Argumentos enormes: 2/π con todos los bits que hagan falta.
    e0 = (ix >> 20) - 1046
    z = _from_words(ix - (e0 << 20), _low_word(x))
    tx = [0.0, 0.0, 0.0]
    for i in range(2):
        tx[i] = float(math.trunc(z))
        z = (z - tx[i]) * _TWO24
    tx[2] = z
    nx = 3
    while tx[nx - 1] == 0:
        nx -= 1
    huge = [0.0, 0.0]
    n = _kernel_rem_pio2(tx, huge, e0, nx, 2)
    if hx < 0:
        return -n, -huge[0], -huge[1]
    return n, huge[0], huge[1]


# --- Núcleos de seno, coseno y tangente en [−π/4, π/4] --------------------------------------------

_S1 = -1.66666666666666324348e-1
_S2 = 8.33333333332248946124e-3
_S3 = -1.98412698298579493134e-4
_S4 = 2.75573137070700676789e-6
_S5 = -2.50507602534068634195e-8
_S6 = 1.58969099521155010221e-10


def _kernel_sin(x: float, y: float, iy: int) -> float:
    if abs(x) < _HW_3E400000:  # ix < 0x3e400000 (y entonces trunc(x) = 0)
        return x
    z = x * x
    v = z * x
    r = _S2 + z * (_S3 + z * (_S4 + z * (_S5 + z * _S6)))
    if iy == 0:
        return x + v * (_S1 + z * r)
    return x - (z * (0.5 * y - v * r) - y - v * _S1)


_C1 = 4.16666666666666019037e-2
_C2 = -1.38888888888741095749e-3
_C3 = 2.48015872894767294178e-5
_C4 = -2.75573143513906633035e-7
_C5 = 2.0875723212981748279e-9
_C6 = -1.13596475577881948265e-11


def _kernel_cos(x: float, y: float) -> float:
    ax = abs(x)
    if ax < _HW_3E400000:  # ix < 0x3e400000
        return 1.0
    z = x * x
    r = z * (_C1 + z * (_C2 + z * (_C3 + z * (_C4 + z * (_C5 + z * _C6)))))
    if ax < _HW_3FD33333:  # ix < 0x3fd33333
        return 1.0 - (0.5 * z - (z * r - x * y))
    # ix > 0x3fe90000 ⟺ |x| ≥ from_words(0x3fe90001, 0)
    big = ax >= _HW_3FE90001
    qx = 0.28125 if big else _from_words((_high_word(x) & 0x7FFFFFFF) - 0x00200000, 0)
    hz = 0.5 * z - qx
    a = 1.0 - qx
    return a - (hz - (z * r - x * y))


_T = (
    3.33333333333334091986e-1,
    1.33333333333201242699e-1,
    5.39682539762260521377e-2,
    2.18694882948595424599e-2,
    8.86323982359930005737e-3,
    3.59207910759131235356e-3,
    1.45620945432529025516e-3,
    5.88041240820264096874e-4,
    2.46463134818469906812e-4,
    7.817944429395570923e-5,
    7.14072491382608190305e-5,
    -1.85586374855275456654e-5,
    2.59073051863633712884e-5,
)
_PIO4 = 7.85398163397448278999e-1
_PIO4LO = 3.06161699786838301793e-17


def _kernel_tan(x_in: float, y_in: float, iy: int) -> float:
    """`__kernel_tan` de fdlibm (con la corrección de 2004 para |x| cerca de π/4)."""
    x = x_in
    y = y_in
    hx = _high_word(x)
    ix = hx & 0x7FFFFFFF
    if ix < 0x3E300000 and math.trunc(x) == 0:
        if ix == 0 and _low_word(x) == 0 and iy + 1 == 0:
            return 1 / abs(x)
        if iy == 1:
            return x
        w = x + y
        z = _with_low_word(w, 0)
        v = y - (z - x)
        a = -1.0 / w
        t = _with_low_word(a, 0)
        s = 1.0 + t * z
        return t + a * (s + t * v)
    if ix >= 0x3FE59428:
        if hx < 0:
            x = -x
            y = -y
        z = _PIO4 - x
        w = _PIO4LO - y
        x = z + w
        y = 0.0
    z = x * x
    w = z * z
    r = _T[1] + w * (_T[3] + w * (_T[5] + w * (_T[7] + w * (_T[9] + w * _T[11]))))
    v = z * (_T[2] + w * (_T[4] + w * (_T[6] + w * (_T[8] + w * (_T[10] + w * _T[12])))))
    s = z * x
    r = y + z * (s * (r + v) + y)
    r += _T[0] * s
    w = x + r
    if ix >= 0x3FE59428:
        v = float(iy)
        return (1 - ((hx >> 30) & 2)) * (v - 2.0 * (x - ((w * w) / (w + v) - r)))
    if iy == 1:
        return w
    z = _with_low_word(w, 0)
    v = r - (z - x)
    a = -1.0 / w
    t = _with_low_word(a, 0)
    s = 1.0 + t * z
    return t + a * (s + t * v)


def sin(x: float) -> float:
    """Seno determinista (fdlibm)."""
    ax = abs(x)
    if ax < _HW_3FE921FC:  # ix <= 0x3fe921fb
        return _kernel_sin(x, 0.0, 0)
    if not ax < _INF:  # ix >= 0x7ff00000: ∞ o NaN
        return x - x
    n, y0, y1 = _rem_pio2(x)
    q = n & 3
    if q == 0:
        return _kernel_sin(y0, y1, 1)
    if q == 1:
        return _kernel_cos(y0, y1)
    if q == 2:
        return -_kernel_sin(y0, y1, 1)
    return -_kernel_cos(y0, y1)


def cos(x: float) -> float:
    """Coseno determinista (fdlibm)."""
    ax = abs(x)
    if ax < _HW_3FE921FC:  # ix <= 0x3fe921fb
        return _kernel_cos(x, 0.0)
    if not ax < _INF:  # ix >= 0x7ff00000: ∞ o NaN
        return x - x
    n, y0, y1 = _rem_pio2(x)
    q = n & 3
    if q == 0:
        return _kernel_cos(y0, y1)
    if q == 1:
        return -_kernel_sin(y0, y1, 1)
    if q == 2:
        return -_kernel_cos(y0, y1)
    return _kernel_sin(y0, y1, 1)


def tan(x: float) -> float:
    """Tangente determinista (fdlibm)."""
    ix = _high_word(x) & 0x7FFFFFFF
    if ix <= 0x3FE921FB:
        return _kernel_tan(x, 0.0, 1)
    if ix >= 0x7FF00000:
        return x - x
    n, y0, y1 = _rem_pio2(x)
    return _kernel_tan(y0, y1, 1 - ((n & 1) << 1))


# --- Arco tangente --------------------------------------------------------------------------------

_ATANHI = (
    4.63647609000806093515e-1,
    7.85398163397448278999e-1,
    9.82793723247329054082e-1,
    1.570796326794896558,
)
_ATANLO = (
    2.26987774529616870924e-17,
    3.06161699786838301793e-17,
    1.39033110312309984516e-17,
    6.12323399573676603587e-17,
)
_AT = (
    3.33333333333329318027e-1,
    -1.99999999998764832476e-1,
    1.42857142725034663711e-1,
    -1.1111110405462355788e-1,
    9.09088713343650656196e-2,
    -7.69187620504482999495e-2,
    6.66107313738753120669e-2,
    -5.83357013379057348645e-2,
    4.97687799461593236017e-2,
    -3.6531572744216915527e-2,
    1.62858201153657823623e-2,
)


def atan(x_in: float) -> float:
    """Arco tangente determinista (fdlibm)."""
    x = x_in
    hx = _high_word(x)
    ix = hx & 0x7FFFFFFF
    if ix >= 0x44100000:
        # |x| ≥ 2^66
        if ix > 0x7FF00000 or (ix == 0x7FF00000 and _low_word(x) != 0):
            return x + x
        return _ATANHI[3] + _ATANLO[3] if hx > 0 else -_ATANHI[3] - _ATANLO[3]
    if ix < 0x3FDC0000:
        # |x| < 0.4375
        if ix < 0x3E200000:
            return x  # |x| < 2^-29
        idx = -1
    else:
        x = abs(x)
        if ix < 0x3FF30000:
            if ix < 0x3FE60000:
                idx = 0
                x = (2.0 * x - 1.0) / (2.0 + x)
            else:
                idx = 1
                x = (x - 1.0) / (x + 1.0)
        elif ix < 0x40038000:
            idx = 2
            x = (x - 1.5) / (1.0 + 1.5 * x)
        else:
            idx = 3
            x = -1.0 / x
    z = x * x
    w = z * z
    s1 = z * (_AT[0] + w * (_AT[2] + w * (_AT[4] + w * (_AT[6] + w * (_AT[8] + w * _AT[10])))))
    s2 = w * (_AT[1] + w * (_AT[3] + w * (_AT[5] + w * (_AT[7] + w * _AT[9]))))
    if idx < 0:
        return x - x * (s1 + s2)
    zz = _ATANHI[idx] - (x * (s1 + s2) - _ATANLO[idx] - x)
    return -zz if hx < 0 else zz


_PI = 3.141592653589793116
_PI_O_2 = 1.570796326794896558
_PI_O_4 = 7.85398163397448279e-1
_PI_LO = 1.2246467991473532e-16


def atan2(y: float, x: float) -> float:
    """Arco tangente de y/x en (−π, π] (fdlibm)."""
    hx = _high_word(x)
    ix = hx & 0x7FFFFFFF
    lx = _low_word(x)
    hy = _high_word(y)
    iy = hy & 0x7FFFFFFF
    ly = _low_word(y)
    if (ix | (1 if lx != 0 else 0)) > 0x7FF00000 or (iy | (1 if ly != 0 else 0)) > 0x7FF00000:
        return x + y  # NaN
    if hx == 0x3FF00000 and lx == 0:
        return atan(y)  # x = 1
    m = ((hy >> 31) & 1) | ((hx >> 30) & 2)
    if iy == 0 and ly == 0:
        if m in (0, 1):
            return y
        return _PI if m == 2 else -_PI
    if ix == 0 and lx == 0:
        return -_PI_O_2 if hy < 0 else _PI_O_2
    if ix == 0x7FF00000:
        if iy == 0x7FF00000:
            return (_PI_O_4, -_PI_O_4, 3.0 * _PI_O_4, -3.0 * _PI_O_4)[m]
        return (0.0, -0.0, _PI, -_PI)[m]
    if iy == 0x7FF00000:
        return -_PI_O_2 if hy < 0 else _PI_O_2
    k = (iy - ix) >> 20
    if k > 60:
        z = _PI_O_2 + 0.5 * _PI_LO
    elif hx < 0 and k < -60:
        z = 0.0
    else:
        z = atan(abs(y / x))
    if m == 0:
        return z
    if m == 1:
        return -z
    if m == 2:
        return _PI - (z - _PI_LO)
    return z - _PI_LO - _PI


# --- Arco coseno ----------------------------------------------------------------------------------

_PIO2_HI = 1.5707963267948966
_PIO2_LO = 6.123233995736766e-17
_PS0 = 1.66666666666666657415e-1
_PS1 = -3.25565818622400915405e-1
_PS2 = 2.01212532134862925881e-1
_PS3 = -4.00555345006794114027e-2
_PS4 = 7.91534994289814532176e-4
_PS5 = 3.4793310759602116757e-5
_QS1 = -2.40339491173441421878
_QS2 = 2.02094576023350569471
_QS3 = -6.8828397160545329303e-1
_QS4 = 7.70381505559019352791e-2


def acos(x: float) -> float:
    """Arco coseno determinista (fdlibm `__ieee754_acos`)."""
    hx = _high_word(x)
    ix = hx & 0x7FFFFFFF
    if ix >= 0x3FF00000:
        # |x| ≥ 1
        if ix == 0x3FF00000 and _low_word(x) == 0:
            return 0.0 if hx > 0 else _PI + 2.0 * _PIO2_LO
        return _NAN
    if ix < 0x3FE00000:
        # |x| < 0.5
        if ix <= 0x3C600000:
            return _PIO2_HI + _PIO2_LO  # |x| < 2^-57
        z = x * x
        p = z * (_PS0 + z * (_PS1 + z * (_PS2 + z * (_PS3 + z * (_PS4 + z * _PS5)))))
        q = 1.0 + z * (_QS1 + z * (_QS2 + z * (_QS3 + z * _QS4)))
        r = p / q
        return _PIO2_HI - (x - (_PIO2_LO - x * r))
    if hx < 0:
        # x < −0.5
        z = (1.0 + x) * 0.5
        p = z * (_PS0 + z * (_PS1 + z * (_PS2 + z * (_PS3 + z * (_PS4 + z * _PS5)))))
        q = 1.0 + z * (_QS1 + z * (_QS2 + z * (_QS3 + z * _QS4)))
        s = math.sqrt(z)
        r = p / q
        w = r * s - _PIO2_LO
        return _PI - 2.0 * (s + w)
    # x > 0.5
    z = (1.0 - x) * 0.5
    s = math.sqrt(z)
    df = _with_low_word(s, 0)
    c = (z - df * df) / (s + df)
    p = z * (_PS0 + z * (_PS1 + z * (_PS2 + z * (_PS3 + z * (_PS4 + z * _PS5)))))
    q = 1.0 + z * (_QS1 + z * (_QS2 + z * (_QS3 + z * _QS4)))
    r = p / q
    w = r * s + c
    return 2.0 * (df + w)


# --- Exponencial y logaritmo ----------------------------------------------------------------------

_LN2_HI = (6.9314718036912381649e-1, -6.9314718036912381649e-1)
_LN2_LO = (1.90821492927058770002e-10, -1.90821492927058770002e-10)
_INVLN2 = 1.442695040888963387
_P1 = 1.66666666666666019037e-1
_P2 = -2.77777777770155933842e-3
_P3 = 6.61375632143793436117e-5
_P4 = -1.6533902205465251539e-6
_P5 = 4.13813679705723846039e-8
_O_THRESHOLD = 7.09782712893383973096e2
_U_THRESHOLD = -7.4513321910194110842e2


def exp(x_in: float) -> float:
    """Exponencial determinista (fdlibm)."""
    x = x_in
    hx = _high_word(x)
    xsb = (hx >> 31) & 1
    hx &= 0x7FFFFFFF
    if hx >= 0x40862E42:
        # |x| ≥ 709.78
        if hx >= 0x7FF00000:
            if (hx & 0xFFFFF) != 0 or _low_word(x) != 0:
                return x + x  # NaN
            return x if xsb == 0 else 0.0  # exp(±∞)
        if x > _O_THRESHOLD:
            return _INF
        if x < _U_THRESHOLD:
            return 0.0
    hi = 0.0
    lo = 0.0
    k = 0
    if hx > 0x3FD62E42:
        # |x| > 0.5·ln2
        if hx < 0x3FF0A2B2:
            # Como V8: fdlibm erra el último bit de e = exp(1) y se devuelve el valor exacto.
            if x == 1.0:
                return math.e
            hi = x - _LN2_HI[xsb]
            lo = _LN2_LO[xsb]
            k = 1 - xsb - xsb
        else:
            k = math.trunc(_INVLN2 * x + (0.5 if xsb == 0 else -0.5))
            hi = x - k * _LN2_HI[0]
            lo = k * _LN2_LO[0]
        x = hi - lo
    elif hx < 0x3E300000 and 1.0e300 + x > 1.0:
        # |x| < 2^-28
        return 1.0 + x
    t = x * x
    c = x - t * (_P1 + t * (_P2 + t * (_P3 + t * (_P4 + t * _P5))))
    if k == 0:
        return 1.0 - ((x * c) / (c - 2.0) - x)
    y = 1.0 - (lo - (x * c) / (2.0 - c) - hi)
    if k >= -1021:
        return _from_words(_high_word(y) + (k << 20), _low_word(y))
    return (
        _from_words(_high_word(y) + ((k + 1000) << 20), _low_word(y)) * 9.3326361850321887899e-302
    )  # 2^-1000


_LG1 = 6.66666666666673513e-1
_LG2 = 3.999999999940941908e-1
_LG3 = 2.857142874366239149e-1
_LG4 = 2.222219843214978396e-1
_LG5 = 1.818357216161805012e-1
_LG6 = 1.531383769920937332e-1
_LG7 = 1.479819860511658591e-1
_TWO54 = 1.8014398509481984e16
_LN2HI = 6.9314718036912381649e-1
_LN2LO = 1.90821492927058770002e-10


def log(x_in: float) -> float:
    """Logaritmo natural determinista (fdlibm)."""
    x = x_in
    hx = _high_word(x)
    lx = _low_word(x)
    k = 0
    if hx < 0x00100000:
        # x < 2^-1022
        if (hx & 0x7FFFFFFF) == 0 and lx == 0:
            return -_INF
        if hx < 0:
            return _NAN
        k -= 54
        x *= _TWO54
        hx = _high_word(x)
    if hx >= 0x7FF00000:
        return x + x
    k += (hx >> 20) - 1023
    hx &= 0x000FFFFF
    i = (hx + 0x95F64) & 0x100000
    x = _from_words(hx | (i ^ 0x3FF00000), _low_word(x))
    k += i >> 20
    f = x - 1.0
    if (0x000FFFFF & (2 + hx)) < 3:
        # |f| < 2^-20
        if f == 0:
            return 0.0 if k == 0 else k * _LN2HI + k * _LN2LO
        rr = f * f * (0.5 - 0.3333333333333333 * f)
        return f - rr if k == 0 else k * _LN2HI - (rr - k * _LN2LO - f)
    s = f / (2.0 + f)
    dk = float(k)
    z = s * s
    ii = hx - 0x6147A
    w = z * z
    j = 0x6B851 - hx
    t1 = w * (_LG2 + w * (_LG4 + w * _LG6))
    t2 = z * (_LG1 + w * (_LG3 + w * (_LG5 + w * _LG7)))
    ii |= j
    rr = t2 + t1
    if ii > 0:
        hfsq = 0.5 * f * f
        if k == 0:
            return f - (hfsq - s * (hfsq + rr))
        return dk * _LN2HI - (hfsq - (s * (hfsq + rr) + dk * _LN2LO) - f)
    if k == 0:
        return f - s * (f - rr)
    return dk * _LN2HI - (s * (f - rr) - dk * _LN2LO - f)


# --- Potencias de dos -----------------------------------------------------------------------------


def pow2(k: int) -> float:
    """2^k exacto, armado con los bits del exponente (sin `**`, que usa la `pow` de la libm)."""
    if type(k) is not int:
        msg = f"pow2 espera un entero, recibió {k}"
        raise TypeError(msg)
    if -1022 <= k <= 1023:
        return _from_words((k + 1023) << 20, 0)
    return _scalbn(1.0, k)


# --- Hipotenusa -----------------------------------------------------------------------------------


def hypot(x: float, y: float) -> float:
    """√(x² + y²) determinista: el algoritmo de `Math.hypot` de V8 (escalar por el máximo; con dos
    argumentos la compensación de Kahan del primer paso es cero), como `dmath.hypot` de TS."""
    a = abs(x)
    b = abs(y)
    if a == _INF or b == _INF:
        return _INF
    if a != a or b != b:
        return _NAN
    mx = a if a >= b else b
    if mx == 0:
        return 0.0
    na = a / mx
    nb = b / mx
    return math.sqrt(na * na + nb * nb) * mx


def hypot_n(values: Iterable[float]) -> float:
    """Hipotenusa de n valores con el algoritmo de V8 (máximo, escala y suma de Kahan en el orden
    dado), como `dmath.hypotN` de TS."""
    vals = list(values)
    mx = 0.0
    nan = False
    for v in vals:
        a = abs(v)
        if a != a:
            nan = True
        elif a > mx:
            mx = a
    if mx == _INF:
        return _INF
    if nan:
        return _NAN
    if mx == 0:
        return 0.0
    total = 0.0
    compensation = 0.0
    for v in vals:
        n = abs(v) / mx
        summand = n * n - compensation
        preliminary = total + summand
        compensation = preliminary - total - summand
        total = preliminary
    return math.sqrt(total) * mx


# --- Generador con gauss determinista -------------------------------------------------------------

_TWOPI = 2.0 * math.pi


class Random(random.Random):
    """`random.Random` (Mersenne Twister, el mismo de CPython y de `PyRandom` en TS) con `gauss`
    sobre `log`, `cos` y `sin` de este módulo: la de CPython usa la libm del sistema."""

    def gauss(self, mu: float = 0.0, sigma: float = 1.0) -> float:
        z = self.gauss_next
        self.gauss_next = None
        if z is None:
            x2pi = self.random() * _TWOPI
            g2rad = math.sqrt(-2.0 * log(1.0 - self.random()))
            z = cos(x2pi) * g2rad
            self.gauss_next = sin(x2pi) * g2rad
        return mu + z * sigma


__all__ = [
    "Random",
    "acos",
    "atan",
    "atan2",
    "cos",
    "exp",
    "hypot",
    "hypot_n",
    "log",
    "pow2",
    "sin",
    "tan",
]
