/**
 * Funciones trascendentes deterministas (E8, ADR 0029): port a TypeScript de fdlibm 5.3.
 *
 * El estándar de JavaScript deja a cada motor la precisión de `Math.sin`, `cos`, `tan`, `atan`,
 * `atan2`, `log`, `exp` y `hypot`; V8, SpiderMonkey y JavaScriptCore difieren en el último bit, y la
 * física lo arrastra hasta el sexto decimal del resultado. Aquí todo es aritmética IEEE 754 de doble
 * precisión (suma, resta, multiplicación, división y raíz, exactas en cualquier motor) y manejo de
 * bits con `DataView`, así que el resultado es el mismo en cualquier navegador. Error < 1 ulp, como
 * fdlibm.
 *
 * ====================================================
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *
 * Developed at SunSoft, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice
 * is preserved.
 * ====================================================
 */

// Palabras alta y baja de un double con arreglos tipados sobre el mismo buffer (más rápidos que
// DataView en los tres motores). El orden de bytes se detecta al cargar: el resultado no depende de
// la plataforma.
const f64 = new Float64Array(1);
const i32 = new Int32Array(f64.buffer);
const u32 = new Uint32Array(f64.buffer);
f64[0] = 1.0; // 0x3ff00000_00000000
const HI = i32[1] === 0x3ff00000 ? 1 : 0;
const LO = 1 - HI;

function highWord(x: number): number {
  f64[0] = x;
  return i32[HI]!;
}

function lowWord(x: number): number {
  f64[0] = x;
  return u32[LO]!;
}

function fromWords(hi: number, lo: number): number {
  i32[HI] = hi;
  u32[LO] = lo >>> 0;
  return f64[0]!;
}

function withLowWord(x: number, lo: number): number {
  return fromWords(highWord(x), lo);
}

// --- Reducción de argumento: x − n·π/2 -----------------------------------------------------------

/** Tabla de 2/π en trozos de 24 bits (para argumentos enormes). */
const TWO_OVER_PI = [
  0xa2f983, 0x6e4e44, 0x1529fc, 0x2757d1, 0xf534dd, 0xc0db62, 0x95993c, 0x439041, 0xfe5163,
  0xabdebb, 0xc561b7, 0x246e3a, 0x424dd2, 0xe00649, 0x2eea09, 0xd1921c, 0xfe1deb, 0x1cb129,
  0xa73ee8, 0x8235f5, 0x2ebb44, 0x84e99c, 0x7026b4, 0x5f7e41, 0x3991d6, 0x398353, 0x39f49c,
  0x845f8b, 0xbdf928, 0x3b1ff8, 0x97ffde, 0x05980f, 0xef2f11, 0x8b5a0a, 0x6d1f6d, 0x367ecf,
  0x27cb09, 0xb74f46, 0x3f669e, 0x5fea2d, 0x7527ba, 0xc7ebe5, 0xf17b3d, 0x0739f7, 0x8a5292,
  0xea6bfb, 0x5fb11f, 0x8d5d08, 0x560330, 0x46fc7b, 0x6babf0, 0xcfbc20, 0x9af436, 0x1da9e3,
  0x91615e, 0xe61b08, 0x659985, 0x5f14a0, 0x68408d, 0xffd880, 0x4d7327, 0x310606, 0x1556ca,
  0x73a8c9, 0x60e27b, 0xc08c6b,
];

const PIO2 = [
  1.57079625129699707031, 7.54978941586159635335e-8, 5.39030252995776476554e-15,
  3.28200341580791294123e-22, 1.27065575308067607349e-29, 1.22933308981111328932e-36,
  2.73370053816464559624e-44, 2.16741683877804819444e-51,
];

const TWO24 = 1.6777216e7;
const TWON24 = 5.9604644775390625e-8;

