/**
 * Plan y montaje de los restos en la escena: decide qué se desprende (regla ilustrativa, ADR 0007),
 * hornea la simulación con Rapier (`debris.ts`) y agrega piezas, vidrios y restos plásticos al grafo
 * de escena con su actualización por tiempo.
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import { toThree } from "./coords";
import { crushAt } from "./damage";
import { HEADLIGHT_BREAK_M } from "./damage-rig";
import {
  bakeDebris,
  debrisPoseAt,
  mulberry32,
  type DebrisBake,
  type DebrisSpec,
  type KinematicBox,
  type StaticCollider,
} from "./debris";
import { staticColliders } from "./people-scene";
import { sampleVehicle } from "./sample";
import type { SceneGraph } from "./scene-graph";
import type { CarLayout } from "./vehicle-geometry";

/** Defensas: se desprenden con este aplastamiento máximo (m, ilustrativo). */
export const BUMPER_DETACH_M = 0.2;
/** Espejo del lado golpeado (impacto lateral) o por frente desplazado. */
export const MIRROR_SIDE_DETACH_M = 0.08;
export const MIRROR_FRONT_DETACH_M = 0.25;
/** Vidrios laterales estallan con este aplastamiento en impacto lateral al habitáculo. */
export const SIDE_GLASS_BREAK_M = 0.12;
export const DEBRIS_T0 = 0.03;

const Y = new Vector3(0, 1, 0);

export interface DebrisPlan {
  bodies: DebrisSpec[];
  vehicles: KinematicBox[];
  statics: StaticCollider[];
}

