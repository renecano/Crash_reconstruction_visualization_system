import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fullResult } from "@croquis/solver-ts";
import { validateEscena } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import {
  compararDeclarada,
  direccionDePdof,
  especDeclarada,
  sugerirDeclarada,
  type FilaDeclarada,
} from "./comparacion-declarada";
import type { Expediente, SalidaCorpus } from "./corpus";
import { mensajeDeclaracion, versionDeclarada } from "./declaracion";
import { conPosicion, escenaDeNarracion } from "./escena-narracion";
import { especDeExpediente, reconstruirExpediente } from "./reconstruccion";

const aqui = dirname(fileURLToPath(import.meta.url));
const leer = <T>(ruta: string) => JSON.parse(readFileSync(resolve(aqui, ruta), "utf8")) as T;
/** El caso de ejemplo de «Caso nuevo» (V1 Jetta, V2 Camaro) y la declaración grabada del de V2. */
const escena = leer<{ narracion: string; salida: SalidaCorpus }>(
  "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
);
const grabada = leer<{ declaracion: string; declarante: "V2"; salida: SalidaCorpus }>(
  "../../../data/cesvi/grabaciones/declaracion/declaracion-e2e.json",
);

const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});
/** El caso con las posiciones del perito, como en la e2e. */
function colocado(): Expediente {
  let e = escenaDeNarracion(escena.salida, escena.narracion).expediente;
  e = conPosicion(e, { vehiculo: "V1", fase: "impacto", punto: m(-2, 0), rumbo: 0 });
  e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0, 2), rumbo: 90 });
  e = conPosicion(e, { vehiculo: "V1", fase: "final", punto: m(4, 5), rumbo: 30 });
  return conPosicion(e, { vehiculo: "V2", fase: "final", punto: m(3, 9), rumbo: 80 });
}

describe("la declaración leída (R7)", () => {
  const v = versionDeclarada(grabada.salida, grabada.declaracion, "V2", ["V1", "V2"]);

  it("lee maniobras, velocidad, caras de contacto y posición final, cada una con su cita", () => {
    expect(v.maniobras.map((x) => [x.vehiculo, x.tipo])).toEqual([
      ["V2", "circula"],
      ["V1", "circula"],
    ]);
    expect(v.velocidades).toEqual([
      {
        vehiculo: "V2",
        kmh: 40,
        cita: "Yo circulaba por la Av. Reforma de sur a norte a unos 40 km/h",
      },
    ]);
    expect(v.contactos.map((c) => [c.vehiculo, c.cara])).toEqual([
      ["V1", "frontal"],
      ["V2", "lateral_izquierdo"],
    ]);
    expect(v.finales.map((f) => f.vehiculo)).toEqual(["V2"]);
    expect(v.descartados).toEqual({ citas: 0, numeros: 0 });
  });

  it("una cita que no está en la declaración y una velocidad que no está en su cita se descartan", () => {
    const s: SalidaCorpus = {
      datos: [
        {
          seccion: "movimiento",
          n: 1,
          vehiculo: "V1",
          campo: "maniobra",
          valor: "reversa",
          cita: "el Jetta venía en reversa",
        },
        {
          seccion: "movimiento",
          n: 2,
          vehiculo: "V2",
          campo: "velocidad",
          valor: "80 km/h",
          cita: "a unos 40 km/h",
        },
      ],
    };
    const r = versionDeclarada(s, grabada.declaracion, "V2", ["V1", "V2"]);
    expect(r.maniobras).toEqual([]);
    expect(r.velocidades).toEqual([]);
    expect(r.descartados).toEqual({ citas: 1, numeros: 1 });
  });

  it("el mensaje lleva los vehículos del caso y quién declara", () => {
    expect(
      mensajeDeclaracion("Iba a 40.", [{ id: "V1", descripcion: "VW, Jetta" }], "V1"),
    ).toContain("- V1: VW, Jetta\n\nEl declarante conducía V1.");
  });
});

