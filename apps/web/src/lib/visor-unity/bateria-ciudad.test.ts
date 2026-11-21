import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { caso3dErrors } from "@croquis/scene-schema";
import { leerCasoGuardado } from "@/lib/caso-guardado";
import { describe, expect, it } from "vitest";
import { CASOS_BATERIA, CASOS_HUMO, paqueteDeLaBateria, resumenDelPaquete } from "./bateria-ciudad";

const RAIZ = resolve(__dirname, "../../../../..");
const DIR = resolve(RAIZ, "packages/scene-schema/fixtures/caso3d-ciudad");

/**
 * La batería de ciudad (René, 2026-11-20). Con `CROQUIS_BATERIA=1` vuelve a armar los paquetes
 * (unos 30 s; `CROQUIS_BATERIA_DIR` para otra carpeta, p. ej. con el código de main):
 *
 *   CROQUIS_BATERIA=1 pnpm --filter @croquis/web exec vitest run src/lib/visor-unity/bateria-ciudad.test.ts
 *
 * Sin eso, solo revisa que los guardados cumplan el esquema (lo que Unity carga en su prueba).
 */
describe("la batería de ciudad del visor 3D", () => {
  it.skipIf(!process.env.CROQUIS_BATERIA)(
    "arma los paquetes",
    () => {
      const dir = process.env.CROQUIS_BATERIA_DIR ? resolve(process.env.CROQUIS_BATERIA_DIR) : DIR;
      mkdirSync(dir, { recursive: true });
      const indice: Record<string, unknown>[] = [];
      for (const c of CASOS_BATERIA) {
        const t0 = performance.now();
        const p = paqueteDeLaBateria(c, RAIZ);
        const ms = Math.round(performance.now() - t0);
        writeFileSync(resolve(dir, `${c.clave}.json`), JSON.stringify(p) + "\n");
        indice.push({
          clave: c.clave,
          que: c.que,
          lugar: c.lugar,
          ms_armado: ms,
          ...resumenDelPaquete(p),
        });
      }
      writeFileSync(
        resolve(dir, "indice.json"),
        JSON.stringify(
          {
            descripcion:
              "La batería de ciudad del visor 3D: el paquete caso-3d de cada caso, armado como en el navegador con lo de OpenStreetMap de data/osm/ (apps/web/src/lib/visor-unity/bateria-ciudad.ts).",
            casos: indice,
          },
          null,
          2,
        ) + "\n",
      );
      expect(indice).toHaveLength(CASOS_BATERIA.length);
      // Dos lugares de la batería como casos que se abren en la app (el humo de las tandas).
      if (!process.env.CROQUIS_BATERIA_DIR) {
        const base = JSON.parse(
          readFileSync(resolve(RAIZ, "data/cesvi/casos/tollocan-rene.croquis"), "utf8"),
        ) as Record<string, unknown>;
        for (const clave of CASOS_HUMO) {
          const c = CASOS_BATERIA.find((x) => x.clave === clave)!;
          const caso = {
            ...base,
            titulo: c.que,
            narracion: null,
            conclusion_perito: null,
            bitacora: [],
            expediente: c.expediente(RAIZ),
          };
          // Que la app lo abra igual que un caso guardado.
          expect(leerCasoGuardado(caso), clave).not.toHaveProperty("error");
          writeFileSync(
            resolve(RAIZ, `data/cesvi/casos/bateria-${clave}.croquis`),
            JSON.stringify(caso, null, 2) + "\n",
          );
        }
      }
    },
    600_000,
  );

  it.skipIf(!existsSync(DIR))(
    "los paquetes guardados cumplen el esquema",
    () => {
      const archivos = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "indice.json");
      expect(archivos.sort()).toEqual(CASOS_BATERIA.map((c) => `${c.clave}.json`).sort());
      for (const f of archivos) {
        const p = JSON.parse(readFileSync(resolve(DIR, f), "utf8")) as Parameters<
          typeof caso3dErrors
        >[0];
        expect(caso3dErrors(p), f).toEqual([]);
      }
    },
    60_000,
  );
});
