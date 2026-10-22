import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEscena } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { conMasa, conPosicion, escenaDeNarracion } from "./escena-narracion";
import { mcHenry } from "./metodo";
import { especDeExpediente, reconstruirExpediente, rumboEscena } from "./reconstruccion";
import { verificacionCesvi } from "./verificacion";

type Json = Record<string, unknown>;

/** El crucero de E-R1 (narración de desarrollo, lectura grabada): V1 de frente contra el costado de V2. */
const grabacion = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
    ),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const base = escenaDeNarracion(grabacion.salida, grabacion.narracion).expediente;

/** Un punto a `norte` y `este` metros de un origen fijo (entrada de prueba, no un dato del caso). */
const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});

function colocado(): Expediente {
  let e = conPosicion(base, { vehiculo: "V1", fase: "impacto", punto: m(-2, 0), rumbo: 0 });
  e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0, 2), rumbo: 90 });
  e = conPosicion(e, { vehiculo: "V1", fase: "final", punto: m(4, 5), rumbo: 30 });
  return conPosicion(e, { vehiculo: "V2", fase: "final", punto: m(3, 9), rumbo: 80 });
}

describe("del expediente a la escena del solver (R2)", () => {
  it("convierte el rumbo del contrato (desde el norte, horario) al de la escena (desde +X, antihorario)", () => {
    expect(rumboEscena(0)).toBe(90);
    expect(rumboEscena(90)).toBe(0);
    expect(rumboEscena(180)).toBe(-90);
    expect(rumboEscena(270)).toBe(180);
  });

  it("sin posiciones, la escena es válida y todo lo no dicho es supuesto o por omisión", () => {
    const { spec, ids, limites } = especDeExpediente(base);
    expect(validateEscena(spec).ok).toBe(true);
    expect(ids).toEqual({ "veh-a": "V1", "veh-b": "V2" });
    const v = (spec.vehiculos as Json[])[0]!;
    expect((v.posicion_inicial as Json).procedencia).toMatchObject({ fuente: "supuesto" });
    expect(limites).toEqual([]);
  });

  it("lo que coloca el perito entra como declarado, en metros desde el punto de impacto", () => {
    const { spec } = especDeExpediente(conMasa(colocado(), "V2", 1450));
    expect(validateEscena(spec).ok).toBe(true);
    const [a, b] = spec.vehiculos as Json[];
    // El origen es el promedio de las posiciones de impacto: (−1 m norte, 1 m este).
    expect(a!.posicion_final).toMatchObject({ rumbo_deg: 60, procedencia: { fuente: "usuario" } });
    expect((a!.posicion_final as Json).x).toBeCloseTo(4, 1);
    expect((a!.posicion_final as Json).y).toBeCloseTo(5, 1);
    expect(b!.masa).toMatchObject({ valor: 1450, unidad: "kg", fuente: "usuario" });
    // La inicial: 12 m antes de la posición de impacto, en su rumbo, como supuesto.
    expect((a!.posicion_inicial as Json).y).toBeCloseTo(-13, 1);
    expect((a!.posicion_inicial as Json).procedencia).toMatchObject({ fuente: "supuesto" });
  });

  it("las medidas C y L van como daño declarado; más de un impacto se dice como límite", () => {
    const danos = base.danos!.map((d, k) =>
      k === 0 ? { ...d, magnitud: { c_m: [0.3, 0.42, 0.25], l_m: 1.2 } } : d,
    );
    const e: Expediente = {
      ...base,
      danos,
      impactos: [
        ...base.impactos!,
        { orden: 2, vehiculos: ["V1"], objeto_fijo: "poste", fuente: "perito" },
      ],
    };
    const { spec, limites } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const danosDeclarados = spec.danos_declarados as Json[];
    expect(danosDeclarados).toHaveLength(1);
    expect(danosDeclarados[0]!.vehiculo_id).toBe("veh-a");
    expect(danosDeclarados[0]!.profundidad_aplastamiento).toMatchObject({
      valor: 0.42,
      fuente: "usuario",
    });
    expect(danosDeclarados[0]!.ancho_danado).toMatchObject({ valor: 1.2, fuente: "usuario" });
    expect(limites[0]).toMatch(/2 impactos/);
  });

  it("sin evidencia no inventa velocidades; con las posiciones del perito las fija con rangos", () => {
    const sin = reconstruirExpediente(base);
    expect(sin.evidencia).toEqual([]);
    expect(sin.velocidades.every((v) => v.previa === null)).toBe(true);
    expect(sin.limites.at(-1)).toMatch(/todavía no fija ninguna velocidad/);

    const con = reconstruirExpediente(colocado());
    expect(con.evidencia).toEqual([
      "reposo:veh-a",
      "reposo:veh-b",
      "rumbo_final:veh-a",
      "rumbo_final:veh-b",
    ]);
    for (const v of con.velocidades) {
      expect(v.previa).not.toBeNull();
      expect(v.previa!.p10!).toBeLessThanOrEqual(v.previa!.p90!);
    }
  });
});

