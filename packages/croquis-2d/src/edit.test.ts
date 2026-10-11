import {
  FIXTURE_NAMES,
  checkEscena,
  isValidEscena,
  loadFixture,
  type EscenaSpec,
} from "@croquis/scene-schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyEdit, applyEdits, normalizeHeading, snap, type EditOp } from "./edit";

/** Rutas (JSON Pointer) donde dos documentos difieren. */
function diffPaths(a: unknown, b: unknown, path = ""): string[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    return Array.from({ length: n }, (_, i) => diffPaths(a[i], b[i], `${path}/${i}`)).flat();
  }
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) =>
      diffPaths(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${path}/${k}`,
      ),
    );
  }
  return Object.is(a, b) ? [] : [path];
}

function editPrefix(spec: EscenaSpec, op: EditOp): string {
  switch (op.kind) {
    case "move_vehicle":
    case "rotate_vehicle":
      return `/vehiculos/${spec.vehiculos.findIndex((v) => v.id === op.id)}/${op.pose === "inicial" ? "posicion_inicial" : "posicion_final"}`;
    case "move_person":
      return `/personas/${spec.personas.findIndex((p) => p.id === op.id)}/${op.pose === "inicial" ? "posicion_inicial" : "posicion_final"}`;
    case "move_object":
      return `/entorno/objetos/${(spec.entorno.objetos ?? []).findIndex((o) => o.id === op.id)}`;
    case "move_device":
      return `/lugar/dispositivos/${(spec.lugar.dispositivos ?? []).findIndex((d) => d.id === op.id)}`;
    case "move_evidence_point":
      return `/evidencias/${spec.evidencias.findIndex((e) => e.id === op.id)}`;
    case "move_event_point":
      return `/eventos/${spec.eventos.findIndex((e) => e.id === op.id)}`;
  }
}

function opArbitrary(spec: EscenaSpec): fc.Arbitrary<EditOp> {
  const coord = fc.double({ min: -60, max: 60, noNaN: true });
  const pose = fc.constantFrom<"inicial" | "final">("inicial", "final");
  const arbs: fc.Arbitrary<EditOp>[] = [];
  const vehIds = spec.vehiculos.map((v) => v.id);
  if (vehIds.length) {
    arbs.push(
      fc.record({
        kind: fc.constant("move_vehicle" as const),
        id: fc.constantFrom(...vehIds),
        pose,
        x: coord,
        y: coord,
      }),
    );
    arbs.push(
      fc.record({
        kind: fc.constant("rotate_vehicle" as const),
        id: fc.constantFrom(...vehIds),
        pose,
        rumbo_deg: fc.double({ min: -720, max: 720, noNaN: true }),
      }),
    );
  }
  const perIds = spec.personas.map((p) => p.id);
  if (perIds.length)
    arbs.push(
      fc.record({
        kind: fc.constant("move_person" as const),
        id: fc.constantFrom(...perIds),
        pose,
        x: coord,
        y: coord,
      }),
    );
  const objIds = (spec.entorno.objetos ?? []).map((o) => o.id);
  if (objIds.length)
    arbs.push(
      fc.record({
        kind: fc.constant("move_object" as const),
        id: fc.constantFrom(...objIds),
        x: coord,
        y: coord,
      }),
    );
  const devIds = (spec.lugar.dispositivos ?? []).map((d) => d.id);
  if (devIds.length)
    arbs.push(
      fc.record({
        kind: fc.constant("move_device" as const),
        id: fc.constantFrom(...devIds),
        x: coord,
        y: coord,
      }),
    );
  const evs = spec.evidencias.filter((e) => (e.puntos?.length ?? 0) > 0);
  if (evs.length) {
    arbs.push(
      fc
        .constantFrom(...evs)
        .chain((e) =>
          fc.record({
            kind: fc.constant("move_evidence_point" as const),
            id: fc.constant(e.id),
            index: fc.nat({ max: (e.puntos?.length ?? 1) - 1 }),
            x: coord,
            y: coord,
          }),
        ),
    );
  }
  const evtIds = spec.eventos.filter((e) => e.punto_impacto).map((e) => e.id);
  if (evtIds.length)
    arbs.push(
      fc.record({
        kind: fc.constant("move_event_point" as const),
        id: fc.constantFrom(...evtIds),
        x: coord,
        y: coord,
      }),
    );
  return fc.oneof(...arbs);
}

describe("applyEdit", () => {
  it("mueve un vehículo, redondea a centímetros y marca la procedencia como usuario", () => {
    const spec = loadFixture("alcance");
    const next = applyEdit(spec, {
      kind: "move_vehicle",
      id: "veh-a",
      pose: "inicial",
      x: -12.3456,
      y: 0.004,
    });
    expect(next.vehiculos[0]?.posicion_inicial).toMatchObject({ x: -12.35, y: 0, rumbo_deg: 0 });
    expect(next.vehiculos[0]?.posicion_inicial.procedencia).toEqual({
      fuente: "usuario",
      confianza: 1,
      nota: spec.vehiculos[0]?.posicion_inicial.procedencia.nota,
    });
    expect(spec.vehiculos[0]?.posicion_inicial.x).toBe(-30); // no muta la entrada
  });

  it("gira normalizando el rumbo a (-180, 180]", () => {
    const spec = loadFixture("alcance");
    expect(
      applyEdit(spec, { kind: "rotate_vehicle", id: "veh-a", pose: "inicial", rumbo_deg: 370 })
        .vehiculos[0]?.posicion_inicial.rumbo_deg,
    ).toBe(10);
    expect(
      applyEdit(spec, { kind: "rotate_vehicle", id: "veh-a", pose: "inicial", rumbo_deg: -190 })
        .vehiculos[0]?.posicion_inicial.rumbo_deg,
    ).toBe(170);
    expect(normalizeHeading(180)).toBe(180);
    expect(normalizeHeading(-180)).toBe(180);
    expect(snap(1.004, 0.01)).toBeCloseTo(1, 10);
    expect(snap(1.006, 0.01)).toBeCloseTo(1.01, 10);
  });

  it("crea la posición final si no existía", () => {
    const spec = loadFixture("volcadura");
    const next = applyEdit(spec, { kind: "move_vehicle", id: "veh-b", pose: "final", x: 1, y: 2 });
    expect(next.vehiculos[1]?.posicion_final).toEqual({
      x: 1,
      y: 2,
      rumbo_deg: 0,
      procedencia: { fuente: "usuario", confianza: 1, nota: undefined },
    });
  });

  it("rechaza ids inexistentes", () => {
    const spec = loadFixture("alcance");
    expect(() =>
      applyEdit(spec, { kind: "move_vehicle", id: "nope", pose: "inicial", x: 0, y: 0 }),
    ).toThrow(/inexistente/);
    expect(() =>
      applyEdit(spec, { kind: "move_evidence_point", id: "evid-frenado-a", index: 9, x: 0, y: 0 }),
    ).toThrow(/inexistente/);
  });

  for (const name of FIXTURE_NAMES) {
    it(`${name}: editar en el croquis y volver al JSON no pierde datos (propiedad)`, () => {
      const spec = loadFixture(name);
      fc.assert(
        fc.property(fc.array(opArbitrary(spec), { minLength: 1, maxLength: 8 }), (ops) => {
          const next = applyEdits(spec, ops);
          // 1) sigue siendo una EscenaSpec válida
          expect(isValidEscena(JSON.parse(JSON.stringify(next)))).toBe(true);
          // 2) solo cambiaron las rutas editadas
          const allowed = ops.map((op) => editPrefix(spec, op));
          for (const p of diffPaths(spec, next)) {
            expect(allowed.some((a) => p.startsWith(a))).toBe(true);
          }
          // 3) las rutas editadas quedan con procedencia de usuario
          for (const op of ops) {
            const prefix = editPrefix(spec, op);
            const node = prefix
              .slice(1)
              .split("/")
              .reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], next) as {
              procedencia: { fuente: string; confianza: number };
            };
            expect(node.procedencia.fuente).toBe("usuario");
            expect(node.procedencia.confianza).toBe(1);
          }
          // 4) la semántica no se rompe salvo, a lo sumo, por vehículos encimados al azar
          const errores = checkEscena(next).filter(
            (p) => p.severidad === "error" && p.codigo !== "E009",
          );
          expect(errores).toEqual([]);
        }),
        { numRuns: 40, seed: 20261010 },
      );
    });
  }
});
