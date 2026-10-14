/**
 * Hechos de un relato (port de `extraction/croquis_extraction/facts.py`).
 *
 * Un hecho es un valor más, opcionalmente, la cita literal del relato que lo respalda. Con cita y
 * `fuente: "relato"` el relato lo dice; sin cita es un supuesto.
 */

export type FactValue = string | number | boolean;

export interface Fact {
  valor: FactValue;
  cita: string | null;
  /** "relato" si el texto lo dice; "supuesto" o "default" si no. */
  fuente: string;
}

export function fact(valor: FactValue, cita: string | null = null, fuente = "relato"): Fact {
  return { valor, cita, fuente };
}

export function stated(f: Fact): boolean {
  return f.fuente === "relato";
}

export interface Facts {
  escalares: Map<string, Fact>;
  dispositivos: Fact[];
  vehiculos: Map<string, Fact>[];
  narradorVehiculo: number | null;
  personas: Map<string, Fact>[];
  /** Índice de vehículo → lado CDC (orden de inserción, como el dict de Python). */
  zonas: Map<number, Fact>;
}

export function emptyFacts(): Facts {
  return {
    escalares: new Map(),
    dispositivos: [],
    vehiculos: [],
    narradorVehiculo: null,
    personas: [],
    zonas: new Map(),
  };
}
