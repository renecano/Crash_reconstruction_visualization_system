import { MemoryRateLimiter } from "@croquis/extraction/server";
import { describe, expect, it } from "vitest";
import {
  buscarLugar,
  type LugarDeps,
  LugarError,
  MemoryLugarCache,
  PHOTON_URL,
  primeraCalle,
  USER_AGENT,
} from "./lugar";

type Respuesta = { status: number; body: unknown } | "sin-red";

/** Un fetch falso: responde según la URL y guarda lo que se pidió. */
function falso(responder: (u: URL) => Respuesta) {
  const pedidos: { url: URL; ua: string | null }[] = [];
  const fetcher = ((input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    pedidos.push({ url, ua: new Headers(init?.headers).get("User-Agent") });
    const r = responder(url);
    if (r === "sin-red") return Promise.reject(new TypeError("fetch failed"));
    return Promise.resolve(
      new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;
  const deps: LugarDeps = {
    fetcher,
    cache: new MemoryLugarCache(),
    limiter: new MemoryRateLimiter(60),
    pausa: () => Promise.resolve(),
  };
  return { deps, pedidos };
}

const AHOME = {
  display_name: "Ahome, Sinaloa, México",
  lat: "25.79",
  lon: "-109.0",
  boundingbox: ["25.4", "26.4", "-109.5", "-108.6"],
};
const TRAMO = { display_name: "MEX 15D, Ahome, Sinaloa", lat: "25.81", lon: "-108.95" };

describe("buscar el lugar del hecho (A1)", () => {
  it("una carretera con km se busca dentro del municipio y lo dice", async () => {
    const { deps, pedidos } = falso((u) => {
      if (u.searchParams.get("q") === "Ahome, Sinaloa") return { status: 200, body: [AHOME] };
      if (u.searchParams.get("q") === "MEX 15D") return { status: 200, body: [TRAMO] };
      return { status: 200, body: [] };
    });
    const r = await buscarLugar(
      { q: "km 47+800 de la carretera federal 15D", municipio: "Ahome", estado: "Sinaloa" },
      "c1",
      deps,
    );
    expect(r.resultados[0]).toMatchObject({ lat: 25.81, lon: -108.95 });
    expect(r.aviso).toContain("MEX 15D dentro de Ahome, Sinaloa");
    expect(r.aviso).toContain("km 47.8");
    const tramo = pedidos.find((p) => p.url.searchParams.get("q") === "MEX 15D")!;
    // La caja del municipio como viewbox (oeste, norte, este, sur) y acotada.
    expect(tramo.url.searchParams.get("viewbox")).toBe("-109.5,26.4,-108.6,25.4");
    expect(tramo.url.searchParams.get("bounded")).toBe("1");
    expect(pedidos.every((p) => p.ua === USER_AGENT)).toBe(true);
  });

  it("si la descripción completa no aparece, busca la primera calle y luego el municipio", async () => {
    const { deps, pedidos } = falso((u) =>
      u.searchParams.get("q") === "Calle Azucena, Iztapalapa, Ciudad de México"
        ? { status: 200, body: [{ display_name: "Calle Azucena", lat: "19.35", lon: "-99.07" }] }
        : { status: 200, body: [] },
    );
    const r = await buscarLugar(
      {
        q: "Calle Azucena esquina con Av. Reforma, colonia Lomas San Lorenzo",
        municipio: "Iztapalapa",
        estado: "Ciudad de México",
      },
      "c2",
      deps,
    );
    expect(r.resultados).toHaveLength(1);
    expect(r.aviso).toContain("«Calle Azucena»");
    expect(pedidos).toHaveLength(2);
  });

  it("si Nominatim no responde, usa Photon", async () => {
    const { deps } = falso((u) =>
      u.href.startsWith(PHOTON_URL)
        ? {
            status: 200,
            body: {
              features: [
                {
                  geometry: { coordinates: [-99.66, 19.28] },
                  properties: { name: "Paseo Tollocan", city: "Toluca" },
                },
              ],
            },
          }
        : { status: 503, body: {} },
    );
    const r = await buscarLugar({ q: "Paseo Tollocan, Toluca" }, "c3", deps);
    expect(r.fuente).toBe("photon");
    expect(r.resultados[0]).toEqual({ nombre: "Paseo Tollocan, Toluca", lat: 19.28, lon: -99.66 });
  });

  it("sin ningún buscador, el error dice qué hacer; lo encontrado sale de la caché", async () => {
    const caido = falso(() => "sin-red");
    await expect(buscarLugar({ q: "Toluca" }, "c4", caido.deps)).rejects.toMatchObject({
      status: 502,
    });
    await expect(buscarLugar({ q: "Toluca" }, "c4", caido.deps)).rejects.toBeInstanceOf(LugarError);

    const bien = falso(() => ({ status: 200, body: [AHOME] }));
    await buscarLugar({ q: "Ahome" }, "c5", bien.deps);
    const segunda = await buscarLugar({ q: "  ahome " }, "c5", bien.deps);
    expect(segunda.cache).toBe("hit");
    expect(bien.pedidos).toHaveLength(1);
  });

  it("la primera calle de una descripción", () => {
    expect(primeraCalle("Calle Azucena esquina con Av. Reforma, col. Lomas")).toBe("Calle Azucena");
    expect(primeraCalle("En el crucero de Paseo Tollocan y Av. Las Torres")).toBe("Paseo Tollocan");
  });
});
