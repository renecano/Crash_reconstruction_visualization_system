/**
 * Auditoría del 2026-11-15, C1: con «conservar cifras» (el flujo de CESVI) el redactor no borra como
 * placa una palabra común junto a una cifra, y sigue borrando las placas. Espejo de
 * `extraction/tests/test_pii_cifras.py`.
 */
import { describe, expect, it } from "vitest";
import { redact } from "./pii";

/** [texto, redactado con «conservar cifras», redactado por omisión]. */
export const CASOS: [string, string, string][] = [
  [
    "El vehículo A, con 1450 kg de masa, circulaba a 80 km/h.",
    "El vehículo A, con 1450 kg de masa, circulaba a 80 km/h.",
    "El vehículo A, [PLACA] kg de masa, circulaba a 80 km/h.",
  ],
  [
    "Quedó a 250 mts del punto, modelo del 2010.",
    "Quedó a 250 mts del punto, modelo del 2010.",
    "Quedó a [PLACA] del punto, modelo [PLACA].",
  ],
  [
    "Iba a 120 kmh con 3500 kg de carga, año 2007.",
    "Iba a 120 kmh con 3500 kg de carga, año 2007.",
    "Iba a [PLACA] [PLACA] kg de carga, [PLACA].",
  ],
  [
    "El 12 de agosto del 2019, en el kilometro 47+800 del tramo.",
    "El 12 de agosto del 2019, en el kilometro 47+800 del tramo.",
    "El 12 de agosto [PLACA], en el kilometro 47+[PLACA] tramo.",
  ],
  // El año tras un mes escrito en mayúsculas, y el modelo de la camioneta.
  [
    "Ocurrió el 12 DE AGOSTO DEL 2019. Una Dodge Ram 2500 modelo DEL 2010 y una RAM 4000.",
    "Ocurrió el 12 DE AGOSTO DEL 2019. Una Dodge Ram 2500 modelo DEL 2010 y una RAM 4000.",
    "Ocurrió el 12 DE AGOSTO [PLACA]. Una Dodge [PLACA] modelo [PLACA] y una [PLACA].",
  ],
  // Las placas se siguen borrando: tras la palabra «placas», con guiones, con espacios y aunque sus
  // letras formen una palabra común escrita en mayúsculas.
  [
    "El Jetta con placas MKL 4521 y la Tacoma ABC-123-A; otra CON 1450 y NPR 22 14.",
    "El Jetta con placas [PLACA] y la Tacoma [PLACA]; otra [PLACA] y [PLACA].",
    "El Jetta con placas [PLACA] y la Tacoma [PLACA]; otra [PLACA] y [PLACA].",
  ],
  // Un reporte escrito todo en mayúsculas: las cifras se conservan y la placa se borra.
  [
    "EL VEHICULO A CON 1450 KG CIRCULABA DEL KM 12 AL 250 MTS, PLACAS XYZ 9876",
    "EL VEHICULO A CON 1450 KG CIRCULABA DEL KM 12 AL 250 MTS, PLACAS [PLACA]",
    "EL VEHICULO A [PLACA] KG CIRCULABA DEL KM 12 AL [PLACA], PLACAS [PLACA]",
  ],
];

describe("el redactor conserva las cifras de la narración (opción del flujo de CESVI)", () => {
  for (const [texto, conCifras, porOmision] of CASOS) {
    it(texto.slice(0, 48), () => {
      expect(redact(texto, { conservarCifras: true }).text).toBe(conCifras);
      // Sin la opción, como cuando se congeló Relatos-MX.
      expect(redact(texto).text).toBe(porOmision);
    });
  }

  it("es idempotente", () => {
    for (const [texto] of CASOS) {
      const una = redact(texto, { conservarCifras: true }).text;
      expect(redact(una, { conservarCifras: true }).text).toBe(una);
    }
  });
});
