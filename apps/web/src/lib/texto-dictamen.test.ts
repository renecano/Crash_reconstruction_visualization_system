import { describe, expect, it } from "vitest";
import { textoDeArchivo, unirFragmentos } from "./texto-dictamen";

describe("texto del dictamen que sube el perito (R5)", () => {
  it("une los fragmentos de pdf.js con un salto donde termina la línea", () => {
    expect(
      unirFragmentos([
        { str: "DICTAMEN TÉCNICO", hasEOL: true },
        { str: "El vehículo A " },
        { str: "presenta daños.", hasEOL: true },
        { hasEOL: true },
        { str: "Fin. " },
      ]),
    ).toBe("DICTAMEN TÉCNICO\nEl vehículo A presenta daños.\nFin.");
  });

  it("Markdown y texto se leen tal cual", async () => {
    const f = new File(["  # Dictamen\nEl vehículo A.  "], "dictamen.md", {
      type: "text/markdown",
    });
    expect(await textoDeArchivo(f)).toEqual({ texto: "# Dictamen\nEl vehículo A.", paginas: null });
  });
});
