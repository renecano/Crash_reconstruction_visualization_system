import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import { especDeExpediente, reconstruirExpediente } from "./reconstruccion";
import { conVelocidadDelPerito } from "./velocidad-narrada";

/**
 * «¿Cómo lo sabes?» (René, 2026-11-27): la velocidad que da el perito, medida por un instrumento
 * (restricción dura) o declarada por el conductor o un testigo (se compara con la física).
 */
const CASO = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../data/cesvi/grabaciones/carambola/carambola-e2e-caso.json"),
    "utf8",
  ),
) as { expediente: Expediente };

describe("la velocidad que da el perito: medida o declarada", () => {
  it("medida por la cámara: entra fija, sin rango, y los límites lo dicen", () => {
    const e = conVelocidadDelPerito(CASO.expediente, "V1", 50, "camara");
    expect(e.vehiculos.find((v) => v.id === "V1")!.velocidad_narrada).toMatchObject({
      kmh: 50,
      como_se_sabe: "medida",
      medio: "camara",
    });
    const base = especDeExpediente(e);
    const sid = Object.keys(base.ids).find((k) => base.ids[k] === "V1")!;
    const vp = (base.spec.vehiculos as Record<string, unknown>[]).find((v) => v.id === sid)!
      .velocidad_previa as Record<string, unknown>;
    expect(vp).toMatchObject({ valor: 50, medida: true });
    expect(vp.a_priori).toBeUndefined();
    const r = reconstruirExpediente(e, "caso-nuevo", { samples: 8, mcSamples: 8 });
    expect(r.velocidades.find((v) => v.vehiculo === "V1")!.previa).toEqual({
      mejor: 50,
      medida: true,
    });
    expect(r.limites.join(" ")).toMatch(/V1: su velocidad previa la midió la cámara \(50 km\/h\)/);
  }, 300_000);

  it("declarada por el conductor (la de omisión): es un supuesto que la física sigue ajustando", () => {
    const e = conVelocidadDelPerito(CASO.expediente, "V1", 50);
    expect(e.vehiculos.find((v) => v.id === "V1")!.velocidad_narrada).toMatchObject({
      como_se_sabe: "declarada",
      medio: "conductor",
    });
    const base = especDeExpediente(e);
    const sid = Object.keys(base.ids).find((k) => base.ids[k] === "V1")!;
    const vp = (base.spec.vehiculos as Record<string, unknown>[]).find((v) => v.id === sid)!
      .velocidad_previa as Record<string, unknown>;
    expect(vp).toMatchObject({ a_priori: true });
    expect(vp.medida).toBeUndefined();
  });
});
