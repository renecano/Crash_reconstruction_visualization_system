/**
 * Cobertura sintética del rango (auditoría del 2026-11-15, C5; punto 11 del plan; ADR 0139).
 *
 * ¿El p10–p90 que da la inversión contiene la velocidad verdadera las veces que dice? Aquí la
 * verdad se conoce, porque el caso se fabrica:
 *
 * 1. De una escena canónica se sortea una **verdad**: la velocidad de cada vehículo, la fricción, las
 *    masas (±5 %) y los tres supuestos del impacto (restitución, razón de impulso y arrastre), cada
 *    uno en el mismo rango que declara el solver.
 * 2. El solver integra esa verdad y da dónde quedó cada vehículo.
 * 3. Se arma el caso **como lo vería el perito**: la escena con sus valores nominales (no los
 *    verdaderos) y las posiciones finales medidas con el ruido que el solver supone para una
 *    posición (1 m) y un rumbo (20°).
 * 4. La inversión estima las velocidades con su p10–p90, y se anota si la verdadera cayó dentro.
 *
 * Un p10–p90 bien calibrado contiene la verdad cerca del 80 % de las veces. Se mide dos veces: con
 * los tres supuestos fijos en su nominal (como antes del ADR 0139) y sorteados (como ahora).
 *
 * **Límite:** la verdad sale del mismo modelo que la inversión. Mide si la incertidumbre se propaga
 * bien dentro del modelo, no si el modelo se parece a un choque real (eso lo miden E2–E5 con
 * pruebas de choque).
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/t3_cobertura.mts [--casos 200] [--muestras 32]
 *       [--escenas alcance,lateral_interseccion] [--salida eval/results/t3_cobertura.json]
 *
 * Con 200 casos por escena tarda decenas de minutos: va en la computadora del colaborador. En la
 * laptop, `--casos 12` comprueba el mecanismo en un par de minutos.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  conSupuestosFijos,
  IMPACT_SAMPLED,
  IMPULSE_RATIO_RANGE,
  invert,
  MASS_SPREAD,
  POST_IMPACT_DRAG,
  PyRandom,
  reconstruct,
  RESTITUTION,
  SIGMA_POSITION_M,
  tireFriction,
} from "../packages/solver-ts/src/index.ts";

type Json = Record<string, unknown>;

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (nombre: string, def: string) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1]! : def;
};
const CASOS = Number(arg("casos", "200"));
const MUESTRAS = Number(arg("muestras", "32"));
const ESCENAS = arg("escenas", "alcance,lateral_interseccion").split(",");
const SALIDA = join(RAIZ, arg("salida", "eval/results/t3_cobertura.json"));
const SEMILLA = 20_261_115;
/** El ruido del rumbo final que supone la inversión (inversion.ts, SIGMA_HEADING_DEG). */
const SIGMA_RUMBO_DEG = 20;
/** La verdad de cada velocidad: entre 0.6 y 1.4 veces la que dice el relato de la escena. */
const VELOCIDAD = [0.6, 1.4] as const;

const r2 = (x: number) => Math.round(x * 100) / 100;
const clon = <T,>(x: T): T => structuredClone(x);

/** La escena sin la evidencia que no se estudia aquí: solo quedan las posiciones finales. */
function limpia(spec: Json): Json {
  const s = clon(spec);
  s.evidencias = [];
  s.danos_declarados = [];
  for (const v of s.vehiculos as Json[]) {
    delete v.posicion_final;
    delete v.posicion_final_supuesta;
  }
  return s;
}

interface Verdad {
  kmh: Record<string, number>;
  friccion: number;
  masas: Record<string, number>;
  restitucion: number;
  razon_impulso: number;
  arrastre: number;
}

