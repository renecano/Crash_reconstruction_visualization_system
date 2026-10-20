/**
 * Textos de la portada (PLAN §11.3): una idea por pantalla, frases cortas, mayúscula solo al inicio.
 * Ninguna cifra vive aquí: todas llegan de `eval/results` por los datos generados.
 */
import { textos } from "@/i18n";

export const TEXTOS_PORTADA = textos(
  {
    lema: "Cuenta lo que pasó. Míralo pasar.",
    cuenta: "Cuenta qué pasó",
    ejemplo: "Ver un ejemplo",
    riel: "Capítulos",
    sigue: "Sigue bajando",
    capitulos: {
      apertura: "Apertura",
      problema: "El problema",
      c: "Cuenta",
      r: "Reconoce",
      o: "Ordena",
      q: "¿Qué falta?",
      u: "Ubica",
      i: "Impacta",
      s: "Simula",
      pruebas: "Las pruebas",
      noes: "Lo que no es",
      cierre: "Cierre",
    },
    problema: {
      cifra: (anio: number) =>
        `hechos de tránsito en zonas urbanas y suburbanas registró el INEGI en ${anio}.`,
      fuente: "ATUS, INEGI",
      mano: "Hoy un choque se explica así: con un dibujo a mano en un parte.",
      manoAlt:
        "Croquis hecho a mano: dos calles que se cruzan, dos rectángulos con las letras A y B y flechas.",
    },
    c: {
      titulo: "Lo dices con tus palabras.",
      cuerpo: "Como se lo contarías a alguien. Los datos personales se quitan en tu dispositivo.",
      traduccion: "",
    },
    r: {
      titulo: "Cada dato sale de una frase.",
      cuerpo:
        "Lo subrayado en naranja es de donde salió cada dato. Lo que no dijiste se marca como supuesto.",
    },
    o: {
      titulo: "Antes, el impacto, después.",
      antes: "antes",
      impacto: "impacto",
      despues: "después",
    },
    q: {
      titulo: "Una sola pregunta.",
      cuerpo: "La que más cambia el resultado. Si no lo sabes, la dejas en blanco.",
    },
    u: {
      titulo: "Lo acomodas en el croquis.",
      cuerpo:
        "Sobre la calle real: Venustiano Carranza y Benito Juárez, en Toluca, desde OpenStreetMap.",
    },
    i: {
      titulo: "La física calcula el choque.",
      cuerpo:
        "Frenado, contacto, deformación y hasta dónde llega cada quien. Nada de esto es una animación hecha a mano.",
      tiempo: "t",
      velocidad: "Velocidad de A",
      recalcula: "Cámbiala: el solver lo vuelve a calcular en tu dispositivo.",
      resultado: (dvA: string, dvB: string, reposo: string) =>
        `Cambio de velocidad en el choque (ΔV): A ${dvA} km/h, B ${dvB} km/h. A queda a ${reposo} m del impacto.`,
      calculando: "Recalculando…",
    },
    s: {
      titulo: "Míralo desde cualquier lugar.",
      cuerpo:
        "Cámara libre, la vista de cada conductor y otra hipótesis encima, en la misma escena.",
      fantasma: (kmh: string) => `En gris claro: la hipótesis de A a ${kmh} km/h.`,
      visor: "Abrir esta escena en el visor",
    },
    pruebas: {
      titulo: "Medido, no supuesto.",
      e1: "Extracción del relato (F1, test congelado)",
      e3: "Error de ΔV contra la caja negra del auto",
      e3Nota: "Aquí WinSMASH se equivoca menos que Croquis.",
      e5: "Deformación lateral contra autos reales, error por punto",
      croquis: "Croquis",
      fuente: "Ver la evaluación",
      foto: "Foto de la prueba real",
      render: "Abolladura de Croquis",
      comparar:
        "Desliza para comparar la foto de una prueba de choque real con la abolladura que calcula Croquis",
      fotoFuente: (prueba: string) =>
        `Foto: NHTSA, prueba ${prueba}. Croquis: la misma prueba, con el daño del visor.`,
    },
    noes: {
      titulo: "Lo que Croquis no es.",
      peritaje: "No es un peritaje.",
      culpas: "No decide culpas.",
      lesiones: "No estima lesiones.",
      cuerpo: "Es una reconstrucción ilustrativa, y lo dice en cada imagen.",
    },
    cierre: {
      titulo: "Ahora cuéntalo tú.",
    },
  },
  {
    lema: "Tell what happened. Watch it happen.",
    cuenta: "Tell what happened",
    ejemplo: "See an example",
    riel: "Chapters",
    sigue: "Keep scrolling",
    capitulos: {
      apertura: "Opening",
      problema: "The problem",
      c: "Tell",
      r: "Recognize",
      o: "Order",
      q: "What's missing?",
      u: "Place",
      i: "Impact",
      s: "Simulate",
      pruebas: "The proof",
      noes: "What it is not",
      cierre: "Close",
    },
    problema: {
      cifra: (anio: number) =>
        `road traffic incidents in urban and suburban areas were recorded by INEGI in ${anio}.`,
      fuente: "ATUS, INEGI",
      mano: "Today a crash is explained like this: with a hand drawing on a police report.",
      manoAlt:
        "Hand-drawn sketch: two crossing streets, two rectangles with the letters A and B, and arrows.",
    },
    c: {
      titulo: "You tell it in your own words.",
      cuerpo: "The way you would tell someone. Personal data is removed on your device.",
      traduccion: "Translation (Croquis reads the original, in Mexican Spanish):",
    },
    r: {
      titulo: "Every fact comes from a sentence.",
      cuerpo:
        "The orange underline shows where each fact came from. What you did not say is marked as assumed.",
    },
    o: {
      titulo: "Before, the impact, after.",
      antes: "before",
      impacto: "impact",
      despues: "after",
    },
    q: {
      titulo: "One single question.",
      cuerpo: "The one that changes the result the most. If you don't know, you leave it blank.",
    },
    u: {
      titulo: "You arrange it on the sketch.",
      cuerpo:
        "On the real street: Venustiano Carranza and Benito Juárez, in Toluca, from OpenStreetMap.",
    },
    i: {
      titulo: "Physics computes the crash.",
      cuerpo:
        "Braking, contact, deformation and how far everyone ends up. None of this is a hand-made animation.",
      tiempo: "t",
      velocidad: "Speed of A",
      recalcula: "Change it: the solver computes it again on your device.",
      resultado: (dvA: string, dvB: string, reposo: string) =>
        `Change of velocity in the crash (ΔV): A ${dvA} km/h, B ${dvB} km/h. A ends up ${reposo} m from the impact.`,
      calculando: "Recomputing…",
    },
    s: {
      titulo: "See it from anywhere.",
      cuerpo: "Free camera, each driver's view and another hypothesis on top, in the same scene.",
      fantasma: (kmh: string) => `In light gray: the hypothesis of A at ${kmh} km/h.`,
      visor: "Open this scene in the viewer",
    },
    pruebas: {
      titulo: "Measured, not assumed.",
      e1: "Narrative extraction (F1, frozen test)",
      e3: "ΔV error against the car's black box",
      e3Nota: "Here WinSMASH errs less than Croquis.",
      e5: "Side deformation against real cars, error per point",
      croquis: "Croquis",
      fuente: "See the evaluation",
      foto: "Photo of the real test",
      render: "Croquis dent",
      comparar: "Slide to compare the photo of a real crash test with the dent Croquis computes",
      fotoFuente: (prueba: string) =>
        `Photo: NHTSA, test ${prueba}. Croquis: the same test, with the viewer's damage.`,
    },
    noes: {
      titulo: "What Croquis is not.",
      peritaje: "It is not a forensic report.",
      culpas: "It does not assign blame.",
      lesiones: "It does not estimate injuries.",
      cuerpo: "It is an illustrative reconstruction, and it says so on every image.",
    },
    cierre: {
      titulo: "Now you tell it.",
    },
  },
);
