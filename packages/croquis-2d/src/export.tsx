/**
 * Croquis 2D exportable (F9, PLAN §7.7 y §7.9): un SVG autónomo tipo parte de tránsito, con la
 * marca de reconstrucción ilustrativa, la semilla y el hash de entradas (PLAN §10). Es la base del
 * SVG, del PNG y del PDF del croquis, y de la figura del informe.
 */
import type { EscenaSpec, TablaClases } from "@croquis/scene-schema";
import { renderToStaticMarkup } from "react-dom/server";
import { Croquis } from "./Croquis";

export interface CroquisSvgOptions {
  clases?: TablaClases;
  /** Píxeles por metro (10 por omisión, como el editor). */
  scale?: number;
  /** Dibujar también las posiciones finales (fantasmas). */
  showFinal?: boolean;
  /** Leyenda, atribución y «semilla» en el idioma del documento (como en el editor). */
  textos?: { leyenda?: string; atribucion?: string; semilla?: string };
}

export interface CroquisSvg {
  /** Documento SVG completo (con declaración XML). */
  markup: string;
  width: number;
  height: number;
}

const SIZE = /<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/;

export function croquisSvg(spec: EscenaSpec, opts: CroquisSvgOptions = {}): CroquisSvg {
  const body = renderToStaticMarkup(
    <Croquis
      spec={spec}
      clases={opts.clases}
      scale={opts.scale ?? 10}
      showFinal={opts.showFinal ?? true}
      textos={opts.textos}
      readOnly
      standalone
    />,
  );
  const size = SIZE.exec(body);
  if (!size) throw new Error("El croquis no tiene tamaño");
  return {
    markup: `<?xml version="1.0" encoding="UTF-8"?>\n${body}`,
    width: Number(size[1]),
    height: Number(size[2]),
  };
}
