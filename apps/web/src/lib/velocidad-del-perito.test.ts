import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { expedienteAxaReconstruccion } from "./axa-reconstruccion";
import { escenaComoPerito } from "./ejemplo-como-perito";
import { conLugarDelEjemplo } from "./ejemplos-narracion";
import { RECETAS_PERITO } from "./recetas-perito";

/**
 * La velocidad que da el perito (René, 2026-11-28; en el poste, la declarada del Sentra dejaba la
 * reconstrucción en «no cuadra» y sin cifra):
 * - DECLARADA (conductor, testigo): nunca entra al solver; la escena del solver es la misma que con
 *   «No sé». Se compara con la física en la hoja.
 * - MEDIDA (cámara, GPS, tacógrafo): restricción dura. Si no cabe con la evidencia, el perito ve la
 *   reconstrucción física sin ella, marcada, y el conflicto; nunca se queda sin nada si la física cuadra.
 * Una velocidad razonable (la cifra publicada) y una absurda (200 km/h), en los cinco ejemplos y AXA.
 */
const RAIZ = resolve(__dirname, "../../../..");
const MUESTRAS = { samples: 8, mcSamples: 8 };

function casos(): { clave: string; e: Expediente; vehiculo: string; razonable: number }[] {
  const indice = JSON.parse(readFileSync(resolve(RAIZ, "eval/results/cifras.json"), "utf8"))
    .cifras as Record<string, { mejor: number }>;
  const clave = {
    "crucero-noche": "ejemplos.crucero",
    "alcance-deformacion": "ejemplos.alcance",
    "carambola-lluvia": "ejemplos.carambola",
    "reversa-pendiente": "ejemplos.reversa",
    "poste-terraceria": "ejemplos.poste",
  } as Record<string, string>;
  const ejemplos = RECETAS_PERITO.map((receta) => {
    const g = JSON.parse(
      readFileSync(resolve(RAIZ, `data/cesvi/grabaciones/ejemplos/${receta.clave}.json`), "utf8"),
    ) as { narracion: string; salida: SalidaCorpus };
    const leida = cesvi.escenaDeNarracion(g.salida, g.narracion);
    const e0 = conLugarDelEjemplo(g.narracion, leida.expediente as never) as unknown as Expediente;
    return {
      clave: receta.clave,
      e: escenaComoPerito(e0, g.narracion, leida.posiciones, receta).expediente,
      vehiculo: receta.cifra,
      razonable: indice[clave[receta.clave]!]!.mejor,
    };
  });
  return [
    ...ejemplos,
    {
      clave: "axa",
      e: expedienteAxaReconstruccion(),
      vehiculo: "V2",
      razonable: indice["axa.v2"]!.mejor,
    },
  ];
}

describe("la velocidad que da el perito, en los cinco ejemplos y AXA", () => {
  const todos = casos();
  it("son seis casos", () => expect(todos).toHaveLength(6));

  for (const { clave, e, vehiculo, razonable } of todos)
    for (const kmh of [razonable, 200]) {
      it(`${clave}: la DECLARADA de ${kmh} km/h no entra al solver (igual que «No sé»)`, () => {
        const declarada = cesvi.conVelocidadDelPerito(e, vehiculo, kmh, "conductor");
        const noSe = cesvi.conVelocidadDelPerito(e, vehiculo, null);
        const a = cesvi.especDeExpediente(declarada);
        const b = cesvi.especDeExpediente(noSe);
        expect(a.spec).toEqual(b.spec);
        // Y la hoja la sigue viendo para compararla con la física.
        expect(a.narradas?.[vehiculo]).toMatchObject({ kmh, como_se_sabe: "declarada" });
      });

      it(
        `${clave}: con la MEDIDA de ${kmh} km/h el perito nunca se queda sin nada`,
        { timeout: 300_000 },
        () => {
          const medida = cesvi.conVelocidadDelPerito(e, vehiculo, kmh, "camara");
          const r = cesvi.reconstruirExpediente(medida, "caso-nuevo", MUESTRAS);
          const v = r.velocidades.find((x) => x.vehiculo === vehiculo)!;
          if (r.medidaIncompatible) {
            // La física sin la medida, con el conflicto escrito.
            expect(r.noCuadra).toBeFalsy();
            expect(v.previa?.medida).toBeFalsy();
            expect(r.medidaIncompatible.texto).toMatch(
              new RegExp(`Con la velocidad medida de ${kmh} km/h no cuadra`),
            );
            expect(r.limites[0]).toBe(r.medidaIncompatible.texto);
          } else if (r.noCuadra) {
            // Ni sin la medida cuadra: el aviso honesto, y la medida sigue a la vista.
            const sin = cesvi.reconstruirExpediente(
              cesvi.sinMedidasDelPerito(medida),
              "caso-nuevo",
              MUESTRAS,
            );
            expect(sin.noCuadra).toBeTruthy();
            expect(v.previa).toEqual({ mejor: kmh, medida: true });
          } else {
            // Cabe: entra fija.
            expect(v.previa).toEqual({ mejor: kmh, medida: true });
          }
        },
      );
    }
});
