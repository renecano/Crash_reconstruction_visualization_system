import { describe, expect, it } from "vitest";
import type { Reconstruccion } from "./reconstruccion";
import {
  avisoSobreElLimite,
  avisoVelocidadRazonable,
  conAvisoDelLimite,
  MARGEN_SOBRE_EL_LIMITE_KMH,
  UMBRAL_PEATON,
  umbralDeClase,
} from "./velocidad-razonable";

/** Aviso, no bloqueo, cuando la cifra pasa de lo razonable para su tipo (René, 2026-11-25). */
describe("la velocidad razonable por tipo de vehículo", () => {
  it("una bicicleta a 42 km/h avisa, con el umbral y su fuente", () => {
    const a = avisoVelocidadRazonable("V2", umbralDeClase("bicicleta"), 42);
    expect(a).toMatch(/V2 \(bicicleta\): la cifra \(42 km\/h\) pasa de lo razonable/);
    expect(a).toMatch(/más de 40 km\/h/);
    expect(a).toMatch(/Yan, Maat y van Wee, 2024/);
    expect(a).toMatch(/la decisión es del perito/);
  });

  it("dentro del umbral no avisa", () => {
    expect(avisoVelocidadRazonable("V2", umbralDeClase("bicicleta"), 25)).toBeNull();
    expect(avisoVelocidadRazonable("V1", umbralDeClase("tractocamion"), 95)).toBeNull();
  });

  it("moto, pesado y peatón tienen su umbral con su fuente; un auto no", () => {
    expect(umbralDeClase("motocicleta")!.kmh).toBe(140);
    expect(umbralDeClase("camion_unitario")!.fuente).toMatch(/art\. 134/);
    expect(umbralDeClase("autobus")!.kmh).toBe(125);
    expect(avisoVelocidadRazonable("P1", UMBRAL_PEATON, 30)).toMatch(/peatón/);
    expect(umbralDeClase("sedan_compacto")).toBeNull();
  });
});

/** Una cifra muy por arriba del límite de su vía (René, 2026-11-26): aviso para autos. */
describe("la cifra contra el límite de la vía", () => {
  const calle = { kmh: 50, fuente: "LGMSV, art. 49 fr. III; Calle Azucena" };

  it("avisa cuando el mejor ajuste pasa el límite por más de 40 km/h, sin juzgar al conductor", () => {
    const a = avisoSobreElLimite("V1", 95, calle)!;
    expect(a).toBe(
      "V1: la cifra (95 km/h) queda más de 40 km/h arriba del límite de esta vía (50 km/h; LGMSV, art. 49 fr. III; Calle Azucena): es inusual; revisa las posiciones finales y las medidas antes de usarla.",
    );
    expect(a).not.toMatch(/exceso|culpa|infracci/i);
    expect(MARGEN_SOBRE_EL_LIMITE_KMH).toBe(40);
  });

  it("no avisa hasta el límite más 40, ni sin límite o sin cifra", () => {
    expect(avisoSobreElLimite("V1", 90, calle)).toBeNull();
    expect(avisoSobreElLimite("V1", 95, null)).toBeNull();
    expect(avisoSobreElLimite("V1", null, calle)).toBeNull();
  });

  it("va en los límites de la reconstrucción, una vez, y las cifras no cambian", () => {
    const r = {
      limites: ["otro límite"],
      velocidades: [
        { vehiculo: "V1", previa: { mejor: 95 } },
        { vehiculo: "V2", previa: { mejor: 20 } },
      ],
    } as unknown as Reconstruccion;
    const con = conAvisoDelLimite(r, { V1: calle, V2: calle });
    expect(con.limites).toHaveLength(2);
    expect(con.limites[1]).toMatch(/^V1: la cifra \(95 km\/h\)/);
    expect(con.velocidades).toBe(r.velocidades);
    expect(conAvisoDelLimite(con, { V1: calle }).limites).toHaveLength(2);
    expect(conAvisoDelLimite(r, {})).toBe(r);
    // Cada vehículo con el límite de su vía: el mismo 95 en una avenida de 80 no avisa.
    expect(
      conAvisoDelLimite(r, { V1: { kmh: 80, fuente: "maxspeed de OpenStreetMap" } }).limites,
    ).toHaveLength(1);
  });
});
