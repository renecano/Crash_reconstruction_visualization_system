import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRateLimiter } from "@croquis/extraction/server";
import { describe, expect, it } from "vitest";
import {
  cacheKey,
  callesCerca,
  MemoryOsmCache,
  OsmError,
  OsmIn,
  OVERPASS_URL,
  OVERPASS_URLS,
  ROUNDS,
  BUDGET_S,
  USER_AGENT,
  type OsmDeps,
} from "./osm";

const RESP = JSON.parse(
  readFileSync(join(process.cwd(), "../../data/osm/toluca_carranza_juarez.overpass.json"), "utf-8"),
) as unknown;

function deps(
  responses: (Response | Error)[],
  limit = 10,
): OsmDeps & { calls: RequestInit[]; urls: string[] } {
  const calls: RequestInit[] = [];
  const urls: string[] = [];
  const fetcher = ((url: string, init: RequestInit) => {
    urls.push(url);
    calls.push(init);
    const r = responses.shift();
    if (!r) throw new Error("sin respuesta preparada");
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  }) as unknown as typeof fetch;
  return {
    fetcher,
    cache: new MemoryOsmCache(),
    limiter: new MemoryRateLimiter(limit),
    calls,
    urls,
  };
}
const ok = () => new Response(JSON.stringify(RESP), { status: 200 });

describe("calles de OSM en producción (ADR 0040)", () => {
  it("valida las coordenadas y el radio", () => {
    expect(OsmIn.safeParse({ lat: "19.27", lon: "-99.65" }).success).toBe(true);
    expect(OsmIn.safeParse({ lat: "19.27", lon: "-99.65" }).data?.radio).toBe(150);
    expect(OsmIn.safeParse({ lat: "91", lon: "0" }).success).toBe(false);
    expect(OsmIn.safeParse({ lat: "19", lon: "-99", radio: "1000" }).success).toBe(false);
    expect(OsmIn.safeParse({ lat: "x", lon: "-99" }).success).toBe(false);
  });

  it("consulta Overpass con su User-Agent y la consulta de los extractos, y luego usa la caché", async () => {
    const d = deps([ok()]);
    const a = await callesCerca({ lat: 19.278975, lon: -99.6539869, radio: 150 }, "ip", d);
    expect(a.cache).toBe("miss");
    expect(a.instancia).toBe("maps.mail.ru");
    expect((d.calls[0]!.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
    const body = new URLSearchParams(d.calls[0]!.body as URLSearchParams).get("data");
    expect(body).toBe(
      '[out:json][timeout:25];way(around:150,19.27897,-99.65399)["highway"];out body;>;out skel qt;',
    );
    // El mismo punto (redondeado a ~1 m) no vuelve a Overpass.
    const b = await callesCerca({ lat: 19.2789749, lon: -99.6539869, radio: 150 }, "ip", d);
    expect(b.cache).toBe("hit");
    expect(b.instancia).toBeNull();
    expect(d.calls).toHaveLength(1);
    expect(cacheKey(19.278975, -99.6539869, 150)).toBe("croquis:osm:19.27897:-99.65399:150");
  });

  it("si una instancia está saturada o no responde, prueba la siguiente", async () => {
    const d = deps([new Response("", { status: 502 }), new Error("timeout"), ok()]);
    const r = await callesCerca({ lat: 19.27, lon: -99.65, radio: 100 }, "ip", d);
    expect(r.cache).toBe("miss");
    expect(r.instancia).toBe("overpass.private.coffee");
    expect(d.urls).toEqual([...OVERPASS_URLS]);
    // La principal va después del espejo que, saturado, falla en un segundo.
    expect(d.urls[1]).toBe(OVERPASS_URL);
  });

  it("da una segunda vuelta: las fallas de las instancias públicas son intermitentes", async () => {
    const d = deps([
      new Response("", { status: 502 }),
      new Response("", { status: 504 }),
      new Error("timeout"),
      ok(),
    ]);
    const r = await callesCerca({ lat: 19.27, lon: -99.65, radio: 100 }, "ip", d);
    expect(r.instancia).toBe("maps.mail.ru");
    expect(d.urls).toEqual([...OVERPASS_URLS, OVERPASS_URLS[0]]);
  });

  it("no pasa del tiempo total: cada espera se recorta a lo que queda", async () => {
    let t = 0;
    const d = { ...deps([new Response("", { status: 502 }), ok()]), now: () => t };
    const fetcher = d.fetcher;
    d.fetcher = ((url: string, init: RequestInit) => {
      t += (BUDGET_S - 0.5) * 1000; // la primera se lleva casi todo el tiempo
      return fetcher(url, init);
    }) as typeof fetch;
    await expect(
      callesCerca({ lat: 19.27, lon: -99.65, radio: 100 }, "ip", d),
    ).rejects.toMatchObject({ status: 502 });
    expect(d.urls).toHaveLength(1);
  });

  it("si ninguna responde, 502 con un mensaje claro; un error de la consulta no se reintenta", async () => {
    const d = deps([
      ...Array.from({ length: ROUNDS * OVERPASS_URLS.length }, (_, i) =>
        i % 3 === 2 ? new Error("red") : new Response("", { status: 504 }),
      ),
    ]);
    await expect(
      callesCerca({ lat: 19.27, lon: -99.65, radio: 100 }, "ip", d),
    ).rejects.toMatchObject({ status: 502 });
    expect(d.urls).toHaveLength(ROUNDS * OVERPASS_URLS.length);
    const otra = deps([new Response("", { status: 400 })]);
    await expect(callesCerca({ lat: 19.27, lon: -99.65, radio: 100 }, "ip", otra)).rejects.toThrow(
      OsmError,
    );
    expect(otra.calls).toHaveLength(1);
  });

  it("limita las consultas nuevas por persona; lo que ya está en caché no cuenta", async () => {
    const d = deps([ok()], 1);
    await callesCerca({ lat: 19.27, lon: -99.65, radio: 100 }, "ip", d);
    await callesCerca({ lat: 19.27, lon: -99.65, radio: 100 }, "ip", d);
    await expect(callesCerca({ lat: 19.3, lon: -99.6, radio: 100 }, "ip", d)).rejects.toMatchObject(
      { status: 429 },
    );
  });
});
