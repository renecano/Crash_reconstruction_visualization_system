/**
 * Masas de ficha técnica (`data/fichas-tecnicas.json`): para un vehículo de un caso cuyo reporte no
 * da la masa, la de su marca, modelo y año, si está registrada con su fuente (data/SOURCES.md). Va
 * como «supuesto»: es la de la ficha, no la medida de ese vehículo.
 */
import type { Expediente } from "./corpus";
import FICHAS from "./data/fichas-tecnicas.json";
import MASAS_MODELO from "./data/masas-modelo.json";
import CLASES_MODELO from "./data/clases-modelo.json";

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
/** Las marcas que se escriben abreviadas («GM» puede ser cualquiera de sus marcas). */
const ALIAS_MARCA: Readonly<Record<string, readonly string[]>> = {
  vw: ["volkswagen"],
  gm: ["chevrolet", "gmc", "buick", "cadillac"],
};

export function masaDeModelo(v: Expediente["vehiculos"][number]): MasaDeModelo | null {
  const modelo = normal(v.modelo?.valor ?? "");
  if (!modelo) return null;
  // «VW» es Volkswagen y «GM», Chevrolet o sus otras marcas (el crucero de ejemplo dice «marca VW,
  // tipo Jetta» y «marca GM, tipo Camaro»).
  const leida = normal(v.marca?.valor ?? "");
  const marcas = ALIAS_MARCA[leida] ?? (leida ? [leida] : []);
  const marca = marcas[0] ?? "";
  const plano = (t: string) => ` ${t.replace(/[^a-z0-9]+/g, " ").trim()} `;
  const candidatos = (MASAS_MODELO.modelos as MasaDeModelo[]).filter(
    (m) => (!marcas.length || marcas.includes(m.marca)) && plano(modelo).includes(plano(m.familia)),
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

type ClasesModelo = {
  familias: Record<string, string[]>;
  marcas_de_tractocamion: string[];
  marcas_de_camion: string[];
  marcas_de_motocicleta: string[];
};
const CLASES = CLASES_MODELO as ClasesModelo;
const CLASE_DE_FAMILIA = new Map(
  Object.entries(CLASES.familias).flatMap(([clase, fs]) => fs.map((f) => [f, clase] as const)),
);
const enPalabras = (t: string) =>
  normal(t)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * La clase de un vehículo por su modelo (René, 2026-11-24: «el tipo de vehículo sale del modelo»): en
 * 945 menciones de las 671 lecturas del corpus la lectura no dio la clase, ni de un Tsuru. Se busca la
 * familia exacta, luego la más larga con que empieza el modelo («ram 4000» → «ram»), y al final la
 * marca de los tractocamiones, camiones y motocicletas. null si no se reconoce: se pregunta.
 */
export function claseDeModelo(v: Expediente["vehiculos"][number]): string | null {
  const modelo = enPalabras(v.modelo?.valor ?? "");
  const marca = enPalabras(v.marca?.valor ?? "");
  for (const t of [modelo, `${marca} ${modelo}`.trim()])
    if (t && CLASE_DE_FAMILIA.has(t)) return CLASE_DE_FAMILIA.get(t)!;
  let mejor: string | null = null;
  for (const f of CLASE_DE_FAMILIA.keys())
    if (
      f.length >= 3 &&
      (` ${modelo} `.includes(` ${f} `) || ` ${marca} ${modelo} `.includes(` ${f} `))
    )
      if (!mejor || f.length > mejor.length) mejor = f;
  if (mejor) return CLASE_DE_FAMILIA.get(mejor)!;
  if (CLASES.marcas_de_tractocamion.some((m) => marca.includes(m))) return "tractocamion";
  if (CLASES.marcas_de_camion.some((m) => marca.includes(m))) return "camion_unitario";
  if (CLASES.marcas_de_motocicleta.some((m) => marca.includes(m))) return "motocicleta";
  return null;
}

/** La clase de cada vehículo que la lectura no dio, por su modelo (`claseDeModelo`). */
export function conClasesDelModelo(e: Expediente): Expediente {
  let cambio = false;
  const vehiculos = e.vehiculos.map((v) => {
    if (v.clase) return v;
    const clase = claseDeModelo(v);
    if (!clase) return v;
    cambio = true;
    return { ...v, clase: clase as NonNullable<typeof v.clase> };
  });
  return cambio ? { ...e, vehiculos } : e;
}
