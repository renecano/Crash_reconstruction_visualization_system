/**
 * Los textos de la portada v3 (`docs/cesvi/rediseno/Portada-v3.html`), en español y en inglés. Cada
 * cifra sale de los datos que se calculan al compilar (`lib/portada-cesvi.ts`); ninguna se escribe
 * a mano. Donde la referencia afirmaba algo que el producto de hoy no hace, el texto se ajustó al
 * mínimo (anotado en PROGRESS, portada v3).
 */
import type { Lang } from "@/i18n";
import type { DatosPortadaCesvi } from "@/lib/portada-cesvi";

/**
 * La captura mal copiada de «piezas sueltas»: es una ilustración de un error de captura (un dígito
 * transpuesto), no un resultado ni un dato de ningún caso. Toma el valor real del reporte y lo
 * escribe con las dos últimas cifras al revés.
 */
export function capturaMalCopiada(valor: string): string {
  return valor.length >= 2 ? `${valor.slice(0, -2)}${valor.at(-1)}${valor.at(-2)}` : valor;
}

/**
 * La narración de AXA en segmentos, con lo que la lectura de Croquis extrae marcado en el orden en
 * que aparece: la modalidad, la vía y la ubicación (el kilómetro). Si alguno no está, el build falla.
 */
export function segmentosNarracion(
  narracion: string,
  modalidad: string,
): { texto: string; marca: boolean }[] {
  const buscar = [new RegExp(modalidad, "i"), /carretera\s+[^,]+/i, /km\s*\d+\s*\+\s*\d+/i];
  const out: { texto: string; marca: boolean }[] = [];
  let resto = narracion;
  for (const rx of buscar) {
    const m = rx.exec(resto);
    if (!m || !modalidad) throw new Error(`La narración de AXA no trae ${rx.source}`);
    if (m.index) out.push({ texto: resto.slice(0, m.index), marca: false });
    out.push({ texto: m[0], marca: true });
    resto = resto.slice(m.index + m[0].length);
  }
  if (resto) out.push({ texto: resto, marca: false });
  return out;
}

