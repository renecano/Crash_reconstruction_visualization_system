/**
 * Tabla de fricción y parámetros humanos con rango, nominal y fuente (port de
 * `croquis_solver.friction`; datos en `src/data/friction.json`, copia de la referencia).
 */
import table from "./data/friction.json";

// Después del impacto caen y se deslizan de lado (ADR 0017). La bicicleta sigue con el modelo de
// llantas: no hay medición de su arrastre caída.
export const DOWNED_SLIDE_CLASSES: ReadonlySet<string> = new Set(["motocicleta", "scooter"]);

export interface RangedValue {
  low: number;
  high: number;
  nominal: number;
  fuente: string;
  tipo: string;
}

interface Node {
  rango: [number, number];
  nominal: number;
  fuente: string;
  tipo: string;
}

const T = table as unknown as {
  llanta: Record<string, Record<string, Node>>;
  cuerpo_peaton: Record<string, Node>;
  moto_caida: Record<string, Node>;
  abs: { factor_pico_sobre_deslizamiento: Node };
  percepcion_reaccion_s: Node;
  fuentes: Record<string, string>;
};

function ranged(n: Node): RangedValue {
  return { low: n.rango[0], high: n.rango[1], nominal: n.nominal, fuente: n.fuente, tipo: n.tipo };
}

export function clamp(r: RangedValue, value: number): number {
  return Math.min(r.high, Math.max(r.low, value));
}

/** Coeficiente llanta–pavimento (llanta bloqueada) para la superficie y estado del contrato. */
export function tireFriction(superficie: string, estado: string): RangedValue {
  const byState = T.llanta[superficie];
  if (!byState) throw new Error(`Superficie desconocida: ${superficie}`);
  const node = byState[estado];
  if (!node) throw new Error(`Estado desconocido: ${estado}`);
  return ranged(node);
}

export function pedestrianFriction(superficie: string): RangedValue {
  return ranged(T.cuerpo_peaton[superficie] ?? T.cuerpo_peaton.otro!);
}

/** Factor de arrastre de una motocicleta o scooter caído que se desliza de lado. */
export function downedMotorcycleFriction(superficie: string): RangedValue {
  const node = superficie === "_nota" ? undefined : T.moto_caida[superficie];
  return ranged(node ?? T.moto_caida.otro!);
}

export function absPeakFactor(): RangedValue {
  return ranged(T.abs.factor_pico_sobre_deslizamiento);
}

export function perceptionReactionTime(): RangedValue {
  return ranged(T.percepcion_reaccion_s);
}

export function sources(): Record<string, string> {
  return T.fuentes;
}
