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
import { contraLaOrilla } from "./objeto-orilla";
import {
  avanzar,
  conPosicion,
  formato as F,
  impactosEncimados,
  medidasDe,
  rumboDeLlegada,
  rumboHacia,
  type Expediente,
  type SentidoNarradoLugar,
} from "@croquis/cesvi";
import { esLaCalleNarrada } from "./lugar-claro";
import {
  ajustarACalle,
  callesNarradas,
  calzadaEnSuSentido,
  cardinal,
  elegirDireccion,
  flechaPropuesta,
  flechasDeLlegada,
  marcarChoque,
  poseDe,
  proponerChoque,
  rumboAlineado,
  sentidoEnElCaso,
  textoFlecha,
  type Calle,
  type ImpactoAColocar,
  type Punto,
} from "./escena-facil";

/** Palabras de un cruce en la frase del lugar. */
const DE_CRUCE =
  /\b(?:cruce|crucero|esquina|intersecci[oó]n|entronque|glorieta|a la altura de|entre (?:las|la) calles?)\b/i;

/**
 * Si la frase del lugar nombra una sola calle y ningún cruce, y esa calle pasa a menos de 25 m del
 * lugar: el punto sobre ella. null si no.
 */
export function calleNarradaSinCruce(
  calles: readonly Calle[],
  narracion: string,
  lugar: Punto,
): ReturnType<typeof ajustarACalle> {
  const frase = narracion.split(/(?<=\.)\s/)[0] ?? "";
  if (DE_CRUCE.test(frase)) return null;
  const nombradas = callesNarradas(frase);
  if (nombradas.length !== 1) return null;
  const suyas = calles.filter((c) => c.nombre && esLaCalleNarrada(nombradas[0]!.nombre, c.nombre));
  return suyas.length ? ajustarACalle(suyas, lugar, 25) : null;
}

