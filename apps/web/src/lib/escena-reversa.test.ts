import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enMetros, escenaDeNarracion, type SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { elegirDireccion, marcarChoque, poseDe, quedoJuntoAlChoque } from "./escena-facil";
import { impactosAColocar } from "./pasos-caso";

/**
 * La reversa de ejemplo (René, 2026-11-24): «Por dónde venía» es hacia dónde avanzaba; en reversa, el
 * frente mira al lado contrario. Antes, el CR-V que retrocedía del oeste quedaba mirando al este y del
 * lado equivocado del Versa, y el 3D metía su parte trasera 1.7 m dentro de él para tocar el costado
 * izquierdo que dice la narración.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../data/cesvi/grabaciones/ejemplos/reversa-pendiente.json"),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const e0 = escenaDeNarracion(g.salida, g.narracion).expediente;
const P = { lat: 19.3576, lon: -99.0625 };

describe("«Por dónde venía» en reversa", () => {
  const impactos = impactosAColocar(e0);
  const cr = e0.vehiculos[0]!.id; // A: el CR-V que salía en reversa
  const versa = e0.vehiculos[1]!.id; // B: el Versa, de sur a norte
  let e = marcarChoque(e0, impactos, 1, P, 90);
  e = elegirDireccion(e, impactos, cr, 90, () => P);
  e = elegirDireccion(e, impactos, versa, 0, () => P);

  it("el que retrocede del oeste al este queda mirando al oeste", () => {
    expect(poseDe(e, cr, "impacto")!.rumbo).toBeCloseTo(270, 0);
    expect(poseDe(e, versa, "impacto")!.rumbo).toBeCloseTo(0, 0);
  });

  it("y queda al oeste del Versa: su parte trasera toca el costado izquierdo, como dice la narración", () => {
    const a = poseDe(e, cr, "impacto")!.punto;
    const b = poseDe(e, versa, "impacto")!.punto;
    const d = enMetros([a.lon, a.lat], [b.lon, b.lat]);
    // El centro del CR-V, medio largo al oeste del costado izquierdo del Versa.
    expect(d.este).toBeLessThan(-2);
  });

  it("«Quedó junto al choque» lo deja hacia donde avanzaba, no hacia su frente", () => {
    const imp = poseDe(e, cr, "impacto")!.punto;
    const fin = poseDe(quedoJuntoAlChoque(e, cr), cr, "final")!.punto;
    expect(enMetros([fin.lon, fin.lat], [imp.lon, imp.lat]).este).toBeCloseTo(1.5, 1);
  });
});
