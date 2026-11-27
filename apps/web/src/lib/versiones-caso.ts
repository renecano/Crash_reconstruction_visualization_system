/**
 * Las versiones del caso en la web (ronda 4, punto 8; René, 2026-11-18): la declaración de cada
 * conductor y las hipótesis «¿y si…?» del perito, en el acto «Versiones». Cada una trae lo que
 * dibujan el 2D y el 3D (su resultado, con la misma física) y lo que cambia contra la
 * reconstrucción, en el lenguaje del perito. Llegan a Presentar y al dictamen marcadas como tales:
 * lo que dice un conductor no es evidencia, y una hipótesis es una prueba del perito.
 */
import {
  resumenDeclarada,
  type CambioVersion,
  type Expediente,
  type FilaDeclarada,
  type HipotesisConductor,
  type PruebaConductores,
  type VelocidadElegida,
  type VersionDeclarada,
} from "@croquis/cesvi";
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";

type Id = Expediente["vehiculos"][number]["id"];
type Json = Record<string, unknown>;

interface Comun {
  /** «declaracion-V2», «hipotesis-1». */
  clave: string;
  /** El título en la lista: «Lo que declaró el conductor de B · GM Camaro». */
  titulo: string;
  /** Una línea: «4 de 7 puntos comparables no coinciden con la evidencia». */
  resumen: string;
  /** Lo que dicen la leyenda del 2D y el 3D: «lo que declaró el conductor de B». */
  etiqueta: string;
  /** El resultado de la versión, con la misma física (o las trayectorias de los conductores). */
  resultado: Resultado;
}

export interface VersionDeclaracion extends Comun {
  tipo: "declaracion";
  declarante: Id;
  /** La escena de la versión declarada: el 3D la carga tal cual. */
  escena: EscenaSpec;
  version: VersionDeclarada;
  filas: FilaDeclarada[];
  /** La sugerencia de Croquis, solo si el perito la pidió, con lo que decidió. */
  sugerencia: { pedida: boolean; decision: "confirmada" | "descartada" | null };
}

export interface VersionHipotesis extends Comun {
  tipo: "hipotesis";
  /** La de los conductores (R12a): una decisión, hasta el primer contacto. */
  clase?: "conductores";
  h: HipotesisConductor;
  prueba: PruebaConductores;
  cambios: CambioVersion[];
  /** El bloque `agentes` del solver, tal cual. */
  agentes: Json;
}

/**
 * «¿Y si…?» a otra velocidad (pedido de CESVI; René, 2026-11-26): la escena de la reconstrucción con
 * la velocidad que elige el perito, simulada hacia adelante con el choque y el daño. Es una hipótesis:
 * la cifra reconstruida no cambia.
 */
export interface VersionVelocidad extends Comun {
  tipo: "hipotesis";
  clase: "velocidad";
  velocidades: VelocidadElegida[];
  /** La escena de la hipótesis: el 3D la carga tal cual. */
  escena: EscenaSpec;
  cambios: CambioVersion[];
}

export type VersionCaso = VersionDeclaracion | VersionHipotesis | VersionVelocidad;

/** Hasta cuántas hipótesis guarda el acto (la más vieja sale al probar otra). */
export const MAX_HIPOTESIS = 6;

/** Agrega una versión: una declaración por conductor (la nueva reemplaza a la anterior). */
export function conVersion(vs: readonly VersionCaso[], v: VersionCaso): VersionCaso[] {
  const sin = vs.filter((x) => x.clave !== v.clave);
  const out = [...sin, v];
  const hip = out.filter((x) => x.tipo === "hipotesis");
  if (hip.length <= MAX_HIPOTESIS) return out;
  const vieja = hip[0]!.clave;
  return out.filter((x) => x.clave !== vieja);
}

/** La clave de la siguiente hipótesis: «hipotesis-<n>», sin repetir las que ya hay. */
export function claveHipotesis(vs: readonly VersionCaso[]): string {
  const n = vs.reduce((m, v) => {
    const k = /^hipotesis-(\d+)$/.exec(v.clave);
    return k ? Math.max(m, Number(k[1])) : m;
  }, 0);
  return `hipotesis-${n + 1}`;
}

/** Lo que va al dictamen: las declaraciones (con sus filas) y las hipótesis probadas. */
export interface VersionesDictamen {
  declaradas: {
    declarante: Id;
    /** «B · GM Camaro». */
    nombre: string;
    filas: FilaDeclarada[];
    sugerencia: { texto: string; decision: "confirmada" | "descartada" | null } | null;
  }[];
  hipotesis: { titulo: string; resumen: string; cambios: CambioVersion[] }[];
}

export function versionesParaDictamen(
  vs: readonly VersionCaso[],
  nombre: (id: string) => string,
  sugerenciaDe: (filas: FilaDeclarada[]) => { texto: string } | null,
): VersionesDictamen {
  return {
    declaradas: vs.flatMap((v) => {
      if (v.tipo !== "declaracion") return [];
      const s = v.sugerencia.pedida ? sugerenciaDe(v.filas) : null;
      return [
        {
          declarante: v.declarante,
          nombre: nombre(v.declarante),
          filas: v.filas,
          sugerencia: s ? { texto: s.texto, decision: v.sugerencia.decision } : null,
        },
      ];
    }),
    hipotesis: vs.flatMap((v) =>
      v.tipo === "hipotesis" ? [{ titulo: v.titulo, resumen: v.resumen, cambios: v.cambios }] : [],
    ),
  };
}

/** Lo que va a Presentar: una fila por versión, marcada como declaración o como hipótesis. */
export function versionesParaPresentar(
  vs: readonly VersionCaso[],
): { tipo: VersionCaso["tipo"]; titulo: string; resumen: string }[] {
  return vs.map((v) => ({ tipo: v.tipo, titulo: v.titulo, resumen: v.resumen }));
}

/** El resumen de una declaración para la lista (desde sus filas). */
export const resumenDeDeclaracion = (filas: readonly FilaDeclarada[]) =>
  resumenDeclarada(filas).texto;
