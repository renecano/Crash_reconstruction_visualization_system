/**
 * Masas de ficha técnica (`data/fichas-tecnicas.json`): para un vehículo de un caso cuyo reporte no
 * da la masa, la de su marca, modelo y año, si está registrada con su fuente (data/SOURCES.md). Va
 * como «supuesto»: es la de la ficha, no la medida de ese vehículo.
 */
import type { Expediente } from "./corpus";
import FICHAS from "./data/fichas-tecnicas.json";

export interface FichaTecnica {
  marca: string;
  modelo: string;
  anio: number;
  configuracion: string;
  peso_vacio_kg: number[];
  masa_kg: number;
  regla: string;
  fuentes: string[];
}

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** La ficha de un vehículo del expediente, o null si no hay. */
export function fichaDe(v: Expediente["vehiculos"][number]): FichaTecnica | null {
  const marca = normal(v.marca?.valor ?? "");
  const modelo = normal(v.modelo?.valor ?? "");
  return (
    (FICHAS.fichas as FichaTecnica[]).find(
      (f) => f.anio === v.anio && marca === f.marca && modelo === f.modelo,
    ) ?? null
  );
}

/** El expediente con la masa de ficha en los vehículos que no la tienen. */
export function conMasasDeFicha(e: Expediente): Expediente {
  return {
    ...e,
    vehiculos: e.vehiculos.map((v) => {
      if (v.masa) return v;
      const f = fichaDe(v);
      return f ? { ...v, masa: { valor: f.masa_kg, unidad: "kg", fuente: "supuesto" } } : v;
    }),
  };
}
