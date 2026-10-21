import { readFileSync } from "node:fs";
import { join } from "node:path";
import { caso } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { COLOR_VEHICULO, nombresVehiculos } from "./vehiculos-cesvi";

describe("vehículos del recorrido", () => {
  it("se nombran con su letra y su tipo", () => {
    expect(nombresVehiculos(caso("A2010930"))).toEqual({ A: "A · Silverado", B: "B · Tacoma" });
  });

  it("el PDF usa los mismos colores que el CSS", () => {
    const css = readFileSync(join(__dirname, "../styles/sistema.css"), "utf8");
    expect(css).toContain(`--vehiculo-a: ${COLOR_VEHICULO.A};`);
    expect(css).toContain(`--vehiculo-b: ${COLOR_VEHICULO.B};`);
  });
});
