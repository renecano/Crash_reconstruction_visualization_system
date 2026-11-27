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
  viasDelCruce,
  zonaDelTexto,
  variantesDeVia,
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
    expect(r.aviso).toContain("km 47+800");
    const tramo = pedidos.find((p) => p.url.searchParams.get("q") === "MEX 15D")!;
    // La caja del municipio como viewbox (oeste, norte, este, sur) y acotada.
    expect(tramo.url.searchParams.get("viewbox")).toBe("-109.5,26.4,-108.6,25.4");
    expect(tramo.url.searchParams.get("bounded")).toBe("1");
    expect(pedidos.every((p) => p.ua === USER_AGENT)).toBe(true);
  });

  it("una carretera por sus poblaciones (reportes de CESVI): la vía entre ellas o, si no, el tramo", async () => {
    const TEAPA = {
      display_name: "Teapa, Tabasco, México",
      lat: "17.55",
      lon: "-92.95",
      boundingbox: ["17.50", "17.60", "-93.00", "-92.90"],
      address: { state: "Tabasco" },
    };
    const PICHUCALCO = {
      display_name: "Pichucalco, Chiapas, México",
      lat: "17.51",
      lon: "-93.12",
      boundingbox: ["17.48", "17.54", "-93.15", "-93.08"],
      address: { state: "Chiapas" },
    };
    const VIA = {
      display_name: "Carretera Teapa-Pichucalco, Tabasco",
      lat: "17.53",
      lon: "-93.05",
      class: "highway",
      type: "primary",
    };
    const conVia = falso((u) => {
      const q = u.searchParams.get("q");
      if (q === "Teapa") return { status: 200, body: [TEAPA] };
      if (q === "Pichucalco") return { status: 200, body: [PICHUCALCO] };
      if (q === "carretera Teapa-Pichucalco") return { status: 200, body: [VIA] };
      return { status: 200, body: [] };
    });
    const r = await buscarLugar(
      { q: "kilómetro 55+80 de la carretera Teapa-Pichucalco" },
      "c1",
      conVia.deps,
    );
    expect(r.resultados[0]).toMatchObject({ lat: 17.53, lon: -93.05 });
    expect(r.aviso).toContain("km 55+080");
    expect(r.aviso).toContain("mueve el mapa por la carretera");
    // Acotada a la caja de las dos poblaciones, con margen.
    const via = conVia.pedidos.find(
      (p) => p.url.searchParams.get("q") === "carretera Teapa-Pichucalco",
    )!;
    expect(via.url.searchParams.get("bounded")).toBe("1");
    expect(via.url.searchParams.get("viewbox")).toBe("-93.2,17.65,-92.85,17.43");
    // Sin la vía en OSM: las poblaciones, como zona (La escena pregunta el punto).
    const sinVia = falso((u) => {
      const q = u.searchParams.get("q");
      if (q === "Teapa") return { status: 200, body: [TEAPA] };
      if (q === "Pichucalco") return { status: 200, body: [PICHUCALCO] };
      return { status: 200, body: [] };
    });
    const z = await buscarLugar(
      { q: "kilómetro 55+80 de la carretera Teapa-Pichucalco" },
      "c1",
      sinVia.deps,
    );
    expect(z.resultados.map((x) => x.precision)).toEqual(["zona", "zona"]);
    expect(z.aviso).toContain("OpenStreetMap no tiene el km 55+080");
  });

  it("una calle sola se busca también sin su tipo: «Blvd. Costera Miguel Alemán» es «Costera Miguel Alemán»", async () => {
    const ACAPULCO = {
      display_name: "Acapulco de Juárez, Guerrero, México",
      name: "Acapulco de Juárez",
      lat: "16.85",
      lon: "-99.88",
      boundingbox: ["16.7", "17.1", "-100.0", "-99.6"],
      address: { state: "Guerrero" },
    };
    const COSTERA = {
      display_name: "Costera Miguel Alemán, Acapulco de Juárez, Guerrero",
      lat: "16.86",
      lon: "-99.88",
      class: "highway",
      type: "primary",
      address: { road: "Costera Miguel Alemán", city: "Acapulco de Juárez", state: "Guerrero" },
    };
    const { deps, pedidos } = falso((u) => {
      const q = u.searchParams.get("q");
      if (q === "Acapulco de Juárez, Guerrero") return { status: 200, body: [ACAPULCO] };
      if (q === "Costera Miguel Alemán, Acapulco de Juárez, Guerrero")
        return { status: 200, body: [COSTERA] };
      return { status: 200, body: [] };
    });
    const r = await buscarLugar(
      {
        q: "Blvd. Costera Miguel Alemán, colonia Club Deportivo",
        municipio: "Acapulco de Juárez",
        estado: "Guerrero",
      },
      "c1",
      deps,
    );
    expect(r.resultados[0]).toMatchObject({ lat: 16.86, lon: -99.88 });
    expect(r.aviso).toContain("se buscó «Costera Miguel Alemán»");
    expect(
      pedidos.some(
        (p) =>
          p.url.searchParams.get("q") ===
          "Blvd. Costera Miguel Alemán, Acapulco de Juárez, Guerrero",
      ),
    ).toBe(true);
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
        // Sin cruce: con uno que no aparece se dice y no se propone una calle sola (#388).
        q: "Calle Azucena, colonia Lomas San Lorenzo",
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
    // Reportes de CESVI: el número de la casa y la colonia no son parte del nombre.
    expect(primeraCalle("Avenida Pigmenio González No.500, Colonia Tecnológico")).toBe(
      "Avenida Pigmenio González",
    );
    expect(primeraCalle("calle Fuente de Dalila en la colonia Jardines del Lago")).toBe(
      "calle Fuente de Dalila",
    );
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

describe("lo que escribe el perito gana (B5)", () => {
  it("si escribe otro estado, se busca ahí y no en la zona que leyó Croquis", async () => {
    const { deps, pedidos } = falso((u) =>
      u.searchParams.get("q") === "San Luis Potosí, San Luis Potosí"
        ? { status: 200, body: [SLP] }
        : { status: 200, body: [] },
    );
    await buscarLugar(
      {
        q: "Av. Venustiano Carranza 500, San Luis Potosí, San Luis Potosí",
        municipio: "Monterrey",
        estado: "Nuevo León",
      },
      "c8",
      deps,
    );
    expect(pedidos[0]!.url.searchParams.get("q")).toBe("San Luis Potosí, San Luis Potosí");
    expect(pedidos.some((p) => p.url.searchParams.get("q")?.includes("Monterrey"))).toBe(false);
  });
});

describe("lo que dejó la redacción no estorba (B5)", () => {
  it("«Nuevo [NOMBRE]» no se usa como estado: se busca en el municipio", async () => {
    const { deps, pedidos } = falso(() => ({ status: 200, body: [] }));
    await buscarLugar(
      {
        q: "Boulevard de los Pinos, colonia Valle Alto",
        municipio: "Monterrey",
        estado: "Nuevo [NOMBRE]",
      },
      "c9",
      deps,
    );
    expect(pedidos[0]!.url.searchParams.get("q")).toBe("Monterrey");
    expect(pedidos.every((p) => !String(p.url).includes("NOMBRE"))).toBe(true);
  });
});

describe("el cruce de dos vías y, si nada cuadra, la pregunta (ronda 4, René)", () => {
  const TOLUCA = {
    display_name: "Toluca, Estado de México, México",
    lat: "19.29",
    lon: "-99.66",
    name: "Toluca",
    boundingbox: ["19.20", "19.40", "-99.75", "-99.50"],
    address: { city: "Toluca", state: "Estado de México" },
  };
  const via = (nombre: string, coords: [number, number][]) => ({
    display_name: `${nombre}, Toluca, Estado de México`,
    lat: String(coords[0]![1]),
    lon: String(coords[0]![0]),
    address: { road: nombre, city: "Toluca", state: "Estado de México" },
    geojson: { type: "LineString", coordinates: coords },
  });

  it("lee las dos vías de la frase", () => {
    expect(viasDelCruce("paso a desnivel de Solidaridad Las Torres sobre Paseo Tollocan")).toEqual([
      "Solidaridad Las Torres",
      "Paseo Tollocan",
    ]);
    expect(viasDelCruce("Paseo Tollocan, a la altura de la calle Isidro Fabela")).toEqual([
      "Paseo Tollocan",
      "Isidro Fabela",
    ]);
    expect(viasDelCruce("cruce de Av. Juárez con Hidalgo")).toEqual(["Av. Juárez", "Hidalgo"]);
    // «a la altura de» el municipio no es un cruce.
    expect(
      viasDelCruce("carretera Toluca–Valle de Bravo, a la altura de Amanalco", "Amanalco"),
    ).toBeNull();
    expect(
      viasDelCruce(
        "curva del Circuito Exterior Mexiquense a la altura de Ecatepec",
        "Ecatepec de Morelos",
      ),
    ).toBeNull();
    expect(viasDelCruce("Av. Las Torres")).toBeNull();
    // Lo que va antes del nombre no es parte de la vía.
    expect(primeraCalle("curva del Circuito Exterior Mexiquense a la altura de Ecatepec")).toBe(
      "Circuito Exterior Mexiquense",
    );
  });

  it("da el punto donde se cruzan, con las geometrías de OpenStreetMap", async () => {
    const { deps, pedidos } = falso((u) => {
      const q = u.searchParams.get("q");
      if (q === "Toluca, Estado de México") return { status: 200, body: [TOLUCA] };
      if (u.searchParams.get("polygon_geojson") !== "1") return { status: 200, body: [] };
      // Las Torres va de oeste a este; Tollocan, de sur a norte: se cruzan en (-99.60, 19.28).
      if (q === "Solidaridad Las Torres, Toluca, Estado de México")
        return {
          status: 200,
          body: [
            via("Avenida Solidaridad Las Torres", [
              [-99.61, 19.28],
              [-99.59, 19.28],
            ]),
          ],
        };
      if (q === "Paseo Tollocan, Toluca, Estado de México")
        return {
          status: 200,
          body: [
            via("Paseo Tollocan", [
              [-99.6, 19.27],
              [-99.6, 19.29],
            ]),
          ],
        };
      return { status: 200, body: [] };
    });
    const r = await buscarLugar(
      {
        q: "paso a desnivel de Solidaridad Las Torres sobre Paseo Tollocan",
        municipio: "Toluca",
        estado: "Estado de México",
      },
      "cruce",
      deps,
    );
    expect(r.resultados).toHaveLength(1);
    expect(r.resultados[0]!.nombre).toBe("Solidaridad Las Torres y Paseo Tollocan");
    expect(r.resultados[0]!.lat).toBeCloseTo(19.28, 5);
    expect(r.resultados[0]!.lon).toBeCloseTo(-99.6, 5);
    expect(r.aviso).toContain("El cruce de Solidaridad Las Torres y Paseo Tollocan");
    // Dentro de la caja del municipio.
    const g = pedidos.find((p) => p.url.searchParams.get("polygon_geojson") === "1")!;
    expect(g.url.searchParams.get("bounded")).toBe("1");
  });

  it("si las vías no se tocan ni aparece nada, pregunta; nunca el centro del municipio", async () => {
    const { deps } = falso((u) => {
      const q = u.searchParams.get("q");
      if (q === "Toluca, Estado de México") return { status: 200, body: [TOLUCA] };
      if (u.searchParams.get("polygon_geojson") !== "1") return { status: 200, body: [] };
      // Paralelas, a 1 km: no hay cruce.
      if (q === "Solidaridad Las Torres, Toluca, Estado de México")
        return {
          status: 200,
          body: [
            via("Avenida Solidaridad Las Torres", [
              [-99.61, 19.28],
              [-99.59, 19.28],
            ]),
          ],
        };
      if (q === "Paseo Tollocan, Toluca, Estado de México")
        return {
          status: 200,
          body: [
            via("Paseo Tollocan", [
              [-99.61, 19.29],
              [-99.59, 19.29],
            ]),
          ],
        };
      return { status: 200, body: [] };
    });
    const r = await buscarLugar(
      {
        q: "paso a desnivel de Solidaridad Las Torres sobre Paseo Tollocan",
        municipio: "Toluca",
        estado: "Estado de México",
      },
      "sin-cruce",
      deps,
    );
    expect(r.resultados).toEqual([]);
    // René, 2026-11-27 (#388): se dice qué cruce no se encontró y no se propone otra esquina.
    expect(r.aviso).toContain(
      "No encontré el cruce de Solidaridad Las Torres con Paseo Tollocan en Toluca",
    );
    expect(r.aviso).toContain("márcalo tú");
  });
});

describe("variantes de una vía y precisión (revisión de la cadena, 2026-11-24)", () => {
  it("prueba la vía sin artículos y sin su tipo", () => {
    expect(variantesDeVia("Avenida de los Insurgentes Sur")).toEqual([
      "Avenida de los Insurgentes Sur",
      "Avenida Insurgentes Sur",
      "Insurgentes Sur",
    ]);
  });
});

describe("los cruces que dice la revisión de la cadena (2026-11-24)", () => {
  it("«X, unos 15 m al norte de su cruce con Y» es el cruce de X y Y", () => {
    expect(
      viasDelCruce(
        "Avenida de los Insurgentes Sur, unos 15 m al norte de su cruce con Avenida Miguel Ángel de Quevedo, colonia Chimalistac",
      ),
    ).toEqual(["Avenida de los Insurgentes Sur", "Avenida Miguel Ángel de Quevedo"]);
  });
});
