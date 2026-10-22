/**
 * El módulo de verificación CESVI de R2 (docs/cesvi/PLAN-CESVI.md, ADR 0062): al lado del resultado
 * físico, los métodos de los dictámenes con la fórmula sustituida, sobre los mismos datos del
 * expediente. Lo que falta para un método se dice, no se supone.
 */
import type { Expediente } from "./corpus";
import { formulaEbs, formulaMcHenry, type PasoEnergia, type PasoVelocidad } from "./formulas";
import { MEDIDAS_PERMITIDAS } from "./metodo";
import { rigidezPorVehiculo, type Rigidez } from "./rigidez";

type Id = Expediente["vehiculos"][number]["id"];

const ZONA_E2: Record<string, string> = {
  frontal: "frontal",
  posterior: "trasera",
  lateral_izquierdo: "lateral",
  lateral_derecho: "lateral",
};

export interface VerificacionVehiculo {
  vehiculo: Id;
  /** Las fórmulas con sus valores sustituidos (McHenry y EBS), si hay datos. */
  pasos: { titulo: string; paso: PasoEnergia | PasoVelocidad }[];
  rigidez: Rigidez | null;
  /** Lo que falta para calcular, en palabras. */
  falta: string[];
}

export function verificacionCesvi(e: Expediente): VerificacionVehiculo[] {
  return e.vehiculos.map((v) => {
    const falta: string[] = [];
    const pasos: VerificacionVehiculo["pasos"] = [];
    const dano = (e.danos ?? []).find(
      (d) =>
        d.vehiculo === v.id &&
        !d.dano_previo &&
        (MEDIDAS_PERMITIDAS as readonly number[]).includes(d.magnitud?.c_m?.length ?? 0) &&
        d.magnitud?.l_m !== undefined,
    );
    if (!dano) falta.push("las medidas C (2, 4 o 6) y L de la deformación");
    const masaKg = v.masa?.unidad === "kg" ? v.masa.valor : undefined;
    if (masaKg === undefined) falta.push("la masa");
    const zona = dano ? ZONA_E2[dano.zona.cara] : undefined;
    let rigidez: Rigidez | null = null;
    if (v.rigidez) {
      rigidez = rigidezPorVehiculo({
        clase: v.clase ?? "",
        zona: zona ?? "frontal",
        ...(v.rigidez.fuente === "perito"
          ? { perito: { A: v.rigidez.A, B: v.rigidez.B } }
          : { dictamen: { A: v.rigidez.A, B: v.rigidez.B } }),
      });
    } else if (v.clase && zona) {
      rigidez = rigidezPorVehiculo({ clase: v.clase, zona });
    } else if (dano) {
      falta.push("la rigidez A y B, o la clase del vehículo para tomarla de NHTSA (E2)");
    }
    if (dano && rigidez && masaKg !== undefined) {
      const mc = formulaMcHenry(
        { L: dano.magnitud!.l_m!, A: rigidez.A, B: rigidez.B, C: dano.magnitud!.c_m! },
        "J",
        1,
      );
      pasos.push({
        titulo: `Energía de deformación (McHenry, ${mc.calculo.medidas} medidas)`,
        paso: mc,
      });
      pasos.push({
        titulo: "Velocidad equivalente de barrera (EBS)",
        paso: formulaEbs(mc.calculo.energia, masaKg, mc.calculo.energia.toFixed(1)),
      });
    }
    return { vehiculo: v.id, pasos, rigidez, falta };
  });
}
