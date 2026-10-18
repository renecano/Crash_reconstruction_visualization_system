/**
 * Piezas desprendidas, vidrios y restos (PLAN §7.3.2, §7.3.3 y §7.3.6) simulados con Rapier.
 *
 * La simulación se hornea una vez al cargar la escena (paso fijo de 1/60 s, semilla explícita y la
 * compilación determinista de Rapier) y se guardan las poses de cada cuerpo en cada paso: así la
 * línea de tiempo puede ir y venir sin volver a simular, y dos cargas dan exactamente lo mismo.
 * Los vehículos son cuerpos cinemáticos que siguen la trayectoria del solver, de modo que los
 * restos chocan con ellos; el piso y los objetos fijos son cuerpos estáticos.
 *
 * Qué se desprende es una regla ilustrativa (ADR 0007): defensas con aplastamiento ≥ 0.2 m,
 * espejos del lado golpeado, vidrios laterales en impactos laterales al habitáculo, astillas de
 * faros rotos y restos plásticos en el punto de impacto.
 */
import { Quaternion, Vector3 } from "three";
import { quatFromAxisAngle, slerp } from "./dthree";

export type DebrisKind = "pieza" | "vidrio" | "plastico";

export interface DebrisSpec {
  kind: DebrisKind;
  /** Medias dimensiones de la caja de colisión (m). */
  half: [number, number, number];
  position: Vector3;
  quaternion: Quaternion;
  linvel: Vector3;
  angvel: Vector3;
  /** Instante en que aparece (s, relativo al impacto). */
  t0: number;
  /** Para piezas: nombre de la malla original en su vehículo. */
  part?: { vehicleId: string; name: string };
}

export interface KinematicBox {
  half: [number, number, number];
  /** Pose (posición de three.js y rumbo) en el instante t. */
  poseAt(t: number): { position: Vector3; yaw: number };
}

export interface StaticCollider {
  kind: "cilindro" | "caja";
  position: Vector3;
  /** Caja: medias dimensiones; cilindro: [radio, media altura, 0]. */
  size: [number, number, number];
  yaw: number;
}

export interface DebrisBake {
  dt: number;
  t0: number;
  steps: number;
  bodies: DebrisSpec[];
  /** Poses por paso y cuerpo: (x, y, z, qx, qy, qz, qw). */
  frames: Float32Array;
}

export const DEBRIS_DT = 1 / 60;
export const DEBRIS_MAX_SECONDS = 6;

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RapierModule = typeof import("@dimforge/rapier3d-deterministic-compat");
let rapierPromise: Promise<RapierModule> | null = null;

/** Carga Rapier bajo demanda (el WASM no entra en la carga inicial de la página). */
export function loadRapier(): Promise<RapierModule> {
  rapierPromise ??= import("@dimforge/rapier3d-deterministic-compat").then(async (m) => {
    const mod = (m as unknown as { default?: RapierModule }).default ?? m;
    await mod.init();
    return mod;
  });
  return rapierPromise;
}

