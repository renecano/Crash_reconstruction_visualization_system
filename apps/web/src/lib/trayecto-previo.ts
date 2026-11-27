/**
 * El trayecto previo de un vehículo (René, 2026-11-27): «los peritos quieren ver el choque desde donde
 * venía cada vehículo, a veces desde unos kilómetros antes». Es **ilustrativo, no evidencia**: no entra
 * al solver ni a ninguna cifra, y el tramo reconstruido (los últimos segundos) no cambia.
 *
 * Con la ruta por las calles (de donde marcó el perito hasta donde empieza la reconstrucción), el
 * vehículo va a la velocidad reconstruida antes del impacto, nunca más rápido, y frena en curvas y
 * vueltas:
 * - en una curva de radio R, a lo más √(a_lat · R), con a_lat = 0.35 g: el extremo bajo de la
 *   aceleración lateral cómoda con la que los conductores eligen su velocidad en curvas cerradas
 *   (0.35–0.40 g; «Automobiles on Horizontal Curves: Experiments and Observations», TRR 1628, 1998,
 *   doi 10.3141/1628-07);
 * - frena a 3.4 m/s², la tasa que AASHTO toma como cómoda para la mayoría de los conductores;
 * - acelera a 1.5 m/s² (supuesto ilustrativo, sin medición propia; anotado en «Endurecimiento
 *   pendiente»).
 * Termina en el primer punto de la reconstrucción, a su velocidad y en su instante: empalma sin saltos.
 */

export const ACELERACION_LATERAL = 0.35 * 9.81;
export const FRENADO = 3.4;
export const ARRANQUE = 1.5;
/** El trayecto más largo que se traza (m). */
export const TRAYECTO_MAXIMO_M = 5000;
const PASO_M = 5;
const VELOCIDAD_MINIMA = 1.5;

export type Punto = readonly [number, number];

export interface TrayectoPrevio {
  /** La ruta en metros de la escena (x este, y norte), del inicio al primer punto de la reconstrucción. */
  puntos: [number, number][];
  /** El instante de cada punto (s; 0 es el impacto): el último es el inicio de la reconstrucción. */
  t: number[];
  /** La velocidad en cada punto (m/s). */
  v: number[];
  distancia_m: number;
  duracion_s: number;
}

const dist = (a: Punto, b: Punto) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** La polilínea con un punto a lo más cada `paso` metros (conserva los vértices). */
export function remuestrear(puntos: readonly Punto[], paso = PASO_M): [number, number][] {
  const salida: [number, number][] = [];
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i]!;
    if (i === 0) {
      salida.push([a[0], a[1]]);
      continue;
    }
    const p = puntos[i - 1]!;
    const d = dist(p, a);
    if (d < 1e-6) continue;
    const n = Math.max(1, Math.ceil(d / paso));
    for (let k = 1; k <= n; k++)
      salida.push([p[0] + ((a[0] - p[0]) * k) / n, p[1] + ((a[1] - p[1]) * k) / n]);
  }
  return salida;
}

/** La curvatura (1/m) en cada punto: el círculo por el punto y sus vecinos a ±`k` pasos. */
export function curvaturas(p: readonly Punto[], k = 2): number[] {
  return p.map((b, i) => {
    const a = p[Math.max(0, i - k)]!;
    const c = p[Math.min(p.length - 1, i + k)]!;
    const ab = dist(a, b);
    const bc = dist(b, c);
    const ca = dist(c, a);
    if (ab < 1e-6 || bc < 1e-6 || ca < 1e-6) return 0;
    const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    return (2 * area2) / (ab * bc * ca);
  });
}

/**
 * El trayecto con su velocidad y sus tiempos. `vFin` (m/s) y `tFin` (s) son los del primer punto de la
 * reconstrucción, que debe ser el último de `ruta`.
 */
export function perfilDelTrayecto(
  ruta: readonly Punto[],
  vFin: number,
  tFin: number,
): TrayectoPrevio {
  const p = remuestrear(ruta);
  const n = p.length;
  const vTope = Math.max(VELOCIDAD_MINIMA, vFin);
  const kappa = curvaturas(p);
  const v = kappa.map((k) =>
    Math.max(VELOCIDAD_MINIMA, Math.min(vTope, k > 0 ? Math.sqrt(ACELERACION_LATERAL / k) : vTope)),
  );
  v[n - 1] = vFin;
  const d = p.map((q, i) => (i === 0 ? 0 : dist(p[i - 1]!, q)));
  // Hacia atrás: llega frenando a cada curva y al empalme.
  for (let i = n - 2; i >= 0; i--)
    v[i] = Math.min(v[i]!, Math.sqrt(v[i + 1]! ** 2 + 2 * FRENADO * d[i + 1]!));
  // Hacia adelante: sale de cada curva acelerando.
  for (let i = 1; i < n - 1; i++)
    v[i] = Math.min(v[i]!, Math.sqrt(v[i - 1]! ** 2 + 2 * ARRANQUE * d[i]!));
  // El empalme manda: termina a la velocidad reconstruida (si una vuelta cae justo antes, ahí acelera más).
  v[n - 1] = vFin;
  const t = new Array<number>(n).fill(tFin);
  for (let i = n - 2; i >= 0; i--) {
    const media = Math.max(VELOCIDAD_MINIMA, (v[i]! + v[i + 1]!) / 2);
    t[i] = t[i + 1]! - d[i + 1]! / media;
  }
  const distancia = d.reduce((s, x) => s + x, 0);
  return { puntos: p, t, v, distancia_m: distancia, duracion_s: tFin - t[0]! };
}

