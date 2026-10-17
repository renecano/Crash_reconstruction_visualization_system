/**
 * Mínimos cuadrados robustos con límites (port de `croquis_solver/lsq.py`, ADR 0027):
 * Levenberg–Marquardt con pérdida soft_l1 por mínimos cuadrados reponderados, amortiguamiento de
 * Nielsen, conjunto activo en los límites, reintento interior al 99.5 % y criterios de parada fijos.
 * Mismo orden de operaciones que la referencia Python.
 */
import { solveSpd } from "./linalg";

const TAU = 1e-3;
const LAMBDA_MAX = 1e16;
const FTOL = 1e-8;
const XTOL = 1e-8;
const GTOL = 1e-10;
const THETA = 0.995;

export interface LsqResult {
  x: number[];
  cost: number;
  /** Convergió por tolerancia (no por agotar el presupuesto), como `status > 0` en SciPy. */
  success: boolean;
  nfev: number;
}

/** ½ Σ 2(√(1 + r²) − 1), sin la cancelación para r chico. */
export function softL1Cost(r: readonly number[]): number {
  let acc = 0;
  for (const v of r) {
    const z = v * v;
    acc += (2 * z) / (Math.sqrt(1 + z) + 1);
  }
  return 0.5 * acc;
}

function clip(x: readonly number[], lo: readonly number[], hi: readonly number[]): number[] {
  return x.map((v, i) => Math.min(Math.max(v, lo[i]!), hi[i]!));
}

/** Minimiza ½ Σ ρ(rᵢ(x)²) con `lo ≤ x ≤ hi`. */
export function leastSquaresSoftL1(
  fun: (x: number[]) => number[],
  jac: (x: number[]) => number[][],
  x0: readonly number[],
  lo: readonly number[],
  hi: readonly number[],
  xScale: readonly number[],
  maxNfev: number,
): LsqResult {
  const n = x0.length;
  let x = clip(x0, lo, hi);
  let r = fun(x);
  let nfev = 1;
  let cost = softL1Cost(r);
  let lam = -1;
  let nu = 2;
  let success = false;
  while (nfev < maxNfev && !success) {
    const j = jac(x);
    const m = r.length;
    const w = r.map((v) => 1 / Math.sqrt(Math.sqrt(1 + v * v)));
    const js: number[][] = [];
    for (let i = 0; i < m; i++) {
      const row: number[] = [];
      for (let k = 0; k < n; k++) row.push(w[i]! * j[i]![k]! * xScale[k]!);
      js.push(row);
    }
    const rw = r.map((v, i) => w[i]! * v);
    const a: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const g = new Array<number>(n).fill(0);
    for (let i = 0; i < m; i++) {
      const row = js[i]!;
      for (let p = 0; p < n; p++) {
        g[p]! += row[p]! * rw[i]!;
        for (let q = 0; q < n; q++) a[p]![q]! += row[p]! * row[q]!;
      }
    }
    const free: number[] = [];
    for (let k = 0; k < n; k++) {
      if (!((x[k]! <= lo[k]! && g[k]! > 0) || (x[k]! >= hi[k]! && g[k]! < 0))) free.push(k);
    }
    let gmax = 0;
    for (const k of free) gmax = Math.max(gmax, Math.abs(g[k]!));
    if (free.length === 0 || gmax < GTOL) {
      success = true;
      break;
    }
    if (lam < 0) {
      let dmax = 0;
      for (const k of free) dmax = Math.max(dmax, a[k]![k]!);
      lam = dmax > 0 ? TAU * dmax : TAU;
    }
    let accepted = false;
    while (!accepted && nfev < maxNfev) {
      const damped = free.map((p) => free.map((q) => a[p]![q]! + (p === q ? lam : 0)));
      const duFree = solveSpd(
        damped,
        free.map((k) => -g[k]!),
      );
      const du = new Array<number>(n).fill(0);
      free.forEach((k, idx) => {
        du[k] = duFree[idx]!;
      });
      let xNew = clip(
        x.map((v, k) => v + xScale[k]! * du[k]!),
        lo,
        hi,
      );
      let rNew = fun(xNew);
      nfev += 1;
      let costNew = softL1Cost(rNew);
      if (costNew >= cost && nfev < maxNfev) {
        let alpha = 1;
        for (const k of free) {
          const dx = xScale[k]! * du[k]!;
          if (dx > 0 && x[k]! + dx > hi[k]!) alpha = Math.min(alpha, (hi[k]! - x[k]!) / dx);
          else if (dx < 0 && x[k]! + dx < lo[k]!) alpha = Math.min(alpha, (lo[k]! - x[k]!) / dx);
        }
        if (alpha < 1) {
          const t = THETA * alpha;
          const xIn = x.map((v, k) => v + t * xScale[k]! * du[k]!);
          const rIn = fun(xIn);
          nfev += 1;
          const costIn = softL1Cost(rIn);
          if (costIn < cost) {
            xNew = xIn;
            rNew = rIn;
            costNew = costIn;
            for (let k = 0; k < n; k++) du[k]! *= t;
          }
        }
      }
      let predicted = 0;
      for (const k of free) predicted += du[k]! * (lam * du[k]! - g[k]!);
      predicted *= 0.5;
      let step = 0;
      let size = 0;
      for (let k = 0; k < n; k++) {
        step = Math.max(step, Math.abs(xNew[k]! - x[k]!));
        size = Math.max(size, Math.abs(x[k]!));
      }
      if (costNew < cost) {
        const reduction = cost - costNew;
        x = xNew;
        r = rNew;
        accepted = true;
        const rho = predicted > 0 ? reduction / predicted : 1;
        const d = 2 * rho - 1;
        lam *= Math.max(1 / 3, 1 - d * d * d);
        nu = 2;
        if (costNew === 0 || reduction <= FTOL * cost || step <= XTOL * (XTOL + size)) {
          success = true;
        }
        cost = costNew;
      } else {
        if (step <= XTOL * (XTOL + size)) {
          success = true;
          break;
        }
        lam = Math.min(lam * nu, LAMBDA_MAX);
        nu *= 2;
        if (lam >= LAMBDA_MAX) break;
      }
    }
    if (!accepted) break;
  }
  return { x, cost, success, nfev };
}
