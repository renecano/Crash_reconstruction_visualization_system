import { describe, expect, it } from "vitest";
import { avisoVelocidadRazonable, UMBRAL_PEATON, umbralDeClase } from "./velocidad-razonable";

/** Aviso, no bloqueo, cuando la cifra pasa de lo razonable para su tipo (René, 2026-11-25). */
describe("la velocidad razonable por tipo de vehículo", () => {
  it("una bicicleta a 42 km/h avisa, con el umbral y su fuente", () => {
    const a = avisoVelocidadRazonable("V2", umbralDeClase("bicicleta"), 42);
    expect(a).toMatch(/V2 \(bicicleta\): la cifra \(42 km\/h\) pasa de lo razonable/);
    expect(a).toMatch(/más de 40 km\/h/);
    expect(a).toMatch(/12 a 20 km\/h/);
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
