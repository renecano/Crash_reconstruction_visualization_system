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
  it("medida por la cámara: entra fija; si no cabe, la física sin ella y el conflicto", () => {
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
    // En este caso, 50 km/h medidos no caben con las posiciones (la física da unos 33): el perito ve
    // la reconstrucción física sin la medida y el conflicto escrito (René, 2026-11-28).
    const r = reconstruirExpediente(e, "caso-nuevo", { samples: 8, mcSamples: 8 });
    expect(r.noCuadra).toBeFalsy();
    expect(r.medidaIncompatible?.vehiculos).toEqual([{ vehiculo: "V1", kmh: 50 }]);
    expect(r.medidaIncompatible?.texto).toMatch(
      /^Con la velocidad medida de 50 km\/h \(V1\) no cuadra: /,
    );
    expect(r.medidaIncompatible?.texto).toMatch(/revisa la medida o las posiciones/);
    const previa = r.velocidades.find((v) => v.vehiculo === "V1")!.previa!;
    expect(previa.medida).toBeFalsy();
    expect(previa.mejor).toBeLessThan(45);
    expect(r.limites[0]).toBe(r.medidaIncompatible!.texto);
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
