/**
 * La escena ya armada (René, 2026-11-18, ronda 4: «que Croquis proponga la escena ya armada con lo que
 * leyó de la narración, y que el perito la revise y corrija en lugar de construirla de cero»).
 *
 * Con las piezas que ya usa La escena, una tras otra y sin preguntar:
 *
 * 1. **El choque** en el cruce que propone Croquis (el de las calles que nombra la narración, o el más
 *    cercano al lugar del caso); sin cruce, en el lugar del caso.
 * 2. **Cada vehículo** en el choque, por sus zonas de contacto, y **por dónde llegaba**: la flecha de la
 *    calle que coincide con el sentido narrado o, si la narración no lo dice, con el rumbo que dan los
 *    daños. Queda alineado con la calle.
 * 3. **Lo que no se puede proponer** (dónde quedó cada uno, si la narración no lo ubica) va en la lista
 *    de lo que falta.
 *
 * Todo queda como supuesto (fuente «supuesto»): se ve distinto y cambia de estado cuando el perito lo
 * confirma o lo corrige. Ningún número de la reconstrucción cambia por proponer: solo se coloca.
 */
import type { Expediente } from "@croquis/cesvi";
import {
  ajustarACalle,
  cardinal,
  elegirDireccion,
  flechaPropuesta,
  flechasDeLlegada,
  marcarChoque,
  nombresDe,
  poseDe,
  proponerChoque,
  rumboAlineado,
  sentidoNarrado,
  textoFlecha,
  type Calle,
  type ImpactoAColocar,
  type Punto,
} from "./escena-facil";

/** Un elemento de la escena propuesta, con por qué Croquis lo puso ahí. */
export interface ElementoPropuesto {
  clave: string;
  /** «El choque, en el cruce de Boulevard Adolfo Ruiz Cortines y …». */
  texto: string;
  /** Por qué: «la narración nombra las dos calles», «por las zonas de daño». */
  porque: string;
}

export interface EscenaPropuesta {
  expediente: Expediente;
  /** El punto de cada choque propuesto, por orden. */
  puntos: Record<number, Punto>;
  propuestos: ElementoPropuesto[];
  /** Lo que Croquis no puede proponer: lo marca el perito («dónde quedó el Nissan Micra»). */
  faltan: ElementoPropuesto[];
}

const POR_QUE_CHOQUE: Record<string, string> = {
  narracion: "la narración nombra las dos calles del cruce",
  una_calle: "la narración nombra una de las calles; es su cruce más cercano al lugar",
  cercania: "es el cruce más cercano al lugar del caso",
};

/**
 * La escena propuesta. `lugar`: el del caso (búsqueda o coordenadas); `calles`: las del mapa (de
 * Overpass o de las teselas). null si no hay dónde ponerla (ni cruce ni lugar).
 */