/** La narración dice que iba en sentido contrario: no se le busca la calzada de su sentido. */
const CONTRASENTIDO = /sentido\s+contrario|contrasentido|contraflujo|en\s+reversa|de\s+reversa/i;

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
  a_la_altura:
    "la narración nombra las dos calles y no se cruzan a nivel (un paso a desnivel): va sobre la primera, a la altura de la segunda",
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
  /**
   * El sentido narrado junto al lugar (ronda 4): «rumbo a Ciudad de México» ya convertido en rumbo,
   * o un sentido cardinal. Vale para el vehículo que no tiene otro sentido narrado.
   */
  rumboNarrado?: { rumbo: number; cita: string } | null;
}): EscenaPropuesta | null {
  const { impactos, calles, narracion } = o;
  const vs = o.expediente.vehiculos;
  // La narración pone el choque en una sola calle, sin cruce («en la calle Olivos, frente al acceso
  // vehicular…»), y esa calle está en el lugar: el choque va sobre ella, no en el cruce más cercano
  // (René, 2026-11-25: la reversa de ejemplo caía en la esquina con Calle Laureles, donde no se puede
  // llegar de sur a norte por Olivos).
  const enSuCalle = o.lugar && narracion ? calleNarradaSinCruce(calles, narracion, o.lugar) : null;
  const cruce = enSuCalle ? null : proponerChoque(calles, narracion, o.lugar);
  // Sin cruce cerca, sobre la calle más cercana al lugar (no en medio de una manzana).
  const sobre = enSuCalle ?? (!cruce && o.lugar ? ajustarACalle(calles, o.lugar, 150) : null);
  let choque = cruce?.punto ?? sobre?.punto ?? o.lugar;
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
    (narracion
      ? sentidoEnElCaso(
          narracion,
          vs.find((x) => x.id === v)!,
          vs,
        )
      : null) ??
    // El del lugar, para el que va primero en el choque (o el único).
    (o.rumboNarrado && v === impactos[0]?.vehiculos[0]
      ? {
          rumbo: o.rumboNarrado.rumbo,
          desde: cardinal(o.rumboNarrado.rumbo + 180),
          cita: o.rumboNarrado.cita,
        }
      : null);
  // El primero del choque fija el giro de todo el choque: el de la narración o el de la calle.
  const primero = impactos[0]!.vehiculos[0]!;
  // En su sentido: si la calle del choque es de un solo sentido y va al revés de lo narrado, el
  // choque pasa a la calzada que sí va así (salvo que la narración diga que iba en sentido contrario).
  const rumboPrimero = sentido(primero)?.rumbo;
  const enSuSentido =
    rumboPrimero !== undefined && !(narracion && CONTRASENTIDO.test(narracion))
      ? calzadaEnSuSentido(calles, choque, rumboPrimero)
      : null;
  if (enSuSentido) {
    choque = enSuSentido.punto;
    puntos[1] = choque;
    propuestos.push({
      clave: "choque-sentido",
      texto: `El choque, en la calzada de ${enSuSentido.calle.nombre ?? "la calle"} que va hacia el ${cardinal(rumboPrimero!)}`,
      porque: `la calle del lugar buscado es de un solo sentido y va al revés de lo que dice la narración`,
    });
  }
  let e = marcarChoque(
    o.expediente,
    impactos,
    1,
    choque,
    sentido(primero)?.rumbo ?? rumboAlineado(calles, choque, 0),
  );
  // Por dónde llegaba cada uno (solo los del primer choque: los demás impactos los marca el perito).
  // Sin calles del mapa no hay flechas: las cardinales serían una dirección inventada (René).
  const flechas = calles.length ? flechasDeLlegada(calles, choque) : [];
  for (const v of impactos[0]!.vehiculos) {
    const s = sentido(v);
    const r = poseDe(e, v, "impacto")?.rumbo;
    const i = flechaPropuesta(flechas, s, r === undefined ? null : rumboDeLlegada(e, v, r));
    const f = i >= 0 ? flechas[i]! : null;
    if (f) e = elegirDireccion(e, impactos, v, f.rumbo, (k) => puntos[k] ?? null, true);
    // Sin una calle en el sentido narrado: como lo dice la narración (revisión de la cadena).
    else if (s) e = elegirDireccion(e, impactos, v, s.rumbo, (k) => puntos[k] ?? null, true);
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
        : s
          ? `${o.nombreDe(v)}: venía de ${s.desde} a ${cardinal(s.rumbo)}, como dice la narración; en este lugar no hay una calle en ese sentido: revisa que el lugar sea el del caso`
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
  // El objeto del choque en la orilla, no en el carril (René, 2026-11-24, punto 1): el vehículo sale
  // de su carril hacia la banqueta, el camellón o el acotamiento donde está el objeto.
  const orilla = contraLaOrilla(e, calles, narracion);
  if (orilla) {
    e = orilla.expediente;
    const objeto = (e.impactos ?? []).find((i) => (i.orden ?? 1) === 1)?.objeto_fijo ?? "el objeto";
    propuestos.push({
      clave: "orilla-1",
      texto: `${objeto[0]!.toUpperCase()}${objeto.slice(1)}, en la orilla ${orilla.lado === "derecha" ? "derecha" : "izquierda"}${orilla.calle ? ` de ${orilla.calle}` : ""}: ${o.nombreDe(String(impactos[0]!.vehiculos[0]))} sale de su carril para alcanzarlo`,
      porque: orilla.cita
        ? `la narración dice «${orilla.cita}»`
        : "un objeto fijo está en la banqueta o el acotamiento, no en el carril; la narración no dice de qué lado: la orilla de su carril (muévelo si fue del otro lado)",
    });
  }

  // Los choques siguientes de una carambola (René, 2026-11-24): si el primero de ese choque ya está
  // colocado y se sabe con qué cara golpeó, el choque va en esa cara y el otro se coloca por sus
  // zonas de contacto, tocándose sin encimarse. Si no, lo marca el perito.
  for (const k of impactos.slice(1)) {
    const primeroK = k.vehiculos[0]!;
    const pose = poseDe(e, primeroK, "impacto");
    let zona = (e.impactos ?? [])
      .find((i) => i.orden === k.orden)
      ?.zonas?.find((z) => z.vehiculo === primeroK)?.zona.cara;
    // Sin zonas en este choque: si en uno anterior lo golpearon por detrás, salió empujado hacia
    // adelante: su frente contra la parte trasera del siguiente (supuesto de la carambola en cadena).
    let enCadena = false;
    if (!zona) {
      const golpeadoAtras = (e.impactos ?? []).some(
        (i) =>
          i.orden < k.orden &&
          i.zonas?.some((z) => z.vehiculo === primeroK && z.zona.cara === "posterior"),
      );
      if (golpeadoAtras && k.vehiculos.length === 2) {
        zona = "frontal";
        enCadena = true;
        const otro = k.vehiculos[1]!;
        e = {
          ...e,
          impactos: (e.impactos ?? []).map((i) =>
            i.orden === k.orden
              ? {
                  ...i,
                  zonas: [
                    ...(i.zonas ?? []).filter(
                      (z) => z.vehiculo !== primeroK && z.vehiculo !== otro,
                    ),
                    { vehiculo: primeroK, zona: { cara: "frontal" as const } },
                    ...(i.zonas?.some((z) => z.vehiculo === otro)
                      ? i.zonas.filter((z) => z.vehiculo === otro)
                      : [{ vehiculo: otro, zona: { cara: "posterior" as const } }]),
                  ],
                }
              : i,
          ),
        };
      }
    }
    const v = vs.find((x) => x.id === primeroK);
    const giro = zona ? GIRO_DE_CARA[zona] : undefined;
    if (pose && v && zona && giro !== undefined && k.vehiculos.length === 2) {
      const m = medidasDe(v);
      const media = zona === "frontal" || zona === "posterior" ? m.largo / 2 : m.ancho / 2;
      const [lon, lat] = avanzar([pose.punto.lon, pose.punto.lat], pose.rumbo + giro, media);
      const punto = { lat, lon };
      e = marcarChoque(e, impactos, k.orden, punto, rumboDeLlegada(e, primeroK, pose.rumbo));
      puntos[k.orden] = punto;
      const otro = k.vehiculos[1]!;
      propuestos.push({
        clave: `choque-${k.orden}`,
        texto: `El choque ${k.orden}: ${o.nombreDe(primeroK)} contra ${o.nombreDe(otro)}`,
        porque: enCadena
          ? `supuesto de la carambola en cadena: a ${o.nombreDe(primeroK)} lo golpearon por detrás y salió empujado; su frente contra la parte trasera de ${o.nombreDe(otro)}`
          : `en la cara ${zona.replaceAll("_", " ")} de ${o.nombreDe(primeroK)}, que ya está colocado; ${o.nombreDe(otro)} va por sus zonas de contacto`,
      });
      continue;
    }
    faltan.push({
      clave: `choque-${k.orden}`,
      texto: `El choque ${k.orden} (${k.vehiculos.map(o.nombreDe).join(" con ")})`,
      porque: "Croquis propone el primero; los siguientes los marcas tú",
    });
  }
  // Nada encimado en el choque (revisión de la cadena, René 2026-11-24): la flecha de cada calle gira
  // al vehículo en su lugar y podía dejarlo dentro del otro. Se separan como con «Separarlos»: defensa
  // con defensa si es un alcance, o por el eje de menor traslape.
  for (const enc of impactosEncimados(e)) {
    for (const pose of enc.propuesta) e = conPosicion(e, { ...pose, fase: "impacto" });
    propuestos.push({
      clave: `separados-${enc.orden}`,
      texto: `En el choque ${enc.orden}, ${enc.vehiculos.map(o.nombreDe).join(" y ")} se tocan sin encimarse`,
      porque: `con la dirección de cada uno quedaban encimados ${F.metros(enc.traslape_m)}: Croquis los separó lo mínimo`,
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

/** Hacia dónde mira cada cara respecto al frente (grados, en el sentido del reloj). */
const GIRO_DE_CARA: Record<string, number> = {
  frontal: 0,
  posterior: 180,
  lateral_derecho: 90,
  lateral_izquierdo: -90,
};

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
              ? `${o.nombreDe(v)}: venía de ${cardinal(rumboDeLlegada(o.expediente, v, pose.rumbo) + 180)} a ${cardinal(rumboDeLlegada(o.expediente, v, pose.rumbo))}`
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

/** El rumbo de llegada de un sentido narrado: el cardinal, o el del lugar hacia el destino. */
export function rumboDelSentido(
  s: SentidoNarradoLugar | null,
  destino: Punto | null,
  desde: Punto | null,
): { rumbo: number; cita: string } | null {
  if (!s) return null;
  if (s.tipo === "cardinal" && s.rumbo !== undefined) return { rumbo: s.rumbo, cita: s.cita };
  if (s.tipo === "destino" && destino && desde)
    return { rumbo: rumboHacia(desde, destino), cita: s.cita };
  return null;
}

/**
 * Si se puede ver la reconstrucción desde la lista (ronda 4; René, 2026-11-20: la medición y una
 * persona se quedaban en La escena): cuando no falta ningún elemento obligatorio (cada choque, por
 * dónde venía y dónde quedó cada vehículo). Las preguntas opcionales (primer golpe, otros choques,
 * por dónde pasó, terreno) no bloquean; lo propuesto por Croquis cuenta como listo.
 */
export function listaLista(items: readonly ItemEscena[]): boolean {
  return items.length > 0 && items.every((i) => i.opcional || i.estado !== "falta");
}
