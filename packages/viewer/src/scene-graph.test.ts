import { FIXTURE_NAMES, loadFixture, loadResultado, longitudM } from "@croquis/scene-schema";
import { InstancedMesh, Matrix4, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { fromThree } from "./coords";
import { QUALITY_PROFILES } from "./quality";
import { samplePerson, sampleVehicle } from "./sample";
import { buildSceneGraph, hash01 } from "./scene-graph";

const opts = {
  quality: QUALITY_PROFILES.media,
  env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
};

/** Presupuesto de triángulos para la calidad media (holgado; E6 mide fps reales). */
const TRIANGLE_BUDGET = 250_000;

describe("grafo de escena", () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: coloca cada vehículo donde lo dejó el solver y respeta el presupuesto`, async () => {
      const spec = loadFixture(name);
      const r = await loadResultado(name);
      const sg = buildSceneGraph(spec, r, opts);
      for (const t of [r.t_inicio, -0.5, 0, 0.37, r.t_fin]) {
        sg.update(t);
        for (const n of sg.vehicles) {
          const v = r.vehiculos.find((x) => x.id === n.id);
          expect(v).toBeDefined();
          if (!v) continue;
          const p = sampleVehicle(v.trayectoria, t);
          const w = fromThree([n.group.position.x, n.group.position.y, n.group.position.z]);
          expect(w.x).toBeCloseTo(p.x, 6);
          expect(w.y).toBeCloseTo(p.y, 6);
          expect(n.group.rotation.y).toBeCloseTo(p.yaw, 9);
        }
      }
      expect(sg.vehicles).toHaveLength(spec.vehiculos.length);
      expect(sg.stats.triangles).toBeLessThan(TRIANGLE_BUDGET);
      sg.dispose();
    });
  }

  it("las llantas giran según la distancia recorrida", async () => {
    const r = await loadResultado("alcance");
    const sg = buildSceneGraph(loadFixture("alcance"), r, opts);
    const a = sg.vehicles.find((v) => v.id === "veh-a");
    expect(a).toBeDefined();
    if (!a) return;
    const wheel = a.wheels[0];
    expect(wheel).toBeDefined();
    if (!wheel) return;
    sg.update(-2);
    const r0 = wheel.obj.rotation.z;
    sg.update(-1);
    const r1 = wheel.obj.rotation.z;
    const p0 = sampleVehicle(a.track, -2);
    const p1 = sampleVehicle(a.track, -1);
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    expect(r0 - r1).toBeCloseTo(dist / wheel.radius, 3);
  });

  it("el peatón camina, sale proyectado y queda tendido donde dice el solver", async () => {
    const spec = loadFixture("peaton_cruce");
    const r = await loadResultado("peaton_cruce");
    const sg = buildSceneGraph(spec, r, opts);
    const data = r.personas.find((p) => p.proyeccion);
    expect(data).toBeDefined();
    if (!data) return;
    const node = sg.persons.find((p) => p.id === data.id);
    expect(node?.mode).toBe("trayectoria");
    if (!node) return;
    const body = node.group.getObjectByName("cuerpo");
    sg.update(-1);
    expect(body?.rotation.z ?? NaN).toBeCloseTo(0, 9);
    sg.update(r.t_fin);
    expect(body?.rotation.z ?? NaN).toBeCloseTo(Math.PI / 2, 9);
    const end = samplePerson(data.trayectoria, r.t_fin);
    const w = fromThree([node.group.position.x, node.group.position.y, node.group.position.z]);
    expect(w.x).toBeCloseTo(end?.x ?? NaN, 6);
    expect(w.height).toBeCloseTo(end?.z ?? NaN, 6);
    expect(w.x).toBeCloseTo(data.proyeccion?.posicion_reposo.x ?? NaN, 4);
  });

  it("sin cuerpos cargados: ocupantes de autos ocultos y el jinete sigue su trayectoria", async () => {
    const r = await loadResultado("motociclista");
    const sg = buildSceneGraph(loadFixture("motociclista"), r, opts);
    const moto = r.vehiculos.find((v) => v.clase === "motocicleta");
    expect(moto).toBeDefined();
    for (const n of sg.persons) {
      const data = r.personas.find((p) => p.id === n.id)!;
      if (n.vehicleId === moto?.id) {
        // El jinete sale proyectado: tiene trayectoria propia y va montado hasta el impacto.
        expect(data.proyeccion).toBeDefined();
        expect(n.mode).toBe("trayectoria");
        expect(n.group.visible).toBe(true);
        sg.update(-1);
        const mp = sampleVehicle(moto?.trayectoria ?? r.vehiculos[0]!.trayectoria, -1);
        const w = fromThree([n.group.position.x, n.group.position.y, n.group.position.z]);
        expect(Math.hypot(w.x - mp.x, w.y - mp.y)).toBeLessThan(1e-6);
        expect(w.height).toBeGreaterThan(0.5);
      } else if (n.vehicleId) {
        expect(n.mode).toBe("a_bordo_oculto");
        expect(n.group.visible).toBe(false);
      }
    }
  });

  it("el árbol tiene el diámetro de tronco declarado y su forma es determinista", async () => {
    const spec = loadFixture("objeto_fijo_arbol");
    const r = await loadResultado("objeto_fijo_arbol");
    const a = buildSceneGraph(spec, r, opts);
    const b = buildSceneGraph(spec, r, opts);
    const tree = spec.entorno.objetos?.find((o) => o.tipo === "arbol");
    expect(tree?.diametro_tronco).toBeDefined();
    if (!tree?.diametro_tronco) return;
    const trunk = a.root.getObjectByName(`objeto_${tree.id}`)?.getObjectByName("tronco");
    expect(trunk).toBeInstanceOf(Mesh);
    expect(trunk?.userData.radius).toBeCloseTo(longitudM(tree.diametro_tronco) / 2, 9);
    const crownA = a.root.getObjectByName(`objeto_${tree.id}`)?.getObjectByName("copa");
    const crownB = b.root.getObjectByName(`objeto_${tree.id}`)?.getObjectByName("copa");
    expect(crownA?.getWorldPosition(new Vector3())).toEqual(
      crownB?.getWorldPosition(new Vector3()),
    );
    expect(hash01("a")).not.toBe(hash01("b"));
    expect(hash01("x")).toBeGreaterThanOrEqual(0);
    expect(hash01("x")).toBeLessThan(1);
  });

  it("marca el punto de impacto y pinta cada vehículo con su color", async () => {
    const spec = loadFixture("lateral_interseccion");
    const r = await loadResultado("lateral_interseccion");
    const sg = buildSceneGraph(spec, r, opts);
    const ring = sg.root.getObjectByName("punto_impacto");
    expect(ring).toBeDefined();
    const w = fromThree([ring!.position.x, ring!.position.y, ring!.position.z]);
    expect(w.x).toBeCloseTo(r.punto_impacto?.x ?? NaN, 6);
    for (const v of spec.vehiculos) {
      const body = sg.root.getObjectByName(`vehiculo_${v.id}`)?.getObjectByName("body");
      expect(body).toBeInstanceOf(Mesh);
      const color = ((body as Mesh).material as unknown as { color: { getHexString(): string } })
        .color;
      expect(`#${color.getHexString()}`).toBe(v.color.hex.toLowerCase());
    }
  });
});