describe("la versión declarada y qué cambia (R7)", () => {
  const e = colocado();
  const v = versionDeclarada(grabada.salida, grabada.declaracion, "V2", ["V1", "V2"]);

  it("la escena declarada lleva lo que dice el conductor y no las posiciones finales del perito", () => {
    const base = especDeExpediente(e);
    const decl = especDeclarada(base, v, new Map([["V1", 35]]));
    expect(validateEscena(decl.spec).ok).toBe(true);
    const idDe = (x: string) => Object.keys(base.ids).find((k) => base.ids[k] === x)!;
    const vs = decl.spec.vehiculos as Record<string, unknown>[];
    const v2 = vs.find((x) => x.id === idDe("V2"))!;
    expect(v2.velocidad_previa).toMatchObject({ valor: 40, fuente: "usuario" });
    expect(vs.every((x) => x.posicion_final === undefined)).toBe(true);
    // V1 no declara velocidad: va la de la reconstrucción, marcada como tal.
    expect(vs.find((x) => x.id === idDe("V1"))!.velocidad_previa).toMatchObject({
      valor: 35,
      fuente: "supuesto",
    });
    const zonas = (
      decl.spec.eventos as { zonas_impacto?: { vehiculo_id: string; cdc: { lado: string } }[] }[]
    )[0]!.zonas_impacto!;
    expect(zonas.find((z) => z.vehiculo_id === idDe("V2"))!.cdc.lado).toBe("L");
    expect(decl.limites).toContain(
      "V1: el conductor no declara su velocidad; va la de la reconstrucción.",
    );
  });

  it("compara velocidad, posición final, zona y dirección, fila por fila", () => {
    const r = reconstruirExpediente(e, "r7");
    const base = especDeExpediente(e, "r7");
    const decl = especDeclarada(base, v);
    const filas = compararDeclarada({
      expediente: e,
      reconstruccion: r,
      declarada: v,
      resultadoDeclarado: fullResult(decl.spec),
    });
    const claves = filas.map((f) => `${f.clave}-${f.vehiculo}`);
    expect(claves).toContain("velocidad-V2");
    expect(claves).toContain("posicion_final-V1");
    expect(claves).toContain("posicion_final-V2");
    expect(claves).toContain("zona-V2");
    const vel = filas.find((f) => f.clave === "velocidad")!;
    expect(vel.declarada).toBe("40 km/h");
    expect(vel.indicador).toBe(false);
    for (const f of filas) expect(["coincide", "no_coincide", "sin_dato"]).toContain(f.estado);
    // El conductor dice que lo golpearon en su costado izquierdo; los daños de V2 están a la derecha.
    expect(filas.find((f) => f.clave === "zona" && f.vehiculo === "V2")).toMatchObject({
      declarada: "lateral izquierdo",
      evidencia: "lateral derecho",
      estado: "no_coincide",
    });
    expect(filas.find((f) => f.clave === "direccion" && f.vehiculo === "V2")).toMatchObject({
      declarada: "de izquierda a derecha",
      estado: "no_coincide",
    });
  }, 60_000);
});

describe("dirección de la fuerza y sugerencia (R7)", () => {
  it("la PDOF en horas da la dirección de deformación que dejaría", () => {
    expect(direccionDePdof(0.2)).toBe("de_adelante_hacia_atras");
    expect(direccionDePdof(11.2)).toBe("de_adelante_hacia_atras");
    expect(direccionDePdof(6)).toBe("de_atras_hacia_adelante");
    expect(direccionDePdof(3)).toBe("de_derecha_a_izquierda");
    expect(direccionDePdof(9)).toBe("de_izquierda_a_derecha");
    expect(direccionDePdof(1.6)).toBeNull();
  });

  const fila = (estado: FilaDeclarada["estado"], indicador = true): FilaDeclarada => ({
    clave: "zona",
    vehiculo: "V1",
    concepto: "",
    declarada: "",
    evidencia: "",
    estado,
    fuente: "",
    indicador,
  });

  it("habla de compatibilidad con la evidencia, no de personas, y cuenta solo los indicadores", () => {
    const contra = sugerirDeclarada([
      fila("no_coincide"),
      fila("no_coincide"),
      fila("coincide"),
      fila("no_coincide", false),
    ]);
    expect(contra).toMatchObject({ en_contra: 2, a_favor: 1 });
    expect(contra.texto).toBe(
      "Los daños y la evidencia no son compatibles con la versión declarada en 2 de 3 indicadores.",
    );
    expect(sugerirDeclarada([fila("coincide"), fila("coincide"), fila("sin_dato")]).texto).toBe(
      "Los daños y la evidencia son compatibles con la versión declarada en los 2 indicadores con dato.",
    );
    const poco = sugerirDeclarada([fila("coincide"), fila("no_coincide")]);
    expect(poco.texto).toMatch(/no alcanzan/);
    for (const s of [contra, poco]) expect(s.texto).not.toMatch(/culpa|miente|responsable/i);
  });
});
