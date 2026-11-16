/**
 * El límite de cobertura del rango, con la cifra del índice único (René, 2026-11-15; auditoría C5).
 *
 * En casos fabricados con velocidad verdadera conocida (`eval/t3_cobertura.mts`), el p10–p90 de la
 * inversión contiene la verdad menos veces de las que su nombre promete (cerca de 80 %). Eso se le
 * dice al perito, en los límites de la reconstrucción y en el dictamen, con la cifra medida. La cifra
 * sale de `eval/results/cifras.json` (`cobertura.rango`), que `eval/cifras.mjs` regenera desde
 * `eval/results`: al llegar una corrida con más casos, el texto cambia solo.
 */
import indice from "../../../eval/results/cifras.json";
import { tasa, type Tasa } from "./formato";

interface CifraDeCobertura extends Tasa {
  pct: number;
  esperado_pct: number;
  casos_por_escena: number;
  fuente: string;
}

/** La cobertura medida del p10–p90, del índice de cifras publicadas. */
export function coberturaDelRango(): CifraDeCobertura {
  return (indice.cifras as unknown as Record<string, CifraDeCobertura>)["cobertura.rango"]!;
}

/** El límite, en una oración para el perito. */
export function limiteDeCobertura(): string {
  const c = coberturaDelRango();
  return `El rango de velocidad no es una garantía: en casos fabricados con velocidad verdadera conocida, el rango (donde cae el 80 % de las simulaciones) la contuvo ${tasa(c)} de las veces, y lo esperado es cerca de ${c.esperado_pct} %. La velocidad real puede quedar fuera del rango más seguido de lo que dice su nombre.`;
}
