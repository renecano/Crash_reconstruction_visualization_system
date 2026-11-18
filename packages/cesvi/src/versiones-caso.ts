/**
 * Las versiones del caso (ronda 4, punto 8; René, 2026-11-18): la declaración de un conductor y las
 * hipótesis «¿y si…?» del perito, puestas a prueba con la misma física que la reconstrucción.
 *
 * Aquí, lo que hace falta para dibujar un «¿y si…?» y decir qué cambia, en el lenguaje del perito:
 *
 * - **El resultado de la hipótesis** (`resultadoDeHipotesis`): el de la reconstrucción con cada
 *   vehículo por donde va con esa decisión, del inicio hasta el primer contacto (las trayectorias de
 *   los agentes, que entrega el solver). La simulación de los conductores no calcula el choque: sin
 *   daño (perfil en ceros, Unity no lo dibuja), sin eventos y sin personas.
 * - **Qué cambia** (`cambiosDeHipotesis`): contra los mismos conductores sin la hipótesis, la
 *   velocidad de cada vehículo al contacto, dónde se tocan y cuánto se separa su trayectoria.
 *
 * Ninguna cifra es nueva: todas salen del bloque `agentes` del solver. Croquis no dice quién tiene
 * razón ni juzga a ningún conductor.
 */
import {
  DECISION_EN_PALABRAS,
  type HipotesisConductor,
  type PruebaConductores,
} from "./conductores";
import type { FilaDeclarada } from "./comparacion-declarada";
import type { Reconstruccion } from "./reconstruccion";
import { kmhConUnidad, metros, segundos } from "./formato";

type Json = Record<string, unknown>;

/** La trayectoria de un vehículo en la simulación de los conductores (ids de la escena). */
export interface TrayectoriaAgente {
  vehiculo: string;
  t: number[];
  x: number[];
  y: number[];
  rumbo: number[];
  vx: number[];
  vy: number[];
}

/** Las trayectorias de una simulación del bloque `agentes` («resultado» o «linea_base»). */
export function trayectoriasDe(sim: unknown): TrayectoriaAgente[] {
  const t = (sim as { trayectorias?: TrayectoriaAgente[] } | null)?.trayectorias;
  return Array.isArray(t) ? t : [];
}

/** La velocidad angular de una trayectoria muestreada: diferencias del rumbo (sin saltos de 2π). */
function velocidadAngular(t: readonly number[], rumbo: readonly number[]): number[] {
  const n = t.length;
  if (n < 2) return Array.from({ length: n }, () => 0);
  const giro = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return t.map((_, i) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dt = t[b]! - t[a]!;
    return dt > 0 ? giro(rumbo[a]!, rumbo[b]!) / dt : 0;
  });
}

/**
 * El resultado que dibujan el 2D y el 3D para una hipótesis «¿y si…?»: el de la reconstrucción con
 * los vehículos por donde van con esa decisión, hasta el primer contacto (o el fin del horizonte).
 * Null si el solver no entregó trayectorias.
 */
