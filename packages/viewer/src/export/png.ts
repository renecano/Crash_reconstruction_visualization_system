/**
 * Metadatos de texto en PNG (F9, exportación de cuadros): la leyenda va dibujada en la imagen y,
 * además, como texto del archivo (chunk `iTXt`, UTF-8: la leyenda lleva caracteres fuera de
 * Latin-1). Sin dependencias: CRC-32 y manejo de chunks según la especificación PNG (W3C, 3.ª ed.).
 */

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function isPng(bytes: Uint8Array): boolean {
  return SIGNATURE.every((b, i) => bytes[i] === b);
}

interface Chunk {
  type: string;
  start: number;
  end: number;
  data: Uint8Array;
}

function* chunks(bytes: Uint8Array): Generator<Chunk, void, undefined> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  while (off + 12 <= bytes.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(...bytes.subarray(off + 4, off + 8));
    const end = off + 12 + len;
    yield { type, start: off, end, data: bytes.subarray(off + 8, off + 8 + len) };
    off = end;
  }
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** Chunk iTXt sin compresión: palabra clave (Latin-1), sin idioma, texto en UTF-8. */
function iTXt(keyword: string, text: string): Uint8Array {
  const enc = new TextEncoder();
  const key = Uint8Array.from(keyword, (c) => c.charCodeAt(0));
  const body = enc.encode(text);
  // keyword \0 compresión(0) método(0) idioma "" \0 palabra traducida "" \0 texto
  const data = new Uint8Array(key.length + 5 + body.length);
  data.set(key, 0);
  data.set(body, key.length + 5);
  return makeChunk("iTXt", data);
}

/** Agrega textos (palabra clave → texto) al PNG, justo después de IHDR. */
export function addPngText(
  png: Uint8Array,
  entries: Record<string, string>,
): Uint8Array<ArrayBuffer> {
  if (!isPng(png)) throw new Error("No es un PNG");
  const first = chunks(png).next().value;
  if (!first || first.type !== "IHDR") throw new Error("PNG sin IHDR al inicio");
  const extra = Object.entries(entries).map(([k, v]) => {
    if (!/^[\x20-\x7e]{1,79}$/.test(k)) throw new Error(`Palabra clave inválida: ${k}`);
    return iTXt(k, v);
  });
  const size = png.length + extra.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(size);
  out.set(png.subarray(0, first.end), 0);
  let off = first.end;
  for (const c of extra) {
    out.set(c, off);
    off += c.length;
  }
  out.set(png.subarray(first.end), off);
  return out;
}

/** Textos iTXt y tEXt del PNG (para verificar exportaciones). Comprueba el CRC de cada uno. */
export function readPngText(png: Uint8Array): Record<string, string> {
  if (!isPng(png)) throw new Error("No es un PNG");
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  for (const c of chunks(png)) {
    if (c.type !== "iTXt" && c.type !== "tEXt") continue;
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    if (view.getUint32(c.end - 4) !== crc32(png, c.start + 4, c.end - 4)) {
      throw new Error(`CRC inválido en ${c.type}`);
    }
    const nul = c.data.indexOf(0);
    const key = String.fromCharCode(...c.data.subarray(0, nul));
    if (c.type === "tEXt") {
      out[key] = String.fromCharCode(...c.data.subarray(nul + 1));
      continue;
    }
    if (c.data[nul + 1] !== 0) continue; // comprimido: no lo usamos
    let p = nul + 3;
    p = c.data.indexOf(0, p) + 1; // idioma
    p = c.data.indexOf(0, p) + 1; // palabra traducida
    out[key] = dec.decode(c.data.subarray(p));
  }
  return out;
}

/** Ancho y alto del PNG (IHDR). */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const ihdr = chunks(png).next().value;
  if (!ihdr || ihdr.type !== "IHDR") throw new Error("PNG sin IHDR");
  const v = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, 8);
  return { width: v.getUint32(0), height: v.getUint32(4) };
}
