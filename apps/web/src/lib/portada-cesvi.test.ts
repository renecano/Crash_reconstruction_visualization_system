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

  it("la reconstrucción de AXA cabe en el dibujo y los dos llegan al impacto", () => {
    expect(d.escena.trazos).toHaveLength(2);
    for (const t of d.escena.trazos) {
      for (const [x, y] of [...t.antes, ...t.despues]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1240);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(590);
      }
      // Avanzan de izquierda a derecha hasta el impacto.
      expect(t.antes.at(-1)![0]).toBeGreaterThan(t.antes[0]![0]);
    }
    const [ix] = d.escena.impacto;
    expect(ix).toBeGreaterThan(90);
    expect(ix).toBeLessThan(1150);
  });
});
