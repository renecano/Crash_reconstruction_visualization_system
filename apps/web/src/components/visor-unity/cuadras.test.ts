import { describe, expect, it } from "vitest";
import { distanceToRoad } from "@croquis/viewer/puro";
import { ANCHO_BANQUETA_M, planCuadras, RADIO_FONDO_M } from "./cuadras";

/** Un cruce de dos calles de 7 m, de 240 m cada una. */
const CRUCE = [
  { a: { x: -120, y: 0 }, b: { x: 120, y: 0 }, half: 3.5 },
  { a: { x: 0, y: -120 }, b: { x: 0, y: 120 }, half: 3.5 },
];
const CENTRO = { x: 0, y: 0 };

function esquinas(l: { x: number; y: number; w: number; d: number; yaw: number }) {
  const ux = Math.cos(l.yaw);
  const uy = Math.sin(l.yaw);
  return [-1, 1].flatMap((i) =>
    [-1, 1].map((j) => ({
      x: l.x + (ux * l.w * i) / 2 - (uy * l.d * j) / 2,
      y: l.y + (uy * l.w * i) / 2 + (ux * l.d * j) / 2,
    })),
  );
}

describe("planCuadras", () => {
  it("da la misma calle con la misma semilla y otra con otra", () => {
    const a = planCuadras(CRUCE, CENTRO, 7);
    expect(planCuadras(CRUCE, CENTRO, 7)).toEqual(a);
    expect(planCuadras(CRUCE, CENTRO, 8)).not.toEqual(a);
  });

  it("no pone ningún lote sobre la calzada ni sobre la banqueta", () => {
    const { lotes } = planCuadras(CRUCE, CENTRO, 7);
    expect(lotes.length).toBeGreaterThan(40);
    for (const l of lotes) {
      for (const p of esquinas(l)) {
        expect(distanceToRoad(p, CRUCE)).toBeGreaterThanOrEqual(ANCHO_BANQUETA_M - 0.06);
      }
    }
  });

  it("pega la primera fila a la banqueta, salvo las casas remetidas", () => {
    const { lotes } = planCuadras(CRUCE, CENTRO, 7);
    const primera = lotes.filter((l) => l.tipo !== "fondo");
    expect(primera.length).toBeGreaterThan(20);
    for (const l of primera) {
      const frente = Math.min(...esquinas(l).map((p) => distanceToRoad(p, CRUCE)));
      expect(frente).toBeCloseTo(ANCHO_BANQUETA_M + l.remetimiento, 1);
    }
  });

  it("no encima un lote con otro y se queda dentro del radio", () => {
    const { lotes } = planCuadras(CRUCE, CENTRO, 7);
    for (const l of lotes) {
      expect(Math.hypot(l.x, l.y)).toBeLessThanOrEqual(RADIO_FONDO_M);
      const dentro = lotes.filter((o) => {
        const dx = l.x - o.x;
        const dy = l.y - o.y;
        const u = dx * Math.cos(o.yaw) + dy * Math.sin(o.yaw);
        const v = -dx * Math.sin(o.yaw) + dy * Math.cos(o.yaw);
        return Math.abs(u) < o.w / 2 && Math.abs(v) < o.d / 2;
      });
      // Su centro solo cae dentro de sí mismo.
      expect(dentro).toEqual([l]);
    }
  });

  it("llena las esquinas: no deja más de 1 m sin fachada junto a un cruce", () => {
    const { lotes } = planCuadras(CRUCE, CENTRO, 7);
    // Sobre la calle horizontal, del lado norte, el lote más cercano al cruce por la derecha.
    const lado = lotes.filter(
      (l) =>
        l.tipo !== "fondo" && l.y > 0 && l.x > 0 && l.y < 25 && Math.abs(Math.sin(l.yaw)) < 0.01,
    );
    const inicio = Math.min(...lado.map((l) => l.x - l.w / 2));
    expect(inicio - (3.5 + ANCHO_BANQUETA_M)).toBeLessThan(1);
  });
});
