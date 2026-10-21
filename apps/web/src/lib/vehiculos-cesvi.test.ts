import { readFileSync } from "node:fs";
import { join } from "node:path";
import { caso } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { COLOR_VEHICULO, nombresVehiculos } from "./vehiculos-cesvi";

const tokens = JSON.parse(
  readFileSync(join(__dirname, "../../../../assets/brand/tokens.json"), "utf8"),
) as { color: Record<string, { value: string }> };
const color = (n: string) => tokens.color[n]!.value;

/** Contraste WCAG 2 entre dos colores #RRGGBB. */
function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

describe("vehículos del recorrido", () => {
  it("se nombran con su letra y su tipo", () => {
    expect(nombresVehiculos(caso("A2010930"))).toEqual({ A: "A · Silverado", B: "B · Tacoma" });
  });

  it("el PDF (papel blanco) usa los colores del tema claro de la marca", () => {
    expect(COLOR_VEHICULO.A).toBe(color("claro-vehiculo-a"));
    expect(COLOR_VEHICULO.B).toBe(color("claro-vehiculo-b"));
  });
});

describe("contraste del sistema (ADR 0054): 4.5:1 o más", () => {
  const fondos = ["grafito", "grafito-superficie"];
  it.each(["blanco", "gris", "gris-oscuro", "senal", "vehiculo-a", "vehiculo-b"])(
    "%s sobre el fondo y las superficies",
    (texto) => {
      for (const f of fondos) expect(contraste(color(texto), color(f))).toBeGreaterThanOrEqual(4.5);
    },
  );
  it.each(["blanco", "vehiculo-a", "vehiculo-b"])("texto grafito sobre %s", (f) => {
    expect(contraste(color("grafito"), color(f))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("contraste del tema claro (ADR 0057): 4.5:1 o más", () => {
  const fondos = ["claro-fondo", "claro-superficie"];
  it.each([
    "claro-texto",
    "claro-texto-2",
    "claro-texto-3",
    "claro-senal-texto",
    "claro-vehiculo-a",
    "claro-vehiculo-b",
  ])("%s sobre el fondo y las superficies", (texto) => {
    for (const f of fondos) expect(contraste(color(texto), color(f))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["claro-texto", "claro-vehiculo-a", "claro-vehiculo-b"])(
    "texto blanco sobre %s (botón principal y etiquetas de vehículo)",
    (f) => {
      expect(contraste("#FFFFFF", color(f))).toBeGreaterThanOrEqual(4.5);
    },
  );
});
