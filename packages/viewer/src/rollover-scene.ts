/**
 * Volcadura ilustrativa (PLAN §6.1.6): el solver decide si el tropiezo inicia la volcadura
 * (`vehiculos[].volcadura`); la secuencia de vueltas se simula aquí en 3D con Rapier y se etiqueta
 * como ilustrativa.
 *
 * Condiciones iniciales en el tropiezo (t = 0): el vehículo gira alrededor de la arista de las
 * llantas del lado del tropiezo con la velocidad de alabeo del solver, ω = m v h / I_p; conserva su
 * velocidad hacia adelante. Si el relato declara la volcadura pero el criterio del solver no
 * alcanza (lo marca una bandera), se usa la velocidad de alabeo mínima que la produce, con un
 * margen del 25 %: la vista sigue al relato y la bandera explica la diferencia.
 */
import type { Resultado } from "@croquis/scene-schema";
import { Quaternion, Vector3 } from "three";
import { toThree } from "./coords";
import { loadRapier } from "./debris";
import { sampleVehicle } from "./sample";
import type { SceneGraph } from "./scene-graph";

export const ROLL_DT = 1 / 60;
export const ROLL_MAX_SECONDS = 8;
export const BODY_GROUND_FRICTION = 0.45; // supuesto: carrocería deslizando sobre asfalto o tierra
export const ROLL_MARGIN = 1.25;

export interface RolloverBake {
  vehicleId: string;
  dt: number;
  steps: number;
  frames: Float32Array; // por paso: centro (x, y, z) y orientación (qx, qy, qz, qw)
  halfHeight: number;
  rollRate: number;
  fromCriterion: boolean;
  rolls: number; // vueltas completas sobre el eje longitudinal
  maxTiltDeg: number; // inclinación máxima respecto a la vertical (> 90: quedó de lado o volteado)
}

/** Velocidad de alabeo mínima para pasar el centro de masa sobre la arista (rad/s). */
export function minimumRollRate(
  v: NonNullable<Resultado["vehiculos"][number]["volcadura"]>,
  width: number,
  height: number,
): number {
  const h = v.altura_cg_m;
  const half = v.via_m / 2;
  const k2 = (width * width + height * height) / 12;
  const dz = Math.hypot(h, half) - h;
  return Math.sqrt((2 * 9.80665 * dz) / (k2 + h * h + half * half));
}

