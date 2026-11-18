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
    propuestos.push({
      clave: `direccion-${v}`,
      texto: f
        ? `${o.nombreDe(v)}: ${textoFlecha(f).replace(/^Del /, "venía del ")}`
        : `${o.nombreDe(v)}: en el choque, alineado con la calle`,
      porque: s
        ? `la narración dice «${s.cita}»`
        : f
          ? "por las zonas de daño de los vehículos"
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
