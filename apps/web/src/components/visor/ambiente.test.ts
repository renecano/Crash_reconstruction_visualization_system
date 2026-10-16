import { describe, expect, it } from "vitest";
import { CLIMAS, describeAmbiente, ILUMINACIONES, parseAmbiente, PISOS } from "./ambiente";

const sp = (q: string) => new URLSearchParams(q);

describe("ambiente forzado desde la URL", () => {
  it("los valores válidos salen del contrato", () => {
    expect(CLIMAS).toContain("granizo");
    expect(ILUMINACIONES).toContain("noche_sin_alumbrado");
    expect(PISOS).toContain("encharcado");
  });

  it("toma lo válido e ignora lo desconocido", () => {
    expect(parseAmbiente(sp("escena=poste"))).toBeNull();
    expect(parseAmbiente(sp("clima=tormenta&piso=hielo&visibilidad=-3"))).toBeNull();
    expect(parseAmbiente(sp("clima=niebla&visibilidad=60&piso=mojado&iluminacion=dia"))).toEqual({
      clima: "niebla",
      visibilidadM: 60,
      estadoSuperficie: "mojado",
      iluminacion: "dia",
    });
  });

  it("el aviso dice qué cambió y que la reconstrucción no cambia", () => {
    const t = describeAmbiente({ clima: "granizo", iluminacion: "noche_sin_alumbrado" });
    expect(t).toContain("granizo");
    expect(t).toContain("noche sin alumbrado");
    expect(t).toContain("La reconstrucción no cambia");
  });
});
