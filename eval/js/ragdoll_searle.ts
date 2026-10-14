/**
 * Criterio de F5 (PLAN §13): la proyección del ragdoll cae dentro de los límites de Searle en
 * ≥ 95 % de las corridas con semilla. Uso: `pnpm --filter @croquis/eval-js ragdoll`.
 *
 * Tres grupos de corridas, todas con el mismo código del visor (`ragdollSetup`, `calibrateRagdoll`):
 *
 * 1. Escenas canónicas con proyección (`peaton_cruce`, `motociclista`): 50 semillas cada una.
 * 2. Barrido sintético: impactos de 20 a 70 km/h a una persona de 1.20, 1.70 y 1.60 m (niñez,
 *    adultez y vejez), sin vehículos ni objetos alrededor, 20 semillas por combinación. El objetivo
 *    y la banda salen del port TS del solver (`@croquis/solver-ts`, paridad probada con Python).
 * 3. Física sola contra datos reales (E4): para los 17 casos publicados en dominio, la distancia
 *    del ragdoll sin calibrar (k = 1) con la velocidad medida, frente a la distancia medida.
 *
 * Alternativa simple que se reporta: el mismo ragdoll sin calibrar (k = 1).
 * Resultado: `eval/results/ragdoll_searle.json`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixture, loadResultado, type FixtureName } from "@croquis/scene-schema";
import { searleDistanceBand, searleThrow } from "@croquis/solver-ts";
import {
  calibrateRagdoll,
  bakeRagdoll,
  defaultMass,
  poseFromDirections,
  posedJoints,
  ragdollSetup,
  variantForAge,
  walkingDirections,
  type BodyManifest,
  type BodyVariant,
  type RagdollInput,
} from "@croquis/viewer";
import { Quaternion, Vector3 } from "three";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "apps/web/public/modelos/personas/personas.json"), "utf-8"),
) as BodyManifest;
const friction = JSON.parse(
  readFileSync(resolve(ROOT, "solver/croquis_solver/data/friction.json"), "utf-8"),
) as { cuerpo_peaton: { asfalto: { nominal: number; rango: [number, number] } } };
const MU = friction.cuerpo_peaton.asfalto;

const CANONICAL_SEEDS = 50;
const SYNTH_SEEDS = 20;
const E4_SEEDS = 5;
const SPEEDS_KMH = [20, 30, 40, 50, 60, 70];
const BODIES: { variant: BodyVariant; stature: number }[] = [
  { variant: "nino", stature: 1.2 },
  { variant: "adulto", stature: 1.7 },
  { variant: "mayor", stature: 1.6 },
];
const PROJECTION = 0.9; // = PEDESTRIAN_PROJECTION_FACTOR del solver
const LAUNCH_DEG = 10; // = PEDESTRIAN_LAUNCH_ANGLE_DEG
const CG_FACTOR = 0.57; // = PEDESTRIAN_CG_HEIGHT_FACTOR
const Y = new Vector3(0, 1, 0);

interface Run {
  grupo: string;
  caso: string;
  semilla: number;
  objetivo_m: number;
  banda_m: [number, number];
  distancia_m: number;
  en_banda: boolean;
  sin_calibrar_m: number;
  sin_calibrar_en_banda: boolean;
  k: number;
  iteraciones: number;
}

function entry(variant: BodyVariant) {
  const e = manifest.variantes.find((x) => x.variante === variant);
  if (!e) throw new Error(`Sin variante ${variant}`);
  return e;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Persona caminando en el origen, golpeada de frente hacia +x, sin nada alrededor. */
function syntheticInput(
  variant: BodyVariant,
  stature: number,
  vVehicleKmh: number,
  mu: number,
  seed: number,
): RagdollInput {
  const rng = mulberry(seed ^ 0x51ed270b);
  const bones = entry(variant).huesos;
  const dirs = walkingDirections(rng());
  const pose = poseFromDirections(bones, dirs);
  const joints = posedJoints(bones, pose);
  const yaw = Math.PI / 2 + (rng() - 0.5) * 0.1; // de frente al vehículo (±3°)
  const rot = new Quaternion().setFromAxisAngle(Y, yaw);
  const initial = new Map<string, { head: Vector3; world: Quaternion }>();
  for (const [name, j] of joints) {
    initial.set(name, {
      head: j.head.clone().multiplyScalar(stature).applyQuaternion(rot),
      world: rot.clone().multiply(j.world),
    });
  }
  const v = (PROJECTION * vVehicleKmh) / 3.6;
  const th = (LAUNCH_DEG * Math.PI) / 180;
  const h = (rng() - 0.5) * ((6 * Math.PI) / 180);
  const dir = new Vector3(Math.cos(h) * Math.cos(th), Math.sin(th), -Math.sin(h) * Math.cos(th));
  const horiz = new Vector3(Math.cos(h), 0, -Math.sin(h));
  const omega = horiz
    .clone()
    .cross(Y)
    .multiplyScalar(((0.8 * v) / stature) * (1 + 0.5 * (rng() - 0.5)));
  return {
    bones,
    stature,
    massKg: defaultMass(variant, stature),
    initial,
    velocity: dir.multiplyScalar(v),
    angularVelocity: omega,
    mu,
    vehicles: [],
    statics: [],
    t0: 0,
    tEnd: 6,
    seed,
  };
}

