/**
 * La geometría de la maqueta (rediseño «Laboratorio», prompt §7): la escena vista desde arriba que
 * genera el caso, sin nada decorativo. Todo sale del resultado del solver (metros; X al este, Y al
 * norte; rumbo en radianes antihorario desde +X) y de la red vial del caso.
 */

export interface TrayectoriaResultado {
  t: number[];
  x: number[];
  y: number[];
  rumbo: number[];
  vx: number[];
  vy: number[];
}

export interface VehiculoResultado {
  id: string;
  rol: string;
  clase: string;
  dimensiones: { largo_m: number; ancho_m: number };
  trayectoria: TrayectoriaResultado;
  v_impacto_kmh?: number;
  pose_final?: { x: number; y: number; rumbo_deg: number };
  dano?: { ancho_m: number; centro_m: number; cdc?: { lado?: string } } | null;
}

export interface ResultadoMaqueta {
  t_inicio: number;
  t_fin: number;
  punto_impacto?: { x: number; y: number } | null;
  vehiculos: VehiculoResultado[];
  eventos?: { tipo: string; t: number }[];
}

export interface Pose {
  x: number;
  y: number;
  /** Radianes, antihorario desde +X. */
  rumbo: number;
}

/** El instante del primer impacto (0 si el resultado no lo dice). */
export function tImpacto(r: ResultadoMaqueta): number {
  const e = (r.eventos ?? []).filter((x) => x.tipo.startsWith("impacto")).sort((a, b) => a.t - b.t);
  return e[0]?.t ?? 0;
}

/** La pose interpolada en `t` (se queda en los extremos fuera del intervalo). */
export function poseEn(tr: TrayectoriaResultado, t: number): Pose {
  const n = tr.t.length;
  if (!n) return { x: 0, y: 0, rumbo: 0 };
  if (t <= tr.t[0]!) return { x: tr.x[0]!, y: tr.y[0]!, rumbo: tr.rumbo[0]! };
  if (t >= tr.t[n - 1]!) return { x: tr.x[n - 1]!, y: tr.y[n - 1]!, rumbo: tr.rumbo[n - 1]! };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (tr.t[m]! <= t) lo = m;
    else hi = m;
  }
  const f = (t - tr.t[lo]!) / (tr.t[hi]! - tr.t[lo]! || 1);
  const lerp = (a: number[]) => a[lo]! + f * (a[hi]! - a[lo]!);
  return { x: lerp(tr.x), y: lerp(tr.y), rumbo: lerp(tr.rumbo) };
}

/** La rapidez (km/h) en la muestra i. */
export const kmhEn = (tr: TrayectoriaResultado, i: number) =>
  Math.hypot(tr.vx[i] ?? 0, tr.vy[i] ?? 0) * 3.6;

/** La rapidez (km/h) justo antes del instante t: la última muestra anterior a él (o la primera). */
export function kmhAntesDe(tr: TrayectoriaResultado, t: number): number {
  let i = 0;
  while (i + 1 < tr.t.length && tr.t[i + 1]! < t) i++;
  return kmhEn(tr, i);
}

/**
 * La estela (prompt §7): las poses cada `paso` segundos antes del impacto, de la más vieja a la
 * más reciente, con su opacidad creciente hacia el impacto. Solo si el vehículo se movía.
 */
export function estela(
  tr: TrayectoriaResultado,
  desde: number,
  hasta: number,
  paso = 0.4,
): { pose: Pose; t: number; opacidad: number }[] {
  const ts: number[] = [];
  for (let t = hasta - paso; t >= desde - 1e-9; t -= paso) ts.unshift(Number(t.toFixed(3)));
  const out = ts.map((t) => ({ t, pose: poseEn(tr, t) }));
  const recorrido =
    out.length > 1
      ? Math.hypot(out.at(-1)!.pose.x - out[0]!.pose.x, out.at(-1)!.pose.y - out[0]!.pose.y)
      : 0;
  if (recorrido < 0.5) return [];
  return out.map((o, k) => ({ ...o, opacidad: 0.12 + (0.5 * (k + 1)) / out.length }));
}