export function planDebris(spec: EscenaSpec, resultado: Resultado, graph: SceneGraph): DebrisPlan {
  const rng = mulberry32(Math.trunc(spec.meta.semilla) * 7919 + 17);
  const rnd = (a: number, b: number): number => a + (b - a) * rng();
  const bodies: DebrisSpec[] = [];
  const t = 0.02;
  const byId = new Map(resultado.vehiculos.map((v) => [v.id, v]));

  for (const node of graph.vehicles) {
    const v = byId.get(node.id);
    const input = node.rig.damage ? node.rig.damage.field : null;
    if (!v || !node.rig.damage || !input) continue;
    const dmg = node.rig.damage;
    const lado = v.dano.cdc?.lado ?? "F";
    const p = sampleVehicle(v.trayectoria, t);
    const pos = new Vector3(...toThree(p.x, p.y, 0));
    const vlin = new Vector3(p.vx, 0, -p.vy);
    const omega = new Vector3(0, p.yawRate, 0);
    const toWorld = (local: Vector3): Vector3 => local.clone().applyAxisAngle(Y, p.yaw).add(pos);
    const velAt = (world: Vector3): Vector3 =>
      vlin.clone().add(omega.clone().cross(world.clone().sub(pos)));
    const outward = dmg.field.frame.outward.clone().applyAxisAngle(Y, p.yaw);
    const profile = {
      perfil: v.dano.perfil_m,
      ancho: v.dano.ancho_m,
      centro: v.dano.centro_m,
    };
    const crushAtMesh = (m: { position: Vector3 }): number =>
      crushAt(profile, m.position.dot(dmg.field.frame.along));
    const detach = (name: string): void => {
      const m = node.group.getObjectByName(name);
      if (!(m instanceof Mesh)) return;
      const g = m.geometry as BoxGeometry;
      const prm = g.parameters;
      const world = toWorld(m.position);
      bodies.push({
        kind: "pieza",
        half: [prm.width / 2, prm.height / 2, prm.depth / 2],
        position: world,
        quaternion: new Quaternion().setFromAxisAngle(Y, p.yaw),
        linvel: velAt(world)
          .addScaledVector(outward, rnd(1, 2.5))
          .add(new Vector3(rnd(-0.8, 0.8), rnd(1, 2), rnd(-0.8, 0.8))),
        angvel: new Vector3(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4)),
        t0: DEBRIS_T0,
        part: { vehicleId: node.id, name },
      });
    };
    const maxCrush = Math.max(...v.dano.perfil_m);
    if (lado === "F" && maxCrush >= BUMPER_DETACH_M) detach("bumper_front");
    if (lado === "B" && maxCrush >= BUMPER_DETACH_M) detach("bumper_rear");
    for (const name of ["mirror_l", "mirror_r"]) {
      const m = node.group.getObjectByName(name);
      if (!(m instanceof Mesh)) continue;
      const sideHit =
        (lado === "L" && name === "mirror_l") || (lado === "R" && name === "mirror_r");
      const c = crushAtMesh(m);
      if (
        (sideHit && c >= MIRROR_SIDE_DETACH_M) ||
        ((lado === "F" || lado === "B") && c >= MIRROR_FRONT_DETACH_M)
      ) {
        detach(name);
      }
    }
    // Vidrios laterales.
    const layout = node.group.userData.layout as CarLayout | undefined;
    if (layout && (lado === "L" || lado === "R") && maxCrush >= SIDE_GLASS_BREAK_M) {
      const side = lado === "L" ? -1 : 1;
      for (let k = 0; k < 90; k++) {
        const local = new Vector3(
          rnd(layout.rwBase + 0.2, layout.wsBase - 0.2),
          rnd(layout.belt + 0.05, layout.belt + 0.45),
          side * (layout.cabinW / 2),
        );
        const world = toWorld(local);
        bodies.push({
          kind: "vidrio",
          half: [0.008, 0.008, 0.008],
          position: world,
          quaternion: new Quaternion().setFromAxisAngle(Y, rnd(0, Math.PI)),
          linvel: velAt(world)
            .addScaledVector(outward, rnd(-1.2, 1.5))
            .add(new Vector3(rnd(-0.6, 0.6), rnd(0.3, 1.5), rnd(-0.6, 0.6))),
          angvel: new Vector3(rnd(-10, 10), rnd(-10, 10), rnd(-10, 10)),
          t0: DEBRIS_T0,
        });
      }
    }
    // Astillas de faros rotos.
    if (lado === "F") {
      for (const name of ["headlight_l", "headlight_r"]) {
        const m = node.group.getObjectByName(name);
        if (!(m instanceof Mesh) || crushAtMesh(m) < HEADLIGHT_BREAK_M) continue;
        for (let k = 0; k < 15; k++) {
          const world = toWorld(
            m.position.clone().add(new Vector3(0, rnd(-0.05, 0.05), rnd(-0.12, 0.12))),
          );
          bodies.push({
            kind: "vidrio",
            half: [0.01, 0.006, 0.01],
            position: world,
            quaternion: new Quaternion().setFromAxisAngle(Y, rnd(0, Math.PI)),
            linvel: velAt(world)
              .addScaledVector(outward, rnd(0.5, 2))
              .add(new Vector3(rnd(-0.8, 0.8), rnd(0.5, 1.5), rnd(-0.8, 0.8))),
            angvel: new Vector3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)),
            t0: DEBRIS_T0,
          });
        }
      }
    }
  }

  // Restos plásticos en el punto de impacto.
  const ev = resultado.eventos.find((e) => e.tipo.startsWith("impacto_"));
  if (resultado.punto_impacto && ev && ev.tipo !== "impacto_vehiculo_persona") {
    const actors = resultado.vehiculos.filter((v) => ev.actores.includes(v.id));
    const mean = new Vector3();
    for (const v of actors) {
      const s = sampleVehicle(v.trayectoria, t);
      mean.add(new Vector3(s.vx, 0, -s.vy));
    }
    if (actors.length) mean.divideScalar(actors.length);
    const n = ev.tipo === "impacto_vehiculo_vehiculo" ? 30 : 15;
    for (let k = 0; k < n; k++) {
      const a = rnd(0, 2 * Math.PI);
      const sp = rnd(1, 3.5);
      const world = new Vector3(
        ...toThree(resultado.punto_impacto.x, resultado.punto_impacto.y, rnd(0.35, 0.75)),
      );
      bodies.push({
        kind: "plastico",
        half: [rnd(0.01, 0.035), rnd(0.004, 0.012), rnd(0.01, 0.03)],
        position: world,
        quaternion: new Quaternion().setFromAxisAngle(Y, rnd(0, Math.PI)),
        linvel: mean
          .clone()
          .multiplyScalar(0.6)
          .add(new Vector3(Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp)),
        angvel: new Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)),
        t0: DEBRIS_T0,
      });
    }
  }

  const vehicles: KinematicBox[] = resultado.vehiculos.map((v) => ({
    half: [v.dimensiones.largo_m / 2, v.dimensiones.alto_m / 2, v.dimensiones.ancho_m / 2],
    poseAt(time: number) {
      const s = sampleVehicle(v.trayectoria, time);
      return { position: new Vector3(...toThree(s.x, s.y, v.dimensiones.alto_m / 2)), yaw: s.yaw };
    },
  }));
  const statics: StaticCollider[] = staticColliders(resultado);
  return { bodies, vehicles, statics };
}

