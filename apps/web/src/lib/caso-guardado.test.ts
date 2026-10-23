import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  conPosicion,
  escenaDeNarracion,
  problemasExpediente,
  type SalidaCorpus,
} from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  casoParaGuardar,
  huellaDelCaso,
  leerCasoGuardado,
  validacionVigente,
  type CasoAbierto,
} from "./caso-guardado";

const aqui = dirname(fileURLToPath(import.meta.url));
const grabada = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const escena = escenaDeNarracion(grabada.salida, grabada.narracion);
const P = { lat: 19.3576, lon: -99.0625 };
const expediente = conPosicion(escena.expediente, {
  vehiculo: "V1",
  fase: "final",
  punto: P,
  rumbo: 30,
});
const narracion = grabada.narracion;
const validacion = {
  perito: "Perito de prueba",
  conclusion: "Conclusión de prueba.",
  fecha: "2026-10-23T15:00:00.000Z",
  huella: huellaDelCaso(expediente, narracion),
};
/** Guarda y vuelve a abrir, como el archivo que descarga el perito. */
const idaYVuelta = (v: typeof validacion | null) =>
  leerCasoGuardado(
    JSON.parse(JSON.stringify(casoParaGuardar({ narracion, escena, expediente, validacion: v }))),
  ) as CasoAbierto;

describe("el caso guardado con la validación del perito (ADR 0075)", () => {
  it("la validación va en los campos del contrato y el expediente sigue siendo válido", () => {
    const g = casoParaGuardar({ narracion, escena, expediente, validacion });
    expect(g.expediente.resultado).toMatchObject({
      validado_por: "Perito de prueba",
      fecha_validacion: validacion.fecha,
      huella_entradas: validacion.huella,
    });
    expect(g.conclusion_perito).toBe("Conclusión de prueba.");
    expect(problemasExpediente(g.expediente)).toEqual([]);
  });

  it("al abrirlo vuelven la narración, lo que marcó el perito y su validación, vigente", () => {
    const a = idaYVuelta(validacion);
    expect(a.narracion).toBe(narracion);
    expect(a.expediente).toEqual(expediente);
    expect(a.escena.preguntas).toEqual(escena.preguntas);
    expect(a.validacion).toEqual(validacion);
    expect(validacionVigente(a.validacion, a.expediente, a.narracion)).toBe(true);
  });

  it("si cambian las entradas después de validar, la validación ya no vale ni se guarda", () => {
    const movido = conPosicion(expediente, { vehiculo: "V1", fase: "final", punto: P, rumbo: 45 });
    expect(validacionVigente(validacion, movido, narracion)).toBe(false);
    expect(validacionVigente(validacion, expediente, `${narracion} `)).toBe(false);
    const g = casoParaGuardar({ narracion, escena, expediente: movido, validacion });
    expect(g.expediente.resultado).toBeUndefined();
    expect(g.conclusion_perito).toBeNull();
    expect(idaYVuelta(null).validacion).toBeNull();
  });

  it("rechaza lo que no es un caso de Croquis o trae un expediente inválido", () => {
    expect(leerCasoGuardado({ expediente })).toEqual({
      error: "El archivo no es un caso de Croquis.",
    });
    expect(leerCasoGuardado({ formato: "croquis-caso", version: 9 })).toHaveProperty("error");
    const g = casoParaGuardar({ narracion, escena, expediente, validacion: null });
    const roto = { ...g, expediente: { ...g.expediente, vehiculos: "V1" } };
    expect((leerCasoGuardado(roto) as { error: string }).error).toMatch(/no es válido/);
  });
});
