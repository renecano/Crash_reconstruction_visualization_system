import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { caso3dErrors } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { casosCompletos } from "./bateria-completa";
import { resumenDelPaquete } from "./bateria-ciudad";

const RAIZ = resolve(__dirname, "../../../../..");

/**
 * Arma la batería completa del visor 3D en `CROQUIS_BATERIA_COMPLETA_DIR` (una carpeta por grupo) y
 * su índice en eval/results/unity_bateria_completa/indice.json. Unos 10 min; solo a mano:
 *
 *   CROQUIS_BATERIA_COMPLETA_DIR=D:/dev-cache/bateria-completa pnpm --filter @croquis/web exec vitest run src/lib/visor-unity/bateria-completa.test.ts
 */
describe("la batería completa del visor 3D", () => {
  it.skipIf(!process.env.CROQUIS_BATERIA_COMPLETA_DIR)(
    "arma los paquetes",
    () => {
      const dir = resolve(process.env.CROQUIS_BATERIA_COMPLETA_DIR!);
      const filas: Record<string, unknown>[] = [];
      for (const c of casosCompletos(RAIZ)) {
        const t0 = performance.now();
        try {
          const p = c.paquete(RAIZ);
          const errores = caso3dErrors(p as never);
          mkdirSync(resolve(dir, c.grupo), { recursive: true });
          writeFileSync(resolve(dir, c.grupo, `${c.clave}.json`), JSON.stringify(p) + "\n");
          filas.push({
            grupo: c.grupo,
            clave: c.clave,
            que: c.que,
            ms_armado: Math.round(performance.now() - t0),
            errores_de_esquema: errores.slice(0, 3),
            ...resumenDelPaquete(p),
          });
        } catch (e) {
          filas.push({
            grupo: c.grupo,
            clave: c.clave,
            que: c.que,
            no_se_armo: String(e).slice(0, 300),
          });
        }
      }
      const salida = resolve(RAIZ, "eval/results/unity_bateria_completa");
      mkdirSync(salida, { recursive: true });
      writeFileSync(
        resolve(salida, "indice.json"),
        JSON.stringify(
          {
            descripcion:
              "La batería completa del visor 3D: cada caso como paquete caso-3d (apps/web/src/lib/visor-unity/bateria-completa.ts), sin red. Los paquetes no van a git (unos 230).",
            fecha: new Date().toISOString(),
            casos: filas,
          },
          null,
          2,
        ) + "\n",
      );
      expect(filas.length).toBeGreaterThan(200);
    },
    3_600_000,
  );
});
