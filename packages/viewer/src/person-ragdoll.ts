/**
 * Ragdoll de personas proyectadas (PLAN §6.1.7 y §7.4) con Rapier determinista.
 *
 * Cada segmento del esqueleto (16, ver `person-pose.ts`) es un cuerpo rígido con una cápsula y la
 * masa de su fracción antropométrica (Winter 2009, tabla 4.1). Las articulaciones son esféricas
 * con fricción articular (motores de velocidad cero) y límites de rango de movimiento aplicados por
 * este módulo tras cada paso: se descompone la rotación relativa en balanceo (flexión-extensión y
 * abducción-aducción, desde la pose de enlace) y torsión, y si sale del rango se corrige la
 * velocidad angular relativa hacia el borde. Rapier JS no ofrece límites en articulaciones
 * esféricas, así que la restricción se resuelve aquí, de forma determinista.
 *
 * Calibración (criterio de F5): la persona sale en t = 0 con la velocidad de lanzamiento del
 * solver (y un giro de cabeceo, porque el golpe es abajo del centro de masa) y choca con los
 * vehículos (cuerpos cinemáticos que siguen al solver) y con el piso (fricción cuerpo–suelo del
 * solver). Un factor k sobre esa velocidad se ajusta por secante para que la distancia final del
 * centro de masa sea la del solver; el resultado se acepta si cae dentro de la banda de Searle.
 * Las semillas solo varían detalles (postura, giro, dirección); todo es reproducible.
 */
import { Quaternion, Vector3 } from "three";
import { loadRapier, mulberry32, type KinematicBox, type StaticCollider } from "./debris";
import type { BoneSpec } from "./person-pose";
import { dmath } from "@croquis/solver-ts";
import { quatFromAxisAngle, slerp } from "./dthree";
import { cedente } from "./ceder";

export const RAGDOLL_DT = 1 / 60;
export const RAGDOLL_MAX_SECONDS = 6;
export const CALIBRATION_ITERATIONS = 7;
export const CALIBRATION_TOLERANCE = 0.08; // fracción de la distancia objetivo
const RAGDOLL_GROUP = (0x0002 << 16) | 0xfffd; // no choca consigo mismo
const DEG = Math.PI / 180;

/**
 * Rango de movimiento desde la pose de enlace (grados). Cadera, rodilla, hombro y codo: valores de
 * la AAOS (Hendriks et al. 2020, tabla suplementaria "according to AAOS"); columna, cuello,
 * muñeca y tobillo: supuestos. flex: rotación sagital (+ al frente para cadera y hombro, + hacia
 * atrás para rodilla), abd: lateral, twist: torsión sobre el eje del segmento.
 */
export const JOINT_LIMITS: Record<
  string,
  { flex: [number, number]; abd: [number, number]; twist: number }
> = {
  abdomen: { flex: [-25, 40], abd: [-25, 25], twist: 25 },
  pecho: { flex: [-20, 35], abd: [-20, 20], twist: 25 },
  cuello: { flex: [-45, 45], abd: [-40, 40], twist: 60 },
  cabeza: { flex: [-20, 20], abd: [-15, 15], twist: 20 },
  brazo: { flex: [-60, 180], abd: [-30, 180], twist: 70 },
  antebrazo: { flex: [-150, 0], abd: [-8, 8], twist: 80 },
  mano: { flex: [-70, 70], abd: [-25, 25], twist: 10 },
  muslo: { flex: [-20, 120], abd: [-30, 40], twist: 40 },
  pierna: { flex: [0, 135], abd: [-6, 6], twist: 10 },
  pie: { flex: [-50, 20], abd: [-20, 20], twist: 10 },
};

export interface RagdollInput {
  bones: readonly BoneSpec[];
  stature: number;
  massKg: number;
  /** Pose inicial en el mundo de three.js: cabeza y orientación de cada hueso. */
  initial: Map<string, { head: Vector3; world: Quaternion }>;
  /** Velocidad de lanzamiento (m/s, mundo three.js) y velocidad angular inicial. */
  velocity: Vector3;
  angularVelocity: Vector3;
  mu: number;
  vehicles: readonly KinematicBox[];
  statics: readonly StaticCollider[];
  t0: number;
  tEnd: number;
  seed: number;
}

export interface RagdollBake {
  dt: number;
  t0: number;
  steps: number;
  bones: string[];
  /** Por paso y hueso: cabeza (x, y, z) y orientación (qx, qy, qz, qw). */
  frames: Float32Array;
  /** Centro de masa al inicio y al final (mundo three.js). */
  comStart: Vector3;
  comEnd: Vector3;
  /** Instante en que todo quedó en reposo (o el final del horneado). */
  tRest: number;
}

