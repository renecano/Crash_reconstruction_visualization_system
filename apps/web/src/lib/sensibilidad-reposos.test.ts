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
  it("la carambola: cuánto mueve la cifra cada metro de cada reposo", () => {
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
    // En la laptop, unos 2 s: va en el worker. Con lo medido como restricción (#369) los tres reposos
    // pesan casi igual (1.8, 1.7 y 1.7 km/h por metro, 2026-11-27): se prueba que estén los tres, que
    // cada uno mueva la cifra más de 1 km/h por metro y que vayan del que más al que menos.
    expect(ms).toBeLessThan(30_000);
    expect(new Set(s.map((x) => base.ids[x.vehiculo]))).toEqual(new Set(["V1", "V2", "V3"]));
    for (const x of s) expect(x.kmhPorMetro).toBeGreaterThan(1);
    for (let k = 1; k < s.length; k++)
      expect(s[k]!.kmhPorMetro).toBeLessThanOrEqual(s[k - 1]!.kmhPorMetro);
  }, 300_000);
});
