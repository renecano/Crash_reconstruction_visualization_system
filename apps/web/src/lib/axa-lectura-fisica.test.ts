import { readFileSync } from "node:fs";
import { join } from "node:path";
import { interpretarResultado, especDeExpediente, reconstruccionContraCesvi } from "@croquis/cesvi";
import { fullResult, PRODUCTION_SAMPLES } from "../../../../packages/solver-ts/src/full-result";
import { describe, expect, it } from "vitest";
import { casoAxa, expedienteAxaReconstruccion } from "./axa-reconstruccion";
import { lecturaFisica } from "./contraste-lab";
import { citaVelocidad, filasDeLaHoja } from "./dictamen-lab";
import { protagonista, rangoDeVelocidad } from "./reconstruccion-lab";

/**
 * AXA ya viene con su escena colocada, así que su lectura física siempre da lo mismo: la que mide
 * `eval/axa_rango_estable.mts`. La cifra se lee del resultado de la evaluación, nunca a mano; las
 * pantallas y el PDF los revisa la e2e de AXA contra el mismo archivo.
 */
const medida = (
  JSON.parse(
    readFileSync(join(__dirname, "../../../../eval/results/axa_rango_estable.json"), "utf8"),
  ) as {
    filas: {
      es_la_de_la_app: boolean;
      hipotesis: number;
      V2: { mejor: number; p10: number; p90: number };
    }[];
  }
).filas.find((f) => f.es_la_de_la_app)!;

describe("la lectura física de AXA", () => {
  it(
    "el caso de ejemplo abre con la misma escena que mide la evaluación",
    { timeout: 60_000 },
    () => {
      const e = casoAxa().escena!.expediente;
      expect(e.versiones).toEqual(expedienteAxaReconstruccion().versiones);
      const posiciones = e.versiones!.find((v) => v.tipo === "evidencia")!.posiciones!;
      expect(posiciones.filter((p) => p.fase === "impacto")).toHaveLength(2);
      expect(posiciones.filter((p) => p.fase === "final")).toHaveLength(2);
    },
  );

  it("da exactamente la cifra de V2 y su rango de eval/results", { timeout: 120_000 }, () => {
    const e = casoAxa().escena!.expediente;
    const base = especDeExpediente(e);
    // Como la app: el resultado completo con las muestras de producción (el worker).
    const r = interpretarResultado(base, fullResult(base.spec, PRODUCTION_SAMPLES));
    const f = lecturaFisica(reconstruccionContraCesvi(e, r), "V2")!;
    expect(f.croquis).toBe(medida.V2.mejor);
    expect(f.rango).toEqual([medida.V2.p10, medida.V2.p90]);
    expect(r.hipotesis?.length ?? 1).toBe(medida.hipotesis);
    // Un número por cantidad: la cifra grande, la hoja del dictamen y las citas son el mismo.
    const v = protagonista(r)!;
    expect(v.vehiculo).toBe("V2");
    expect(v.previa!.mejor.toFixed(2)).toBe(medida.V2.mejor.toFixed(2));
    expect(rangoDeVelocidad(v)).toMatchObject({ p10: medida.V2.p10, p90: medida.V2.p90 });
    const texto = `${medida.V2.mejor.toFixed(2)} km/h`;
    expect(
      filasDeLaHoja(r, (id) => id, null).find((x) => x.etiqueta.startsWith("V2"))!.valor,
    ).toContain(texto);
    expect(citaVelocidad(r, "V2", "B")).toContain(texto);
  });
});
