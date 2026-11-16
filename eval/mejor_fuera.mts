/**
 * ¿En cuántos casos el mejor ajuste queda fuera de su propio rango? (hallado el 2026-11-15).
 *
 * El mejor ajuste usa la evidencia y los supuestos en su valor nominal; el rango es el p10–p90 de
 * las simulaciones, que los sortean. Si la solución depende mucho de ellos, el nominal puede caer
 * fuera, y la pantalla mostraba «102 km/h, rango 72–99» sin decirlo. Desde hoy va como límite
 * (`packages/cesvi/src/mejor-fuera.ts`). Aquí se cuenta qué tan seguido pasa, sin llamar a la API:
 *
 * - en los 205 reportes de la prueba congelada, como los reconstruye la E-R4 (el expediente leído
 *   de la narración, `data/cesvi/r4/pagina.json`), con las simulaciones de producción;
 * - en AXA, como lo arma la app.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/mejor_fuera.mts
 *     → eval/results/mejor_fuera.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Expediente } from "../packages/cesvi/src/index.ts";
import { HOLGURA_FUERA_KMH, mejorFueraDelRango } from "../packages/cesvi/src/mejor-fuera.ts";
import { reconstruirExpediente } from "../packages/cesvi/src/reconstruccion.ts";
import { PRODUCTION_SAMPLES } from "../packages/solver-ts/src/full-result.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, "eval/results/mejor_fuera.json");
const pagina = JSON.parse(readFileSync(join(RAIZ, "data/cesvi/r4/pagina.json"), "utf8")) as {
  casos: { id: string; expediente: Expediente }[];
};

const cuenta = {
  casos: 0,
  no_se_reconstruyen: 0,
  casos_con_rango: 0,
  casos_con_el_mejor_ajuste_fuera: 0,
  vehiculos_con_rango: 0,
  vehiculos_fuera: 0,
  por_arriba: 0,
  por_debajo: 0,
};
const fuera: { id: string; vehiculo: string; mejor: number; p10: number; p90: number }[] = [];
const t0 = Date.now();
for (const c of pagina.casos) {
  cuenta.casos++;
  let r;
  try {
    r = reconstruirExpediente(c.expediente, c.id, PRODUCTION_SAMPLES);
  } catch {
    cuenta.no_se_reconstruyen++;
    continue;
  }
  let conRango = false;
  let algunoFuera = false;
  for (const v of r.velocidades) {
    const e = v.previa;
    if (e?.p10 === undefined || e.p90 === undefined || e.mejor === undefined) continue;
    conRango = true;
    cuenta.vehiculos_con_rango++;
    const lado = mejorFueraDelRango(e);
    if (!lado) continue;
    algunoFuera = true;
    cuenta.vehiculos_fuera++;
    if (lado === "arriba") cuenta.por_arriba++;
    else cuenta.por_debajo++;
    fuera.push({ id: c.id, vehiculo: v.vehiculo, mejor: e.mejor, p10: e.p10, p90: e.p90 });
  }
  if (conRango) cuenta.casos_con_rango++;
  if (algunoFuera) cuenta.casos_con_el_mejor_ajuste_fuera++;
  if (cuenta.casos % 20 === 0)
    console.log(`${cuenta.casos} casos, ${Math.round((Date.now() - t0) / 1000)} s`);
}

const resultado = {
  descripcion:
    "Casos en los que el mejor ajuste de una velocidad queda fuera del p10–p90 de sus simulaciones (más de la holgura). Los 205 reportes de la prueba congelada, con el expediente leído de la narración (como la E-R4) y las simulaciones de producción. Sin llamar a la API. Si `casos_con_rango` es 0, la narración sola no trae evidencia que fije una velocidad (posiciones, reposos), así que ningún reporte tiene rango y el aviso no puede aparecer: solo aparece en casos que el perito coloca en el mapa.",
  script: "eval/mejor_fuera.mts",
  fecha: new Date().toISOString(),
  muestras: PRODUCTION_SAMPLES,
  holgura_kmh: HOLGURA_FUERA_KMH,
  segundos: Math.round((Date.now() - t0) / 1000),
  ...cuenta,
  fuera,
};
writeFileSync(SALIDA, JSON.stringify(resultado, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ...cuenta, segundos: resultado.segundos }));
