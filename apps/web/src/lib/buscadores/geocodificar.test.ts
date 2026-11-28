import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RedLugar } from "../buscadores-lugar";
import { deDondeSalio, geocodificar, olvidarGeocodificaciones } from "./geocodificar";

// La llave de Esri de la app, sin copiarla: en la prueba, una de mentira.
vi.mock("../visor-unity/piso", () => ({ LLAVE_ESRI: "llave-de-prueba" }));

const portales = [
  { lat: "19.3699", lon: "-99.14158", name: "Portales", category: "railway", type: "station" },
];
const esriPortales = {
  candidates: [
    {
      address: "Portales, Ciudad de México",
      location: { x: -99.1416, y: 19.37 },
      attributes: { Type: "Metro Station", PlaceName: "Portales" },
    },
  ],
};

/** Una red que anota lo que se pidió y responde según el servicio. */
function red(nominatim: () => Response, esri: () => Response) {
  const pedidos: { url: string; ua?: string }[] = [];
  const pausas: number[] = [];
  const r: RedLugar = {
    fetch: (async (url: string, init?: RequestInit) => {
      pedidos.push({
        url,
        ua: (init?.headers as Record<string, string> | undefined)?.["User-Agent"],
      });
      return url.includes("nominatim") ? nominatim() : esri();
    }) as typeof fetch,
    pausa: async (ms) => {
      pausas.push(ms);
    },
  };
  return { r, pedidos, pausas };
}

beforeEach(() => olvidarGeocodificaciones());

describe("geocodificar (política de Nominatim y respaldo de Esri)", () => {
  it("Nominatim con el User-Agent de Croquis, en caché y sin pasar de una consulta por segundo", async () => {
    const { r, pedidos, pausas } = red(
      () => new Response(JSON.stringify(portales)),
      () => new Response("{}"),
    );
    const a = await geocodificar("Portales, Ciudad de México", r);
    expect(a).toMatchObject({
      fuente: "nominatim",
      resultados: [{ nombre: "Portales", categoria: "railway" }],
    });
    expect(pedidos[0]!.ua).toMatch(/^Croquis\//);
    // La misma consulta otra vez: de la caché, sin otra petición.
    await geocodificar("Portales, Ciudad de México", r);
    expect(pedidos).toHaveLength(1);
    // Otra consulta enseguida: espera para no pasar de una por segundo.
    await geocodificar("Diana Cazadora, Ciudad de México", r);
    expect(pausas.length).toBe(1);
    expect(pausas[0]).toBeGreaterThan(0);
    expect(pausas[0]).toBeLessThanOrEqual(1000);
    expect(deDondeSalio("nominatim")).toBe(" (© OpenStreetMap contributors)");
  });

  it("si Nominatim no responde, Esri; y lo dice", async () => {
    const { r, pedidos } = red(
      () => new Response("", { status: 503 }),
      () => new Response(JSON.stringify(esriPortales)),
    );
    const g = await geocodificar("Portales, Ciudad de México", r);
    expect(g).toMatchObject({
      fuente: "esri",
      resultados: [{ lat: 19.37, lon: -99.1416, nombre: "Portales" }],
    });
    expect(pedidos[1]!.url).toContain("token=llave-de-prueba");
    expect(deDondeSalio(g.fuente)).toBe(" (encontrado con Esri)");
  });

  it("si Nominatim no encuentra, Esri", async () => {
    const { r } = red(
      () => new Response("[]"),
      () => new Response(JSON.stringify(esriPortales)),
    );
    expect((await geocodificar("Portales", r)).fuente).toBe("esri");
  });

  it("si ninguno responde, lanza (el buscador lo explica); nunca un punto inventado", async () => {
    const { r } = red(
      () => new Response("", { status: 503 }),
      () => new Response("", { status: 403 }),
    );
    await expect(geocodificar("Portales", r)).rejects.toThrow("Nominatim respondió 503");
  });
});
