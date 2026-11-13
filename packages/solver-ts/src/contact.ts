/**
 * Geometría del contacto (port de `croquis_solver.contact`): dónde toca cada vehículo en el
 * instante del impacto. La zona CDC fija el punto de contacto en el marco del vehículo; cada
 * vehículo en movimiento puede ubicarlo en cualquier lugar de su trayectoria (un lugar
 * geométrico). El punto común sale de proyecciones alternadas desde el punto declarado y, para dos
 * cuerpos, se refina con Levenberg-Marquardt.
 */
import { rot, type Vec } from "./models";
import { pySum, str } from "./pymath";
import * as dmath from "./dmath";

const COARSE_SAMPLES = 800;
const LOCAL_SAMPLES = 40;
const LOCAL_WINDOW_M = 10.0;
const REFINE_ITERATIONS = 50;
const ALTERNATING_ITERATIONS = 12;
const LM_ITERATIONS = 100;
/** Pasos de la bisección hacia el punto declarado (ADR 0135). */
const TOUCH_BISECTIONS = 40;

// Posición a lo largo de la cara como fracción de su longitud (positivo = izquierda o adelante).
const ALONG_FRONT_BACK: Readonly<Record<string, number>> = {
  L: 1 / 3,
  C: 0.0,
  R: -1 / 3,
  Y: 1 / 6,
  Z: -1 / 6,
  D: 0.0,
};
const ALONG_SIDE: Readonly<Record<string, number>> = {
  F: 1 / 3,
  P: 0.0,
  B: -1 / 3,
  Y: 1 / 6,
  Z: -1 / 6,
  D: 0.0,
};

/**
 * La mitad del ancho de la zona de impacto: un tercio de su cara (SAE J224), así que un sexto del
 * ancho en el frente o la parte trasera y un sexto del largo en un costado (ADR 0135).
 */
export function contactTolerance(
  cdc: Record<string, unknown> | null | undefined,
  length: number,
  width: number,
): number {
  const lado = str(cdc?.lado, "F");
  return (lado === "L" || lado === "R" ? length : width) / 6.0;
}

/**
 * Punto de contacto en el marco del vehículo para una zona CDC. `standoff` aleja el punto de la
 * cara (por ejemplo, el radio de un poste). Sin zona declarada, el centro del frente.
 */
export function contactOffset(
  cdc: Record<string, unknown> | null | undefined,
  length: number,
  width: number,
  standoff = 0.0,
): Vec {
  const lado = str(cdc?.lado, "F");
  const zona = str(cdc?.zona_horizontal, "D");
  if (lado === "F" || lado === "B" || (lado !== "L" && lado !== "R")) {
    const sign = lado === "B" ? -1.0 : 1.0;
    return [sign * (length / 2 + standoff), (ALONG_FRONT_BACK[zona] ?? 0.0) * width];
  }
  const sign = lado === "L" ? 1.0 : -1.0;
  return [(ALONG_SIDE[zona] ?? 0.0) * length, sign * (width / 2 + standoff)];
}

/** Lugar geométrico del punto de contacto; `pose(s)` da (x, y, rumbo) del CG para s ∈ [0, sMax]. */
export class Locus {
  constructor(
    readonly pose: (s: number) => readonly [number, number, number],
    readonly offset: Vec,
    readonly sMax: number,
  ) {}

  point(s: number): Vec {
    const [x, y, yaw] = this.pose(s);
    const o = rot(this.offset, yaw);
    return [x + o[0], y + o[1]];
  }

