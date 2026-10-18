/**
 * E5, paso de ajuste (F10, ADR 0033): elige la forma y el ancho del daño por cara y zona del CDC
 * **solo con desarrollo**. Para cada grupo (frente/trasera o costado, y zona):
 *
 * - **Ancho:** la mediana de L medido / largo de la cara en desarrollo (las dos fuentes).
 * - **Forma:** las cinco que ya tiene Croquis y una empírica de desarrollo.
 * - **Adopción:** un candidato solo si ninguna métrica empeora respecto a la regla actual; entre
 *   ellos, el de menor error por punto. Si ninguno cumple, se queda la regla actual.
 *
 * Mide con el perfil del solver en las estaciones reales (la malla lo reproduce con una mediana
 * ≤ 0.3 cm por estación; `mallaEnEstacionesSolver` en `e5_desarrollo.json`). La confirmación con la
 * malla es la corrida completa de `e5_dano.ts`. Los postes y objetos angostos no entran: su forma
 * sale de `narrowObject`.
 *
 * Uso: `pnpm --filter @croquis/eval-js exec tsx e5_ajuste.ts` → `eval/results/e5_ajuste.json`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bodyFor,
  crushCenter,
  crushShapeAndWidth,
  profileForEnergy,
  TRIANGULAR_SHAPES,
  type Body2D,
  type Stiffness,
} from "@croquis/solver-ts";
import { buildVehicle } from "@croquis/viewer";
import type { Group } from "three";
import {
  area,
  cdcFor,
  dimensions,
  measuredInCroquisOrder,
  measuredStations,
  predict,
  profileAt,
  profileWidth,
  validMeasurement,
  type Caso,
} from "./e5/reproducir";
import { adopt, MIN_ORDERED, type Resumen } from "./e5/ajuste";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const SHAPES = ["uniforme", "izquierda", "derecha", "centro", "poste"] as const;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
const cm = (x: number) => Math.round(x * 10000) / 100;

interface Item {
  c: Caso;
  energy: number;
  k: Stiffness;
  side: number;
  body: Body2D;
  group: Group | null;
  ordered: number[] | null;
}

const meshCache = new Map<string, Group>();
function meshFor(c: Caso): Group {
  const d = dimensions(c)!;
  const key = `${c.clase}|${d.length}|${d.width}|${d.wheelbase}`;
  let g = meshCache.get(key);
  if (!g) {
    g = buildVehicle(c.clase, d);
    meshCache.set(key, g);
  }
  return g;
}

/** Errores de una regla (forma, fracción del ancho) en un caso, con el perfil del solver. */
function errors(it: Item, shape: readonly number[], width: number) {
  const cdc = cdcFor(it.c);
  const centro = crushCenter(cdc, it.body, width);
  const perfil = profileForEnergy(it.energy, width, it.k, shape);
  const pred = { energiaJ: it.energy, perfil, ancho: width, centro, k: it.k };
  const stations = measuredStations(it.c, pred, it.group ?? meshFor(it.c));
  if (typeof stations === "string") return null;
  const at = stations.map((u) => profileAt(perfil, centro, width, u));
  const meas = it.c.perfil_m;
  return {
    punto:
      it.ordered && it.c.fuente === "ciss"
        ? at.reduce((s, v, i) => s + Math.abs(v - it.ordered![i]!), 0) / 6
        : null,
    maximo: Math.abs(Math.max(...at) - Math.max(...meas)),
    ancho: Math.abs(profileWidth(perfil, width) - it.c.ancho_dano_m),
    area: Math.abs(area(at, it.c.ancho_dano_m) - area(meas, it.c.ancho_dano_m)),
  };
}

function summarize(items: Item[], shape: readonly number[], frac: number | null): Resumen {
  const es = items
    .map((it) => {
      const [curShape, curWidth] = crushShapeAndWidth(cdcFor(it.c), it.body);
      return frac === null ? errors(it, curShape, curWidth) : errors(it, shape, frac * it.side);
    })
    .filter((e) => e !== null);
  const pts = es.map((e) => e.punto).filter((x) => x !== null);
  return {
    n: es.length,
    n_punto: pts.length,
    punto: pts.length ? cm(median(pts)) : null,
    maximo: cm(median(es.map((e) => e.maximo))),
    ancho: cm(median(es.map((e) => e.ancho))),
    area: cm(median(es.map((e) => e.area))),
  };
}

const mirror = (p: readonly number[]) => [...p].reverse();

/**
 * Forma empírica por grupo (ADR 0033): media de los perfiles de CISS con orden conocido,
 * normalizados a su máximo; espejos juntos en frente y trasera, simétrica en D, C y P; máximo 1,
 * piso 0.05 y dos decimales. Solo con ≥ 15 casos ordenados.
 */
