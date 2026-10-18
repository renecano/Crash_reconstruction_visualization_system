import { describe, expect, it } from "vitest";
import { TRIANGULAR_SHAPES } from "./crash3";
import { Body2D } from "./models";
import { crushShapeAndWidth } from "./reconstruct";

describe("forma y ancho por cara y zona del CDC (ADR 0033, igual que Python)", () => {
  const body = new Body2D(1500, 2500, 4.5, 1.8);
  it.each([
    ["F", "D", "uniforme", 1.0],
    ["F", "L", "izquierda", 0.4],
    ["B", "Z", "derecha", 0.66],
    ["F", "C", "uniforme", 0.89],
    ["L", "D", "centro", 0.62],
    ["R", "P", "centro", 0.52],
    ["L", "Z", "uniforme", 0.37],
    ["R", "B", "uniforme", 0.21],
    ["L", "F", "izquierda", 0.4],
    ["L", "Y", "izquierda", 0.66],
    ["F", "P", "centro", 0.4],
    ["L", "C", "centro", 0.4],
  ] as const)("%s %s → %s × %s", (lado, zona, forma, frac) => {
    const [shape, width] = crushShapeAndWidth({ lado, zona_horizontal: zona }, body);
    expect(shape).toEqual(TRIANGULAR_SHAPES[forma]);
    expect(width).toBeCloseTo(frac * (lado === "F" || lado === "B" ? 1.8 : 4.5), 12);
  });
});