export function proponerEscena(o: {
  expediente: Expediente;
  impactos: readonly ImpactoAColocar[];
  calles: readonly Calle[];
  narracion: string | null;
  lugar: Punto | null;
  nombreDe: (id: string) => string;
}): EscenaPropuesta | null {
  const { impactos, calles, narracion } = o;
  const vs = o.expediente.vehiculos;
  const cruce = proponerChoque(calles, narracion, o.lugar);
  // Sin cruce cerca, sobre la calle más cercana al lugar (no en medio de una manzana).
  const sobre = !cruce && o.lugar ? ajustarACalle(calles, o.lugar, 150) : null;
  const choque = cruce?.punto ?? sobre?.punto ?? o.lugar;
  if (!choque || !impactos.length) return null;
  const propuestos: ElementoPropuesto[] = [];
  const faltan: ElementoPropuesto[] = [];
  const puntos: Record<number, Punto> = { 1: choque };
  propuestos.push({
    clave: "choque-1",
    texto: cruce?.calles.length
      ? `El choque, en ${cruce.calles.length > 1 ? `el cruce de ${cruce.calles.join(" y ")}` : cruce.calles[0]}`
      : sobre
        ? `El choque, sobre ${sobre.calle.nombre ?? "la calle más cercana"}`
        : "El choque, en el lugar del caso",
    porque: cruce
      ? (POR_QUE_CHOQUE[cruce.segun] ?? "es el cruce más cercano")
      : sobre
        ? "no hay un cruce cerca: va sobre la calle más cercana al lugar buscado"
        : "no hay calles cerca: va en el lugar buscado",
  });
  const sentido = (v: string) =>
    narracion
      ? sentidoNarrado(
          narracion,
          nombresDe(
            vs.find((x) => x.id === v)!,
            vs,
          ),
        )
      : null;
  // El primero del choque fija el giro de todo el choque: el de la narración o el de la calle.
  const primero = impactos[0]!.vehiculos[0]!;
  let e = marcarChoque(
    o.expediente,
    impactos,
    1,
    choque,
    sentido(primero)?.rumbo ?? rumboAlineado(calles, choque, 0),
  );
  // Por dónde llegaba cada uno (solo los del primer choque: los demás impactos los marca el perito).
  const flechas = flechasDeLlegada(calles, choque);
  for (const v of impactos[0]!.vehiculos) {
    const s = sentido(v);
    const i = flechaPropuesta(flechas, s, poseDe(e, v, "impacto")?.rumbo ?? null);
    const f = i >= 0 ? flechas[i]! : null;
    if (f) e = elegirDireccion(e, impactos, v, f.rumbo, (k) => puntos[k] ?? null, true);
    // René (2026-11-18): concreto, por qué calle y en qué sentido, y en qué se basa.
    const caraDe = (id: string) =>
      (o.expediente.danos ?? [])
        .find((d) => d.vehiculo === id && !d.dano_previo)
        ?.zona.cara.replaceAll("_", " ") ?? null;
    const otro = impactos[0]!.vehiculos.find((x) => x !== v) ?? null;
    const daños = [
      caraDe(v) ? `el daño ${caraDe(v)} de ${o.nombreDe(v)}` : null,
      otro && caraDe(otro) ? `el ${caraDe(otro)} de ${o.nombreDe(otro)}` : null,
    ].filter(Boolean);
    // Sin calles del mapa ni sentido narrado no hay de dónde sacar por dónde venía: no se inventa
    // (René, 2026-11-18); falta, y lo elige el perito.
    if (!f && !s) {
      faltan.push({
        clave: `direccion-${v}`,
        texto: `Por dónde venía ${o.nombreDe(v)}`,
        porque: "no hay calles del mapa en este lugar y la narración no lo dice: elígelo tú",
      });
      continue;
    }
    propuestos.push({
      clave: `direccion-${v}`,
      texto: f
        ? `${o.nombreDe(v)}: venía por ${f.calle ?? "la calle sin nombre del mapa"}, de ${f.desde} a ${cardinal(f.rumbo)}`
        : `${o.nombreDe(v)}: en el choque, alineado con la calle`,
      porque: s
        ? `la narración dice «${s.cita}»`
        : f
          ? daños.length
            ? `${daños.join(" y ")} cuadran con que llegara así (${textoFlecha(f).toLowerCase()})`
            : "por las zonas de contacto de los vehículos"
          : "no hay calles del mapa para proponer por dónde llegaba",
    });
  }
  for (const k of impactos.slice(1)) {
    faltan.push({
      clave: `choque-${k.orden}`,
      texto: `El choque ${k.orden} (${k.vehiculos.map(o.nombreDe).join(" con ")})`,
      porque: "Croquis propone el primero; los siguientes los marcas tú",
    });
  }
  for (const v of vs) {
    if (!poseDe(e, v.id, "final"))
      faltan.push({
        clave: `final-${v.id}`,
        texto: `Dónde quedó ${o.nombreDe(v.id)}`,
        porque: "la narración no lo ubica en el mapa",
      });
  }
  return { expediente: e, puntos, propuestos, faltan };
}

/** Una fila de la lista de La escena (ronda 4, propuesta 1): qué es, en qué estado y qué hace. */
export interface ItemEscena {
  clave: string;
  texto: string;
  porque: string | null;
  estado: "propuesto" | "confirmado" | "falta";
  /** Las preguntas de C1 (primer golpe, otros choques, por dónde pasó, terreno) son opcionales. */
  opcional: boolean;
  /** Qué abre «Corregir» o «Marcar»: la pregunta de ese elemento. */
  abre:
    | { tipo: "choque"; orden: number }
    | { tipo: "direccion" | "final"; vehiculo: string }
    | { tipo: "c1"; pregunta: "golpe" | "otros" | "paso" | "terreno" };
}

const TEXTO_C1: Record<"golpe" | "otros" | "paso" | "terreno", string> = {
  golpe: "Dónde fue el primer golpe",
  otros: "Si chocó contra algo más",
  paso: "Por dónde pasó cada vehículo",
  terreno: "El terreno (pendientes, topes, otra superficie)",
};

/**
 * La lista de La escena: cada choque, por dónde venía y dónde quedó cada vehículo, y las preguntas de
 * C1, con su estado. Lo que armó Croquis es «propuesto» (con su porqué) hasta que el perito lo
 * confirma o lo corrige; lo que no se pudo proponer «falta».
 */
