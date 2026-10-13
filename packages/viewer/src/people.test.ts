import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixture, loadResultado } from "@croquis/scene-schema";
import { Quaternion, SkinnedMesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  complexionInfluences,
  instantiateBody,
  paletteFor,
  parseBody,
  variantForAge,
  type BodyManifest,
  type BodyTemplate,
  type BodyVariant,
} from "./body-assets";
import {
  attachPeople,
  contactZonePosition,
  seatPlacement,
  staticColliders,
  variantsFor,
} from "./people-scene";
import {
  gaitAngles,
  gaitFrequency,
  occupantLean,
  periodicSpline,
  poseFromDirections,
  posedJoints,
  standingDirections,
  walkingDirections,
  GAIT_HIP,
} from "./person-pose";
import { clampRelative, JOINT_LIMITS, swingTwist } from "./person-ragdoll";
import { QUALITY_PROFILES } from "./quality";
import { buildSceneGraph } from "./scene-graph";

const here = dirname(fileURLToPath(import.meta.url));
const MODELS = resolve(here, "../../../apps/web/public/modelos/personas");
const manifest = JSON.parse(
  readFileSync(resolve(MODELS, "personas.json"), "utf-8"),
) as BodyManifest;
const opts = {
  quality: QUALITY_PROFILES.media,
  env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
};

