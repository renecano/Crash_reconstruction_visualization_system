/**
 * Masas de ficha técnica (`data/fichas-tecnicas.json`): para un vehículo de un caso cuyo reporte no
 * da la masa, la de su marca, modelo y año, si está registrada con su fuente (data/SOURCES.md). Va
 * como «supuesto»: es la de la ficha, no la medida de ese vehículo.
 */
import type { Expediente } from "./corpus";
import FICHAS from "./data/fichas-tecnicas.json";
import MASAS_MODELO from "./data/masas-modelo.json";

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

interface MasaDeModelo {
  marca: string;
  familia: string;
  version: string;
  clase: string;
  masa_kg: number;
  fuente: string;
}

/**
 * La masa de la ficha del fabricante del modelo leído (`data/masas-modelo.json`, generado de
 * `data/vehicles/models_raw.json`): por la familia del modelo («Versa», «Hilux»), sin importar el año
 * ni la versión, que pueden variar respecto al del caso. null si el modelo no tiene ficha con masa.
 */
/** Las marcas que se escriben abreviadas. */
const ALIAS_MARCA: Readonly<Record<string, string>> = { vw: "volkswagen" };

export function masaDeModelo(v: Expediente["vehiculos"][number]): MasaDeModelo | null {
  const modelo = normal(v.modelo?.valor ?? "");
  if (!modelo) return null;
  // «VW» es Volkswagen (el crucero de ejemplo dice «marca VW, tipo Jetta»).
  const leida = normal(v.marca?.valor ?? "");
  const marca = ALIAS_MARCA[leida] ?? leida;
  const candidatos = (MASAS_MODELO.modelos as MasaDeModelo[]).filter(
    (m) =>
      (!marca || marca === m.marca) &&
      ` ${modelo.replace(/[^a-z0-9]+/g, " ")} `.includes(` ${m.familia} `),
  );
  // Sin marca, solo si no hay dos marcas con la misma familia.
  return candidatos.length === 1 || (marca && candidatos.length) ? candidatos[0]! : null;
}

/**
 * La masa de cada vehículo que no la tiene y cuyo modelo se conoce (René, 2026-11-20), como supuesto
 * declarado: la de su ficha por año (`fichaDe`), la de la ficha de su modelo (`masaDeModelo`) o, si la
 * ficha de su modelo no publica la masa, la típica de su clase. Sin modelo no se toca: se pregunta.
 */
export function conMasasDelModelo(
  e: Expediente,
  tipica: (clase: string | undefined) => { valor: number } | null,
): Expediente {
  let cambio = false;
  const vehiculos = e.vehiculos.map((v) => {
    if (v.masa || !v.modelo?.valor) return v;
    const kg = fichaDe(v)?.masa_kg ?? masaDeModelo(v)?.masa_kg ?? tipica(v.clase)?.valor;
    if (kg === undefined) return v;
    cambio = true;
    return { ...v, masa: { valor: kg, unidad: "kg" as const, fuente: "supuesto" as const } };
  });
  return cambio ? { ...e, vehiculos } : e;
}