/** `__kernel_rem_pio2` de fdlibm: x (en trozos de 24 bits) − n·π/2 para argumentos enormes. */
function kernelRemPio2(x: number[], y: number[], e0: number, nx: number, prec: number): number {
  const initJk = [2, 3, 4, 6];
  const jk = initJk[prec]!;
  const jp = jk;
  const jx = nx - 1;
  let jv = Math.trunc((e0 - 3) / 24);
  if (jv < 0) jv = 0;
  let q0 = e0 - 24 * (jv + 1);
  const f: number[] = new Array<number>(20).fill(0);
  const q: number[] = new Array<number>(20).fill(0);
  const fq: number[] = new Array<number>(20).fill(0);
  const iq: number[] = new Array<number>(20).fill(0);
  let j = jv - jx;
  const m = jx + jk;
  for (let i = 0; i <= m; i++, j++) f[i] = j < 0 ? 0 : TWO_OVER_PI[j]!;
  for (let i = 0; i <= jk; i++) {
    let fw = 0;
    for (let jj = 0; jj <= jx; jj++) fw += x[jj]! * f[jx + i - jj]!;
    q[i] = fw;
  }
  let jz = jk;
  let n: number;
  let ih: number;
  let z: number;
  for (;;) {
    let i = 0;
    j = jz;
    z = q[jz]!;
    for (; j > 0; i++, j--) {
      const fw = Math.trunc(TWON24 * z);
      iq[i] = Math.trunc(z - TWO24 * fw);
      z = q[j - 1]! + fw;
    }
    z = scalbn(z, q0);
    z -= 8.0 * Math.floor(z * 0.125);
    n = Math.trunc(z);
    z -= n;
    ih = 0;
    if (q0 > 0) {
      i = iq[jz - 1]! >> (24 - q0);
      n += i;
      iq[jz - 1]! -= i << (24 - q0);
      ih = iq[jz - 1]! >> (23 - q0);
    } else if (q0 === 0) {
      ih = iq[jz - 1]! >> 23;
    } else if (z >= 0.5) {
      ih = 2;
    }
    if (ih > 0) {
      n += 1;
      let carry = 0;
      for (i = 0; i < jz; i++) {
        const jj = iq[i]!;
        if (carry === 0) {
          if (jj !== 0) {
            carry = 1;
            iq[i] = 0x1000000 - jj;
          }
        } else {
          iq[i] = 0xffffff - jj;
        }
      }
      if (q0 > 0) {
        if (q0 === 1) iq[jz - 1]! &= 0x7fffff;
        else if (q0 === 2) iq[jz - 1]! &= 0x3fffff;
      }
      if (ih === 2) {
        z = 1.0 - z;
        if (carry !== 0) z -= scalbn(1.0, q0);
      }
    }
    if (z === 0) {
      let jj = 0;
      for (i = jz - 1; i >= jk; i--) jj |= iq[i]!;
      if (jj === 0) {
        let k = 1;
        while (iq[jk - k] === 0) k++;
        for (i = jz + 1; i <= jz + k; i++) {
          f[jx + i] = TWO_OVER_PI[jv + i]!;
          let fw = 0;
          for (let jjj = 0; jjj <= jx; jjj++) fw += x[jjj]! * f[jx + i - jjj]!;
          q[i] = fw;
        }
        jz += k;
        continue;
      }
    }
    break;
  }
  if (z === 0) {
    jz -= 1;
    q0 -= 24;
    while (iq[jz] === 0) {
      jz--;
      q0 -= 24;
    }
  } else {
    z = scalbn(z, -q0);
    if (z >= TWO24) {
      const fw = Math.trunc(TWON24 * z);
      iq[jz] = Math.trunc(z - TWO24 * fw);
      jz += 1;
      q0 += 24;
      iq[jz] = fw;
    } else {
      iq[jz] = Math.trunc(z);
    }
  }
  let fw = scalbn(1.0, q0);
  for (let i = jz; i >= 0; i--) {
    q[i] = fw * iq[i]!;
    fw *= TWON24;
  }
  for (let i = jz; i >= 0; i--) {
    fw = 0;
    for (let k = 0; k <= jp && k <= jz - i; k++) fw += PIO2[k]! * q[i + k]!;
    fq[jz - i] = fw;
  }
  // prec 2 (doble precisión con cola): y[0], y[1].
  fw = 0;
  for (let i = jz; i >= 0; i--) fw += fq[i]!;
  y[0] = ih === 0 ? fw : -fw;
  fw = fq[0]! - fw;
  for (let i = 1; i <= jz; i++) fw += fq[i]!;
  y[1] = ih === 0 ? fw : -fw;
  return n & 7;
}

