/**
 * Exportaciones del visor (F9, PLAN §7.9): la API que el visor entrega a la página y los ayudantes
 * que convierten un cuadro en un PNG con la marca de reconstrucción ilustrativa (PLAN §10).
 */
import { legendLines, legendString, type LegendInfo } from "@croquis/scene-schema";
import type { VehicleCredit } from "../vehicle-models";
import { drawLegendBand } from "./legend-band";
import { addPngText } from "./png";

export interface CaptureOptions {
  /** Instante a dibujar (s); por omisión, el actual. */
  t?: number;
  /** Tamaño del cuadro en píxeles; por omisión, el del lienzo. */
  width?: number;
  height?: number;
}

/** Lo que el visor permite exportar (`SceneViewer` lo entrega con `onExport`). */
export interface ViewerExportApi {
  /** Dibuja el instante pedido y devuelve una copia del cuadro (sin la marca). */
  captureFrame(opts?: CaptureOptions): HTMLCanvasElement;
  /**
   * Dibuja una secuencia de instantes a un tamaño fijo (video). Cambia el tamaño del lienzo una sola
   * vez y lo restaura al final, igual que el reloj. `onFrame` recibe el lienzo recién dibujado: debe
   * copiarlo antes de su primer `await` (después el navegador puede presentarlo y borrarlo). Se
   * detiene si `signal` se aborta.
   */
  captureSequence(
    times: readonly number[],
    size: { width: number; height: number },
    onFrame: (canvas: HTMLCanvasElement, index: number) => Promise<void> | void,
    signal?: AbortSignal,
  ): Promise<void>;
  /** Escena glTF (`.glb`) con su animación y la leyenda. */
  exportGlb(legend: LegendInfo): Promise<ArrayBuffer>;
  /** La atribución de los vehículos de Sketchfab que se ven (R10, CC-BY): vacía si no hay. */
  readonly vehicleCredits: readonly VehicleCredit[];
  /** Intervalo de la reconstrucción y paso del solver (para video y cuadros). */
  readonly tStart: number;
  readonly tEnd: number;
}

/** Copia del cuadro con la franja de la leyenda dibujada encima. */
export function withLegend(frame: HTMLCanvasElement, legend: LegendInfo): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = frame.width;
  out.height = frame.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("No hay contexto 2D para componer el cuadro");
  ctx.drawImage(frame, 0, 0);
  drawLegendBand(ctx, out.width, out.height, legendLines(legend));
  return out;
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo codificar la imagen"))),
      type,
    );
  });
}

/** PNG del cuadro con la marca dibujada y la leyenda como texto del archivo. */
export async function framePng(
  frame: HTMLCanvasElement,
  legend: LegendInfo,
): Promise<Uint8Array<ArrayBuffer>> {
  const blob = await toBlob(withLegend(frame, legend), "image/png");
  const png = new Uint8Array(await blob.arrayBuffer());
  return addPngText(png, {
    Description: legendString(legend),
    Software: "Croquis",
  });
}
