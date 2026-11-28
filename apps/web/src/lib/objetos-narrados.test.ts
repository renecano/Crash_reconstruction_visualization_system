import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { escenaComoPerito } from "./ejemplo-como-perito";
import { choquesIntermedios } from "./escena-facil";
import { conLugarDelEjemplo } from "./ejemplos-narracion";
import { RECETAS_PERITO } from "./recetas-perito";
import { paqueteDelCaso } from "./visor-unity/paquete";

/**
 * Un objeto que nombra la narración aparece solo (René, 2026-11-28: el poste del ejemplo nunca salía,
 * ni en La escena ni en el 3D, si el perito no lo marcaba en «¿Chocó contra algo más?»). En los cinco
 * ejemplos, armados como el perito pero SIN agregar objetos: cada choque narrado contra un objeto fijo
 * está en La escena, en la escena del solver y en el paquete del 3D.
 */
const RAIZ = resolve(__dirname, "../../../..");

function sinObjetosDelPerito(clave: string): Expediente {
  const receta = RECETAS_PERITO.find((r) => r.clave === clave)!;
  const g = JSON.parse(
    readFileSync(resolve(RAIZ, `data/cesvi/grabaciones/ejemplos/${clave}.json`), "utf8"),
  ) as { narracion: string; salida: SalidaCorpus };
  const leida = cesvi.escenaDeNarracion(g.salida, g.narracion);
  const e0 = conLugarDelEjemplo(g.narracion, leida.expediente as never) as unknown as Expediente;
  const sinOtros = { ...receta, otros: [] };
  return escenaComoPerito(e0, g.narracion, leida.posiciones, sinOtros).expediente;
}

const narrados = (e: Expediente) =>
  (e.impactos ?? []).filter(
    (i) =>
      (i.orden ?? 1) > 1 &&
      i.objeto_fijo &&
      !cesvi.OBJETO_PERSONA.test(i.objeto_fijo) &&
      (i.vehiculos ?? []).length === 1,
  );

describe("todo objeto narrado aparece solo, en los cinco ejemplos", () => {
  for (const { clave } of RECETAS_PERITO)
    it(`${clave}: en La escena y en la escena del solver`, () => {
      const e = sinObjetosDelPerito(clave);
      const objetos = narrados(e);
      const enEscena = choquesIntermedios(e);
      const spec = cesvi.especDeExpediente(e).spec as {
        entorno?: { objetos?: { id: string }[] };
      };
      for (const o of objetos) {
        expect(enEscena.find((c) => c.orden === o.orden)?.supuesto).toMatch(/supuesto/);
        expect(spec.entorno?.objetos?.map((x) => x.id)).toContain(`obj-choque-${o.orden}`);
      }
    });

  it("el poste: donde quedó el Sentra, contra su frente, y en el paquete del 3D", () => {
    const e = sinObjetosDelPerito("poste-terraceria");
    expect(narrados(e)).toHaveLength(1);
    const [poste] = choquesIntermedios(e);
    expect(poste).toMatchObject({ orden: 2, vehiculo: "V2" });
    expect(poste!.supuesto).toMatch(
      /^Poste de concreto .*donde quedó el vehículo B, contra su frente/,
    );
    // Medio Sentra menos el hundimiento supuesto (0.6 m) delante de su reposo, en la línea de su recorrido.
    const final = e
      .versiones!.find((v) => v.tipo === "evidencia")!
      .posiciones!.find((p) => p.vehiculo === "V2" && p.fase === "final")!;
    const d = cesvi.distanciaM(
      [final.punto.lon, final.punto.lat],
      [poste!.punto.lon, poste!.punto.lat],
    );
    expect(d).toBeGreaterThan(1.3);
    expect(d).toBeLessThan(2);
    // Marcado por el perito, el lugar es suyo: ya no es supuesto.
    const movido = {
      ...e,
      impactos: e.impactos!.map((i) => (i.orden === 2 ? { ...i, punto: poste!.punto } : i)),
    };
    expect(choquesIntermedios(movido)[0]!.supuesto).toBeUndefined();
  });

  it("el poste llega al paquete del 3D y el límite lo dice", { timeout: 300_000 }, () => {
    const e = sinObjetosDelPerito("poste-terraceria");
    const r = cesvi.reconstruirExpediente(e, "caso-nuevo", { samples: 8, mcSamples: 8 });
    expect(r.limites.join(" ")).toMatch(/Croquis lo pone donde quedó el vehículo B/);
    const paquete = paqueteDelCaso(r.spec as never, r.resultado as never) as unknown as {
      escena: { entorno?: { objetos?: { id: string; tipo: string }[] } };
    };
    expect(paquete.escena.entorno?.objetos).toContainEqual(
      expect.objectContaining({ id: "obj-choque-2", tipo: "poste" }),
    );
  });
});

describe("el poste que coloca Croquis da una cifra estable (René, 2026-11-28)", () => {
  it(
    "unos centímetros del reposo del Sentra no cambian la cifra ni la dejan sin cuadrar",
    { timeout: 600_000 },
    () => {
      // Con el poste justo en la defensa, 4 cm daban 49, 85, 125 km/h o «no cuadra».
      const e = sinObjetosDelPerito("poste-terraceria");
      const fin = e
        .versiones!.find((v) => v.tipo === "evidencia")!
        .posiciones!.find((p) => p.vehiculo === "V2" && p.fase === "final")!;
      const grado = (cm: number) => cm / 100 / 111_320;
      const cifras = [
        [0, 0],
        [4, 0],
        [0, -4],
        [11, 11],
      ].map(([norte, este]) => {
        const x = cesvi.conPosicion(e, {
          vehiculo: "V2",
          fase: "final",
          punto: { lat: fin.punto.lat + grado(norte!), lon: fin.punto.lon + grado(este!) * 1.057 },
          rumbo: fin.rumbo,
        });
        const r = cesvi.reconstruirExpediente(x, "caso-nuevo", { samples: 32, mcSamples: 32 });
        expect(r.noCuadra, JSON.stringify(r.noCuadra?.motivos)).toBeFalsy();
        return r.velocidades.find((v) => v.vehiculo === "V2")!.previa!.mejor;
      });
      expect(Math.max(...cifras) - Math.min(...cifras)).toBeLessThan(5);
    },
  );
});