export async function bakeDebris(
  bodies: readonly DebrisSpec[],
  vehicles: readonly KinematicBox[],
  statics: readonly StaticCollider[],
  tEnd: number,
): Promise<DebrisBake> {
  const R = await loadRapier();
  const t0 = Math.min(0, ...bodies.map((b) => b.t0));
  const duration = Math.max(0, Math.min(DEBRIS_MAX_SECONDS, tEnd - t0));
  const steps = Math.max(1, Math.ceil(duration / DEBRIS_DT) + 1);
  const frames = new Float32Array(steps * bodies.length * 7);
  if (bodies.length === 0) return { dt: DEBRIS_DT, t0, steps, bodies: [], frames };
  const world = new R.World({ x: 0, y: -9.80665, z: 0 });
  world.timestep = DEBRIS_DT;
  try {
    // Piso y objetos fijos.
    world.createCollider(
      R.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0).setFriction(0.8),
    );
    for (const s of statics) {
      const q = quatFromAxisAngle(new Vector3(0, 1, 0), s.yaw);
      const desc =
        s.kind === "cilindro"
          ? R.ColliderDesc.cylinder(s.size[1], s.size[0])
          : R.ColliderDesc.cuboid(s.size[0], s.size[1], s.size[2]);
      world.createCollider(
        desc
          .setTranslation(s.position.x, s.position.y, s.position.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setFriction(0.7),
      );
    }
    // Vehículos cinemáticos.
    const kin = vehicles.map((v) => {
      const p = v.poseAt(t0);
      const body = world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(
          p.position.x,
          p.position.y,
          p.position.z,
        ),
      );
      world.createCollider(R.ColliderDesc.cuboid(...v.half).setFriction(0.6), body);
      return { v, body };
    });
    // Restos: aparecen en su t0 (antes quedan dormidos fuera de la escena).
    const live = bodies.map(() => null as null | InstanceType<RapierModule["RigidBody"]>);
    const spawn = (i: number): void => {
      const b = bodies[i];
      if (!b) return;
      const desc = R.RigidBodyDesc.dynamic()
        .setTranslation(b.position.x, b.position.y, b.position.z)
        .setRotation({ x: b.quaternion.x, y: b.quaternion.y, z: b.quaternion.z, w: b.quaternion.w })
        .setLinvel(b.linvel.x, b.linvel.y, b.linvel.z)
        .setAngvel({ x: b.angvel.x, y: b.angvel.y, z: b.angvel.z })
        .setLinearDamping(0.05)
        .setAngularDamping(0.3);
      const body = world.createRigidBody(desc);
      const density = b.kind === "vidrio" ? 2500 : b.kind === "plastico" ? 1100 : 900;
      world.createCollider(
        R.ColliderDesc.cuboid(...b.half)
          .setDensity(density)
          .setFriction(b.kind === "vidrio" ? 0.5 : 0.7)
          .setRestitution(b.kind === "vidrio" ? 0.15 : 0.25),
        body,
      );
      live[i] = body;
    };
    const q = new Quaternion();
    for (let s = 0; s < steps; s++) {
      const t = t0 + s * DEBRIS_DT;
      bodies.forEach((b, i) => {
        if (!live[i] && b.t0 <= t + 1e-9) spawn(i);
      });
      // Registrar poses de este paso.
      bodies.forEach((b, i) => {
        const o = (s * bodies.length + i) * 7;
        const body = live[i];
        if (body) {
          const tr = body.translation();
          const ro = body.rotation();
          frames.set([tr.x, tr.y, tr.z, ro.x, ro.y, ro.z, ro.w], o);
        } else {
          frames.set(
            [
              b.position.x,
              b.position.y,
              b.position.z,
              b.quaternion.x,
              b.quaternion.y,
              b.quaternion.z,
              b.quaternion.w,
            ],
            o,
          );
        }
      });
      if (s === steps - 1) break;
      for (const k of kin) {
        const p = k.v.poseAt(t + DEBRIS_DT);
        quatFromAxisAngle(new Vector3(0, 1, 0), p.yaw, q);
        k.body.setNextKinematicTranslation({ x: p.position.x, y: p.position.y, z: p.position.z });
        k.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      }
      world.step();
    }
  } finally {
    world.free();
  }
  return { dt: DEBRIS_DT, t0, steps, bodies: [...bodies], frames };
}

/** Pose interpolada del cuerpo i en t (antes de t0, su pose inicial; después del horneado, la final). */
export function debrisPoseAt(
  bake: DebrisBake,
  i: number,
  t: number,
  outPos: Vector3,
  outQuat: Quaternion,
): void {
  const n = bake.bodies.length;
  const x = Math.min(bake.steps - 1, Math.max(0, (t - bake.t0) / bake.dt));
  const k = Math.min(bake.steps - 2, Math.floor(x));
  const f = bake.steps > 1 ? Math.min(1, x - Math.max(0, k)) : 0;
  const a = (Math.max(0, k) * n + i) * 7;
  const b = (Math.min(bake.steps - 1, Math.max(0, k) + 1) * n + i) * 7;
  const F = bake.frames;
  outPos.set(
    (F[a] ?? 0) + ((F[b] ?? 0) - (F[a] ?? 0)) * f,
    (F[a + 1] ?? 0) + ((F[b + 1] ?? 0) - (F[a + 1] ?? 0)) * f,
    (F[a + 2] ?? 0) + ((F[b + 2] ?? 0) - (F[a + 2] ?? 0)) * f,
  );
  const qa = new Quaternion(F[a + 3], F[a + 4], F[a + 5], F[a + 6]);
  const qb = new Quaternion(F[b + 3], F[b + 4], F[b + 5], F[b + 6]);
  slerp(outQuat.copy(qa), qb, f);
}