/** Un vehículo de la versión declarada, para dibujarlo sobre la reconstrucción (T6.2). */
export interface VehiculoDeclarado {
  id: string;
  rol: string;
  clase: string;
  dimensiones: { largo_m: number; ancho_m: number };
  /** Su camino hasta el impacto de su versión, en puntos de la escena. */
  camino: { x: number; y: number }[];
  /** Su pose en el instante que se dibuja. */
  pose: Pose;
  /** Dónde queda al final en su versión (null si el resultado no lo dice). */
  final: Pose | null;
  /** Lo más que se separa de la reconstrucción, en metros: en el camino, en ese instante o al final. */
  separacionM: number;
}

/** Cada cuánto se comparan las dos versiones a lo largo del camino (s). */
const PASO_COMPARACION_S = 0.2;

/**
 * La versión declarada de un conductor sobre la reconstrucción (T6.2): por cada vehículo de la
 * reconstrucción que también está en la declarada, su camino hasta el impacto, su pose en `t` y su
 * posición final.
 *
 * Las dos versiones se alinean por su impacto: cada resultado tiene el suyo en su propio reloj, así
 * que `t` (del reloj de la reconstrucción) se lleva al de la declarada. Un vehículo que en la
 * versión declarada va por donde va en la reconstrucción (menos de `umbralM` de separación en todo
 * momento) no se devuelve: no se dibuja dos veces lo mismo.
 */
export function versionDeclaradaEnMaqueta(
  reconstruida: ResultadoMaqueta,
  declarada: ResultadoMaqueta,
  t: number,
  umbralM = 0.5,
): VehiculoDeclarado[] {
  const tiR = tImpacto(reconstruida);
  const tiD = tImpacto(declarada);
  const aDeclarada = (x: number) => x - tiR + tiD;
  const lejos = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const out: VehiculoDeclarado[] = [];
  for (const vr of reconstruida.vehiculos) {
    const vd = declarada.vehiculos.find((x) => x.id === vr.id);
    if (!vd || !vd.trayectoria.t.length || !vr.trayectoria.t.length) continue;
    const tr = vd.trayectoria;
    let separacion = lejos(poseEn(tr, aDeclarada(t)), poseEn(vr.trayectoria, t));
    for (let x = reconstruida.t_inicio; x <= reconstruida.t_fin + 1e-9; x += PASO_COMPARACION_S) {
      separacion = Math.max(
        separacion,
        lejos(poseEn(tr, aDeclarada(x)), poseEn(vr.trayectoria, x)),
      );
    }
    const finR = vr.pose_final;
    const finD = vd.pose_final;
    if (finR && finD) separacion = Math.max(separacion, lejos(finR, finD));
    if (separacion < umbralM) continue;
    const camino: { x: number; y: number }[] = [];
    for (let i = 0; i < tr.t.length && tr.t[i]! <= tiD + 1e-9; i++) {
      camino.push({ x: tr.x[i]!, y: tr.y[i]! });
    }
    out.push({
      id: vd.id,
      rol: vd.rol,
      clase: vd.clase,
      dimensiones: vd.dimensiones,
      camino,
      pose: poseEn(tr, aDeclarada(t)),
      final: finD ? { x: finD.x, y: finD.y, rumbo: (finD.rumbo_deg * Math.PI) / 180 } : null,
      separacionM: separacion,
    });
  }
  return out;
}

/**
 * La trayectoria hasta el impacto en tramos, cada uno con su fracción de rapidez (0 = la más baja,
 * 1 = la más alta del tramo), para el degradado por velocidad real. Muestra cada `cada` puntos.
 */
export function tramosPorVelocidad(
  tr: TrayectoriaResultado,
  hasta: number,
  cada = 3,
): { x1: number; y1: number; x2: number; y2: number; f: number }[] {
  const idx: number[] = [];
  for (let i = 0; i < tr.t.length && tr.t[i]! <= hasta; i += cada) idx.push(i);
  if (idx.length < 2) return [];
  const v = idx.map((i) => kmhEn(tr, i));
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return idx.slice(1).map((i, k) => {
    const j = idx[k]!;
    return {
      x1: tr.x[j]!,
      y1: tr.y[j]!,
      x2: tr.x[i]!,
      y2: tr.y[i]!,
      f: hi - lo > 0.5 ? (v[k + 1]! - lo) / (hi - lo) : 1,
    };
  });
}