function empiricalShapes(groups: Map<string, Item[]>) {
  const norm = (key: string) =>
    (groups.get(key) ?? [])
      .filter((it) => it.c.fuente === "ciss" && it.ordered && Math.max(...it.ordered) > 0)
      .map((it) => it.ordered!.map((x) => x / Math.max(...it.ordered!)));
  const finish = (ps: number[][]) => {
    const m = Array.from({ length: 6 }, (_, i) => ps.reduce((s, p) => s + p[i]!, 0) / ps.length);
    const top = Math.max(...m);
    return m.map((x) => Math.max(0.05, Math.round((x / top) * 100) / 100));
  };
  const out = new Map<string, { shape: number[]; n: number }>();
  const put = (key: string, ps: number[][], symmetric: boolean) => {
    if (ps.length < MIN_ORDERED) return;
    out.set(key, { shape: finish(symmetric ? [...ps, ...ps.map(mirror)] : ps), n: ps.length });
  };
  for (const [a, b] of [
    ["FB:L", "FB:R"],
    ["FB:Y", "FB:Z"],
  ] as const) {
    const ps = [...norm(a), ...norm(b).map(mirror)];
    put(a, ps, false);
    if (out.has(a)) out.set(b, { shape: mirror(out.get(a)!.shape), n: ps.length });
  }
  for (const k of ["FB:D", "FB:C", "LR:P", "LR:D"]) put(k, norm(k), true);
  for (const k of ["LR:F", "LR:B", "LR:Y", "LR:Z"]) put(k, norm(k), false);
  return out;
}

function gitCommit(): string | null {
  try {
    const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
      .toString()
      .trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
      cwd: ROOT,
    }).toString();
    return dirty.trim() ? `${head}-modificado` : head;
  } catch {
    return null;
  }
}

function main() {
  const cases = readFileSync(resolve(ROOT, "eval/e5/casos.jsonl"), "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Caso)
    .filter((c) => !c.test && validMeasurement(c))
    .filter((c) => c.obstaculo !== "poste" && c.obstaculo !== "objeto_angosto");
  const groups = new Map<string, Item[]>();
  for (const c of cases) {
    const p = predict(c);
    if (typeof p === "string") continue;
    const d = dimensions(c)!;
    const fb = c.lado === "F" || c.lado === "B";
    const item: Item = {
      c,
      energy: p.energiaJ,
      k: p.k,
      side: fb ? d.width : d.length,
      body: bodyFor(c.clase, c.masa_kg, d.length, d.width),
      group: null,
      ordered: measuredInCroquisOrder(c),
    };
    const key = `${fb ? "FB" : "LR"}:${cdcFor(c).zona_horizontal}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const emp = empiricalShapes(groups);
  const out: Record<string, unknown> = {};
  for (const [key, items] of [...groups].sort()) {
    const frac = median(items.map((it) => it.c.ancho_dano_m / it.side));
    const actual = summarize(items, [], null);
    const shapes: Record<string, readonly number[]> = Object.fromEntries(
      SHAPES.map((s) => [s, TRIANGULAR_SHAPES[s]!]),
    );
    if (emp.has(key)) shapes.empirica = emp.get(key)!.shape;
    const candidatos: Record<string, Resumen> = {};
    for (const [name, shape] of Object.entries(shapes)) {
      candidatos[name] = summarize(items, shape, frac);
    }
    const [curShape] = crushShapeAndWidth(cdcFor(items[0]!.c), items[0]!.body);
    const current = SHAPES.find((s) => TRIANGULAR_SHAPES[s]!.join() === curShape.join())!;
    const elegida = adopt(actual, candidatos);
    out[key] = {
      n: items.length,
      fraccion_ancho_mediana: Math.round(frac * 1000) / 1000,
      forma_actual: current,
      forma_empirica: emp.get(key) ?? null,
      eleccion: elegida ?? "regla_actual",
      forma_elegida: elegida ? shapes[elegida] : null,
      actual,
      candidatos,
    };
    console.log(key, items.length, frac.toFixed(3), current, "→", elegida ?? "regla actual");
  }
  const doc = {
    name: "e5_ajuste",
    generated_at: new Date().toISOString(),
    git_commit: gitCommit(),
    particion: "desarrollo",
    metodo:
      "ADR 0033: ancho = mediana de L/largo de la cara; formas = las cinco de Croquis y la empírica de " +
      "desarrollo; se adopta un candidato solo si ninguna métrica empeora respecto a la regla actual (por " +
      "punto con ≥ 15 casos ordenados de CISS) y gana el de menor error por punto. Errores absolutos en " +
      "cm (área en cm·m), perfil del solver en las estaciones reales.",
    grupos: out,
  };
  writeFileSync(
    resolve(ROOT, "eval/results/e5_ajuste.json"),
    `${JSON.stringify(doc, null, 2)}\n`,
    "utf-8",
  );
}

main();
