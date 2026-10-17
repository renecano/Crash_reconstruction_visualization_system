import { loadFixture, loadResultado } from "@croquis/scene-schema";
import { Color, DataTexture, Mesh, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { describe, expect, it } from "vitest";
import { colorGain, loadEnvTextures, texturesWanted, type EnvTextures } from "./env-textures";
import { QUALITY_PROFILES } from "./quality";
import { buildSceneGraph } from "./scene-graph";

const MANIFEST = {
  tamano_px: 512,
  texturas: Object.fromEntries(
    (["asfalto", "concreto", "pasto"] as const).map((n, i) => [
      n,
      {
        mosaico_m: [4, 2, 6][i],
        archivos: {
          diff: { archivo: `${n}_diff.webp`, media: [0.02, 0.016, 0.014] },
          nor_gl: { archivo: `${n}_nor_gl.webp` },
          rough: { archivo: `${n}_rough.webp`, media: 0.8 },
        },
      },
    ]),
  ),
};

function fakeLoad(urls: string[]) {
  return (url: string): Promise<Texture> => {
    urls.push(url);
    return Promise.resolve(new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1));
  };
}

const fetchOf = (manifest: unknown) =>
  (() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(manifest),
    } as Response)) as typeof fetch;
const fakeFetch = fetchOf(MANIFEST);

describe("texturas del entorno (F8e)", () => {
  it("solo alta y ultra las cargan (ADR 0026, decisión 7)", () => {
    expect(texturesWanted("baja")).toBe(false);
    expect(texturesWanted("media")).toBe(false);
    expect(texturesWanted("alta")).toBe(true);
    expect(texturesWanted("ultra")).toBe(true);
  });

  it("carga los tres mapas de cada textura, en mosaico y con el espacio de color correcto", async () => {
    const urls: string[] = [];
    const t = await loadEnvTextures("/texturas/", fakeFetch, fakeLoad(urls));
    expect(urls).toHaveLength(9);
    expect(urls).toContain("/texturas/asfalto_nor_gl.webp");
    expect(t.asfalto?.tileM).toBe(4);
    expect(t.pasto?.tileM).toBe(6);
    expect(t.asfalto?.map.colorSpace).toBe(SRGBColorSpace);
    expect(t.asfalto?.normal.colorSpace).not.toBe(SRGBColorSpace);
    expect(t.concreto?.rough.wrapS).toBe(RepeatWrapping);
    expect(t.asfalto?.meanRgb).toEqual([0.02, 0.016, 0.014]);
    expect(t.asfalto?.meanRough).toBe(0.8);
  });

  it("la textura conserva el color calibrado: promedio × ganancia = color del material", async () => {
    const t = await loadEnvTextures("/texturas/", fakeFetch, fakeLoad([]));
    for (const hex of ["#3b3e42", "#26292c", "#a19f99"]) {
      const target = new Color(hex);
      const gain = colorGain(t.asfalto!, hex);
      const mean = t.asfalto!.meanRgb;
      expect(mean[0] * gain[0]).toBeCloseTo(target.r, 12);
      expect(mean[1] * gain[1]).toBeCloseTo(target.g, 12);
      expect(mean[2] * gain[2]).toBeCloseTo(target.b, 12);
    }
  });

  it("sin promedios en el manifiesto, error (no se puede calibrar)", async () => {
    const sinMedia = structuredClone(MANIFEST);
    delete (sinMedia.texturas.pasto!.archivos.diff as { media?: unknown }).media;
    await expect(loadEnvTextures("/t/", fetchOf(sinMedia), fakeLoad([]))).rejects.toThrow(
      /color medio/,
    );
  });

  it("sin manifiesto, error", async () => {
    const bad = (() => Promise.resolve({ ok: false, status: 404 } as Response)) as typeof fetch;
    await expect(loadEnvTextures("/x/", bad, fakeLoad([]))).rejects.toThrow(/404/);
  });

  it("la escena aplica asfalto, concreto y pasto con textura", async () => {
    const spec = loadFixture("alcance");
    const r = await loadResultado("alcance");
    const sg = buildSceneGraph(spec, r, {
      quality: QUALITY_PROFILES.media,
      env: {
        night: false,
        wet: true,
        groundColor: "#5d6b4a",
        streetLights: false,
        surface: "mojado",
      },
    });
    const t: EnvTextures = await loadEnvTextures("/texturas/", fakeFetch, fakeLoad([]));
    sg.applyTextures(t);
    const mat = (name: string) =>
      (sg.root.getObjectByName(name) as Mesh | undefined)?.material as MeshStandardNodeMaterial;
    const calzada = mat("calzada") ?? mat("calzada_sin_sombra");
    expect(calzada.normalNode).toBeTruthy();
    const banqueta = mat("banqueta") ?? mat("banqueta_sin_sombra");
    expect(banqueta).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(banqueta.normalNode).toBeTruthy();
    expect(mat("suelo")).toBeInstanceOf(MeshStandardNodeMaterial);
    sg.dispose();
  });
});
