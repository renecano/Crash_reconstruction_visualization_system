/**
 * Luces reales de noche (PLAN §7.1, F8b): faros con cono de luz y alumbrado público.
 *
 * - Faros: un foco por vehículo con luces, con la misma apertura que usa el solver para decidir
 *   qué se ve de noche (semiángulo de 30°, `visibility.py`). Sin `luces_encendidas` declarado,
 *   las luces van encendidas, como en el solver. Los estacionados van apagados.
 * - Alumbrado: un foco hacia abajo en cada poste de la escena, solo si la escena declara
 *   alumbrado público. Si no hay postes, el alumbrado sigue siendo la luz ambiental cálida: no se
 *   inventan postes que la escena no tiene.
 *
 * Cada luz cuesta en cada pixel que toca, así que hay un tope por nivel de calidad (E6): en baja
 * solo brillan los materiales; en media y alta, los vehículos involucrados y los postes más
 * cercanos a la acción. Intensidades (candelas de three.js) calibradas contra la luz ambiental de
 * la escena, que tampoco es fotométrica: un faro da a 20 m más o menos lo mismo que la ambiental
 * (E = I/d²) y una luminaria a 8 m de alto, un poco más bajo ella. Son ilustrativas.
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { actionBounds } from "./cameras";
import type { QualityLevel } from "./quality";

/** Semiángulo del cono de los faros: el mismo de la visibilidad nocturna del solver. */
export const HEADLIGHT_HALF_ANGLE_DEG = 30;
/** Hasta dónde llega la luz de los faros en la escena (m). */
export const HEADLIGHT_RANGE_M = 70;
export const HEADLIGHT_INTENSITY = 600;
export const STREETLIGHT_HALF_ANGLE_DEG = 68;
export const STREETLIGHT_RANGE_M = 45;
export const STREETLIGHT_INTENSITY = 380;

export const NIGHT_LIGHT_BUDGET: Record<QualityLevel, { vehicles: number; poles: number }> = {
  baja: { vehicles: 0, poles: 0 },
  media: { vehicles: 2, poles: 2 },
  alta: { vehicles: 4, poles: 4 },
  // Ultra: todos los vehículos con faros encendidos y todos los postes.
  ultra: { vehicles: Number.POSITIVE_INFINITY, poles: Number.POSITIVE_INFINITY },
};

/** ¿El vehículo lleva las luces encendidas? Sin dato, sí (como el solver). */
export function headlightsOn(spec: EscenaSpec, vehicleId: string): boolean {
  const v = spec.vehiculos.find((x) => x.id === vehicleId);
  const f = v?.luces_encendidas;
  return f === undefined ? true : Boolean(f.valor);
}

export interface NightLightPlan {
  /** Vehículos que llevan foco, en orden. */
  vehicles: string[];
  /** Postes que llevan foco, del más cercano a la acción al más lejano. */
  poles: string[];
}

export function planNightLights(
  spec: EscenaSpec,
  resultado: Resultado,
  env: { night: boolean; streetLights: boolean },
  quality: QualityLevel,
  /** Luminarias procedurales (T1.1): compiten por el tope con los postes declarados. */
  extraPoles: readonly { id: string; x: number; y: number }[] = [],
): NightLightPlan {
  if (!env.night) return { vehicles: [], poles: [] };
  const budget = NIGHT_LIGHT_BUDGET[quality];
  const lit = resultado.vehiculos.filter((v) => headlightsOn(spec, v.id));
  // Primero los involucrados (son los que importan en la escena).
  const ordered = [...lit.filter((v) => v.involucrado), ...lit.filter((v) => !v.involucrado)];
  const vehicles = ordered.slice(0, budget.vehicles).map((v) => v.id);
  let poles: string[] = [];
  if (env.streetLights && budget.poles > 0) {
    const b = actionBounds(resultado);
    const declared = (spec.entorno.objetos ?? [])
      .filter((o) => o.tipo === "poste")
      .map((o) => ({ id: o.id, x: o.posicion.x, y: o.posicion.y }));
    poles = [...declared, ...extraPoles]
      .map((o) => ({ id: o.id, d: Math.hypot(o.x - b.cx, o.y - b.cy) }))
      .sort((a, c) => a.d - c.d || a.id.localeCompare(c.id))
      .slice(0, budget.poles)
      .map((p) => p.id);
  }
  return { vehicles, poles };
}

// ---------------------------------------------------------------------------------------------
// Luminarias procedurales (T1.1 de PLAN-CESVI v3, ADR 0094)
// ---------------------------------------------------------------------------------------------

export interface ProceduralPole {
  id: string;
  x: number;
  y: number;
  altura_m: number;
  /** Rumbo del brazo de la luminaria (grados, convención matemática): apunta a la calzada. */
  rumbo_deg: number;
}

/**
 * Separación entre luminarias por clase de vía (m). Orden de magnitud de las instalaciones
 * urbanas y carreteras en México (unas 3 a 5 veces la altura de montaje), sin pretender norma:
 * las luminarias son procedurales y la leyenda lo dice. Las vías del mapa usan `highway` de OSM.
 */
