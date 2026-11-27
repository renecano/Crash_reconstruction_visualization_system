/**
 * Las cifras de la portada, del índice único (`eval/results/cifras.json`; ADR 0138): nada se escribe a
 * mano y ninguna es de un caso (René, 2026-11-24). Si falta una, el build falla.
 */
import indice from "../../../../eval/results/cifras.json";

export interface TasaPublicada {
  k: number;
  n: number;
  pct: number;
}

export interface DatosPortadaCesvi {
  /** Velocidades verdaderas conocidas que cayeron dentro del rango, y lo que se espera. */
  cobertura: TasaPublicada & { esperado_pct: number };
  /** Modalidad acertada contra el título del reporte. */
  modalidad: TasaPublicada;
  /** La regla simple (siempre la modalidad más frecuente), sobre los mismos reportes. */
  regla: TasaPublicada;
  /** Impactos posteriores de una carambola que ocurren en la reconstrucción. */
  carambolas: TasaPublicada;
}

export function datosPortadaCesvi(): DatosPortadaCesvi {
  const c = indice.cifras;
  const tasa = ({ k, n, pct }: TasaPublicada): TasaPublicada => ({ k, n, pct });
  const cobertura = c["cobertura.rango"];
  return {
    cobertura: { ...tasa(cobertura), esperado_pct: cobertura.esperado_pct },
    modalidad: tasa(c["er4.modalidad_titulo"]),
    regla: tasa(c["er4.regla_simple"]),
    carambolas: tasa(c["carambolas.prueba"]),
  };
}