/** x · 2ⁿ exacto (como `scalbn` de fdlibm, para los rangos que usa la reducción). */
function scalbn(x: number, n: number): number {
  let r = x;
  let k = n;
  while (k > 1023) {
    r *= 8.98846567431158e307; // 2^1023
    k -= 1023;
  }
  while (k < -1022) {
    r *= 2.2250738585072014e-308; // 2^-1022
    k += 1022;
  }
  return r * fromWords((k + 1023) << 20, 0);
}

const INVPIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.0771005063039659766e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.0222662487111664558e-21;
const PIO2_3T = 8.47842766036889956997e-32;
const NPIO2_HW = [
  0x3ff921fb, 0x400921fb, 0x4012d97c, 0x401921fb, 0x401f6a7a, 0x4022d97c, 0x4025fdbb, 0x402921fb,
  0x402c463a, 0x402f6a7a, 0x4031475c, 0x4032d97c, 0x40346b9c, 0x4035fdbb, 0x40378fdb, 0x403921fb,
  0x403ab41b, 0x403c463a, 0x403dd85a, 0x403f6a7a, 0x40407e4c, 0x4041475c, 0x4042106c, 0x4042d97c,
  0x4043a28c, 0x40446b9c, 0x404534ac, 0x4045fdbb, 0x4046c6cb, 0x40478fdb, 0x404858eb, 0x404921fb,
];

/**
 * `__ieee754_rem_pio2`: ry[0] + ry[1] = x − n·π/2 con |ry[0]| ≤ π/4; devuelve n. Las dos partes van
 * en un Float64Array del módulo (doubles sin caja: más rápido en la ruta caliente).
 */
const ry = new Float64Array(2);
const hugeY = [0, 0];

function remPio2(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    ry[0] = x;
    ry[1] = 0;
    return 0;
  }
  if (ix < 0x4002d97c) {
    // |x| < 3π/4: n = ±1
    if (hx > 0) {
      let z = x - PIO2_1;
      if (ix !== 0x3ff921fb) {
        ry[0] = z - PIO2_1T;
        ry[1] = z - ry[0] - PIO2_1T;
      } else {
        z -= PIO2_2;
        ry[0] = z - PIO2_2T;
        ry[1] = z - ry[0] - PIO2_2T;
      }
      return 1;
    }
    let z = x + PIO2_1;
    if (ix !== 0x3ff921fb) {
      ry[0] = z + PIO2_1T;
      ry[1] = z - ry[0] + PIO2_1T;
    } else {
      z += PIO2_2;
      ry[0] = z + PIO2_2T;
      ry[1] = z - ry[0] + PIO2_2T;
    }
    return -1;
  }
  if (ix <= 0x413921fb) {
    // |x| ≤ 2^19·(π/2): reducción media (Cody–Waite en tres partes)
    const t = Math.abs(x);
    const n = Math.trunc(t * INVPIO2 + 0.5);
    const fn = n;
    let r = t - fn * PIO2_1;
    let w = fn * PIO2_1T;
    if (n < 32 && ix !== NPIO2_HW[n - 1]) {
      ry[0] = r - w;
    } else {
      const jj = ix >> 20;
      ry[0] = r - w;
      let i = jj - ((highWord(ry[0]) >> 20) & 0x7ff);
      if (i > 16) {
        let tt = r;
        w = fn * PIO2_2;
        r = tt - w;
        w = fn * PIO2_2T - (tt - r - w);
        ry[0] = r - w;
        i = jj - ((highWord(ry[0]) >> 20) & 0x7ff);
        if (i > 49) {
          tt = r;
          w = fn * PIO2_3;
          r = tt - w;
          w = fn * PIO2_3T - (tt - r - w);
          ry[0] = r - w;
        }
      }
    }
    ry[1] = r - ry[0] - w;
    if (hx < 0) {
      ry[0] = -ry[0];
      ry[1] = -ry[1];
      return -n;
    }
    return n;
  }
  if (ix >= 0x7ff00000) {
    ry[0] = x - x;
    ry[1] = ry[0]!;
    return 0;
  }
  // Argumentos enormes: 2/π con todos los bits que hagan falta.
  const e0 = (ix >> 20) - 1046;
  let z = fromWords(ix - (e0 << 20), lowWord(x));
  const tx = [0, 0, 0];
  for (let i = 0; i < 2; i++) {
    tx[i] = Math.trunc(z);
    z = (z - tx[i]!) * TWO24;
  }
  tx[2] = z;
  let nx = 3;
  while (tx[nx - 1] === 0) nx--;
  const n = kernelRemPio2(tx, hugeY, e0, nx, 2);
  ry[0] = hugeY[0]!;
  ry[1] = hugeY[1]!;
  if (hx < 0) {
    ry[0] = -ry[0];
    ry[1] = -ry[1];
    return -n;
  }
  return n;
}

