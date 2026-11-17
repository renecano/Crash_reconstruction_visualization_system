import { escenaDeNarracion } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { EJEMPLOS, ejemploDe, lecturaGuardada } from "./ejemplos-narracion";
import { textoParaClaude } from "./redaccion";

describe("las narraciones de ejemplo (ronda 2, C)", () => {
  it("son cinco, cada una con su línea y su lectura guardada", () => {
    expect(EJEMPLOS.map((e) => e.clave)).toEqual([
      "crucero-noche",
      "alcance-deformacion",
      "carambola-lluvia",
      "reversa-pendiente",
      "poste-terraceria",
    ]);
    for (const e of EJEMPLOS) {
      expect(e.titulo.length).toBeGreaterThan(8);
      expect(e.linea.length).toBeGreaterThan(8);
      expect(e.salida.datos.length).toBeGreaterThan(10);
    }
  });

  it("no traen datos personales: quitarlos no les cambia nada (así la lectura guardada coincide)", () => {
    for (const e of EJEMPLOS) expect(textoParaClaude(e.narracion)).toBe(e.narracion);
  });

  it("la lectura guardada vale solo para el texto sin cambios", () => {
    const e = EJEMPLOS[1]!;
    expect(lecturaGuardada(`  ${e.narracion}\n`)).toBe(e.salida);
    expect(ejemploDe(e.narracion)?.clave).toBe("alcance-deformacion");
    expect(lecturaGuardada(`${e.narracion} El vehículo A frenó.`)).toBeNull();
  });

  it("ninguna cita de las lecturas guardadas queda fuera de su texto", () => {
    for (const e of EJEMPLOS) {
      const escena = escenaDeNarracion(e.salida, e.narracion);
      expect(escena.conteos.citas_fuera, e.clave).toBe(0);
      expect(escena.expediente.vehiculos.length, e.clave).toBeGreaterThan(0);
    }
  });

  it("cada una trae lo que su línea promete", () => {
    const filas = (clave: string) => EJEMPLOS.find((e) => e.clave === clave)!.salida.datos;
    const hay = (clave: string, campo: string, valor?: RegExp) =>
      filas(clave).some((d) => d.campo === campo && (!valor || valor.test(String(d.valor))));
    // El método de CESVI: las medidas de deformación de los dos vehículos.
    expect(filas("alcance-deformacion").filter((d) => d.campo === "medidas")).toHaveLength(2);
    // La carambola: tres vehículos y dos impactos.
    expect(
      new Set(
        filas("carambola-lluvia")
          .filter((d) => d.seccion === "vehiculo")
          .map((d) => d.n),
      ).size,
    ).toBe(3);
    expect(
      new Set(
        filas("carambola-lluvia")
          .filter((d) => d.seccion === "impacto")
          .map((d) => d.n),
      ).size,
    ).toBe(2);
    expect(hay("reversa-pendiente", "maniobra", /reversa/)).toBe(true);
    expect(hay("poste-terraceria", "objeto_fijo", /poste/)).toBe(true);
  });
});
