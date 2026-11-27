import { describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "@croquis/extraction/server";
import { RutaError, rutaPorCalles, type RutaDeps } from "./ruta";

const pedida = { desde_lat: 19.29, desde_lon: -99.66, hasta_lat: 19.2925, hasta_lon: -99.6557 };

function deps(respuesta: unknown, status = 200): RutaDeps & { llamadas: string[] } {
  const llamadas: string[] = [];
  const memoria = new Map();
  return {
    llamadas,
    fetcher: (async (url: string) => {
      llamadas.push(url);
      return new Response(JSON.stringify(respuesta), { status });
    }) as unknown as typeof fetch,
    cache: {
      get: async (k) => memoria.get(k) ?? null,
      set: async (k, v) => void memoria.set(k, v),
    },
    limiter: new MemoryRateLimiter(10),
  };
}

describe("la ruta por las calles del trayecto previo", () => {
  it("pide la ruta en auto (lon,lat), la devuelve como [lat, lon] y la guarda", async () => {
    const d = deps({
      code: "Ok",
      routes: [
        {
          distance: 674,
          geometry: {
            coordinates: [
              [-99.6599, 19.29],
              [-99.6558, 19.2925],
            ],
          },
        },
      ],
    });
    const r = await rutaPorCalles(pedida, "a", d);
    expect(d.llamadas[0]).toContain("/driving/-99.66,19.29;-99.6557,19.2925?");
    expect(r.puntos).toEqual([
      [19.29, -99.6599],
      [19.2925, -99.6558],
    ]);
    await rutaPorCalles(pedida, "a", d);
    expect(d.llamadas).toHaveLength(1);
  });

  it("más de 5 km o sin ruta: un error claro, sin ruta inventada", async () => {
    const lejos = deps({
      code: "Ok",
      routes: [
        {
          distance: 9000,
          geometry: {
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
      ],
    });
    await expect(rutaPorCalles(pedida, "a", lejos)).rejects.toThrow(/5 km/);
    await expect(rutaPorCalles(pedida, "a", deps({ code: "NoRoute" }))).rejects.toBeInstanceOf(
      RutaError,
    );
  });
});
