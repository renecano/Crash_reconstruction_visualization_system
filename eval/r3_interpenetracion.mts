/**
 * R3 (docs/cesvi/PLAN-CESVI.md): cuánto se atraviesan los vehículos en las reconstrucciones.
 *
 * Para cada par de vehículos y cada instante de la trayectoria del solver, la penetración de sus
 * cajas (largo × ancho, rectángulos orientados) por el teorema del eje separador: el traslape mínimo
 * entre los cuatro ejes. En el impacto, penetrar hasta la profundidad de aplastamiento es físico (es
 * la deformación); lo que pasa de ahí es atravesarse. Se reporta, por escena, el exceso máximo sobre
 * la suma de los aplastamientos máximos del par y en qué instante.
 *
 * Uso (desde packages/cesvi): pnpm exec tsx ../../eval/r3_interpenetracion.mts
 *   → eval/results/r3_interpenetracion.json
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reconstruct, reconstructionToDict } from "../packages/solver-ts/src/index";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(RAIZ, "packages/scene-schema/fixtures");

interface Vehiculo {
  id: string;
  dimensiones: { largo_m: number; ancho_m: number };
  trayectoria: { t: number[]; x: number[]; y: number[]; rumbo: number[] };
  dano?: { perfil_m?: number[] };
}

type P = [number, number];

function esquinas(x: number, y: number, r: number, largo: number, ancho: number): P[] {
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hl = largo / 2;
  const hw = ancho / 2;
  return [
    [hl, hw],
    [hl, -hw],
    [-hl, -hw],
    [-hl, hw],
  ].map(([a, b]) => [x + a! * c - b! * s, y + a! * s + b! * c]);
}

/** Penetración de dos rectángulos convexos (0 si no se tocan): traslape mínimo sobre los ejes. */
export function penetracion(a: P[], b: P[]): number {
  let minimo = Infinity;
  for (const poli of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p = poli[i]!;
      const q = poli[(i + 1) % 4]!;
      const n: P = [q[1] - p[1], p[0] - q[0]];
      const l = Math.hypot(n[0], n[1]);
      const eje: P = [n[0] / l, n[1] / l];
      const pa = a.map((v) => v[0] * eje[0] + v[1] * eje[1]);
      const pb = b.map((v) => v[0] * eje[0] + v[1] * eje[1]);
      const o =
        Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (o <= 0) return 0;
      minimo = Math.min(minimo, o);
    }
  }
  return minimo;
}

function medir(nombre: string, resultado: { vehiculos: Vehiculo[] }) {
  const vs = resultado.vehiculos.filter((v) => v.trayectoria?.t?.length);
  const pares: Json[] = [];
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      const a = vs[i]!;
      const b = vs[j]!;
      const aplast =
        Math.max(0, ...(a.dano?.perfil_m ?? [0])) + Math.max(0, ...(b.dano?.perfil_m ?? [0]));
      let peor = { t: 0, penetracion: 0 };
      const n = Math.min(a.trayectoria.t.length, b.trayectoria.t.length);
      for (let k = 0; k < n; k++) {
        const ea = esquinas(
          a.trayectoria.x[k]!,
          a.trayectoria.y[k]!,
          a.trayectoria.rumbo[k]!,
          a.dimensiones.largo_m,
          a.dimensiones.ancho_m,
        );
        const eb = esquinas(
          b.trayectoria.x[k]!,
          b.trayectoria.y[k]!,
          b.trayectoria.rumbo[k]!,
          b.dimensiones.largo_m,
          b.dimensiones.ancho_m,
        );
        const p = penetracion(ea, eb);
        if (p > peor.penetracion) peor = { t: a.trayectoria.t[k]!, penetracion: p };
      }
      pares.push({
        par: `${a.id}/${b.id}`,
        penetracion_max_m: Number(peor.penetracion.toFixed(3)),
        t_s: Number(peor.t.toFixed(3)),
        aplastamiento_m: Number(aplast.toFixed(3)),
        exceso_m: Number(Math.max(0, peor.penetracion - aplast).toFixed(3)),
      });
    }
  }
  return { escena: nombre, pares };
}

type Json = Record<string, unknown>;

const escenas = readdirSync(FIXTURES)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => {
    const spec = JSON.parse(readFileSync(join(FIXTURES, f), "utf8")) as Json;
    const r = reconstructionToDict(reconstruct(spec)) as unknown as { vehiculos: Vehiculo[] };
    return medir(f.replace(".json", ""), r);
  });

const pares = escenas.flatMap((e) => e.pares as { exceso_m: number }[]);
const resultado = {
  fecha: new Date().toISOString(),
  descripcion:
    "Penetración de las cajas de los vehículos (rectángulos orientados) en las escenas canónicas reconstruidas con el solver TS; exceso = lo que pasa de la suma de los aplastamientos máximos del par.",
  pares: pares.length,
  con_exceso: pares.filter((p) => p.exceso_m > 0.01).length,
  exceso_max_m: Math.max(0, ...pares.map((p) => p.exceso_m)),
  escenas,
};
writeFileSync(
  join(RAIZ, "eval/results/r3_interpenetracion.json"),
  `${JSON.stringify(resultado, null, 2)}\n`,
);
console.log(
  `${resultado.con_exceso}/${resultado.pares} pares se atraviesan más de 1 cm; exceso máximo ${resultado.exceso_max_m} m`,
);
for (const e of escenas) for (const p of e.pares) console.log(e.escena, JSON.stringify(p));
