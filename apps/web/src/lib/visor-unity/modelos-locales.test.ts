// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { aModelosLocales, MODELOS_EN_BLOB, redirigirModelosA } from "./modelos-locales";

const ORIGINAL = window.fetch;

afterEach(() => {
  window.fetch = ORIGINAL;
});

describe("los modelos desde el sitio, sin Blob", () => {
  it("la dirección de Blob es la carpeta de modelos de recursos.json, con su huella", () => {
    expect(MODELOS_EN_BLOB).toMatch(
      /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/recursos\/modelos\/vehiculos\/[0-9a-f]{16}\/$/,
    );
  });

  it("cambia solo lo que está en esa carpeta", () => {
    expect(aModelosLocales(`${MODELOS_EN_BLOB}vehiculos.json`, "/modelos/vehiculos/")).toBe(
      "/modelos/vehiculos/vehiculos.json",
    );
    expect(
      aModelosLocales(`${MODELOS_EN_BLOB}sedan.glb`, "http://localhost:3000/modelos/vehiculos/"),
    ).toBe("http://localhost:3000/modelos/vehiculos/sedan.glb");
    const otra = "https://fmb6kf9hhoc8c9mk.public.blob.vercel-storage.com/recursos/hdri/x/dia.hdr";
    expect(aModelosLocales(otra, "/modelos/vehiculos/")).toBe(otra);
    expect(aModelosLocales("/visor-unity/manifest.json", "/x/")).toBe("/visor-unity/manifest.json");
  });

  it("con la redirección puesta, fetch y XMLHttpRequest piden al sitio", async () => {
    const pedidas: string[] = [];
    window.fetch = vi.fn(async (e: RequestInfo | URL) => {
      pedidas.push(typeof e === "string" ? e : e instanceof URL ? e.href : e.url);
      return new Response("{}");
    }) as typeof window.fetch;
    const abrir = vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(() => {});
    redirigirModelosA("/modelos/vehiculos/");
    await window.fetch(`${MODELOS_EN_BLOB}vehiculos.json`);
    await window.fetch(new URL(`${MODELOS_EN_BLOB}combi.glb`));
    await window.fetch("/api/version");
    new XMLHttpRequest().open("GET", `${MODELOS_EN_BLOB}sedan.glb`);
    expect(pedidas).toEqual([
      "/modelos/vehiculos/vehiculos.json",
      "/modelos/vehiculos/combi.glb",
      "/api/version",
    ]);
    expect(abrir.mock.calls[0]?.[1]).toBe("/modelos/vehiculos/sedan.glb");
    abrir.mockRestore();
  });
});
