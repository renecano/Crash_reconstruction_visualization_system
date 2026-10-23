import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { conPosicion, escenaDeNarracion, type SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  CLAVES_PASOS,
  enLista,
  faltaEnPaso,
  pasoAbierto,
  vehiculosDelImpacto,
  type EstadoRecorrido,
} from "./pasos-caso";

const aqui = dirname(fileURLToPath(import.meta.url));
const grabada = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const e0 = escenaDeNarracion(grabada.salida, grabada.narracion).expediente;
const P = { lat: 19.3576, lon: -99.0625 };
const estado = (extra: Partial<EstadoRecorrido> = {}): EstadoRecorrido => ({
  esperaReporte: false,
  expediente: e0,
  reconstruido: false,
  ...extra,
});

describe("lo obligatorio de cada paso (V2)", () => {
  it("dice los nombres como se dicen", () => {
    expect(enLista(["V1"])).toBe("V1");
    expect(enLista(["V1", "V2"])).toBe("V1 y V2");
    expect(enLista(["V1", "V2", "V3"])).toBe("V1, V2 y V3");
  });

  it("el caso importado espera su reporte; el hecho, la narración leída", () => {
    expect(faltaEnPaso("caso", estado({ esperaReporte: true }))).toEqual([
      "cargar el reporte de CESVI",
    ]);
    expect(faltaEnPaso("caso", estado())).toEqual([]);
    expect(faltaEnPaso("hecho", estado({ expediente: null }))).toEqual([
      "leer la narración del hecho",
    ]);
    expect(faltaEnPaso("hecho", estado())).toEqual([]);
  });

  it("el lugar pide el punto de impacto y dónde quedó cada vehículo", () => {
    expect(vehiculosDelImpacto(e0)).toEqual(["V1", "V2"]);
    expect(faltaEnPaso("lugar", estado())).toEqual([
      "el punto de impacto",
      "V1 y V2, dónde quedaron",
    ]);
    let e = conPosicion(e0, { vehiculo: "V1", fase: "impacto", punto: P, rumbo: 0 });
    e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: P, rumbo: 90 });
    e = conPosicion(e, { vehiculo: "V1", fase: "final", punto: P, rumbo: 0 });
    expect(faltaEnPaso("lugar", estado({ expediente: e }))).toEqual(["V2, dónde quedó"]);
    e = conPosicion(e, { vehiculo: "V2", fase: "final", punto: P, rumbo: 0 });
    expect(faltaEnPaso("lugar", estado({ expediente: e }))).toEqual([]);
  });

  it("en una carambola, cada impacto entre vehículos tiene su punto", () => {
    const tres = {
      ...e0,
      vehiculos: [...e0.vehiculos, { ...e0.vehiculos[1]!, id: "V3" }],
      impactos: [
        { orden: 1, vehiculos: ["V1", "V2"], fuente: "perito" },
        { orden: 2, vehiculos: ["V2", "V3"], fuente: "perito" },
      ],
    } as typeof e0;
    expect(faltaEnPaso("lugar", estado({ expediente: tres }))).toEqual([
      "el punto del impacto 1",
      "el punto del impacto 2",
      "V1, V2 y V3, dónde quedaron",
    ]);
  });

  it("la reconstrucción pide reconstruir; lo demás no bloquea", () => {
    expect(faltaEnPaso("reconstruccion", estado())).toEqual(["reconstruir"]);
    expect(faltaEnPaso("reconstruccion", estado({ reconstruido: true }))).toEqual([]);
    for (const p of ["danos", "numeros", "reporte", "dictamen"] as const)
      expect(faltaEnPaso(p, estado())).toEqual([]);
  });

  it("un paso futuro no se abre hasta completar lo obligatorio de los anteriores", () => {
    const s = estado();
    expect(pasoAbierto(CLAVES_PASOS, 2, s)).toBe(true);
    expect(pasoAbierto(CLAVES_PASOS, 3, s)).toBe(false);
    expect(pasoAbierto(CLAVES_PASOS, 1, estado({ expediente: null }))).toBe(true);
    expect(pasoAbierto(CLAVES_PASOS, 2, estado({ expediente: null }))).toBe(false);
  });
});
