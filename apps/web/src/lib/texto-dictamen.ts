/**
 * El texto de un dictamen que sube el perito (R5, ADR 0068), sacado en el navegador: el archivo no
 * sale del equipo; solo el texto va a la lectura. Un PDF con texto se lee con pdf.js (el worker se
 * publica en `public/pdfjs/`, `scripts/pdfjs-worker.mjs`); Markdown y texto se leen tal cual. Un PDF
 * escaneado (solo imágenes) no trae texto y se dice.
 */

export interface TextoDictamen {
  texto: string;
  /** Páginas del PDF; null en Markdown o texto. */
  paginas: number | null;
}

const esPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** Une los fragmentos de texto de una página de pdf.js: un salto donde pdf.js marca fin de línea. */
export function unirFragmentos(items: readonly { str?: string; hasEOL?: boolean }[]): string {
  let out = "";
  for (const it of items) {
    if (typeof it.str !== "string") continue;
    out += it.str;
    if (it.hasEOL) out += "\n";
  }
  return out.replace(/[ \t]+\n/g, "\n").trim();
}

async function textoDePdf(datos: ArrayBuffer): Promise<TextoDictamen> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/worker-${pdfjs.version}.mjs`;
  const tarea = pdfjs.getDocument({ data: new Uint8Array(datos) });
  const doc = await tarea.promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const contenido = await (await doc.getPage(i)).getTextContent();
    paginas.push(unirFragmentos(contenido.items as { str?: string; hasEOL?: boolean }[]));
  }
  await tarea.destroy();
  return { texto: paginas.join("\n\n").trim(), paginas: doc.numPages };
}

/** El texto del archivo: PDF con pdf.js; Markdown o texto, tal cual. */
export async function textoDeArchivo(f: File): Promise<TextoDictamen> {
  if (esPdf(f)) return textoDePdf(await f.arrayBuffer());
  return { texto: (await f.text()).trim(), paginas: null };
}
