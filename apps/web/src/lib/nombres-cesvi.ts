/**
 * Cómo se dicen las modalidades y las caras del contrato en las páginas de /cesvi. Va aparte de
 * `reproduccion-dictamenes` para que el código del navegador no cargue los 205 casos (ADR 0079).
 */
/** Cómo se dicen las modalidades del contrato en la página. */
export const MODALIDAD: Record<string, string> = {
  alcance: "Alcance",
  lateral: "Lateral",
  frontal: "Frontal",
  crucero: "Crucero",
  reversa: "Reversa",
  volcadura: "Volcadura",
  salida_de_camino: "Salida del camino",
  objeto_fijo: "Contra objeto fijo",
  atropellamiento: "Atropellamiento",
  carambola: "Carambola",
  otra: "Otra",
};

export const CARA: Record<string, string> = {
  frontal: "frente",
  posterior: "parte posterior",
  lateral_izquierdo: "costado izquierdo",
  lateral_derecho: "costado derecho",
  techo: "techo",
  inferior: "parte inferior",
};
