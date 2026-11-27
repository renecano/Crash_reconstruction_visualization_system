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
