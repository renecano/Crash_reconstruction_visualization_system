/**
 * Modelo de la vía compartido con el croquis 2D y el visor (port de `croquis_solver.road`; ADR
 * 0006): recta sobre +X, curva con centro en (0, −R) y glorieta con centro en (0, R + W/2)
 * recorrida en sentido antihorario.
 */
import { CurvedLanePath, type Path, StraightPath } from "./preimpact";

type Json = Record<string, unknown>;

export const DEFAULT_CURVE_RADIUS_M = 25.0;
const CURVED_ROAD_TYPES = new Set(["carretera_dos_carriles", "autopista"]);
const LEN: Readonly<Record<string, number>> = { m: 1.0, cm: 0.01, mm: 0.001, km: 1000.0 };

export interface RoadAxis {
  /** "recta" | "arco" | "anillo" */
  kind: string;
  center: readonly [number, number];
  /** Radio del eje (m); 0 en recta. */
  radius: number;
  /** Ancho de la calzada principal (m). */
  width: number;
}

function len(campo: unknown, dflt: number): number {
  if (!campo) return dflt;
  const c = campo as Json;
  return Number(c.valor) * (LEN[String(c.unidad ?? "m")] ?? 1.0);
}

/** `int(x)` de Python para los enteros del contrato. */
function pyInt(x: unknown): number {
  return Math.trunc(Number(x));
}

function valor(lugar: Json, key: string): unknown {
  return (lugar[key] as Json | undefined)?.valor;
}

/** Ancho de la calzada principal, igual que `roadLayout` en el croquis. */
export function mainWidth(lugar: Json): number {
  const lane = len(lugar.ancho_carril, 3.5);
  const lanes = Math.max(1, pyInt(valor(lugar, "carriles_por_sentido")));
  const dos = valor(lugar, "sentidos") === "doble_sentido";
  const camellon = Boolean(((lugar.camellon ?? {}) as Json).valor ?? false);
  const median = camellon ? len(lugar.ancho_camellon, 1.5) : 0.0;
  return lane * lanes * (dos ? 2 : 1) + median;
}

/** Ancho de la vía secundaria (norte-sur) en intersecciones, igual que `roadLayout`. */
export function secondaryWidth(lugar: Json): number {
  const lane = len(lugar.ancho_carril, 3.5);
  const lanesMain = Math.max(1, pyInt(valor(lugar, "carriles_por_sentido")));
  const sec = (lugar.carriles_por_sentido_secundaria ?? {}) as Json;
  const lanes = Math.max(1, pyInt(sec.valor ?? lanesMain));
  const dos = valor(lugar, "sentidos") === "doble_sentido";
  return lane * lanes * (dos ? 2 : 1);
}

export function roadAxis(lugar: Json): RoadAxis {
  const tipo = String(valor(lugar, "tipo_via"));
  const width = mainWidth(lugar);
  const hasRadius = lugar.radio_curva !== undefined && lugar.radio_curva !== null;
  const radius = len(lugar.radio_curva, DEFAULT_CURVE_RADIUS_M);
  if (tipo === "glorieta")
    return { kind: "anillo", center: [0.0, radius + width / 2], radius, width };
  if (tipo === "curva" || (CURVED_ROAD_TYPES.has(tipo) && hasRadius)) {
    const r = Math.max(radius, width);
    return { kind: "arco", center: [0.0, -r], radius: r, width };
  }
  return { kind: "recta", center: [0.0, 0.0], radius: 0.0, width };
}

/** Trayectoria que sigue el carril desde `pose`; null si la vía es recta (no aplica). */
export function laneFollowingPath(
  axis: RoadAxis,
  pose: readonly [number, number, number],
  opts: { length?: number; lateral?: number; changeLength?: number } = {},
): Path | null {
  const { length = 400.0, lateral = 0.0, changeLength = 40.0 } = opts;
  if (axis.kind === "recta") return null;
  const [x, y, yaw] = pose;
  const [cx, cy] = axis.center;
  const r0 = Math.hypot(x - cx, y - cy);
  if (r0 < 1.0) return null;
  const phi0 = Math.atan2(y - cy, x - cx);
  // Tangente antihoraria en la pose: perpendicular al radio, girada +90°.
  const ccwTangent = [-Math.sin(phi0), Math.cos(phi0)] as const;
  let ccw = Math.cos(yaw) * ccwTangent[0] + Math.sin(yaw) * ccwTangent[1] >= 0;
  if (axis.kind === "anillo") ccw = true;
  return new CurvedLanePath([cx, cy], r0, phi0, ccw, length, lateral, changeLength);
}

export function straightFrom(pose: readonly [number, number, number], length = 500.0): Path {
  return new StraightPath([pose[0], pose[1]], pose[2], length);
}