/** «2.1 km · ~3 min 40 s» para la línea del vehículo en La escena. */
export function textoDelTrayecto(tr: Pick<TrayectoPrevio, "distancia_m" | "duracion_s">): string {
  const km =
    tr.distancia_m >= 1000
      ? `${(tr.distancia_m / 1000).toFixed(1)} km`
      : `${Math.round(tr.distancia_m)} m`;
  const s = Math.round(tr.duracion_s);
  const dur = s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`;
  return `${km} · ~${dur}`;
}

/** Un punto del mapa. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** El trayecto como va en el paquete caso-3d (`escenario.vehiculos[].trayecto_previo`). */
export interface TrayectoDelPaquete {
  x: number[];
  y: number[];
  t: number[];
  v_ms: number[];
  distancia_m: number;
}

const RADIO_TIERRA_M = 6371008.8;

/** De metros de la escena (x este, y norte) a lat/lon, alrededor de `origen` ([lon, lat]). */
export function aLatLon(x: number, y: number, origen: readonly [number, number]): LatLon {
  const k = (Math.PI / 180) * RADIO_TIERRA_M;
  return {
    lat: origen[1] + y / k,
    lon: origen[0] + x / (k * Math.cos((origen[1] * Math.PI) / 180)),
  };
}

/** De lat/lon a metros de la escena (la misma proyección que las calles del mapa, `enu`). */
export function aMetros(p: LatLon, origen: readonly [number, number]): [number, number] {
  const k = (Math.PI / 180) * RADIO_TIERRA_M;
  return [(p.lon - origen[0]) * k * Math.cos((origen[1] * Math.PI) / 180), (p.lat - origen[1]) * k];
}

interface TrayectoriaResultado {
  t: number[];
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
}

/** La ruta por las calles (`/api/ruta`), o null si no se pudo: sin ruta no se inventa un trayecto. */
export async function pedirRuta(
  desde: LatLon,
  hasta: LatLon,
  pedir: typeof fetch = fetch,
): Promise<
  { puntos: [number, number][]; distancia_m: number; duracion_s: number } | { error: string }
> {
  const q = new URLSearchParams({
    desde_lat: String(desde.lat),
    desde_lon: String(desde.lon),
    hasta_lat: String(hasta.lat),
    hasta_lon: String(hasta.lon),
  });
  try {
    const r = await pedir(`/api/ruta?${q}`);
    const j = (await r.json()) as {
      puntos?: [number, number][];
      distancia_m?: number;
      duracion_s?: number;
      error?: string;
    };
    if (!r.ok || !j.puntos)
      return { error: j.error ?? "No se pudo trazar la ruta por las calles." };
    return { puntos: j.puntos, distancia_m: j.distancia_m ?? 0, duracion_s: j.duracion_s ?? 0 };
  } catch {
    return { error: "No se pudo trazar la ruta por las calles (sin red)." };
  }
}

/**
 * Los trayectos previos del paquete, por id del vehículo en el Resultado: la ruta por las calles desde
 * donde marcó el perito hasta el primer punto de su trayectoria, con el perfil de velocidad. Un vehículo
 * sin ruta (sin red o sin camino) se queda sin trayecto.
 */
export async function trayectosDelCaso(
  previos: Readonly<Record<string, LatLon>>,
  vehiculos: readonly { id: string; trayectoria: TrayectoriaResultado }[],
  origen: readonly [number, number],
  pedir: typeof fetch = fetch,
): Promise<Record<string, TrayectoDelPaquete>> {
  const salida: Record<string, TrayectoDelPaquete> = {};
  for (const [id, inicio] of Object.entries(previos)) {
    const tr = vehiculos.find((v) => v.id === id)?.trayectoria;
    if (!tr?.t.length) continue;
    const x0 = tr.x[0]!;
    const y0 = tr.y[0]!;
    const ruta = await pedirRuta(inicio, aLatLon(x0, y0, origen), pedir);
    if ("error" in ruta) continue;
    const metros = ruta.puntos.map(([lat, lon]) => aMetros({ lat, lon }, origen));
    // Termina exactamente en el primer punto de la reconstrucción.
    metros.push([x0, y0]);
    const p = perfilDelTrayecto(metros, Math.hypot(tr.vx[0]!, tr.vy[0]!), tr.t[0]!);
    salida[id] = {
      x: p.puntos.map((q) => Math.round(q[0] * 100) / 100),
      y: p.puntos.map((q) => Math.round(q[1] * 100) / 100),
      t: p.t.map((t, i) => (i === p.t.length - 1 ? tr.t[0]! : Math.round(t * 1000) / 1000)),
      v_ms: p.v.map((v) => Math.round(v * 100) / 100),
      distancia_m: Math.round(p.distancia_m * 10) / 10,
    };
  }
  return salida;
}