// --- Núcleos de seno, coseno y tangente en [−π/4, π/4] ------------------------------------------

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

function kernelSin(x: number, y: number, iy: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0) return x;
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

function kernelCos(x: number, y: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0) return 1.0;
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1.0 - (0.5 * z - (z * r - x * y));
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);
  const hz = 0.5 * z - qx;
  const a = 1.0 - qx;
  return a - (hz - (z * r - x * y));
}

const T = [
  3.33333333333334091986e-1, 1.33333333333201242699e-1, 5.39682539762260521377e-2,
  2.18694882948595424599e-2, 8.86323982359930005737e-3, 3.59207910759131235356e-3,
  1.45620945432529025516e-3, 5.88041240820264096874e-4, 2.46463134818469906812e-4,
  7.817944429395570923e-5, 7.14072491382608190305e-5, -1.85586374855275456654e-5,
  2.59073051863633712884e-5,
];
const PIO4 = 7.85398163397448278999e-1;
const PIO4LO = 3.06161699786838301793e-17;

/** `__kernel_tan` de fdlibm (con la corrección de 2004 para |x| cerca de π/4). */
function kernelTan(xIn: number, yIn: number, iy: number): number {
  let x = xIn;
  let y = yIn;
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix < 0x3e300000) {
    if (Math.trunc(x) === 0) {
      if ((ix | lowWord(x) | (iy + 1)) === 0) return 1 / Math.abs(x);
      if (iy === 1) return x;
      const w = x + y;
      const z = withLowWord(w, 0);
      const v = y - (z - x);
      const a = -1.0 / w;
      const t = withLowWord(a, 0);
      const s = 1.0 + t * z;
      return t + a * (s + t * v);
    }
  }
  if (ix >= 0x3fe59428) {
    if (hx < 0) {
      x = -x;
      y = -y;
    }
    const z = PIO4 - x;
    const w = PIO4LO - y;
    x = z + w;
    y = 0.0;
  }
  let z = x * x;
  let w = z * z;
  let r = T[1]! + w * (T[3]! + w * (T[5]! + w * (T[7]! + w * (T[9]! + w * T[11]!))));
  let v = z * (T[2]! + w * (T[4]! + w * (T[6]! + w * (T[8]! + w * (T[10]! + w * T[12]!)))));
  let s = z * x;
  r = y + z * (s * (r + v) + y);
  r += T[0]! * s;
  w = x + r;
  if (ix >= 0x3fe59428) {
    v = iy;
    return (1 - ((hx >> 30) & 2)) * (v - 2.0 * (x - ((w * w) / (w + v) - r)));
  }
  if (iy === 1) return w;
  z = withLowWord(w, 0);
  v = r - (z - x);
  const a = -1.0 / w;
  const t = withLowWord(a, 0);
  s = 1.0 + t * z;
  return t + a * (s + t * v);
}

/** Seno determinista (fdlibm). */
export function sin(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelSin(x, 0, 0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  switch (n & 3) {
    case 0:
      return kernelSin(ry[0]!, ry[1]!, 1);
    case 1:
      return kernelCos(ry[0]!, ry[1]!);
    case 2:
      return -kernelSin(ry[0]!, ry[1]!, 1);
    default:
      return -kernelCos(ry[0]!, ry[1]!);
  }
}

/** Coseno determinista (fdlibm). */
export function cos(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelCos(x, 0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  switch (n & 3) {
    case 0:
      return kernelCos(ry[0]!, ry[1]!);
    case 1:
      return -kernelSin(ry[0]!, ry[1]!, 1);
    case 2:
      return -kernelCos(ry[0]!, ry[1]!);
    default:
      return kernelSin(ry[0]!, ry[1]!, 1);
  }
}

/** Tangente determinista (fdlibm). */
export function tan(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelTan(x, 0, 1);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  return kernelTan(ry[0]!, ry[1]!, 1 - ((n & 1) << 1));
}

// --- Arco tangente ------------------------------------------------------------------------------

const ATANHI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.570796326794896558,
];
const ATANLO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1,
  -1.1111110405462355788e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2,
  6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2,
  -3.6531572744216915527e-2, 1.62858201153657823623e-2,
];

