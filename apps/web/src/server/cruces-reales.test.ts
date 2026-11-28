import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buscarLugar, LugarIn, MemoryLugarCache } from "./lugar";
import { MemoryRateLimiter } from "@croquis/extraction/server";

/**
 * Los cruces narrados en lugares reales (René, 2026-11-27; issue #388). Las respuestas de Nominatim y
 * Overpass van grabadas (`__fixtures__/cruces/`): CI no sale a internet. Para grabarlas otra vez:
 *
 *   CROQUIS_GRABAR_CRUCES=1 pnpm exec vitest run src/server/cruces-reales.test.ts
 *
 * Falla si el lugar que propone Croquis queda a más de 30 m del cruce real (el nodo que comparten las
 * dos calles en OpenStreetMap; el de Lerdo de Tejada y Nicolás Bravo lo dio el issue).
 */
const DIR = join(__dirname, "__fixtures__", "cruces");
const GRABAR = process.env.CROQUIS_GRABAR_CRUCES === "1";
const TOPE_M = 30;

interface Grabada {
  clave: string;
  status: number;
  texto: string;
}
const claveDe = (url: string, init?: RequestInit) =>
  `${init?.method ?? "GET"} ${url} ${init?.body ? String(init.body) : ""}`;

function fetcherDe(nombre: string): { fetcher: typeof fetch; guardar: () => void } {
  const archivo = join(DIR, `${nombre}.json`);
  const grabadas: Grabada[] =
    GRABAR || !existsSync(archivo) ? [] : JSON.parse(readFileSync(archivo, "utf8"));
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const clave = claveDe(url, init);
    if (GRABAR) {
      const r = await fetch(input, init);
      const texto = await r.text();
      grabadas.push({ clave, status: r.status, texto });
      return new Response(texto, { status: r.status });
    }
    const g = grabadas.find((x) => x.clave === clave);
    if (!g) throw new Error(`Sin grabar: ${clave.slice(0, 160)}`);
    return new Response(g.texto, { status: g.status });
  }) as typeof fetch;
  return {
    fetcher,
    guardar: () => {
      if (!GRABAR) return;
      mkdirSync(DIR, { recursive: true });
      writeFileSync(archivo, `${JSON.stringify(grabadas, null, 1)}\n`);
    },
  };
}

function metros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 111320);
}

const CASOS: {
  nombre: string;
  q: string;
  municipio: string;
  estado: string;
  /** El cruce real: el nodo que comparten las dos calles en OSM (leído el 2026-11-27). */
  real: { lat: number; lon: number };
  /**
   * Con varios cruces: `primero`, el real va primero (la narración nombra su colonia); `entre`, va
   * entre las opciones y el aviso dice que la narración no nombra la colonia. Sin él, hay un solo cruce.
   */
  varios?: "primero" | "entre";
  /** Lo que tiene que decir el aviso. */
  aviso?: RegExp;
}[] = [
  {
    nombre: "toluca-lerdo-nicolas-bravo-centro",
    q: "avenida Lerdo de Tejada y calle Nicolás Bravo, colonia Centro",
    municipio: "Toluca",
    estado: "Estado de México",
    real: { lat: 19.29299, lon: -99.65772 },
    varios: "primero",
    aviso: /la narración dice «centro»: el más cercano al centro de Toluca va primero/,
  },
  {
    nombre: "toluca-lerdo-nicolas-bravo",
    q: "avenida Lerdo de Tejada y calle Nicolás Bravo",
    municipio: "Toluca",
    estado: "Estado de México",
    real: { lat: 19.29299, lon: -99.65772 },
    varios: "entre",
    aviso: /la narración no dice la colonia ni la zona: elige el del hecho/,
  },
  {
    nombre: "toluca-independencia-juarez-centro",
    q: "avenida Independencia y avenida Juárez, colonia Centro",
    municipio: "Toluca",
    estado: "Estado de México",
    real: { lat: 19.292076, lon: -99.654422 },
    varios: "primero",
    aviso: /la narración dice «centro»: el más cercano al centro de Toluca va primero/,
  },
  {
    nombre: "cdmx-eje-central-juarez",
    q: "Eje Central Lázaro Cárdenas y avenida Juárez",
    municipio: "Cuauhtémoc",
    estado: "Ciudad de México",
    real: { lat: 19.434237, lon: -99.140851 },
  },
  {
    nombre: "metepec-tecnologico-estado-de-mexico",
    q: "avenida Tecnológico y avenida Estado de México",
    municipio: "Metepec",
    estado: "Estado de México",
    real: { lat: 19.250403, lon: -99.577665 },
  },
];

describe("el cruce narrado, en lugares reales (#388)", () => {
  for (const c of CASOS) {
    it(`${c.q} (${c.municipio})`, { timeout: 180_000 }, async () => {
      const { fetcher, guardar } = fetcherDe(c.nombre);
      const out = await buscarLugar(
        LugarIn.parse({ q: c.q, municipio: c.municipio, estado: c.estado }),
        "prueba",
        {
          fetcher,
          cache: new MemoryLugarCache(),
          limiter: new MemoryRateLimiter(100),
          pausa: GRABAR ? undefined : async () => undefined,
        },
      );
      guardar();
      if (GRABAR)
        console.log(
          "CRUCE",
          c.nombre,
          JSON.stringify(out.resultados.map((r) => [r.nombre, r.lat, r.lon, r.precision])),
          out.aviso,
        );
      expect(out.resultados.length).toBeGreaterThan(0);
      expect(out.resultados.every((r) => r.precision === "cruce")).toBe(true);
      if (c.aviso) expect(out.aviso).toMatch(c.aviso);
      if (!c.varios) expect(out.resultados).toHaveLength(1);
      else expect(out.resultados.length).toBeGreaterThan(1);
      if (c.varios === "entre")
        expect(Math.min(...out.resultados.map((r) => metros(r, c.real)))).toBeLessThan(TOPE_M);
      else expect(metros(out.resultados[0]!, c.real)).toBeLessThan(TOPE_M);
    });
  }
});
