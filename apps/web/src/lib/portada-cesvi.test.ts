import { describe, expect, it } from "vitest";
import corpus from "../../../../eval/results/cesvi_corpus_extraccion.json";
import { datosPortadaCesvi } from "./portada-cesvi";
import { PAGINA, TITULO } from "./reproduccion-dictamenes";
import indice from "../../../../eval/results/cifras.json";

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

  it("y son las del índice de cifras publicadas (eval/results/cifras.json)", () => {
    const c = indice.cifras;
    expect(d.reportes).toBe(c["corpus.reportes"].valor);
    expect(d.aCiegas).toBe(c["er4.prueba"].valor);
    const tasa = (x: { k: number; n: number; pct: number }) => ({ k: x.k, n: x.n, pct: x.pct });
    expect(d.modalidad).toEqual(tasa(c["er4.modalidad_titulo"]));
    expect(d.regla).toEqual(tasa(c["er4.regla_simple"]));
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
