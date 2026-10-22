import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEscena } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { conMasa, conPosicion, escenaDeNarracion } from "./escena-narracion";
import { especDeExpediente, reconstruirExpediente, rumboEscena } from "./reconstruccion";

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
      impactos: [...base.impactos!, { orden: 2, vehiculos: ["V1"], objeto_fijo: "poste" }],
    };
    const { spec, limites } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    expect(spec.danos_declarados).toEqual([
      expect.objectContaining({
        vehiculo_id: "veh-a",
        profundidad_aplastamiento: expect.objectContaining({ valor: 0.42, fuente: "usuario" }),
        ancho_danado: expect.objectContaining({ valor: 1.2, fuente: "usuario" }),
      }),
    ]);
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
