/**
 * «¿Y si…?» a otra velocidad (pedido de CESVI; René, 2026-11-26): el perito cambia la velocidad de
 * uno o varios vehículos y ve cómo habría sido el choque. Es una hipótesis del perito: la cifra
 * reconstruida no cambia.
 *
 * - **La escena** (`especDeHipotesisVelocidad`): la de la reconstrucción, con cada vehículo a la
 *   velocidad que elige el perito y los demás a la que fijó la reconstrucción. Las posiciones
 *   finales se quitan, porque son evidencia: la hipótesis se simula hacia adelante y se ve a dónde la
 *   lleva la física.
 * - **La línea base** es la misma escena con las velocidades reconstruidas: las dos salen de la misma
 *   simulación hacia adelante y lo único distinto es la velocidad.
 * - **Qué cambia** (`cambiosDeVelocidad`): por vehículo, la velocidad al impacto, el cambio de
 *   velocidad en el choque (ΔV), la energía y la profundidad máxima de la deformación, y dónde quedó;
 *   cada diferencia con su valor y su porcentaje.
 *
 * El choque ocurre en el mismo punto de impacto que la reconstrucción: lo que cambia es su energía y
 * lo que pasa después. Ninguna cifra es nueva: todas salen del solver.
 */
import type { CambioVersion } from "./versiones-caso";
import type { EscenaSolver } from "./reconstruccion";
import { kmhConUnidad, metros } from "./formato";

type Json = Record<string, unknown>;
type Id = string;

/** La velocidad que elige el perito para un vehículo, en km/h. */
export interface VelocidadElegida {
  vehiculo: Id;
  kmh: number;
}

/** El rango que acepta el «¿Y si…?», como el resto de la app (0 a 200 km/h). */
export const VELOCIDAD_HIPOTESIS_KMH = [0, 200] as const;

const HIPOTESIS = {
  fuente: "usuario",
  confianza: 1,
  nota: "Hipótesis «¿y si…?» del perito: no es evidencia ni cambia la cifra reconstruida.",
} as const;

/**
 * La escena del «¿Y si…?». `reconstruidas`: la velocidad que fijó la reconstrucción para cada
 * vehículo (la mejor); `elegidas`, las que cambia el perito. Sin elegidas, es la línea base.
 */
export function especDeHipotesisVelocidad(
  base: EscenaSolver,
  reconstruidas: ReadonlyMap<Id, number>,
  elegidas: readonly VelocidadElegida[] = [],
): EscenaSolver {
  const spec = structuredClone(base.spec) as EscenaSolver["spec"] & { vehiculos: Json[] };
  for (const sv of spec.vehiculos) {
    const id = base.ids[String(sv.id)]!;
    const e = elegidas.find((x) => x.vehiculo === id);
    const [lo, hi] = VELOCIDAD_HIPOTESIS_KMH;
    if (e) {
      const kmh = Math.min(hi, Math.max(lo, e.kmh));
      sv.velocidad_previa = { valor: kmh, unidad: "km/h", ...HIPOTESIS };
    } else if (reconstruidas.has(id)) {
      sv.velocidad_previa = {
        valor: Math.round(reconstruidas.get(id)! * 10) / 10,
        unidad: "km/h",
        fuente: "supuesto",
        confianza: 1,
        nota: "La de la reconstrucción.",
      };
    }
    delete sv.posicion_final;
  }
  return { ...base, spec };
}

interface VehiculoSim {
  id: string;
  v_impacto_kmh?: number;
  delta_v_kmh?: number;
  dano?: { perfil_m?: number[]; energia_j?: number };
  pose_final?: { x: number; y: number };
}

const vehiculosDe = (r: unknown): VehiculoSim[] =>
  (r as { vehiculos?: VehiculoSim[] } | null)?.vehiculos ?? [];

/** «+12 km/h (+40 %)»; sin porcentaje si la base es cero. */
function diferencia(a: number, b: number, unidad: string, dec = 0): string {
  const d = a - b;
  const f = (x: number) => x.toLocaleString("es-MX", { maximumFractionDigits: dec });
  const signo = d > 0 ? "+" : d < 0 ? "−" : "±";
  const pct = Math.abs(b) > 1e-9 ? ` (${signo}${f(Math.abs((d / b) * 100))} %)` : "";
  return `${signo}${f(Math.abs(d))} ${unidad}${pct}`;
}

