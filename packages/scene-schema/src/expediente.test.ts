import { describe, expect, it } from "vitest";
import { checkExpediente, expedienteErrors } from "./index";

const minimo = {
  caso: { modalidades: ["alcance"] },
  vehiculos: [{ id: "V1" }, { id: "V2" }],
};

describe("expediente de CESVI suelto (contrato v2)", () => {
  it("un expediente mínimo valida y no tiene problemas", () => {
    expect(expedienteErrors(minimo)).toEqual([]);
    expect(checkExpediente(minimo as Parameters<typeof checkExpediente>[0])).toEqual([]);
  });

  it("las rutas de error son relativas al expediente", () => {
    expect(expedienteErrors({ ...minimo, vehiculos: [{ id: "v1" }] })).toEqual([
      '/vehiculos/0/id: must match pattern "^[A-Z][A-Z0-9]{0,3}$"',
    ]);
    expect(expedienteErrors({ vehiculos: [] })).toEqual(["/: must have required property 'caso'"]);
  });
});
