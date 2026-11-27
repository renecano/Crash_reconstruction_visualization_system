import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import {
  applyValues,
  evidenceFromSpec,
  invert,
  reconstruct,
  reconstructionToDict,
  withMarks,
} from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { escenaComoPerito } from "./ejemplo-como-perito";
import { conLugarDelEjemplo } from "./ejemplos-narracion";
import { RECETAS_PERITO } from "./recetas-perito";

/**
 * El arreglo de fondo del rango (René, 2026-11-26): lo medido es una restricción, no un residuo que
 * la soft-L1 pueda tratar como atípico; el reajuste de cada muestra converge; y una huella de después
 * del impacto dice que las llantas deslizaban.
 */
type Json = Record<string, unknown>;
const RAIZ = resolve(__dirname, "../../../..");
function especDe(clave: string): Json {
  const receta = RECETAS_PERITO.find((r) => r.clave === clave)!;
  const g = JSON.parse(
    readFileSync(resolve(RAIZ, `data/cesvi/grabaciones/ejemplos/${clave}.json`), "utf8"),
  ) as { narracion: string; salida: cesvi.SalidaCorpus };
  const lei = cesvi.escenaDeNarracion(g.salida, g.narracion);
  const e0 = conLugarDelEjemplo(
    g.narracion,
    lei.expediente as never,
  ) as unknown as cesvi.Expediente;
  const a = escenaComoPerito(e0, g.narracion, lei.posiciones, receta);
  return cesvi.especDeExpediente(a.expediente, "caso-nuevo").spec as unknown as Json;
}
const invertir = (spec: Json) =>
  invert(
    spec as never,
    {
      seed: Number((spec.meta as Json).semilla),
      samples: 32,
    } as never,
  ) as unknown as {
    best: { values: Map<string, number> };
    fits: { values: Map<string, number> }[];
    estimates: { param: { name: string }; dist: { p10: number } | null }[];
  };

describe("el rango respeta lo medido y converge", () => {
  it("poste: el Sentra sale del choque a 43 km/h o más, como pide su derrape de 18.40 m", () => {
    const spec = especDe("poste-terraceria");
    const inv = invertir(spec);
    // Antes del impacto, el p10: con la fricción de Fricke (asfalto 0.55–0.8, terracería 0.4–0.7),
    // 18.40 m de derrape piden al menos ~43 km/h al salir del choque.
    const sentra = inv.estimates.find((e) => e.param.name === "velocidad:veh-b")!;
    expect(sentra.dist!.p10).toBeGreaterThanOrEqual(43);
    // Y en el mejor ajuste, la velocidad al salir del choque.
    const ev = evidenceFromSpec(spec as never);
    const res = reconstructionToDict(
      reconstruct(applyValues(withMarks(spec as never, ev), inv.best.values) as never, {}),
    ) as { vehiculos: { id: string; trayectoria: { t: number[]; vx: number[]; vy: number[] } }[] };
    const tr = res.vehiculos.find((v) => v.id === "veh-b")!.trayectoria;
    const k = tr.t.findIndex((t) => t >= 0.05);
    expect(Math.hypot(tr.vx[k]!, tr.vy[k]!) * 3.6).toBeGreaterThanOrEqual(43);
  }, 300_000);

  it("ningún rango de los cinco ejemplos queda en una retícula de 2.5 km/h alrededor del modo", () => {
    for (const r of RECETAS_PERITO) {
      const inv = invertir(especDe(r.clave));
      for (const [nombre, modo] of inv.best.values) {
        if (!nombre.startsWith("velocidad:")) continue;
        const xs = inv.fits.map((f) => f.values.get(nombre)!).filter((x) => x !== undefined);
        if (xs.length < 8) continue;
        const enReticula = xs.filter((x) => {
          const k = Math.round((x - modo) / 2.5);
          return k !== 0 && Math.abs(x - modo - 2.5 * k) < 0.01;
        }).length;
        expect(enReticula / xs.length, `${r.clave} · ${nombre}`).toBeLessThan(0.2);
      }
    }
  }, 900_000);
});
