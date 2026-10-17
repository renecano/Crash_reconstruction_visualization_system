/**
 * Álgebra lineal densa pequeña (port de `croquis_solver/linalg.py`, ADR 0027): SVD de Jacobi de un
 * lado, `lstsq` de norma mínima, `pinv` y Cholesky. Mismo orden de operaciones que la referencia
 * Python, así que en doble precisión da los mismos números (paridad E7).
 *
 * Dominio: valores nulos o de magnitud ≥ 1e-6 (residuos en sigmas y parámetros de orden 1-100).
 */

export type Matrix = number[][];

export const EPS = 2.220446049250313e-16;
const JACOBI_TOL = 1e-15;
const JACOBI_MAX_SWEEPS = 60;

export function transpose(a: readonly (readonly number[])[]): Matrix {
  const rows = a.length;
  const cols = rows ? a[0]!.length : 0;
  const out: Matrix = [];
  for (let j = 0; j < cols; j++) {
    const row: number[] = [];
    for (let i = 0; i < rows; i++) row.push(a[i]![j]!);
    out.push(row);
  }
  return out;
}

export function matmul(
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
): Matrix {
  const n = b.length;
  const p = n ? b[0]!.length : 0;
  const out: Matrix = [];
  for (const row of a) {
    const r = new Array<number>(p).fill(0);
    for (let k = 0; k < n; k++) {
      const aik = row[k]!;
      const bk = b[k]!;
      for (let j = 0; j < p; j++) r[j]! += aik * bk[j]!;
    }
    out.push(r);
  }
  return out;
}

/** SVD reducida `a = U · diag(s) · Vᵀ` con s descendente (m × k, k, k × n; k = min(m, n)). */
export function svd(a: readonly (readonly number[])[]): [Matrix, number[], Matrix] {
  const m = a.length;
  const n = m ? a[0]!.length : 0;
  if (m === 0 || n === 0) return [[], [], []];
  if (n > m) {
    const [ut, s, vt] = svd(transpose(a));
    return [transpose(vt), s, transpose(ut)];
  }
  const w: Matrix = a.map((row) => row.map((v) => v));
  const v: Matrix = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n).fill(0);
    row[i] = 1;
    v.push(row);
  }
  for (let sweep = 0; sweep < JACOBI_MAX_SWEEPS; sweep++) {
    let rotated = false;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        for (let i = 0; i < m; i++) {
          const wp = w[i]![p]!;
          const wq = w[i]![q]!;
          alpha += wp * wp;
          beta += wq * wq;
          gamma += wp * wq;
        }
        if (gamma === 0 || Math.abs(gamma) <= JACOBI_TOL * Math.sqrt(alpha * beta)) continue;
        rotated = true;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (let i = 0; i < m; i++) {
          const wp = w[i]![p]!;
          const wq = w[i]![q]!;
          w[i]![p] = c * wp - s * wq;
          w[i]![q] = s * wp + c * wq;
        }
        for (let i = 0; i < n; i++) {
          const vp = v[i]![p]!;
          const vq = v[i]![q]!;
          v[i]![p] = c * vp - s * vq;
          v[i]![q] = s * vp + c * vq;
        }
      }
    }
    if (!rotated) break;
  }
  const sigma: number[] = [];
  for (let j = 0; j < n; j++) {
    let acc = 0;
    for (let i = 0; i < m; i++) acc += w[i]![j]! * w[i]![j]!;
    sigma.push(Math.sqrt(acc));
  }
  // Orden descendente estable (empates por índice), como `sorted(..., key=(-σ, j))` en Python.
  const order = Array.from({ length: n }, (_, j) => j).sort(
    (x, y) => sigma[y]! - sigma[x]! || x - y,
  );
  const sSorted = order.map((j) => sigma[j]!);
  const u: Matrix = Array.from({ length: m }, () => new Array<number>(n).fill(0));
  order.forEach((j, k) => {
    if (sigma[j]! > 0) {
      for (let i = 0; i < m; i++) u[i]![k] = w[i]![j]! / sigma[j]!;
    }
  });
  const vt: Matrix = order.map((j) => {
    const row: number[] = [];
    for (let i = 0; i < n; i++) row.push(v[i]![j]!);
    return row;
  });
  return [u, sSorted, vt];
}

function cutoff(s: readonly number[], rcond: number): number {
  return rcond * (s.length ? s[0]! : 0);
}

/** Pseudoinversa de Moore-Penrose (como `numpy.linalg.pinv(a, rcond)`). */
export function pinv(a: readonly (readonly number[])[], rcond = 1e-15): Matrix {
  const m = a.length;
  const n = m ? a[0]!.length : 0;
  const [u, s, vt] = svd(a);
  const cut = cutoff(s, rcond);
  const out: Matrix = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  s.forEach((sk, k) => {
    if (sk <= cut || sk === 0) return;
    const inv = 1 / sk;
    for (let i = 0; i < n; i++) {
      const vik = vt[k]![i]! * inv;
      for (let j = 0; j < m; j++) out[i]![j]! += vik * u[j]![k]!;
    }
  });
  return out;
}

/** Mínimos cuadrados de norma mínima (como `numpy.linalg.lstsq(a, b, rcond)[0]`). */
export function lstsq(
  a: readonly (readonly number[])[],
  b: readonly number[],
  rcond: number | null = null,
): number[] {
  const m = a.length;
  const n = m ? a[0]!.length : 0;
  const rc = rcond ?? EPS * Math.max(m, n);
  const [u, s, vt] = svd(a);
  const cut = cutoff(s, rc);
  const x = new Array<number>(n).fill(0);
  s.forEach((sk, k) => {
    if (sk <= cut || sk === 0) return;
    let coef = 0;
    for (let j = 0; j < m; j++) coef += u[j]![k]! * b[j]!;
    coef /= sk;
    for (let i = 0; i < n; i++) x[i]! += coef * vt[k]![i]!;
  });
  return x;
}

/** Resuelve `a x = b` con `a` simétrica definida positiva (Cholesky). */
export function solveSpd(a: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = a.length;
  const low: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i]![j]!;
      for (let k = 0; k < j; k++) s -= low[i]![k]! * low[j]![k]!;
      if (i === j) {
        if (s <= 0) throw new Error("La matriz no es definida positiva");
        low[i]![i] = Math.sqrt(s);
      } else {
        low[i]![j] = s / low[j]![j]!;
      }
    }
  }
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= low[i]![k]! * y[k]!;
    y[i] = s / low[i]![i]!;
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= low[k]![i]! * x[k]!;
    x[i] = s / low[i]![i]!;
  }
  return x;
}
