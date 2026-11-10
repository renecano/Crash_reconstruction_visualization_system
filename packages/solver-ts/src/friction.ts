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

/**
 * Coeficiente llanta–suelo de una zona del terreno (C3) según su tipo y el estado del lugar. Los
 * tipos de la vía usan su fila de la tabla. La grava es la grava suelta de la terracería, el lodo
 * es su lodo y la tierra es la terracería en el estado del lugar. El pasto solo tiene medición en
 * seco y en mojado: con grava suelta vale el seco y, con cualquier otro estado, el mojado.
 */
export function zoneFriction(tipo: string, estado: string): RangedValue {
  if (tipo === "grava") return tireFriction("terraceria", "grava_suelta");
  if (tipo === "lodo") return tireFriction("terraceria", "lodo");
  if (tipo === "tierra") return tireFriction("terraceria", estado);
  if (tipo === "pasto")
    return tireFriction(
      "pasto",
      estado === "seco" || estado === "grava_suelta" ? "seco" : "mojado",
    );
  return tireFriction(tipo, estado);
}

/**
 * (índice de la zona, mínimo, máximo, de dónde sale) de la fricción de cada zona del terreno: el
 * rango que declara la zona; si no, ±5 % si la fijó el perito, o el de la tabla para su tipo y el
 * estado del lugar. Es lo que muestrean el Monte Carlo y la inversión.
 */
export function zoneRanges(lugar: Record<string, unknown>): [number, number, number, string][] {
  type J = Record<string, unknown>;
  const out: [number, number, number, string][] = [];
  const terreno = (lugar.terreno ?? {}) as J;
  ((terreno.superficies ?? []) as J[]).forEach((z, k) => {
    const fz = z.friccion as J;
    const rango = fz.rango as number[] | undefined;
    if (rango && rango.length) {
      out.push([k, Number(rango[0]), Number(rango[1]), "rango declarado de la zona"]);
    } else if (fz.fuente === "usuario") {
      const val = Number(fz.valor);
      out.push([k, val * 0.95, val * 1.05, "±5% (usuario)"]);
    } else {
      const mu = zoneFriction(String(z.tipo), String((lugar.estado_superficie as J).valor));
      out.push([k, mu.low, mu.high, `tabla de fricción (${mu.fuente})`]);
    }
  });
  return out;
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