export function textosPortadaV3(lang: Lang, d: DatosPortadaCesvi) {
  const locale = lang === "es" ? "es-MX" : "en-US";
  const n = (x: number, dec = 2) =>
    x.toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const pct = (x: number) =>
    `${Math.abs(x) < 0.005 ? "" : x > 0 ? "+" : "−"}${n(Math.abs(x) < 0.005 ? 0 : Math.abs(x))} %`;
  const entero = (x: number) => x.toLocaleString(locale);
  const a = d.axa;
  const deformacionCesvi = n(a.deformacion.cesvi);
  const igualModalidad = a.modalidad.croquis === a.modalidad.cesvi;
  const restos = n(a.restos.croquis);
  // El ejemplo de «Narra como siempre» es el comienzo de la narración de AXA: se marca lo que la
  // lectura de Croquis extrae (modalidad, vía y ubicación).
  const narracion = segmentosNarracion(a.narracion, a.modalidad.cesvi ?? "");
  const cifras = {
    cifraModalidad: d.modalidadPct,
    cifraRegla: d.reglaPct,
    cifraRestos: Math.round(a.restos.croquis * 100) / 100,
  };
  if (lang === "en") {
    const modalidad = (m: string | null) => (m === "alcance" ? "Rear-end" : (m ?? "—"));
    return {
      lang,
      inicio: "/en",
      otroIdioma: { texto: "Español", href: "/" },
      publico: "/en/publico",
      marca: "Crash reconstruction for experts",
      nav: [
        ["hecho", "The crash"],
        ["problema", "The problem"],
        ["prueba", "The proof"],
        ["metodo", "How it works"],
        ["preguntas", "Questions"],
      ] as [string, string][],
      etiquetas: {
        hecho: "The crash",
        problema: "The problem",
        prueba: "The proof",
        metodo: "How it works",
        preguntas: "Questions",
        significado: "What it means",
        cierre: "Enter",
      } as Record<string, string>,
      entrar: "Enter Croquis",
      acceso: "Expert access",
      como: "How it works",
      eyebrow: "Crash reconstruction",
      h1: ["Reconstruct the crash.", "Defend", " the report."],
      lede: "Narrate the crash in your technical language. You place it on the real site; Croquis reconstructs it with verifiable physics and builds your report, with the source of every number.",
      proof: [
        "From narrative to signature",
        "Every number with its source",
        "The report always belongs to the expert",
      ],
      significa: "What does Croquis mean?",
      abrir: "Open the case file",
      problemaH: ["Today a report is assembled from", "loose pieces."],
      frags: [
        {
          tool: "By hand",
          que: "Sketch",
          h: "The sketch, by hand",
          p: "Positions, distances and trajectories drawn separately, without the real site underneath.",
          fault: { tipo: "texto" as const, texto: "Scale? Orientation?" },
        },
        {
          tool: "Spreadsheet",
          que: "Speeds",
          h: "The calculations, on another sheet",
          p: "McHenry, displacement and braking typed by hand; one miscopied digit changes the conclusion.",
          fault: {
            tipo: "captura" as const,
            antes: deformacionCesvi,
            despues: capturaMalCopiada(deformacionCesvi),
          },
        },
        {
          tool: "Word processor",
          que: "Report",
          h: "The report, from scratch",
          p: "Written by copying from everything above, with no trace of where each number came from.",
          fault: { tipo: "texto" as const, texto: "Source: no record" },
        },
      ],
      junta: ["Croquis joins it into ", "a single flow", ", from narrative to signature."],
      pruebaH: ["We took one of their reports.", "Croquis reached the same result."],
      caso: `AXA ${a.id}`,
      casoResto: ` · a ${modalidad(a.modalidad.cesvi).toLowerCase()} collision in ${a.lugar} · same data, same method.`,
      cols: ["Item", "CESVI report", "Croquis", "Difference"],
      filas: [
        {
          k: "Collision type",
          cesvi: modalidad(a.modalidad.cesvi),
          croquis: modalidad(a.modalidad.croquis),
          dif: igualModalidad ? "Matches" : "Differs",
          chip: true,
          ok: igualModalidad,
        },
        {
          k: "Speed from debris",
          cesvi: n(a.restos.cesvi),
          croquis: restos,
          dif: pct(a.restos.pct),
          chip: false,
          ok: Math.abs(a.restos.pct) < 0.005,
        },
        {
          k: "Speed from crush",
          cesvi: deformacionCesvi,
          croquis: n(a.deformacion.croquis),
          dif: pct(a.deformacion.pct),
          chip: false,
          ok: Math.abs(a.deformacion.pct) < 0.005,
        },
      ],
      nota: `Speeds in km/h. The ${n(Math.abs(a.deformacion.pct))} % difference comes from the data printed in the report; Croquis shows it instead of hiding it.`,
      cifras: [
        [d.reportes, "CESVI reports studied to build it"],
        [d.aCiegas, "reconstructed blind, without seeing their conclusions"],
      ] as [number, string][],
      versus: {
        aria: `Correct collision type in ${entero(d.aCiegas)} reports: Croquis ${n(d.modalidadPct, 1)} percent, simple rule ${n(d.reglaPct, 1)} percent`,
        croquis: "Croquis",
        regla: "Simple rule",
        nota: `Correct collision types over the ${entero(d.aCiegas)} reports reconstructed blind.`,
      },
      metodoH: ["Narrate. Place.", "Reconstruct."],
      pasos: [
        {
          k: "Narrative",
          h: "Narrate as always",
          p: "Croquis understands collision type, contact zones and debris, and only asks what is missing.",
        },
        {
          k: "Site",
          h: "Mark the impact",
          p: "On the real map. Croquis proposes where each vehicle was; you only adjust.",
        },
        {
          k: "Signature",
          h: "Sign the report",
          p: "Speeds with their range, verification with CESVI's method and the document in PDF or Word.",
        },
      ],
      narracion,
      ...cifras,
      detectado: "Detected",
      marcas: ["Collision type", "Road", "Location"],
      coord: [
        ["Point", "Impact"],
        ["Direction", "South → north"],
        ["V1", "Proposed · adjustable"],
        ["V2", "Proposed · adjustable"],
      ] as [string, string][],
      dict: {
        aria: "Example of a line in the report",
        lab: "Speed from debris",
        src: ["Source: report", "Method: CESVI"],
        valido: "Validated by",
        perito: "Expert",
      },
      tenets: [
        {
          h: "Nothing is invented.",
          p: "Every datum says whether it comes from the expert, the report or an assumption. What is missing is asked.",
          tags: "Expert · Report · Assumption",
        },
        {
          h: "It always gives the same result.",
          p: "The same case produces the same result, with its input fingerprint to repeat it.",
          tags: "Input fingerprint",
        },
        {
          h: "The signature is yours.",
          p: "Croquis reconstructs and suggests. The expert reviews, decides and validates the report.",
          tags: "Review · Decide · Validate",
        },
      ],
      preguntasH: ["Questions from", "experts."],
      faq: [
        [
          "Does Croquis sign the report?",
          "No. Croquis reconstructs and suggests; the expert reviews, decides and validates. The signature always belongs to the expert.",
        ],
        [
          "Where does each number come from?",
          "Every datum says whether it comes from the expert, the report or an assumption, and the report keeps that source next to the value.",
        ],
        [
          "What if the narrative is missing a datum?",
          "Croquis asks for what is missing before reconstructing; whatever you choose not to give goes in as an assumption and is marked as such.",
        ],
        [
          "If I reconstruct the same case twice, does the result change?",
          "No. The same case produces the same result and keeps its input fingerprint so anyone can repeat it.",
        ],
        [
          "How often does it get the collision type right?",
          `In ${entero(d.aCiegas)} reports reconstructed blind it got ${n(d.modalidadPct, 1)} % of the collision types right, against ${n(d.reglaPct, 1)} % for a simple rule.`,
        ],
        [
          "In what format does the report come out?",
          "In PDF or Word, with the speeds and their range and the verification with CESVI's method.",
        ],
      ] as [string, string][],
      acroH: ["Seven letters.", "One method."],
      acroP:
        "Croquis is not only the expert's drawing. Each letter is a step of the reconstruction. Tap a letter to read it.",
      descifrar: "Decode Croquis",
      cerrar: "Close again",
      verSignificado: ": see meaning",
      // Las siglas son en español: cada palabra va tal cual, con su sentido en inglés.
      acro: [
        ["C", "Cuenta", "Tell: narrate the crash in your technical language, as always."],
        ["R", "Reconoce", "Recognize: collision type, contact zones and debris."],
        ["O", "Ordena", "Order: each datum with its source, expert, report or assumption."],
        ["Q", "¿Qué falta?", "What's missing? Ask only what the narrative doesn't say."],
        ["U", "Ubica", "Place: put the crash on the real site."],
        ["I", "Impacta", "Impact: compute the impact with verifiable physics."],
        ["S", "Simula", "Simulate: reconstruct the crash and build the report for your signature."],
      ] as [string, string, string][],
      acroEn: ["In English", "Crash Reconstruction from Oral Queries Using Impact Simulation"],
      cierreH: ["From narrative", "to signature."],
      creditos:
        "Everything you see is a reconstruction computed by Croquis (illustrative; the report belongs to the expert). Streets © OpenStreetMap contributors (ODbL).",
      anterior: "Previous home page",
      toastSketch:
        "<b>Hand-drawn sketch mode.</b> This is how it used to be drawn. Type “croquis” again to go back.",
      toastVuelta: "<b>Back to the case file.</b> Croquis does it for you.",
      toastDato: `<b>${restos} km/h</b> · speed from debris · source: report · method: CESVI. That's how traceable every number is.`,
      consola: 'Are you an expert who also codes? Type "croquis" anywhere on the page.',
    };
  }
  const modalidad = (m: string | null) => (m ? m.charAt(0).toUpperCase() + m.slice(1) : "—");
  return {
    lang,
    inicio: "/",
    otroIdioma: { texto: "English", href: "/en" },
    publico: "/publico",
    marca: "Reconstrucción pericial",
    nav: [
      ["hecho", "El hecho"],
      ["problema", "El problema"],
      ["prueba", "La prueba"],
      ["metodo", "Cómo funciona"],
      ["preguntas", "Preguntas"],
    ] as [string, string][],
    etiquetas: {
      hecho: "El hecho",
      problema: "El problema",
      prueba: "La prueba",
      metodo: "Cómo funciona",
      preguntas: "Preguntas",
      significado: "Qué significa",
      cierre: "Entrar",
    } as Record<string, string>,
    entrar: "Entrar a Croquis",
    acceso: "Acceso para peritos",
    como: "Cómo funciona",
    eyebrow: "Reconstrucción de hechos de tránsito",
    h1: ["Reconstruye el hecho.", "Defiende", " el dictamen."],
    // Ajuste contra la referencia: el lugar lo marca el perito en el mapa («lo ubicas»).
    lede: "Narra el choque con tu lenguaje técnico. Lo ubicas en el lugar real; Croquis lo reconstruye con física verificable y arma tu dictamen, con la fuente de cada número.",
    proof: [
      "Del relato a la firma",
      "Cada número con su fuente",
      "El dictamen siempre es del perito",
    ],
    significa: "¿Qué significa Croquis?",
    abrir: "Abrir el expediente",
    problemaH: ["Hoy un dictamen se arma con", "piezas sueltas."],
    frags: [
      {
        tool: "A mano",
        que: "Croquis",
        h: "El croquis, a mano",
        p: "Posiciones, distancias y trayectorias dibujadas aparte, sin el lugar real debajo.",
        fault: { tipo: "texto" as const, texto: "¿Escala? ¿Orientación?" },
      },
      {
        tool: "Hoja de cálculo",
        que: "Velocidades",
        h: "Los cálculos, en otra hoja",
        p: "McHenry, desplazamiento y frenado se capturan a mano; un dígito mal copiado cambia la conclusión.",
        fault: {
          tipo: "captura" as const,
          antes: deformacionCesvi,
          despues: capturaMalCopiada(deformacionCesvi),
        },
      },
      {
        tool: "Procesador de texto",
        que: "Dictamen",
        h: "El dictamen, desde cero",
        p: "Se redacta copiando de todo lo anterior, sin una traza de dónde salió cada número.",
        fault: { tipo: "texto" as const, texto: "Fuente: sin registro" },
      },
    ],
    junta: ["Croquis lo une en ", "un solo flujo", ", del relato a la firma."],
    pruebaH: ["Tomamos uno de sus reportes.", "Croquis llegó a lo mismo."],
    caso: `AXA ${a.id}`,
    casoResto: ` · un ${a.modalidad.cesvi} en ${a.lugar} · mismos datos, mismo método.`,
    cols: ["Concepto", "Reporte de CESVI", "Croquis", "Diferencia"],
    filas: [
      {
        k: "Modalidad",
        cesvi: modalidad(a.modalidad.cesvi),
        croquis: modalidad(a.modalidad.croquis),
        dif: igualModalidad ? "Coincide" : "Difiere",
        chip: true,
        ok: igualModalidad,
      },
      {
        k: "Velocidad por restos",
        cesvi: n(a.restos.cesvi),
        croquis: restos,
        dif: pct(a.restos.pct),
        chip: false,
        ok: Math.abs(a.restos.pct) < 0.005,
      },
      {
        k: "Velocidad por deformación",
        cesvi: deformacionCesvi,
        croquis: n(a.deformacion.croquis),
        dif: pct(a.deformacion.pct),
        chip: false,
        ok: Math.abs(a.deformacion.pct) < 0.005,
      },
    ],
    nota: `Velocidades en km/h. La diferencia de ${n(Math.abs(a.deformacion.pct))} % viene de los datos impresos en el reporte; Croquis la muestra en lugar de esconderla.`,
    cifras: [
      [d.reportes, "reportes de CESVI estudiados para construirlo"],
      [d.aCiegas, "reconstruidos a ciegas, sin ver sus conclusiones"],
    ] as [number, string][],
    versus: {
      aria: `Modalidad correcta en ${entero(d.aCiegas)} reportes: Croquis ${n(d.modalidadPct, 1)} por ciento, regla simple ${n(d.reglaPct, 1)} por ciento`,
      croquis: "Croquis",
      regla: "Regla simple",
      nota: `Modalidades correctas sobre los ${entero(d.aCiegas)} reportes reconstruidos a ciegas.`,
    },
    metodoH: ["Narra. Ubica.", "Reconstruye."],
    pasos: [
      {
        k: "Relato",
        h: "Narra como siempre",
        p: "Croquis entiende modalidad, zonas de contacto y restos, y solo pregunta lo que falta.",
      },
      {
        k: "Lugar",
        h: "Marca el impacto",
        p: "Sobre el mapa real. Croquis propone dónde iba cada vehículo; tú solo ajustas.",
      },
      {
        k: "Firma",
        h: "Firma el dictamen",
        p: "Velocidades con su rango, verificación con el método de CESVI y el documento en PDF o Word.",
      },
    ],
    narracion,
    ...cifras,
    detectado: "Detectado",
    // Ajuste contra la referencia: la lectura no extrae el sentido de circulación; se marcan la
    // modalidad, la vía y la ubicación.
    marcas: ["Modalidad", "Vía", "Ubicación"],
    coord: [
      ["Punto", "Impacto"],
      ["Sentido", "Sur → norte"],
      ["V1", "Propuesto · ajustable"],
      ["V2", "Propuesto · ajustable"],
    ] as [string, string][],
    dict: {
      aria: "Ejemplo de un renglón del dictamen",
      lab: "Velocidad por restos",
      src: ["Fuente: reporte", "Método: CESVI"],
      valido: "Validó",
      perito: "Perito",
    },
    tenets: [
      {
        h: "Nada se inventa.",
        p: "Cada dato dice si viene del perito, del reporte o de un supuesto. Lo que falta, se pregunta.",
        tags: "Perito · Reporte · Supuesto",
      },
      {
        h: "Siempre da lo mismo.",
        p: "El mismo caso produce el mismo resultado, con su huella de entradas para repetirlo.",
        tags: "Huella de entradas",
      },
      {
        h: "La firma es tuya.",
        p: "Croquis reconstruye y sugiere. El perito revisa, decide y valida el dictamen.",
        tags: "Revisa · Decide · Valida",
      },
    ],
    preguntasH: ["Preguntas de", "peritos."],
    faq: [
      [
        "¿Croquis firma el dictamen?",
        "No. Croquis reconstruye y sugiere; el perito revisa, decide y valida. La firma siempre es del perito.",
      ],
      [
        "¿De dónde sale cada número?",
        "Cada dato indica si viene del perito, del reporte o de un supuesto, y el dictamen conserva esa fuente junto al valor.",
      ],
      [
        "¿Qué pasa si al relato le falta un dato?",
        // Ajuste contra la referencia: lo que el perito decide no dar entra como supuesto, marcado.
        "Croquis te pregunta lo que falta antes de reconstruir; lo que decidas no dar entra como supuesto y queda marcado así.",
      ],
      [
        "¿Si reconstruyo el mismo caso dos veces, cambia el resultado?",
        "No. El mismo caso produce el mismo resultado y guarda su huella de entradas para que cualquiera lo repita.",
      ],
      [
        "¿Qué tan seguido acierta la modalidad?",
        `En ${entero(d.aCiegas)} reportes reconstruidos a ciegas acertó ${n(d.modalidadPct, 1)} % de las modalidades, contra ${n(d.reglaPct, 1)} % de una regla simple.`,
      ],
      [
        "¿En qué formato sale el dictamen?",
        "En PDF o Word, con las velocidades y su rango y la verificación con el método de CESVI.",
      ],
    ] as [string, string][],
    acroH: ["Siete letras.", "Un método."],
    acroP:
      "Croquis no es solo el dibujo del perito. Cada letra es un paso de la reconstrucción. Toca una letra para leerla.",
    descifrar: "Descifrar Croquis",
    cerrar: "Volver a cerrar",
    verSignificado: ": ver significado",
    acro: [
      ["C", "Cuenta", "Narra el hecho con tu lenguaje técnico, como siempre."],
      ["R", "Reconoce", "Identifica modalidad, zonas de contacto y restos."],
      ["O", "Ordena", "Acomoda cada dato con su fuente: perito, reporte o supuesto."],
      ["Q", "¿Qué falta?", "Pregunta solo lo que el relato no dice."],
      ["U", "Ubica", "Sitúa el hecho sobre el lugar real."],
      ["I", "Impacta", "Calcula el impacto con física verificable."],
      ["S", "Simula", "Reconstruye el hecho y arma el dictamen para tu firma."],
    ] as [string, string, string][],
    acroEn: ["En inglés", "Crash Reconstruction from Oral Queries Using Impact Simulation"],
    cierreH: ["Del relato", "a la firma."],
    creditos:
      "Todo lo que ves es una reconstrucción calculada por Croquis (ilustrativa; el dictamen es del perito). Calles © colaboradores de OpenStreetMap (ODbL).",
    anterior: "Portada anterior",
    toastSketch:
      "<b>Modo croquis a mano.</b> Así se dibujaba antes. Escribe “croquis” otra vez para volver.",
    toastVuelta: "<b>De vuelta al expediente.</b> Croquis lo hace por ti.",
    toastDato: `<b>${restos} km/h</b> · velocidad por restos · fuente: reporte · método: CESVI. Así de trazable es cada número.`,
    consola: '¿Eres perito y además programas? Escribe "croquis" en cualquier parte de la página.',
  };
}

export type TextosPortadaV3 = ReturnType<typeof textosPortadaV3>;
