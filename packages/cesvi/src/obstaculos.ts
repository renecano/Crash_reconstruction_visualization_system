/**
 * Los edificios y muros del lugar como obstáculos (René, 2026-11-24, punto 2): «los vehículos
 * atraviesan casas y muros de contención; las trayectorias no pueden cruzar edificios ni muros». Con
 * los edificios y los muros de OpenStreetMap alrededor del choque, se revisa el mismo recorrido que
 * reproduce el 3D (`especReconstruida`, simulado una vez): si un vehículo cruza uno, la reconstrucción
 * no cuadra, se dice cuál y a qué instante, y qué revisar. Las casas que dibuja el 3D se generan fuera
 * de lo que recorren los vehículos; los edificios reales del lugar no, y son los que ve el perito en
 * el mapa.
 *
 * También la geometría que usa la revisión de la cadena para el paquete 3D: puntos sobre la calzada,
 * rectángulos contra polígonos y saltos de una trayectoria.
 *
 * Coordenadas de la escena: x al este, y al norte, en metros; rumbo en radianes desde +x, antihorario.
 */
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { enMetros, type LonLat } from "./geo";
import { numero } from "./formato";
import { especReconstruida, type Reconstruccion } from "./reconstruccion";

type Json = Record<string, unknown>;

export interface Plano {
  x: number;
  y: number;
}

/** Un rectángulo orientado: el vehículo en un instante. */
export interface Rect {
  x: number;
  y: number;
  largo: number;
  ancho: number;
  rumbo: number;
}

/** Un edificio (polígono cerrado) o un muro (línea) del mapa, en longitud y latitud. */
export interface ObstaculoDelMapa {
  nombre: string;
  tipo: "edificio" | "muro";
  puntos: LonLat[];
}

export function esquinasRect(r: Rect): Plano[] {
  const c = Math.cos(r.rumbo);
  const s = Math.sin(r.rumbo);
  const l = r.largo / 2;
  const a = r.ancho / 2;
  return [
    [l, a],
    [-l, a],
    [-l, -a],
    [l, -a],
  ].map(([u, v]) => ({ x: r.x + u! * c - v! * s, y: r.y + u! * s + v! * c }));
}

function enTriangulo(p: Plano, a: Plano, b: Plano, c: Plano): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Si el punto cae sobre una malla en planta del paquete 3D (`posiciones` x, y seguidos; `indices`). */
export function sobreMalla(
  capa: { posiciones: readonly number[]; indices: readonly number[] },
  p: Plano,
): boolean {
  const v = (i: number): Plano => ({ x: capa.posiciones[2 * i]!, y: capa.posiciones[2 * i + 1]! });
  for (let k = 0; k + 2 < capa.indices.length; k += 3)
    if (enTriangulo(p, v(capa.indices[k]!), v(capa.indices[k + 1]!), v(capa.indices[k + 2]!)))
      return true;
  return false;
}

/** Si un punto cae dentro de un polígono (par-impar). */
export function enPoligono(p: Plano, poligono: readonly Plano[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i]!;
    const b = poligono[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      dentro = !dentro;
  }
  return dentro;
}

