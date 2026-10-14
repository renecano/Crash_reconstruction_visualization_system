/**
 * Aritmética con la semántica exacta de CPython donde difiere de JS (paridad E7).
 */

/**
 * `sum()` de CPython 3.12+ sobre flotantes: suma compensada de Neumaier (Kahan–Babuška
 * mejorado), con la compensación aplicada al final si es finita. Un bucle `+=` de JS no da los
 * mismos bits.
 */
export function pySum(xs: Iterable<number>): number {
  let f = 0.0;
  let c = 0.0;
  for (const x of xs) {
    const t = f + x;
    if (Math.abs(f) >= Math.abs(x)) c += f - t + x;
    else c += x - t + f;
    f = t;
  }
  if (c !== 0 && Number.isFinite(c)) f += c;
  return f;
}

/**
 * `round(x, nd)` de Python con `nd ≥ 0`: redondea el valor binario exacto a `nd` decimales y, en
 * un empate exacto, al dígito par. `toFixed` de JS redondea igual salvo en los empates (elige el de
 * mayor magnitud), así que el empate se detecta en la expansión decimal exacta.
 */
export function pyRound(x: number, nd = 0): number {
  if (!Number.isFinite(x) || nd < 0 || Math.abs(x) >= 1e21) return x;
  const mag = Math.abs(x);
  const up = mag.toFixed(nd);
  const exact = mag.toFixed(Math.min(100, nd + 40));
  const dot = exact.indexOf(".");
  const tail = exact.slice(dot + 1 + nd);
  let out = up;
  if (tail[0] === "5" && /^50*$/.test(tail)) {
    // Empate: el truncado si su último dígito es par; si no, el redondeado hacia arriba.
    const down = nd === 0 ? exact.slice(0, dot) : exact.slice(0, dot + 1 + nd);
    const last = down.replace(".", "").slice(-1);
    out = Number(last) % 2 === 0 ? down : up;
  }
  const v = Number(out);
  return x < 0 ? -v : v;
}

/**
 * `a % b` de Python sobre flotantes (módulo con el signo del divisor), como `float_rem` de
 * CPython: `fmod` y, si los signos difieren, se suma el divisor (puede dar exactamente `b`).
 */
export function pyMod(a: number, b: number): number {
  let m = a % b;
  if (m !== 0) {
    if (b < 0 !== m < 0) m += b;
  } else {
    m = b < 0 ? -0 : 0;
  }
  return m;
}

const DEG_TO_RAD = Math.PI / 180.0;
const RAD_TO_DEG = 180.0 / Math.PI;

/** `math.radians` de CPython (multiplica por la constante π/180 ya redondeada). */
export function radians(deg: number): number {
  return deg * DEG_TO_RAD;
}

/** `math.degrees` de CPython. */
export function degrees(rad: number): number {
  return rad * RAD_TO_DEG;
}

/** `math.isclose(a, b, rel_tol, abs_tol)` de Python. */
export function isClose(a: number, b: number, relTol = 1e-9, absTol = 0.0): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(b - a);
  return diff <= Math.abs(relTol * b) || diff <= Math.abs(relTol * a) || diff <= absTol;
}

/** Texto de un campo del contrato (`str(x)` para escalares; el valor por omisión si falta). */
export function str(x: unknown, dflt = ""): string {
  if (x === undefined || x === null) return dflt;
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  return JSON.stringify(x);
}

/** Un flotante como fracción exacta: numerador entero y exponente k (x = n / 2^k, k ≥ 0). */
function exactRatio(x: number): [bigint, number] {
  if (x === 0) return [0n, 0];
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const sign = hi >>> 31 ? -1n : 1n;
  const biased = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp: number;
  if (biased === 0) {
    exp = -1074;
  } else {
    mant |= 1n << 52n;
    exp = biased - 1075;
  }
  if (exp >= 0) return [sign * (mant << BigInt(exp)), 0];
  return [sign * mant, -exp];
}

function bitLength(n: bigint): number {
  return n === 0n ? 0 : n.toString(2).length;
}

/** p/q redondeado al flotante más cercano (empates al par), como la división de enteros de Python. */
export function ratioToDouble(pIn: bigint, qIn: bigint): number {
  if (qIn === 0n) throw new Error("División entre cero");
  if (pIn === 0n) return 0;
  const neg = pIn < 0n !== qIn < 0n;
  const p = pIn < 0n ? -pIn : pIn;
  const q = qIn < 0n ? -qIn : qIn;
  let s = 54 - (bitLength(p) - bitLength(q));
  let m = 0n;
  let rem = 0n;
  for (let tries = 0; tries < 4; tries++) {
    const num = s >= 0 ? p << BigInt(s) : p;
    const den = s >= 0 ? q : q << BigInt(-s);
    m = num / den;
    rem = num % den;
    const bl = bitLength(m);
    if (bl === 54) break;
    s += 54 - bl;
  }
  // m tiene 54 bits: 53 de mantisa y uno de guarda; el resto es el bit pegajoso.
  let mant = m >> 1n;
  const guard = m & 1n;
  if (guard === 1n && (rem !== 0n || (mant & 1n) === 1n)) mant += 1n;
  const v = Number(mant) * 2 ** (1 - s);
  return neg ? -v : v;
}

/**
 * `statistics.pvariance` de CPython: la suma de cuadrados se calcula con fracciones exactas y el
 * resultado se redondea una sola vez. Un cálculo en flotantes no da los mismos bits.
 */
export function pvariance(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 1) throw new Error("pvariance requiere al menos un dato");
  const parts = xs.map(exactRatio);
  const k = Math.max(...parts.map(([, e]) => e));
  let s1 = 0n;
  let s2 = 0n;
  for (const [num, e] of parts) {
    const a = num << BigInt(k - e);
    s1 += a;
    s2 += a * a;
  }
  const bn = BigInt(n);
  const numer = bn * s2 - s1 * s1;
  const denom = bn * bn * (1n << BigInt(2 * k));
  return ratioToDouble(numer, denom);
}
