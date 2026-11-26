import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { elegirDireccion, marcarChoque, poseDe } from "./escena-facil";
import { impactosAColocar } from "./pasos-caso";

/**
 * Elegir por dónde venía no mueve el choque (René, 2026-11-26: «si un perito elige una dirección sin
 * calle, el choque no debe moverse de donde lo marcó»). En la t9-ejemplos el choque de la reversa cayó
 * 48 m al sur de su lugar porque ahí tocó la receta, no porque la dirección lo moviera.
 */
describe("la dirección elegida y el choque marcado", () => {
  it("con una dirección sin calle (el CR-V desde el poniente), el choque se queda donde se marcó", () => {
    const g = JSON.parse(
      readFileSync(
        resolve(__dirname, "../../../../data/cesvi/grabaciones/ejemplos/reversa-pendiente.json"),
        "utf8",
      ),
    ) as { narracion: string; salida: SalidaCorpus };
    const e0 = cesvi.escenaDeNarracion(g.salida, g.narracion).expediente;
    const imp = impactosAColocar(e0);
    const P = { lat: 19.06, lon: -98.22 };
    const marcado = marcarChoque(e0, imp, 1, P, 0);
    const primero = imp[0]!.vehiculos[0]!;
    // Del poniente, donde no hay calle: el perito toca el mapa en esa dirección.
    const elegido = elegirDireccion(marcado, imp, primero, 90, () => P);
    // Lo mismo que marcar el choque en P con ese rumbo: el choque no se movió.
    const enP = marcarChoque(marcado, imp, 1, P, 90);
    for (const v of imp[0]!.vehiculos) {
      const a = poseDe(elegido, v, "impacto")!.punto;
      const b = poseDe(enP, v, "impacto")!.punto;
      expect(Math.abs(a.lat - b.lat) * 111320).toBeLessThan(0.01);
      expect(Math.abs(a.lon - b.lon) * 111320).toBeLessThan(0.01);
    }
  });
});
