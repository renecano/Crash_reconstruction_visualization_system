/**
 * W8 · T3.2: dónde queda el choque en el mejor ajuste de la inversión, contra el punto de impacto
 * que declara la escena, en las escenas de referencia que cambian. Corre con el solver de la copia
 * de trabajo (una vez con el de `main` y otra con el nuevo).
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/w8_choque_referencias.mts <etiqueta>
 *     → eval/results/w8/choque_referencias_<etiqueta>.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyValues, invert } from "../packages/solver-ts/src/inversion.ts";
import { reconstruct } from "../packages/solver-ts/src/reconstruct.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = join(RAIZ, "packages/scene-schema/fixtures");
const etiqueta = process.argv[2] ?? "actual";
const ESCENAS = [
  "interseccion_toluca",
  "lateral_interseccion",
  "glorieta",
  "motociclista",
  "volcadura",
];
const r2 = (x: number) => Math.round(x * 100) / 100;

const filas = ESCENAS.map((nombre) => {
  const spec = JSON.parse(readFileSync(join(F, `${nombre}.json`), "utf8")) as Json;
  const ev = ((spec.eventos ?? []) as Json[]).find((e) => String(e.tipo).startsWith("impacto"));
  const decl = ev?.punto_impacto as { x: number; y: number } | undefined;
  const inv = invert(spec);
  const r = reconstruct(applyValues(spec, inv.best.values), { dt: 0.1 });
  const pi = r.puntoImpacto;
  const residuos = Object.fromEntries(
    [...inv.best.residuals].filter(([, v]) => Math.abs(v) > 0.3).map(([k, v]) => [k, r2(v)]),
  );
  const fila = {
    escena: nombre,
    punto_declarado: decl ? [decl.x, decl.y] : null,
    fuente_del_punto: (ev?.procedencia as Json | undefined)?.fuente ?? null,
    valores: Object.fromEntries([...inv.best.values].map(([k, v]) => [k, r2(v)])),
    costo: r2(inv.best.cost),
    residuos_mayores: residuos,
    choque_en_el_mejor_ajuste: pi ? [r2(pi[0]), r2(pi[1])] : null,
    distancia_al_punto_declarado_m:
      pi && decl ? r2(Math.hypot(pi[0] - decl.x, pi[1] - decl.y)) : null,
  };
  console.log(JSON.stringify(fila));
  return fila;
});
mkdirSync(join(RAIZ, "eval/results/w8"), { recursive: true });
writeFileSync(
  join(RAIZ, `eval/results/w8/choque_referencias_${etiqueta}.json`),
  `${JSON.stringify({ etiqueta, generated_at: new Date().toISOString().slice(0, 19) + "Z", escenas: filas }, null, 2)}\n`,
);
