import { describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "@croquis/extraction/server";
import type { BuscarKmCarretera, BuscarReferencia } from "@/lib/buscadores-lugar";
import { type LugarDeps, MemoryLugarCache } from "./lugar";
import { buscarLugarNarrado } from "./lugar-narrado";

/** La red sin nada: Nominatim y Overpass responden vacío. */
const sinNada: LugarDeps = {
  fetcher: (async (input: RequestInfo | URL) =>
    new Response(String(input).includes("interpreter") ? '{"elements":[]}' : "[]", {
      status: 200,
    })) as typeof fetch,
  cache: new MemoryLugarCache(),
  limiter: new MemoryRateLimiter(1000),
  pausa: async () => undefined,
};

const noAplica = (como: "km" | "referencia") =>
  (async () => ({
    encontrado: false,
    como,
    aplica: false,
    explicacion: `La narración no trae ${como}.`,
  })) as unknown as BuscarKmCarretera & BuscarReferencia;

const kmEnContrado: BuscarKmCarretera = async () => ({
  encontrado: true,
  punto: { lat: 30.6, lon: -106.5 },
  como: "km",
  seguridad: "media",
  que: "km 120 de la carretera federal 45",
  explicacion: "El km 120, interpolado sobre la MEX-45 cerca de Villa Ahumada.",
});

describe("el lugar narrado, con los buscadores en orden (#388)", () => {
  it("sin cruce, gana el primero que encuentra: el km", async () => {
    const r = await buscarLugarNarrado(
      {
        narracion: "El hecho ocurrió en la carretera federal 45, km 120, cerca de Villa Ahumada.",
        municipio: "Ahumada",
        estado: "Chihuahua",
      },
      "prueba",
      sinNada,
      { km: kmEnContrado, referencia: noAplica("referencia") },
    );
    expect(r.resultado).toMatchObject({ encontrado: true, como: "km", seguridad: "media" });
    expect(r.intentos.map((x) => x.como)).toEqual(["cruce"]);
  });

  it("si nadie encuentra, lo dice y no da ningún punto", async () => {
    const r = await buscarLugarNarrado(
      {
        narracion: "El hecho ocurrió en la calle Juan Aldama, en San Mateo Atenco.",
        lugar: "calle Juan Aldama",
        municipio: "San Mateo Atenco",
        estado: "Estado de México",
      },
      "prueba",
      sinNada,
      { km: noAplica("km"), referencia: noAplica("referencia") },
    );
    expect(r.resultado.encontrado).toBe(false);
    expect("punto" in r.resultado).toBe(false);
    expect(r.resultado.explicacion).toMatch(/^No encontré el lugar narrado: márcalo tú/);
    expect(r.intentos.map((x) => x.como)).toEqual(["cruce", "km", "referencia", "calle"]);
  });

  it("con un cruce narrado que no aparece, no se propone una de sus calles sola", async () => {
    // La calle sola sí existiría (la red responde con ella a cualquier búsqueda de Nominatim).
    const conCalle: LugarDeps = {
      ...sinNada,
      cache: new MemoryLugarCache(),
      fetcher: (async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes("interpreter")) return new Response('{"elements":[]}', { status: 200 });
        return new Response(
          JSON.stringify([
            {
              display_name: "Avenida Uno, Toluca",
              name: "Avenida Uno",
              lat: "19.29",
              lon: "-99.65",
              boundingbox: ["19.2", "19.4", "-99.8", "-99.5"],
              address: { city: "Toluca", state: "Estado de México" },
              category: "highway",
              addresstype: "road",
            },
          ]),
          { status: 200 },
        );
      }) as typeof fetch,
    };
    const r = await buscarLugarNarrado(
      {
        narracion:
          "El hecho ocurrió en el cruce de la avenida Uno con la avenida Dos, en Toluca, Estado de México.",
        municipio: "Toluca",
        estado: "Estado de México",
      },
      "prueba",
      conCalle,
      { km: noAplica("km"), referencia: noAplica("referencia") },
    );
    expect(r.resultado.encontrado).toBe(false);
    expect(r.intentos.find((x) => x.como === "calle")).toMatchObject({ aplica: false });
  });
});

describe("sin respuesta del mapa, no se pasa al siguiente método (René, 2026-11-28)", () => {
  it("el cruce no se pudo comprobar: se dice y no se prueban el km, la referencia ni la calle", async () => {
    let llamadas = 0;
    const contar = (async () => {
      llamadas++;
      return { encontrado: false, como: "km", aplica: false, explicacion: "" };
    }) as unknown as BuscarKmCarretera & BuscarReferencia;
    const caido: LugarDeps = {
      ...sinNada,
      cache: new MemoryLugarCache(),
      fetcher: (async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes("interpreter")) return new Response("", { status: 502 });
        if (u.includes("q=Toluca"))
          return new Response(
            JSON.stringify([
              {
                display_name: "Toluca, Estado de México",
                name: "Toluca",
                lat: "19.29",
                lon: "-99.65",
                boundingbox: ["19.2", "19.4", "-99.8", "-99.5"],
                address: { city: "Toluca", state: "Estado de México" },
                addresstype: "city",
              },
            ]),
            { status: 200 },
          );
        return new Response("[]", { status: 200 });
      }) as typeof fetch,
    };
    const r = await buscarLugarNarrado(
      {
        narracion:
          "El hecho ocurrió en el cruce de la avenida Uno con la avenida Dos, en Toluca, Estado de México.",
        municipio: "Toluca",
        estado: "Estado de México",
      },
      "prueba",
      caido,
      { km: contar, referencia: contar },
    );
    expect(r.resultado).toMatchObject({ encontrado: false, sinRespuesta: true });
    expect(r.resultado.explicacion).toMatch(/\(el mapa no respondió\): reintenta\.$/);
    expect(llamadas).toBe(0);
  });
});
