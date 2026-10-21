/**
 * La discrepancia de la energía del dictamen A2010930 y lo que hay que preguntarle a CESVI. Las
 * cifras de las hipótesis salen de `eval/cesvi_discrepancia.mjs` (ADR 0048); aquí solo se leen.
 */
import resultado from "../../../eval/results/cesvi_discrepancia.json";

export interface Discrepancia {
  energiaReporte: number;
  energiaDatosImpresos: number;
  diferenciaPct: number;
  /** Intervalo de energías si cada C impresa estuviera redondeada (±0.005 m). */
  redondeoC: { minimo: number; maximo: number; contieneAlReporte: boolean };
  /** El dígito mal leído en L, A o B que más se acerca. */
  digitoMasCercano: { parametro: string; impreso: string; leido: string; energia: number };
  /** La variante de la fórmula que más se acerca, y cuánto le falta. */
  varianteMasCercana: number;
  explicacionesExactas: number;
  lectura: string;
}

const r = resultado as unknown as {
  energia_reporte: number;
  energia_datos_impresos: number;
  diferencia_pct: number;
  hipotesis: {
    redondeo_de_C: { minimo: number; maximo: number; contiene_al_reporte: boolean };
    un_digito_en_L_A_o_B: {
      mas_cercanas: { parametro: string; impreso: string; leido: string; energia: number }[];
    };
    variantes_de_formula: { mas_cercanas: { diferencia: number }[] };
  };
  explicaciones_exactas: unknown[];
  lectura: string;
};

export const DISCREPANCIA_A2010930: Discrepancia = {
  energiaReporte: r.energia_reporte,
  energiaDatosImpresos: r.energia_datos_impresos,
  diferenciaPct: r.diferencia_pct,
  redondeoC: {
    minimo: r.hipotesis.redondeo_de_C.minimo,
    maximo: r.hipotesis.redondeo_de_C.maximo,
    contieneAlReporte: r.hipotesis.redondeo_de_C.contiene_al_reporte,
  },
  digitoMasCercano: r.hipotesis.un_digito_en_L_A_o_B.mas_cercanas[0]!,
  varianteMasCercana: Math.abs(r.hipotesis.variantes_de_formula.mas_cercanas[0]!.diferencia),
  explicacionesExactas: r.explicaciones_exactas.length,
  lectura: r.lectura,
};

/** Lo que Croquis necesita saber de CESVI para cerrar las diferencias de este caso. */
export const PREGUNTAS_PARA_CESVI: readonly { tema: string; pregunta: string }[] = [
  {
    tema: "Energía de deformación",
    pregunta:
      "Con la fórmula de 4 medidas y los datos impresos (L, A, B, C1–C4) la energía es 225.454 y no 220.1900228. ¿Nos pueden compartir el PDF original o la hoja de cálculo del dictamen, para ver con qué medidas se calculó?",
  },
  {
    tema: "Unidades de A y B",
    pregunta:
      "El dictamen imprime A y B en N/m y la energía en Julios, pero divide entre la masa en toneladas (1.431083). Eso es consistente con A en kN/m, B en kN/m² y la energía en kJ. ¿Esas son las unidades de sus coeficientes?",
  },
  {
    tema: "Fuente de A y B",
    pregunta:
      "¿De dónde salen A = 55.405 y B = 385.336 para la Tacoma 1997 (tabla de CESVI, prueba propia, categoría de vehículo)?",
  },
  {
    tema: "Redondeo",
    pregunta:
      "La EBS de 17.54209 m/s aparece como 17.5420: ¿sus hojas truncan los decimales en lugar de redondearlos?",
  },
  {
    tema: "Diferencia significativa",
    pregunta:
      "El dictamen dice que 63.15 y 60.27 km/h no difieren de forma significativa. ¿Qué criterio usan sus peritos (porcentaje, km/h, otro)?",
  },
];
