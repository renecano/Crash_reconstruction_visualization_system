/**
 * Qué medida pesa más (René, 2026-11-27): «±1 m en el reposo del Corolla mueve la cifra ±3.5 km/h».
 * Cada reposo medido se mueve 1 m hacia adelante y 1 m hacia atrás, a lo largo de su rumbo; el ajuste
 * se rehace desde el mejor (las mismas incógnitas libres) y se ve cuánto cambia la velocidad del
 * vehículo de la cifra. Es una lectura local (lineal): dice qué medida conviene revisar primero, no un
 * rango nuevo.
 *
 * Coordenadas de la escena: x al este, y al norte (m); rumbos desde +x, antihorario (grados).
 */
import { evidenceFromSpec, fitEvidence } from "./inversion";

type Json = Record<string, unknown>;

export interface SensibilidadReposo {
  /** El vehículo de la escena cuyo reposo se movió. */
  vehiculo: string;
  /** km/h que cambia la cifra por metro que se mueve ese reposo (la mitad de la diferencia ±1 m). */
  kmhPorMetro: number;
}

/** La velocidad previa del ajuste, por nombre del parámetro (`velocidad:veh-a`, `rumbo:veh-a`). */
function valoresDelResultado(resultado: Json): {
  valores: Map<string, number>;
  libres: Set<string>;
} {
  const ps = ((resultado.inversion as Json | undefined)?.parametros ?? []) as {
    parametro: string;
    vehiculo: string;
    inicial: number;
    identificable: boolean;
    estimacion?: { mejor: number };
  }[];
  const valores = new Map<string, number>();
  const libres = new Set<string>();
  for (const p of ps) {
    const nombre = `${p.parametro === "velocidad_previa" ? "velocidad" : "rumbo"}:${p.vehiculo}`;
    valores.set(nombre, p.estimacion?.mejor ?? p.inicial);
    if (p.identificable) libres.add(nombre);
  }
  return { valores, libres };
}

/**
 * La sensibilidad de la velocidad de `objetivo` (id del solver) a cada reposo medido, de la que más
 * mueve a la que menos. Vacía si no hay inversión o si esa velocidad no es una incógnita libre.
 */
export function sensibilidadDeReposos(
  spec: Json,
  resultado: Json,
  objetivo: string,
  metros = 1,
): SensibilidadReposo[] {
  const { valores, libres } = valoresDelResultado(resultado);
  const nombre = `velocidad:${objetivo}`;
  if (!libres.has(nombre)) return [];
  const out: SensibilidadReposo[] = [];
  for (const v of (spec.vehiculos ?? []) as Json[]) {
    const fin = v.posicion_final as { x?: number; y?: number; rumbo_deg?: number } | undefined;
    if (!fin || fin.x === undefined || fin.y === undefined || v.posicion_final_supuesta) continue;
    const r = ((fin.rumbo_deg ?? 0) * Math.PI) / 180;
    const velocidad = (signo: number): number | null => {
      const s = structuredClone(spec);
      const sv = (s.vehiculos as Json[]).find((x) => x.id === v.id)!;
      const f = sv.posicion_final as Json;
      f.x = Number(fin.x) + signo * metros * Math.cos(r);
      f.y = Number(fin.y) + signo * metros * Math.sin(r);
      try {
        const ev = evidenceFromSpec(s as never);
        const fit = fitEvidence(s as never, ev, { start: new Map(valores), free: libres });
        return fit.values.get(nombre) ?? null;
      } catch {
        return null;
      }
    };
    const mas = velocidad(1);
    const menos = velocidad(-1);
    if (mas === null || menos === null) continue;
    out.push({
      vehiculo: String(v.id),
      kmhPorMetro: Math.round((Math.abs(mas - menos) / 2) * 10) / 10,
    });
  }
  return out.sort((a, b) => b.kmhPorMetro - a.kmhPorMetro);
}