/** Arco tangente determinista (fdlibm). */
export function atan(xIn: number): number {
  let x = xIn;
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x44100000) {
    // |x| ≥ 2^66
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lowWord(x) !== 0)) return x + x;
    return hx > 0 ? ATANHI[3]! + ATANLO[3]! : -ATANHI[3]! - ATANLO[3]!;
  }
  let id: number;
  if (ix < 0x3fdc0000) {
    // |x| < 0.4375
    if (ix < 0x3e200000) return x; // |x| < 2^-29
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0;
        x = (2.0 * x - 1.0) / (2.0 + x);
      } else {
        id = 1;
        x = (x - 1.0) / (x + 1.0);
      }
    } else if (ix < 0x40038000) {
      id = 2;
      x = (x - 1.5) / (1.0 + 1.5 * x);
    } else {
      id = 3;
      x = -1.0 / x;
    }
  }
  const z = x * x;
  const w = z * z;
  const s1 = z * (AT[0]! + w * (AT[2]! + w * (AT[4]! + w * (AT[6]! + w * (AT[8]! + w * AT[10]!)))));
  const s2 = w * (AT[1]! + w * (AT[3]! + w * (AT[5]! + w * (AT[7]! + w * AT[9]!))));
  if (id < 0) return x - x * (s1 + s2);
  const zz = ATANHI[id]! - (x * (s1 + s2) - ATANLO[id]! - x);
  return hx < 0 ? -zz : zz;
}

const PI = 3.141592653589793116;
const PI_O_2 = 1.570796326794896558;
const PI_O_4 = 7.85398163397448279e-1;
const PI_LO = 1.2246467991473532e-16;

/** Arco tangente de y/x en (−π, π] (fdlibm). */
export function atan2(y: number, x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  const lx = lowWord(x);
  const hy = highWord(y);
  const iy = hy & 0x7fffffff;
  const ly = lowWord(y);
  if (
    (ix | ((lx | -lx) >>> 31)) >>> 0 > 0x7ff00000 ||
    (iy | ((ly | -ly) >>> 31)) >>> 0 > 0x7ff00000
  ) {
    return x + y; // NaN
  }
  if (((hx - 0x3ff00000) | lx) === 0) return atan(y); // x = 1
  const m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
  if ((iy | ly) === 0) {
    switch (m) {
      case 0:
      case 1:
        return y;
      case 2:
        return PI;
      default:
        return -PI;
    }
  }
  if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 : PI_O_2;
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) {
      switch (m) {
        case 0:
          return PI_O_4;
        case 1:
          return -PI_O_4;
        case 2:
          return 3.0 * PI_O_4;
        default:
          return -3.0 * PI_O_4;
      }
    }
    switch (m) {
      case 0:
        return 0.0;
      case 1:
        return -0.0;
      case 2:
        return PI;
      default:
        return -PI;
    }
  }
  if (iy === 0x7ff00000) return hy < 0 ? -PI_O_2 : PI_O_2;
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60) z = PI_O_2 + 0.5 * PI_LO;
  else if (hx < 0 && k < -60) z = 0.0;
  else z = atan(Math.abs(y / x));
  switch (m) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return z - PI_LO - PI;
  }
}

// --- Exponencial y logaritmo --------------------------------------------------------------------

const LN2_HI = [6.9314718036912381649e-1, -6.9314718036912381649e-1];
const LN2_LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
const INVLN2 = 1.442695040888963387;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.6533902205465251539e-6;
const P5 = 4.13813679705723846039e-8;
const O_THRESHOLD = 7.09782712893383973096e2;
const U_THRESHOLD = -7.4513321910194110842e2;

