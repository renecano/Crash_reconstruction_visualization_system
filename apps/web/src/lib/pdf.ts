/**
 * PDF generado en el navegador (F9, PLAN §3 y §7.9) con pdfmake 0.3 (MIT) y la fuente Roboto 3.014
 * que trae (SIL OFL 1.1; registrada en assets/ASSETS.md). Cada página lleva la marca de reconstrucción
 * ilustrativa al pie, y el documento la lleva en sus metadatos (PLAN §10). pdfmake se carga solo al
 * exportar.
 */
import { legendLines, legendString, type LegendInfo } from "@croquis/scene-schema";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";

export interface PdfOptions {
  title: string;
  legend: LegendInfo;
  content: Content;
  pageOrientation?: "portrait" | "landscape";
}

/** Pie de cada página: la marca completa y el número de página. */
export function legendFooter(legend: LegendInfo) {
  const lines = legendLines(legend);
  return (page: number, pages: number): Content => ({
    margin: [40, 6, 40, 0],
    columns: [
      {
        width: "*",
        stack: lines.map((l, i) => ({ text: l, fontSize: i === 0 ? 8 : 7, color: "#333333" })),
      },
      { width: "auto", text: `${page} / ${pages}`, fontSize: 8, color: "#555555" },
    ],
  });
}

export function pdfDefinition(opts: PdfOptions): TDocumentDefinitions {
  const lines = legendLines(opts.legend);
  return {
    pageSize: "A4",
    pageOrientation: opts.pageOrientation ?? "portrait",
    pageMargins: [40, 40, 40, 30 + lines.length * 10],
    info: {
      title: opts.title,
      subject: legendString(opts.legend),
      keywords: "reconstrucción ilustrativa; no es un peritaje",
      creator: "Croquis",
      producer: "Croquis (pdfmake)",
    },
    defaultStyle: { font: "Roboto", fontSize: 10 },
    footer: legendFooter(opts.legend),
    content: opts.content,
  };
}

/** Bytes del PDF. */
export async function pdfBytes(def: TDocumentDefinitions): Promise<Uint8Array<ArrayBuffer>> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  pdfMake.addVirtualFileSystem(fonts);
  const buffer = await pdfMake.createPdf(def).getBuffer();
  return new Uint8Array(buffer);
}
