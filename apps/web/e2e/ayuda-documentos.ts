/** Ayudas de las e2e para leer lo que dicen el PDF y el Word del dictamen. */
import { inflateRawSync } from "node:zlib";

/** El texto de un PDF, con los renglones unidos por un espacio. */
export async function textoDelPdf(bytes: Buffer): Promise<string> {
  // Se importa aquí: al importar la prueba no se cargan módulos nativos.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
    .promise;
  let t = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const c = await (await doc.getPage(p)).getTextContent();
    t += ` ${c.items.map((i) => ("str" in i ? i.str : "")).join(" ")}`;
  }
  return t.replace(/\s+/g, " ");
}

/** Un archivo de un zip (un .docx lo es), sin dependencias: directorio central e `inflate`. */
function archivoDelZip(zip: Buffer, nombre: string): Buffer {
  const fin = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0) throw new Error("No es un zip");
  let p = zip.readUInt32LE(fin + 16);
  for (let k = zip.readUInt16LE(fin + 10); k > 0; k--) {
    const metodo = zip.readUInt16LE(p + 10);
    const comprimido = zip.readUInt32LE(p + 20);
    const largoNombre = zip.readUInt16LE(p + 28);
    const largoExtra = zip.readUInt16LE(p + 30);
    const largoComentario = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    if (zip.subarray(p + 46, p + 46 + largoNombre).toString("utf8") === nombre) {
      const datos = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const cuerpo = zip.subarray(datos, datos + comprimido);
      return metodo === 0 ? cuerpo : inflateRawSync(cuerpo);
    }
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  throw new Error(`El zip no trae ${nombre}`);
}

/** El texto de un Word (.docx): sus párrafos, separados por un espacio. */
export function textoDelWord(bytes: Buffer): string {
  const xml = archivoDelZip(bytes, "word/document.xml").toString("utf8");
  return xml
    .split(/<\/w:p>/)
    .map((parrafo) =>
      [...parrafo.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""),
    )
    .join(" ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** Para comparar un texto con el de un archivo sin depender de dónde corta los renglones. */
export const sinEspacios = (t: string) => t.replace(/\s+/g, "");
