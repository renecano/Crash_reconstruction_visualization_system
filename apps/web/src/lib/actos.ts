/**
 * Los seis actos del rediseño «Laboratorio» (prompt §4): agrupan los ocho pasos del recorrido sin
 * cambiar su lógica. El hecho junta el caso y la narración; Análisis, los daños y los números;
 * Contra CESVI solo existe si el caso trae reporte. La tabla «paso viejo → acto nuevo» está en
 * `docs/DISENO.md`.
 */
import type { ClavePaso } from "./pasos-caso";

export type ClaveActo =
  "hecho" | "escena" | "reconstruccion" | "analisis" | "contraste" | "dictamen";

export const ACTOS: readonly { clave: ClaveActo; nombre: string; pasos: readonly ClavePaso[] }[] = [
  { clave: "hecho", nombre: "El hecho", pasos: ["caso", "hecho"] },
  { clave: "escena", nombre: "La escena", pasos: ["lugar"] },
  { clave: "reconstruccion", nombre: "Reconstrucción", pasos: ["reconstruccion"] },
  { clave: "analisis", nombre: "Análisis", pasos: ["danos", "numeros"] },
  { clave: "contraste", nombre: "Contra CESVI", pasos: ["reporte"] },
  { clave: "dictamen", nombre: "Dictamen", pasos: ["dictamen"] },
];

/** Un acto del recorrido de este caso, con los índices de sus pasos en la lista del caso. */
export interface ActoDelCaso {
  clave: ClaveActo;
  nombre: string;
  /** Índices (en los pasos del caso) de sus pasos, en orden. */
  pasos: number[];
}

/** Los actos del caso: los que tienen al menos uno de sus pasos (Contra CESVI, solo con reporte). */
export function actosDelCaso(claves: readonly ClavePaso[]): ActoDelCaso[] {
  return ACTOS.flatMap((a) => {
    const pasos = a.pasos.map((p) => claves.indexOf(p)).filter((i) => i >= 0);
    return pasos.length ? [{ clave: a.clave, nombre: a.nombre, pasos }] : [];
  });
}

/** El índice del acto que contiene al paso `i` (−1 si ninguno). */
export function actoDePaso(actos: readonly ActoDelCaso[], i: number): number {
  return actos.findIndex((a) => a.pasos.includes(i));
}

/**
 * El texto de la acción principal (prompt §4: «Continuar a…»), con la contracción del español:
 * «El hecho» → «Continuar al hecho»; «La escena» → «Continuar a la escena».
 */
export function continuarA(nombre: string): string {
  const conArticulo = { Análisis: "al análisis", Dictamen: "al dictamen" }[nombre];
  if (conArticulo) return `Continuar ${conArticulo}`;
  const m = nombre.match(/^(El|La|Los|Las)\s+(.*)$/);
  if (!m) return `Continuar a ${nombre}`;
  const art = m[1]!.toLowerCase();
  return art === "el" ? `Continuar al ${m[2]}` : `Continuar a ${art} ${m[2]}`;
}

// --- Rutas por acto (prompt §4): /cesvi/casos/<caso>/<acto> ---------------------------------------

const CLAVES = new Set<string>(ACTOS.map((a) => a.clave));

export const esClaveActo = (x: unknown): x is ClaveActo => typeof x === "string" && CLAVES.has(x);

/** El acto de los segmentos opcionales de la ruta (`[[...acto]]`); null si no hay o no es uno. */
export function actoDeSegmentos(segmentos: readonly string[] | undefined): ClaveActo | null {
  if (!segmentos || segmentos.length !== 1) return null;
  return esClaveActo(segmentos[0]) ? segmentos[0] : null;
}

/** La ruta del caso con su acto: quita el acto que ya tenga al final y pone el nuevo. */
export function rutaDeActo(ruta: string, clave: ClaveActo): string {
  const partes = ruta.replace(/\/+$/, "").split("/");
  if (esClaveActo(partes.at(-1))) partes.pop();
  return `${partes.join("/")}/${clave}`;
}
