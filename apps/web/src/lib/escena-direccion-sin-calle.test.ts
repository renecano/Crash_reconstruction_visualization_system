import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { agregarChoqueIntermedio, elegirDireccion, marcarChoque, poseDe } from "./escena-facil";
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

describe("el choque contra el poste que trae la narración", () => {
  it("guarda el lugar que marca el perito en el impacto, para que se calcule", () => {
    const g = JSON.parse(
      readFileSync(
        resolve(__dirname, "../../../../data/cesvi/grabaciones/ejemplos/poste-terraceria.json"),
        "utf8",
      ),
    ) as { narracion: string; salida: SalidaCorpus };
    const e0 = cesvi.escenaDeNarracion(g.salida, g.narracion).expediente;
    const imp = impactosAColocar(e0);
    const P = { lat: 18.98, lon: -98.43 };
    const conChoque = marcarChoque(e0, imp, 1, P, 90);
    const Q = { lat: 18.9801, lon: -98.4298 };
    const conPoste = marcarChoque(conChoque, imp, 2, Q, 90);
    const poste = conPoste.impactos?.find((i) => i.orden === 2);
    expect(poste?.objeto_fijo).toMatch(/poste/);
    expect(poste?.punto).toEqual(Q);
    // El primer choque no lleva punto de objeto.
    expect(conPoste.impactos?.find((i) => i.orden === 1)?.objeto_fijo ?? null).toBeNull();
  });
});

describe("«¿Chocó contra algo más?» con el poste que ya trae la narración", () => {
  it("completa ese choque con el lugar, no agrega otro", () => {
    const g = JSON.parse(
      readFileSync(
        resolve(__dirname, "../../../../data/cesvi/grabaciones/ejemplos/poste-terraceria.json"),
        "utf8",
      ),
    ) as { narracion: string; salida: SalidaCorpus };
    const e0 = cesvi.escenaDeNarracion(g.salida, g.narracion).expediente;
    const antes = e0.impactos?.length ?? 0;
    const Q = { lat: 18.9801, lon: -98.4298 };
    const e1 = agregarChoqueIntermedio(e0, "V2", "poste", Q);
    expect(e1.impactos?.length).toBe(antes);
    const poste = e1.impactos?.find((i) => i.orden === 2);
    expect(poste?.objeto_fijo).toMatch(/poste/);
    expect(poste?.punto).toEqual(Q);
    // Otro objeto, u otro poste ya marcado: uno nuevo, al final del orden.
    const e2 = agregarChoqueIntermedio(e1, "V2", "poste", Q);
    expect(e2.impactos?.length).toBe(antes + 1);
  });
});
