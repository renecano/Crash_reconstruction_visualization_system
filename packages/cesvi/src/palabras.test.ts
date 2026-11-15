import { describe, expect, it } from "vitest";
import esquema from "../../scene-schema/escena.schema.json";
import { enPalabras } from "./palabras";

describe("los valores del contrato, en palabras", () => {
  it("lleva los acentos que el enumerado no puede llevar", () => {
    expect(enPalabras("de_atras_hacia_adelante")).toBe("de atrás hacia adelante");
    expect(enPalabras("camion_unitario")).toBe("camión unitario");
    expect(enPalabras("posterior_izquierdo")).toBe("posterior izquierdo");
  });

  it("ningún enumerado del esquema queda con una palabra sin su acento", () => {
    const valores = new Set<string>();
    const recorre = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(recorre);
      else if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        if (Array.isArray(o.enum))
          for (const v of o.enum) if (typeof v === "string") valores.add(v);
        Object.values(o).forEach(recorre);
      }
    };
    recorre(esquema);
    expect(valores.size).toBeGreaterThan(50);
    // Terminaciones que en español llevan acento: -ción/-sión, y las palabras de la tabla.
    const sinAcento = /(cion|sion|atras|bus|peaton|semaforo|vehiculo|linea)$/;
    const malas = [...valores]
      .flatMap((v) => enPalabras(v).split(" "))
      .filter((p) => sinAcento.test(p));
    expect([...new Set(malas)]).toEqual([]);
  });
});
