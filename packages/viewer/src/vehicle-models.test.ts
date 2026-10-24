import { loadFixture, loadResultado } from "@croquis/scene-schema";
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import { QUALITY_PROFILES } from "./quality";
import { buildSceneGraph } from "./scene-graph";
import {
  buildModelVehicle,
  MODEL_FOR_CLASS,
  modelClassesFor,
  modelVariantFor,
  windshieldUv,
  type ModelClass,
  type VehicleModelEntry,
  type VehicleModelTemplate,
} from "./vehicle-models";

/**
 * Un modelo con la estructura que deja `assets/pipeline/blender/preparar_vehiculo.py`: piezas con
 * su papel en `userData.role`, frente hacia +x, izquierda hacia −z, ruedas `wheel_*` con su radio.
 */
function plantilla(
  clase: ModelClass,
  largo = 4,
  ancho = 1.8,
  alto = 1.5,
  r = 0.3,
): VehicleModelTemplate {
  const scene = new Group();
  const pieza = (nombre: string, role: string, geo: BoxGeometry, x: number, y: number, z = 0) => {
    const m = new Mesh(geo, new MeshStandardMaterial({ name: `${nombre}_mat`, color: "#808080" }));
    m.name = nombre;
    m.userData.role = role;
    m.position.set(x, y, z);
    scene.add(m);
  };
  pieza(
    "carroceria",
    "pintura",
    new BoxGeometry(largo, alto - 0.3, ancho),
    0,
    0.3 + (alto - 0.3) / 2,
  );
  pieza("bumper_front", "pintura", new BoxGeometry(0.2, 0.4, ancho), largo / 2 - 0.1, 0.45);
  pieza("windshield", "vidrio", new BoxGeometry(0.05, 0.5, ancho * 0.8), 0.9, alto - 0.35);
  // Los faros, dentro del largo (el manifiesto mide todas las piezas).
  pieza("headlight_l", "faro", new BoxGeometry(0.05, 0.12, 0.3), largo / 2 - 0.025, 0.7, -0.6);
  pieza("headlight_r", "faro", new BoxGeometry(0.05, 0.12, 0.3), largo / 2 - 0.025, 0.7, 0.6);
  pieza("interior", "plastico", new BoxGeometry(2, 0.6, 1.5), 0, 0.9);
  for (const [nombre, x, z] of [
    ["wheel_fl", 1.3, -0.75],
    ["wheel_fr", 1.3, 0.75],
    ["wheel_rl", -1.3, -0.75],
    ["wheel_rr", -1.3, 0.75],
  ] as const) {
    const w = new Object3D();
    w.name = nombre;
    w.userData.radius = r;
    w.position.set(x, r, z);
    const llanta = new Mesh(
      new CylinderGeometry(r, r, 0.2, 16).rotateX(Math.PI / 2),
      new MeshStandardMaterial({ name: "llanta_mat" }),
    );
    llanta.userData.role = "rueda";
    w.add(llanta);
    scene.add(w);
  }
  const entry: VehicleModelEntry = {
    modelo: { nombre: "Prueba", autor: "Autor", usuario: "autor", licencia: "CC-BY 4.0", url: "" },
    archivos: {
      alta: { archivo: `${clase}.glb`, sha256: "", bytes: 0 },
      ligero: { archivo: `${clase}-ligero.glb`, sha256: "", bytes: 0 },
      blender: { archivo: `${clase}-blender.glb`, sha256: "", bytes: 0 },
    },
    largo_m: largo,
    ancho_m: ancho,
    alto_m: alto,
    caras: 0,
    ruedas: [],
    quitados: [],
  };
  return { clase, entry, scene };
}

const opts = (vehicleModels?: Map<ModelClass, VehicleModelTemplate>) => ({
  quality: QUALITY_PROFILES.alta,
  env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
  vehicleModels,
});

