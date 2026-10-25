/**
 * Los datos de la portada de CESVI (comentario de René, 2026-10-24, punto 4). Todo se calcula al
 * compilar, de `eval/results`, de `data/` y del caso de AXA; nada se escribe a mano. Si falta un
 * dato, el build falla.
 *
 * - **671:** los reportes de CESVI del corpus (`eval/results/cesvi_corpus_extraccion.json`).
 * - **205:** los de la prueba reconstruidos a ciegas (`data/cesvi/r4/pagina.json`, de E-R4).
 * - **58.3 % y 37.2 %:** la modalidad de Croquis contra el título del reporte y la de la regla simple
 *   (siempre alcance), en la prueba (`eval/results/cesvi_r4c_titulo_prueba.json`, v3).
 * - **AXA A2010930:** lo que concluyó CESVI (los valores impresos del caso) contra lo que obtiene
 *   Croquis con el mismo método (`reproducir`), la modalidad que infiere Croquis de la narración
 *   (`modalidadInferida`).
 */
import { caso, modalidadInferida, reproducir } from "@croquis/cesvi";
import corpus from "../../../../eval/results/cesvi_corpus_extraccion.json";
import { casoAxa } from "./caso-axa";
import { PAGINA, TITULO } from "./reproduccion-dictamenes";

export interface FilaAxa {
  cesvi: number;
  croquis: number;
  /** (Croquis − CESVI) / CESVI, en %. */
  pct: number;
}

export interface DatosPortadaCesvi {
  reportes: number;
  aCiegas: number;
  modalidadPct: number;
  reglaPct: number;
  axa: {
    id: string;
    lugar: string;
    modalidad: { cesvi: string; croquis: string | null };
    restos: FilaAxa;
    deformacion: FilaAxa;
    /** El comienzo de la narración del caso, para el ejemplo de «Narra como siempre». */
    narracion: string;
  };
}

const fila = (cesvi: number, croquis: number): FilaAxa => ({
  cesvi,
  croquis,
  pct: (100 * (croquis - cesvi)) / cesvi,
});

export function datosPortadaCesvi(): DatosPortadaCesvi {
  const c = caso("A2010930");
  const filas = reproducir(c).filas;
  const croquis = (clave: string) => {
    const v = filas.find((f) => f.clave === clave)?.croquis;
    if (typeof v !== "number") throw new Error(`Falta ${clave} en la reproducción de AXA`);
    return v;
  };
  const axa = casoAxa();
  if (!axa.escena) throw new Error("El caso de AXA no trae su escena");
  const modalidad = modalidadInferida(axa.escena.expediente, axa.narracion ?? "").modalidad;
  const v3 = TITULO.v3.titulo_del_reporte;
  if (v3.croquis.pct === null || v3.linea_base.pct === null)
    throw new Error("Falta la medición de la modalidad contra el título");
  return {
    reportes: corpus.dictamenes,
    aCiegas: PAGINA.dictamenes,
    modalidadPct: v3.croquis.pct,
    reglaPct: v3.linea_base.pct,
    axa: {
      id: c.id,
      lugar: c.lugar.municipio ? `${c.lugar.municipio}, ${c.lugar.estado}` : "",
      modalidad: { cesvi: c.modalidad_dictaminada, croquis: modalidad },
      restos: fila(c.calculos.desplazamiento.reporte.v_kmh.valor, croquis("v3_kmh")),
      deformacion: fila(c.calculos.deformacion_B.reporte.ebs_kmh.valor, croquis("ebs_kmh_datos")),
      narracion: (axa.narracion ?? "").split(/(?<=\.)\s/)[0] ?? "",
    },
  };
}
