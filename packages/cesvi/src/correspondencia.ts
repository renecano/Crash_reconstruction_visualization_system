/**
 * Correspondencia de daños y sugerencia de Croquis (Hito 3, docs/cesvi/PROTOTIPO.md, ADR 0051).
 *
 * - Los criterios de correspondencia son los de CESVI; el perito marca cada uno con una nota.
 * - Las zonas de daño se dibujan en un diagrama por vehículo.
 * - La sugerencia usa los tres argumentos con que el dictamen A2010930 decide si la versión
 *   declarada se sostiene: si las velocidades difieren de forma significativa, si hubo
 *   desplazamiento (los restos separados) y dónde se acentúan los daños. Cada razón queda ligada a
 *   su evidencia. Croquis propone; el perito acepta, edita o rechaza, y el dictamen registra quién
 *   validó y cuándo.
 */
import type { ComparacionVelocidades } from "./metodo";

export const CRITERIOS = [
  {
    clave: "intercambio_material",
    nombre: "Intercambio de material",
    descripcion: "Pintura, plástico o residuos de un vehículo en el otro.",
  },
  {
    clave: "forma",
    nombre: "Forma",
    descripcion: "La forma del daño corresponde con la parte del otro vehículo que lo hizo.",
  },
  {
    clave: "altura",
    nombre: "Altura",
    descripcion: "Las alturas de los daños de ambos vehículos coinciden.",
  },
  {
    clave: "magnitud",
    nombre: "Magnitud",
    descripcion: "La profundidad y extensión del daño corresponden con la energía del impacto.",
  },
  {
    clave: "direccion",
    nombre: "Dirección del daño",
    descripcion: "La dirección de la deformación corresponde con la dinámica del hecho.",
  },
  {
    clave: "dano_previo",
    nombre: "Daño previo",
    descripcion: "Hay daños anteriores al hecho (óxido, reparaciones) que no corresponden.",
  },
  {
    clave: "lugar",
    nombre: "El lugar explica el daño",
    descripcion: "Los elementos del lugar (restos, marcas, objetos) explican los daños.",
  },
] as const;

export type ClaveCriterio = (typeof CRITERIOS)[number]["clave"];
export type MarcaCriterio = "corresponde" | "no_corresponde" | "no_determinable" | null;

export interface CriterioMarcado {
  marca: MarcaCriterio;
  nota: string;
}

export function criteriosVacios(): Record<ClaveCriterio, CriterioMarcado> {
  return Object.fromEntries(CRITERIOS.map((c) => [c.clave, { marca: null, nota: "" }])) as Record<
    ClaveCriterio,
    CriterioMarcado
  >;
}

/** Zonas del diagrama de daños, vistas desde arriba con el frente hacia arriba. */
export const ZONAS = [
  "frontal_izquierda",
  "frontal_centro",
  "frontal_derecha",
  "lateral_izquierdo",
  "lateral_derecho",
  "posterior_izquierda",
  "posterior_centro",
  "posterior_derecha",
] as const;
export type Zona = (typeof ZONAS)[number];

export const NOMBRE_ZONA: Record<Zona, string> = {
  frontal_izquierda: "frontal izquierda",
  frontal_centro: "frontal central",
  frontal_derecha: "frontal derecha",
  lateral_izquierdo: "lateral izquierdo",
  lateral_derecho: "lateral derecho",
  posterior_izquierda: "posterior izquierda",
  posterior_centro: "posterior central",
  posterior_derecha: "posterior derecha",
};

/** Zonas con daño a partir de la observación del dictamen (zona y acentuación). */
export function zonasDeDanos(danos: readonly { zona: string; acento?: string }[]): Zona[] {
  const out = new Set<Zona>();
  for (const d of danos) {
    const z = d.zona.toLowerCase();
    if (z !== "frontal" && z !== "posterior") continue;
    const a = d.acento?.toLowerCase();
    out.add(
      a === "izquierda"
        ? (`${z}_izquierda` as Zona)
        : a === "derecha"
          ? (`${z}_derecha` as Zona)
          : (`${z}_centro` as Zona),
    );
  }
  return [...out];
}

export type Sentido = "contra_declarada" | "a_favor_declarada" | "sin_dato";

export interface Razon {
  clave: "velocidades" | "desplazamiento" | "ubicacion_danos";
  sentido: Sentido;
  texto: string;
  /** La evidencia a la que remite (para ligarla en la página y en el dictamen). */
  evidencia: string;
}

export interface Sugerencia {
  conclusion: "no_se_sostiene" | "se_sostiene" | "no_concluyente";
  texto: string;
  razones: Razon[];
  regla: string;
}

export interface EntradaSugerencia {
  /** Comparación de la velocidad de impacto con la de desplazamiento (umbral del perito). */
  comparacion: ComparacionVelocidades | null;
  /** Separación de los restos usada en el cálculo 2 (m) y de dónde salió. */
  distanciaRestos: number | null;
  fuenteDistancia: string;
  zonasA: readonly Zona[];
  zonasB: readonly Zona[];
}

const lateral = (zonas: readonly Zona[], parte: "frontal" | "posterior") =>
  zonas.some((z) => z === `${parte}_izquierda` || z === `${parte}_derecha`);
