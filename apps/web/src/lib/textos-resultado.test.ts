import { loadResultado } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { campoIncierto } from "./textos-resultado";

describe("datos inciertos en palabras", () => {
  it("cada ruta que emite el solver se dice con quién, qué y su unidad", async () => {
    const r = await loadResultado("lateral_interseccion");
    const c = (ruta: string, min: number, max: number, nota = "rango declarado") =>
      campoIncierto({ ruta, distribucion: "uniforme", min, max, nota }, r);
    expect(c("vehiculos.0.velocidad_previa", 35, 55)).toBe(
      `Vehículo ${r.vehiculos[0]!.rol}: velocidad previa, entre 35 y 55 km/h (rango declarado)`,
    );
    expect(c("vehiculos.1.masa", 1650, 2100, "rango de la clase")).toBe(
      `Vehículo ${r.vehiculos[1]!.rol}: masa, entre 1,650 y 2,100 kg (rango de la clase)`,
    );
    expect(c("vehiculos.0.frenado.distancia_antes_impacto", 8, 12.5)).toBe(
      `Vehículo ${r.vehiculos[0]!.rol}: distancia de frenado antes del impacto, entre 8.0 y 12.5 m (rango declarado)`,
    );
    expect(c("lugar.friccion", 0.55, 0.8, "tabla de fricción (fricke)")).toBe(
      "Pavimento: fricción llanta–pavimento, entre 0.55 y 0.80 (tabla de fricción (fricke))",
    );
    expect(c("parametros.friccion_moto_caida", 0.3, 0.6, "peck")).toMatch(
      /^Parámetro: arrastre de la moto caída, entre 0\.30 y 0\.60/,
    );
  });

  it("todas las rutas de las escenas canónicas quedan en palabras (sin rutas internas)", async () => {
    for (const n of [
      "alcance",
      "lateral_interseccion",
      "motociclista",
      "nocturno_lluvia",
    ] as const) {
      const r = await loadResultado(n);
      for (const campo of r.incertidumbre?.campos ?? []) {
        expect(campoIncierto(campo, r)).not.toMatch(/vehiculos\.|lugar\.|parametros\./);
      }
    }
  });
});
