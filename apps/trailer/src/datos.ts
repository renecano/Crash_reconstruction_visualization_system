/**
 * Los datos del tráiler, con tipos: la escena inventada de referencia, su Resultado y las
 * simulaciones del solver (`datos/caso.json`, que genera `tools/trailer/datos-caso.mts`), y el
 * logotipo (`datos/marca.json`). Aquí no se inventa ni se redondea nada: solo se lee.
 */
import casoJson from "./datos/caso.json";
import marcaJson from "./datos/marca.json";

export interface VehiculoDelCaso {
  id: string;
  letra: string;
  clase: string;
  largo: number;
  ancho: number;
  v_impacto_kmh: number;
  final: { x: number; y: number; rumbo_deg: number };
  /** [t, x, y, rumbo] cada 0.02 s; t = 0 es el impacto. */
  trayectoria: number[][];
}

export interface Caso {
  caso: string;
  titulo: string;
  relato: string;
  citas: { inicio: number; fin: number; texto: string; campo: string }[];
  t_inicio: number;
  t_fin: number;
  impacto: { x: number; y: number };
  calle: {
    tiras: {
      center: { x: number; y: number };
      length: number;
      width: number;
      heading: number;
      lanes: number;
      median: number;
    }[];
  };
  evidencia: { id: string; tipo: string; puntos: { x: number; y: number }[] }[];
  eventos: { id: string; tipo: string; t: number; actores: string[] }[];
  vehiculos: VehiculoDelCaso[];
  simulaciones: {
    semilla: number;
    validas: number;
    orden_vehiculos: string[];
    muestras: { v0_kmh: number[]; v_impacto_kmh: number[]; caminos: number[][][] }[];
  };
}

export const CASO = casoJson as unknown as Caso;

export interface Marca {
  ancho: number;
  alto: number;
  simbolo: {
    en: [number, number];
    arco: string;
    arco_grosor: number;
    interior: { d: string; grosor: number; opacidad: number; guiones: string };
    mira: { radio: number; grosor: number; punto: number; rayas_grosor: number; rayas: number[][] };
  };
  palabra: { en: [number, number]; letras: { letra: string; d: string; x0: number; x1: number }[] };
}

export const MARCA = marcaJson as unknown as Marca;
/** Dónde va la mira del símbolo, en su lienzo de 64 (assets/brand/marca.json). */
export const MIRA_DEL_SIMBOLO: readonly [number, number] = [52, 32];

/** La pose de un vehículo en el instante `t` del Resultado (interpolada entre muestras). */
export function poseEn(v: VehiculoDelCaso, t: number): { x: number; y: number; rumbo: number } {
  const tr = v.trayectoria;
  const primero = tr[0]!;
  const ultimo = tr[tr.length - 1]!;
  if (t <= primero[0]!) return { x: primero[1]!, y: primero[2]!, rumbo: primero[3]! };
  if (t >= ultimo[0]!) return { x: ultimo[1]!, y: ultimo[2]!, rumbo: ultimo[3]! };
  const dt = tr[1]![0]! - primero[0]!;
  const i = Math.min(tr.length - 2, Math.floor((t - primero[0]!) / dt));
  const a = tr[i]!;
  const b = tr[i + 1]!;
  const u = (t - a[0]!) / (b[0]! - a[0]!);
  return {
    x: a[1]! + (b[1]! - a[1]!) * u,
    y: a[2]! + (b[2]! - a[2]!) * u,
    rumbo: a[3]! + (b[3]! - a[3]!) * u,
  };
}

/** El camino de un vehículo entre dos instantes, como polilínea. */
export function caminoEntre(v: VehiculoDelCaso, desde: number, hasta: number): [number, number][] {
  const out: [number, number][] = [];
  for (const p of v.trayectoria) if (p[0]! >= desde && p[0]! <= hasta) out.push([p[1]!, p[2]!]);
  return out;
}

/** Las rayas de la calle, a lo largo del eje x: las orillas, el camellón y los carriles. */
export function rayasDeLaCalle(): { y: number; tipo: "orilla" | "camellon" | "carril" }[] {
  const t = CASO.calle.tiras[0]!;
  const porLado = t.lanes / 2;
  const carril = (t.width - t.median) / t.lanes;
  const out: { y: number; tipo: "orilla" | "camellon" | "carril" }[] = [];
  for (const lado of [-1, 1]) {
    out.push({ y: t.center.y + (lado * t.median) / 2, tipo: "camellon" });
    for (let k = 1; k < porLado; k++)
      out.push({ y: t.center.y + lado * (t.median / 2 + carril * k), tipo: "carril" });
    out.push({ y: t.center.y + (lado * t.width) / 2, tipo: "orilla" });
  }
  return out.sort((a, b) => a.y - b.y);
}

/** De dónde a dónde va la calle en x. */
export function largoDeLaCalle(): [number, number] {
  const t = CASO.calle.tiras[0]!;
  return [t.center.x - t.length / 2, t.center.x + t.length / 2];
}

/** Percentil de una lista ya ordenada (interpolado). */
export function percentil(ordenada: readonly number[], p: number): number {
  if (!ordenada.length) return Number.NaN;
  const k = (ordenada.length - 1) * p;
  const i = Math.floor(k);
  const j = Math.min(ordenada.length - 1, i + 1);
  return ordenada[i]! + (ordenada[j]! - ordenada[i]!) * (k - i);
}

/**
 * La nube de «La física decide»: la velocidad con la que el vehículo `indice` llega al impacto en cada
 * simulación, agrupada de `paso` en `paso` km/h, con su rango central (p10 a p90).
 */
export function nubeDeVelocidades(
  indice: number,
  paso = 4,
): {
  columnas: { desde: number; n: number }[];
  p10: number;
  p50: number;
  p90: number;
  total: number;
} {
  const v = CASO.simulaciones.muestras.map((m) => m.v_impacto_kmh[indice]!).sort((a, b) => a - b);
  const desde = Math.floor(v[0]! / paso) * paso;
  const n = Math.floor((v[v.length - 1]! - desde) / paso) + 1;
  const columnas = Array.from({ length: n }, (_x, k) => ({ desde: desde + k * paso, n: 0 }));
  for (const x of v) columnas[Math.min(n - 1, Math.floor((x - desde) / paso))]!.n++;
  return {
    columnas,
    p10: percentil(v, 0.1),
    p50: percentil(v, 0.5),
    p90: percentil(v, 0.9),
    total: v.length,
  };
}
