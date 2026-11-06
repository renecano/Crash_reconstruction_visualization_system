import { describe, expect, it } from "vitest";
import { dejarArchivo, tipoDeArchivo, tomarArchivo } from "./archivo-pendiente";

describe("el archivo soltado en la lista de casos", () => {
  it("el .croquis es un caso; lo demás, un reporte", () => {
    expect(tipoDeArchivo("caso.croquis")).toBe("caso");
    expect(tipoDeArchivo("CASO.JSON")).toBe("caso");
    expect(tipoDeArchivo("reporte.pdf")).toBe("reporte");
    expect(tipoDeArchivo("reporte.md")).toBe("reporte");
  });

  it("«Abrir archivo» manda aunque el archivo no traiga extensión", () => {
    const f = new File(["{}"], "copia-sin-extension");
    expect(tipoDeArchivo(f.name)).toBe("reporte");
    expect(dejarArchivo(f, "caso")).toBe("caso");
    expect(tomarArchivo("caso")).toBe(f);
  });

  it("se entrega una sola vez y solo a quien le toca", () => {
    const f = new File(["x"], "reporte.pdf");
    expect(dejarArchivo(f)).toBe("reporte");
    expect(tomarArchivo("caso")).toBeNull();
    expect(tomarArchivo("reporte")).toBe(f);
    expect(tomarArchivo("reporte")).toBeNull();
  });
});
