/**
 * R5 (docs/cesvi/PLAN-CESVI.md, ADR 0068): un dictamen importado, armado en el navegador con las dos
 * lecturas de Claude (`leerDictamenImportado` en el servidor):
 * - el expediente completo (la lectura de C0), con cada cita revisada contra el texto y fuente
 *   «dictamen_importado»;
 * - la narración sin conclusiones y lo que concluyó CESVI (la lectura de R0), redactadas.
 * Con el expediente, el perito coloca a los vehículos y reconstruye como en «Caso nuevo»; con las
 * conclusiones, compara lo que reconstruyó con lo que concluyó el dictamen.
 */
import { expedienteDeSalida, type SalidaCorpus } from "./corpus";
import { escenaDeConversion, type EscenaNarrada } from "./escena-narracion";
import { narracionDeSalida, type Narracion, type SalidaNarracion } from "./narracion";

/**
 * La escena del dictamen (expediente, posiciones descritas, citas revisadas, problemas y lo que más
 * cambia la reconstrucción, como en «Caso nuevo») y la narración con lo que concluyó CESVI.
 */
export interface DictamenImportado extends EscenaNarrada {
  narracion: Narracion;
}

/** Arma el dictamen importado y revisa cada cita contra el texto que subió el perito. */
export function importarDictamen(
  texto: string,
  corpus: SalidaCorpus,
  narracion: SalidaNarracion,
  archivo = "dictamen",
): DictamenImportado {
  return {
    ...escenaDeConversion(expedienteDeSalida(corpus, texto, "dictamen_importado")),
    narracion: narracionDeSalida(narracion, { id: "importado", archivo, texto }),
  };
}

/** Lo que más le sirve al perito saber del texto antes de mandarlo a leer. */
export function resumenTexto(texto: string): { caracteres: number; palabras: number } {
  const t = texto.trim();
  return { caracteres: t.length, palabras: t ? t.split(/\s+/).length : 0 };
}
export type { SalidaNarracion } from "./narracion";