export function listaDeLaEscena(o: {
  expediente: Expediente;
  impactos: readonly ImpactoAColocar[];
  /** Los pasos de `pasosEscena` (para las preguntas de C1). */
  pasos: readonly { tipo: string; hecho: boolean }[];
  propuesta: EscenaPropuesta | null;
  /** Si ya se sabe el lugar (buscado o del caso): sin él, lo primero es buscarlo. */
  conLugar?: boolean;
  /** Los choques que el perito ya confirmó en la lista. */
  confirmados: ReadonlySet<string>;
  direccionesNoSe: readonly string[];
  juntoAlChoque: readonly string[];
  desconocidos: readonly string[];
  nombreDe: (id: string) => string;
}): ItemEscena[] {
  const { expediente: e, propuesta } = o;
  const de = (clave: string) => propuesta?.propuestos.find((p) => p.clave === clave) ?? null;
  const out: ItemEscena[] = [];
  const varios = o.impactos.length > 1;
  for (const i of o.impactos) {
    const clave = `choque-${i.orden}`;
    const colocado = i.vehiculos.some((v) => poseDe(e, v, "impacto"));
    const p = de(clave);
    out.push({
      clave,
      texto: colocado
        ? (p?.texto ??
          (varios ? `El choque ${i.orden}, donde lo marcaste` : "El choque, donde lo marcaste"))
        : o.conLugar === false && i.orden === 1
          ? "Dónde fue el hecho: busca el lugar y marca el choque"
          : varios
            ? `Dónde fue el choque ${i.orden}`
            : "Dónde fue el choque",
      porque: colocado ? (p?.porque ?? null) : null,
      estado: !colocado ? "falta" : p && !o.confirmados.has(clave) ? "propuesto" : "confirmado",
      opcional: false,
      abre: { tipo: "choque", orden: i.orden },
    });
  }
  const vistos = new Set<string>();
  for (const i of o.impactos) {
    for (const v of i.vehiculos) {
      if (vistos.has(v)) continue;
      vistos.add(v);
      const pose = poseDe(e, v, "impacto");
      const claveD = `direccion-${v}`;
      const p = de(claveD);
      const confirmada = pose?.fuente === "perito" || o.direccionesNoSe.includes(v);
      // Sin calles ni sentido narrado, Croquis no la propone: falta, aunque el choque ya tenga pose.
      const sinPropuesta = propuesta?.faltan.find((f) => f.clave === claveD) ?? null;
      if (sinPropuesta && !confirmada) {
        out.push({
          clave: claveD,
          texto: sinPropuesta.texto,
          porque: sinPropuesta.porque,
          estado: "falta",
          opcional: false,
          abre: { tipo: "direccion", vehiculo: v },
        });
      } else
        out.push({
          clave: claveD,
          texto: pose
            ? confirmada
              ? `${o.nombreDe(v)}: venía de ${cardinal(pose.rumbo + 180)} a ${cardinal(pose.rumbo)}`
              : (p?.texto ?? `${o.nombreDe(v)}: por dónde venía`)
            : `Por dónde venía ${o.nombreDe(v)}`,
          porque: pose && !confirmada ? (p?.porque ?? "lo propone Croquis por los daños") : null,
          estado: !pose ? "falta" : confirmada ? "confirmado" : "propuesto",
          opcional: false,
          abre: { tipo: "direccion", vehiculo: v },
        });
      const final = poseDe(e, v, "final");
      const resuelto = Boolean(final) || o.juntoAlChoque.includes(v) || o.desconocidos.includes(v);
      out.push({
        clave: `final-${v}`,
        texto: final
          ? `${o.nombreDe(v)}: dónde quedó, marcado`
          : o.juntoAlChoque.includes(v)
            ? `${o.nombreDe(v)}: quedó junto al choque`
            : o.desconocidos.includes(v)
              ? `${o.nombreDe(v)}: no se sabe dónde quedó`
              : `Dónde quedó ${o.nombreDe(v)}`,
        porque: resuelto ? null : "la narración no lo ubica en el mapa",
        estado: resuelto ? "confirmado" : "falta",
        opcional: false,
        abre: { tipo: "final", vehiculo: v },
      });
    }
  }
  for (const pregunta of ["golpe", "otros", "paso", "terreno"] as const) {
    const paso = o.pasos.find((p) => p.tipo === pregunta);
    if (!paso) continue;
    out.push({
      clave: `c1-${pregunta}`,
      texto: TEXTO_C1[pregunta],
      porque: null,
      estado: paso.hecho ? "confirmado" : "falta",
      opcional: true,
      abre: { tipo: "c1", pregunta },
    });
  }
  return out;
}
