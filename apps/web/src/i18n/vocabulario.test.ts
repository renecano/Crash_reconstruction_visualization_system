import { Fuente, FuenteExpediente } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { FUENTE, palabra } from "./vocabulario";

describe("las fuentes se dicen con su etiqueta legible", () => {
  // Toda fuente del contrato (escena y expediente) tiene etiqueta en los dos idiomas; si el contrato
  // agrega una sin etiqueta, esta prueba falla antes de que el identificador llegue a la pantalla.
  const fuentes = [...new Set([...Fuente.options, ...FuenteExpediente.options])];

  it.each(fuentes)("«%s»", (f) => {
    for (const lang of ["es", "en"] as const) {
      expect(FUENTE[f]?.[lang], `${f} (${lang})`).toBeTruthy();
      expect(palabra(FUENTE, f, lang)).not.toMatch(/_/);
    }
  });

  it("«dictamen_importado» es «del reporte»", () => {
    expect(palabra(FUENTE, "dictamen_importado", "es")).toBe("del reporte");
  });
});
