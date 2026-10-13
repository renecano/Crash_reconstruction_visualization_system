/**
 * Maniquí neutro para personas (PLAN §7.4 y §10): figura simple sin rasgos, sin sangre ni
 * lesiones visibles. Escala con la estatura del contrato. En F5 lo sustituye un cuerpo articulado
 * (MakeHuman/MPFB) con ragdoll; aquí solo se representan posición, rumbo y fase de movimiento.
 *
 * Marco local: el origen del grupo es el centro de masa (a 0.57 de la estatura sobre los pies,
 * la misma fracción que usa el solver), +x al frente, +y arriba. Así el visor coloca el grupo
 * exactamente en la altura z que entrega el solver y las posturas giran alrededor de ese punto.
 */
import { CapsuleGeometry, Group, Mesh, SphereGeometry, type BufferGeometry } from "three";

export type Posture = "de_pie" | "caminando" | "vuelo" | "deslizamiento" | "reposo" | "sentado";

/** Altura del centro de masa sobre los pies (fracción de la estatura), igual que el solver. */
export const CG_HEIGHT_FACTOR = 0.57;

function part(name: string, g: BufferGeometry, role: string): Mesh {
  const m = new Mesh(g);
  m.name = name;
  m.userData.role = role;
  m.castShadow = true;
  return m;
}

/** Proporciones aproximadas de una figura de pie (fracciones de la estatura). */
const P = { leg: 0.47, torso: 0.3, head: 0.13, shoulder: 0.25, hip: 0.18, limb: 0.055 };

export function buildMannequin(stature: number): Group {
  const s = Math.max(0.6, Math.min(2.3, stature));
  const g = new Group();
  g.name = "persona";
  g.userData.stature = s;
  const cg = CG_HEIGHT_FACTOR * s;
  const body = new Group();
  body.name = "cuerpo";
  g.add(body);
  // Todo cuelga de `cuerpo` con los pies a −cg.
  const feet = new Group();
  feet.name = "pies";
  feet.position.y = -cg;
  body.add(feet);
  const legLen = P.leg * s;
  const torsoLen = P.torso * s;
  const r = P.limb * s;
  const torso = part("torso", new CapsuleGeometry(0.11 * s, torsoLen - 0.22 * s, 4, 10), "persona");
  torso.position.y = legLen + torsoLen / 2;
  const head = part("cabeza", new SphereGeometry((P.head * s) / 2, 14, 10), "persona_cabeza");
  head.position.y = legLen + torsoLen + (P.head * s) / 2 + 0.02 * s;
  feet.add(torso, head);
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "izq" : "der";
    const hip = new Group();
    hip.name = `cadera_${sfx}`;
    hip.position.set(0, legLen, side * P.hip * s * 0.5);
    const leg = part(`pierna_${sfx}`, new CapsuleGeometry(r, legLen - 2 * r, 4, 8), "persona");
    leg.position.y = -legLen / 2;
    hip.add(leg);
    const shoulder = new Group();
    shoulder.name = `hombro_${sfx}`;
    shoulder.position.set(0, legLen + torsoLen - 0.04 * s, side * P.shoulder * s * 0.5);
    const arm = part(
      `brazo_${sfx}`,
      new CapsuleGeometry(r * 0.8, 0.36 * s - 2 * r, 4, 8),
      "persona",
    );
    arm.position.y = -0.18 * s;
    shoulder.add(arm);
    feet.add(hip, shoulder);
  }
  return g;
}

/**
 * Aplica una postura. `phase` (0–1) anima el paso al caminar; `progress` (0–1) gira el cuerpo
 * durante el vuelo hasta quedar tendido.
 */
export function applyPosture(g: Group, posture: Posture, phase = 0, progress = 1): void {
  const body = g.getObjectByName("cuerpo");
  if (!body) return;
  const swing = posture === "caminando" ? 0.45 * Math.sin(2 * Math.PI * phase) : 0;
  for (const [name, sign] of [
    ["cadera_izq", 1],
    ["cadera_der", -1],
    ["hombro_izq", -1],
    ["hombro_der", 1],
  ] as const) {
    const o = g.getObjectByName(name);
    if (!o) continue;
    o.rotation.z = posture === "sentado" && name.startsWith("cadera") ? Math.PI / 2 : sign * swing;
  }
  const lying =
    posture === "vuelo"
      ? Math.min(1, Math.max(0, progress))
      : posture === "deslizamiento" || posture === "reposo"
        ? 1
        : 0;
  // Gira hacia atrás alrededor del centro de masa hasta quedar tendido.
  body.rotation.set(0, 0, (Math.PI / 2) * lying);
}