/** Exponencial determinista (fdlibm). */
export function exp(xIn: number): number {
  let x = xIn;
  let hx = highWord(x);
  const xsb = (hx >> 31) & 1;
  hx &= 0x7fffffff;
  if (hx >= 0x40862e42) {
    // |x| ≥ 709.78
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | lowWord(x)) !== 0) return x + x; // NaN
      return xsb === 0 ? x : 0.0; // exp(±∞)
    }
    if (x > O_THRESHOLD) return Infinity;
    if (x < U_THRESHOLD) return 0;
  }
  let hi = 0;
  let lo = 0;
  let k = 0;
  if (hx > 0x3fd62e42) {
    // |x| > 0.5·ln2
    if (hx < 0x3ff0a2b2) {
      // Como V8: fdlibm erra el último bit de e = exp(1) y se devuelve el valor exacto.
      if (x === 1.0) return Math.E;
      hi = x - LN2_HI[xsb]!;
      lo = LN2_LO[xsb]!;
      k = 1 - xsb - xsb;
    } else {
      k = Math.trunc(INVLN2 * x + (xsb === 0 ? 0.5 : -0.5));
      hi = x - k * LN2_HI[0]!;
      lo = k * LN2_LO[0]!;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    // |x| < 2^-28
    if (1.0e300 + x > 1.0) return 1.0 + x;
  }
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1.0 - ((x * c) / (c - 2.0) - x);
  const y = 1.0 - (lo - (x * c) / (2.0 - c) - hi);
  if (k >= -1021) return fromWords(highWord(y) + (k << 20), lowWord(y));
  return fromWords(highWord(y) + ((k + 1000) << 20), lowWord(y)) * 9.3326361850321887899e-302; // 2^-1000
}

const LG1 = 6.66666666666673513e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;
const TWO54 = 1.8014398509481984e16;
const LN2HI = 6.9314718036912381649e-1;
const LN2LO = 1.90821492927058770002e-10;

/** Logaritmo natural determinista (fdlibm). */
export function log(xIn: number): number {
  let x = xIn;
  let hx = highWord(x);
  const lx = lowWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    // x < 2^-1022
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54;
    hx = highWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  const i = (hx + 0x95f64) & 0x100000;
  x = fromWords(hx | (i ^ 0x3ff00000), lowWord(x));
  k += i >> 20;
  const f = x - 1.0;
  if ((0x000fffff & (2 + hx)) < 3) {
    // |f| < 2^-20
    if (f === 0) return k === 0 ? 0 : k * LN2HI + k * LN2LO;
    const R = f * f * (0.5 - 0.3333333333333333 * f);
    return k === 0 ? f - R : k * LN2HI - (R - k * LN2LO - f);
  }
  const s = f / (2.0 + f);
  const dk = k;
  const z = s * s;
  let ii = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  ii |= j;
  const R = t2 + t1;
  if (ii > 0) {
    const hfsq = 0.5 * f * f;
    return k === 0
      ? f - (hfsq - s * (hfsq + R))
      : dk * LN2HI - (hfsq - (s * (hfsq + R) + dk * LN2LO) - f);
  }
  return k === 0 ? f - s * (f - R) : dk * LN2HI - (s * (f - R) - dk * LN2LO - f);
}

// --- Potencias de dos ---------------------------------------------------------------------------

/**
 * 2^k exacto, armado con los bits del exponente (sin `**`, cuya precisión depende del motor). Para k
 * fuera del rango normal [−1022, 1023] encadena productos exactos por potencias de dos.
 */
export function pow2(k: number): number {
  if (!Number.isInteger(k)) throw new Error(`pow2 espera un entero, recibió ${k}`);
  if (k >= -1022 && k <= 1023) return fromWords((k + 1023) << 20, 0);
  return scalbn(1.0, k);
}

// --- Hipotenusa ---------------------------------------------------------------------------------

/**
 * √(x² + y²) determinista: el algoritmo de `Math.hypot` de V8 (escalar por el máximo y sumar con
 * compensación de Kahan), escrito solo con aritmética IEEE exacta. Con dos argumentos el primer
 * paso de Kahan deja compensación cero y queda √((a/m)² + (b/m)²)·m. En Chromium da lo mismo que
 * `Math.hypot`, bit a bit, y en Firefox y WebKit también.
 */
export function hypot(x: number, y: number): number {
  const a = Math.abs(x);
  const b = Math.abs(y);
  if (a === Infinity || b === Infinity) return Infinity;
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  const max = Math.max(a, b);
  if (max === 0) return 0;
  const na = a / max;
  const nb = b / max;
  return Math.sqrt(na * na + nb * nb) * max;
}
