/**
 * Los textos de la portada, en español y en inglés (René, 2026-11-24). Cada cifra sale del índice
 * único (`lib/portada-cesvi.ts`) con el formateador único; ninguna se escribe a mano. El nombre de
 * la app no se escribe: donde va, va el logo.
 */
import { formato as F } from "@croquis/cesvi";
import type { Lang } from "@/i18n";
import type { DatosPortadaCesvi, TasaPublicada } from "@/lib/portada-cesvi";

/** Las secciones de la barra, en orden. */
export const SECCIONES = ["como-funciona", "distinto", "resultados", "limites"] as const;
/** Los pasos de la app: la clave es el nombre de su captura en `public/portada/app/`. */
export const PASOS = [
  "hecho",
  "escena",
  "reconstruccion",
  "versiones",
  "analisis",
  "dictamen",
] as const;
export const DETALLES = ["rango", "cita", "supuestos", "dictamen"] as const;

/** Las siete letras: el lema va en español en los dos idiomas (es el nombre). */
export const LEMA = [
  "Cuenta.",
  "Reconoce.",
  "Ordena.",
  "¿Qué falta?",
  "Ubica.",
  "Impacta.",
  "Simula.",
] as const;

interface Cifra {
  clave: string;
  tasa: TasaPublicada;
  /** «de» u «of», entre k y n. */
  de: string;
  pct: string;
  que: string;
  limite: string;
}

export interface TextosPortadaV3 {
  lang: Lang;
  saltar: string;
  otroIdioma: { texto: string; href: string; hrefLang: string };
  secciones: Record<(typeof SECCIONES)[number], string>;
  navegacion: string;
  abrir: string;
  ver: string;
  rotulo: string;
  /** El titular, con el logo entre sus dos partes. */
  h1: [string, string];
  lede: string;
  altInicio: string;
  leyenda: string;
  lemaTitulo: string;
  /** El sentido de cada palabra del lema, en inglés. */
  lemaGlosa: readonly string[] | null;
  comoTitulo: string;
  pasos: { nombre: string; titulo: string; texto: string; alt: string }[];
  capturas: string;
  distintoTitulo: string;
  distinto: { titulo: string; texto: string; alt: string }[];
  resultadosTitulo: string;
  resultadosNota: string;
  cifras: Cifra[];
  limitesTitulo: string;
  limites: { titulo: string; texto: string }[];
  firma: string;
  cierre: string;
  pie: { leyenda: string; fuentes: string; lista: string[]; codigo: string };
}

