/**
 * Exportación del croquis 2D (F9, PLAN §7.7 y §7.9): SVG, PNG y PDF tipo parte de tránsito, todos
 * con la marca de reconstrucción ilustrativa, la semilla y el hash de entradas (PLAN §10).
 */
import { legendFor, legendString, type EscenaSpec } from "@croquis/scene-schema";
import { addPngText } from "@croquis/viewer";
import { pdfBytes, pdfDefinition } from "./pdf";

async function svgOf(spec: EscenaSpec, scale = 10) {
  const { croquisSvg } = await import("@croquis/croquis-2d/export");
  return croquisSvg(spec, { scale });
}

export async function croquisSvgFile(spec: EscenaSpec): Promise<string> {
  return (await svgOf(spec)).markup;
}

/** PNG del croquis a 2× (20 píxeles por metro), con la marca también como texto del archivo. */
export async function croquisPng(spec: EscenaSpec): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await svgOf(spec, 20);
  const url = URL.createObjectURL(new Blob([svg.markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(svg.width);
    canvas.height = Math.round(svg.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No hay contexto 2D para el croquis");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("No se pudo codificar"))),
        "image/png",
      ),
    );
    return addPngText(new Uint8Array(await blob.arrayBuffer()), {
      Description: legendString(legendFor(spec)),
      Software: "Croquis",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** PDF del croquis: título, el croquis vectorial a todo lo ancho y la marca en cada página. */
export async function croquisPdf(spec: EscenaSpec): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await svgOf(spec);
  const landscape = svg.width >= svg.height;
  // A4 en puntos menos márgenes; el pie con la marca ocupa la parte de abajo.
  const box: [number, number] = landscape ? [762, 430] : [515, 640];
  const titulo = spec.meta.titulo ?? spec.meta.id;
  return pdfBytes(
    pdfDefinition({
      title: `Croquis — ${titulo}`,
      legend: legendFor(spec),
      pageOrientation: landscape ? "landscape" : "portrait",
      content: [
        { text: "Croquis de la escena", fontSize: 16, bold: true },
        { text: titulo, fontSize: 11, margin: [0, 2, 0, 10] },
        { svg: svg.markup, fit: box },
        {
          text: "Vista cenital con el norte y una barra de escala; las posiciones finales se dibujan translúcidas.",
          fontSize: 8,
          color: "#555555",
          margin: [0, 6, 0, 0],
        },
      ],
    }),
  );
}
