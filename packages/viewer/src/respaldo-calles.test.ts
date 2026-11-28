import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sceneLayout, type MapVia } from "@croquis/croquis-2d";
import type { EscenaSpec } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { buildMapRoadGeometry } from "./road-geometry";

/**
 * El visor de respaldo no cambia con #387 (René, 2026-11-27). `packages/viewer` está congelado: solo se
 * toca para arreglar el respaldo (PLAN-CESVI §3.1). #387 agregó lo que OSM dice de cada calle (de qué
 * lado hay banqueta, carriles por sentido, vueltas, semáforos); sin esos datos, la calzada, las
 * banquetas, las rayas y las guarniciones del respaldo deben salir idénticas, bit a bit, a las del
 * código de antes de #387 (`90d7e7fa`).
 *
 * La referencia (`__fixtures__/respaldo-calles-90d7e7fa.json`) se grabó con `road-geometry.ts`,
 * `croquis-2d/src/map-roads.ts` y `croquis-2d/src/layout.ts` de `90d7e7fa` en su lugar:
 *
 *   git show 90d7e7fa:packages/viewer/src/road-geometry.ts > packages/viewer/src/road-geometry.ts  (y los otros dos)
 *   CROQUIS_GRABAR_RESPALDO=1 pnpm --filter @croquis/viewer exec vitest run src/respaldo-calles.test.ts
 *   git checkout -- packages/viewer/src/road-geometry.ts packages/croquis-2d/src
 */
const FIXTURES = join(__dirname, "../../scene-schema/fixtures");
const REFERENCIA = join(__dirname, "__fixtures__/respaldo-calles-90d7e7fa.json");
const GRABAR = process.env.CROQUIS_GRABAR_RESPALDO === "1";

/** Los datos que trajo #387: sin ellos, el respaldo dibuja como antes. */
const NUEVOS = ["carrilesIda", "carrilesVuelta", "vueltas", "vueltasVuelta", "banqueta"] as const;
const sinLoNuevo = (v: MapVia): MapVia => {
  const c = { ...v } as Record<string, unknown>;
  for (const k of NUEVOS) delete c[k];
  return c as unknown as MapVia;
};

const OPCIONES = {
  calzada: {},
  banquetas: { banquetas: true },
  guarniciones: { guarniciones: true },
  todo: { banquetas: true, guarniciones: true },
} as const;

function escenas(): { nombre: string; spec: EscenaSpec }[] {
  const out: { nombre: string; spec: EscenaSpec }[] = [];
  for (const dir of ["caso3d-ciudad", "caso3d"]) {
    for (const f of readdirSync(join(FIXTURES, dir)).sort()) {
      if (!f.endsWith(".json") || f === "indice.json") continue;
      const d = JSON.parse(readFileSync(join(FIXTURES, dir, f), "utf8")) as { escena?: EscenaSpec };
      if (d.escena) out.push({ nombre: `${dir}/${f}`, spec: d.escena });
    }
  }
  return out;
}

const huella = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

function huellas(): Record<string, string> {
  const r: Record<string, string> = {};
  for (const { nombre, spec } of escenas()) {
    const mapa = sceneLayout(spec).mapa;
    if (!mapa?.vias.length) continue;
    const vias = mapa.vias.map(sinLoNuevo);
    for (const [o, opts] of Object.entries(OPCIONES))
      r[`${nombre} ${o}`] = huella(buildMapRoadGeometry(vias, opts));
  }
  return r;
}

describe("el visor de respaldo, igual que antes de #387", () => {
  it("sin los datos nuevos de OSM, la geometría de las calles es idéntica", () => {
    const ahora = huellas();
    if (GRABAR) {
      writeFileSync(REFERENCIA, `${JSON.stringify(ahora, null, 1)}\n`);
      return;
    }
    expect(existsSync(REFERENCIA)).toBe(true);
    const antes = JSON.parse(readFileSync(REFERENCIA, "utf8")) as Record<string, string>;
    // Las mismas escenas con red vial, con sus cuatro combinaciones.
    expect(Object.keys(antes).length).toBeGreaterThanOrEqual(40);
    expect(ahora).toEqual(antes);
  });

  it("con lo que dice OSM, la calle sin banqueta no la dibuja y las demás no cambian", () => {
    const via = (banqueta?: MapVia["banqueta"]): MapVia => ({
      puntos: [
        { x: -40, y: 0 },
        { x: 40, y: 0 },
      ],
      ancho: 8,
      ...(banqueta ? { banqueta } : {}),
    });
    const sin = buildMapRoadGeometry([via()], { banquetas: true });
    expect(buildMapRoadGeometry([via("ambos")], { banquetas: true })).toEqual(sin);
    const ninguna = buildMapRoadGeometry([via("ninguna")], { banquetas: true });
    expect(ninguna.sidewalk.indices.length).toBe(0);
    expect(ninguna.pavement).toEqual(sin.pavement);
    const izquierda = buildMapRoadGeometry([via("izquierda")], { banquetas: true });
    expect(izquierda.sidewalk.indices.length).toBeGreaterThan(0);
    expect(izquierda.sidewalk.indices.length).toBeLessThan(sin.sidewalk.indices.length);
  });
});
