/**
 * La revisión de la cadena por tandas, según la memoria libre (René, 2026-11-26: en la laptop de 8 GB
 * la de los 205 + 42 se quedó sin memoria con un navegador abierto). Cada tanda es un proceso de vitest
 * nuevo con `CROQUIS_DESDE`/`CROQUIS_HASTA`; su tamaño sale de `casosPorTanda` y, sin memoria, espera.
 *
 *   pnpm --filter @croquis/cesvi exec tsx ../../eval/auditoria_por_tandas.mts nuevas [--de-nuevo]
 *   pnpm --filter @croquis/cesvi exec tsx ../../eval/auditoria_por_tandas.mts prueba [--de-nuevo]
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { freemem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { casosPorTanda } from "../apps/web/src/lib/auditoria/memoria";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fuente = process.argv[2];
if (fuente !== "prueba" && fuente !== "nuevas")
  throw new Error("Uso: auditoria_por_tandas.mts <prueba|nuevas> [--de-nuevo]");
const deNuevo = process.argv.includes("--de-nuevo");
const total =
  fuente === "prueba"
    ? (
        JSON.parse(readFileSync(join(RAIZ, "data/cesvi/corpus/particion.json"), "utf8")) as {
          prueba: string[];
        }
      ).prueba.length
    : (
        JSON.parse(
          readFileSync(join(RAIZ, "data/cesvi/narraciones-auditoria/narraciones.json"), "utf8"),
        ) as { narraciones: unknown[] }
      ).narraciones.length;
const libre = () => freemem() / 1048576;
const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
let desde = 0;
let esperado = 0;
while (desde < total) {
  const n = casosPorTanda(libre());
  if (n === 0) {
    if (esperado >= 600_000)
      throw new Error(
        `Sin memoria libre por 10 min: se detiene en el caso ${desde} (se retoma con CROQUIS_DESDE=${desde}).`,
      );
    console.log(`Memoria libre ${Math.round(libre())} MB: espero 30 s.`);
    await dormir(30_000);
    esperado += 30_000;
    continue;
  }
  esperado = 0;
  const hasta = Math.min(total, desde + n);
  console.log(`Casos ${desde}–${hasta - 1} de ${total} (memoria libre ${Math.round(libre())} MB).`);
  const r = spawnSync("pnpm", ["exec", "vitest", "run", "src/lib/auditoria/auditoria.test.ts"], {
    cwd: join(RAIZ, "apps/web"),
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      CROQUIS_AUDITORIA: fuente,
      CROQUIS_DESDE: String(desde),
      CROQUIS_HASTA: String(hasta),
      ...(deNuevo ? { CROQUIS_DE_NUEVO: "1" } : {}),
    },
  });
  if (r.status !== 0) throw new Error(`La tanda ${desde}–${hasta - 1} falló (código ${r.status}).`);
  desde = hasta;
}
console.log(`Listo: ${total} casos de «${fuente}».`);
