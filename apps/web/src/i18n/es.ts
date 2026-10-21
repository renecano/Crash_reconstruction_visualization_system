/**
 * Textos en español de México (idioma por omisión). Frases cortas, verbos activos y mayúscula
 * solo al inicio (PLAN §11.1, principio 7). `en.ts` debe tener las mismas claves.
 */
export const es = {
  sitio: {
    nombre: "Croquis",
    saltar: "Saltar al contenido",
    navegacion: "Navegación principal",
    menu: "Menú",
    cerrar: "Cerrar",
    inicio: "Inicio de Croquis",
    nav: {
      cuenta: "Cuenta qué pasó",
      ejemplo: "Ver un ejemplo",
      mide: "Cómo se mide",
      historia: "Por qué existe",
    },
    idioma: "English",
    idiomaEtiqueta: "Ver en inglés",
    pie: {
      leyenda:
        "Croquis hace reconstrucciones ilustrativas a partir de un relato. No es un peritaje, no decide culpas y no estima lesiones.",
      herramientas: "Herramientas",
      visor: "Visor 3D de las escenas",
      croquis: "Editor del croquis 2D",
      medicion: "Medir el rendimiento",
      proyecto: "Proyecto",
      codigo: "Código (MIT)",
      fuentes: "Datos y atribuciones",
      osm: "Calles: © colaboradores de OpenStreetMap (ODbL)",
      datos: "Datos de choques: NHTSA e INEGI (ATUS)",
      fuente: "Tipografía: Geist y Geist Mono; logotipo con Anybody (SIL OFL 1.1)",
    },
  },
  leyenda: {
    texto: "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje.",
  },
  paginas: {
    relato: {
      titulo: "Tu relato",
      intro:
        "Escríbelo como se lo contarías a alguien. Los datos personales se quitan en tu dispositivo antes de que el texto salga.",
    },
    croquis: {
      titulo: "Croquis 2D",
      intro:
        "Las escenas de ejemplo, listas para corregir. El dibujo y la escena son lo mismo: lo que muevas aquí cambia allá.",
    },
    visor: {
      titulo: "Visor 3D",
      intro:
        "Cada escena la reconstruye el solver físico; el visor solo muestra lo que calculó. El tiempo 0 es el impacto.",
      cargando: "Cargando el visor…",
    },
    e9: {
      titulo: "E9: sesión de usabilidad",
      intro:
        "Para quien facilita (protocolo en docs/e9/protocolo.md). Mientras la sesión está activa, este dispositivo anota solo el momento de algunos eventos, nunca el texto del relato. Nada sale de aquí hasta que descargas el archivo.",
    },
    demo: {
      titulo: "Tú eres…",
      intro:
        "…quien tiene que explicar qué pasó. Elige un relato de ejemplo y recorre lo que haría Croquis con el tuyo. Funciona sin servidor y sin conexión.",
      propio: "Contar uno propio",
    },
  },
  meta: {
    inicio: {
      titulo: "Croquis — cuenta lo que pasó, míralo pasar",
      descripcion:
        "Cuenta un percance vial con tus palabras y Croquis lo reconstruye en 3D con física real. Es una reconstrucción ilustrativa, no un peritaje.",
    },
    cuenta: {
      titulo: "Cuenta qué pasó — Croquis",
      descripcion:
        "Escribe lo que pasó, contesta lo que falta, acomoda el croquis y mira la reconstrucción en 3D.",
    },
    relato: {
      titulo: "Relato — Croquis",
      descripcion:
        "Escribe el relato: los datos personales se quitan en tu dispositivo y cada dato queda con su cita.",
    },
    croquis: {
      titulo: "Croquis 2D — Croquis",
      descripcion:
        "Editor del croquis sincronizado con la escena: arrastra vehículos, personas y marcas.",
    },
    visor: {
      titulo: "Visor 3D — Croquis",
      descripcion: "Las escenas reconstruidas por el solver de Croquis, en 3D en el navegador.",
    },
    demo: {
      titulo: "Tú eres… — demo de Croquis",
      descripcion:
        "Elige un relato, mira qué entendió la IA campo por campo, contesta lo que falta y ve la reconstrucción en 3D. Sin servidor.",
    },
    historia: {
      titulo: "Por qué existe Croquis",
      descripcion: "La historia detrás de Croquis y lo que hace cada letra de su nombre.",
    },
    recorrido: {
      titulo: "Cómo se mide — Croquis",
      descripcion: "Las evaluaciones de Croquis con sus números, sus fuentes y dónde pierde.",
    },
    e9: {
      titulo: "E9: sesión de usabilidad — Croquis",
      descripcion: "Página de quien facilita las sesiones de usabilidad de Croquis (E9).",
    },
    medicion: {
      titulo: "Medir el rendimiento — Croquis",
      descripcion: "Mide los cuadros por segundo del visor en este equipo, con el método de E6.",
    },
  },
};