export const POLE_SPACING_M: Record<string, number> = {
  autopista: 50,
  carretera_dos_carriles: 55,
  motorway: 50,
  trunk: 50,
  primary: 40,
  secondary: 35,
  tertiary: 35,
  residential: 30,
  unclassified: 35,
};
export const DEFAULT_POLE_SPACING_M = 35;
export const POLE_HEIGHT_M: Record<string, number> = {
  autopista: 10,
  carretera_dos_carriles: 9,
  motorway: 10,
  trunk: 9,
  primary: 9,
};
export const DEFAULT_POLE_HEIGHT_M = 8;
/** Hasta dónde se colocan luminarias alrededor de la acción (m). */
export const POLE_REACH_M = 160;
export const MAX_PROCEDURAL_POLES = 40;
/** Clases `highway` de OSM que llevan alumbrado; las demás (service, path, footway…) no. */
const LIT_HIGHWAYS = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "unclassified",
  "living_street",
]);

interface Strip {
  center: { x: number; y: number };
  length: number;
  width: number;
  heading: number;
}
interface Via {
  puntos: readonly { x: number; y: number }[];
  ancho: number;
  tipo?: string;
}

const deg = (r: number): number => (r * 180) / Math.PI;

/**
 * Dónde van las luminarias cuando la escena declara alumbrado público pero no trae postes
 * (`entorno.objetos`): a un lado de cada vía, cada tramo según su clase, dentro del alcance de la
 * acción. Con calles del mapa se siguen las calles; si no, la plantilla de la vía. Determinista
 * (sin semilla: la fase es media separación). Devuelve [] si la escena ya trae postes.
 */
export function proceduralPoles(
  spec: EscenaSpec,
  resultado: Resultado,
  layout: { strips: readonly Strip[] },
  mapVias?: readonly Via[],
): ProceduralPole[] {
  if ((spec.entorno.objetos ?? []).some((o) => o.tipo === "poste")) return [];
  const b = actionBounds(resultado);
  const tipoVia = spec.lugar.tipo_via.valor;
  const out: { x: number; y: number; altura_m: number; rumbo_deg: number; d: number }[] = [];
  const push = (x: number, y: number, h: number, toRoad: { x: number; y: number }) => {
    const d = Math.hypot(x - b.cx, y - b.cy);
    if (d > POLE_REACH_M) return;
    out.push({ x, y, altura_m: h, rumbo_deg: deg(Math.atan2(toRoad.y, toRoad.x)), d });
  };
  if (mapVias && mapVias.length > 0) {
    for (const v of mapVias) {
      if (v.tipo !== undefined && !LIT_HIGHWAYS.has(v.tipo)) continue;
      const spacing = POLE_SPACING_M[v.tipo ?? ""] ?? DEFAULT_POLE_SPACING_M;
      const h = POLE_HEIGHT_M[v.tipo ?? ""] ?? DEFAULT_POLE_HEIGHT_M;
      const offset = v.ancho / 2 + 1;
      let next = spacing / 2;
      let walked = 0;
      for (let i = 1; i < v.puntos.length; i++) {
        const a = v.puntos[i - 1]!;
        const c = v.puntos[i]!;
        const len = Math.hypot(c.x - a.x, c.y - a.y);
        if (len < 1e-6) continue;
        const ux = (c.x - a.x) / len;
        const uy = (c.y - a.y) / len;
        // El lado derecho del sentido de recorrido de la polilínea.
        const rx = uy;
        const ry = -ux;
        while (next <= walked + len) {
          const s = next - walked;
          push(a.x + ux * s + rx * offset, a.y + uy * s + ry * offset, h, { x: -rx, y: -ry });
          next += spacing;
        }
        walked += len;
      }
    }
  } else {
    const spacing = POLE_SPACING_M[tipoVia] ?? DEFAULT_POLE_SPACING_M;
    const h = POLE_HEIGHT_M[tipoVia] ?? DEFAULT_POLE_HEIGHT_M;
    for (const s of layout.strips) {
      const r = (s.heading * Math.PI) / 180;
      const ux = Math.cos(r);
      const uy = Math.sin(r);
      const rx = uy;
      const ry = -ux;
      const offset = s.width / 2 + 1;
      for (let t = -s.length / 2 + spacing / 2; t <= s.length / 2; t += spacing) {
        const x = s.center.x + ux * t + rx * offset;
        const y = s.center.y + uy * t + ry * offset;
        // No dentro de otra franja (el cruce) ni pegado a ella.
        const inOther = layout.strips.some((o) => {
          if (o === s) return false;
          const ro = (o.heading * Math.PI) / 180;
          const ox = Math.cos(ro);
          const oy = Math.sin(ro);
          const dx = x - o.center.x;
          const dy = y - o.center.y;
          const along = dx * ox + dy * oy;
          const across = Math.abs(-dx * oy + dy * ox);
          return Math.abs(along) <= o.length / 2 && across <= o.width / 2 + 2;
        });
        if (!inOther) push(x, y, h, { x: -rx, y: -ry });
      }
    }
  }
  out.sort((p, q) => p.d - q.d || p.x - q.x || p.y - q.y);
  return out.slice(0, MAX_PROCEDURAL_POLES).map((p, i) => ({
    id: `luminaria_${i + 1}`,
    x: p.x,
    y: p.y,
    altura_m: p.altura_m,
    rumbo_deg: p.rumbo_deg,
  }));
}