export interface DebrisAttachment {
  bake: DebrisBake;
  counts: Record<"pieza" | "vidrio" | "plastico", number>;
}

/** Hornea los restos y los agrega al grafo (con su actualización por tiempo). */
export async function attachDebris(
  spec: EscenaSpec,
  resultado: Resultado,
  graph: SceneGraph,
): Promise<DebrisAttachment> {
  const plan = planDebris(spec, resultado, graph);
  const bake = await bakeDebris(plan.bodies, plan.vehicles, plan.statics, resultado.t_fin);
  const group = new Group();
  group.name = "restos";
  const materials: Material[] = [];
  const glassIdx: number[] = [];
  const plasticIdx: number[] = [];
  const parts: { i: number; mesh: Mesh; original: Mesh }[] = [];
  bake.bodies.forEach((b, i) => {
    if (b.kind === "vidrio") glassIdx.push(i);
    else if (b.kind === "plastico") plasticIdx.push(i);
    else if (b.part) {
      const vehicle = graph.vehicles.find((n) => n.id === b.part?.vehicleId);
      const original = vehicle?.group.getObjectByName(b.part.name);
      if (original instanceof Mesh) {
        const mesh = new Mesh(
          (original.geometry as BufferGeometry).clone(),
          original.material as Material,
        );
        mesh.name = `pieza_${b.part.vehicleId}_${b.part.name}`;
        mesh.castShadow = true;
        group.add(mesh);
        parts.push({ i, mesh, original: original as Mesh });
      }
    }
  });
  const unit = new BoxGeometry(1, 1, 1);
  const glassMat = new MeshPhysicalMaterial({
    color: "#cfe3e6",
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    opacity: 0.8,
  });
  const plasticMat = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 });
  materials.push(glassMat, plasticMat);
  const glass = new InstancedMesh(unit, glassMat, Math.max(1, glassIdx.length));
  glass.name = "vidrios";
  glass.count = glassIdx.length;
  const plastic = new InstancedMesh(unit, plasticMat, Math.max(1, plasticIdx.length));
  plastic.name = "restos_plasticos";
  plastic.count = plasticIdx.length;
  const rng = mulberry32(Math.trunc(spec.meta.semilla) + 99);
  const palette = ["#1f2124", "#2b2d30", "#3a3c40", "#8c0f0f"].map((c) => new Color(c));
  plasticIdx.forEach((_, k) =>
    plastic.setColorAt(k, palette[Math.floor(rng() * palette.length)] ?? new Color("#222")),
  );
  group.add(glass, plastic);
  graph.root.add(group);

  const m = new Matrix4();
  const pos = new Vector3();
  const quat = new Quaternion();
  const scale = new Vector3();
  const zero = new Vector3(0, 0, 0);
  const place = (inst: InstancedMesh, list: number[], t: number): void => {
    list.forEach((i, k) => {
      const b = bake.bodies[i];
      if (!b) return;
      debrisPoseAt(bake, i, t, pos, quat);
      const visible = t >= b.t0;
      m.compose(pos, quat, visible ? scale.set(b.half[0] * 2, b.half[1] * 2, b.half[2] * 2) : zero);
      inst.setMatrixAt(k, m);
    });
    inst.instanceMatrix.needsUpdate = true;
  };
  graph.addUpdater((t) => {
    place(glass, glassIdx, t);
    place(plastic, plasticIdx, t);
    for (const p of parts) {
      const b = bake.bodies[p.i];
      if (!b) continue;
      const detached = t >= b.t0;
      // Escala casi cero en lugar de ocultar: el sombreador se compila desde el inicio.
      p.original.scale.setScalar(detached ? 1e-4 : 1);
      p.mesh.scale.setScalar(detached ? 1 : 1e-4);
      debrisPoseAt(bake, p.i, t, pos, quat);
      p.mesh.position.copy(pos);
      p.mesh.quaternion.copy(quat);
    }
  });
  const counts = { pieza: parts.length, vidrio: glassIdx.length, plastico: plasticIdx.length };
  return { bake, counts };
}