describe("árboles instanciados (F8c)", () => {
  it("los árboles que no participan en un evento van en dos mallas instanciadas", async () => {
    const spec = structuredClone(loadFixture("lateral_interseccion"));
    const r = await loadResultado("lateral_interseccion");
    const n = 40;
    spec.entorno.objetos = [
      ...(spec.entorno.objetos ?? []),
      ...Array.from({ length: n }, (_, i) => ({
        id: `arbol-decor-${i}`,
        tipo: "arbol" as const,
        posicion: { x: -60 + 3 * i, y: 25 },
        procedencia: { fuente: "supuesto" as const, confianza: 0.3 },
      })),
    ];
    const sg = buildSceneGraph(spec, r, opts);
    const trunks = sg.root.getObjectByName("troncos") as InstancedMesh;
    const crowns = sg.root.getObjectByName("copas") as InstancedMesh;
    expect(trunks.count).toBe(n);
    expect(crowns.count).toBe(n);
    // Cada instancia en su lugar y con el alto determinista de su hash.
    const m = new Matrix4();
    trunks.getMatrixAt(5, m);
    const p = new Vector3().setFromMatrixPosition(m);
    expect(p.x).toBeCloseTo(-60 + 15, 6);
    expect(p.z).toBeCloseTo(-25, 6);
    // El conteo de triángulos incluye todas las instancias.
    const base = buildSceneGraph(loadFixture("lateral_interseccion"), r, opts);
    expect(sg.stats.triangles - base.stats.triangles).toBeGreaterThan(n * 100);
    sg.dispose();
    base.dispose();
  });
});
