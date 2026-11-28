import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { pasosEscena } from "./escena-facil";

/**
 * Una volcadura sin choque contra nada (René, 2026-11-28): Croquis lo dice claro («todavía no
 * reconstruye volcaduras»), nunca inventa un objeto ni una cifra, y el croquis y el dictamen siguen.
 */
const RAIZ = resolve(__dirname, "../../../..");
/** La narración del caso 6 de la demo, en su versión de volcadura (René, 2026-11-28). */
const CASO6 =
  "El hecho se ubica sobre la carretera Hermosillo–Bahía de Kino, a la altura del poblado Miguel Alemán, en Hermosillo, Sonora, aproximadamente a las 14:50 horas. La vía es de un carril por sentido, recta, con acotamiento y terreno desértico a los costados. El vehículo A, camioneta marca Ford, tipo Lobo, modelo 2017, con dos ocupantes, circulaba en dirección a Bahía de Kino a unos 110 km/h según un testigo que viajaba detrás. Para esquivar un perro que cruzaba la carretera, el conductor giró bruscamente hacia la derecha; el vehículo derrapó y dejó huellas de derrape de 32 m sobre el pavimento, salió del camino por el costado derecho, marcó surcos de 25 m sobre la terracería y volcó. Quedó detenido sobre su techo a 28 m del borde del camino, con el frente hacia el poniente.";
const lobo = {
  caso: { modalidades: ["salida_de_camino"] },
  vehiculos: [{ id: "V1", marca: { valor: "Ford", fuente: "perito" }, clase: "pickup" }],
  danos: [],
  versiones: [{ tipo: "evidencia" }],
} as unknown as Expediente;
/** Un Jeep que salió del camino y chocó contra árboles: tiene un impacto; no es «sin choque». */
const jeep = JSON.parse(
  readFileSync(resolve(RAIZ, "data/cesvi/grabaciones/escenas/cesvi-89f891c2e0.json"), "utf8"),
) as { narracion: string; salida: SalidaCorpus };

describe("una volcadura sin choque", () => {
  const leida = cesvi.escenaDeConversion(
    { expediente: lobo, conteos: {} as never, posiciones: [] },
    CASO6,
  );

  it("la lectura lo dice y no inventa un impacto ni pregunta contra qué chocó", () => {
    expect(leida.aviso).toBe(cesvi.AVISO_VOLCADURA);
    expect(leida.aviso).toBe(
      "Croquis todavía no reconstruye volcaduras: puedes usar el croquis y el dictamen sin cifra de velocidad.",
    );
    expect(leida.expediente.impactos ?? []).toEqual([]);
    expect(leida.expediente.caso.modalidades).toContain("volcadura");
    expect(leida.preguntas.map((p) => p.clave)).not.toContain("impactos");
    expect(leida.preguntas.map((p) => p.clave)).not.toContain("impacto-propuesto");
    expect(cesvi.volcaduraSinChoque(leida.expediente)).toBe(true);
    // Se puede seguir: no falta «contra qué chocó».
    expect(cesvi.minimoParaReconstruir(leida.expediente).faltan).not.toContain(
      "contra qué o contra quién chocó",
    );
  });

  it("La escena no pregunta por un primer golpe ni por otros choques", () => {
    const pasos = pasosEscena(leida.expediente, [{ orden: 1, vehiculos: ["V1"] }], {
      desconocidos: [],
      direccionesNoSe: [],
      c1: {},
    });
    expect(pasos.map((p) => p.tipo)).not.toContain("golpe");
    expect(pasos.map((p) => p.tipo)).not.toContain("otros");
  });

  it("la reconstrucción no da cifra, lo dice, y el 3D lo deja donde quedó", () => {
    // El vehículo, donde empezó y donde quedó (lo que marca el perito en La escena).
    let e: Expediente = cesvi.conPosicion(leida.expediente, {
      vehiculo: "V1",
      fase: "impacto",
      punto: { lat: 20.6, lon: -98.6 },
      rumbo: 90,
    });
    e = cesvi.conPosicion(e, {
      vehiculo: "V1",
      fase: "final",
      punto: { lat: 20.6, lon: -98.5997 },
      rumbo: 120,
    });
    const r = cesvi.reconstruirExpediente(e, "caso-nuevo", { samples: 4, mcSamples: 4 });
    expect(r.sinCalculo).toBe(cesvi.AVISO_VOLCADURA);
    expect(r.limites[0]).toBe(cesvi.AVISO_VOLCADURA);
    expect(r.velocidades.every((v) => v.previa === null && v.impacto === null)).toBe(true);
    const animada = cesvi.especReconstruida(r) as {
      eventos: unknown[];
      vehiculos: { maniobra: { valor: string } }[];
    };
    expect(animada.eventos).toEqual([]);
    expect(animada.vehiculos.every((v) => v.maniobra.valor === "detenido")).toBe(true);
  });

  it("un choque narrado no es «volcadura sin choque»", () => {
    const conArboles = cesvi.escenaDeNarracion(jeep.salida, jeep.narracion);
    expect(conArboles.aviso).toBeUndefined();
    expect(cesvi.volcaduraSinChoque(conArboles.expediente)).toBe(false);
    const e = lobo;
    expect(
      cesvi.narraVolcaduraSinChoque(e, "El vehículo se impactó contra un poste y después volcó."),
    ).toBe(false);
    expect(cesvi.narraVolcaduraSinChoque(e, "El vehículo dio vuelta a la izquierda.")).toBe(false);
    expect(
      cesvi.narraVolcaduraSinChoque(e, "Derrapó, salió del camino por el costado derecho y volcó."),
    ).toBe(true);
  });
});