export function textosPortadaV3(lang: Lang, d: DatosPortadaCesvi): TextosPortadaV3 {
  const es = lang === "es";
  const de = es ? "de" : "of";
  const cifra = (
    clave: string,
    tasa: TasaPublicada,
    textos: { que: string; limite: string },
  ): Cifra => ({ clave, tasa, de, pct: F.porcentaje(tasa.pct, 1), ...textos });
  const regla = F.tasa(d.regla, de);
  const esperado = F.porcentaje(d.cobertura.esperado_pct, 0);

  if (!es)
    return {
      lang,
      saltar: "Skip to content",
      otroIdioma: { texto: "Español", href: "/", hrefLang: "es-MX" },
      secciones: {
        "como-funciona": "How it works",
        distinto: "What sets it apart",
        resultados: "Results",
        limites: "Limits",
      },
      navegacion: "Sections",
      abrir: "Open the app",
      ver: "How it works",
      rotulo: "Crash reconstruction for experts",
      h1: ["The expert tells what happened. ", " reconstructs it with physics, in 3D."],
      lede: "From the narrative to the report, with the source of every number in sight.",
      altInicio:
        "3D reconstruction of an invented example at night in the rain: two cars in line on an avenue and a ring marking the point of impact.",
      leyenda: "Illustrative reconstruction · procedural surroundings: not the real place",
      lemaTitulo: "What the name means, in Spanish",
      lemaGlosa: [
        "Tell.",
        "Recognize.",
        "Order.",
        "What's missing?",
        "Place.",
        "Impact.",
        "Simulate.",
      ],
      comoTitulo: "Six steps, from the narrative to the signature.",
      pasos: [
        {
          nombre: "The facts",
          titulo: "Narrate as always.",
          texto:
            "The expert writes or pastes the narrative. The reading marks vehicles, damage, place and measurements, and asks only for what is missing.",
          alt: "The facts: the narrative with each datum underlined and, beside it, the two vehicles that were read.",
        },
        {
          nombre: "The scene",
          titulo: "Place it on the map.",
          texto:
            "Where the impact was, where each vehicle came from and where it came to rest. The expert confirms or corrects with a tap.",
          alt: "The scene: the map with both vehicles, their paths, the impact and a dirt area.",
        },
        {
          nombre: "Reconstruction",
          titulo: "Physics does the rest.",
          texto:
            "It searches for the speeds that explain the final positions and the damage. The result is seen in 3D and on the 2D sketch, with its range.",
          alt: "Reconstruction: the impact in 3D and the speed before impact with its simulations and its range.",
        },
        {
          nombre: "Versions",
          titulo: "Test every version.",
          texto:
            "What each driver stated and the expert's own hypotheses are simulated with the same physics, and what changes is shown. It never says who is right.",
          alt: "Versions: the 3D and, beside it, what changes with a hypothesis.",
        },
        {
          nombre: "Analysis",
          titulo: "Check it with numbers.",
          texto:
            "Damage, energy and a verification with CESVI's method, with every assumption and its range.",
          alt: "Analysis: the measured crush profile and the list of assumptions, each with its range.",
        },
        {
          nombre: "Report",
          titulo: "Sign your report.",
          texto:
            "In PDF or Word, structured like CESVI's reports. The expert writes the conclusion and signs it.",
          alt: "Report: the draft and, beside it, the empty conclusion for the expert to write.",
        },
      ],
      capturas:
        "Unedited captures of the app, which is in Spanish, with invented example narratives.",
      distintoTitulo: "Every number can be questioned. And answered.",
      distinto: [
        {
          titulo: "Physics with its uncertainty.",
          texto:
            "A speed never comes alone: it carries the range of simulations that vary whatever is uncertain.",
          alt: "A speed with its range and one dot per simulation.",
        },
        {
          titulo: "Every datum, with its quote.",
          texto: "The reading points to the sentence each datum was taken from.",
          alt: "A narrative with the quoted sentences highlighted.",
        },
        {
          titulo: "Assumptions in plain sight.",
          texto:
            "What the narrative does not say goes in as a marked assumption, with its reason and, when it varies, its range.",
          alt: "The list of assumptions with their values and ranges.",
        },
        {
          titulo: "The report belongs to the expert.",
          texto:
            "The app does not write the conclusion or sign. Without validation, it stays a draft.",
          alt: "The expert's conclusion box, empty, with the note that the app does not write it.",
        },
      ],
      resultadosTitulo: "Measured, with its limit beside it.",
      resultadosNota: "Published figures, computed from the repository's evaluations.",
      cifras: [
        cifra("cobertura", d.cobertura, {
          que: "known speeds fell inside the range",
          limite: `In made-up cases; about ${esperado} was expected, so the range still promises more than it delivers.`,
        }),
        cifra("modalidad", d.modalidad, {
          que: "collision types match the report's title",
          limite: `Only reports that state it in their title; always saying the most frequent one gets ${regla}.`,
        }),
        cifra("carambolas", d.carambolas, {
          que: "later pile-up impacts happen in the reconstruction",
          limite: "Only those that make it into the scene; it is a small sample.",
        }),
      ],
      limitesTitulo: "What it does not do.",
      limites: [
        {
          titulo: "It does not assign blame.",
          texto: "It compares versions with physics; it never says who is right.",
        },
        {
          titulo: "It does not diagnose.",
          texto: "It does not estimate injuries or show injured people.",
        },
        {
          titulo: "AI does not compute.",
          texto:
            "AI reads the narrative and puts it in order. Speeds and paths are computed by physics, with the same result every time.",
        },
        {
          titulo: "It is not the real place.",
          texto:
            "The 3D is illustrative; it supports the expert's work and does not replace evidence.",
        },
      ],
      firma: "The expert signs the report.",
      cierre: "From the narrative to the signature.",
      pie: {
        leyenda: "Supporting reconstruction. The report belongs to the expert.",
        fuentes: "Data and credits",
        lista: [
          "Streets: © OpenStreetMap contributors (ODbL); map by OpenFreeMap",
          "Crash data: NHTSA and INEGI (ATUS)",
          "Typefaces: Instrument Serif, Instrument Sans and Geist Mono; logo set in Anybody (SIL OFL 1.1)",
        ],
        codigo: "Code (MIT)",
      },
    };

  return {
    lang,
    saltar: "Saltar al contenido",
    otroIdioma: { texto: "English", href: "/en", hrefLang: "en" },
    secciones: {
      "como-funciona": "Cómo funciona",
      distinto: "Lo distinto",
      resultados: "Resultados",
      limites: "Límites",
    },
    navegacion: "Secciones",
    abrir: "Abrir la app",
    ver: "Cómo funciona",
    rotulo: "Reconstrucción de hechos de tránsito",
    h1: ["El perito narra el hecho. ", " lo reconstruye con física y en 3D."],
    lede: "De la narración al dictamen, con la fuente de cada número a la vista.",
    altInicio:
      "Reconstrucción en 3D de un ejemplo inventado, de noche y con lluvia: dos autos en fila sobre una avenida y un aro que marca el punto de impacto.",
    leyenda: "Reconstrucción ilustrativa · entorno procedural: no es el lugar real",
    lemaTitulo: "Qué significa el nombre",
    lemaGlosa: null,
    comoTitulo: "Seis pasos, de la narración a la firma.",
    pasos: [
      {
        nombre: "El hecho",
        titulo: "Narra como siempre.",
        texto:
          "El perito escribe o pega su narración. La lectura marca vehículos, daños, lugar y medidas, y pregunta solo lo que falta.",
        alt: "El hecho: la narración con cada dato subrayado y, al lado, los dos vehículos leídos.",
      },
      {
        nombre: "La escena",
        titulo: "Ubícalo en el mapa.",
        texto:
          "Dónde fue el choque, por dónde venía cada vehículo y dónde quedó. El perito confirma o corrige con un toque.",
        alt: "La escena: el mapa con los dos vehículos, sus trayectorias, el choque y una zona de terracería.",
      },
      {
        nombre: "Reconstrucción",
        titulo: "La física hace el resto.",
        texto:
          "Busca las velocidades que explican las posiciones finales y los daños. El resultado se ve en 3D y en el croquis 2D, con su rango.",
        alt: "Reconstrucción: el impacto en 3D y la velocidad antes del impacto con sus simulaciones y su rango.",
      },
      {
        nombre: "Versiones",
        titulo: "Prueba cada versión.",
        texto:
          "Lo que declaró cada conductor y las hipótesis del perito se simulan con la misma física, y se ve qué cambia. Nunca dice quién tiene razón.",
        alt: "Versiones: el 3D y, al lado, qué cambia con una hipótesis.",
      },
      {
        nombre: "Análisis",
        titulo: "Compruébalo con números.",
        texto:
          "Daños, energía y la verificación con el método de CESVI, con cada supuesto y su rango.",
        alt: "Análisis: el perfil de la deformación medida y la lista de supuestos, cada uno con su rango.",
      },
      {
        nombre: "Dictamen",
        titulo: "Firma tu dictamen.",
        texto:
          "En PDF o Word, con la estructura de los reportes de CESVI. El perito escribe la conclusión y la firma.",
        alt: "Dictamen: el borrador y, al lado, la conclusión vacía para que la escriba el perito.",
      },
    ],
    capturas: "Capturas de la app sin retoque, con narraciones de ejemplo inventadas.",
    distintoTitulo: "Cada número se puede cuestionar. Y responder.",
    distinto: [
      {
        titulo: "Física con su incertidumbre.",
        texto:
          "Una velocidad nunca va sola: lleva el rango de las simulaciones que varían lo incierto.",
        alt: "Una velocidad con su rango y un punto por cada simulación.",
      },
      {
        titulo: "Cada dato, con su cita.",
        texto: "La lectura señala la frase del reporte de la que salió cada dato.",
        alt: "Una narración con las frases citadas resaltadas.",
      },
      {
        titulo: "Los supuestos, a la vista.",
        texto:
          "Lo que la narración no dice entra como supuesto marcado, con su porqué y, si varía, su rango.",
        alt: "La lista de supuestos con sus valores y sus rangos.",
      },
      {
        titulo: "El dictamen es del perito.",
        texto: "La app no redacta la conclusión ni firma. Sin validar, sale como borrador.",
        alt: "La conclusión del perito, vacía, con la nota de que la app no la redacta.",
      },
    ],
    resultadosTitulo: "Medido, y con su límite al lado.",
    resultadosNota: "Cifras publicadas, calculadas de las evaluaciones del repositorio.",
    cifras: [
      cifra("cobertura", d.cobertura, {
        que: "velocidades conocidas cayeron dentro del rango",
        limite: `En casos fabricados; se esperaba cerca de ${esperado}, así que el rango todavía promete más de lo que cumple.`,
      }),
      cifra("modalidad", d.modalidad, {
        que: "modalidades coinciden con el título del reporte",
        limite: `Solo los reportes que la dicen en su título; decir siempre la más frecuente acierta ${regla}.`,
      }),
      cifra("carambolas", d.carambolas, {
        que: "impactos posteriores de carambola ocurren en la reconstrucción",
        limite: "Solo los que pasan a la escena; es una muestra chica.",
      }),
    ],
    limitesTitulo: "Lo que no hace.",
    limites: [
      {
        titulo: "No decide culpas.",
        texto: "Compara versiones con física; nunca dice quién tiene razón.",
      },
      {
        titulo: "No hace diagnósticos.",
        texto: "No estima lesiones ni muestra personas lesionadas.",
      },
      {
        titulo: "La IA no calcula.",
        texto:
          "La IA lee la narración y la ordena. Las velocidades y las trayectorias las calcula la física, con el mismo resultado cada vez.",
      },
      {
        titulo: "No es el lugar real.",
        texto: "El 3D es ilustrativo: apoya el trabajo del perito y no sustituye a la evidencia.",
      },
    ],
    firma: "El dictamen lo firma el perito.",
    cierre: "De la narración a la firma.",
    pie: {
      leyenda: "Reconstrucción de apoyo. El dictamen es del perito.",
      fuentes: "Datos y atribuciones",
      lista: [
        "Calles: © colaboradores de OpenStreetMap (ODbL); mapa de OpenFreeMap",
        "Datos de choques: NHTSA e INEGI (ATUS)",
        "Tipografías: Instrument Serif, Instrument Sans y Geist Mono; logotipo con Anybody (SIL OFL 1.1)",
      ],
      codigo: "Código (MIT)",
    },
  };
}
