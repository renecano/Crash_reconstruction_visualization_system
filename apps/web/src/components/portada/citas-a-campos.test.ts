import { describe, expect, it } from "vitest";
import portada from "@/data/portada.json";
import type { EscenaSpec } from "@croquis/scene-schema";
import { camposCitados } from "./citas-a-campos";

const spec = portada.spec as unknown as EscenaSpec;

describe("capítulo «Reconoce»", () => {
  it("los cinco campos salen de la escena, cada uno con la frase que lo respalda", () => {
    const es = camposCitados(spec, "es");
    expect(es).toHaveLength(5);
    const frase = (i: number) => portada.relato.slice(es[i]!.inicio, es[i]!.fin);
    expect(es[0]).toMatchObject({ etiqueta: "Velocidad de A", valor: "35 km/h" });
    expect(frase(0)).toBe("como a 35");
    expect(frase(2)).toBe("se pasó el rojo");
    expect(es[4]).toMatchObject({ etiqueta: "Clima", valor: "nublado" });
  });

  it("en inglés cambian las etiquetas y los valores, no las citas", () => {
    const es = camposCitados(spec, "es");
    const en = camposCitados(spec, "en");
    expect(en.map((c) => [c.inicio, c.fin])).toEqual(es.map((c) => [c.inicio, c.fin]));
    expect(en[4]).toMatchObject({ etiqueta: "Weather", valor: "cloudy" });
    expect(en[1]!.valor).toBe("compact sedan");
  });
});