export function resultadoDeHipotesis(r: Reconstruccion, agentes: Json): Json | null {
  const tray = trayectoriasDe(agentes.resultado);
  if (!tray.length) return null;
  const base = r.resultado as Json & { vehiculos?: Json[] };
  const vehiculos = (base.vehiculos ?? []).flatMap((v) => {
    const tr = tray.find((x) => x.vehiculo === v.id);
    if (!tr?.t.length) return [];
    const n = tr.t.length - 1;
    const rapidez = Math.hypot(tr.vx[n]!, tr.vy[n]!);
    const dano = (v.dano ?? {}) as Json & { perfil_m?: number[] };
    return [
      {
        ...v,
        trayectoria: {
          t: tr.t,
          x: tr.x,
          y: tr.y,
          rumbo: tr.rumbo,
          vx: tr.vx,
          vy: tr.vy,
          vel_angular: velocidadAngular(tr.t, tr.rumbo),
        },
        // La simulación de los conductores no calcula el choque: ni deformación ni ΔV.
        v_impacto_kmh: 3.6 * rapidez,
        delta_v_kmh: 0,
        dano: { ...dano, perfil_m: (dano.perfil_m ?? [0, 0, 0, 0, 0, 0]).map(() => 0) },
        danos_posteriores: undefined,
        pdof_horas: undefined,
        volcadura: undefined,
        en_reposo: rapidez < 0.05,
        pose_final: { x: tr.x[n]!, y: tr.y[n]!, rumbo_deg: (tr.rumbo[n]! * 180) / Math.PI },
        distancia_post_m: 0,
      },
    ];
  });
  const t0 = tray[0]!.t[0]!;
  const t1 = tray[0]!.t[tray[0]!.t.length - 1]!;
  const out: Json = {
    ...base,
    t_inicio: t0,
    t_fin: t1,
    punto_impacto: base.punto_impacto,
    vehiculos,
    personas: [],
    eventos: [],
  };
  // Lo que es de la reconstrucción y no de la hipótesis: fuera.
  for (const k of ["incertidumbre", "inversion", "inversion_reposo_supuesto", "consistencia"])
    delete out[k];
  delete out.agentes;
  return JSON.parse(JSON.stringify(out)) as Json;
}

/** Una diferencia de la versión contra la reconstrucción, como la lee el perito. */
export interface CambioVersion {
  clave: "velocidad" | "contacto" | "trayectoria" | "punto";
  /** Qué se compara: «Velocidad al contacto · A · Nissan Versa». */
  concepto: string;
  /** Lo que da la versión. */
  version: string;
  /** Lo que da la reconstrucción (o los mismos conductores sin la hipótesis). */
  reconstruccion: string;
  /** Si cambia de verdad (más que el redondeo con el que se muestra). */
  cambia: boolean;
}

/** Dónde está un vehículo en `t` de su trayectoria muestreada (interpolación lineal). */
function enT(tr: TrayectoriaAgente, t: number): [number, number] {
  const n = tr.t.length;
  if (t <= tr.t[0]!) return [tr.x[0]!, tr.y[0]!];
  if (t >= tr.t[n - 1]!) return [tr.x[n - 1]!, tr.y[n - 1]!];
  let i = 1;
  while (i < n - 1 && tr.t[i]! < t) i++;
  const a = tr.t[i - 1]!;
  const b = tr.t[i]!;
  const u = b > a ? (t - a) / (b - a) : 0;
  return [
    tr.x[i - 1]! + u * (tr.x[i]! - tr.x[i - 1]!),
    tr.y[i - 1]! + u * (tr.y[i]! - tr.y[i - 1]!),
  ];
}

/**
 * Lo que cambia con la hipótesis contra los mismos conductores sin ella (ADR 0088), en el lenguaje
 * del perito: si hay contacto y a qué velocidad relativa; la velocidad de cada vehículo al contacto;
 * dónde se tocan (la distancia entre los dos puntos de contacto); y cuánto se separa la trayectoria
 * del vehículo de la hipótesis de la que sigue sin ella.
 */
