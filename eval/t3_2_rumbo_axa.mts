/**
 * T3.2 (W8): por qué el rumbo inicial de V2 en AXA queda en el límite de búsqueda (+20° sobre el
 * que colocó la app). Solo diagnostica: no cambia el solver (René, 2026-11-12: «primero diagnostica
 * la causa y escríbela en W.md, antes de cambiar el solver»).
 *
 * 1. **El ajuste de hoy:** valores, cuáles quedan en el límite, residuos y costo.
 * 2. **La geometría:** dónde arranca V2, hacia dónde apunta la vía y qué mueve girar el rumbo en el
 *    arranque (el giro es alrededor de la posición inicial, 12 m antes del impacto).
 * 3. **El perfil del rumbo de V2:** con el rumbo de V2 fijo de −20° a +60° del inicial y lo demás
 *    reajustado, el costo, la velocidad de V2 y los residuos que más pesan. Dice si el mínimo está
 *    fuera del límite y qué evidencia lo empuja.
 *
 * La escena es la de la app (`axa-reconstruccion.ts`), como `axa_rango_estable.mts`.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/t3_2_rumbo_axa.mts → eval/results/t3_2_rumbo_axa.json
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expedienteAxaReconstruccion } from "../apps/web/src/lib/axa-reconstruccion.ts";
import { especDeExpediente } from "../packages/cesvi/src/reconstruccion.ts";
import {
  applyValues,
  evidenceFromSpec,
  fitEvidence,
  invert,
  parameters,
} from "../packages/solver-ts/src/inversion.ts";
import { reconstruct } from "../packages/solver-ts/src/reconstruct.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.argv[2] ?? join(RAIZ, "eval/results/t3_2_rumbo_axa.json");
const r2 = (x: number) => Math.round(x * 100) / 100;

const base = especDeExpediente(expedienteAxaReconstruccion());
const spec = base.spec as Json;
const id = (x: string) => Object.entries(base.ids).find(([, e]) => e === x)![0];
const V1 = id("V1");
const V2 = id("V2");
const vehs = spec.vehiculos as Json[];
const pose = (v: string) => (vehs.find((x) => x.id === v)!.posicion_inicial ?? {}) as Json;
const finalDe = (v: string) =>
  (vehs.find((x) => x.id === v)!.posicion_final ?? null) as Json | null;

// --- 1. El ajuste de hoy ---------------------------------------------------------------------------
const inv = invert(spec).toDict() as Json;
const ev = evidenceFromSpec(spec);
const params = parameters(spec, ev);
const ajuste = {
  evidencia: inv.evidencia,
  parametros: (inv.parametros as Json[]).map((p) => ({
    parametro: p.parametro,
    vehiculo: p.vehiculo === V1 ? "V1" : p.vehiculo === V2 ? "V2" : p.vehiculo,
    identificable: p.identificable,
    en_limite: p.en_limite,
    mejor: (p.estimacion as Json | undefined)?.mejor,
    p10: (p.estimacion as Json | undefined)?.p10,
    p90: (p.estimacion as Json | undefined)?.p90,
  })),
  limites: params.map((p) => ({
    parametro: p.name,
    inicio: r2(p.start),
    lo: r2(p.lo),
    hi: r2(p.hi),
  })),
  residuos: inv.residuos,
};
console.log(JSON.stringify(ajuste, null, 1));

// --- 2. La geometría -------------------------------------------------------------------------------
const rec = reconstruct(spec, { dt: 0.1 });
const geometria = {
  V1: { inicial: pose(V1), final: finalDe(V1) },
  V2: { inicial: pose(V2), final: finalDe(V2) },
  punto_impacto_reconstruido: rec.puntoImpacto,
  nota:
    "rumbo_deg en el marco de la escena (grados desde +x hacia +y). El parámetro de rumbo gira la " +
    "pose inicial alrededor de su posición: a d metros del impacto, girar θ mueve el impacto d·sen θ " +
    "de lado.",
};

// --- 3. El perfil del rumbo de V2 ------------------------------------------------------------------
const mejor = new Map<string, number>();
for (const p of ajuste.parametros) {
  const nombre = `${p.parametro === "velocidad_previa" ? "velocidad" : "rumbo"}:${p.vehiculo === "V1" ? V1 : p.vehiculo === "V2" ? V2 : p.vehiculo}`;
  if (typeof p.mejor === "number") mejor.set(nombre, p.mejor);
}
const h0 = Number(pose(V2).rumbo_deg);
const nombreRumboV2 = `rumbo:${V2}`;
const libres = new Set(params.map((p) => p.name).filter((n) => n !== nombreRumboV2));
const perfil = [];
for (let d = -20; d <= 60; d += 5) {
  const s = applyValues(spec, new Map([[nombreRumboV2, h0 + d]]));
  const inicio = new Map([...mejor].filter(([k]) => k !== nombreRumboV2));
  const f = fitEvidence(s, ev, { start: inicio, free: libres, maxNfev: 80 });
  const residuos = [...f.residuals]
    .map(([k, v]) => [k.replace(V1, "V1").replace(V2, "V2"), r2(v)] as const)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const fila = {
    giro_deg: d,
    rumbo_deg: r2(h0 + d),
    costo: r2(f.cost),
    v2_kmh: r2(f.values.get(`velocidad:${V2}`) ?? NaN),
    v1_kmh: r2(f.values.get(`velocidad:${V1}`) ?? NaN),
    rumbo_v1_deg: f.values.has(`rumbo:${V1}`) ? r2(f.values.get(`rumbo:${V1}`)!) : null,
    residuos_mayores: Object.fromEntries(residuos.slice(0, 6)),
  };
  console.log(JSON.stringify(fila));
  perfil.push(fila);
}

// --- 4. El perfil fino (cada grado de −25° a +25°) con el punto de impacto ---------------------------
const fino = [];
for (let d = -25; d <= 25; d += 1) {
  const s = applyValues(spec, new Map([[nombreRumboV2, h0 + d]]));
  const inicio = new Map([...mejor].filter(([k]) => k !== nombreRumboV2));
  const f = fitEvidence(s, ev, { start: inicio, free: libres, maxNfev: 80 });
  const conValores = applyValues(s, f.values);
  const r = reconstruct(conValores, { dt: 0.1 });
  const v2r = r.vehiculos.find((v) => v.id === V2)!;
  const v1r = r.vehiculos.find((v) => v.id === V1)!;
  fino.push({
    giro_deg: d,
    costo: r2(f.cost),
    v2_kmh: r2(f.values.get(`velocidad:${V2}`) ?? NaN),
    v1_kmh: r2(f.values.get(`velocidad:${V1}`) ?? NaN),
    rumbo_v1_deg: f.values.has(`rumbo:${V1}`) ? r2(f.values.get(`rumbo:${V1}`)!) : null,
    punto_impacto: r.puntoImpacto ? [r2(r.puntoImpacto[0]), r2(r.puntoImpacto[1])] : null,
    reposo_v1: [r2(v1r.restPose[0]), r2(v1r.restPose[1]), r2(v1r.restPose[2])],
    reposo_v2: [r2(v2r.restPose[0]), r2(v2r.restPose[1]), r2(v2r.restPose[2])],
  });
  console.log(JSON.stringify(fino.at(-1)));
}

// --- 5. Con el rumbo de V2 fijo sobre la vía (el que colocó el perito) -------------------------------
const fijo = structuredClone(spec);
for (const v of fijo.vehiculos as Json[]) {
  if (v.id === V2) {
    const p = v.posicion_inicial as Json;
    p.procedencia = {
      fuente: "usuario",
      confianza: 0.9,
      nota: "diagnóstico T3.2: rumbo fijo sobre la vía",
    };
  }
}
const invFijo = invert(fijo).toDict() as Json;
const rumboFijo = {
  parametros: (invFijo.parametros as Json[]).map((p) => ({
    parametro: p.parametro,
    vehiculo: p.vehiculo === V1 ? "V1" : p.vehiculo === V2 ? "V2" : p.vehiculo,
    en_limite: p.en_limite,
    mejor: (p.estimacion as Json | undefined)?.mejor,
    p10: (p.estimacion as Json | undefined)?.p10,
    p90: (p.estimacion as Json | undefined)?.p90,
  })),
  residuos: invFijo.residuos,
};
console.log(JSON.stringify(rumboFijo));

const git = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim();
  } catch {
    return null;
  }
})();
writeFileSync(
  SALIDA,
  `${JSON.stringify(
    {
      name: "t3_2_rumbo_axa",
      generated_at: new Date().toISOString().slice(0, 19) + "Z",
      git_commit: git,
      ids: { V1, V2 },
      ajuste,
      geometria,
      perfil,
      perfil_fino: fino,
      rumbo_fijo_sobre_la_via: rumboFijo,
    },
    null,
    2,
  )}\n`,
);