describe("vehículos de Sketchfab (R10)", () => {
  it("cada calidad pide su versión: completa en alta y ultra, ligera en media, ninguna en baja", () => {
    expect(modelVariantFor("ultra")).toBe("alta");
    expect(modelVariantFor("alta")).toBe("alta");
    expect(modelVariantFor("media")).toBe("ligero");
    expect(modelVariantFor("baja")).toBeNull();
    expect(MODEL_FOR_CLASS.sedan_mediano).toBe("sedan");
    expect(MODEL_FOR_CLASS.van).toBeUndefined();
    expect(modelClassesFor(["sedan_compacto", "sedan_mediano", "van", "motocicleta"])).toEqual([
      "sedan",
      "moto",
    ]);
  });

  it("se ajusta a las dimensiones del caso, con las ruedas redondas sobre el piso", () => {
    const dims = { length: 4.4, width: 1.7, height: 1.45, wheelbase: 2.6 };
    const g = buildModelVehicle(plantilla("sedan"), "sedan_compacto", dims);
    g.updateMatrixWorld(true);
    const caja = {
      min: new Vector3(Infinity, Infinity, Infinity),
      max: new Vector3(-Infinity, -Infinity, -Infinity),
    };
    for (const c of g.children) {
      if (!(c instanceof Mesh)) continue;
      const geo = (c as Mesh).geometry;
      geo.computeBoundingBox();
      const b = geo.boundingBox!.clone().applyMatrix4(c.matrixWorld);
      caja.min.min(b.min);
      caja.max.max(b.max);
    }
    expect(caja.max.x - caja.min.x).toBeCloseTo(4.4, 5);
    expect(caja.max.z - caja.min.z).toBeCloseTo(1.7, 5);
    // Las piezas son hijas directas (el daño deforma las hijas del grupo) con pivote en su centro.
    const faroL = g.getObjectByName("headlight_l")!;
    const faroR = g.getObjectByName("headlight_r")!;
    expect(faroL.parent).toBe(g);
    expect(faroL.position.z).toBeLessThan(0);
    expect(faroR.position.z).toBeGreaterThan(0);
    expect(faroL.position.x).toBeCloseTo((2 - 0.025) * (4.4 / 4), 5);
    // Ruedas: grupos con su radio escalado por el alto, tocando el piso.
    const r = 0.3 * (1.45 / 1.5);
    for (const n of ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"]) {
      const w = g.getObjectByName(n) as Group;
      expect(w).toBeInstanceOf(Group);
      expect(w.userData.radius).toBeCloseTo(r, 6);
      expect(w.position.y).toBeCloseTo(r, 6);
    }
    expect((g.getObjectByName("wheel_fl") as Group).position.z).toBeLessThan(0);
    // Las cotas del habitáculo del paramétrico, para las bolsas de aire.
    expect(g.userData.layout).toBeDefined();
    expect(g.userData.modelo).toBe("sedan");
  });

  it("en la escena: la pintura toma el color del caso y lo demás conserva el material del modelo", async () => {
    const spec = loadFixture("alcance");
    const r = await loadResultado("alcance");
    const modelos = new Map<ModelClass, VehicleModelTemplate>([
      ["sedan", plantilla("sedan", 4.3, 1.75, 1.45)],
      ["suv", plantilla("suv", 4.5, 1.85, 1.7)],
    ]);
    const sg = buildSceneGraph(spec, r, opts(modelos));
    for (const v of r.vehiculos) {
      const g = sg.root.getObjectByName(`vehiculo_${v.id}`) as Group;
      expect(g.userData.modelo).toBe(MODEL_FOR_CLASS[v.clase]);
      const interior = g.getObjectByName("interior") as Mesh;
      expect((interior.material as MeshStandardMaterial).name).toBe("interior_mat");
      const carroceria = g.getObjectByName("carroceria") as Mesh;
      expect(carroceria.material).not.toBe(interior.material);
    }
    // El vehículo con daño: la carrocería se subdividió y lleva la deformación como morph target.
    const golpeado = r.vehiculos.find((v) => Math.max(...v.dano.perfil_m) > 0.05)!;
    const g = sg.root.getObjectByName(`vehiculo_${golpeado.id}`) as Group;
    const pintadas = g.children.filter(
      (c): c is Mesh => c instanceof Mesh && c.userData.role === "pintura",
    );
    expect(pintadas.some((m) => (m.geometry.morphAttributes.position?.length ?? 0) > 0)).toBe(true);
    expect(pintadas.every((m) => m.geometry.getAttribute("position").count > 24)).toBe(true);
    sg.dispose();
  });

  it("sin modelos, los vehículos siguen siendo paramétricos", async () => {
    const spec = loadFixture("alcance");
    const r = await loadResultado("alcance");
    const sg = buildSceneGraph(spec, r, opts());
    const g = sg.root.getObjectByName(`vehiculo_${r.vehiculos[0]!.id}`) as Group;
    expect(g.userData.modelo).toBeUndefined();
    // La pieza fusionada del paramétrico (vehicle-geometry.ts).
    expect(g.getObjectByName("fusion_pintura")).toBeInstanceOf(Mesh);
    sg.dispose();
  });

  it("el parabrisas de un modelo recibe coordenadas planas para dibujar la grieta", () => {
    const geo = new BoxGeometry(0.05, 0.5, 1.4);
    windshieldUv(geo);
    const uv = geo.getAttribute("uv");
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      min = Math.min(min, uv.getX(i), uv.getY(i));
      max = Math.max(max, uv.getX(i), uv.getY(i));
    }
    expect(min).toBeCloseTo(0, 6);
    expect(max).toBeCloseTo(1, 6);
  });
});
