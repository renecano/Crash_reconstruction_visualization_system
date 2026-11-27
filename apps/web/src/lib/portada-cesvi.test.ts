import { describe, expect, it } from "vitest";
import { formato as F } from "@croquis/cesvi";
import indice from "../../../../eval/results/cifras.json";
import { datosPortadaCesvi } from "./portada-cesvi";

describe("portada: las cifras son las del índice publicado", () => {
  const d = datosPortadaCesvi();
  const c = indice.cifras;

  it("cada tasa va completa (k de n), con el formateador único", () => {
    expect(F.tasa(d.cobertura)).toBe(c["cobertura.rango"].texto);
    expect(F.tasa(d.modalidad)).toBe(c["er4.modalidad_titulo"].texto);
    expect(F.tasa(d.regla)).toBe(c["er4.regla_simple"].texto);
    expect(F.tasa({ ...d.carambolas, pct: null })).toBe(c["carambolas.prueba"].texto);
    expect(d.regla.n).toBe(d.modalidad.n);
  });
});
