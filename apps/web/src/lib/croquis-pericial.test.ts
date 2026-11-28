/**
 * El croquis pericial (ronda 4, propuesta 2 elegida por René): girado con la vía principal
 * horizontal, las tres posiciones de cada vehículo con su etiqueta, sin encimarse, y el mismo SVG
 * para la pantalla y el dictamen. Con el resultado de referencia del alcance (`fixtures/resultados`).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  tramosFueraDeOtras,
  unirVias,
  enderezar,
  viasRelevantes,
  colocarEtiquetas,
  croquisPericial,
  direccionDeLlegada,
  escalaRedonda,
  giroDelCroquis,
  posicionesDelCroquis,
  type ViaCroquis,
} from "./croquis-pericial";
import { tImpacto, type ResultadoMaqueta } from "./maqueta";

const aqui = dirname(fileURLToPath(import.meta.url));
const res = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../packages/scene-schema/fixtures/resultados/alcance.json"),
    "utf8",
  ),
) as ResultadoMaqueta;
const c = res.punto_impacto ?? { x: 0, y: 0 };
/** Una vía a 35° que pasa por el impacto. */
const via = (ang: number, tipo = "primary"): ViaCroquis => {
  const r = (ang * Math.PI) / 180;
  return {
    puntos: [-80, 80].map((d) => ({ x: c.x + d * Math.cos(r), y: c.y + d * Math.sin(r) })),
    ancho: 10,
    carriles: 3,
    tipo,
  };
};
const nombres = Object.fromEntries(res.vehiculos.map((v, i) => [v.id, `${"AB"[i]} · Auto`]));

