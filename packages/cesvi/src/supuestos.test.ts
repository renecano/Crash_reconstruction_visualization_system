/**
 * Los supuestos declarados (René, 2026-10-26; ADR 0091): lo que el caso no trae entra como
 * supuesto con su justificación y su incertidumbre, nunca como un dato pendiente.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { conPosicion, conReposoSupuesto, escenaDeNarracion } from "./escena-narracion";
import { conMasasDeFicha } from "./fichas";
import type { Reconstruccion } from "./reconstruccion";
import { supuestoAlNoSaber, supuestosDeclarados } from "./supuestos";

const grabacion = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
    ),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});

/** El crucero de E-R1 con V1 como la Silverado 2500 2007 de AXA (sin masa) y el reposo de V2 supuesto. */
function caso(conRestos: boolean): Expediente {
  let e = escenaDeNarracion(grabacion.salida, grabacion.narracion).expediente;
  e = {
    ...e,
    vehiculos: e.vehiculos.map((v) =>
      v.id === "V1"
        ? {
            ...v,
            marca: { valor: "Chevrolet", fuente: "perito" },
            modelo: { valor: "Silverado 2500", fuente: "perito" },
            anio: 2007,
            masa: undefined,
          }
        : v,
    ),
  };
  e = conMasasDeFicha(e);
  e = conPosicion(e, { vehiculo: "V2", fase: "final", punto: m(3, 9), rumbo: 80 });
  e = conReposoSupuesto(e, "V2", true);
  return conRestos
    ? ({ ...e, calculos: [{ metodo: "desplazamiento", vehiculo: "V1" }] } as unknown as Expediente)
    : e;
}

describe("los supuestos declarados", () => {
  it("la masa de ficha técnica, con su fuente y el rango de la ficha", () => {
    const s = supuestosDeclarados(caso(true)).find((x) => x.clave === "masa-V1")!;
    expect(s.valor).toBe("2,562.1 kg");
    expect(s.justificacion).toMatch(
      /^Ficha técnica de Chevrolet Silverado 2500 2007: .*\(data\/SOURCES\.md\)\.$/,
    );
    expect(s.incertidumbre).toBe(
      "La ficha va de 2,448.5 kg a 2,675.7 kg; en el rango de las velocidades, ±5 %.",
    );
    // Lo que dibuja su barra: el mismo rango de la ficha, con el valor que se usó.
    expect(s.rango).toEqual({
      min: 2448.5,
      max: 2675.7,
      valor: 2562.1,
      minTexto: "2,448.5 kg",
      maxTexto: "2,675.7 kg",
    });
  });

  it("el reposo supuesto: del método de restos de CESVI si el reporte lo usa; si no, del perito; ±10 m", () => {
    const conRestos = supuestosDeclarados(caso(true)).find((x) => x.clave === "reposo-V2")!;
    expect(conRestos.justificacion).toMatch(/^Supuesto del método de restos de CESVI/);
    expect(conRestos.incertidumbre).toMatch(/^±10 m: 10 veces la de una posición medida/);
    const sinRestos = supuestosDeclarados(caso(false)).find((x) => x.clave === "reposo-V2")!;
    expect(sinRestos.justificacion).toBe("Lo supone el perito: el reporte no da dónde quedó.");
  });

  it("los tres supuestos del impacto van con su rango y su fuente (ADR 0139)", () => {
    // Lo que trae el resultado del solver desde la Tanda 3.
    const parametros = {
      friccion_llanta: { valor: 0.7, rango: [0.55, 0.8], fuente: "tabla", tipo: "secundaria" },
      restitucion_vehiculo_vehiculo: {
        valor: 0.1,
        rango: [0, 0.3],
        fuente: "Brach, Brach y Pongetti 2014 (SAE 2014-01-0469)",
        tipo: "supuesto",
      },
      relacion_impulso_tangencial: {
        valor: 0.4,
        rango: [0.29, 0.49],
        fuente: "supuesto declarado: razón crítica…",
        tipo: "supuesto",
      },
      arrastre_post_impacto: {
        valor: 0.35,
        rango: [0.3, 0.5],
        fuente: "Fricke 2010: de 0.3 a 0.5 de la fricción llanta–pavimento",
        tipo: "supuesto",
      },
    };
    const r = { resultado: { parametros } } as unknown as Reconstruccion;
    const s = supuestosDeclarados(caso(false), r);
    const de = (clave: string) => s.find((x) => x.clave === clave)!;
    expect(de("restitucion").rango).toMatchObject({ min: 0, max: 0.3, valor: 0.1 });
    expect(de("restitucion").justificacion).toContain("SAE 2014-01-0469");
    expect(de("razon_impulso").rango).toMatchObject({ min: 0.29, max: 0.49, valor: 0.4 });
    expect(de("razon_impulso").justificacion).toContain("No hay un rango tabulado");
    // El arrastre: la fracción y la fricción, las dos en su rango.
    expect(de("arrastre").incertidumbre).toBe(
      "En el rango de las velocidades, la fracción va de 0.3 a 0.5 y la fricción de 0.55 a 0.8: el arrastre, de 0.17 a 0.40.",
    );
    expect(de("arrastre").justificacion).toContain("Fricke 2010");

    // Un resultado guardado antes de la Tanda 3 no trae los rangos: se describe como entonces.
    const viejo = {
      resultado: {
        parametros: {
          friccion_llanta: parametros.friccion_llanta,
          restitucion_vehiculo_vehiculo: { valor: 0.1, tipo: "supuesto" },
          relacion_impulso_tangencial: { valor: 0.4, tipo: "supuesto" },
          arrastre_post_impacto: { valor: 0.35, tipo: "supuesto" },
        },
      },
    } as unknown as Reconstruccion;
    const antes = supuestosDeclarados(caso(false), viejo);
    expect(antes.some((x) => x.clave === "restitucion" || x.clave === "razon_impulso")).toBe(false);
    expect(antes.find((x) => x.clave === "arrastre")!.incertidumbre).toMatch(
      /^La fracción es fija/,
    );
  });

  it("nada dice «pendiente» ni «falta pedir»", () => {
    const texto = JSON.stringify(supuestosDeclarados(caso(true)));
    expect(texto).not.toMatch(/pendiente|falta pedir|pedir/i);
  });

  it("al decir «No sé» a una pregunta del Físico, queda el supuesto con su nombre", () => {
    const s = supuestosDeclarados(caso(true));
    expect(supuestoAlNoSaber("final-V2", s)).toBe(
      "Queda el supuesto «Posición final de V2», ±10 m. Supuesto del método de restos de CESVI: los vehículos se desplazan juntos después del impacto, así que queda junto al otro.",
    );
    expect(supuestoAlNoSaber("huella-V1", s)).toMatch(
      /^Queda el supuesto: sin huellas de frenado de V1/,
    );
    expect(supuestoAlNoSaber("masa-V1", s)).toBeNull();
  });
});
