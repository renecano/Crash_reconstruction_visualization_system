/**
 * El croquis pintado sobre el asfalto (portada, PLAN §11.3, capítulos «Ubica» e «Impacta»): las
 * siluetas de cada vehículo donde empieza y donde queda, su trayectoria calculada por el solver y
 * la X del punto de impacto, como pintura vial. Datos puros (triángulos en el plano del mundo); la
 * capa React los vuelve mallas. Nada se inventa: todo sale de la escena y del resultado.
 */
import type { Resultado } from "@croquis/scene-schema";
import type { Mesh2D } from "./road-geometry";

type Vec2 = { x: number; y: number };

/** Ancho de los trazos de pintura (m): el de una raya de carril. */
export const PAINT_WIDTH = 0.15;
/** Trazo y espacio de lo discontinuo (m): la trayectoria. */
const DASH = 1.0;
const GAP = 0.8;
/**
 * Trazo y espacio del contorno de dónde quedó: más cortos que los de la trayectoria, para que un
 * auto de 4 m se lea como un rectángulo discontinuo y no como rayas sueltas.
 */
const DASH_CONTORNO = 0.45;
const GAP_CONTORNO = 0.25;

function emptyMesh(): Mesh2D {
  return { positions: [], indices: [] };
}

/** Un segmento de a a b como rectángulo de ancho w. */
function segment(m: Mesh2D, a: Vec2, b: Vec2, w: number): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return;
  const nx = (-(b.y - a.y) / len) * (w / 2);
  const ny = ((b.x - a.x) / len) * (w / 2);
  const base = m.positions.length / 2;
  m.positions.push(a.x + nx, a.y + ny, a.x - nx, a.y - ny, b.x - nx, b.y - ny, b.x + nx, b.y + ny);
  m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Una polilínea, continua o discontinua. */
function polyline(
  m: Mesh2D,
  pts: readonly Vec2[],
  w: number,
  dashed: boolean,
  dash = DASH,
  gap = GAP,
): void {
  if (!dashed) {
    for (let i = 0; i + 1 < pts.length; i++) segment(m, pts[i]!, pts[i + 1]!, w);
    return;
  }
  let on = true;
  let left = dash;
  for (let i = 0; i + 1 < pts.length; i++) {
    let a = pts[i]!;
    const b = pts[i + 1]!;
    let len = Math.hypot(b.x - a.x, b.y - a.y);
    while (len > 1e-6) {
      const step = Math.min(left, len);
      const f = step / len;
      const c = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      if (on) segment(m, a, c, w);
      a = c;
      len -= step;
      left -= step;
      if (left <= 1e-6) {
        on = !on;
        left = on ? dash : gap;
      }
    }
  }
}

/** Contorno de un vehículo (rectángulo largo × ancho) centrado en p con rumbo h (grados). */
function outline(
  m: Mesh2D,
  p: Vec2,
  h: number,
  largo: number,
  ancho: number,
  dashed: boolean,
): void {
  const r = (h * Math.PI) / 180;
  const u = { x: Math.cos(r), y: Math.sin(r) };
  const n = { x: -u.y, y: u.x };
  const c = (s: number, t: number) => ({
    x: p.x + u.x * s * (largo / 2) + n.x * t * (ancho / 2),
    y: p.y + u.y * s * (largo / 2) + n.y * t * (ancho / 2),
  });
  const pts = [c(1, 1), c(-1, 1), c(-1, -1), c(1, -1), c(1, 1)];
  polyline(m, pts, PAINT_WIDTH, dashed, DASH_CONTORNO, GAP_CONTORNO);
  // Una raya al frente: de qué lado va la defensa delantera.
  segment(m, c(0.78, 0.8), c(0.78, -0.8), PAINT_WIDTH);
}

export interface CroquisPaint {
  /** Siluetas y trayectorias (blanco vial). */
  lines: Mesh2D;
  /** La X del punto de impacto (naranja de marcaje: evidencia). */
  impact: Mesh2D;
}

export function buildCroquisPaint(resultado: Resultado): CroquisPaint {
  const lines = emptyMesh();
  const impact = emptyMesh();
  for (const v of resultado.vehiculos) {
    const tr = v.trayectoria;
    const n = tr.t.length;
    if (n === 0) continue;
    const { largo_m: L, ancho_m: W } = v.dimensiones;
    // Dónde empieza (continuo) y dónde queda (discontinuo), como en el croquis 2D.
    outline(lines, { x: tr.x[0]!, y: tr.y[0]! }, (tr.rumbo[0]! * 180) / Math.PI, L, W, false);
    outline(
      lines,
      { x: tr.x[n - 1]!, y: tr.y[n - 1]! },
      (tr.rumbo[n - 1]! * 180) / Math.PI,
      L,
      W,
      true,
    );
    // La trayectoria del solver, una muestra cada ~0.1 s.
    const stride = Math.max(1, Math.round(0.1 / Math.max(resultado.dt, 1e-3)));
    const pts: Vec2[] = [];
    for (let i = 0; i < n; i += stride) pts.push({ x: tr.x[i]!, y: tr.y[i]! });
    pts.push({ x: tr.x[n - 1]!, y: tr.y[n - 1]! });
    polyline(lines, pts, PAINT_WIDTH * 0.8, true);
  }
  const p = resultado.punto_impacto;
  if (p) {
    const s = 0.9;
    segment(impact, { x: p.x - s, y: p.y - s }, { x: p.x + s, y: p.y + s }, PAINT_WIDTH * 1.6);
    segment(impact, { x: p.x - s, y: p.y + s }, { x: p.x + s, y: p.y - s }, PAINT_WIDTH * 1.6);
  }
  return { lines, impact };
}