function sorteaVerdad(base: Json, rng: PyRandom): Verdad {
  const lugar = base.lugar as Json;
  const mu = tireFriction(
    String((lugar.superficie as Json).valor),
    String((lugar.estado_superficie as Json).valor),
  );
  const kmh: Record<string, number> = {};
  const masas: Record<string, number> = {};
  for (const v of base.vehiculos as Json[]) {
    const dicha = Number(((v.velocidad_previa ?? {}) as Json).valor ?? 0);
    kmh[String(v.id)] = dicha > 0 ? rng.uniform(VELOCIDAD[0] * dicha, VELOCIDAD[1] * dicha) : 0;
    const m = Number(((v.masa ?? {}) as Json).valor);
    masas[String(v.id)] = m * rng.uniform(1 - MASS_SPREAD, 1 + MASS_SPREAD);
  }
  return {
    kmh,
    friccion: rng.uniform(mu.low, mu.high),
    masas,
    restitucion: rng.uniform(RESTITUTION[1], RESTITUTION[2]),
    razon_impulso: rng.uniform(IMPULSE_RATIO_RANGE[1], IMPULSE_RATIO_RANGE[2]),
    arrastre: rng.uniform(POST_IMPACT_DRAG[1], POST_IMPACT_DRAG[2]),
  };
}

/** La escena con la verdad puesta: lo que de verdad pasó. */
function escenaVerdadera(base: Json, t: Verdad): Json {
  const s = clon(base);
  const lugar = s.lugar as Json;
  lugar.friccion = { valor: t.friccion, fuente: "supuesto", confianza: 0.5 };
  lugar[IMPACT_SAMPLED] = {
    restitucion: t.restitucion,
    razon_impulso: t.razon_impulso,
    arrastre: t.arrastre,
  };
  for (const v of s.vehiculos as Json[]) {
    const id = String(v.id);
    v.velocidad_previa = { ...(v.velocidad_previa as Json), valor: t.kmh[id] };
    delete (v.velocidad_previa as Json).rango;
    v.masa = { ...(v.masa as Json), valor: t.masas[id] };
  }
  return s;
}

/** La escena como la ve el perito: nominal, con las posiciones finales medidas (con ruido). */
function escenaObservada(
  base: Json,
  reposos: Map<string, readonly [number, number, number]>,
  rng: PyRandom,
): Json {
  const s = clon(base);
  for (const v of s.vehiculos as Json[]) {
    const p = reposos.get(String(v.id));
    if (!p) continue;
    v.posicion_final = {
      x: p[0] + rng.gauss(0, SIGMA_POSITION_M),
      y: p[1] + rng.gauss(0, SIGMA_POSITION_M),
      rumbo_deg: p[2] + rng.gauss(0, SIGMA_RUMBO_DEG),
      procedencia: { fuente: "usuario", confianza: 0.9 },
    };
  }
  return s;
}

interface Estimada {
  vehiculo: string;
  verdad: number;
  mejor: number;
  p10: number;
  p90: number;
  dentro: boolean;
}

function estima(obs: Json, t: Verdad): Estimada[] | null {
  let inv;
  try {
    inv = invert(obs, { samples: MUESTRAS });
  } catch {
    return null;
  }
  const out: Estimada[] = [];
  for (const e of inv.estimates) {
    if (e.param.kind !== "velocidad" || !e.identifiable || e.dist === null || e.best === null)
      continue;
    const verdad = t.kmh[String(e.param.vehicle)];
    if (verdad === undefined) continue;
    out.push({
      vehiculo: String(e.param.vehicle),
      verdad: r2(verdad),
      mejor: r2(e.best),
      p10: r2(e.dist.p10),
      p90: r2(e.dist.p90),
      dentro: verdad >= e.dist.p10 && verdad <= e.dist.p90,
    });
  }
  return out;
}

/** Intervalo de Wilson al 95 % de una proporción, en %. */
function wilson(k: number, n: number): [number, number] | null {
  if (!n) return null;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [r2((100 * (c - m)) / d), r2((100 * (c + m)) / d)];
}

const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return r2(o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2);
};

function resume(es: Estimada[]) {
  const k = es.filter((e) => e.dentro).length;
  const n = es.length;
  return {
    velocidades: n,
    dentro: k,
    cobertura_pct: n ? r2((100 * k) / n) : null,
    ic95_pct: wilson(k, n),
    ancho_mediano_kmh: mediana(es.map((e) => e.p90 - e.p10)),
    error_absoluto_mediano_kmh: mediana(es.map((e) => Math.abs(e.mejor - e.verdad))),
    // De qué lado queda la verdad cuando cae fuera: si casi siempre es del mismo, el rango está corrido.
    verdad_abajo_del_rango: es.filter((e) => e.verdad < e.p10).length,
    verdad_arriba_del_rango: es.filter((e) => e.verdad > e.p90).length,
  };
}

