import { describe, expect, it } from "vitest";
import { camaraDano, camaraUnity, camarasDelCaso } from "./camaras";

describe("las cámaras del 3D (René, 2026-11-16, A6)", () => {
  it("«Detrás de» sigue al vehículo con la cámara «cerca» de Unity, no la cinematográfica", () => {
    expect(camaraUnity("detras-veh-a")).toBe("cerca:veh-a:180:8:2.6");
    expect(camaraUnity("conductor-veh-b")).toBe("conductor:veh-b");
    expect(camaraUnity("persona:per-peaton")).toBe("persona:per-peaton");
    expect(camaraUnity("acera")).toBe("acera");
    expect(camaraUnity(null)).toBe("cinematica");
  });

  it("el daño mira la cara golpeada, abierto 60°, a 32° de elevación", () => {
    // Frente: 60° a la derecha del frente; 5.5 m como mínimo.
    expect(camaraDano("veh-a", "frontal", 3)).toBe("cerca:veh-a:60:4.66:2.91");
    // Costado izquierdo: −90 + 60 = −30°.
    expect(camaraDano("veh-b", "lateral_izquierdo", 5)).toMatch(/^cerca:veh-b:-30:/);
  });

  it("un caso tiene las generales, tres por vehículo y una por persona que no va dentro", () => {
    const c = camarasDelCaso(
      [
        { resId: "veh-a", nombre: "A · Jetta", letra: "A", cara: "frontal" },
        { resId: "veh-b", nombre: "B · Camaro", letra: "B", cara: "lateral_derecho" },
        { resId: "veh-c", nombre: "C · Ranger", letra: "C", largoM: 5.3 },
      ],
      [
        { id: "per-a1", rol: "conductor" },
        { id: "per-peaton", rol: "peaton" },
      ],
    );
    expect(c.filter((x) => x.grupo === "general").map((x) => x.modo)).toEqual([
      "orbita",
      "cenital",
      "cinematica",
      "acera",
    ]);
    expect(c.filter((x) => x.grupo === "vehiculo")).toHaveLength(9);
    // Un sedán conserva 8 m atrás y 2.6 m arriba; detrás de una camioneta, la cámara se aleja y
    // sube (antes quedaba pegada a su techo; ronda 2, A6).
    expect(c.find((x) => x.nombre === "Detrás de A · Jetta")?.modo).toBe("cerca:veh-a:180:8:2.6");
    expect(c.find((x) => x.nombre === "Detrás de C · Ranger")?.modo).toBe(
      "cerca:veh-c:180:9.42:3.39",
    );
    expect(c.find((x) => x.nombre === "El daño de B, en el impacto")?.alImpacto).toBe(true);
    // El conductor va dentro de su vehículo: no lleva cámara de persona; el peatón sí.
    expect(c.filter((x) => x.grupo === "persona")).toEqual([
      { modo: "persona:per-peaton", nombre: "Peatón", grupo: "persona", grupoNombre: "Personas" },
    ]);
    // Sin ids internos en los nombres.
    for (const x of c) expect(x.nombre).not.toMatch(/veh-|per-|V\d/);
  });
});
