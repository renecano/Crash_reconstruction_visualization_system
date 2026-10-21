/**
 * English texts. Same keys as `es.ts` (the `Dict` type enforces it). Short sentences, active
 * verbs, sentence case (PLAN §11.1, principle 7).
 */
import type { Dict } from "./index";

export const en: Dict = {
  sitio: {
    nombre: "Croquis",
    saltar: "Skip to content",
    navegacion: "Main navigation",
    menu: "Menu",
    cerrar: "Close",
    inicio: "Croquis home",
    nav: {
      cuenta: "Tell what happened",
      ejemplo: "See an example",
      mide: "How it is measured",
      historia: "Why it exists",
    },
    idioma: "Español",
    idiomaEtiqueta: "Ver en español",
    pie: {
      leyenda:
        "Croquis makes illustrative reconstructions from a narrative. It is not a forensic report, it does not assign blame and it does not estimate injuries.",
      herramientas: "Tools",
      visor: "3D viewer of the scenes",
      croquis: "2D sketch editor",
      medicion: "Measure performance",
      proyecto: "Project",
      codigo: "Code (MIT)",
      fuentes: "Data and attributions",
      osm: "Streets: © OpenStreetMap contributors (ODbL)",
      datos: "Crash data: NHTSA and INEGI (ATUS)",
      fuente: "Typefaces: Geist and Geist Mono; logotype with Anybody (SIL OFL 1.1)",
    },
  },
  leyenda: {
    texto: "Illustrative reconstruction generated from a narrative. It is not a forensic report.",
  },
  paginas: {
    relato: {
      titulo: "Your narrative",
      intro:
        "Write it the way you would tell someone. Personal data is removed on your device before the text leaves it.",
    },
    croquis: {
      titulo: "2D sketch",
      intro:
        "The example scenes, ready to correct. The drawing and the scene are the same thing: whatever you move here changes there.",
    },
    visor: {
      titulo: "3D viewer",
      intro:
        "The physics solver rebuilds each scene; the viewer only shows what it computed. Time 0 is the impact.",
      cargando: "Loading the viewer…",
    },
    e9: {
      titulo: "E9: usability session",
      intro:
        "For the facilitator (protocol in docs/e9/protocolo.md). While the session is active, this device records only when some events happen, never the narrative text. Nothing leaves this device until you download the file.",
    },
    demo: {
      titulo: "You are…",
      intro:
        "…the one who has to explain what happened. Pick an example narrative and go through what Croquis would do with yours. It works without a server and offline.",
      propio: "Tell your own",
    },
  },
  meta: {
    inicio: {
      titulo: "Croquis — tell what happened, watch it happen",
      descripcion:
        "Describe a road crash in your own words and Croquis rebuilds it in 3D with real physics. It is an illustrative reconstruction, not a forensic report.",
    },
    cuenta: {
      titulo: "Tell what happened — Croquis",
      descripcion:
        "Write what happened, answer what is missing, arrange the sketch and watch the 3D reconstruction.",
    },
    relato: {
      titulo: "Narrative — Croquis",
      descripcion:
        "Write the narrative: personal data is removed on your device and every fact keeps its quote.",
    },
    croquis: {
      titulo: "2D sketch — Croquis",
      descripcion: "Sketch editor synced with the scene: drag vehicles, people and marks.",
    },
    visor: {
      titulo: "3D viewer — Croquis",
      descripcion: "Scenes rebuilt by the Croquis solver, in 3D in the browser.",
    },
    demo: {
      titulo: "You are… — Croquis demo",
      descripcion:
        "Pick a narrative, see what the AI understood field by field, answer what is missing and watch the 3D reconstruction. No server.",
    },
    historia: {
      titulo: "Why Croquis exists",
      descripcion: "The story behind Croquis and what each letter of its name does.",
    },
    recorrido: {
      titulo: "How it is measured — Croquis",
      descripcion:
        "Croquis evaluations with their numbers, their sources and where it falls short.",
    },
    e9: {
      titulo: "E9: usability session — Croquis",
      descripcion: "Page for the person running the Croquis usability sessions (E9).",
    },
    medicion: {
      titulo: "Measure performance — Croquis",
      descripcion: "Measure the viewer's frames per second on this device, with the E6 method.",
    },
  },
};