describe("el croquis pericial (ronda 4)", () => {
  it("gira para dejar horizontal la vía principal, nunca de cabeza", () => {
    expect(giroDelCroquis(res, [via(35)])).toBeCloseTo(35, 1);
    expect(giroDelCroquis(res, [via(150)])).toBeCloseTo(-30, 1);
    // En un cruce gana la vía por la que llegan los vehículos, aunque la otra tenga más jerarquía
    // (René, 2026-11-25: la carambola de Tollocan dejaba vertical la calle del choque). Si ninguna va
    // como la llegada, la de más jerarquía.
    const llegada = direccionDeLlegada(res)!;
    const r = (x: number) => {
      let g = x;
      while (g > 90) g -= 180;
      while (g <= -90) g += 180;
      return g;
    };
    expect(
      giroDelCroquis(res, [via(llegada, "residential"), via(llegada + 90, "trunk")]),
    ).toBeCloseTo(r(llegada), 0);
    expect(
      giroDelCroquis(res, [via(llegada + 50, "residential"), via(llegada - 50, "trunk")]),
    ).toBeCloseTo(r(llegada - 50), 0);
    // La vía donde fue el choque gana a una avenida cercana que no lo contiene.
    const avenida = via(0, "trunk");
    avenida.puntos = avenida.puntos.map((p) => ({ x: p.x, y: p.y - 20 }));
    expect(giroDelCroquis(res, [via(50, "residential"), avenida])).toBeCloseTo(50, 1);
  });

  it("el vehículo en movimiento va aparte del croquis, sin redondear, y no junto al impacto", () => {
    const c = croquisPericial(res, [via(35)], nombres, { proporcion: 1.6 });
    // El croquis no cambia con el instante: el movimiento lo dibuja una capa encima.
    expect(c.svg).not.toContain("data-ahora");
    expect(c.svg).toContain(`viewBox="${c.viewBox}"`);
    const ti = tImpacto(res);
    const t0 = res.vehiculos[0]!.trayectoria.t[0]!;
    const a = c.ahora(t0 + 0.0001).find((v) => v.id === res.vehiculos[0]!.id)!;
    const b = c.ahora(t0 + 0.0002).find((v) => v.id === res.vehiculos[0]!.id)!;
    expect(a.puntos).toHaveLength(4);
    // Una diezmilésima de segundo ya lo mueve: nada se redondea a pixeles ni a centímetros.
    expect(b.puntos[0]!.x).not.toBe(a.puntos[0]!.x);
    expect(c.ahora(ti)).toEqual([]);
  });

  it("cada vehículo en sus tres posiciones (antes, impacto, reposo), con A1…B3 y el impacto", () => {
    const { svg } = croquisPericial(res, [via(35)], nombres, { proporcion: 1.6 });
    // B está detenido: antes del impacto y en el impacto en el mismo lugar, una sola silueta «B1·2».
    for (const e of ["A1", "A2", "A3", "B1·2", "B3", "Impacto"])
      expect(svg).toContain(`data-etiqueta="${e}"`);
    expect(svg).not.toContain('data-etiqueta="B1"');
    expect(svg.match(/data-vehiculo="/g)!.length).toBe(5);
    expect(svg).toContain('data-impacto="si"');
    // Sin fondo, no hay imagen; con él, sí, tenue.
    expect(svg).not.toContain("data-fondo");
    const conFondo = croquisPericial(res, [via(35)], nombres, {
      proporcion: 1.6,
      fondo: {
        imagen: "data:image/jpeg;base64,AAAA",
        centroX: 0,
        centroY: 0,
        ladoM: 200,
        opacidad: 0.3,
      },
    }).svg;
    expect(conFondo).toContain('opacity="0.3"');
  });

  it("el peatón del atropello en sus tres posiciones (P1, P2, P3)", () => {
    const atropello = JSON.parse(
      readFileSync(
        resolve(aqui, "../../../../packages/scene-schema/fixtures/resultados/peaton_cruce.json"),
        "utf8",
      ),
    ) as ResultadoMaqueta;
    const { svg } = croquisPericial(
      atropello,
      [],
      { [atropello.vehiculos[0]!.id]: "A · Auto" },
      {
        proporcion: 1.6,
      },
    );
    for (const e of ["P1", "P2", "P3"]) expect(svg).toContain(`data-etiqueta="${e}"`);
  });

  it("las posiciones 2 son las del impacto del solver", () => {
    const ti = tImpacto(res);
    const v = res.vehiculos[0]!;
    const [, impacto] = posicionesDelCroquis(v.trayectoria, ti);
    const i = v.trayectoria.t.findIndex((t) => Math.abs(t - ti) < 1e-9);
    if (i >= 0) expect(impacto.x).toBeCloseTo(v.trayectoria.x[i]!, 6);
  });

  it("las etiquetas no se enciman entre sí ni con lo ocupado", () => {
    const objetos = Array.from({ length: 8 }, (_, k) => ({ id: `e${k}`, x: k * 0.3, y: 0 }));
    const r = 1;
    const l = colocarEtiquetas(objetos, r, [{ x: 0, y: 0, r: 2 }]);
    const ps = Object.values(l);
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++)
        expect(Math.hypot(ps[i]!.x - ps[j]!.x, ps[i]!.y - ps[j]!.y)).toBeGreaterThanOrEqual(2 * r);
  });

  it("el color por velocidad es opcional, y la escala es redonda", () => {
    const negro = croquisPericial(res, [via(35)], nombres, { proporcion: 1.6 }).svg;
    const color = croquisPericial(res, [via(35)], nombres, { proporcion: 1.6, color: true }).svg;
    expect(negro).not.toContain("rgb(");
    expect(color).toContain("rgb(");
    expect(escalaRedonda(100)).toBe(20);
    expect(escalaRedonda(48)).toBe(10);
  });
});

describe("solo las calles que importan (René, 2026-11-27)", () => {
  const recta = (x0: number, y0: number, x1: number, y1: number, ancho = 7) => ({
    puntos: [
      { x: x0, y: y0 },
      { x: x1, y: y1 },
    ],
    ancho,
  });
  it("quedan la recorrida, la que cruza en el choque y el tramo que sigue; se va la lejana", () => {
    const recorrida = recta(-50, 0, 0, 0);
    const sigue = recta(0, 0, 60, 2);
    const cruza = recta(5, -40, 5, 40);
    const lejana = recta(-50, 40, 50, 40);
    const r = viasRelevantes([recorrida, sigue, cruza, lejana], [[{ x: -30, y: 0 }]], {
      x: 5,
      y: 0,
    });
    expect(r).toEqual([recorrida, sigue, cruza]);
  });
  it("la raya de una calle no atraviesa a la que cruza", () => {
    const tramos = tramosFueraDeOtras(recta(-20, 0, 20, 0).puntos, [recta(0, -20, 0, 20)]);
    expect(tramos).toHaveLength(2);
    for (const t of tramos) for (const p of t) expect(Math.abs(p.x)).toBeGreaterThan(3.5);
  });
});

describe("el 2D limpio (René, 2026-11-28)", () => {
  it("dos tramos de la misma calle con un quiebre pequeño quedan en una sola recta, con un solo ancho", () => {
    // Como la MEX-15D en AXA: dos tramos que se juntan con 1° de diferencia y anchos distintos.
    const [v] = unirVias([
      {
        puntos: [
          { x: -60, y: -1 },
          { x: 0, y: 0 },
        ],
        ancho: 7,
      },
      {
        puntos: [
          { x: 0, y: 0 },
          { x: 60, y: 0 },
        ],
        ancho: 7.4,
      },
    ]);
    expect(v!.puntos).toEqual([
      { x: -60, y: -1 },
      { x: 60, y: 0 },
    ]);
    expect(v!.ancho).toBe(7.4);
  });
  it("una calle que curva sigue curvando (no se endereza)", () => {
    const arco = Array.from({ length: 13 }, (_, k) => ({
      x: 25 * Math.cos((k * Math.PI) / 12),
      y: 25 * Math.sin((k * Math.PI) / 12),
    }));
    const [v] = unirVias([{ puntos: arco, ancho: 7 }]);
    expect(v!.puntos.length).toBeGreaterThan(8);
    expect(enderezar(arco, 0.8).length).toBeGreaterThan(3);
  });
  it("las líneas de las etiquetas no se cruzan ni pasan por un vehículo ajeno", () => {
    const caja = (x: number) => [
      { x: x - 2, y: -1 },
      { x: x + 2, y: -1 },
      { x: x + 2, y: 1 },
      { x: x - 2, y: 1 },
    ];
    const pos = colocarEtiquetas(
      [
        { id: "A", x: 0, y: 0, dueno: "A" },
        { id: "B", x: 4.5, y: 0, dueno: "B" },
      ],
      0.8,
      [],
      [
        { dueno: "A", puntos: caja(0) },
        { dueno: "B", puntos: caja(4.5) },
      ],
    );
    const dentro = (p: { x: number; y: number }, x: number) =>
      Math.abs(p.x - x) < 2 && Math.abs(p.y) < 1;
    expect(dentro(pos.A!, 4.5)).toBe(false);
    expect(dentro(pos.B!, 0)).toBe(false);
  });
});
