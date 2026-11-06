// @vitest-environment jsdom
// GLTFExporter arma el .glb con Blob y FileReader (del navegador; jsdom los trae).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LEGEND_TEXT, legendFor, loadFixture, loadResultado } from "@croquis/scene-schema";
import {
  AnimationMixer,
  BoxGeometry,
  CompressedTexture,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type PerspectiveCamera,
  Quaternion,
  type SkinnedMesh,
  Texture,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { describe, expect, it } from "vitest";
import { parseBody, type BodyManifest, type BodyTemplate, type BodyVariant } from "../body-assets";
import { attachDebris } from "../debris-scene";
import { attachPeople, variantsFor } from "../people-scene";
import { QUALITY_PROFILES } from "../quality";
import { attachRollovers } from "../rollover-scene";
import { cinematicCamera, exportCameras } from "../cameras";
import { environmentFor } from "../environment";
import { buildSceneGraph } from "../scene-graph";
import {
  ambienteDe,
  classicMaterial,
  expandirConDatos,
  exportSceneGlb,
  sampleTimes,
  sinAtributosPorInstancia,
  warpedTimes,
  withoutCompressedTextures,
} from "./gltf";

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

/** El color base del material de la primera malla del nodo con ese nombre. */
function colorDe(json: ReturnType<typeof glbJson>, nodo: string): number[] {
  const n = json.nodes.find((x) => x.name === nodo)!;
  const mat = json.meshes![n.mesh!]!.primitives[0]!.material!;
  return json.materials![mat]!.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
}
const blanco = (c: number[]) => c.slice(0, 3).every((x) => x > 0.95);

/** El JSON del contenedor GLB (primer chunk). */
function glbJson(glb: ArrayBuffer): {
  asset: { copyright?: string };
  scenes: { extras?: Record<string, unknown> }[];
  cameras?: { type: string; perspective?: { yfov: number } }[];
  nodes: { name?: string; camera?: number; mesh?: number }[];
  meshes?: { primitives: { material?: number }[] }[];
  materials?: { pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
  animations?: { channels: { target: { path: string; node?: number } }[] }[];
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

  it("R11: un material de un vehículo de Sketchfab sale sin KTX2 y dice de qué modelo es", () => {
    const m = new MeshStandardMaterial({ name: "UCB_BOTTOM_LT" });
    m.map = new CompressedTexture([], 4, 4);
    m.roughnessMap = new CompressedTexture([], 4, 4);
    const c = withoutCompressedTextures(m, "sedan") as MeshStandardMaterial;
    expect(c).not.toBe(m);
    expect(c.map).toBeNull();
    expect(c.roughnessMap).toBeNull();
    expect(c.userData.material_modelo).toEqual({ clase: "sedan", material: "UCB_BOTTOM_LT" });
    // El original no cambia (lo sigue usando el visor) y sin KTX2 no hay copia.
    expect(m.map).toBeInstanceOf(CompressedTexture);
    const plano = new MeshStandardMaterial({ map: new Texture() });
    expect(withoutCompressedTextures(plano, "sedan")).toBe(plano);
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

  it("los atributos por instancia no viajan como atributos de vértice (Blender se caía, R11)", () => {
    const geo = new BoxGeometry(1, 1, 1);
    geo.setAttribute("_tint", new InstancedBufferAttribute(new Float32Array(10 * 3), 3));
    const limpia = sinAtributosPorInstancia(geo)!;
    expect(limpia.getAttribute("_tint")).toBeUndefined();
    expect(limpia.getAttribute("position").count).toBe(geo.getAttribute("position").count);
    // La original (la que dibuja el visor) no cambia.
    expect(geo.getAttribute("_tint")).toBeDefined();
    expect(sinAtributosPorInstancia(new BoxGeometry(1, 1, 1))).toBeNull();
  });

  it("R11: las instancias quietas con datos salen como nodos con sus extras (fachadas)", () => {
    const geo = new BoxGeometry(1, 1, 1);
    const inst = new InstancedMesh(geo, new MeshStandardMaterial(), 2);
    inst.name = "edificios";
    inst.setMatrixAt(0, new Matrix4().makeTranslation(3, 0, 0));
    inst.setMatrixAt(
      1,
      new Matrix4().compose(new Vector3(0, 0, -5), new Quaternion(), new Vector3(8, 6, 10)),
    );
    inst.userData.croquisPorInstancia = [
      { croquis_dims: [1, 1, 1], croquis_tinte: [0.5, 0.4, 0.3], croquis_banderas: [1, 0, 1, 0] },
      { croquis_dims: [8, 6, 10], croquis_tinte: [0.2, 0.3, 0.4], croquis_banderas: [-1, 1, 0, 1] },
    ];
    const g = expandirConDatos(inst)!;
    expect(g.children).toHaveLength(2);
    const [a, b] = g.children as Mesh[];
    expect(a!.position.x).toBeCloseTo(3, 6);
    expect(b!.scale.toArray()).toEqual([8, 6, 10]);
    expect(b!.userData.croquis_banderas).toEqual([-1, 1, 0, 1]);
    expect(b!.geometry).toBe(geo);
    // Sin datos (o con menos que instancias) no se expande.
    inst.userData.croquisPorInstancia = [{}];
    expect(expandirConDatos(inst)).toBeNull();
  });

  it("la marca de la textura del entorno pasa al material clásico (extras para Blender, R11)", () => {
    const node = new MeshStandardNodeMaterial();
    node.userData.croquisTextura = { nombre: "pasto", mosaico_m: 4, color: "#556b2f" };
    node.userData.croquisArbol = { especie: "fresno", tarjeta: "frente", diff: "f.webp" };
    const c = classicMaterial(node);
    expect(c.userData.croquisTextura).toEqual(node.userData.croquisTextura);
    expect(c.userData.croquisArbol).toEqual(node.userData.croquisArbol);
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

    // Los restos (instancias que se mueven) salen como una malla animada por pieza, con su color y
    // su tamaño real, y ocultos (escala cero) antes de desprenderse; no como cubos de un metro (R11).
    const piezas = json.nodes.filter((n) => n.name?.startsWith("restos_plasticos_"));
    expect(piezas.length).toBeGreaterThan(0);
    expect(blanco(colorDe(json, piezas[0]!.name!))).toBe(false);
    const pieza = gltf.scene.getObjectByName(piezas[0]!.name!)!;
    const escala = clip.tracks.find(
      (t) =>
        (t.name.startsWith(`${pieza.name}.`) || t.name.startsWith(`${pieza.uuid}.`)) &&
        t.name.endsWith(".scale"),
    )!;
    expect(Array.from(escala.values.slice(0, 3))).toEqual([0, 0, 0]);
    const tam = Array.from(escala.values.slice(-3));
    expect(Math.max(...tam)).toBeGreaterThan(0);
    expect(Math.max(...tam)).toBeLessThan(0.5);

    // Solo materiales que entiende glTF.
    gltf.scene.traverse((o) => {
      const m = (o as Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        expect((mat as { isNodeMaterial?: boolean }).isNodeMaterial).not.toBe(true);
      }
    });
  });

  it("R11: los marcadores de interfaz no van al video, como en las fotos del dictamen", async () => {
    const spec = loadFixture("volcadura");
    const r = await loadResultado("volcadura");
    const graph = buildSceneGraph(spec, r, opts);
    await attachDebris(spec, r, graph);
    const marca = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    marca.name = "marca_de_interfaz";
    marca.userData.interfaz = true;
    graph.root.add(marca);
    graph.update(0);

    const json = glbJson(
      await exportSceneGlb(graph, { resultado: r, legend: legendFor(spec), fps: 10 }),
    );
    const nombres = json.nodes.map((n) => n.name);
    expect(nombres).not.toContain("marca_de_interfaz");
    if (r.punto_impacto) expect(nombres).not.toContain("punto_impacto");
    // Toda pista apunta a un nodo exportado.
    const canales = json.animations?.[0]?.channels ?? [];
    expect(canales.length).toBeGreaterThan(0);
    for (const c of canales) expect(c.target.node).toBeTypeOf("number");
    // La escena que se dibuja no cambia.
    expect(graph.root.getObjectByName("marca_de_interfaz")).toBe(marca);
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

  it("R11: las cámaras del visor van animadas con sus poses, y el ambiente en los extras", async () => {
    const spec = loadFixture("interseccion_toluca");
    const r = await loadResultado("interseccion_toluca");
    const graph = buildSceneGraph(spec, r, opts);
    const cameras = exportCameras(r, () => 1.2);
    const env = environmentFor({ fechaHora: "2026-03-14T12:30:00-06:00", lat: 19.29, lon: -99.65 });
    const glb = await exportSceneGlb(graph, {
      resultado: r,
      legend: legendFor(spec),
      fps: 10,
      cameras,
      ambiente: ambienteDe(env),
    });

    // Una cámara de glTF por cada cámara del visor, con su nombre y su campo de visión.
    const json = glbJson(glb);
    expect(json.cameras).toHaveLength(cameras.length);
    const nombres = json.nodes.filter((n) => n.camera !== undefined).map((n) => n.name);
    expect(nombres).toEqual(cameras.map((c) => c.nombre));
    expect(nombres[0]).toBe("Cinematográfica");
    expect(nombres).toContain(`Conductor ${r.vehiculos[0]!.id}`);
    expect(json.cameras![0]!.perspective!.yfov).toBeCloseTo(
      (cinematicCamera(r, r.t_inicio).fov * Math.PI) / 180,
      5,
    );
    const extras = json.scenes[0]!.extras!;
    expect(extras.camara_principal).toBe("Cinematográfica");
    expect(extras.fps).toBe(10);
    const ambiente = extras.ambiente as { sol: { elevacion_deg: number }; noche: boolean };
    expect(ambiente.sol.elevacion_deg).toBeCloseTo(env.sun.elevation, 6);
    expect(ambiente.noche).toBe(false);

    // La cinematográfica se mueve como en el visor: en el instante t está en cinematicCamera(t).
    const gltf = await load(glb);
    const cine = gltf.cameras.find((c) => c.name === "Cinematográfica") as PerspectiveCamera;
    const mixer = new AnimationMixer(gltf.scene);
    mixer.clipAction(gltf.animations[0]!).play();
    for (const t of [r.t_inicio + 0.5, (r.t_inicio + r.t_fin) / 2]) {
      mixer.setTime(t - r.t_inicio);
      const p = cinematicCamera(r, t).position;
      expect(cine.position.distanceTo(new Vector3(...p))).toBeLessThan(0.05);
    }
    // Los materiales con color de nodos (asfalto, llantas) llevan su color plano, no blanco.
    expect(blanco(colorDe(json, "calzada"))).toBe(false);
    expect(blanco(colorDe(json, "wheel_fl_rueda"))).toBe(false);

    // La cenital no se mueve: sin pistas propias.
    const cenital = gltf.cameras.find((c) => c.name === "Cenital")!;
    const pistas = gltf.animations[0]!.tracks.filter((t) =>
      [cenital.name, cenital.uuid].includes(t.name.split(".")[0]!),
    );
    expect(pistas).toHaveLength(0);
  });
});

describe("cámara lenta horneada en el video (T1.5)", () => {
  it("el video avanza a fps constantes y la escena frena donde el factor es menor", () => {
    const warp = (t: number) => (Math.abs(t) < 0.5 ? 0.25 : 1);
    const { scene, video } = warpedTimes(-2, 2, 10, warp);
    expect(video[0]).toBe(0);
    for (let k = 1; k < video.length; k++) expect(video[k]! - video[k - 1]!).toBeCloseTo(0.1, 9);
    expect(scene[0]).toBe(-2);
    expect(scene[scene.length - 1]).toBeCloseTo(2, 9);
    // Fuera del impacto la escena avanza 0.1 s por cuadro; dentro, 0.025 s.
    expect(scene[1]! - scene[0]!).toBeCloseTo(0.1, 9);
    const inside = scene.findIndex((t) => t > -0.5 + 0.01);
    expect(scene[inside + 1]! - scene[inside]!).toBeCloseTo(0.025, 9);
    // Más cuadros que sin cámara lenta: el clip dura más que la escena.
    expect(video[video.length - 1]!).toBeGreaterThan(4);
    const plain = warpedTimes(-2, 2, 10);
    expect(plain.video[plain.video.length - 1]).toBeCloseTo(4, 9);
  });
});
