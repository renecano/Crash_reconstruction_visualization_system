/**
 * Valores de referencia de `dmath` para el port Python (`solver/croquis_solver/dmath.py`, ADR 0065):
 * una muestra fija de entradas por función con la salida exacta en hexadecimal. La prueba de Python
 * exige igualdad bit a bit. `--check` falla si el archivo no coincide con lo que calcula hoy `dmath`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as dmath from "../src/dmath";
import { PyRandom } from "../src/pyrandom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "..", "..", "solver", "tests", "data", "dmath_ts.json");
const check = process.argv.includes("--check");

const view = new DataView(new ArrayBuffer(8));
function hex(x: number): string {
  view.setFloat64(0, x);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}

const N = 400;
const rng = new PyRandom(20261022);
const uniform = (lo: number, hi: number) => lo + (hi - lo) * rng.random();
/** Magnitud log-uniforme entre 2^e0 y 2^e1, con signo al azar. */
const wide = (e0: number, e1: number, signed = true) => {
  const e = Math.floor(uniform(e0, e1));
  const v = (1 + rng.random()) * dmath.pow2(e);
  return signed && rng.random() < 0.5 ? -v : v;
};
const sample = (gen: () => number, extra: number[] = []) => [
  ...extra,
  ...Array.from({ length: N }, gen),
];

const SPECIAL = [0, -0, 1, -1, Math.PI, -Math.PI, Math.PI / 2, Math.PI / 4, 0.5, 2];
const unary: Record<string, [(x: number) => number, number[]]> = {
  sin: [dmath.sin, sample(() => (rng.random() < 0.7 ? uniform(-10, 10) : wide(-30, 40)), SPECIAL)],
  cos: [dmath.cos, sample(() => (rng.random() < 0.7 ? uniform(-10, 10) : wide(-30, 40)), SPECIAL)],
  tan: [dmath.tan, sample(() => (rng.random() < 0.7 ? uniform(-3, 3) : wide(-30, 30)), SPECIAL)],
  atan: [dmath.atan, sample(() => wide(-40, 70), SPECIAL)],
  acos: [dmath.acos, sample(() => uniform(-1, 1), [0, 1, -1, 0.5, -0.5, 1e-10])],
  exp: [dmath.exp, sample(() => uniform(-745, 709), [0, 1, -1, 0.5, 1e-10, -1e-10])],
  log: [dmath.log, sample(() => wide(-1074, 1023, false), [1, 2, 0.5, 1e-310, 1.0000001])],
};

const cases: Record<string, string[][]> = {};
for (const [name, [f, xs]] of Object.entries(unary)) {
  cases[name] = xs.map((x) => [hex(x), hex(f(x))]);
}
cases.atan2 = sample(() => 0).map((_, i) => {
  const y =
    i < 8 ? [0, -0, 1, -1, 0, 1, -1, 3][i]! : rng.random() < 0.5 ? uniform(-50, 50) : wide(-40, 40);
  const x =
    i < 8
      ? [0, 0, 0, 0, -0, -1, -1, 0.001][i]!
      : rng.random() < 0.5
        ? uniform(-50, 50)
        : wide(-40, 40);
  return [hex(y), hex(x), hex(dmath.atan2(y, x))];
});
cases.hypot = sample(() => 0).map(() => {
  const a = rng.random() < 0.7 ? uniform(-100, 100) : wide(-300, 300);
  const b = rng.random() < 0.7 ? uniform(-100, 100) : wide(-300, 300);
  return [hex(a), hex(b), hex(dmath.hypot(a, b))];
});
cases.hypotN = sample(() => 0).map(() => {
  const n = 2 + Math.floor(rng.random() * 4);
  const vs = Array.from({ length: n }, () => uniform(-100, 100));
  return [...vs.map(hex), hex(dmath.hypotN(vs))];
});

const text = `${JSON.stringify({ fuente: "packages/solver-ts/scripts/dmath-fixture.ts", casos: cases })}\n`;
if (check) {
  let have: string;
  try {
    have = readFileSync(out, "utf-8");
  } catch {
    have = "";
  }
  if (have !== text) {
    console.error("solver/tests/data/dmath_ts.json desactualizado: corre `pnpm generate`.");
    process.exit(1);
  }
  console.log("Valores de referencia de dmath al día.");
} else {
  writeFileSync(out, text, "utf-8");
  console.log(`Escrito ${out}`);
}
