/**
 * El lugar y el sentido de circulación, separados (ronda 4; René, 2026-11-18: «"iba sobre Tollocan
 * rumbo a Ciudad de México" se busca completo en el mapa y no encuentra nada»).
 *
 * - **El lugar** («sobre Tollocan» → «Tollocan») es lo único que va al buscador, con el municipio y el
 *   estado del caso. Nunca la frase completa.
 * - **El sentido** es la dirección de llegada del vehículo en la vía:
 *   - cardinal: «de oriente a poniente», «con dirección al norte», «en sentido sur-norte»;
 *   - hacia un destino: «rumbo a Ciudad de México», «hacia Toluca», «con dirección a Metepec».
 *     El destino se busca aparte, y el rumbo del choque hacia él dice en qué sentido de la vía
 *     iba (`rumboHacia`).
 *
 * Es determinista y deja su cita; no llama al modelo.
 */

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Los puntos cardinales y su rumbo (grados desde el norte, en el sentido de las manecillas). */
export const RUMBOS_CARDINALES: Record<string, number> = {
  norte: 0,
  noreste: 45,
  nororiente: 45,
  oriente: 90,
  este: 90,
  sureste: 135,
  suroriente: 135,
  sur: 180,
  suroeste: 225,
  surponiente: 225,
  poniente: 270,
  oeste: 270,
  noroeste: 315,
  norponiente: 315,
};
const CARDINAL = `(${Object.keys(RUMBOS_CARDINALES).join("|")})`;

export interface SentidoNarradoLugar {
  /** «cardinal»: el rumbo sale del texto; «destino»: hay que buscar el destino para tener el rumbo. */
  tipo: "cardinal" | "destino";
  /** Rumbo (grados desde el norte) si es cardinal. */
  rumbo?: number;
  /** El destino tal como se escribió, sin artículo («Ciudad de México»), si es un destino. */
  destino?: string;
  /** La frase literal. */
  cita: string;
}

export interface LugarYSentido {
  /** Lo que va al buscador; null si no queda nada que buscar. */
  lugar: string | null;
  sentido: SentidoNarradoLugar | null;
}

/** Corta en el texto original lo que se encontró en su versión sin acentos (mismo largo). */
const tramo = (texto: string, i: number, largo: number) => texto.slice(i, i + largo);

/** Lo que va después de «rumbo a» hasta el fin de la idea. */
const FIN_DESTINO =
  /\s*(?:[,;.:]|\s(?:y|e|cuando|donde|para|pero|al\s+llegar|a\s+la\s+altura|a\s+exceso|a\s+\d|,)\s).*$/i;

/** Separa el lugar del sentido en una frase de la narración o en la descripción del lugar. */
export function separarLugarYSentido(texto: string | null | undefined): LugarYSentido {
  if (!texto?.trim()) return { lugar: null, sentido: null };
  const original = texto.trim();
  const plano = sinAcentos(original).toLowerCase();
  let sentido: SentidoNarradoLugar | null = null;
  let quitar: [number, number] | null = null;

  // 1. «de oriente a poniente», «del sur hacia el norte»: manda el destino.
  const deA = new RegExp(
    `\\bde(?:l)?\\s+${CARDINAL}\\s+(?:a|al|hacia(?:\\s+el)?)\\s+${CARDINAL}\\b`,
  ).exec(plano);
  // «en sentido sur-norte».
  const guion = new RegExp(`\\b(?:en\\s+)?sentido\\s+${CARDINAL}\\s*[-–]\\s*${CARDINAL}\\b`).exec(
    plano,
  );
  const par = deA ?? guion;
  if (par) {
    sentido = {
      tipo: "cardinal",
      rumbo: RUMBOS_CARDINALES[par[2]!]!,
      cita: tramo(original, par.index, par[0].length),
    };
    quitar = [par.index, par.index + par[0].length];
  } else {
    // 2. «rumbo a …», «hacia …», «con dirección a …», «con destino a …», «en dirección de …».
    const hacia =
      /\b(?:con\s+rumbo|rumbo|con\s+direccion|en\s+direccion|direccion|con\s+destino|hacia|en\s+sentido)\s+(?:(?:al|a|hacia|del|de|para)\s+)?(?:(?:la|el|los|las)\s+)?/.exec(
        plano,
      );
    if (hacia) {
      const ini = hacia.index + hacia[0].length;
      const resto = plano.slice(ini).replace(FIN_DESTINO, "").trim();
      const fin = ini + resto.length;
      const cardinal = new RegExp(`^${CARDINAL}$`).exec(resto);
      if (resto) {
        sentido = cardinal
          ? {
              tipo: "cardinal",
              rumbo: RUMBOS_CARDINALES[cardinal[1]!]!,
              cita: tramo(original, hacia.index, fin - hacia.index),
            }
          : {
              tipo: "destino",
              destino: tramo(original, ini, resto.length).replace(/^(la|el|los|las)\s+/i, ""),
              cita: tramo(original, hacia.index, fin - hacia.index),
            };
        quitar = [hacia.index, fin];
      }
    }
  }

  // El lugar: lo demás, sin el sentido, sin «iba por» ni «sobre», y sin lo que no es lugar.
  let lugar = quitar ? original.slice(0, quitar[0]) + " " + original.slice(quitar[1]) : original;
  lugar = lugar
    .replace(
      /^\s*(?:(?:el|la)\s+)?(?:veh[ií]culo\s+\S+\s+)?(?:iba|ibamos|íbamos|circulaba|circul[aá]bamos|transitaba|ven[ií]a|avanzaba|manejaba|conduc[ií]a)\s+(?:por|sobre|en)\s+/i,
      "",
    )
    .replace(/^\s*(?:por|sobre|en)\s+/i, "")
    .replace(
      /\s*,?\s*(?:y\s+)?(?:me|se|nos)\s+(?:sal[ií]|sali[oó]|impact|estrell|choc|volc|perd).*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .replace(/[\s,;.:]+$/, "")
    .trim();
  return { lugar: lugar.length >= 3 ? lugar : null, sentido };
}

/** El rumbo (grados desde el norte) de un punto hacia otro. */
export function rumboHacia(
  desde: { lat: number; lon: number },
  hacia: { lat: number; lon: number },
): number {
  const f1 = (desde.lat * Math.PI) / 180;
  const f2 = (hacia.lat * Math.PI) / 180;
  const dl = ((hacia.lon - desde.lon) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360;
}
