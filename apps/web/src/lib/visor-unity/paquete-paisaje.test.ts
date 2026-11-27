import { caso3dErrors, loadFixture, type EscenaSpec, type Resultado } from "@croquis/scene-schema";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { paqueteDelCaso } from "./paquete";

/** El paisaje del lugar llega al paquete caso-3d (contrato #335) y el paquete sigue siendo válido. */
describe("el paisaje en el paquete caso-3d", () => {
  const spec = loadFixture("alcance") as unknown as EscenaSpec;
  const res = reconstructionToDict(reconstruct(spec as never, {})) as unknown as Resultado;

  it("con «arido», el entorno lo lleva", () => {
    const p = paqueteDelCaso(spec, res, null, "arido");
    expect(p.escenario?.entorno.paisaje).toBe("arido");
    expect(caso3dErrors(p)).toEqual([]);
  });

  it("sin cobertura del mapa, no va (Unity dibuja el templado de siempre)", () => {
    const p = paqueteDelCaso(spec, res, null, null);
    expect(p.escenario?.entorno).not.toHaveProperty("paisaje");
  });
});