const t0 = Date.now();
const escenas: Json[] = [];
const todas: Record<"fijos" | "sorteados", Estimada[]> = { fijos: [], sorteados: [] };
for (const nombre of ESCENAS) {
  const base = limpia(
    JSON.parse(
      readFileSync(join(RAIZ, `packages/scene-schema/fixtures/${nombre}.json`), "utf8"),
    ) as Json,
  );
  const rng = new PyRandom(SEMILLA + nombre.length * 7919);
  const por: Record<"fijos" | "sorteados", Estimada[]> = { fijos: [], sorteados: [] };
  let sinIntegrar = 0;
  let sinEstimar = 0;
  for (let k = 0; k < CASOS; k++) {
    const verdad = sorteaVerdad(base, rng);
    let reposos: Map<string, readonly [number, number, number]>;
    try {
      const rec = reconstruct(escenaVerdadera(base, verdad));
      reposos = new Map(rec.vehiculos.map((v) => [v.id, v.restPose]));
    } catch {
      sinIntegrar++;
      continue;
    }
    const obs = escenaObservada(base, reposos, rng);
    const fijos = conSupuestosFijos(() => estima(obs, verdad));
    const sorteados = estima(obs, verdad);
    if (!fijos || !sorteados) {
      sinEstimar++;
      continue;
    }
    por.fijos.push(...fijos);
    por.sorteados.push(...sorteados);
    if ((k + 1) % 10 === 0)
      console.error(
        `${nombre}: ${k + 1} de ${CASOS} casos (${Math.round((Date.now() - t0) / 1000)} s)`,
      );
  }
  todas.fijos.push(...por.fijos);
  todas.sorteados.push(...por.sorteados);
  escenas.push({
    escena: nombre,
    casos: CASOS,
    sin_integrar: sinIntegrar,
    sin_estimar: sinEstimar,
    supuestos_fijos: resume(por.fijos),
    supuestos_sorteados: resume(por.sorteados),
  });
}

const git = (() => {
  try {
    return execSync("git rev-parse --short=8 HEAD", { cwd: RAIZ }).toString().trim();
  } catch {
    return null;
  }
})();
const resultado = {
  name: "t3_cobertura",
  generated_at: new Date().toISOString(),
  git_commit: git,
  descripcion:
    "Cobertura sintética del p10–p90 de la inversión: casos fabricados con velocidad verdadera conocida, medidos con los tres supuestos del impacto fijos (como antes del ADR 0139) y sorteados (como ahora). Un p10–p90 calibrado contiene la verdad cerca del 80 % de las veces.",
  limite:
    "La verdad sale del mismo modelo que la inversión: mide la propagación de la incertidumbre dentro del modelo, no su parecido con un choque real.",
  semilla: SEMILLA,
  casos_por_escena: CASOS,
  muestras_de_la_inversion: MUESTRAS,
  ruido: { posicion_m: SIGMA_POSITION_M, rumbo_deg: SIGMA_RUMBO_DEG },
  verdad: {
    velocidad: `${VELOCIDAD[0]} a ${VELOCIDAD[1]} veces la del relato de la escena`,
    masa: `±${100 * MASS_SPREAD} %`,
    friccion: "el rango de la tabla para la superficie",
    restitucion: [RESTITUTION[1], RESTITUTION[2]],
    razon_impulso: [IMPULSE_RATIO_RANGE[1], IMPULSE_RATIO_RANGE[2]],
    arrastre: [POST_IMPACT_DRAG[1], POST_IMPACT_DRAG[2]],
  },
  esperado_pct: 80,
  total: {
    supuestos_fijos: resume(todas.fijos),
    supuestos_sorteados: resume(todas.sorteados),
  },
  escenas,
  segundos: Math.round((Date.now() - t0) / 1000),
};
writeFileSync(SALIDA, `${JSON.stringify(resultado, null, 2)}\n`);
console.log(JSON.stringify({ total: resultado.total, segundos: resultado.segundos }, null, 1));