function cruzan(a: Plano, b: Plano, c: Plano, d: Plano): boolean {
  const o = (p: Plano, q: Plano, r: Plano) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** m que se encoge el vehículo por lado: OpenStreetMap dibuja los edificios con ~1 m de error. */
export const HOLGURA_MAPA_M = 0.5;

/** Si el rectángulo se mete en el polígono (un edificio) o cruza la línea (un muro). */
export function cruzaObstaculo(
  r: Rect,
  obstaculo: { puntos: readonly Plano[]; cerrado: boolean },
  holgura = HOLGURA_MAPA_M,
): boolean {
  const chico: Rect = {
    ...r,
    largo: Math.max(0.2, r.largo - 2 * holgura),
    ancho: Math.max(0.2, r.ancho - 2 * holgura),
  };
  const e = esquinasRect(chico);
  const pts = obstaculo.puntos;
  if (obstaculo.cerrado && (e.some((p) => enPoligono(p, pts)) || enPoligono(chico, pts)))
    return true;
  for (let i = 0; i < 4; i++)
    for (let k = 0; k + 1 < pts.length; k++)
      if (cruzan(e[i]!, e[(i + 1) % 4]!, pts[k]!, pts[k + 1]!)) return true;
  return false;
}

interface Trayectoria {
  t: readonly number[];
  x: readonly number[];
  y: readonly number[];
  rumbo: readonly number[];
}

export interface Salto {
  t: number;
  ms: number;
  tipo: "lateral" | "brinco";
}

/** m/s de lado que se aceptan antes del choque: un cambio de carril normal da ~1. */
export const LATERAL_MAXIMA_MS = 4;
/** Un brinco: más de 50 m/s (180 km/h) entre dos muestras. */
export const BRINCO_MS = 50;

/**
 * Los saltos de una trayectoria (punto 3): antes de su primer choque, moverse de lado más rápido que
 * `LATERAL_MAXIMA_MS` (un vehículo rodando no se desliza de lado, salvo un derrape narrado); en
 * cualquier momento, un brinco de posición. Después del choque, deslizarse de lado lo explica el golpe.
 */
export function saltosDe(tr: Trayectoria, primerChoque: number | null, derrapa = false): Salto[] {
  const out: Salto[] = [];
  for (let k = 0; k + 1 < tr.t.length; k++) {
    const dt = tr.t[k + 1]! - tr.t[k]!;
    if (dt <= 1e-6) continue;
    const dx = tr.x[k + 1]! - tr.x[k]!;
    const dy = tr.y[k + 1]! - tr.y[k]!;
    const v = Math.hypot(dx, dy) / dt;
    if (v > BRINCO_MS) {
      out.push({ t: tr.t[k]!, ms: v, tipo: "brinco" });
      continue;
    }
    if (derrapa || (primerChoque !== null && tr.t[k + 1]! > primerChoque - 0.05)) continue;
    const h = tr.rumbo[k]!;
    const lateral = Math.abs(-dx * Math.sin(h) + dy * Math.cos(h)) / dt;
    if (lateral > LATERAL_MAXIMA_MS) out.push({ t: tr.t[k]!, ms: lateral, tipo: "lateral" });
  }
  return out;
}

export interface Cruce {
  /** Id del solver del vehículo. */
  vehiculo: string;
  obstaculo: string;
  tipo: ObstaculoDelMapa["tipo"];
  t: number;
}

/**
 * Qué vehículos cruzan un obstáculo, y cuándo (el primer instante de cada par), en una trayectoria ya
 * simulada (`reconstructionToDict`), muestreada cada 0.1 s.
 */
export function crucesDeTrayectorias(
  vehiculos: readonly {
    id: string;
    dimensiones?: { largo_m?: number; ancho_m?: number };
    trayectoria?: Trayectoria;
  }[],
  obstaculos: readonly { nombre: string; tipo: ObstaculoDelMapa["tipo"]; puntos: Plano[] }[],
): Cruce[] {
  const out: Cruce[] = [];
  for (const v of vehiculos) {
    const tr = v.trayectoria;
    if (!tr?.t?.length) continue;
    const largo = v.dimensiones?.largo_m ?? 4.4;
    const ancho = v.dimensiones?.ancho_m ?? 1.8;
    const vistos = new Set<string>();
    let ultimo = -Infinity;
    for (let k = 0; k < tr.t.length; k++) {
      if (tr.t[k]! - ultimo < 0.1 && k !== tr.t.length - 1) continue;
      ultimo = tr.t[k]!;
      const rect = { x: tr.x[k]!, y: tr.y[k]!, largo, ancho, rumbo: tr.rumbo[k] ?? 0 };
      for (const ob of obstaculos) {
        if (vistos.has(ob.nombre)) continue;
        if (cruzaObstaculo(rect, { puntos: ob.puntos, cerrado: ob.tipo === "edificio" })) {
          vistos.add(ob.nombre);
          out.push({ vehiculo: v.id, obstaculo: ob.nombre, tipo: ob.tipo, t: tr.t[k]! });
        }
      }
    }
  }
  return out;
}

/**
 * La reconstrucción con los obstáculos del mapa: si el recorrido que reproduce el 3D cruza un edificio
 * o un muro, no cuadra (como el candado físico: la cifra no se presenta, el 3D queda quieto y se dice
 * qué revisar). Sin obstáculos, sin origen o ya sin animación, se devuelve igual.
 */
export function conObstaculos(
  r: Reconstruccion,
  obstaculos: readonly ObstaculoDelMapa[] | null,
  nombre: (id: string) => string = (id) => id,
): Reconstruccion {
  if (!obstaculos?.length || !r.origen || r.noCuadra) return r;
  const origen = r.origen;
  const enEscena = obstaculos.map((o) => ({
    nombre: o.nombre,
    tipo: o.tipo,
    puntos: o.puntos.map((p) => {
      const m = enMetros(p, origen);
      return { x: m.este, y: m.norte };
    }),
  }));
  let dict: Json;
  try {
    dict = reconstructionToDict(
      reconstruct(especReconstruida(r), { relieve: (r.relieve ?? null) as never }),
    );
  } catch {
    return r;
  }
  const cruces = crucesDeTrayectorias(
    (dict.vehiculos ?? []) as Parameters<typeof crucesDeTrayectorias>[0],
    enEscena,
  );
  if (!cruces.length) return r;
  const motivos = cruces.map((c) => {
    const id = r.ids[c.vehiculo] ?? c.vehiculo;
    return `${nombre(String(id))} cruza ${c.tipo === "edificio" ? "un edificio" : "un muro"} del mapa (${c.obstaculo}) a los ${numero(c.t, 1)} s: los vehículos no atraviesan casas ni muros.`;
  });
  const revisar = [
    "dónde quedó y por dónde venía cada vehículo, para que su recorrido vaya por la calle",
  ];
  const fijadas = r.velocidades.filter((v) => v.previa);
  if (!fijadas.length)
    return {
      ...r,
      limites: [...r.limites, ...motivos.map((m) => `No cuadra con el mapa: ${m}`)],
    };
  return {
    ...r,
    noCuadra: {
      motivos,
      revisar,
      cifras: fijadas.map((v) => ({
        vehiculo: v.vehiculo,
        mejor: v.previa!.mejor,
        ...(v.previa!.p10 !== undefined ? { p10: v.previa!.p10 } : {}),
        ...(v.previa!.p90 !== undefined ? { p90: v.previa!.p90 } : {}),
      })),
    },
    velocidades: r.velocidades.map((v) => ({ ...v, previa: null, impacto: null })),
    limites: [
      ...r.limites,
      ...motivos.map((m) => `No cuadra: ${m}`),
      `Croquis no presenta una velocidad hasta que cuadre. Revisa ${revisar.join("; ")}.`,
    ],
  };
}
