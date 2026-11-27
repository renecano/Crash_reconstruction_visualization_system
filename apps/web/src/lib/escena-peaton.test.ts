import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { especDeExpediente, type Expediente } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { marcarChoque } from "./escena-facil";
import { impactosAColocar } from "./pasos-caso";

/**
 * El camión que da vuelta y atropella a un peatón (René, 2026-11-24): la lectura deja el impacto
 * como «objeto peatón»; al marcar el choque, Croquis coloca al peatón en el punto de contacto para
 * que llegue al solver y al 3D.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
const e0 = (
  JSON.parse(
    readFileSync(resolve(aqui, "../../../../data/cesvi/casos/rene-peaton-vuelta.croquis"), "utf8"),
  ) as { expediente: Expediente }
).expediente;
const P = { lat: 19.29, lon: -99.65 };

describe("el choque contra un peatón", () => {
  const e = marcarChoque(e0, impactosAColocar(e0), 1, P, 90);

  it("coloca al peatón en el punto de contacto, como supuesto, y lo liga al impacto", () => {
    expect(e.personas).toHaveLength(1);
    const p = e.personas![0]!;
    expect(p.rol).toBe("peaton");
    expect(p.fuente).toBe("supuesto");
    expect(p.punto).toEqual(P);
    expect(e.impactos!.find((i) => (i.orden ?? 1) === 1)!.persona).toBe(p.id);
  });

  it("llega a la escena del solver (y de ahí al 3D)", () => {
    const { spec } = especDeExpediente(e, "peaton");
    expect((spec.personas as unknown[] | undefined)?.length).toBe(1);
  });

  it("si el perito vuelve a marcar el choque, el peatón supuesto se mueve con él", () => {
    const Q = { lat: 19.2901, lon: -99.6501 };
    const e2 = marcarChoque(e, impactosAColocar(e), 1, Q, 90);
    expect(e2.personas).toHaveLength(1);
    expect(e2.personas![0]!.punto).toEqual(Q);
  });
});