async function template(v: BodyVariant): Promise<BodyTemplate> {
  const entry = manifest.variantes.find((e) => e.variante === v)!;
  const buf = readFileSync(resolve(MODELS, entry.archivo));
  const scene = await parseBody(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { entry, scene };
}

async function templates(vs: BodyVariant[]): Promise<Map<BodyVariant, BodyTemplate>> {
  const m = new Map<BodyVariant, BodyTemplate>();
  for (const v of vs) m.set(v, await template(v));
  return m;
}

const bones = manifest.variantes.find((e) => e.variante === "adulto")!.huesos;

describe("cuerpos de MakeHuman", () => {
  it("el glTF trae malla con piel, 17 huesos y complexión", async () => {
    const t = await template("adulto");
    const inst = instantiateBody(t, paletteFor("p", "adulto"), [0, 0.5]);
    expect(inst.mesh).toBeInstanceOf(SkinnedMesh);
    expect(inst.bones.size).toBe(17);
    expect(inst.mesh.geometry.getAttribute("_region")).toBeDefined();
    expect(inst.mesh.morphTargetInfluences).toEqual([0, 0.5]);
    expect(inst.mesh.geometry.getAttribute("position").count).toBe(t.entry.vertices);
  });

  it("variante por edad y complexión por IMC", () => {
    expect(variantForAge(undefined)).toBe("adulto");
    expect(variantForAge(8)).toBe("nino");
    expect(variantForAge(35)).toBe("adulto");
    expect(variantForAge(72)).toBe("mayor");
    expect(complexionInfluences(undefined, 1.7, "adulto")).toEqual([0, 0]);
    const avg = complexionInfluences(1.7 * 1.7 * 25, 1.7, "adulto");
    expect(avg[0]).toBeCloseTo(0, 9);
    expect(avg[1]).toBeCloseTo(0, 9);
    expect(complexionInfluences(1.7 * 1.7 * 18.5, 1.7, "adulto")[0]).toBeCloseTo(1, 9);
    expect(complexionInfluences(1.7 * 1.7 * 35, 1.7, "adulto")[1]).toBeCloseTo(1, 9);
  });

  it("colores deterministas y distintos entre personas", () => {
    expect(paletteFor("a", "adulto")).toEqual(paletteFor("a", "adulto"));
    const many = new Set(
      ["a", "b", "c", "d", "e", "f"].map((id) => paletteFor(id, "adulto").camisa),
    );
    expect(many.size).toBeGreaterThan(1);
  });
});

describe("posturas", () => {
  it("la curva de cadera pasa por sus puntos de control y es periódica", () => {
    for (const [x, y] of GAIT_HIP) expect(periodicSpline(GAIT_HIP, x)).toBeCloseTo(y, 9);
    expect(periodicSpline(GAIT_HIP, 0.3)).toBeCloseTo(periodicSpline(GAIT_HIP, 1.3), 9);
    expect(gaitAngles(0.72).knee).toBeCloseTo(60, 6);
  });

  it("cadencia a partir de la velocidad y la estatura", () => {
    // 1.4 m/s con 1.70 m: paso 0.71 m → ~0.99 ciclos/s (~119 pasos/min).
    expect(gaitFrequency(1.4, 1.7)).toBeCloseTo(1.4 / (2 * 0.415 * 1.7), 9);
    expect(gaitFrequency(0, 1.7)).toBe(0);
  });

  it("de pie los pies quedan bajo la cadera y la cabeza arriba", () => {
    const j = posedJoints(bones, poseFromDirections(bones, standingDirections()));
    const head = j.get("cabeza")!;
    const footL = j.get("pie_i")!;
    expect(head.tail.y).toBeGreaterThan(0.95);
    expect(footL.head.y).toBeLessThan(0.08);
    expect(Math.abs(footL.head.z)).toBeLessThan(0.08);
  });

  it("al caminar las piernas alternan y la de adelante va al frente", () => {
    const j = posedJoints(bones, poseFromDirections(bones, walkingDirections(0)));
    // Fase 0: contacto del talón izquierdo (cadera izquierda flexionada 30°).
    expect(j.get("pie_i")!.head.z).toBeGreaterThan(j.get("pie_d")!.head.z);
    const k = posedJoints(bones, poseFromDirections(bones, walkingDirections(0.5)));
    expect(k.get("pie_d")!.head.z).toBeGreaterThan(k.get("pie_i")!.head.z);
  });

  it("el ocupante se inclina hacia donde se desplaza", () => {
    const base = standingDirections();
    const lean = occupantLean(base, 0.2, 0, 0.5);
    const j = posedJoints(bones, poseFromDirections(bones, lean));
    const j0 = posedJoints(bones, poseFromDirections(bones, base));
    expect(j.get("cabeza")!.head.z).toBeGreaterThan(j0.get("cabeza")!.head.z + 0.05);
    const side = posedJoints(bones, poseFromDirections(bones, occupantLean(base, 0, 0.2, 0.5)));
    expect(side.get("cabeza")!.head.x).toBeGreaterThan(j0.get("cabeza")!.head.x + 0.05);
  });
});

describe("límites articulares", () => {
  const down = new Vector3(0, -1, 0);
  it("balanceo y torsión recomponen la rotación", () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0.3, 0.2).normalize(), 0.9);
    const { swing, twist } = swingTwist(q, down);
    const back = swing.clone().multiply(new Quaternion().setFromAxisAngle(down, twist));
    expect(Math.abs(back.dot(q))).toBeCloseTo(1, 9);
  });

  it("la rodilla no se dobla al frente ni más allá de 135°", () => {
    const fwd = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.6); // espinilla al frente
    expect(clampRelative(fwd, down, "pierna")).not.toBeNull();
    const ok = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1.2); // flexión de ~69°
    expect(clampRelative(ok, down, "pierna")).toBeNull();
    const deep = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (170 * Math.PI) / 180);
    const c = clampRelative(deep, down, "pierna")!;
    const d = down.clone().applyQuaternion(c);
    const flex = (Math.atan2(-d.z, -d.y) * 180) / Math.PI;
    expect(flex).toBeCloseTo(JOINT_LIMITS.pierna!.flex[1], 3);
  });

  it("el tronco hacia arriba no salta en ±180°", () => {
    const up = new Vector3(0, 1, 0);
    const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.3); // 17° al frente
    expect(clampRelative(lean, up, "abdomen")).toBeNull();
    const far = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1.2);
    expect(clampRelative(far, up, "abdomen")).not.toBeNull();
  });
});