export interface RagdollResult {
  bake: RagdollBake;
  k: number;
  distance: number;
  target: number;
  band: [number, number];
  inBand: boolean;
  iterations: number;
  /** Distancia con k = 1 (sin calibrar), la alternativa simple de la evaluación. */
  uncalibrated: number;
}

function segmentKind(name: string): string {
  return name.split("_")[0] ?? name;
}

function horizontalDistance(a: Vector3, b: Vector3): number {
  return dmath.hypot(b.x - a.x, b.z - a.z);
}

/** Descomposición balanceo-torsión de q alrededor del eje a (unitario). */
export function swingTwist(q: Quaternion, axis: Vector3): { swing: Quaternion; twist: number } {
  const p = new Vector3(q.x, q.y, q.z);
  const proj = axis.clone().multiplyScalar(p.dot(axis));
  const twistQ = new Quaternion(proj.x, proj.y, proj.z, q.w);
  const len = dmath.hypotN([twistQ.x, twistQ.y, twistQ.z, twistQ.w]);
  if (len < 1e-9) return { swing: q.clone(), twist: 0 };
  twistQ.set(twistQ.x / len, twistQ.y / len, twistQ.z / len, twistQ.w / len);
  const swing = q.clone().multiply(twistQ.clone().invert());
  let angle = 2 * dmath.atan2(new Vector3(twistQ.x, twistQ.y, twistQ.z).dot(axis), twistQ.w);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  if (angle < -Math.PI) angle += 2 * Math.PI;
  return { swing, twist: angle };
}

/**
 * Rotación relativa limitada al rango: devuelve la rotación corregida (marco del padre) o null si
 * ya está dentro. `rest` es la dirección del segmento en la pose de enlace.
 */
export function clampRelative(qRel: Quaternion, rest: Vector3, kind: string): Quaternion | null {
  const lim = JOINT_LIMITS[kind];
  if (!lim) return null;
  const { swing, twist } = swingTwist(qRel, rest);
  const d = rest.clone().applyQuaternion(swing);
  // Ángulo sagital (+ al frente) y lateral del segmento, medidos desde la vertical de su lado:
  // hacia abajo para extremidades, hacia arriba para columna, cuello y cabeza.
  const sy = rest.y < 0 ? -1 : 1;
  const wrap = (x: number): number => dmath.atan2(dmath.sin(x), dmath.cos(x));
  const flexRest = dmath.atan2(rest.z, sy * rest.y);
  const abdRest = dmath.atan2(rest.x, dmath.hypot(rest.y, rest.z));
  const flexNow = dmath.atan2(d.z, sy * d.y);
  const abdNow = dmath.atan2(d.x, dmath.hypot(d.y, d.z));
  const sideSign = rest.x >= 0 ? 1 : -1; // abducción hacia afuera en ambos lados
  const hinge = kind === "pierna" || kind === "antebrazo";
  let flex = wrap(flexNow - flexRest) / DEG;
  if (hinge) flex = -flex;
  const abd = ((abdNow - abdRest) / DEG) * sideSign;
  const tw = twist / DEG;
  const cf = Math.min(lim.flex[1], Math.max(lim.flex[0], flex));
  const ca = Math.min(lim.abd[1], Math.max(lim.abd[0], abd));
  const ct = Math.min(lim.twist, Math.max(-lim.twist, tw));
  if (cf === flex && ca === abd && ct === tw) return null;
  const f = (hinge ? -cf : cf) * DEG + flexRest;
  const a = ca * sideSign * DEG + abdRest;
  const target = new Vector3(
    dmath.sin(a),
    sy * dmath.cos(a) * dmath.cos(f),
    dmath.cos(a) * dmath.sin(f),
  );
  const swingC = new Quaternion().setFromUnitVectors(rest, target.normalize());
  const twistC = quatFromAxisAngle(rest, ct * DEG);
  return swingC.multiply(twistC);
}

interface Seg {
  name: string;
  parent: number;
  body: InstanceType<Awaited<ReturnType<typeof loadRapier>>["RigidBody"]>;
  mass: number;
  rest: Vector3;
  kind: string;
}

