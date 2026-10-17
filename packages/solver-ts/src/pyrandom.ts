/**
 * `random.Random(seed)` de CPython: Mersenne Twister MT19937 sembrado con `init_by_array` a
 * partir de las palabras de 32 bits de |seed|, y `random()` de 53 bits. Con la misma semilla da
 * exactamente la misma secuencia que Python, así que el muestreo con semilla del port TS coincide
 * con el de la referencia.
 */
const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER = 0x80000000;
const LOWER = 0x7fffffff;
const TWOPI = 2.0 * Math.PI;

export class PyRandom {
  private readonly mt = new Uint32Array(N);
  private mti = N + 1;
  /** Segundo valor de Box–Muller guardado por `gauss` (como `gauss_next` de CPython). */
  private gaussNext: number | null = null;

  constructor(seed: number | bigint) {
    this.seed(seed);
  }

  private initGenrand(s: number): void {
    this.mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = this.mt[i - 1]!;
      this.mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) >>> 0;
    }
    this.mti = N;
  }

  private initByArray(key: readonly number[]): void {
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = this.mt[i - 1]!;
      this.mt[i] = ((this.mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1664525)) + key[j]! + j) >>> 0;
      i++;
      j++;
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]!;
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = this.mt[i - 1]!;
      this.mt[i] = ((this.mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]!;
        i = 1;
      }
    }
    this.mt[0] = 0x80000000;
  }

  /** `random.seed(int)`: la clave son las palabras de 32 bits de |seed| (little endian). */
  seed(seed: number | bigint): void {
    let n = typeof seed === "bigint" ? seed : BigInt(Math.trunc(seed));
    if (n < 0n) n = -n;
    const key: number[] = [];
    if (n === 0n) key.push(0);
    while (n > 0n) {
      key.push(Number(n & 0xffffffffn));
      n >>= 32n;
    }
    this.initByArray(key);
    this.gaussNext = null;
  }

  private genrandUint32(): number {
    const mt = this.mt;
    if (this.mti >= N) {
      let kk = 0;
      for (; kk < N - M; kk++) {
        const y = (mt[kk]! & UPPER) | (mt[kk + 1]! & LOWER);
        mt[kk] = mt[kk + M]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      for (; kk < N - 1; kk++) {
        const y = (mt[kk]! & UPPER) | (mt[kk + 1]! & LOWER);
        mt[kk] = mt[kk + (M - N)]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      const y = (mt[N - 1]! & UPPER) | (mt[0]! & LOWER);
      mt[N - 1] = mt[M - 1]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      this.mti = 0;
    }
    let y = mt[this.mti++]!;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** `random()`: flotante uniforme en [0, 1) con 53 bits. */
  random(): number {
    const a = this.genrandUint32() >>> 5;
    const b = this.genrandUint32() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }

  /** `uniform(a, b)`. */
  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }

  /** `getrandbits(k)` para 0 ≤ k ≤ 32 (CPython: `genrand_uint32() >> (32 − k)`). */
  getrandbits(k: number): number {
    if (k < 0 || k > 32 || !Number.isInteger(k)) throw new RangeError("0 ≤ k ≤ 32");
    if (k === 0) return 0;
    return this.genrandUint32() >>> (32 - k);
  }

  /**
   * `randrange(n)` con 0 < n < 2³²: `_randbelow_with_getrandbits` de CPython, que repite
   * `getrandbits(n.bit_length())` hasta caer por debajo de n.
   */
  randrange(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n >= 0x100000000) throw new RangeError("0 < n < 2³²");
    const k = 32 - Math.clz32(n); // n.bit_length()
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  /** `gauss(mu, sigma)` de CPython: Box–Muller con el segundo valor guardado para la siguiente. */
  gauss(mu = 0, sigma = 1): number {
    let z = this.gaussNext;
    this.gaussNext = null;
    if (z === null) {
      const x2pi = this.random() * TWOPI;
      const g2rad = Math.sqrt(-2.0 * Math.log(1.0 - this.random()));
      z = Math.cos(x2pi) * g2rad;
      this.gaussNext = Math.sin(x2pi) * g2rad;
    }
    return mu + z * sigma;
  }
}
