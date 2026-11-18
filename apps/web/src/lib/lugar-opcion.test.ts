import { describe, expect, it } from "vitest";
import { etiquetaOpcion, zonaDeOpcion } from "./lugar-opcion";

describe("una opción de «Buscar el lugar» (B5)", () => {
  it("dice el municipio y el estado, sin repetir", () => {
    const o = { nombre: "Avenida Carranza, Centro", lat: 22.15, lon: -100.98 };
    expect(zonaDeOpcion({ ...o, municipio: "Mazatlán", estado: "Sinaloa" })).toBe(
      "Mazatlán, Sinaloa",
    );
    expect(zonaDeOpcion({ ...o, municipio: "San Luis Potosí", estado: "San Luis Potosí" })).toBe(
      "San Luis Potosí",
    );
    expect(zonaDeOpcion(o)).toBeNull();
    expect(etiquetaOpcion({ ...o, estado: "Sinaloa" })).toBe("Avenida Carranza, Centro · Sinaloa");
    expect(etiquetaOpcion(o)).toBe("Avenida Carranza, Centro");
  });
});
