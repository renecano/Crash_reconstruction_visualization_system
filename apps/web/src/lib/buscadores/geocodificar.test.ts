// @vitest-environment node
// La geocodificación de Esri corre solo en el servidor (sin `window`): la prueba, en Node.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RedLugar } from "../buscadores-lugar";
import {
  deDondeSalio,
  fijarCacheNominatim,
  geocodificar,
  olvidarGeocodificaciones,
} from "./geocodificar";

// La clave de geocodificación de Esri es del servidor (`ESRI_GEOCODE_API_KEY`): en la prueba, una de
// mentira; la de verdad nunca aparece en pruebas ni registros.
const LLAVE = "llave-de-prueba";

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
  const pedidos: { url: string; ua?: string; cuerpo?: string }[] = [];
  const pausas: number[] = [];
  const r: RedLugar = {
    fetch: (async (url: string, init?: RequestInit) => {
      pedidos.push({
        url,
        ua: (init?.headers as Record<string, string> | undefined)?.["User-Agent"],
        ...(init?.body ? { cuerpo: String(init.body) } : {}),
      });
      return url.includes("nominatim") ? nominatim() : esri();
    }) as typeof fetch,
    pausa: async (ms) => {
      pausas.push(ms);
    },
  };
  return { r, pedidos, pausas };
}

beforeEach(() => {
  olvidarGeocodificaciones();
  vi.stubEnv("ESRI_GEOCODE_API_KEY", LLAVE);
});
afterEach(() => vi.unstubAllEnvs());

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
    // La clave va en el cuerpo del POST, nunca en la URL.
    expect(pedidos[1]!.url).not.toContain(LLAVE);
    expect(pedidos[1]!.cuerpo).toContain(`token=${LLAVE}`);
    expect(pedidos[1]!.cuerpo).toContain("forStorage=false");
    expect(deDondeSalio(g.fuente)).toBe(" (encontrado con Esri)");
  });

  it("si Nominatim no encuentra, Esri", async () => {
    const { r } = red(
      () => new Response("[]"),
      () => new Response(JSON.stringify(esriPortales)),
    );
    expect((await geocodificar("Portales", r)).fuente).toBe("esri");
  });

  it("sin la clave del servidor, Esri no está disponible y no se le pide nada", async () => {
    vi.stubEnv("ESRI_GEOCODE_API_KEY", "");
    const { r, pedidos } = red(
      () => new Response("[]"),
      () => new Response(JSON.stringify(esriPortales)),
    );
    expect(await geocodificar("Portales", r)).toEqual({ resultados: [], fuente: null });
    expect(pedidos.some((x) => x.url.includes("arcgis"))).toBe(false);
  });

  it("si Esri responde con error, no rompe nada ni dice la clave", async () => {
    const { r } = red(
      () => new Response("[]"),
      () =>
        new Response(JSON.stringify({ error: { code: 498, message: `Invalid token ${LLAVE}` } })),
    );
    expect(await geocodificar("Portales", r)).toEqual({ resultados: [], fuente: null });
  });

  it("si ninguno responde, lanza (el buscador lo explica); nunca un punto inventado", async () => {
    const { r } = red(
      () => new Response("", { status: 503 }),
      () => new Response("", { status: 403 }),
    );
    await expect(geocodificar("Portales", r)).rejects.toThrow("Nominatim respondió 503");
  });

  it("la caché permanente guarda solo lo de Nominatim; lo de Esri, solo en memoria", async () => {
    const guardados: string[] = [];
    const permanente = new Map<string, unknown>();
    fijarCacheNominatim({
      get: (k) => permanente.get(k) as never,
      set: (k, v) => {
        guardados.push(k);
        permanente.set(k, v);
      },
    });
    let nominatimCae = false;
    const { r, pedidos } = red(
      () =>
        nominatimCae ? new Response("", { status: 503 }) : new Response(JSON.stringify(portales)),
      () => new Response(JSON.stringify(esriPortales)),
    );
    await geocodificar("Portales", r);
    nominatimCae = true;
    const e1 = await geocodificar("Portales, CDMX", r);
    const e2 = await geocodificar("Portales, CDMX", r);
    expect(e1.fuente).toBe("esri");
    expect(e2).toEqual(e1);
    expect(guardados).toHaveLength(1);
    expect(guardados[0]).toContain("nominatim");
    // La segunda vez, Esri salió de la memoria de la sesión: no se volvió a pedir.
    expect(pedidos.filter((p) => !p.url.includes("nominatim"))).toHaveLength(1);
  });
});
