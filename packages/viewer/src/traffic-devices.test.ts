import { loadFixture, loadResultado } from "@croquis/scene-schema";
import { Group, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { QUALITY_PROFILES } from "./quality";
import { buildSceneGraph } from "./scene-graph";
import { buildDevice } from "./traffic-devices";

const METAL = new MeshStandardMaterial();

function named(root: Object3D, prefix: string): Object3D[] {
  const out: Object3D[] = [];
  root.traverse((o) => {
    if (o.name.startsWith(prefix)) out.push(o);
  });
  return out;
}

describe("dispositivos de tránsito (F8c)", () => {
  it("cada señal del contrato tiene su placa", () => {
    for (const tipo of [
      "alto",
      "ceda_el_paso",
      "limite_velocidad",
      "no_vuelta",
      "un_sentido",
      "otro",
    ]) {
      const d = buildDevice({ tipo, limiteKmh: 60 }, METAL);
      expect(named(d.group, `placa_${tipo}`)).toHaveLength(1);
      d.update(0);
      expect(d.lit()).toEqual([]);
    }
    const tope = buildDevice({ tipo: "tope", anchoTopeM: 7 }, METAL);
    const bump = named(tope.group, "tope")[0] as Mesh;
    bump.geometry.computeBoundingBox();
    expect(bump.geometry.boundingBox!.max.z - bump.geometry.boundingBox!.min.z).toBeCloseTo(7, 9);
  });

  it("una cabeza por fase, que enciende la lámpara de su fase en el tiempo", () => {
    const d = buildDevice(
      {
        tipo: "semaforo",
        fases: [
          { phase: { color: "amarillo", tiempoEnFaseS: 1 }, yaw: 0 },
          { phase: { color: "verde" }, yaw: Math.PI / 2 },
        ],
      },
      METAL,
    );
    const heads = named(d.group, "cabeza_semaforo") as Group[];
    expect(heads).toHaveLength(2);
    expect(heads[1]!.rotation.y).toBeCloseTo(Math.PI / 2, 12);
    d.update(-2);
    expect(d.lit()).toEqual(["verde", "verde"]);
    d.update(0);
    expect(d.lit()).toEqual(["amarillo", "verde"]);
    const amber = (named(heads[0]!, "lampara_amarillo")[0] as Mesh)
      .material as MeshStandardMaterial;
    const red = (named(heads[0]!, "lampara_rojo")[0] as Mesh).material as MeshStandardMaterial;
    expect(amber.emissiveIntensity).toBeGreaterThan(0);
    expect(red.emissiveIntensity).toBe(0);
    d.update(2.5);
    expect(d.lit()).toEqual(["rojo", "verde"]);
    expect(red.emissiveIntensity).toBeGreaterThan(0);
  });

  it("semáforo peatonal: dos figuras por cabeza; la de su fase se enciende", () => {
    const d = buildDevice(
      {
        tipo: "semaforo_peatonal",
        fases: [
          { phase: { color: "verde" }, yaw: 0 },
          { phase: { color: "rojo" }, yaw: Math.PI },
        ],
      },
      METAL,
    );
    const heads = named(d.group, "cabeza_semaforo_peatonal") as Group[];
    expect(heads).toHaveLength(2);
    expect(named(heads[0]!, "lampara_peatonal_")).toHaveLength(2);
    d.update(0);
    expect(d.lit()).toEqual(["camina", "detenido"]);
    const camina = (named(heads[0]!, "lampara_peatonal_camina")[0] as Mesh)
      .material as MeshStandardMaterial;
    const detenido = (named(heads[0]!, "lampara_peatonal_detenido")[0] as Mesh)
      .material as MeshStandardMaterial;
    expect(camina.emissiveIntensity).toBeGreaterThan(0);
    expect(detenido.emissiveIntensity).toBe(0);
  });

  it("en la escena, la cabeza peatonal mira a la persona de su fase", async () => {
    const spec = structuredClone(loadFixture("peaton_cruce"));
    const r = await loadResultado("peaton_cruce");
    const persona = r.personas.find((p) => (p.trayectoria?.x.length ?? 0) > 0)!;
    const px = persona.trayectoria.x[0]!;
    const py = persona.trayectoria.y[0]!;
    spec.lugar.dispositivos = [
      ...(spec.lugar.dispositivos ?? []),
      {
        id: "sp-1",
        tipo: "semaforo_peatonal",
        posicion: { x: px + 6, y: py },
        orientacion_deg: 0,
        fases: [{ movimiento: persona.id, color: "verde" }],
        procedencia: { fuente: "usuario", confianza: 1 },
      },
    ];
    const sg = buildSceneGraph(spec, r, {
      quality: QUALITY_PROFILES.baja,
      env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
    });
    const head = named(sg.root, "cabeza_semaforo_peatonal")[0]!;
    // La persona está a −x del poste: la cabeza (que mira a +x local) gira 180°.
    expect(Math.abs(Math.cos(head.rotation.y) + 1)).toBeLessThan(1e-9);
    sg.update(0);
    sg.dispose();
  });

  it("sin fases el semáforo queda apagado", () => {
    const d = buildDevice({ tipo: "semaforo" }, METAL);
    d.update(0);
    expect(d.lit()).toEqual([null]);
  });

  it("en la escena, cada cabeza mira al vehículo que regula", async () => {
    const spec = loadFixture("lateral_interseccion");
    const r = await loadResultado("lateral_interseccion");
    const sg = buildSceneGraph(spec, r, {
      quality: QUALITY_PROFILES.media,
      env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
    });
    sg.update(0);
    for (const d of spec.lugar.dispositivos ?? []) {
      if (d.tipo !== "semaforo") continue;
      const g = sg.root.getObjectByName(`dispositivo_${d.id}`)!;
      const head = named(g, "cabeza_semaforo")[0]!;
      const vid = d.fases![0]!.movimiento;
      const v = r.vehiculos.find((x) => x.id === vid)!;
      const want = Math.atan2(
        v.trayectoria.y[0]! - d.posicion.y,
        v.trayectoria.x[0]! - d.posicion.x,
      );
      const got = g.rotation.y + head.rotation.y;
      expect(Math.cos(got - want)).toBeCloseTo(1, 9);
      const lens = named(
        head,
        `lampara_${d.fases![0]!.color === "verde" ? "verde" : "rojo"}`,
      )[0] as Mesh;
      expect((lens.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
    }
    sg.dispose();
  });
});
