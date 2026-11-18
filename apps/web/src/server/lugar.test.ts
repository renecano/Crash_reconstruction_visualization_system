import { MemoryRateLimiter } from "@croquis/extraction/server";
import { describe, expect, it } from "vitest";
import {
  buscarLugar,
  type LugarDeps,
  LugarError,
  MemoryLugarCache,
  PHOTON_URL,
  coloniaDe,
  estadoDe,
  primeraCalle,
  segundaCalle,
  USER_AGENT,
  zonaDelTexto,
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
const IZTAPALAPA = {
  display_name: "Iztapalapa, Ciudad de México, México",
  lat: "19.35",
  lon: "-99.05",
  boundingbox: ["19.28", "19.40", "-99.13", "-98.95"],
  address: { borough: "Iztapalapa", state: "Ciudad de México" },
};
const SLP = {
  display_name: "San Luis Potosí, San Luis Potosí, México",
  lat: "22.15",
  lon: "-100.98",
  boundingbox: ["21.1", "24.5", "-102.3", "-98.3"],
  address: { city: "San Luis Potosí", state: "San Luis Potosí" },
};
const SOLEDAD = {
  display_name: "Soledad de Graciano Sánchez, San Luis Potosí, México",
  lat: "22.18",
  lon: "-100.94",
  boundingbox: ["22.10", "22.30", "-100.99", "-100.80"],
  address: { city: "Soledad de Graciano Sánchez", state: "San Luis Potosí" },
};
const carranza = (lat: string, lon: string, city: string, state: string) => ({
  display_name: `Avenida Venustiano Carranza, ${city}, ${state}`,
  lat,
  lon,
  address: { road: "Avenida Venustiano Carranza", city, state },
});
const CARRANZA_SLP = carranza("22.152", "-100.99", "San Luis Potosí", "San Luis Potosí");
const CARRANZA_SLP_2 = carranza("22.110", "-100.88", "Villa de Pozos", "San Luis Potosí");
const CARRANZA_CDMX = carranza("19.43", "-99.13", "Cuauhtémoc", "Ciudad de México");

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

  it("si la descripción completa no aparece, busca la calle dentro del municipio (B5)", async () => {
    const { deps, pedidos } = falso((u) => {
      const q = u.searchParams.get("q");
      if (q === "Iztapalapa, Ciudad de México") return { status: 200, body: [IZTAPALAPA] };
      if (q === "Calle Azucena, Iztapalapa, Ciudad de México")
        return {
          status: 200,
          body: [
            {
              display_name: "Calle Azucena, Lomas San Lorenzo, Iztapalapa, Ciudad de México",
              lat: "19.35",
              lon: "-99.07",
              address: {
                road: "Calle Azucena",
                suburb: "Lomas San Lorenzo",
                borough: "Iztapalapa",
                state: "Ciudad de México",
              },
            },
          ],
        };
      return { status: 200, body: [] };
    });
    const r = await buscarLugar(
      {
        q: "Calle Azucena esquina con Av. Reforma, colonia Lomas San Lorenzo",
        municipio: "Iztapalapa",
        estado: "Ciudad de México",
      },
      "c2",
      deps,
    );
    expect(r.resultados).toEqual([
      {
        nombre: "Calle Azucena, Lomas San Lorenzo",
        lat: 19.35,
        lon: -99.07,
        municipio: "Iztapalapa",
        estado: "Ciudad de México",
      },
    ]);
    expect(r.aviso).toContain("«Calle Azucena»");
    // Cada búsqueda de la calle, dentro de la caja de Iztapalapa: nunca en todo México.
    const deCalle = pedidos.filter(
      (p) => p.url.searchParams.get("q") !== "Iztapalapa, Ciudad de México",
    );
    expect(deCalle.length).toBeGreaterThan(0);
    for (const p of deCalle) {
      expect(p.url.searchParams.get("bounded")).toBe("1");
      expect(p.url.searchParams.get("viewbox")).toBe("-99.13,19.40,-98.95,19.28");
    }
  });

  it("sin la zona del caso, toma el municipio y el estado del texto (San Luis Potosí, no la CDMX)", async () => {
    const { deps, pedidos } = falso((u) => {
      const q = u.searchParams.get("q");
      if (q === "San Luis Potosí, San Luis Potosí") return { status: 200, body: [SLP] };
      if (
        q === "Av. Venustiano Carranza 500, San Luis Potosí, San Luis Potosí" &&
        u.searchParams.get("bounded") === "1"
      )
        return { status: 200, body: [CARRANZA_SLP] };
      // Sin acotar, la misma calle de la CDMX: no debe pedirse.
      if (q?.startsWith("Av. Venustiano Carranza")) return { status: 200, body: [CARRANZA_CDMX] };
      return { status: 200, body: [] };
    });
    const r = await buscarLugar(
      { q: "Av. Venustiano Carranza 500, San Luis Potosí, San Luis Potosí" },
      "c6",
      deps,
    );
    expect(r.resultados[0]).toMatchObject({
      estado: "San Luis Potosí",
      municipio: "San Luis Potosí",
    });
    expect(r.resultados.some((x) => x.estado === "Ciudad de México")).toBe(false);
    expect(
      pedidos
        .filter((p) => p.url.searchParams.get("q")?.startsWith("Av. Venustiano"))
        .every((p) => p.url.searchParams.get("bounded") === "1"),
    ).toBe(true);
  });

  it("si en el municipio no aparece, da opciones del estado y lo dice", async () => {
    const { deps } = falso((u) => {
      const q = u.searchParams.get("q");
      if (q === "Soledad, San Luis Potosí") return { status: 200, body: [SOLEDAD] };
      if (u.searchParams.get("state") === "San Luis Potosí") return { status: 200, body: [SLP] };
      // La calle aparece solo en la caja del estado.
      if (
        q?.startsWith("Av. Venustiano Carranza 500") &&
        u.searchParams.get("viewbox")?.startsWith("-102.3")
      )
        return { status: 200, body: [CARRANZA_SLP, CARRANZA_SLP_2] };
      return { status: 200, body: [] };
    });
    const r = await buscarLugar(
      { q: "Av. Venustiano Carranza 500", municipio: "Soledad", estado: "San Luis Potosí" },
      "c7",
      deps,
    );
    expect(r.resultados).toHaveLength(2);
    expect(r.resultados.every((x) => x.estado === "San Luis Potosí")).toBe(true);
    expect(r.aviso).toContain("No apareció en Soledad");
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
    expect(r.resultados[0]).toEqual({
      nombre: "Paseo Tollocan",
      lat: 19.28,
      lon: -99.66,
      municipio: "Toluca",
    });
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

  it("lo que el texto dice de la zona, las calles y la colonia (B5)", () => {
    expect(zonaDelTexto("Av. Carranza 500, San Luis Potosí, San Luis Potosí")).toEqual({
      municipio: "San Luis Potosí",
      estado: "San Luis Potosí",
      resto: "Av. Carranza 500",
    });
    expect(zonaDelTexto("Avenida la Turba esquina con Calle Medusa, Tlahuac, México DF")).toEqual({
      municipio: "Tlahuac",
      estado: "Ciudad de México",
      resto: "Avenida la Turba esquina con Calle Medusa",
    });
    // Sin estado en el texto, no hay zona.
    expect(zonaDelTexto("Paseo Tollocan, Toluca")).toEqual({ resto: "Paseo Tollocan, Toluca" });
    // Lo de antes del estado no es municipio si es una colonia.
    expect(zonaDelTexto("Calle Uno, colonia Centro, Sinaloa")).toEqual({
      estado: "Sinaloa",
      resto: "Calle Uno, colonia Centro",
    });
    expect(estadoDe("D.F.")).toBe("Ciudad de México");
    expect(estadoDe("Estado de México")).toBe("Estado de México");
    expect(estadoDe("Baja California Norte")).toBe("Baja California");
    expect(estadoDe("Michoacán de Ocampo")).toBe("Michoacán");
    expect(estadoDe("Toluca")).toBeNull();
    expect(segundaCalle("Calle Azucena esquina con Av. Reforma, col. Lomas")).toBe("Av. Reforma");
    expect(segundaCalle("calles Niños Héroes y Agustín Yáñez, Colonia La Moderna")).toBe(
      "Agustín Yáñez",
    );
    expect(coloniaDe("calles Niños Héroes y Agustín Yáñez, Colonia La Moderna")).toBe(
      "Colonia La Moderna",
    );
    expect(coloniaDe("Paseo de los Leones, Residencial Puerta de Hierro")).toBe(
      "Residencial Puerta de Hierro",
    );
  });
});
