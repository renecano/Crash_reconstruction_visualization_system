/**
 * Los umbrales y las pruebas de choque que citan los reportes de CESVI (C1). Croquis no fija
 * ninguno: el perito elige uno de estos, con los dictámenes que lo citan, o escribe el suyo, y la
 * comparación la hace `compararConUmbral`.
 */
import datos from "../../../data/cesvi/calculos/referencias.json";

export interface ReferenciaCitada {
  kmh: number;
  texto: string;
  /** Ids de los dictámenes del corpus que la citan. */
  dictamenes: string[];
  valores_impresos_kmh?: number[];
}

const porFrecuencia = (xs: ReferenciaCitada[]) =>
  [...xs].sort((a, b) => b.dictamenes.length - a.dictamenes.length || a.kmh - b.kmh);

/** Umbrales de activación de las bolsas de aire, del más citado al menos citado. */
export function umbralesBolsasDeAire(): ReferenciaCitada[] {
  return porFrecuencia(datos.bolsas_de_aire);
}

/** Pruebas de choque citadas, de la más citada a la menos citada. */
export function pruebasDeChoqueCitadas(): ReferenciaCitada[] {
  return porFrecuencia(datos.pruebas_de_choque);
}
