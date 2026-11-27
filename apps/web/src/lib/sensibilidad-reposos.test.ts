import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { fullResult, sensibilidadDeReposos } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { escenaComoPerito } from "./ejemplo-como-perito";
import { conLugarDelEjemplo } from "./ejemplos-narracion";
import { RECETAS_PERITO } from "./recetas-perito";

/**
 * Qué medida pesa más (René, 2026-11-27): en la carambola, el reposo del Corolla mueve la cifra de la
 * Ranger más que los demás (con ±1 m de toque, la cifra iba de 21.5 a 26.5).
 */
describe("la sensibilidad de la cifra a cada reposo", () => {
  it("la carambola: el reposo del Corolla es el que más pesa", () => {
    const RAIZ = resolve(__dirname, "../../../..");
    const clave = "carambola-lluvia";
    const receta = RECETAS_PERITO.find((r) => r.clave === clave)!;
    const g = JSON.parse(
      readFileSync(resolve(RAIZ, `data/cesvi/grabaciones/ejemplos/${clave}.json`), "utf8"),
    ) as { narracion: string; salida: SalidaCorpus };
    const leida = cesvi.escenaDeNarracion(g.salida, g.narracion);
    const e0 = conLugarDelEjemplo(g.narracion, leida.expediente as never) as unknown as Expediente;
    const e = escenaComoPerito(e0, g.narracion, leida.posiciones, receta).expediente;
    const base = cesvi.especDeExpediente(e, "caso-nuevo");
    const resultado = fullResult(base.spec, { samples: 8, mcSamples: 8 }) as unknown as Record<
      string,
      unknown
    >;
    const ranger = Object.keys(base.ids).find((k) => base.ids[k] === "V1")!;
    const t0 = performance.now();
    const s = sensibilidadDeReposos(base.spec, resultado, ranger);
    const ms = performance.now() - t0;
    // En la laptop, 1.6 s (2, 1.6 y 1.2 km/h por metro): va en el worker.
    expect(ms).toBeLessThan(30_000);
    expect(s.length).toBeGreaterThan(0);
    const corolla = e.vehiculos.find((v) =>
      JSON.stringify(v).toLowerCase().includes("corolla"),
    )!.id;
    expect(base.ids[s[0]!.vehiculo]).toBe(corolla);
    expect(s[0]!.kmhPorMetro).toBeGreaterThan(1);
  }, 300_000);
});
