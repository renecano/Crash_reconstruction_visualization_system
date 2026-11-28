/**
 * El eje real de la calle del choque (ronda 4; René, 2026-11-19: «la trayectoria sigue la geometría
 * real de la calle, no el arco de plantilla»). De las calles guardadas con el caso
 * (`caso.lugar.calles_del_mapa`) se toma la vía donde fue el choque y, si de verdad curva cerca de
 * él, su polilínea en metros de la escena: el solver la sigue (`lugar.eje_via`) y el vehículo arranca
 * sobre ella, no en línea recta. En una calle recta no cambia nada.
 */
type P = { x: number; y: number };

/** Los tipos de OSM por los que circulan vehículos (sin andadores, ciclovías ni escaleras). */
/** Los tipos de vía de OSM por donde circulan vehículos. */
export const VIAS_DE_VEHICULOS: ReadonlySet<string> = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "residential",
  "unclassified",
  "living_street",
  "service",
  "road",
]);

/** m: la vía del choque está a menos de esto del punto de impacto. */
export const ALCANCE_VIA_M = 15;
/** m: lo que se guarda del eje a cada lado del choque. */
export const TRAMO_EJE_M = 150;
/** Grados: con menos giro que esto entre 30 m antes y 30 m después del choque, la calle es recta. */
export const GIRO_MINIMO_DEG = 10;

export interface EjeCalle {
  puntos: P[];
  nombre: string | null;
  /** Cuánto gira la calle entre 30 m antes y 30 m después del choque (grados). */
  giro_deg: number;
}

const acumulada = (pts: readonly P[]) => {
  const acc = [0];
  for (let i = 1; i < pts.length; i++)
    acc.push(acc[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  return acc;
};

/** La abscisa (m a lo largo) y la distancia de `p` a la polilínea. */
export function proyectar(pts: readonly P[], p: P): { s: number; d: number } {
  const acc = acumulada(pts);
  let mejor = { s: 0, d: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const d = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
    if (d < mejor.d) mejor = { s: acc[i - 1]! + t * (acc[i]! - acc[i - 1]!), d };
  }
  return mejor;
}

/** El punto del eje a `s` m (recta más allá de los extremos) y su tangente unitaria. */
export function enEje(pts: readonly P[], s: number): { p: P; t: P } {
  const acc = acumulada(pts);
  const punto = (u: number): P => {
    // El tramo donde cae `u`; antes del principio, el primero; después del final, el último (recto).
    let i = acc.findIndex((x) => x >= u);
    if (i === -1) i = pts.length - 1;
    i = Math.max(1, i);
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = acc[i]! - acc[i - 1]!;
    const f = seg > 0 ? (u - acc[i - 1]!) / seg : 0;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  const p0 = punto(s - 2);
  const p1 = punto(s + 2);
  const n = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  return { p: punto(s), t: { x: (p1.x - p0.x) / n, y: (p1.y - p0.y) / n } };
}

/**
 * El eje de la vía del choque, si curva cerca de él: la vía de vehículos más cercana al punto de
 * impacto (a menos de `ALCANCE_VIA_M`), recortada a `TRAMO_EJE_M` de cada lado. null si no hay calles
 * cerca o si la calle es recta (con menos de `GIRO_MINIMO_DEG` de giro).
 */
export function ejeDeLaCalle(
  vias: readonly { tipo: string; nombre?: string; puntos: P[] }[],
  choque: P,
): EjeCalle | null {
  let mejor: { v: (typeof vias)[number]; d: number } | null = null;
  for (const v of vias) {
    if (!VIAS_DE_VEHICULOS.has(v.tipo) || v.puntos.length < 2) continue;
    const { d } = proyectar(v.puntos, choque);
    if (d <= ALCANCE_VIA_M && (!mejor || d < mejor.d)) mejor = { v, d };
  }
  if (!mejor) return null;
  const pts = mejor.v.puntos;
  const { s } = proyectar(pts, choque);
  const antes = enEje(pts, s - 30).t;
  const despues = enEje(pts, s + 30).t;
  const giro = Math.abs(
    (Math.atan2(
      antes.x * despues.y - antes.y * despues.x,
      antes.x * despues.x + antes.y * despues.y,
    ) *
      180) /
      Math.PI,
  );
  if (giro < GIRO_MINIMO_DEG) return null;
  const acc = acumulada(pts);
  const recorte = pts.filter((_, i) => Math.abs(acc[i]! - s) <= TRAMO_EJE_M);
  // Con los extremos del tramo, para que no quede un hueco si los vértices están lejos.
  const ini = enEje(pts, Math.max(0, s - TRAMO_EJE_M)).p;
  const fin = enEje(pts, Math.min(acc[acc.length - 1]!, s + TRAMO_EJE_M)).p;
  const puntos = [ini, ...recorte, fin].filter(
    (p, i, xs) => i === 0 || Math.hypot(p.x - xs[i - 1]!.x, p.y - xs[i - 1]!.y) > 0.05,
  );
  return {
    puntos: puntos.map((p) => ({
      x: Math.round(p.x * 1000) / 1000,
      y: Math.round(p.y * 1000) / 1000,
    })),
    nombre: mejor.v.nombre ?? null,
    giro_deg: Math.round(giro),
  };
}

/**
 * La pose de arranque sobre la curva: `atras` m antes del choque a lo largo del eje, con la misma
 * separación del eje que el vehículo tiene en el choque y la tangente en el sentido en que avanza.
 */
export function arranqueSobreElEje(
  eje: readonly P[],
  choque: P,
  rumboRad: number,
  atras: number,
): { x: number; y: number; rumboRad: number } {
  const { s } = proyectar(eje, choque);
  const { p, t } = enEje(eje, s);
  const signo = Math.cos(rumboRad) * t.x + Math.sin(rumboRad) * t.y >= 0 ? 1 : -1;
  const n = { x: -t.y * signo, y: t.x * signo };
  const lado = (choque.x - p.x) * n.x + (choque.y - p.y) * n.y;
  const a = enEje(eje, s - signo * atras);
  const na = { x: -a.t.y * signo, y: a.t.x * signo };
  return {
    x: a.p.x + na.x * lado,
    y: a.p.y + na.y * lado,
    rumboRad: Math.atan2(a.t.y * signo, a.t.x * signo),
  };
}