describe("verificación CESVI al lado de la reconstrucción", () => {
  const conMedidas = (rigidez?: Expediente["vehiculos"][number]["rigidez"]): Expediente => ({
    ...base,
    vehiculos: base.vehiculos.map((v) =>
      v.id === "V1"
        ? {
            ...v,
            clase: "sedan_compacto",
            masa: { valor: 1200, unidad: "kg", fuente: "perito" },
            ...(rigidez && { rigidez }),
          }
        : v,
    ),
    danos: base.danos!.map((d) =>
      d.vehiculo === "V1" && d.zona.cara === "frontal"
        ? { ...d, magnitud: { c_m: [0.3, 0.42, 0.25, 0.1], l_m: 1.2 } }
        : d,
    ),
  });

  it("con medidas, masa y la rigidez del perito: McHenry y EBS sustituidos, como en C1", () => {
    const [v1] = verificacionCesvi(conMedidas({ A: 50000, B: 400000, fuente: "perito" }));
    expect(v1!.falta).toEqual([]);
    expect(v1!.rigidez).toMatchObject({ fuente: "perito", A: 50000, B: 400000 });
    const e = mcHenry({ L: 1.2, A: 50000, B: 400000, C: [0.3, 0.42, 0.25, 0.1] }).energia;
    expect(v1!.pasos[0]!.paso.calculo).toMatchObject({ energia: e });
    expect(v1!.pasos[1]!.paso.resultado).toContain("km/h");
    expect((v1!.pasos[1]!.paso.calculo as { ms: number }).ms).toBeCloseTo(
      Math.sqrt((2 * e) / 1200),
      9,
    );
  });

  it("la rigidez de dictamen en kN/m (el caso de AXA) da kJ y EBS con la masa en toneladas, como C1", () => {
    const e: Expediente = {
      ...base,
      vehiculos: base.vehiculos.map((v) =>
        v.id === "V1"
          ? {
              ...v,
              masa: { valor: 1431.083, unidad: "kg", fuente: "dictamen_importado" },
              rigidez: { A: 55.405, B: 385.336, fuente: "dictamen" },
            }
          : v,
      ),
      danos: base.danos!.map((d) =>
        d.vehiculo === "V1" && d.zona.cara === "frontal"
          ? { ...d, magnitud: { c_m: [0.96, 0.86, 0.52, 0.2], l_m: 1.689 } }
          : d,
      ),
    };
    const [v1] = verificacionCesvi(e);
    expect(v1!.notas[0]).toMatch(/kN\/m/);
    expect(v1!.pasos[0]!.paso.resultado).toBe("E = 225.454 kJ");
    // La misma velocidad que la fila «con los datos impresos» de C1 (63.90 km/h).
    expect((v1!.pasos[1]!.paso.calculo as { kmh: number }).kmh).toBeCloseTo(63.9, 1);
  });

  it("sin rigidez propia la toma de NHTSA E2 marcada; sin medidas dice qué falta", () => {
    const [v1, v2] = verificacionCesvi(conMedidas());
    expect(["nhtsa_e2", "supuesto"]).toContain(v1!.rigidez!.fuente);
    expect(v1!.pasos).toHaveLength(2);
    expect(v2!.pasos).toEqual([]);
    expect(v2!.falta).toEqual(["las medidas C (2, 4 o 6) y L de la deformación", "la masa"]);
  });
});
