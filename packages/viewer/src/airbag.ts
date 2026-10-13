/**
 * Bolsas de aire (PLAN §7.3.5): regla ilustrativa con umbrales referenciados y configurables.
 *
 * Fuente: IIHS, "Airbags" (https://www.iihs.org/research-areas/airbags, consultado el
 * 2026-10-13): las frontales suelen desplegarse en choques equivalentes a un muro rígido a
 * 10–12 mph sin cinturón y a unas 16 mph con cinturón; las laterales, desde 8 mph contra objetos
 * estrechos y a 18 mph en impactos laterales distribuidos.
 *
 * Aproximación: el ΔV del solver se usa como sustituto de la velocidad equivalente contra
 * barrera (para un choque contra barrera rígida ΔV ≈ v·(1 + e) ≥ v). La decisión real depende
 * del fabricante y del algoritmo de cada vehículo; esto es una ilustración, no un dictamen.
 */
export const MPH_TO_KMH = 1.609344;

export interface AirbagThresholds {
  frontalSinCinturonKmh: number;
  frontalConCinturonKmh: number;
  lateralObjetoEstrechoKmh: number;
  lateralDistribuidoKmh: number;
}

export const IIHS_THRESHOLDS: AirbagThresholds = {
  frontalSinCinturonKmh: 11 * MPH_TO_KMH, // punto medio de 10–12 mph
  frontalConCinturonKmh: 16 * MPH_TO_KMH,
  lateralObjetoEstrechoKmh: 8 * MPH_TO_KMH,
  lateralDistribuidoKmh: 18 * MPH_TO_KMH,
};

export const AIRBAG_SOURCE =
  "IIHS, Airbags (consultado el 2026-10-13): frontales a 10–12 mph contra muro rígido sin cinturón y ~16 mph con cinturón; laterales desde 8 mph (objeto estrecho) y 18 mph (impacto distribuido).";

export interface AirbagInput {
  deltaVKmh: number;
  /** Dirección de la fuerza en horas de reloj (12 = de frente). */
  pdofHoras: number | undefined;
  /** Cinturón del conductor; si no se declaró se usa el umbral con cinturón (el más alto). */
  cinturon: boolean | undefined;
  objetoEstrecho: boolean;
  dosRuedas: boolean;
}

export interface AirbagDecision {
  frontal: boolean;
  lateral: "izquierda" | "derecha" | null;
  /** Umbral comparado (km/h) y texto para el panel. */
  umbralKmh: number | null;
  motivo: string;
}

export function airbagDecision(
  input: AirbagInput,
  t: AirbagThresholds = IIHS_THRESHOLDS,
): AirbagDecision {
  if (input.dosRuedas) {
    return {
      frontal: false,
      lateral: null,
      umbralKmh: null,
      motivo: "Sin bolsas de aire (vehículo de dos ruedas).",
    };
  }
  const h = input.pdofHoras;
  if (h === undefined || input.deltaVKmh <= 0) {
    return { frontal: false, lateral: null, umbralKmh: null, motivo: "Sin impacto." };
  }
  const hour = ((h % 12) + 12) % 12;
  const frontal = hour >= 10 || hour <= 2;
  const right = hour > 2 && hour < 4.5;
  const left = hour > 7.5 && hour < 10;
  const dv = input.deltaVKmh;
  if (frontal) {
    const belted = input.cinturon ?? true;
    const umbral = belted ? t.frontalConCinturonKmh : t.frontalSinCinturonKmh;
    const nota =
      input.cinturon === undefined ? " (cinturón no declarado: se usa el umbral con cinturón)" : "";
    const deploys = dv >= umbral;
    return {
      frontal: deploys,
      lateral: null,
      umbralKmh: umbral,
      motivo: `Frontal ${deploys ? "desplegada" : "sin desplegar"}: ΔV ${dv.toFixed(0)} km/h ${deploys ? "≥" : "<"} ${umbral.toFixed(0)} km/h${nota}.`,
    };
  }
  if (right || left) {
    const umbral = input.objetoEstrecho ? t.lateralObjetoEstrechoKmh : t.lateralDistribuidoKmh;
    const deploys = dv >= umbral;
    const side = right ? "derecha" : "izquierda";
    return {
      frontal: false,
      lateral: deploys ? side : null,
      umbralKmh: umbral,
      motivo: `Lateral ${side} ${deploys ? "desplegada" : "sin desplegar"}: ΔV ${dv.toFixed(0)} km/h ${deploys ? "≥" : "<"} ${umbral.toFixed(0)} km/h.`,
    };
  }
  return { frontal: false, lateral: null, umbralKmh: null, motivo: "Impacto trasero: no aplica." };
}

/** Escala del despliegue en el tiempo: se infla en ~30 ms y se desinfla lentamente. */
export function airbagScale(t: number): number {
  if (t <= 0.015) return 0;
  if (t < 0.045) {
    const k = (t - 0.015) / 0.03;
    return k * k * (3 - 2 * k);
  }
  return Math.max(0.55, 1 - 0.45 * Math.min(1, Math.max(0, (t - 0.15) / 1.5)));
}

/** Datos mínimos de la escena y del resultado para decidir las bolsas de un vehículo. */
export interface AirbagSceneData {
  personas: readonly {
    vehiculo_id?: string;
    rol: { valor: string };
    cinturon?: { valor: boolean };
  }[];
  objetos: readonly { id: string; tipo: string }[];
  eventos: readonly { tipo: string; actores: readonly string[] }[];
}

/** Decisión de bolsas de aire de un vehículo del resultado (misma regla en escena y panel). */
export function airbagForVehicle(
  v: { id: string; delta_v_kmh: number; pdof_horas?: number; dosRuedas: boolean },
  data: AirbagSceneData,
  thresholds: AirbagThresholds = IIHS_THRESHOLDS,
): AirbagDecision {
  const driver = data.personas.find((p) => p.vehiculo_id === v.id && p.rol.valor === "conductor");
  const objetos = new Map(data.objetos.map((o) => [o.id, o]));
  const ev = data.eventos.find((e) => e.tipo.startsWith("impacto_"));
  const narrow =
    ev?.tipo === "impacto_vehiculo_objeto" &&
    ev.actores.some((a) => ["arbol", "poste"].includes(objetos.get(a)?.tipo ?? ""));
  return airbagDecision(
    {
      deltaVKmh: v.delta_v_kmh,
      pdofHoras: v.pdof_horas,
      cinturon: driver?.cinturon?.valor,
      objetoEstrecho: narrow,
      dosRuedas: v.dosRuedas,
    },
    thresholds,
  );
}
