/**
 * T3.3 (W8, ADR 0136): la reversa en la app. El sentido de marcha va aparte de la forma de la
 * maniobra, la velocidad que no dio el perito es un supuesto con fuente y la lectura marca la
 * reversa con vuelta.
 */
import { validateEscena } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { expedienteDeSalida, type Expediente } from "./corpus";
import tabla from "./data/reversa-nhtsa.json";
import { isReverse, reconstruct } from "@croquis/solver-ts";
import { especDeclarada } from "./comparacion-declarada";
import type { VersionDeclarada } from "./declaracion";
import { especDeExpediente, type EscenaSolver } from "./reconstruccion";
import { avisoReversaRapida, REVERSA_KMH } from "./reversa";

type Json = Record<string, unknown>;

function caso(maniobras: Json[]): Expediente {
  return {
    caso: {},
    vehiculos: [
      { id: "V1", clase: "sedan_compacto" },
      { id: "V2", clase: "pickup" },
    ],
    danos: [
      { vehiculo: "V1", zona: { cara: "posterior" }, fuente: "perito" },
      { vehiculo: "V2", zona: { cara: "frontal" }, fuente: "perito" },
    ],
    impactos: [{ orden: 1, vehiculos: ["V1", "V2"], fuente: "perito" }],
    versiones: [{ tipo: "evidencia", maniobras }],
  } as unknown as Expediente;
}
function v1(maniobras: Json[]) {
  const { spec, ids, limites } = especDeExpediente(caso(maniobras));
  expect(validateEscena(spec).ok).toBe(true);
  const sid = Object.keys(ids).find((k) => ids[k] === "V1")!;
  return { sv: (spec.vehiculos as Json[]).find((v) => v.id === sid)!, limites };
}

describe("la reversa en la escena del perito", () => {
  it("los cuantiles salen de la tabla de NHTSA, en km/h", () => {
    const q = tabla.velocidad_maxima_mph;
    expect(REVERSA_KMH).toEqual({
      p10: Math.round(q.p10 * 160.9344) / 100,
      p50: Math.round(q.p50 * 160.9344) / 100,
      p90: Math.round(q.p90 * 160.9344) / 100,
      max: Math.round(q.max * 160.9344) / 100,
    });
    expect(REVERSA_KMH.p50).toBe(5.68);
    expect(REVERSA_KMH.max).toBe(23);
  });

  it("quien retrocede sin velocidad dicha va a la de una reversa, como supuesto con su rango", () => {
    const { sv, limites } = v1([
      { vehiculo: "V1", tipo: "reversa" },
      { vehiculo: "V2", tipo: "se_detiene" },
    ]);
    expect(sv.maniobra).toMatchObject({ valor: "reversa", fuente: "usuario" });
    expect(sv.sentido_marcha).toMatchObject({ valor: "reversa", fuente: "usuario" });
    expect(sv.velocidad_previa).toMatchObject({
      valor: REVERSA_KMH.p50,
      unidad: "km/h",
      rango: [REVERSA_KMH.p10, REVERSA_KMH.p90],
      fuente: "supuesto",
    });
    expect(limites.some((l) => l.includes("V1 va en reversa") && l.includes("NHTSA"))).toBe(true);
  });

  it("quien avanza conserva su velocidad por omisión y no lleva sentido de marcha", () => {
    const { sv, limites } = v1([{ vehiculo: "V2", tipo: "se_detiene" }]);
    expect(sv.sentido_marcha).toBeUndefined();
    expect((sv.velocidad_previa as Json).valor).toBe(40);
    expect(limites.some((l) => l.includes("reversa"))).toBe(false);
  });

  it("la reversa con vuelta conserva las dos cosas, en cualquier orden", () => {
    for (const maniobras of [
      [
        { vehiculo: "V1", tipo: "reversa" },
        { vehiculo: "V1", tipo: "vira_izquierda" },
      ],
      [
        { vehiculo: "V1", tipo: "vira_izquierda" },
        { vehiculo: "V1", tipo: "reversa" },
      ],
      [{ vehiculo: "V1", tipo: "vira_izquierda", sentido_marcha: "reversa" }],
    ]) {
      const { sv } = v1(maniobras);
      expect(sv.maniobra).toMatchObject({ valor: "vuelta_izquierda", fuente: "usuario" });
      expect(sv.sentido_marcha).toMatchObject({ valor: "reversa" });
      expect((sv.velocidad_previa as Json).valor).toBe(REVERSA_KMH.p50);
    }
  });

  it("quien se detuvo y luego retrocedió va en reversa, no detenido", () => {
    const { sv } = v1([
      { vehiculo: "V1", tipo: "se_detiene" },
      { vehiculo: "V1", tipo: "reversa" },
    ]);
    expect(sv.maniobra).toMatchObject({ valor: "reversa" });
    expect(sv.sentido_marcha).toMatchObject({ valor: "reversa" });
  });

  it("avisa solo cuando la reversa pasa de la más rápida que se ha medido", () => {
    expect(avisoReversaRapida("V1", REVERSA_KMH.max)).toBeNull();
    expect(avisoReversaRapida("V1", 9)).toBeNull();
    const aviso = avisoReversaRapida("V1", 34.73)!;
    expect(aviso).toContain("35 km/h en reversa");
    expect(aviso).toContain("23 km/h");
    expect(aviso).toContain("NHTSA");
  });
});

