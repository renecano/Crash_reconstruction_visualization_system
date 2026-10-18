import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addPngText, crc32, pngSize, readPngText } from "./png";

/** PNG válido de 2×1 (RGBA), armado a mano: IHDR, IDAT sin compresión real (zlib stored), IEND. */
function tinyPng(): Uint8Array {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const chunk = (type: string, data: number[]) => {
    const body = [...type].map((c) => c.charCodeAt(0)).concat(data);
    const crc = crc32(Uint8Array.from(body));
    const len = data.length;
    return [
      (len >>> 24) & 255,
      (len >>> 16) & 255,
      (len >>> 8) & 255,
      len & 255,
      ...body,
      (crc >>> 24) & 255,
      (crc >>> 16) & 255,
      (crc >>> 8) & 255,
      crc & 255,
    ];
  };
  const ihdr = [0, 0, 0, 2, 0, 0, 0, 1, 8, 6, 0, 0, 0];
  const idat = [120, 1, 1, 9, 0, 246, 255, 0, 255, 0, 0, 255, 0, 255, 0, 255, 16, 252, 3, 253];
  return Uint8Array.from([
    ...sig,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", idat),
    ...chunk("IEND", []),
  ]);
}

describe("metadatos de texto en PNG", () => {
  it("CRC-32 conocido", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
  });

  it("agrega la leyenda en UTF-8 y se lee de vuelta, con el tamaño intacto", () => {
    const png = tinyPng();
    const text =
      "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje. — semilla 7";
    const out = addPngText(png, { Description: text, Software: "Croquis" });
    expect(readPngText(out)).toEqual({ Description: text, Software: "Croquis" });
    expect(pngSize(out)).toEqual({ width: 2, height: 1 });
    // IHDR sigue primero y el resto del archivo no cambia.
    expect(Array.from(out.subarray(out.length - png.length + 33))).toEqual(
      Array.from(png.subarray(33)),
    );
  });

  it("cualquier texto Unicode sobrevive", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 200 }), (s) => {
        const text = s.replaceAll("\u0000", "");
        return readPngText(addPngText(tinyPng(), { Comment: text })).Comment === text;
      }),
      { numRuns: 300, seed: 20261017 },
    );
  });

  it("detecta un chunk alterado y rechaza archivos que no son PNG", () => {
    const out = addPngText(tinyPng(), { Comment: "hola" });
    const bad = out.slice();
    bad[45] = bad[45]! ^ 0xff; // dentro del texto del iTXt
    expect(() => readPngText(bad)).toThrow(/CRC/);
    expect(() => addPngText(new Uint8Array(20), { a: "b" })).toThrow(/PNG/);
    expect(() => addPngText(tinyPng(), { "": "x" })).toThrow(/clave/);
  });
});
