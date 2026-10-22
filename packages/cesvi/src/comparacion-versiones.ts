/**
 * «Qué cambia entre versiones» (ADR 0057): la versión declarada contra la de la evidencia, fila por
 * fila. Nada se escribe a mano: los restos salen de la geometría de cada versión, los daños de la
 * observación del dictamen (lo que marcó el perito) contra los que dejaría la maniobra declarada, y
 * la velocidad de B del cálculo.
 */
import { NOMBRE_ZONA, type Zona } from "./correspondencia";
import type { Maniobra } from "./hecho-lectura";

export type EstadoFila = "coincide" | "no_coincide" | "sin_dato";

export interface FilaComparacion {
  clave: "restos" | "danos_a" | "danos_b" | "velocidad_b";
  concepto: string;
  declarada: string;
  evidencia: string;
  estado: EstadoFila;
  /** De dónde sale la fila. */
  fuente: string;
}

/**
 * Los daños que dejaría la maniobra declarada: en una reversa (y en un alcance limpio) el contacto
 * es posterior al centro en A y frontal al centro en B. Sin maniobra declarada, no hay esperados.
 */
export function zonasEsperadasDeclarada(maniobra: Maniobra | null): Record<"A" | "B", Zona[]> {
  if (maniobra === "reversa" || maniobra === "se_detiene" || maniobra === "frena") {
    return { A: ["posterior_centro"], B: ["frontal_centro"] };
  }
  return { A: [], B: [] };
}

const lista = (z: readonly Zona[]) =>
  z.length ? z.map((x) => NOMBRE_ZONA[x]).join(", ") : "sin dato";
const mismas = (a: readonly Zona[], b: readonly Zona[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export interface EntradaComparacion {
  /** Longitud de la zona de restos en cada versión (m); null si aún no hay versiones. */
  restos: { declarada: number; evidencia: number } | null;
  /** Lo que marcó el perito (la observación del dictamen). */
  zonas: Record<"A" | "B", Zona[]>;
  /** Los que dejaría la maniobra declarada. */
  esperadas: Record<"A" | "B", Zona[]>;
  /** Las dos velocidades del cálculo (km/h): por la deformación de B y por el desplazamiento. */
  velocidades: { deformacion: number; desplazamiento: number } | null;
  /** Lo que dice la declaración de la velocidad de B (casi nunca lo dice). */
  velocidadDeclarada: string | null;
  /** Tolerancia para decir que los restos coinciden (m). */
  toleranciaRestosM?: number;
}

export interface Comparacion {
  filas: FilaComparacion[];
  noCoinciden: number;
  /** «3 de 4 no coinciden con la versión declarada». */
  resumen: string;
}

export function compararVersiones(e: EntradaComparacion): Comparacion {
  const tol = e.toleranciaRestosM ?? 0.5;
  const filas: FilaComparacion[] = [];
  filas.push(
    e.restos
      ? {
          clave: "restos",
          concepto: "Restos",
          declarada: `${e.restos.declarada.toFixed(2)} m`,
          evidencia: `${e.restos.evidencia.toFixed(2)} m`,
          estado:
            Math.abs(e.restos.declarada - e.restos.evidencia) <= tol ? "coincide" : "no_coincide",
          fuente: "Geometría de cada versión en el croquis",
        }
      : {
          clave: "restos",
          concepto: "Restos",
          declarada: "sin croquis",
          evidencia: "sin croquis",
          estado: "sin_dato",
          fuente: "Se mide al marcar el punto de impacto (paso 3)",
        },
  );
  for (const l of ["A", "B"] as const) {
    const esperadas = e.esperadas[l];
    const reales = e.zonas[l];
    filas.push({
      clave: l === "A" ? "danos_a" : "danos_b",
      concepto: `Daño en ${l}`,
      declarada: lista(esperadas),
      evidencia: lista(reales),
      estado:
        !esperadas.length || !reales.length
          ? "sin_dato"
          : mismas(esperadas, reales)
            ? "coincide"
            : "no_coincide",
      fuente:
        "Observación de daños del reporte de CESVI contra los que dejaría la maniobra declarada",
    });
  }
  const v = e.velocidades;
  const rango = v
    ? `${Math.min(v.deformacion, v.desplazamiento).toFixed(0)}–${Math.max(v.deformacion, v.desplazamiento).toFixed(0)} km/h`
    : "sin cálculo";
  filas.push({
    clave: "velocidad_b",
    concepto: "Velocidad de B",
    declarada: e.velocidadDeclarada ?? "sin dato",
    evidencia: rango,
    estado: e.velocidadDeclarada && v ? "no_coincide" : "sin_dato",
    fuente: "Cálculo de CESVI: deformación de B (McHenry) y desplazamiento",
  });
  const noCoinciden = filas.filter((f) => f.estado === "no_coincide").length;
  return {
    filas,
    noCoinciden,
    resumen: `${noCoinciden} de ${filas.length} no coinciden con la versión declarada.`,
  };
}
