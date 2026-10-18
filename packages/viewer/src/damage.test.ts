import { FIXTURE_NAMES, loadResultado } from "@croquis/scene-schema";
import fc from "fast-check";
import { Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  applyVehicleDamage,
  crushAt,
  damageInfluence,
  displacementField,
  measureCrushAt,
  measureCrushProfile,
  measureDamagedWidth,
  TAPER_M,
  valueNoise,
  type DamageInput,
  type DamageSide,
} from "./damage";
import { buildVehicle, PROFILES } from "./vehicle-geometry";

/** Tolerancia de la prueba numérica: 2 cm o 6 % del aplastamiento (arrugas de ±3 %). */
const tol = (c: number) => Math.max(0.02, 0.06 * c);

describe("deformación desde el perfil del solver", () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: el perfil C1–C6 medido sobre la malla coincide con el del solver`, async () => {
      const r = await loadResultado(name);
      let checked = 0;
      for (const v of r.vehiculos) {
        const cdc = v.dano.cdc;
        const lado = cdc?.lado ?? "F";
        // Motos, bicis y scooters no tienen una cara continua donde medir: su deformación es
        // ilustrativa (ADR 0007). Perfiles de milímetros (peatón) quedan bajo la tolerancia.
        if (PROFILES[v.clase]?.kind === "two_wheel") continue;
        if (Math.max(...v.dano.perfil_m) < 0.005 || !["F", "B", "L", "R"].includes(lado)) continue;
        const dims = {
          length: v.dimensiones.largo_m,
          width: v.dimensiones.ancho_m,
          height: v.dimensiones.alto_m,
          wheelbase: v.dimensiones.distancia_entre_ejes_m,
        };
        const input: DamageInput = {
          lado: lado as DamageSide,
          perfil: v.dano.perfil_m,
          ancho: v.dano.ancho_m,
          centro: v.dano.centro_m,
          zonaVertical: cdc?.zona_vertical,
          seed: 7,
        };
        const g = buildVehicle(v.clase, dims);
        const dmg = applyVehicleDamage(g, v.clase, dims, input);
        const measured = measureCrushProfile(g, dmg.field, input);
        v.dano.perfil_m.forEach((c, i) => {
          expect(
            Math.abs((measured[i] ?? NaN) - c),
            `${v.id} C${i + 1}: ${measured[i]} vs ${c}`,
          ).toBeLessThan(tol(c));
        });
        checked++;
      }
      // Toda escena con impacto entre vehículos u objetos tiene al menos un vehículo deformado.
      if (!r.eventos.some((e) => e.tipo === "impacto_vehiculo_persona")) {
        expect(checked).toBeGreaterThan(0);
      }
    });
  }

  it("la compresión nunca pliega el material (el orden en profundidad se conserva)", () => {
    const d = { length: 4.5, width: 1.8, height: 1.5, wheelbase: 2.6 };
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 0.9, noNaN: true }), { minLength: 6, maxLength: 6 }),
        fc.double({ min: -0.8, max: 0.8, noNaN: true }),
        fc.double({ min: 0, max: 2, noNaN: true }),
        fc.double({ min: 0.001, max: 0.5, noNaN: true }),
        (perfil, z, depth, gap) => {
          const field = displacementField(
            { lado: "F", perfil, ancho: 1.8, centro: 0, seed: 1 },
            "sedan_mediano",
            d,
          );
          const a = new Vector3(2.25 - depth, 0.6, z);
          const b = new Vector3(2.25 - depth - gap, 0.6, z);
          const xa = a.x + field.at(a).disp.x;
          const xb = b.x + field.at(b).disp.x;
          expect(xa).toBeGreaterThanOrEqual(xb - 1e-9);
        },
      ),
      { numRuns: 400, seed: 2026 },
    );
  });

  it("el perfil se interpola entre estaciones, C1 a la izquierda, y cae suave fuera del ancho", () => {
    // Ancho 1 m centrado en 0.2: C1 en u = 0.7 (izquierda) y C6 en u = −0.3 (derecha).
    const input = { perfil: [0.5, 0.4, 0.3, 0.2, 0.1, 0], ancho: 1, centro: 0.2 };
    expect(crushAt(input, 0.7)).toBeCloseTo(0.5, 12);
    expect(crushAt(input, -0.3)).toBeCloseTo(0, 12);
    expect(crushAt(input, 0.5)).toBeCloseTo(0.4, 12);
    expect(crushAt(input, 0.2)).toBeCloseTo(0.25, 12);
    const uniform = { perfil: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3], ancho: 1, centro: 0 };
    expect(crushAt(uniform, 0.5 + 0.075)).toBeCloseTo(0.15, 9);
    expect(crushAt(uniform, 0.5 + 0.2)).toBe(0);
  });

  it("antes del impacto no hay deformación y al terminar el contacto es completa", () => {
    expect(damageInfluence(-1)).toBe(0);
    expect(damageInfluence(0)).toBe(0);
    expect(damageInfluence(0.06)).toBeCloseTo(0.5, 9);
    expect(damageInfluence(1)).toBe(1);
  });

  it("hornea un morph target y atributos de daño sin tocar la geometría base", () => {
    const d = { length: 4.5, width: 1.8, height: 1.5, wheelbase: 2.6 };
    const g = buildVehicle("sedan_mediano", d);
    const body = g.getObjectByName("fusion_pintura") as Mesh;
    const before = Float32Array.from(body.geometry.getAttribute("position").array);
    applyVehicleDamage(g, "sedan_mediano", d, {
      lado: "F",
      perfil: [0.2, 0.3, 0.4, 0.4, 0.3, 0.2],
      ancho: 1.8,
      centro: 0,
      seed: 3,
      otherColor: "#ff0000",
    });
    const geo = body.geometry;
    expect(geo.getAttribute("position").array).toEqual(before);
    expect(geo.morphAttributes.position).toHaveLength(1);
    expect(geo.morphAttributes.normal).toHaveLength(1);
    expect(body.morphTargetInfluences).toEqual([0]);
    const dano = geo.getAttribute("dano");
    const transfer = geo.getAttribute("transferencia");
    let maxDano = 0;
    let anyTransfer = false;
    for (let i = 0; i < dano.count; i++) {
      maxDano = Math.max(maxDano, dano.getX(i));
      anyTransfer ||= transfer.getX(i) > 0;
    }
    expect(maxDano).toBe(1);
    expect(anyTransfer).toBe(true);
  });

  it("el ruido de las arrugas es determinista y acotado", () => {
    expect(valueNoise(1.3, 2.7, -0.4, 5)).toBe(valueNoise(1.3, 2.7, -0.4, 5));
    for (let i = 0; i < 200; i++) {
      const v = valueNoise(i * 0.37, i * 0.11, -i * 0.23, 9);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("medición sobre la malla en estaciones arbitrarias (E5)", () => {
  const d = { length: 4.6, width: 1.8, height: 1.45, wheelbase: 2.7 };
  const input: DamageInput = {
    lado: "L",
    perfil: [0.05, 0.12, 0.2, 0.2, 0.12, 0.05],
    ancho: 1.6,
    centro: 0.2,
    seed: 11,
  };

  it("en las estaciones del solver da lo mismo que measureCrushProfile", () => {
    const g = buildVehicle("sedan_mediano", d);
    const dmg = applyVehicleDamage(g, "sedan_mediano", d, input);
    const stations = Array.from(
      { length: 6 },
      (_, k) => input.centro + (0.5 - k / 5) * input.ancho,
    );
    expect(measureCrushAt(g, dmg.field, stations)).toEqual(
      measureCrushProfile(g, dmg.field, input),
    );
  });

  it("entre estaciones sigue el perfil, y fuera del daño la carrocería no se hunde", () => {
    const g = buildVehicle("sedan_mediano", d);
    const dmg = applyVehicleDamage(g, "sedan_mediano", d, input);
    // Mitad entre C3 y C4 (centro del daño): 0.2 m, con la tolerancia de la prueba del solver.
    const [mid, far] = measureCrushAt(g, dmg.field, [input.centro, input.centro - 2.0]);
    expect(Math.abs(mid! - 0.2)).toBeLessThan(Math.max(0.02, 0.06 * 0.2));
    expect(far!).toBeLessThan(0.005);
  });

  it("el ancho dañado (más de 2 cm) cae entre el ancho del perfil y el de su transición", () => {
    const g = buildVehicle("sedan_mediano", d);
    const dmg = applyVehicleDamage(g, "sedan_mediano", d, input);
    const w = measureDamagedWidth(g, dmg.field, 0.02);
    expect(w).toBeGreaterThan(input.ancho - 0.2);
    expect(w).toBeLessThan(input.ancho + 2 * TAPER_M + 0.05);
    const intact = buildVehicle("sedan_mediano", d);
    const none = applyVehicleDamage(intact, "sedan_mediano", d, {
      ...input,
      perfil: [0, 0, 0, 0, 0, 0],
    });
    expect(measureDamagedWidth(intact, none.field, 0.02)).toBe(0);
  });
});
