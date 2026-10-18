/**
 * Marca de reconstrucción ilustrativa (PLAN §10) dibujada sobre cuadros y video: una franja abajo
 * con el texto fijo, la semilla, el hash de entradas y, si aplica, la atribución del mapa.
 */

/** Contexto 2D mínimo (CanvasRenderingContext2D u OffscreenCanvasRenderingContext2D). */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | "fillStyle"
  | "font"
  | "textBaseline"
  | "fillRect"
  | "fillText"
  | "measureText"
  | "save"
  | "restore"
>;

/** Parte un renglón en varios para que quepa en `maxWidth`. */
export function wrapLine(ctx: Ctx2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxWidth) {
      out.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out;
}

/** Tamaño de letra de la franja según el alto de la imagen (legible en 720p y en 4K). */
export function legendFontPx(height: number): number {
  return Math.max(12, Math.round(height * 0.022));
}

/**
 * Dibuja la franja con la leyenda en la parte de abajo de una imagen de `width` × `height` y
 * devuelve su alto en píxeles.
 */
export function drawLegendBand(ctx: Ctx2D, width: number, height: number, lines: string[]): number {
  const font = legendFontPx(height);
  const pad = Math.round(font * 0.6);
  const lineH = Math.round(font * 1.3);
  ctx.save();
  ctx.font = `${font}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const wrapped = lines.flatMap((l, i) => {
    // La atribución y los identificadores van un poco más chicos que el texto principal.
    return wrapLine(ctx, l, width - 2 * pad).map((text) => ({ text, small: i > 0 }));
  });
  const bandH = pad * 2 + wrapped.length * lineH;
  ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
  ctx.fillRect(0, height - bandH, width, bandH);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  wrapped.forEach((w, i) => {
    ctx.font = `${w.small ? Math.round(font * 0.82) : font}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(w.text, pad, height - bandH + pad + i * lineH);
  });
  ctx.restore();
  return bandH;
}
