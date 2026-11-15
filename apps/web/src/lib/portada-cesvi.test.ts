import { describe, expect, it } from "vitest";
import corpus from "../../../../eval/results/cesvi_corpus_extraccion.json";
import { datosPortadaCesvi } from "./portada-cesvi";
import { PAGINA, TITULO } from "./reproduccion-dictamenes";

describe("portada de CESVI: las cifras salen de los datos (punto 4 de René)", () => {
  const d = datosPortadaCesvi();

  it("cada cifra es la de su resultado de evaluación", () => {
    expect(d.reportes).toBe(corpus.dictamenes);
    expect(d.aCiegas).toBe(PAGINA.dictamenes);
    // La tasa va completa (k de n): el denominador son los reportes con la modalidad en su título.
    const { croquis, linea_base } = TITULO.v4.titulo_del_reporte;
    expect(d.modalidad).toEqual({ k: croquis.k, n: croquis.n, pct: croquis.pct });
    expect(d.regla).toEqual({ k: linea_base.k, n: linea_base.n, pct: linea_base.pct });
    expect(d.modalidad.n).toBe(TITULO.v4.con_modalidad_en_el_titulo);
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
