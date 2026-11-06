/**
 * El catálogo de movimiento del rediseño «Laboratorio» (prompt §6) y dónde va un tooltip (§9). Lo
 * que se puede probar sin navegador vive aquí; las piezas, en `components/cesvi/movimiento.tsx`.
 */

/** La curva de las entradas (`rise`, `line`). */
export const CURVA = [0.2, 0.8, 0.2, 1] as const;

/** La curva de las cifras que cuentan (`count`): 1 − (1 − p)⁴. */
export const curvaCuenta = (p: number): number => 1 - (1 - Math.max(0, Math.min(1, p))) ** 4;

/**
 * Lo que se lee a la fracción `p` de la cuenta. Al terminar es exactamente el valor final, con los
 * decimales con los que se muestra: nunca queda un número que no sea el del cálculo.
 */
export function textoContado(final: number, decimales: number, p: number): string {
  if (p >= 1) return final.toFixed(decimales);
  return (final * curvaCuenta(p)).toFixed(decimales);
}

export interface CajaTooltip {
  left: number;
  top: number;
  /** Abajo del objeto, si arriba no cabe. */
  abajo: boolean;
}

/** La separación del objeto (§9: 8 px arriba). */
export const SEPARACION_TOOLTIP = 8;
const MARGEN = 8;

/** El tooltip va centrado arriba del objeto; si no cabe, abajo, y siempre dentro de la ventana. */
export function posicionTooltip(
  objeto: { left: number; top: number; width: number; height: number },
  tip: { width: number; height: number },
  ventana: { width: number; height: number },
): CajaTooltip {
  const centrado = objeto.left + objeto.width / 2 - tip.width / 2;
  const left = Math.max(MARGEN, Math.min(centrado, ventana.width - tip.width - MARGEN));
  const arriba = objeto.top - SEPARACION_TOOLTIP - tip.height;
  if (arriba >= MARGEN) return { left, top: arriba, abajo: false };
  const debajo = objeto.top + objeto.height + SEPARACION_TOOLTIP;
  return { left, top: Math.min(debajo, ventana.height - tip.height - MARGEN), abajo: true };
}