/**
 * Qué cambia con la hipótesis contra la línea base (las mismas escenas, a la velocidad reconstruida).
 * `hipotesis` y `base` son los `Resultado` de las dos simulaciones hacia adelante.
 */
export function cambiosDeVelocidad(
  ids: Readonly<Record<string, Id>>,
  hipotesis: unknown,
  base: unknown,
  nombre: (id: Id) => string,
): CambioVersion[] {
  const out: CambioVersion[] = [];
  const b = new Map(vehiculosDe(base).map((v) => [v.id, v]));
  for (const h of vehiculosDe(hipotesis)) {
    const s = b.get(h.id);
    const id = ids[h.id];
    if (!s || !id) continue;
    const quien = nombre(id);
    const fila = (
      clave: CambioVersion["clave"],
      concepto: string,
      a: number | undefined,
      c: number | undefined,
      texto: (x: number) => string,
      unidad: string,
      dec: number,
      umbral: number,
    ) => {
      if (a === undefined || c === undefined) return;
      const cambia = Math.abs(a - c) >= umbral;
      out.push({
        clave,
        concepto: `${concepto} · ${quien}`,
        version: cambia ? `${texto(a)} (${diferencia(a, c, unidad, dec)})` : texto(a),
        reconstruccion: texto(c),
        cambia,
      });
    };
    fila(
      "velocidad",
      "Velocidad al impacto",
      h.v_impacto_kmh,
      s.v_impacto_kmh,
      (x) => kmhConUnidad(x, "reconstruccion"),
      "km/h",
      0,
      0.5,
    );
    fila(
      "velocidad",
      "Cambio de velocidad en el choque (ΔV)",
      h.delta_v_kmh,
      s.delta_v_kmh,
      (x) => kmhConUnidad(x, "reconstruccion"),
      "km/h",
      0,
      0.5,
    );
    fila(
      "dano",
      "Energía de la deformación",
      h.dano?.energia_j,
      s.dano?.energia_j,
      (x) => `${(x / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} kJ`,
      "J",
      0,
      100,
    );
    const prof = (v: VehiculoSim) =>
      v.dano?.perfil_m?.length ? Math.max(...v.dano.perfil_m) * 100 : undefined;
    fila(
      "dano",
      "Deformación máxima",
      prof(h),
      prof(s),
      (x) => `${x.toLocaleString("es-MX", { maximumFractionDigits: 0 })} cm`,
      "cm",
      0,
      0.5,
    );
    if (h.pose_final && s.pose_final) {
      const d = Math.hypot(h.pose_final.x - s.pose_final.x, h.pose_final.y - s.pose_final.y);
      out.push({
        clave: "trayectoria",
        concepto: `Dónde quedó · ${quien}`,
        version:
          d < 0.1
            ? "En el mismo lugar"
            : `A ${metros(d, 1)} de donde queda a la velocidad reconstruida`,
        reconstruccion: "Donde queda a la velocidad reconstruida",
        cambia: d >= 0.1,
      });
    }
  }
  return out;
}

/** «¿Y si…? A · VW Jetta a 60 km/h y B · GM Camaro a 20 km/h». */
export function tituloHipotesisVelocidad(
  elegidas: readonly VelocidadElegida[],
  nombre: (id: Id) => string,
): string {
  const partes = elegidas.map(
    (e) => `${nombre(e.vehiculo)} a ${kmhConUnidad(e.kmh, "reconstruccion")}`,
  );
  return `¿Y si…? ${partes.join(" y ")}`;
}

/** Una línea para la lista: cuántas cosas cambian. */
export function resumenHipotesisVelocidad(cambios: readonly CambioVersion[]): string {
  const n = cambios.filter((c) => c.cambia).length;
  return n
    ? `${n} de ${cambios.length} puntos cambian contra la velocidad reconstruida`
    : "Nada cambia más que el redondeo";
}
