/**
 * Los datos de la página «Reproducción de reportes» (R4, ADR 0067): los casos de la prueba
 * congelada que Croquis reconstruye, con lo que concluyó CESVI, la escena que Croquis leyó de la
 * narración sin conclusiones y la comparación. Los escribe
 * `eval/cesvi_r4_reproduccion.mts medir prueba` en `data/cesvi/r4/pagina.json`; solo se leen en el
 * servidor (al generar las páginas), así que el archivo no llega entero al navegador.
 */
import type {
  ComparacionDictamen,
  Conclusiones,
  Expediente,
  PosicionDescrita,
  resumen,
} from "@croquis/cesvi";
import titulo from "../../../../eval/results/cesvi_r4c_titulo_prueba.json";
import pagina from "../../../../data/cesvi/r4/pagina.json";

export interface CasoReproduccion {
  id: string;
  narracion: string;
  conclusiones: Conclusiones;
  comparacion: ComparacionDictamen;
  expediente: Expediente;
  posiciones: PosicionDescrita[];
}

export interface PaginaReproduccion {
  fuente: string;
  fecha: string;
  dictamenes: number;
  resumen: ReturnType<typeof resumen>;
  lineas_base: { modalidad: string; velocidad_kmh: number };
  casos: CasoReproduccion[];
}

export const PAGINA = pagina as unknown as PaginaReproduccion;

/** Una tasa medida: k de n, y el porcentaje (null sin casos). */
export interface Tasa {
  k: number;
  n: number;
  pct: number | null;
}

/**
 * La segunda medición de la modalidad (ADR 0071): contra la modalidad del título de cada reporte,
 * con la regla congelada antes de mirar la prueba. `eval/cesvi_r4c_titulo.mts medir prueba`.
 */
export interface MedicionTitulo {
  fecha: string;
  /** Las reglas vigentes de Croquis (R4d, ADR 0076). */
  v3: {
    con_modalidad_en_el_titulo: number;
    reportes: number;
    titulo_del_reporte: {
      croquis: Tasa;
      linea_base: Tasa & { modalidad: string };
      fisicas: { croquis: Tasa; linea_base: Tasa & { modalidad: string } };
    };
  };
  frases: Record<string, { frase: string | null; modalidad: string | null }>;
}
export const TITULO = titulo as unknown as MedicionTitulo;

export function casoPorId(id: string): CasoReproduccion | undefined {
  return PAGINA.casos.find((c) => c.id === id);
}

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

/** El nombre corto de un caso: los últimos caracteres de su id del corpus. */
export const nombreCaso = (id: string) => `Reporte ${id.replace("cesvi-", "").slice(0, 6)}`;