describe("sin posiciones del perito, quien retrocede llega de espaldas al otro", () => {
  /** Dos vehículos sin impacto narrado: solo sus daños y quién retrocede. */
  function suelto(danos: [string, string][], maniobras: Json[]) {
    const e = {
      caso: {},
      vehiculos: [
        { id: "V1", clase: "sedan_compacto" },
        { id: "V2", clase: "sedan_compacto" },
      ],
      danos: danos.map(([vehiculo, cara]) => ({ vehiculo, zona: { cara }, fuente: "perito" })),
      versiones: [{ tipo: "evidencia", maniobras }],
    } as unknown as Expediente;
    const base = especDeExpediente(e);
    expect(validateEscena(base.spec).ok).toBe(true);
    const de = (v: string) =>
      (base.spec.vehiculos as Json[]).find(
        (x) => x.id === Object.keys(base.ids).find((k) => base.ids[k] === v),
      )!;
    const pose = (v: string) =>
      de(v).posicion_inicial as { x: number; y: number; rumbo_deg: number };
    /** ¿Retrocediendo se acerca al otro? */
    const seAcerca = (v: string, otro: string) => {
      const p = pose(v);
      const q = pose(otro);
      const rad = (p.rumbo_deg * Math.PI) / 180;
      return -(Math.cos(rad) * (q.x - p.x) + Math.sin(rad) * (q.y - p.y)) > 0;
    };
    const zonas: Record<string, string> = Object.fromEntries(
      (
        ((base.spec.eventos as Json[])[0]!.zonas_impacto ?? []) as {
          vehiculo_id: string;
          cdc: { lado: string };
        }[]
      ).map((z): [string, string] => [String(base.ids[z.vehiculo_id]), z.cdc.lado]),
    );
    return { base, seAcerca, zonas };
  }

  it("con daño posterior en uno y frontal en el otro, toca con su parte posterior", () => {
    const { base, seAcerca, zonas } = suelto(
      [
        ["V1", "posterior"],
        ["V2", "frontal"],
      ],
      [{ vehiculo: "V1", tipo: "reversa" }],
    );
    expect(zonas).toEqual({ V1: "B", V2: "F" });
    expect(seAcerca("V1", "V2")).toBe(true);
    expect(base.limites.some((l) => l.includes("se supone que toca con su parte posterior"))).toBe(
      true,
    );
    const r = reconstruct(base.spec);
    expect(r.banderas.some((b) => b.includes("no llegan a tocarse"))).toBe(false);
    expect(r.vehiculos.every((v) => v.deltaVKmh > 0)).toBe(true);
  });

  it("si el otro tiene el daño en un costado o no tiene daños, también se acerca retrocediendo", () => {
    for (const danos of [[["V2", "lateral_izquierdo"]], [["V2", "lateral_derecho"]], []] as [
      string,
      string,
    ][][]) {
      const { seAcerca, zonas } = suelto(danos, [{ vehiculo: "V1", tipo: "reversa" }]);
      expect(zonas.V1).toBe("B");
      expect(seAcerca("V1", "V2")).toBe(true);
    }
  });

  it("si los dos retroceden, se acercan de espaldas", () => {
    const { seAcerca, zonas } = suelto(
      [],
      [
        { vehiculo: "V1", tipo: "reversa" },
        { vehiculo: "V2", tipo: "reversa" },
      ],
    );
    expect(zonas).toEqual({ V1: "B", V2: "B" });
    expect(seAcerca("V1", "V2")).toBe(true);
    expect(seAcerca("V2", "V1")).toBe(true);
  });

  it("quien retrocede con el daño solo en un costado conserva esa cara", () => {
    const { zonas } = suelto(
      [
        ["V1", "lateral_derecho"],
        ["V2", "frontal"],
      ],
      [{ vehiculo: "V1", tipo: "reversa" }],
    );
    expect(zonas).toEqual({ V1: "R", V2: "F" });
  });

  it("sin nadie en reversa, la disposición genérica queda como estaba", () => {
    const { base, zonas } = suelto(
      [
        ["V1", "posterior"],
        ["V2", "frontal"],
      ],
      [{ vehiculo: "V2", tipo: "se_detiene" }],
    );
    expect(zonas).toEqual({});
    expect(base.limites.some((l) => l.includes("caras de contacto"))).toBe(false);
  });
});