export function cambiosDeHipotesis(
  p: PruebaConductores,
  agentes: Json,
  h: HipotesisConductor,
  nombre: (id: string) => string,
  r: Reconstruccion,
): CambioVersion[] {
  const con = p.conHipotesis;
  const sin = p.sinHipotesis;
  const out: CambioVersion[] = [];
  const contacto = (c: typeof con) =>
    c.contacto
      ? `Sí, en ${segundos(c.t!)} a ${kmhConUnidad(c.relativaKmh, "reconstruccion")} de velocidad relativa`
      : `No: quedan a ${metros(c.distanciaMinimaM ?? 0)} como mínimo`;
  out.push({
    clave: "contacto",
    concepto: "¿Se tocan?",
    version: contacto(con),
    reconstruccion: contacto(sin),
    cambia: contacto(con) !== contacto(sin),
  });
  // La velocidad de cada vehículo al contacto (solo si los dos tienen contacto y es el mismo par).
  if (con.contacto && sin.contacto && !p.cambiaElPar) {
    for (const v of con.velocidades) {
      const s = sin.velocidades.find((x) => x.vehiculo === v.vehiculo);
      if (!s) continue;
      const a = kmhConUnidad(v.kmh, "reconstruccion");
      const b = kmhConUnidad(s.kmh, "reconstruccion");
      out.push({
        clave: "velocidad",
        concepto: `Velocidad al contacto · ${nombre(v.vehiculo)}`,
        version: a,
        reconstruccion: b,
        cambia: a !== b,
      });
    }
  }
  // Dónde se tocan: el centro del vehículo de la hipótesis en el contacto, con y sin ella.
  const sid = Object.keys(r.ids).find((k) => r.ids[k] === h.vehiculo);
  const trCon = trayectoriasDe(agentes.resultado).find((x) => x.vehiculo === sid);
  const trSin = trayectoriasDe(agentes.linea_base).find((x) => x.vehiculo === sid);
  if (trCon && trSin && con.contacto && sin.contacto) {
    const [x1, y1] = enT(trCon, con.t!);
    const [x0, y0] = enT(trSin, sin.t!);
    const d = Math.hypot(x1 - x0, y1 - y0);
    out.push({
      clave: "punto",
      concepto: `Dónde está ${nombre(h.vehiculo)} al contacto`,
      version: `A ${metros(d)} de donde está sin la hipótesis`,
      reconstruccion: "En el punto de impacto",
      cambia: metros(d) !== metros(0),
    });
  }
  // La trayectoria: cuánto se separa la del vehículo de la hipótesis (en los mismos instantes).
  if (trCon && trSin) {
    let max = 0;
    for (let i = 0; i < trCon.t.length; i++) {
      const [x0, y0] = enT(trSin, trCon.t[i]!);
      max = Math.max(max, Math.hypot(trCon.x[i]! - x0, trCon.y[i]! - y0));
    }
    out.push({
      clave: "trayectoria",
      concepto: `Trayectoria de ${nombre(h.vehiculo)}`,
      version: `Se separa hasta ${metros(max)}`,
      reconstruccion: "La de la reconstrucción",
      cambia: metros(max) !== metros(0),
    });
  }
  return out;
}

/** Cómo se titula una hipótesis: «¿Y si el conductor de A · Nissan Versa frena 1.50 s antes?». */
export function tituloHipotesis(h: HipotesisConductor, nombre: (id: string) => string): string {
  return `¿Y si el conductor de ${nombre(h.vehiculo)} ${DECISION_EN_PALABRAS[h.decision]} ${segundos(h.segundosAntes)} antes del impacto?`;
}

/** El resumen de una hipótesis en la lista de versiones. */
export function resumenHipotesis(p: PruebaConductores): string {
  const c = p.conHipotesis;
  return c.contacto
    ? `Hay contacto a ${kmhConUnidad(c.relativaKmh, "reconstruccion")} de velocidad relativa`
    : `No hay contacto: quedan a ${metros(c.distanciaMinimaM ?? 0)} como mínimo`;
}

/** El resumen de una declaración: cuántos puntos comparables no coinciden con la evidencia. */
export function resumenDeclarada(filas: readonly FilaDeclarada[]): {
  comparables: number;
  noCoinciden: number;
  texto: string;
} {
  const comparables = filas.filter((f) => f.estado !== "sin_dato").length;
  const noCoinciden = filas.filter((f) => f.estado === "no_coincide").length;
  return {
    comparables,
    noCoinciden,
    texto: comparables
      ? `${noCoinciden} de ${comparables} ${comparables === 1 ? "punto comparable no coincide" : "puntos comparables no coinciden"} con la evidencia`
      : "Ningún punto se puede comparar con la evidencia",
  };
}