export async function bakeRollover(
  resultado: Resultado,
  vehicleId: string,
): Promise<RolloverBake | null> {
  const v = resultado.vehiculos.find((x) => x.id === vehicleId);
  const roll = v?.volcadura;
  if (!v || !roll) return null;
  const declared = resultado.eventos.some(
    (e) => e.tipo === "volcadura" && e.actores.includes(vehicleId),
  );
  if (!roll.inicia && !declared) return null;
  const L = v.dimensiones.largo_m;
  const W = v.dimensiones.ancho_m;
  const H = v.dimensiones.alto_m;
  const fromCriterion = roll.inicia;
  const omega = fromCriterion
    ? roll.velocidad_alabeo_rad_s
    : ROLL_MARGIN * minimumRollRate(roll, W, H);
  const R = await loadRapier();
  const world = new R.World({ x: 0, y: -9.80665, z: 0 });
  world.timestep = ROLL_DT;
  const steps = Math.ceil(ROLL_MAX_SECONDS / ROLL_DT) + 1;
  const frames = new Float32Array(steps * 7);
  try {
    world.createCollider(
      R.ColliderDesc.cuboid(500, 0.5, 500)
        .setTranslation(0, -0.5, 0)
        .setFriction(BODY_GROUND_FRICTION),
    );
    const p = sampleVehicle(v.trayectoria, 0);
    const yawQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw);
    const fwd = new Vector3(1, 0, 0).applyQuaternion(yawQ);
    const right = new Vector3(0, 0, 1).applyQuaternion(yawQ); // izquierda = −z local
    const side = roll.lado_tropiezo === "derecho" ? 1 : -1;
    // ω alrededor del eje longitudinal: tropiezo a la derecha → la parte de arriba va a la derecha.
    const w = fwd.clone().multiplyScalar(side * omega);
    const center = new Vector3(...toThree(p.x, p.y, H / 2));
    const pivot = center
      .clone()
      .add(new Vector3(0, -H / 2, 0))
      .addScaledVector(right, (side * W) / 2);
    // Conserva la velocidad hacia adelante; la lateral se convierte en el giro del tropiezo.
    const vForward = Math.max(0, p.vx * Math.cos(p.yaw) + p.vy * Math.sin(p.yaw));
    const vel = fwd
      .clone()
      .multiplyScalar(vForward)
      .add(w.clone().cross(center.clone().sub(pivot)));
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y + 0.02, center.z)
        .setRotation({ x: yawQ.x, y: yawQ.y, z: yawQ.z, w: yawQ.w })
        .setLinvel(vel.x, vel.y, vel.z)
        .setAngvel({ x: w.x, y: w.y, z: w.z })
        .setAngularDamping(0.05),
    );
    world.createCollider(
      R.ColliderDesc.roundCuboid(L / 2 - 0.08, H / 2 - 0.08, W / 2 - 0.08, 0.08)
        .setMass(v.dimensiones.masa_kg)
        .setFriction(BODY_GROUND_FRICTION)
        .setRestitution(0.15),
      body,
    );
    let rollAngle = 0;
    let maxTilt = 0;
    let prevUp = new Vector3(0, 1, 0);
    for (let st = 0; st < steps; st++) {
      const tr = body.translation();
      const ro = body.rotation();
      frames.set([tr.x, tr.y, tr.z, ro.x, ro.y, ro.z, ro.w], st * 7);
      const up = new Vector3(0, 1, 0).applyQuaternion(new Quaternion(ro.x, ro.y, ro.z, ro.w));
      rollAngle += Math.acos(Math.max(-1, Math.min(1, up.dot(prevUp))));
      maxTilt = Math.max(maxTilt, Math.acos(Math.max(-1, Math.min(1, up.y))));
      prevUp = up;
      if (st < steps - 1) world.step();
    }
    return {
      vehicleId,
      dt: ROLL_DT,
      steps,
      frames,
      halfHeight: H / 2,
      rollRate: omega,
      fromCriterion,
      rolls: Math.floor(rollAngle / (2 * Math.PI) + 1e-6),
      maxTiltDeg: (maxTilt * 180) / Math.PI,
    };
  } finally {
    world.free();
  }
}

export function rolloverPoseAt(
  b: RolloverBake,
  t: number,
  outCenter: Vector3,
  outQuat: Quaternion,
): void {
  const x = Math.min(b.steps - 1, Math.max(0, t / b.dt));
  const k = Math.min(b.steps - 2, Math.floor(x));
  const f = x - k;
  const a = k * 7;
  const c = (k + 1) * 7;
  const F = b.frames;
  outCenter.set(
    F[a]! + (F[c]! - F[a]!) * f,
    F[a + 1]! + (F[c + 1]! - F[a + 1]!) * f,
    F[a + 2]! + (F[c + 2]! - F[a + 2]!) * f,
  );
  outQuat
    .set(F[a + 3]!, F[a + 4]!, F[a + 5]!, F[a + 6]!)
    .slerp(new Quaternion(F[c + 3]!, F[c + 4]!, F[c + 5]!, F[c + 6]!), f);
}

/** Simula y aplica las volcaduras de la escena (desde t = 0 la pose sale del horneado). */
export async function attachRollovers(
  resultado: Resultado,
  graph: SceneGraph,
): Promise<RolloverBake[]> {
  const bakes: RolloverBake[] = [];
  for (const v of resultado.vehiculos) {
    const b = await bakeRollover(resultado, v.id);
    const node = graph.vehicles.find((n) => n.id === v.id);
    if (!b || !node) continue;
    bakes.push(b);
    const c = new Vector3();
    const q = new Quaternion();
    graph.addUpdater(
      (t) => {
        if (t < 0) return;
        rolloverPoseAt(b, t, c, q);
        node.group.quaternion.copy(q);
        node.group.position.copy(c).add(new Vector3(0, -b.halfHeight, 0).applyQuaternion(q));
      },
      { after: true },
    );
  }
  return bakes;
}