  /** Parámetro cuyo punto de contacto está más cerca de `target`, y ese punto. */
  project(target: Vec, hint: number | null = null): [number, Vec] {
    if (this.sMax <= 0) return [0.0, this.point(0.0)];
    const d2 = (s: number): number => {
      const p = this.point(s);
      return (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2;
    };
    let start: number;
    let span: number;
    let n: number;
    if (hint === null) {
      start = 0.0;
      span = this.sMax;
      n = COARSE_SAMPLES;
    } else {
      start = Math.max(0.0, hint - LOCAL_WINDOW_M);
      span = Math.min(this.sMax, hint + LOCAL_WINDOW_M) - start;
      n = LOCAL_SAMPLES;
    }
    const step = span / n;
    // `min(range(n + 1), key=...)`: el primer índice con la distancia mínima.
    let bestI = 0;
    let bestD = d2(start);
    for (let i = 1; i <= n; i++) {
      const d = d2(start + i * step);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const lo = Math.max(0.0, start + (bestI - 1) * step);
    const hi = Math.min(this.sMax, start + (bestI + 1) * step);
    const invPhi = (Math.sqrt(5.0) - 1.0) / 2.0;
    let a = lo;
    let b = hi;
    let c = b - invPhi * (b - a);
    let d = a + invPhi * (b - a);
    let fc = d2(c);
    let fd = d2(d);
    for (let i = 0; i < REFINE_ITERATIONS; i++) {
      if (fc < fd) {
        b = d;
        d = c;
        fd = fc;
        c = b - invPhi * (b - a);
        fc = d2(c);
      } else {
        a = c;
        c = d;
        fc = fd;
        d = a + invPhi * (b - a);
        fd = d2(d);
      }
    }
    const mid = (a + b) / 2.0;
    // `min([(d2(x), x) ...])`: menor distancia y, en empate, el menor parámetro.
    let best: [number, number] | null = null;
    for (const x of [lo, mid, hi]) {
      const cand: [number, number] = [d2(x), x];
      if (best === null || cand[0] < best[0] || (cand[0] === best[0] && cand[1] < best[1])) {
        best = cand;
      }
    }
    const s = best![1];
    return [s, this.point(s)];
  }
}

export interface ContactSolution {
  point: Vec;
  params: number[];
  /** Distancia entre los puntos de contacto de los cuerpos (0 si se tocan). */
  gap: number;
}

/**
 * Punto de impacto común para uno o más lugares geométricos (proyecciones alternadas).
 * `tolerance` (dos vehículos): a qué distancia entre sus puntos de contacto las zonas ya se tocan;
 * con ella, el contacto es el más cercano al punto declarado entre los que se tocan (ADR 0135).
 */
export function resolveContact(
  loci: readonly Locus[],
  declared: Vec,
  tolerance = 0.0,
): ContactSolution {
  if (loci.length === 0) throw new Error("Se necesita al menos un cuerpo");
  let p = declared;
  const params = loci.map(() => 0.0);
  let points: Vec[] = loci.map(() => declared);
  for (let it = 0; it < ALTERNATING_ITERATIONS; it++) {
    loci.forEach((locus, i) => {
      const [s, q] = locus.project(p, it === 0 ? null : params[i]!);
      params[i] = s;
      points[i] = q;
      p = q;
    });
  }
  if (loci.length === 2) {
    const sa0 = params[0]!;
    const sb0 = params[1]!;
    let [sa, sb] = refinePair(loci[0]!, loci[1]!, params[0]!, params[1]!);
    if (tolerance > 0.0) {
      [sa, sb] = towardDeclared(loci[0]!, loci[1]!, [sa, sb], [sa0, sb0], tolerance);
    }
    params[0] = sa;
    params[1] = sb;
    points = [loci[0]!.point(sa), loci[1]!.point(sb)];
  }
  const cx = pySum(points.map((q) => q[0])) / points.length;
  const cy = pySum(points.map((q) => q[1])) / points.length;
  const p0 = points[0]!;
  const gap = Math.max(...points.map((q) => dmath.hypot(q[0] - p0[0], q[1] - p0[1])));
  return { point: [cx, cy], params, gap };
}

function pairGap(la: Locus, lb: Locus, sa: number, sb: number): number {
  const pa = la.point(sa);
  const pb = lb.point(sb);
  return dmath.hypot(pa[0] - pb[0], pa[1] - pb[1]);
}

/**
 * Del contacto refinado hacia la proyección del punto declarado, lo más lejos que las zonas sigan
 * tocándose (distancia entre sus puntos ≤ `tolerance`). Si el refinado no toca, se queda.
 */
function towardDeclared(
  la: Locus,
  lb: Locus,
  refined: [number, number],
  near: [number, number],
  tolerance: number,
): [number, number] {
  const [sa1, sb1] = refined;
  const [sa0, sb0] = near;
  if (pairGap(la, lb, sa1, sb1) > tolerance) return refined;
  if (pairGap(la, lb, sa0, sb0) <= tolerance) return near;
  let lo = 0.0;
  let hi = 1.0;
  for (let i = 0; i < TOUCH_BISECTIONS; i++) {
    const mid = (lo + hi) / 2.0;
    const sa = sa1 + (sa0 - sa1) * mid;
    const sb = sb1 + (sb0 - sb1) * mid;
    if (pairGap(la, lb, sa, sb) <= tolerance) lo = mid;
    else hi = mid;
  }
  return [sa1 + (sa0 - sa1) * lo, sb1 + (sb0 - sb1) * lo];
}

function derivative(locus: Locus, s: number): Vec {
  if (locus.sMax <= 0) return [0.0, 0.0];
  const h = 1e-4;
  const a = Math.max(0.0, s - h);
  const b = Math.min(locus.sMax, s + h);
  const pa = locus.point(a);
  const pb = locus.point(b);
  return [(pb[0] - pa[0]) / (b - a), (pb[1] - pa[1]) / (b - a)];
}

/** Minimiza |c_a(s_a) − c_b(s_b)|² con Levenberg-Marquardt (parámetros acotados). */
function refinePair(la: Locus, lb: Locus, saIn: number, sbIn: number): [number, number] {
  let sa = saIn;
  let sb = sbIn;
  const cost = (x: number, y: number): number => {
    const pa = la.point(x);
    const pb = lb.point(y);
    return (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2;
  };
  let lam = 1e-3;
  let current = cost(sa, sb);
  for (let i = 0; i < LM_ITERATIONS; i++) {
    if (current < 1e-16) break;
    const pa = la.point(sa);
    const pb = lb.point(sb);
    const r: Vec = [pa[0] - pb[0], pa[1] - pb[1]];
    const da = derivative(la, sa);
    const db = derivative(lb, sb);
    const a11 = da[0] * da[0] + da[1] * da[1] + lam;
    const a22 = db[0] * db[0] + db[1] * db[1] + lam;
    const a12 = -(da[0] * db[0] + da[1] * db[1]);
    const g1 = da[0] * r[0] + da[1] * r[1];
    const g2 = -(db[0] * r[0] + db[1] * r[1]);
    const det = a11 * a22 - a12 * a12;
    if (det <= 0) {
      lam *= 10.0;
      continue;
    }
    const dx = (-g1 * a22 + g2 * a12) / det;
    const dy = (-g2 * a11 + g1 * a12) / det;
    const nx = Math.min(Math.max(sa + dx, 0.0), la.sMax);
    const ny = Math.min(Math.max(sb + dy, 0.0), lb.sMax);
    const trial = cost(nx, ny);
    if (trial < current) {
      sa = nx;
      sb = ny;
      current = trial;
      lam = Math.max(lam / 10.0, 1e-12);
    } else {
      lam *= 10.0;
      if (lam > 1e12) break;
    }
  }
  return [sa, sb];
}
