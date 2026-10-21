import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { caso } from "./caso";
import { hechosDe, interpretarDeclaracion, type ExtraccionRelato } from "./declaracion";

const c = caso("A2010930");
const declaracion = c.declaracion.texto;
const expediente = { textoA: "Chevrolet Silverado 2500", textoB: "Toyota Tacoma" };

/** La respuesta grabada de `/api/relato/extraer` (Claude) para la declaración del dictamen. */
function grabada(): ExtraccionRelato {
  const ruta = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../data/cesvi/grabaciones/declaracion-A2010930.ndjson",
  );
  const eventos = readFileSync(ruta, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { tipo: string; datos?: ExtraccionRelato });
  return eventos.find((e) => e.tipo === "resultado")!.datos!;
}

describe("lo que entiende Croquis de la declaración", () => {
  it("el orden de los hechos, cada uno con su frase", () => {
    expect(hechosDe(declaracion).map((h) => [h.texto, h.frase.texto])).toEqual([
      ["Circula", "venia de sur a norte"],
      ["Ve un accidente adelante", "vi un accidente de un tráiler"],
      ["Se detiene", "me pare"],
      ["Retrocede", "reversie unos metros"],
      ["Llega otro vehículo", "llego la camioneta"],
      ["Impacto", "me impacto"],
    ]);
  });

  it("con la extracción grabada (Claude): reversa entendida por la IA, B impacta a A, sentido sur a norte", () => {
    const i = interpretarDeclaracion(declaracion, expediente, grabada());
    const dato = (clave: string) => i.datos.find((d) => d.clave === clave)!;
    expect(dato("maniobra_a")).toMatchObject({
      valor: "reversa",
      entendidoPor: "ia",
      fuente: "declaracion",
    });
    expect(dato("maniobra_a").frase!.texto).toBe("reversie unos metros");
    expect(dato("impacta")).toMatchObject({ valor: "B impacta a A", fuente: "declaracion" });
    expect(dato("sentido").valor).toBe("de sur a norte");
    expect(dato("vehiculo_b").valor).toContain("«la camioneta»");
    expect(i.dinamica).toEqual({
      sentido: { desde: "sur", hacia: "norte" },
      maniobraA: "reversa",
      impacta: "B_a_A",
      reversaM: null,
    });
  });

  it("«unos metros» no es un número: se pregunta, y la respuesta del perito manda", () => {
    const sin = interpretarDeclaracion(declaracion, expediente, grabada());
    expect(sin.preguntas.map((p) => p.texto)).toContain("¿Cuántos metros de reversa?");
    expect(sin.datos.find((d) => d.clave === "reversa")).toMatchObject({ fuente: "supuesto" });
    const con = interpretarDeclaracion(declaracion, expediente, grabada(), "", { reversaM: 4 });
    expect(con.dinamica.reversaM).toBe(4);
    expect(con.datos.find((d) => d.clave === "reversa")).toMatchObject({
      valor: "4 m",
      fuente: "perito",
    });
    expect(con.preguntas.map((p) => p.texto)).not.toContain("¿Cuántos metros de reversa?");
  });

  it("las notas del perito también cuentan, y no se preguntan velocidades", () => {
    const i = interpretarDeclaracion(
      declaracion,
      expediente,
      grabada(),
      "Según el croquis retrocedió 2.5 m",
    );
    expect(i.dinamica.reversaM).toBe(2.5);
    expect(i.preguntas.some((p) => /velocidad/i.test(p.texto))).toBe(false);
  });

  it("sin la extracción, los detectores bastan para la dinámica", () => {
    const i = interpretarDeclaracion(declaracion, expediente, null);
    expect(i.dinamica.maniobraA).toBe("reversa");
    expect(i.datos.find((d) => d.clave === "maniobra_a")!.entendidoPor).toBe("reglas");
  });
});
