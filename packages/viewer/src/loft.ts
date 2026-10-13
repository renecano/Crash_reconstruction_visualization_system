/**
 * Carrocerías por secciones transversales ("loft") con densidad de malla uniforme.
 *
 * `ExtrudeGeometry` deja cada costado como un polígono triangulado sin vértices interiores, así
 * que una deformación lateral no tendría dónde actuar. Aquí la superficie se arma con estaciones
 * a lo largo del vehículo (cada `spacing` m), cada una con una sección de trapecio de esquinas
 * redondeadas muestreada a paso uniforme, y las tapas de los extremos con anillos concéntricos.
 * Resultado: vértices cada pocos centímetros en todas las caras, que F4 deforma con el perfil
 * C1–C6 del solver.
 *
 * Marco: x adelante, y arriba, z = −izquierda (igual que `vehicle-geometry.ts`).
 */
import { BufferAttribute, BufferGeometry } from "three";

export interface LoftStation {
  x: number;
  /** Altura de la base y del techo de la sección. */
  y0: number;
  y1: number;
  /** Medio ancho en la base y en el techo. */
  w0: number;
  w1: number;
}

export interface LoftOptions {
  /** Paso aproximado entre puntos de una sección (m). */
  step: number;
  /** Radio de redondeo de las esquinas (m). */
  radius: number;
  /** Anillos concéntricos en cada tapa. */
  capRings: number;
}

/** Puntos (y, z) de una sección, en sentido antihorario visto desde +x, empezando abajo al centro. */
export function sectionPoints(st: LoftStation, n: number, radius: number): [number, number][] {
  const h = Math.max(1e-4, st.y1 - st.y0);
  const r = Math.min(radius, h / 2.2, st.w0 / 2.2, st.w1 / 2.2);
  // Contorno base: trapecio (antihorario visto desde +x con z hacia la derecha = −izquierda).
  const corners: [number, number][] = [
    [st.y0, st.w0],
    [st.y1, st.w1],
    [st.y1, -st.w1],
    [st.y0, -st.w0],
  ];
  // Polilínea con esquinas redondeadas (arco de 4 segmentos por esquina).
  const poly: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const prev = corners[(i + 3) % 4] as [number, number];
    const cur = corners[i] as [number, number];
    const next = corners[(i + 1) % 4] as [number, number];
    const d1 = norm([prev[0] - cur[0], prev[1] - cur[1]]);
    const d2 = norm([next[0] - cur[0], next[1] - cur[1]]);
    const a: [number, number] = [cur[0] + d1[0] * r, cur[1] + d1[1] * r];
    const b: [number, number] = [cur[0] + d2[0] * r, cur[1] + d2[1] * r];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      // Bezier cuadrática a-cur-b como aproximación del arco.
      const y = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cur[0] + t * t * b[0];
      const z = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cur[1] + t * t * b[1];
      poly.push([y, z]);
    }
  }
  // Remuestreo uniforme a n puntos por longitud de arco.
  const lens = [0];
  for (let i = 1; i <= poly.length; i++) {
    const p = poly[i - 1] as [number, number];
    const q = poly[i % poly.length] as [number, number];
    lens.push((lens[i - 1] ?? 0) + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  const total = lens[lens.length - 1] ?? 1;
  const out: [number, number][] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (j < poly.length - 1 && (lens[j + 1] ?? 0) < target) j++;
    const p = poly[j] as [number, number];
    const q = poly[(j + 1) % poly.length] as [number, number];
    const seg = (lens[j + 1] ?? 0) - (lens[j] ?? 0);
    const f = seg > 0 ? (target - (lens[j] ?? 0)) / seg : 0;
    out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
  }
  return out;
}

function norm(v: [number, number]): [number, number] {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

/** Superficie cerrada a partir de estaciones ordenadas de atrás hacia adelante. */
export function loftGeometry(stations: readonly LoftStation[], opts: LoftOptions): BufferGeometry {
  if (stations.length < 2) throw new Error("Se necesitan al menos dos estaciones");
  const maxPerimeter = Math.max(
    ...stations.map((s) => 2 * (s.w0 + s.w1) + 2 * Math.hypot(s.y1 - s.y0, s.w1 - s.w0)),
  );
  const n = Math.max(16, Math.ceil(maxPerimeter / opts.step / 4) * 4);
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = stations.map((st) => sectionPoints(st, n, opts.radius));
  rings.forEach((ring, i) => {
    const x = (stations[i] as LoftStation).x;
    for (const [y, z] of ring) positions.push(x, y, z);
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const a = i * n + k;
      const b = i * n + ((k + 1) % n);
      const c = (i + 1) * n + ((k + 1) % n);
      const d = (i + 1) * n + k;
      // Normales hacia afuera: el anillo va antihorario visto desde +x y las estaciones avanzan en +x.
      indices.push(a, c, b, a, d, c);
    }
  }
  // Tapas: anillos concéntricos hacia el centro de la sección; la trasera y la delantera tienen
  // orden de vértices opuesto para que ambas normales apunten hacia afuera.
  const cap = (ringIndex: number, reversed: boolean): void => {
    const ring = rings[ringIndex] as [number, number][];
    const x = (stations[ringIndex] as LoftStation).x;
    const cy = ring.reduce((acc, p) => acc + p[0], 0) / n;
    const cz = ring.reduce((acc, p) => acc + p[1], 0) / n;
    let prevStart = ringIndex * n;
    for (let rIdx = 1; rIdx <= opts.capRings; rIdx++) {
      const f = 1 - rIdx / (opts.capRings + 1);
      const start = positions.length / 3;
      for (const [y, z] of ring) positions.push(x, cy + (y - cy) * f, cz + (z - cz) * f);
      for (let k = 0; k < n; k++) {
        const a = prevStart + k;
        const b = prevStart + ((k + 1) % n);
        const c = start + ((k + 1) % n);
        const d = start + k;
        if (reversed) indices.push(a, b, c, a, c, d);
        else indices.push(a, c, b, a, d, c);
      }
      prevStart = start;
    }
    const center = positions.length / 3;
    positions.push(x, cy, cz);
    for (let k = 0; k < n; k++) {
      const a = prevStart + k;
      const b = prevStart + ((k + 1) % n);
      if (reversed) indices.push(a, b, center);
      else indices.push(a, center, b);
    }
  };
  cap(0, true);
  cap(rings.length - 1, false);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Estaciones cada `spacing` m entre xa y xb a partir de funciones de la sección. */
export function stationsAlong(
  xa: number,
  xb: number,
  spacing: number,
  section: (x: number) => Omit<LoftStation, "x">,
): LoftStation[] {
  const count = Math.max(2, Math.ceil((xb - xa) / spacing) + 1);
  return Array.from({ length: count }, (_, i) => {
    const x = xa + ((xb - xa) * i) / (count - 1);
    return { x, ...section(x) };
  });
}
