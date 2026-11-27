import { describe, expect, it } from "vitest";
import { distanceToRoad } from "@croquis/viewer/puro";
import {
  ANCHO_BANQUETA_M,
  dentroDe,
  enElCaso,
  islasDeGlorieta,
  planCuadras,
  RADIO_FONDO_M,
  zonasDelCaso,
} from "./cuadras";

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

describe("lo que recorre el caso queda libre (U6)", () => {
  it("ningún lote cae sobre un vehículo que terminó fuera de la calle", () => {
    // Una calle este-oeste de 7 m y un vehículo que acaba 8 m al norte de su eje, ya en la acera.
    const calle = [{ a: { x: -120, y: 0 }, b: { x: 120, y: 0 }, half: 3.5 }];
    const zonas = zonasDelCaso([
      {
        trayectoria: { x: [-20, -10, 0, 4, 6], y: [0, 0, 0, 5, 8] },
        dimensiones: { largo_m: 4.5, ancho_m: 1.8 },
      },
    ]);
    expect(zonas.at(-1)).toMatchObject({ x: 6, y: 8 });
    const sin = planCuadras(calle, { x: 0, y: 0 }, 7);
    const con = planCuadras(calle, { x: 0, y: 0 }, 7, zonas);
    const tapa = (l: { x: number; y: number; w: number; d: number }) =>
      zonas.some((z) => Math.hypot(l.x - z.x, l.y - z.y) < Math.hypot(l.w, l.d) / 2 + z.r - 2);
    expect(sin.lotes.some(tapa)).toBe(true);
    expect(con.lotes.some((l) => Math.hypot(l.x - 6, l.y - 8) < Math.min(l.w, l.d) / 2)).toBe(
      false,
    );
    expect(con.lotes.length).toBeLessThan(sin.lotes.length);
    expect(enElCaso(zonas, { x: 6, y: 8 })).toBe(true);
    expect(enElCaso(zonas, { x: 6, y: 30 })).toBe(false);
  });
});

describe("islasDeGlorieta", () => {
  /** Un arco de la glorieta de radio `r` (m), de `a0` a `a1` grados, en `n` tramos. */
  const arco = (r: number, a0: number, a1: number, n = 8) => ({
    puntos: Array.from({ length: n + 1 }, (_, k) => {
      const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
      return { x: r * Math.cos(a), y: r * Math.sin(a) };
    }),
  });
  /** Una calle recta de `p` a `q`. */
  const recta = (p: [number, number], q: [number, number]) => ({
    puntos: [
      { x: p[0], y: p[1] },
      { x: q[0], y: q[1] },
    ],
  });

  it("reconoce el anillo de una glorieta partido en cuatro vías, con sus calles que llegan", () => {
    const r = 40;
    const vias = [
      arco(r, 0, 90),
      arco(r, 90, 180),
      arco(r, 180, 270),
      arco(r, 270, 360),
      recta([r, 0], [200, 0]),
      recta([0, r], [0, 200]),
      recta([-r, 0], [-200, 0]),
      recta([0, -r], [0, -200]),
    ];
    const islas = islasDeGlorieta(vias);
    expect(islas).toHaveLength(1);
    expect(dentroDe({ x: 0, y: 0 }, islas[0]!)).toBe(true);
    expect(dentroDe({ x: 10, y: -12 }, islas[0]!)).toBe(true);
    expect(dentroDe({ x: 60, y: 60 }, islas[0]!)).toBe(false);
  });

  it("una vía cerrada redonda también es glorieta", () => {
    expect(islasDeGlorieta([arco(25, 0, 360, 24)])).toHaveLength(1);
  });

  it("una manzana (cuatro calles en cuadro) no es glorieta: tiene esquinas", () => {
    const manzana = [
      recta([0, 0], [100, 0]),
      recta([100, 0], [100, 100]),
      recta([100, 100], [0, 100]),
      recta([0, 100], [0, 0]),
    ];
    expect(islasDeGlorieta(manzana)).toEqual([]);
    expect(islasDeGlorieta(CRUCE.map((c) => recta([c.a.x, c.a.y], [c.b.x, c.b.y])))).toEqual([]);
  });
});
