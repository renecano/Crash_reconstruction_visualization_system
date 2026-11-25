/**
 * Las calles guardadas de los cinco ejemplos (René, 2026-11-25: «en la demo con CESVI no puede salir
 * otra cifra porque OpenStreetMap tardó»). Cada ejemplo abre con las calles de su lugar guardadas en
 * el repositorio (`data/cesvi/ejemplos/calles/<clave>.json`, © colaboradores de OpenStreetMap, ODbL),
 * en la forma en que la app las guarda con un caso; La escena, la reconstrucción y el 3D usan esas y
 * no esperan a la red.
 *
 * Se generan de las respuestas guardadas de la revisión de la cadena (`data/raw/auditoria-cache/osm`,
 * la API de OpenStreetMap alrededor del lugar), sin salir a internet:
 *
 *   CROQUIS_GUARDAR_CALLES=1 pnpm --filter @croquis/web exec vitest run src/lib/ejemplos-calles.test.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { describe, expect, it } from "vitest";
import { RADIO_CALLES_M } from "./calles-del-mapa";
import { callesParaGuardar } from "./calles-guardadas";
import { callesDe } from "./escena-facil";
import { conLugarDelEjemplo, EJEMPLOS } from "./ejemplos-narracion";

const RAIZ = resolve(__dirname, "../../../..");
const SALIDA = join(RAIZ, "data/cesvi/ejemplos/calles");
/** La fecha de la consulta guardada (la de la revisión de la cadena). */
const CONSULTADO = "2026-11-25T00:00:00.000Z";

describe("las calles guardadas de los ejemplos", () => {
  it.skipIf(!process.env.CROQUIS_GUARDAR_CALLES)("se generan de lo guardado de la red", () => {
    mkdirSync(SALIDA, { recursive: true });
    for (const e of EJEMPLOS) {
      const clave = { lat: e.lugar.lat.toFixed(5), lon: e.lugar.lon.toFixed(5) };
      const h = createHash("sha256").update(JSON.stringify(clave)).digest("hex").slice(0, 24);
      const ruta = join(RAIZ, "data/raw/auditoria-cache/osm", `${h}.json`);
      expect(existsSync(ruta), `${e.clave}: no está ${ruta}`).toBe(true);
      const resp = JSON.parse(readFileSync(ruta, "utf8")) as OverpassResponse;
      const g = callesParaGuardar(resp, e.lugar, RADIO_CALLES_M, "overpass", CONSULTADO);
      writeFileSync(join(SALIDA, `${e.clave}.json`), `${JSON.stringify(g)}\n`);
    }
  });

  it("cada ejemplo abre con las calles de su lugar, sin esperar a la red", () => {
    expect(EJEMPLOS).toHaveLength(5);
    for (const e of EJEMPLOS) {
      const con = conLugarDelEjemplo(e.narracion, { caso: { lugar: {} } }) as unknown as {
        caso: {
          lugar: { calles_del_mapa?: { centro: { lat: number; lon: number }; vias: unknown[] } };
        };
      };
      const g = con.caso.lugar.calles_del_mapa;
      expect(g, e.clave).toBeTruthy();
      expect(g!.vias.length).toBeGreaterThan(5);
      expect(Math.abs(g!.centro.lat - e.lugar.lat)).toBeLessThan(1e-5);
      expect(Math.abs(g!.centro.lon - e.lugar.lon)).toBeLessThan(1e-5);
    }
  });

  it("las calles guardadas se leen como las de Overpass (las mismas calles con nombre)", () => {
    const e = EJEMPLOS.find((x) => x.clave === "crucero-noche")!;
    const con = conLugarDelEjemplo(e.narracion, { caso: { lugar: {} } }) as unknown as {
      caso: {
        lugar: {
          calles_del_mapa: Parameters<typeof import("./calles-guardadas").respuestaDeGuardadas>[0];
        };
      };
    };
    return import("./calles-guardadas").then(({ respuestaDeGuardadas }) => {
      const calles = callesDe(respuestaDeGuardadas(con.caso.lugar.calles_del_mapa));
      const nombres = new Set(calles.map((c) => c.nombre));
      expect(
        nombres.has("Calle Azucena") || [...nombres].some((n) => /Azucena/.test(n ?? "")),
      ).toBe(true);
    });
  });
});
