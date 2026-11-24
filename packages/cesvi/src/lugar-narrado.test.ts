import { describe, expect, it } from "vitest";
import { rumboHacia, separarLugarYSentido } from "./lugar-narrado";

describe("el lugar y el sentido, separados (ronda 4)", () => {
  it("«sobre Tollocan rumbo a Ciudad de México»: el lugar sin el sentido, y el destino aparte", () => {
    const s = separarLugarYSentido("iba sobre Tollocan rumbo a Ciudad de México");
    expect(s.lugar).toBe("Tollocan");
    expect(s.sentido).toMatchObject({ tipo: "destino", destino: "Ciudad de México" });
    const r = separarLugarYSentido(
      "iba por tollocan rumbo a la ciudad de mexico, y me sali de la carretera",
    );
    expect(r.lugar).toBe("tollocan");
    expect(r.sentido?.destino).toBe("ciudad de mexico");
  });

  it("los sentidos cardinales: «de oriente a poniente», «sentido sur-norte», «con dirección al norte»", () => {
    expect(separarLugarYSentido("Av. Las Torres, de oriente a poniente").sentido).toMatchObject({
      tipo: "cardinal",
      rumbo: 270,
    });
    expect(separarLugarYSentido("Periférico en sentido sur-norte").sentido?.rumbo).toBe(0);
    const n = separarLugarYSentido("circulaba por Insurgentes con dirección al norte");
    expect(n).toMatchObject({ lugar: "Insurgentes", sentido: { tipo: "cardinal", rumbo: 0 } });
  });

  it("sin sentido, el lugar queda tal cual; nunca va la frase completa", () => {
    expect(separarLugarYSentido("Paseo Tollocan esquina Isidro Fabela")).toEqual({
      lugar: "Paseo Tollocan esquina Isidro Fabela",
      sentido: null,
    });
    const h = separarLugarYSentido("Calzada al Pacífico hacia Toluca a la altura del km 4");
    expect(h.lugar).not.toContain("hacia");
    expect(h.sentido?.destino).toBe("Toluca");
  });

  it("el rumbo hacia un destino", () => {
    // De Toluca a la Ciudad de México: al oriente (un poco al norte).
    const r = rumboHacia({ lat: 19.29, lon: -99.6 }, { lat: 19.43, lon: -99.13 });
    expect(r).toBeGreaterThan(60);
    expect(r).toBeLessThan(90);
  });
});
