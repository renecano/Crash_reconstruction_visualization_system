import { describe, expect, it } from "vitest";
import {
  type BuscarKmCarretera,
  NO_ENCONTRADO,
  ORDEN_BUSCADORES,
  type RedLugar,
  textoEncontrado,
} from "./buscadores-lugar";

/**
 * Un ejemplo de buscador con la interfaz (René, 2026-11-27, #388), para que Alberto tenga el molde:
 * responde con lo que encuentra en una respuesta grabada y, si la narración no trae lo suyo, dice
 * que no aplica. No es el buscador real.
 */
const kmDeEjemplo: BuscarKmCarretera = async (narracion, zona, red) => {
  const km = /\bkm\.?\s*(\d+)(?:\+(\d{3}))?/i.exec(narracion);
  if (!km)
    return {
      encontrado: false,
      como: "km",
      aplica: false,
      explicacion: "La narración no nombra un kilómetro.",
    };
  const r = await red.fetch(
    `https://ejemplo.invalid/postes?km=${km[1]}&municipio=${zona.municipio ?? ""}`,
  );
  const postes = (await r.json()) as { lat: number; lon: number }[];
  if (!postes.length)
    return {
      encontrado: false,
      como: "km",
      aplica: true,
      explicacion: `No encontré el km ${km[1]} en OpenStreetMap.`,
    };
  return {
    encontrado: true,
    punto: postes[0]!,
    como: "km",
    seguridad: "alta",
    que: `km ${km[1]}`,
    explicacion: `El poste del km ${km[1]} en OpenStreetMap.`,
  };
};

const red = (postes: { lat: number; lon: number }[]): RedLugar => ({
  fetch: (async () => new Response(JSON.stringify(postes), { status: 200 })) as typeof fetch,
});

describe("la interfaz de los buscadores del lugar (#388)", () => {
  it("un buscador responde lo que encontró, cómo y qué tan seguro", async () => {
    const r = await kmDeEjemplo(
      "en el km 23+500 de la MEX-15D",
      { municipio: "Culiacán" },
      red([{ lat: 24.8, lon: -107.4 }]),
    );
    expect(r.encontrado).toBe(true);
    if (r.encontrado)
      expect(textoEncontrado(r)).toBe(
        "Croquis encontró: km 23 · el kilómetro sobre la carretera · seguro",
      );
  });
  it("si no encuentra, lo dice; si la narración no trae lo suyo, no aplica", async () => {
    const sin = await kmDeEjemplo("en el km 23 de la MEX-15D", {}, red([]));
    expect(sin).toMatchObject({ encontrado: false, aplica: true });
    const noAplica = await kmDeEjemplo("en el cruce de Juárez y Morelos", {}, red([]));
    expect(noAplica).toMatchObject({ encontrado: false, aplica: false });
    expect(NO_ENCONTRADO).toBe("No encontré el lugar narrado: márcalo tú");
  });
  it("el orden: cruce, km, referencia, calle", () => {
    expect(ORDEN_BUSCADORES).toEqual(["cruce", "km", "referencia", "calle"]);
  });
});