describe("la versión declarada lleva su propio sentido de marcha", () => {
  const declara = (tipo: string): VersionDeclarada => ({
    declarante: "V1",
    maniobras: [{ vehiculo: "V1", tipo, cita: "" }],
    velocidades: [],
    contactos: [],
    finales: [],
    descartados: { citas: 0, numeros: 0 },
  });
  const v1De = (base: EscenaSolver) =>
    (base.spec.vehiculos as Json[]).find(
      (v) => v.id === Object.keys(base.ids).find((k) => base.ids[k] === "V1"),
    )!;

  it("si la evidencia dice reversa y el conductor dice que circulaba, no va en reversa", () => {
    const base = especDeExpediente(caso([{ vehiculo: "V1", tipo: "reversa" }]));
    expect(isReverse(v1De(base))).toBe(true);
    const decl = especDeclarada(base, declara("circula"));
    expect(validateEscena(decl.spec).ok).toBe(true);
    expect(isReverse(v1De(decl))).toBe(false);
  });

  it("una reversa declarada sin velocidad va a la de una reversa, no a la de la reconstrucción", () => {
    const base = especDeExpediente(caso([{ vehiculo: "V2", tipo: "se_detiene" }]));
    // La reconstrucción trae a V1 avanzando a 35 km/h.
    const decl = especDeclarada(base, declara("reversa"), new Map([["V1", 35]]));
    expect(validateEscena(decl.spec).ok).toBe(true);
    expect(v1De(decl).velocidad_previa).toMatchObject({
      valor: REVERSA_KMH.p50,
      rango: [REVERSA_KMH.p10, REVERSA_KMH.p90],
      fuente: "supuesto",
    });
    expect(decl.limites.some((l) => l.startsWith("V1: el conductor declara una reversa"))).toBe(
      true,
    );
    expect(decl.limites.some((l) => l.includes("va la de la reconstrucción"))).toBe(false);
  });

  it("una reversa declarada con su velocidad conserva la que dijo el conductor", () => {
    const base = especDeExpediente(caso([{ vehiculo: "V2", tipo: "se_detiene" }]));
    const v = { ...declara("reversa"), velocidades: [{ vehiculo: "V1", kmh: 12, cita: "" }] };
    const decl = especDeclarada(base, v, new Map([["V1", 35]]));
    expect(v1De(decl).velocidad_previa).toMatchObject({ valor: 12, fuente: "usuario" });
  });

  it("quien declara que circulaba sigue yendo a la velocidad de la reconstrucción", () => {
    const base = especDeExpediente(caso([{ vehiculo: "V2", tipo: "se_detiene" }]));
    const decl = especDeclarada(base, declara("circula"), new Map([["V1", 35]]));
    expect(v1De(decl).velocidad_previa).toMatchObject({ valor: 35, fuente: "supuesto" });
  });

  it("si el conductor declara la reversa, va en reversa", () => {
    const base = especDeExpediente(caso([{ vehiculo: "V2", tipo: "se_detiene" }]));
    const decl = especDeclarada(base, declara("reversa"));
    expect(validateEscena(decl.spec).ok).toBe(true);
    expect(v1De(decl).sentido_marcha).toMatchObject({ valor: "reversa", fuente: "usuario" });
    expect(isReverse(v1De(decl))).toBe(true);
  });
});

describe("la lectura marca la reversa con vuelta", () => {
  const texto =
    "El vehículo A salía de su cochera en reversa virando a la izquierda cuando el vehículo B circulaba por la calle.";
  const fila = (campo: string, valor: string, vehiculo: string, n: number, cita = "") => ({
    seccion: "movimiento",
    n,
    vehiculo,
    campo,
    valor,
    cita,
  });
  const maniobras = (datos: Json[]) =>
    expedienteDeSalida({ datos } as never, texto, "perito").expediente.versiones?.find(
      (v) => v.tipo === "evidencia",
    )?.maniobras;

  it("con dos filas de maniobra (reversa y vuelta) del mismo vehículo", () => {
    const m = maniobras([
      fila("maniobra", "reversa", "V1", 1, "salía de su cochera en reversa virando a la izquierda"),
      fila("maniobra", "vira_izquierda", "V1", 1),
      fila("maniobra", "circula", "V2", 2, "el vehículo B circulaba por la calle"),
    ]);
    expect(m).toMatchObject([
      { vehiculo: "V1", tipo: "vira_izquierda", sentido_marcha: "reversa" },
      { vehiculo: "V2", tipo: "circula" },
    ]);
    expect(m![1]).not.toHaveProperty("sentido_marcha");
  });

  it("con una vuelta cuya cita dice que iba en reversa", () => {
    const m = maniobras([
      fila(
        "maniobra",
        "vira_izquierda",
        "V1",
        1,
        "salía de su cochera en reversa virando a la izquierda",
      ),
    ]);
    expect(m).toMatchObject([
      { vehiculo: "V1", tipo: "vira_izquierda", sentido_marcha: "reversa" },
    ]);
  });

  it("una reversa sola queda como antes", () => {
    const m = maniobras([
      fila("maniobra", "reversa", "V1", 1, "salía de su cochera en reversa virando a la izquierda"),
    ]);
    expect(m).toMatchObject([{ vehiculo: "V1", tipo: "reversa" }]);
    expect(m![0]).not.toHaveProperty("sentido_marcha");
  });
});