/** Simula el ragdoll con la velocidad escalada por k. */
export async function bakeRagdoll(input: RagdollInput, k: number): Promise<RagdollBake> {
  const R = await loadRapier();
  const rng = mulberry32(input.seed >>> 0);
  const world = new R.World({ x: 0, y: -9.80665, z: 0 });
  world.timestep = RAGDOLL_DT;
  const duration = Math.max(0.5, Math.min(RAGDOLL_MAX_SECONDS, input.tEnd - input.t0));
  const steps = Math.ceil(duration / RAGDOLL_DT) + 1;
  const names = input.bones.map((b) => b.nombre);
  const frames = new Float32Array(steps * names.length * 7);
  const s = input.stature;
  try {
    world.createCollider(
      R.ColliderDesc.cuboid(500, 0.5, 500)
        .setTranslation(0, -0.5, 0)
        .setFriction(input.mu)
        .setFrictionCombineRule(R.CoefficientCombineRule.Average),
    );
    for (const st of input.statics) {
      const q = quatFromAxisAngle(new Vector3(0, 1, 0), st.yaw);
      const desc =
        st.kind === "cilindro"
          ? R.ColliderDesc.cylinder(st.size[1], st.size[0])
          : R.ColliderDesc.cuboid(st.size[0], st.size[1], st.size[2]);
      world.createCollider(
        desc
          .setTranslation(st.position.x, st.position.y, st.position.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setFriction(0.6),
      );
    }
    const kin = input.vehicles.map((v) => {
      const p = v.poseAt(input.t0);
      const body = world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(
          p.position.x,
          p.position.y,
          p.position.z,
        ),
      );
      world.createCollider(R.ColliderDesc.cuboid(...v.half).setFriction(0.5), body);
      return { v, body };
    });
    const segs: Seg[] = [];
    const com0 = new Vector3();
    let mTotal = 0;
    const comVel = input.velocity.clone().multiplyScalar(k);
    const omega = input.angularVelocity.clone().multiplyScalar(k);
    // Centro de masa inicial (para el giro): promedio ponderado de los centros de los segmentos.
    const centers = input.bones.map((b) => {
      const init = input.initial.get(b.nombre)!;
      const len =
        s *
        dmath.hypotN([
          b.punta[0] - b.cabeza[0],
          b.punta[1] - b.cabeza[1],
          b.punta[2] - b.cabeza[2],
        ]);
      const rest = new Vector3(
        b.punta[0] - b.cabeza[0],
        b.punta[1] - b.cabeza[1],
        b.punta[2] - b.cabeza[2],
      ).normalize();
      const c = init.head
        .clone()
        .addScaledVector(rest.clone().applyQuaternion(init.world), len / 2);
      return { c, len, rest };
    });
    input.bones.forEach((b, i) => {
      const m = b.fraccion_masa * input.massKg;
      com0.addScaledVector(centers[i]!.c, m);
      mTotal += m;
    });
    com0.multiplyScalar(1 / mTotal);
    input.bones.forEach((b, i) => {
      const init = input.initial.get(b.nombre)!;
      const { c, len, rest } = centers[i]!;
      const jitter = 1 + 0.04 * (rng() - 0.5);
      const v = comVel
        .clone()
        .multiplyScalar(jitter)
        .add(omega.clone().cross(c.clone().sub(com0)));
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(init.head.x, init.head.y, init.head.z)
          .setRotation({ x: init.world.x, y: init.world.y, z: init.world.z, w: init.world.w })
          .setLinvel(v.x, v.y, v.z)
          .setAngvel({ x: omega.x, y: omega.y, z: omega.z })
          .setLinearDamping(0.02)
          .setAngularDamping(0.6)
          .setCcdEnabled(true),
      );
      const kind = segmentKind(b.nombre);
      const mass = b.fraccion_masa * input.massKg;
      let radius = Math.max(0.02, b.radio * s);
      if (kind === "cadera") radius = Math.max(radius, 0.085 * s);
      if (kind === "pie") radius = Math.min(radius, 0.045 * s);
      const half = Math.max(0, len / 2 - radius);
      const align = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), rest);
      const mid = rest.clone().multiplyScalar(len / 2);
      const desc = (half > 0 ? R.ColliderDesc.capsule(half, radius) : R.ColliderDesc.ball(radius))
        .setTranslation(mid.x, mid.y, mid.z)
        .setRotation({ x: align.x, y: align.y, z: align.z, w: align.w })
        .setMass(mass)
        .setFriction(input.mu)
        .setFrictionCombineRule(R.CoefficientCombineRule.Average)
        .setRestitution(0.1)
        .setCollisionGroups(RAGDOLL_GROUP);
      world.createCollider(desc, body);
      segs.push({
        name: b.nombre,
        parent: b.padre ? names.indexOf(b.padre) : -1,
        body,
        mass,
        rest,
        kind,
      });
    });
    // Articulaciones esféricas con fricción articular.
    for (const seg of segs) {
      if (seg.parent < 0) continue;
      const p = segs[seg.parent]!;
      const b = input.bones[segs.indexOf(seg)]!;
      const pb = input.bones[seg.parent]!;
      const anchor1 = new Vector3(
        b.cabeza[0] - pb.cabeza[0],
        b.cabeza[1] - pb.cabeza[1],
        b.cabeza[2] - pb.cabeza[2],
      ).multiplyScalar(s);
      const joint = world.createImpulseJoint(
        R.JointData.spherical({ x: anchor1.x, y: anchor1.y, z: anchor1.z }, { x: 0, y: 0, z: 0 }),
        p.body,
        seg.body,
        true,
      );
      // Rapier crea la esférica como articulación genérica y su clase JS no expone los motores;
      // el conjunto crudo sí (mismo efecto que `SphericalImpulseJoint.configureMotorVelocity`).
      const raw = joint as unknown as {
        rawSet: {
          jointConfigureMotorVelocity(h: number, axis: number, v: number, f: number): void;
        };
        handle: number;
      };
      const friction = 0.15 * seg.mass;
      for (const axis of [R.JointAxis.AngX, R.JointAxis.AngY, R.JointAxis.AngZ]) {
        raw.rawSet.jointConfigureMotorVelocity(raw.handle, axis, 0, friction);
      }
    }
    const qP = new Quaternion();
    const qC = new Quaternion();
    const rel = new Quaternion();
    let tRest = input.t0 + duration;
    let restSteps = 0;
    const q = new Quaternion();
    const ceder = cedente();
    for (let st = 0; st < steps; st++) {
      // Cede el hilo principal cada ~8 ms: el horneado no congela la página (ADR 0046).
      const pausa = ceder();
      if (pausa) await pausa;
      const t = input.t0 + st * RAGDOLL_DT;
      segs.forEach((seg, i) => {
        const tr = seg.body.translation();
        const ro = seg.body.rotation();
        frames.set([tr.x, tr.y, tr.z, ro.x, ro.y, ro.z, ro.w], (st * segs.length + i) * 7);
      });
      if (st === steps - 1) break;
      for (const kb of kin) {
        const p = kb.v.poseAt(t + RAGDOLL_DT);
        quatFromAxisAngle(new Vector3(0, 1, 0), p.yaw, q);
        kb.body.setNextKinematicTranslation({ x: p.position.x, y: p.position.y, z: p.position.z });
        kb.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      }
      world.step();
      // Límites articulares: corrige la velocidad angular relativa hacia el rango.
      for (const seg of segs) {
        if (seg.parent < 0) continue;
        const p = segs[seg.parent]!;
        const pr = p.body.rotation();
        const cr = seg.body.rotation();
        qP.set(pr.x, pr.y, pr.z, pr.w);
        qC.set(cr.x, cr.y, cr.z, cr.w);
        rel.copy(qP).invert().multiply(qC);
        const clamped = clampRelative(rel, seg.rest, seg.kind);
        if (!clamped) continue;
        const targetWorld = qP.clone().multiply(clamped);
        const corr = targetWorld.multiply(qC.clone().invert());
        if (corr.w < 0) corr.set(-corr.x, -corr.y, -corr.z, -corr.w);
        const angle = 2 * dmath.acos(Math.min(1, corr.w));
        if (angle < 1e-5) continue;
        const sn = dmath.sin(angle / 2);
        const axis = new Vector3(corr.x / sn, corr.y / sn, corr.z / sn);
        const wP = p.body.angvel();
        const wC = seg.body.angvel();
        const relW = new Vector3(wC.x - wP.x, wC.y - wP.y, wC.z - wP.z);
        // Quita la parte de la velocidad relativa que sigue saliendo del rango y empuja hacia
        // adentro (Baumgarte β = 0.3), repartida por masa.
        const outward = Math.min(0, relW.dot(axis));
        const dw = -outward + (0.3 * angle) / RAGDOLL_DT;
        const share = p.mass / (p.mass + seg.mass);
        seg.body.setAngvel(
          {
            x: wC.x + axis.x * dw * share,
            y: wC.y + axis.y * dw * share,
            z: wC.z + axis.z * dw * share,
          },
          true,
        );
        p.body.setAngvel(
          {
            x: wP.x - axis.x * dw * (1 - share),
            y: wP.y - axis.y * dw * (1 - share),
            z: wP.z - axis.z * dw * (1 - share),
          },
          true,
        );
      }
      // Reposo: todos los segmentos casi quietos durante 0.5 s.
      const still = segs.every((seg) => {
        const v = seg.body.linvel();
        return dmath.hypotN([v.x, v.y, v.z]) < 0.05;
      });
      restSteps = still ? restSteps + 1 : 0;
      if (restSteps === Math.round(0.5 / RAGDOLL_DT)) tRest = Math.min(tRest, t - 0.5 + RAGDOLL_DT);
    }
    const comEnd = new Vector3();
    segs.forEach((seg, i) => {
      const o = ((steps - 1) * segs.length + i) * 7;
      const head = new Vector3(frames[o], frames[o + 1], frames[o + 2]);
      const rot = new Quaternion(frames[o + 3], frames[o + 4], frames[o + 5], frames[o + 6]);
      const c = head.addScaledVector(seg.rest.clone().applyQuaternion(rot), centers[i]!.len / 2);
      comEnd.addScaledVector(c, seg.mass);
    });
    comEnd.multiplyScalar(1 / mTotal);
    return {
      dt: RAGDOLL_DT,
      t0: input.t0,
      steps,
      bones: names,
      frames,
      comStart: com0,
      comEnd,
      tRest,
    };
  } finally {
    world.free();
  }
}