/** La caja [minX, minY, maxX, maxY] de las trayectorias y las poses finales, con margen (m). */
export function cajaDe(r: ResultadoMaqueta, margen = 6): [number, number, number, number] {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const v of r.vehiculos) {
    const tr = v.trayectoria;
    for (let i = 0; i < tr.x.length; i++) {
      a = Math.min(a, tr.x[i]!);
      b = Math.min(b, tr.y[i]!);
      c = Math.max(c, tr.x[i]!);
      d = Math.max(d, tr.y[i]!);
    }
  }
  if (!Number.isFinite(a)) return [-20, -20, 20, 20];
  return [a - margen, b - margen, c + margen, d + margen];
}

/**
 * El encuadre de la maqueta: alrededor del impacto, con los últimos `antes` segundos de cada
 * vehículo, su reposo y un margen; al menos `minimo` metros por lado. La trayectoria de antes se
 * sale del cuadro (prompt §7: la escena va a sangre).
 */
export function encuadre(
  r: ResultadoMaqueta,
  antes = 2.5,
  margen = 8,
  minimo = 30,
): [number, number, number, number] {
  const ti = tImpacto(r);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const v of r.vehiculos) {
    for (let t = ti - antes; t <= r.t_fin + 1e-9; t += 0.25) {
      const p = poseEn(v.trayectoria, t);
      xs.push(p.x);
      ys.push(p.y);
    }
    if (v.pose_final) {
      xs.push(v.pose_final.x);
      ys.push(v.pose_final.y);
    }
  }
  if (!xs.length) return [-minimo / 2, -minimo / 2, minimo / 2, minimo / 2];
  let [a, b, c, d] = [
    Math.min(...xs) - margen,
    Math.min(...ys) - margen,
    Math.max(...xs) + margen,
    Math.max(...ys) + margen,
  ];
  if (c - a < minimo) [a, c] = [(a + c) / 2 - minimo / 2, (a + c) / 2 + minimo / 2];
  if (d - b < minimo) [b, d] = [(b + d) / 2 - minimo / 2, (b + d) / 2 + minimo / 2];
  return [a, b, c, d];
}

/**
 * La cota del ancho de la vía más cercana a `p`: dos puntos sobre sus orillas, a `adelante` metros
 * del punto más cercano a lo largo del eje (para no pisar a los vehículos). null sin vías.
 */
export function cotaDeVia(
  vias: readonly { puntos: readonly { x: number; y: number }[]; ancho: number }[],
  p: { x: number; y: number },
  adelante = 14,
  anchoMedido?: number,
): { a: { x: number; y: number }; b: { x: number; y: number }; ancho: number } | null {
  let mejor: { d: number; x: number; y: number; ux: number; uy: number; ancho: number } | null =
    null;
  for (const v of vias) {
    for (let i = 0; i + 1 < v.puntos.length; i++) {
      const a = v.puntos[i]!;
      const b = v.puntos[i + 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (l * l)));
      const x = a.x + t * dx;
      const y = a.y + t * dy;
      const d = Math.hypot(p.x - x, p.y - y);
      if (!mejor || d < mejor.d) mejor = { d, x, y, ux: dx / l, uy: dy / l, ancho: v.ancho };
    }
  }
  if (!mejor) return null;
  const cx = mejor.x + mejor.ux * adelante;
  const cy = mejor.y + mejor.uy * adelante;
  const ancho = anchoMedido ?? mejor.ancho;
  const m = ancho / 2;
  return {
    a: { x: cx - mejor.uy * m, y: cy + mejor.ux * m },
    b: { x: cx + mejor.uy * m, y: cy - mejor.ux * m },
    ancho,
  };
}