const central = (zonas: readonly Zona[], parte: "frontal" | "posterior") =>
  zonas.includes(`${parte}_centro` as Zona);

export const REGLA_SUGERENCIA =
  "Croquis cuenta las tres razones del reporte de CESVI: si dos o más van contra la versión declarada, sugiere que no se sostiene; si dos o más van a su favor, que se sostiene; si no, que no es concluyente. Es una sugerencia: el perito decide.";

/** La sugerencia de Croquis sobre la versión declarada (una reversa de A), con sus razones. */
export function sugerir(e: EntradaSugerencia): Sugerencia {
  const razones: Razon[] = [];

  if (!e.comparacion) {
    razones.push({
      clave: "velocidades",
      sentido: "sin_dato",
      texto: "Faltan las velocidades para compararlas.",
      evidencia: "Cálculos 1 y 2",
    });
  } else {
    const c = e.comparacion;
    razones.push({
      clave: "velocidades",
      sentido: c.significativa ? "a_favor_declarada" : "contra_declarada",
      texto: c.significativa
        ? `La velocidad de impacto y la de desplazamiento difieren ${c.diferenciaPct.toFixed(2)} %, más que el umbral de ${c.umbralPct} %: no confirman que los daños y el desplazamiento vengan del mismo alcance.`
        : `La velocidad de impacto y la de desplazamiento difieren ${c.diferenciaPct.toFixed(2)} %, dentro del umbral de ${c.umbralPct} %: daños y desplazamiento son consistentes con un alcance.`,
      evidencia: "Cálculos 1, 2 y 3",
    });
  }

  if (e.distanciaRestos === null || !Number.isFinite(e.distanciaRestos)) {
    razones.push({
      clave: "desplazamiento",
      sentido: "sin_dato",
      texto: "Falta la separación de los restos.",
      evidencia: "Zona de restos",
    });
  } else if (e.distanciaRestos > 0) {
    razones.push({
      clave: "desplazamiento",
      sentido: "contra_declarada",
      texto: `Los restos están separados ${e.distanciaRestos.toFixed(2)} m (${e.fuenteDistancia}). En una reversa no habría desplazamiento entre los vehículos, o sería mínimo, y los restos quedarían en la posición final. Si el perito considera mínima esa separación, esta razón no aplica.`,
      evidencia: "Zona de restos y cálculo 2",
    });
  } else {
    razones.push({
      clave: "desplazamiento",
      sentido: "a_favor_declarada",
      texto:
        "Los restos no tienen separación: es lo que se espera de una reversa sin desplazamiento.",
      evidencia: "Zona de restos",
    });
  }

  const lateralA = lateral(e.zonasA, "posterior");
  const lateralB = lateral(e.zonasB, "frontal");
  const centralA = central(e.zonasA, "posterior");
  const centralB = central(e.zonasB, "frontal");
  if (!e.zonasA.length || !e.zonasB.length) {
    razones.push({
      clave: "ubicacion_danos",
      sentido: "sin_dato",
      texto: "Faltan las zonas de daño de uno de los vehículos.",
      evidencia: "Diagrama de zonas de daño",
    });
  } else if (lateralA && lateralB && !centralA && !centralB) {
    razones.push({
      clave: "ubicacion_danos",
      sentido: "contra_declarada",
      texto:
        "Los daños se acentúan hacia un lado en la parte posterior de A y en el frente de B. En una reversa estarían centrados en ambos; la acentuación lateral indica una maniobra evasiva.",
      evidencia: "Diagrama de zonas de daño",
    });
  } else if (centralA && centralB) {
    razones.push({
      clave: "ubicacion_danos",
      sentido: "a_favor_declarada",
      texto:
        "Los daños están centrados en la parte posterior de A y en el frente de B, como se espera de una reversa.",
      evidencia: "Diagrama de zonas de daño",
    });
  } else {
    razones.push({
      clave: "ubicacion_danos",
      sentido: "sin_dato",
      texto: "La ubicación de los daños no distingue entre las dos versiones.",
      evidencia: "Diagrama de zonas de daño",
    });
  }

  const contra = razones.filter((r) => r.sentido === "contra_declarada").length;
  const favor = razones.filter((r) => r.sentido === "a_favor_declarada").length;
  const conclusion = contra >= 2 ? "no_se_sostiene" : favor >= 2 ? "se_sostiene" : "no_concluyente";
  const texto =
    conclusion === "no_se_sostiene"
      ? "La versión declarada (una reversa de A) no se sostiene: los hechos son consistentes con un alcance de B a A."
      : conclusion === "se_sostiene"
        ? "La versión declarada (una reversa de A) se sostiene con la evidencia."
        : "La evidencia no basta para decidir entre la versión declarada y un alcance.";
  return { conclusion, texto, razones, regla: REGLA_SUGERENCIA };
}

export interface Validacion {
  decision: "aceptada" | "editada" | "rechazada";
  /** La conclusión que queda en el dictamen (la de Croquis o la que escribió el perito). */
  conclusion: string;
  perito: string;
  /** ISO 8601. */
  fecha: string;
}