/**
 * Ajusta k para que la distancia horizontal del centro de masa sea la del solver (secante sobre
 * d(k), con d ∝ k² como primera estimación). Devuelve el horneado más cercano al objetivo.
 */
export async function calibrateRagdoll(
  input: RagdollInput,
  target: number,
  band: [number, number],
): Promise<RagdollResult> {
  const tries: { k: number; d: number; bake: RagdollBake }[] = [];
  const run = async (k: number): Promise<number> => {
    const bake = await bakeRagdoll(input, k);
    const d = horizontalDistance(bake.comStart, bake.comEnd);
    tries.push({ k, d, bake });
    return d;
  };
  let k0 = 1;
  let d0 = await run(k0);
  const uncalibrated = d0;
  let k1 = Math.min(2, Math.max(0.2, Math.sqrt(target / Math.max(d0, 1e-3))));
  let d1 = await run(k1);
  for (let it = 2; it < CALIBRATION_ITERATIONS; it++) {
    if (Math.abs(d1 - target) <= CALIBRATION_TOLERANCE * target) break;
    const slope = (d1 - d0) / (k1 - k0 || 1e-6);
    let k2 =
      Math.abs(slope) > 1e-6
        ? k1 + (target - d1) / slope
        : k1 * Math.sqrt(target / Math.max(d1, 1e-3));
    if (!Number.isFinite(k2)) k2 = k1;
    k2 = Math.min(2, Math.max(0.2, k2));
    k0 = k1;
    d0 = d1;
    k1 = k2;
    d1 = await run(k1);
  }
  const best = tries.reduce((a, b) => (Math.abs(b.d - target) < Math.abs(a.d - target) ? b : a));
  return {
    bake: best.bake,
    k: best.k,
    distance: best.d,
    target,
    band,
    inBand: best.d >= band[0] - 1e-9 && best.d <= band[1] + 1e-9,
    iterations: tries.length,
    uncalibrated,
  };
}

/** Pose de un hueso en t (cabeza y orientación en el mundo de three.js). */
export function ragdollPoseAt(
  bake: RagdollBake,
  boneIndex: number,
  t: number,
  outHead: Vector3,
  outQuat: Quaternion,
): void {
  const n = bake.bones.length;
  const x = Math.min(bake.steps - 1, Math.max(0, (t - bake.t0) / bake.dt));
  const k = Math.min(bake.steps - 2, Math.floor(x));
  const f = bake.steps > 1 ? Math.min(1, x - Math.max(0, k)) : 0;
  const a = (Math.max(0, k) * n + boneIndex) * 7;
  const b = (Math.min(bake.steps - 1, Math.max(0, k) + 1) * n + boneIndex) * 7;
  const F = bake.frames;
  outHead.set(
    F[a]! + (F[b]! - F[a]!) * f,
    F[a + 1]! + (F[b + 1]! - F[a + 1]!) * f,
    F[a + 2]! + (F[b + 2]! - F[a + 2]!) * f,
  );
  slerp(
    outQuat.set(F[a + 3]!, F[a + 4]!, F[a + 5]!, F[a + 6]!),
    new Quaternion(F[b + 3], F[b + 4], F[b + 5], F[b + 6]),
    f,
  );
}
