import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { MapaError, parseCoordenadas, traerCalles } from "./mapa";

const RESP = readFileSync(
  join(process.cwd(), "../../data/osm/toluca_carranza_juarez.overpass.json"),
  "utf-8",
);

describe("calles reales en el croquis (ADR 0040)", () => {
  it("lee coordenadas como las copia un mapa", () => {
    expect(parseCoordenadas("19.27897, -99.65399")).toEqual({ lat: 19.27897, lon: -99.65399 });
    expect(parseCoordenadas("19.27897 -99.65399")).toEqual({ lat: 19.27897, lon: -99.65399 });
    expect(parseCoordenadas("19.27897; -99.65399")).toEqual({ lat: 19.27897, lon: -99.65399 });
    expect(parseCoordenadas("19.27897")).toBeNull();
    expect(parseCoordenadas("95, 10")).toBeNull();
    expect(parseCoordenadas("Toluca")).toBeNull();
  });

  it("trae las calles y las pone en la escena, que sigue cumpliendo el contrato", async () => {
    const urls: string[] = [];
    const fetcher = ((url: string) => {
      urls.push(url);
      return Promise.resolve(new Response(RESP, { status: 200 }));
    }) as unknown as typeof fetch;
    const spec = loadFixture("lateral_interseccion");
    const r = await traerCalles(spec, { lat: 19.27897, lon: -99.65399 }, 150, fetcher);
    expect(urls[0]).toBe("/api/osm?lat=19.27897&lon=-99.65399&radio=150");
    expect(r.vias).toBeGreaterThan(0);
    expect(r.spec.lugar.red_vial?.vias).toHaveLength(r.vias);
    expect(r.spec.lugar.tipo_via.fuente).toBe("mapa");
    expect(r.spec.lugar.ubicacion_real?.procedencia.fuente).toBe("usuario");
  });

  it("los errores del servidor llegan como mensaje", async () => {
    const fetcher = (() =>
      Promise.resolve(
        Response.json({ error: "Demasiadas consultas al mapa en una hora." }, { status: 429 }),
      )) as unknown as typeof fetch;
    await expect(
      traerCalles(loadFixture("alcance"), { lat: 19.27, lon: -99.65 }, 150, fetcher),
    ).rejects.toThrow(MapaError);
  });

  it("sin cruce cerca, dice qué hacer", async () => {
    const fetcher = (() =>
      Promise.resolve(new Response(RESP, { status: 200 }))) as unknown as typeof fetch;
    await expect(
      traerCalles(loadFixture("alcance"), { lat: 19.3, lon: -99.6 }, 150, fetcher),
    ).rejects.toThrow(/cruce/);
  });
});
