/**
 * Momento de inercia de guiñada por clase de vehículo (port de `croquis_solver.inertia`; tabla
 * escrita por `croquis-eval inercia-guinada` desde la base de parámetros inerciales de NHTSA).
 * El radio de giro es proporcional al largo, k = c·L, con c la mediana del grupo de carrocería; las
 * clases sin grupo usan la placa rectangular uniforme, marcada como supuesto.
 */
import { Body2D } from "./models";
import table from "./data/yaw_inertia.json";

export interface YawInertia {
  /** kg·m² */
  value: number;
  /** "nhtsa" | "supuesto" */
  origen: string;
  radiusOverLength: number | null;
}

interface Table {
  grupos?: Record<string, { c: number }>;
  clases?: Record<string, string>;
}

const TABLE = table as unknown as Table;

/** I_z = m·(c·L)² con c del grupo de la clase; sin grupo, la placa uniforme (supuesto). */
export function yawInertia(clase: string, mass: number, length: number, width: number): YawInertia {
  const group = TABLE.clases?.[clase];
  const entry = group ? TABLE.grupos?.[group] : undefined;
  if (entry) {
    const c = entry.c;
    return { value: mass * (c * length) ** 2, origen: "nhtsa", radiusOverLength: c };
  }
  return {
    value: Body2D.boxInertia(mass, length, width),
    origen: "supuesto",
    radiusOverLength: null,
  };
}

/** Cuerpo plano con la inercia de guiñada de su clase. */
export function bodyFor(clase: string, mass: number, length: number, width: number): Body2D {
  return new Body2D(mass, yawInertia(clase, mass, length, width).value, length, width);
}
