// @vitest-environment jsdom
// GLTFExporter arma el .glb con Blob y FileReader (del navegador; jsdom los trae).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LEGEND_TEXT, legendFor, loadFixture, loadResultado } from "@croquis/scene-schema";
import { type Mesh, MeshStandardMaterial, type SkinnedMesh } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { describe, expect, it } from "vitest";
import { parseBody, type BodyManifest, type BodyTemplate, type BodyVariant } from "../body-assets";
import { attachDebris } from "../debris-scene";
import { attachPeople, variantsFor } from "../people-scene";
import { QUALITY_PROFILES } from "../quality";
import { attachRollovers } from "../rollover-scene";
import { buildSceneGraph } from "../scene-graph";
import { classicMaterial, exportSceneGlb, sampleTimes } from "./gltf";

const opts = {
  quality: QUALITY_PROFILES.media,
  env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
};

const MODELS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../apps/web/public/modelos/personas",
);

async function templates(vs: BodyVariant[]): Promise<Map<BodyVariant, BodyTemplate>> {
  const manifest = JSON.parse(
    readFileSync(resolve(MODELS, "personas.json"), "utf-8"),
  ) as BodyManifest;
  const m = new Map<BodyVariant, BodyTemplate>();
  for (const v of vs) {
    const entry = manifest.variantes.find((e) => e.variante === v)!;
    const buf = readFileSync(resolve(MODELS, entry.archivo));
    // ArrayBuffer de este entorno (jsdom): GLTFLoader distingue binario por `instanceof`.
    const ab = new ArrayBuffer(buf.length);
    new Uint8Array(ab).set(buf);
    const scene = await parseBody(ab);
    m.set(v, { entry, scene });
  }
  return m;
}

/** Abre el .glb como lo haría cualquier visor de glTF. */
async function load(glb: ArrayBuffer) {
  return new GLTFLoader().parseAsync(glb, "");
}

/** El JSON del contenedor GLB (primer chunk). */
function glbJson(glb: ArrayBuffer): {
  asset: { copyright?: string };
  scenes: { extras?: Record<string, unknown> }[];
  animations?: { channels: { target: { path: string } }[] }[];
} {
  const view = new DataView(glb);
  expect(view.getUint32(0, true)).toBe(0x46546c67); // "glTF"
  const len = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, len))) as ReturnType<
    typeof glbJson
  >;
}

describe("exportación glTF", () => {
  it("muestrea de t0 a t1 a los fps pedidos e incluye el final", () => {
    expect(sampleTimes(-1, 1, 2)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(sampleTimes(0, 1.05, 10).at(-1)).toBeCloseTo(1.05);
  });

  it("los materiales de nodos pasan a sus equivalentes clásicos", () => {
    const node = new MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.7 });
    node.color.set("#336699");
    const c = classicMaterial(node) as MeshStandardMaterial;
    expect(c).toBeInstanceOf(MeshStandardMaterial);
    expect(c.roughness).toBe(0.3);
    expect(c.metalness).toBe(0.7);
    expect(c.color.getHexString()).toBe("336699");
    const classic = new MeshStandardMaterial();
    expect(classicMaterial(classic)).toBe(classic);
  });

  it("volcadura: escena con leyenda, animación de vehículos y restos, y daño", async () => {
    const spec = loadFixture("volcadura");
    const r = await loadResultado("volcadura");
    const graph = buildSceneGraph(spec, r, opts);
    await attachDebris(spec, r, graph);
    await attachRollovers(r, graph);
    graph.update(0.5);
    const before = graph.root.children.map((c) => c.position.toArray());

    const glb = await exportSceneGlb(graph, { resultado: r, legend: legendFor(spec), fps: 20 });

    // La escena que se dibuja quedó en su instante.
    expect(graph.time).toBe(0.5);
    expect(graph.root.children.map((c) => c.position.toArray())).toEqual(before);

    const json = glbJson(glb);
    expect(json.asset.copyright).toContain(LEGEND_TEXT);
    expect(json.asset.copyright).toContain(`semilla ${spec.meta.semilla}`);
    expect(json.scenes[0]!.extras!.leyenda).toEqual(expect.arrayContaining([LEGEND_TEXT]));

    const gltf = await load(glb);
    const clip = gltf.animations[0]!;
    expect(clip.duration).toBeCloseTo(r.t_fin - r.t_inicio, 5);
    const paths = new Set(json.animations![0]!.channels.map((c) => c.target.path));
    expect(paths).toContain("translation");
    expect(paths).toContain("rotation");
    expect(paths).toContain("weights"); // daño (morph targets)

    // El vehículo está en la escena y su animación lo mueve.
    const veh = gltf.scene.getObjectByName(`vehiculo_${r.vehiculos[0]!.id}`);
    expect(veh).toBeDefined();
    // GLTFLoader nombra las pistas con el nombre del nodo cargado (o su uuid si no tiene).
    const vehTracks = clip.tracks.filter(
      (t) => t.name.startsWith(`${veh!.name}.`) || t.name.startsWith(`${veh!.uuid}.`),
    );
    expect(vehTracks.length).toBeGreaterThan(0);

    // Restos: más de un objeto animado además de los vehículos.
    const animated = new Set(clip.tracks.map((t) => t.name.split(".")[0]));
    expect(animated.size).toBeGreaterThan(r.vehiculos.length);

    // Solo materiales que entiende glTF.
    gltf.scene.traverse((o) => {
      const m = (o as Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        expect((mat as { isNodeMaterial?: boolean }).isNodeMaterial).not.toBe(true);
      }
    });
  });

  it("peatón: el cuerpo con su esqueleto y la animación de sus huesos (ragdoll)", async () => {
    const spec = loadFixture("peaton_cruce");
    const r = await loadResultado("peaton_cruce");
    const graph = buildSceneGraph(spec, r, opts);
    await attachPeople(spec, r, graph, await templates(variantsFor(spec)));
    graph.update(0);

    const gltf = await load(
      await exportSceneGlb(graph, { resultado: r, legend: legendFor(spec), fps: 15 }),
    );
    const skinned: SkinnedMesh[] = [];
    gltf.scene.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh);
    });
    expect(skinned.length).toBeGreaterThan(0);
    const boneNames = new Set(skinned.flatMap((m) => m.skeleton.bones.map((b) => b.name)));
    const boneTracks = gltf.animations[0]!.tracks.filter((t) =>
      boneNames.has(t.name.split(".")[0]!),
    );
    expect(boneTracks.length).toBeGreaterThan(10);
  });
});