describe("personas en las escenas", () => {
  it("asientos dentro del vehículo y zonas de contacto del lado correcto", async () => {
    const r = await loadResultado("frontal_curva");
    const v = r.vehiculos.find((x) => x.id === "veh-b")!;
    const drv = seatPlacement("conductor", v);
    const cop = seatPlacement("copiloto", v);
    expect(drv.hip.z).toBeLessThan(0); // izquierda = −z local
    expect(cop.hip.z).toBeGreaterThan(0);
    expect(Math.abs(drv.hip.x)).toBeLessThan(v.dimensiones.largo_m / 2);
    const door = contactZonePosition(
      "puerta y ventana del lado izquierdo",
      drv.hip,
      v.dimensiones.ancho_m,
    );
    expect(door.z).toBeLessThan(drv.hip.z);
  });

  it("los objetos del solver se vuelven colisionadores", async () => {
    const r = await loadResultado("peaton_cruce");
    const st = staticColliders(r);
    expect(st).toHaveLength(1);
    expect(st[0]!.kind).toBe("caja");
    expect(st[0]!.size[1]).toBeCloseTo(1.6, 6);
  });

  it("peatón: ragdoll calibrado dentro de la banda de Searle y ocupante en su asiento", async () => {
    const spec = loadFixture("peaton_cruce");
    const r = await loadResultado("peaton_cruce");
    const graph = buildSceneGraph(spec, r, opts);
    const att = await attachPeople(spec, r, graph, await templates(variantsFor(spec)));
    expect(att.ragdolls).toHaveLength(1);
    const rep = att.ragdolls[0]!;
    expect(rep.kind).toBe("peaton");
    expect(rep.inBand).toBe(true);
    expect(rep.distance).toBeGreaterThanOrEqual(rep.band[0]);
    expect(rep.distance).toBeLessThanOrEqual(rep.band[1]);
    expect(att.markers).toBeGreaterThanOrEqual(2);
    // El cuerpo del peatón se mueve con el tiempo y queda en el piso al final.
    graph.update(r.t_fin);
    const body = graph.root.getObjectByName("cuerpo_per-peaton")!;
    const hips = body.getObjectByName("cadera")!;
    const w = new Vector3();
    hips.getWorldPosition(w);
    expect(w.y).toBeLessThan(0.4);
    // El conductor va dentro de su vehículo.
    const driver = graph.root.getObjectByName("cuerpo_per-a1")!;
    expect(driver.parent?.name).toContain("veh-a");
  }, 120_000);

  it("motociclista: el jinete sale proyectado dentro de la banda y es reproducible", async () => {
    const spec = loadFixture("motociclista");
    const r = await loadResultado("motociclista");
    const run = async () => {
      const graph = buildSceneGraph(spec, r, opts);
      return attachPeople(spec, r, graph, await templates(variantsFor(spec)));
    };
    const a = await run();
    const b = await run();
    expect(a.ragdolls).toHaveLength(1);
    expect(a.ragdolls[0]!.kind).toBe("jinete");
    expect(a.ragdolls[0]!.inBand).toBe(true);
    expect(b.ragdolls[0]!.distance).toBe(a.ragdolls[0]!.distance);
  }, 120_000);
});

describe("volcadura ilustrativa", () => {
  it("la SUV de `volcadura` da vueltas sobre su eje longitudinal y queda en reposo", async () => {
    const { attachRollovers, minimumRollRate, bakeRollover } = await import("./rollover-scene");
    const r = await loadResultado("volcadura");
    const v = r.vehiculos.find((x) => x.id === "veh-a")!;
    expect(v.volcadura?.inicia).toBe(false);
    const b = (await bakeRollover(r, "veh-a"))!;
    expect(b.fromCriterion).toBe(false);
    expect(b.rollRate).toBeCloseTo(
      1.25 * minimumRollRate(v.volcadura!, v.dimensiones.ancho_m, v.dimensiones.alto_m),
      9,
    );
    expect(b.maxTiltDeg).toBeGreaterThan(90); // queda de lado o volteada
    const again = (await bakeRollover(r, "veh-a"))!;
    expect(Array.from(again.frames)).toEqual(Array.from(b.frames));
    const graph = buildSceneGraph(loadFixture("volcadura"), r, opts);
    await attachRollovers(r, graph);
    const node = graph.vehicles.find((n) => n.id === "veh-a")!;
    graph.update(0.6);
    const up = new Vector3(0, 1, 0).applyQuaternion(node.group.quaternion);
    expect(up.y).toBeLessThan(0.95); // ya va girando
    graph.update(-1);
    expect(new Vector3(0, 1, 0).applyQuaternion(node.group.quaternion).y).toBeCloseTo(1, 6);
    // Sin volcadura declarada ni criterio cumplido no hay horneado.
    const r2 = await loadResultado("alcance");
    expect(await bakeRollover(r2, r2.vehiculos[0]!.id)).toBeNull();
  }, 120_000);
});
