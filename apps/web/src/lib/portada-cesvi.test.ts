import { describe, expect, it } from "vitest";
import corpus from "../../../../eval/results/cesvi_corpus_extraccion.json";
import { datosPortadaCesvi } from "./portada-cesvi";
import { PAGINA, TITULO } from "./reproduccion-dictamenes";

describe("portada de CESVI: las cifras salen de los datos (punto 4 de René)", () => {
  const d = datosPortadaCesvi();

  it("cada cifra es la de su resultado de evaluación", () => {
    expect(d.reportes).toBe(corpus.dictamenes);
    expect(d.aCiegas).toBe(PAGINA.dictamenes);
    expect(d.modalidadPct).toBe(TITULO.v3.titulo_del_reporte.croquis.pct);
    expect(d.reglaPct).toBe(TITULO.v3.titulo_del_reporte.linea_base.pct);
  });

  it("AXA: lo de CESVI contra lo de Croquis, con su diferencia en %", () => {
    expect(d.axa.id).toBe("A2010930");
    expect(d.axa.modalidad.croquis).toBe(d.axa.modalidad.cesvi);
    // La diferencia es la de los números, no una escrita aparte.
    for (const f of [d.axa.restos, d.axa.deformacion])
      expect(f.pct).toBeCloseTo((100 * (f.croquis - f.cesvi)) / f.cesvi, 12);
    expect(Math.abs(d.axa.restos.pct)).toBeLessThan(0.005);
    expect(d.axa.deformacion.pct).toBeGreaterThan(0);
  });
});
