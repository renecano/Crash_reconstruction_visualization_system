/**
 * Los casos para probar las cámaras del 3D (René, 2026-11-16, A6): AXA, una carambola de tres
 * vehículos y un peatón, de día. Escribe cada paquete caso-3d en `apps/visor-unity/Build/casos-camaras/`
 * y, en `camaras.json`, las cámaras de cada caso con su nombre, las mismas que ofrece la app
 * (`camarasDelCaso`).
 *
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-camaras.ts
 *   node tools/unity/camaras-capturas.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { armarCaso3d, caso3dErrors, type Caso3D } from "../../packages/scene-schema/src/caso3d";
import { escenarioDe } from "../../apps/web/src/components/visor-unity/escenario";
import type { EscenaSpec } from "../../packages/scene-schema/src/generated/escena.zod";
import type { Resultado } from "../../packages/scene-schema/src/generated/resultado.zod";
import { fullResult, PRODUCTION_SAMPLES } from "../../packages/solver-ts/src/full-result";
import { camarasDelCaso } from "../../apps/web/src/lib/visor-unity/camaras";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SALIDA = join(RAIZ, "apps/visor-unity/Build/casos-camaras");
const leer = <T>(p: string) => JSON.parse(readFileSync(join(RAIZ, p), "utf8")) as T;

const CASOS: { nombre: string; escena: EscenaSpec; resultado?: Resultado }[] = [
  { nombre: "axa", escena: leer<EscenaSpec>("demo/escenas-r11/axa.json") },
  ...(["carambola", "peaton_cruce"] as const).map((n) => {
    const c = leer<Caso3D>(`packages/scene-schema/fixtures/caso3d/${n}.json`);
    return { nombre: n, escena: c.escena, resultado: c.resultado };
  }),
];

const CARA: Record<string, string> = {
  F: "frontal",
  B: "posterior",
  L: "lateral_izquierdo",
  R: "lateral_derecho",
};

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });
const todas: Record<string, { modo: string; nombre: string; alImpacto?: boolean }[]> = {};
for (const c of CASOS) {
  const resultado =
    c.resultado ?? (fullResult(c.escena, PRODUCTION_SAMPLES) as unknown as Resultado);
  const p = armarCaso3d(c.escena, resultado, null, escenarioDe(c.escena, resultado));
  const errores = caso3dErrors(p);
  if (errores.length) throw new Error(`${c.nombre}:\n${errores.slice(0, 5).join("\n")}`);
  writeFileSync(join(SALIDA, `${c.nombre}.json`), JSON.stringify(p));
  const res = resultado as unknown as {
    vehiculos: {
      id: string;
      dimensiones?: { largo_m?: number };
      dano?: { cdc?: { lado?: string } };
    }[];
    personas?: { id: string; rol?: string }[];
  };
  todas[c.nombre] = camarasDelCaso(
    res.vehiculos.map((v, k) => {
      const letra = String.fromCharCode(65 + k);
      return {
        resId: v.id,
        letra,
        nombre: `Vehículo ${letra}`,
        cara: CARA[v.dano?.cdc?.lado ?? "F"] ?? "frontal",
        largoM: v.dimensiones?.largo_m,
      };
    }),
    (res.personas ?? []).map((x) => ({ id: x.id, rol: x.rol ?? "" })),
  ).map(({ modo, nombre, alImpacto }) => ({ modo, nombre, ...(alImpacto ? { alImpacto } : {}) }));
  console.log(`${c.nombre}: ${todas[c.nombre]!.length} cámaras`);
}
writeFileSync(join(SALIDA, "camaras.json"), `${JSON.stringify(todas, null, 2)}\n`);
