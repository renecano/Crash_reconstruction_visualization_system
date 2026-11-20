import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Expediente } from "@croquis/cesvi";
import { reconstruirExpediente } from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { especDel3d } from "@/components/cesvi/caso/reconstruccion";
import { paqueteDelCaso } from "./paquete";

const RAIZ = resolve(__dirname, "../../../../..");

describe("el paquete de Unity del caso de Tollocan (René, 2026-11-20: se congelaba en «calculando»)", () => {
  it("se arma sin colgarse, con las calles y los objetos del mapa", () => {
    const d = JSON.parse(
      readFileSync(resolve(RAIZ, "data/cesvi/casos/tollocan-rene.croquis"), "utf8"),
    ) as { expediente: Expediente };
    // Lo de OpenStreetMap alrededor del impacto (data/osm/manifest.json, «tollocan_rene»).
    const osm = JSON.parse(
      readFileSync(resolve(RAIZ, "data/osm/tollocan_rene.osm-api.json"), "utf8"),
    ) as OverpassResponse;
    const t0 = performance.now();
    const r = reconstruirExpediente(d.expediente, undefined, { samples: 8, mcSamples: 8 });
    const t1 = performance.now();
    const escena = especDel3d(r, osm, osm);
    const t2 = performance.now();
    const resultado = reconstructionToDict(reconstruct(escena as never));
    const t3 = performance.now();
    const paquete = paqueteDelCaso(escena, resultado as never, r.relieve ?? null);
    const t4 = performance.now();
    console.log(
      `TIEMPOS rec ${(t1 - t0).toFixed(0)} · especDel3d ${(t2 - t1).toFixed(0)} · reconstruct ${(t3 - t2).toFixed(0)} · paquete ${(t4 - t3).toFixed(0)} ms; vías ${(escena.lugar as { red_vial?: { vias: unknown[] } }).red_vial?.vias.length}; objetos ${(escena.entorno?.objetos ?? []).length}; bytes ${JSON.stringify(paquete).length}`,
    );
    if (process.env.PAQUETE_SALIDA)
      writeFileSync(process.env.PAQUETE_SALIDA, JSON.stringify(paquete));
    // 1.3 s en la laptop (8 GB); con holgura para CI.
    expect(t4 - t3).toBeLessThan(8000);
    expect(paquete.escenario).toBeTruthy();
  }, 120_000);
});