function rate(xs: boolean[]): number {
  return xs.length ? Math.round((xs.filter(Boolean).length / xs.length) * 1e4) / 1e4 : 0;
}

function quantiles(xs: number[]): { min: number; p50: number; max: number } {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] ?? NaN;
  return { min: round(s[0] ?? NaN), p50: round(q(0.5)), max: round(s[s.length - 1] ?? NaN) };
}

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

async function main(): Promise<void> {
  const runs: Run[] = [];
  const t0 = performance.now();

  // 1. Escenas canónicas.
  for (const name of ["peaton_cruce", "motociclista"] as FixtureName[]) {
    const spec = loadFixture(name);
    const r = await loadResultado(name);
    for (const data of r.personas) {
      if (!data.proyeccion) continue;
      const ps = spec.personas.find((p) => p.id === data.id);
      const variant = variantForAge(ps?.edad_aprox?.valor);
      const mass = ps?.masa?.valor ?? defaultMass(variant, data.estatura_m);
      for (let s = 0; s < CANONICAL_SEEDS; s++) {
        const setup = ragdollSetup(spec, r, data, entry(variant), { massKg: mass, seed: 1000 + s });
        const res = await calibrateRagdoll(setup.input, setup.target, setup.band);
        runs.push({
          grupo: "canonica",
          caso: `${name}/${data.id}`,
          semilla: 1000 + s,
          objetivo_m: round(res.target),
          banda_m: [round(res.band[0]), round(res.band[1])],
          distancia_m: round(res.distance),
          en_banda: res.inBand,
          sin_calibrar_m: round(res.uncalibrated),
          sin_calibrar_en_banda: res.uncalibrated >= res.band[0] && res.uncalibrated <= res.band[1],
          k: round(res.k),
          iteraciones: res.iterations,
        });
      }
    }
  }

  // 2. Barrido sintético.
  for (const body of BODIES) {
    const h = CG_FACTOR * body.stature;
    for (const vk of SPEEDS_KMH) {
      const launch = (PROJECTION * vk) / 3.6;
      const target = searleThrow(launch, MU.nominal, LAUNCH_DEG, h);
      const b = searleDistanceBand(launch, MU.rango[0], MU.rango[1], h);
      for (let s = 0; s < SYNTH_SEEDS; s++) {
        const seed = 5000 + 97 * vk + s;
        const input = syntheticInput(body.variant, body.stature, vk, MU.nominal, seed);
        const res = await calibrateRagdoll(input, target, [b.dMin, b.dMax]);
        runs.push({
          grupo: "sintetico",
          caso: `${body.variant}/${vk}kmh`,
          semilla: seed,
          objetivo_m: round(target),
          banda_m: [round(b.dMin), round(b.dMax)],
          distancia_m: round(res.distance),
          en_banda: res.inBand,
          sin_calibrar_m: round(res.uncalibrated),
          sin_calibrar_en_banda: res.uncalibrated >= b.dMin && res.uncalibrated <= b.dMax,
          k: round(res.k),
          iteraciones: res.iterations,
        });
      }
    }
  }

  // 3. Física sola contra los casos publicados de E4 (en dominio: el vehículo frena).
  const csv = readFileSync(resolve(ROOT, "data/e4/throw_cases.csv"), "utf-8").trim().split(/\r?\n/);
  const header = csv[0]!.split(",");
  const col = (row: string[], name: string) => row[header.indexOf(name)] ?? "";
  const e4: {
    fuente: string;
    caso: string;
    v: number;
    d: number;
    ragdoll: number;
    solver: number;
  }[] = [];
  for (const line of csv.slice(1)) {
    const row = line
      .match(/("[^"]*"|[^,]*)(,|$)/g)!
      .map((c) => c.replace(/,$/, "").replace(/^"|"$/g, ""));
    if (col(row, "vehiculo_frena") !== "si") continue;
    const v = Number(col(row, "v_impacto_kmh"));
    const d = Number(col(row, "distancia_total_m"));
    const muMeasured = col(row, "mu_medido");
    const mu = muMeasured ? Number(muMeasured) : MU.nominal;
    const stature = col(row, "estatura_m") ? Number(col(row, "estatura_m")) : 1.7;
    const h = CG_FACTOR * stature;
    const solver = searleThrow((PROJECTION * v) / 3.6, mu, LAUNCH_DEG, h);
    let sum = 0;
    for (let s = 0; s < E4_SEEDS; s++) {
      const bake = await bakeRagdoll(syntheticInput("adulto", stature, v, mu, 9000 + s), 1);
      sum += Math.hypot(bake.comEnd.x - bake.comStart.x, bake.comEnd.z - bake.comStart.z);
    }
    e4.push({
      fuente: col(row, "fuente"),
      caso: col(row, "caso"),
      v,
      d,
      ragdoll: round(sum / E4_SEEDS),
      solver: round(solver),
    });
  }

  const all = runs.map((r) => r.en_banda);
  const byGroup = (g: string) => runs.filter((r) => r.grupo === g);
  const casos = [...new Set(runs.map((r) => r.caso))].map((caso) => {
    const rs = runs.filter((r) => r.caso === caso);
    return {
      caso,
      corridas: rs.length,
      tasa_en_banda: rate(rs.map((r) => r.en_banda)),
      tasa_sin_calibrar: rate(rs.map((r) => r.sin_calibrar_en_banda)),
      k: quantiles(rs.map((r) => r.k)),
    };
  });
  const mae = (xs: number[]) => round(xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length, 3);
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
    .toString()
    .trim();
  const doc = {
    name: "ragdoll_searle",
    generated_at: new Date().toISOString().slice(0, 19) + "Z",
    git_commit: commit,
    criterio:
      "Proyección del ragdoll dentro de los límites de Searle en ≥ 95 % de corridas con semilla (PLAN §13, F5)",
    maquina: {
      cpu: cpus()[0]?.model,
      nucleos: cpus().length,
      memoria_gb: round(totalmem() / 2 ** 30, 1),
    },
    parametros: {
      semillas_canonicas: CANONICAL_SEEDS,
      semillas_sinteticas: SYNTH_SEEDS,
      velocidades_kmh: SPEEDS_KMH,
      cuerpos: BODIES,
      friccion_cuerpo_suelo: MU,
      factor_proyeccion: PROJECTION,
      angulo_lanzamiento_deg: LAUNCH_DEG,
    },
    resumen: {
      corridas: runs.length,
      tasa_en_banda: rate(all),
      tasa_en_banda_sin_calibrar: rate(runs.map((r) => r.sin_calibrar_en_banda)),
      canonicas: {
        corridas: byGroup("canonica").length,
        tasa_en_banda: rate(byGroup("canonica").map((r) => r.en_banda)),
      },
      sinteticas: {
        corridas: byGroup("sintetico").length,
        tasa_en_banda: rate(byGroup("sintetico").map((r) => r.en_banda)),
      },
      iteraciones_media: round(runs.reduce((a, r) => a + r.iteraciones, 0) / runs.length, 2),
      k: quantiles(runs.map((r) => r.k)),
      cumple: rate(all) >= 0.95,
      segundos: round((performance.now() - t0) / 1000, 1),
    },
    e4_fisica_sola: {
      descripcion:
        "Distancia del ragdoll sin calibrar (k = 1, media de 5 semillas) con la velocidad medida, frente a la distancia medida; y la del solver (Searle, θ = 10°) para comparar.",
      casos: e4.length,
      mae_ragdoll_m: mae(e4.map((c) => c.ragdoll - c.d)),
      mae_solver_m: mae(e4.map((c) => c.solver - c.d)),
      detalle: e4,
    },
    por_caso: casos,
    corridas: runs,
  };
  const out = resolve(ROOT, "eval/results/ragdoll_searle.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2) + "\n", "utf-8");
  console.log(
    JSON.stringify(
      {
        resumen: doc.resumen,
        e4: {
          mae_ragdoll_m: doc.e4_fisica_sola.mae_ragdoll_m,
          mae_solver_m: doc.e4_fisica_sola.mae_solver_m,
        },
      },
      null,
      2,
    ),
  );
  console.log(out);
}

await main();
