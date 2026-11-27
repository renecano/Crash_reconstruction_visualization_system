import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import { avanzar } from "./geo";
import {
  conObstaculos,
  crucesDeTrayectorias,
  cruzaObstaculo,
  saltosDe,
  sobreMalla,
  type ObstaculoDelMapa,
} from "./obstaculos";
import { especReconstruida, reconstruirExpediente } from "./reconstruccion";

/**
 * Los edificios y muros del mapa como obstáculos (René, 2026-11-24, punto 2) y la geometría de la
 * revisión del paquete 3D (puntos 1 y 3).
 */
const arbol = (
  JSON.parse(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../../data/cesvi/casos/rene-arbol-curva.croquis",
      ),
      "utf8",
    ),
  ) as { expediente: Expediente }
).expediente;

describe("la geometría", () => {
  it("un punto sobre la calzada (una malla de triángulos)", () => {
    const calzada = { posiciones: [0, 0, 10, 0, 10, 3.5, 0, 3.5], indices: [0, 1, 2, 0, 2, 3] };
    expect(sobreMalla(calzada, { x: 5, y: 1 })).toBe(true);
    expect(sobreMalla(calzada, { x: 5, y: 4.2 })).toBe(false);
  });

  it("un auto metido en una casa o cruzando un muro; rozar la fachada no cuenta", () => {
    const casa = {
      puntos: [
        { x: 0, y: 5 },
        { x: 10, y: 5 },
        { x: 10, y: 15 },
        { x: 0, y: 15 },
        { x: 0, y: 5 },
      ],
      cerrado: true,
    };
    expect(cruzaObstaculo({ x: 5, y: 4, largo: 4.5, ancho: 1.8, rumbo: Math.PI / 2 }, casa)).toBe(
      true,
    );
    expect(cruzaObstaculo({ x: 5, y: 2.6, largo: 4.5, ancho: 1.8, rumbo: 0 }, casa)).toBe(false);
    expect(cruzaObstaculo({ x: 5, y: 4.4, largo: 4.5, ancho: 1.8, rumbo: 0 }, casa)).toBe(false);
    const muro = {
      puntos: [
        { x: -5, y: 0 },
        { x: 5, y: 0 },
      ],
      cerrado: false,
    };
    expect(cruzaObstaculo({ x: 0, y: 0, largo: 4.5, ancho: 1.8, rumbo: Math.PI / 2 }, muro)).toBe(
      true,
    );
  });

  it("de lado de golpe antes del choque, o un brinco, es un salto; después del choque no", () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4];
    const tr = { t, x: [0, 1.5, 3, 4.5, 6], y: [0, 0, 1.5, 1.5, 1.5], rumbo: [0, 0, 0, 0, 0] };
    expect(saltosDe(tr, 0.4).map((s) => s.tipo)).toEqual(["lateral"]);
    expect(saltosDe(tr, 0.1)).toEqual([]);
    expect(saltosDe(tr, 0.4, true)).toEqual([]);
    const brinco = { t, x: [0, 1.5, 9.5, 11, 12.5], y: [0, 0, 0, 0, 0], rumbo: [0, 0, 0, 0, 0] };
    expect(saltosDe(brinco, 0.1).map((s) => s.tipo)).toEqual(["brinco"]);
  });
});

describe("una trayectoria que cruza un edificio del mapa no cuadra", () => {
  const r = reconstruirExpediente(arbol, "arbol", { samples: 8, mcSamples: 8 });
  // Un edificio de 6 × 6 m atravesado en el recorrido del Jetta, 8 m antes del choque.
  const dict = reconstructionToDict(reconstruct(especReconstruida(r), { relieve: null as never }));
  const tr = (dict.vehiculos as { trayectoria: { t: number[]; x: number[]; y: number[] } }[])[0]!
    .trayectoria;
  const k = tr.t.findIndex((t) => t >= -0.6);
  const centro = { x: tr.x[k]!, y: tr.y[k]! };

  it("el árbol de René sin obstáculos cuadra, y con un edificio en su recorrido no", () => {
    expect(r.noCuadra).toBeUndefined();
    const casa: ObstaculoDelMapa = {
      nombre: "edificio 1",
      tipo: "edificio",
      puntos: [
        [-3, -3],
        [3, -3],
        [3, 3],
        [-3, 3],
        [-3, -3],
      ].map(([dx, dy]) => {
        const p = avanzar(r.origen!, 90, centro.x + dx!);
        return avanzar(p, 0, centro.y + dy!);
      }),
    };
    expect(conObstaculos(r, [])).toBe(r);
    const c = conObstaculos(r, [casa], (id) => `el ${id}`);
    expect(c.noCuadra?.motivos[0]).toMatch(/^el V1 cruza un edificio del mapa \(edificio 1\)/);
    expect(c.velocidades.every((v) => v.previa === null)).toBe(true);
    expect(c.limites.some((l) => l.startsWith("No cuadra: el V1 cruza un edificio"))).toBe(true);
    // Un edificio lejos (a 200 m) no cambia nada.
    const lejos = { ...casa, puntos: casa.puntos.map((p) => avanzar(p, 0, 200)) };
    expect(conObstaculos(r, [lejos])).toBe(r);
  });

  it("un edificio en la llegada recta, antes de su posición inicial, no culpa a la evidencia: se dice", () => {
    const k0 = tr.t.findIndex((t) => t >= -2.9);
    const lejos = { x: tr.x[k0]!, y: tr.y[k0]! };
    const casa: ObstaculoDelMapa = {
      nombre: "edificio 2",
      tipo: "edificio",
      puntos: [
        [-3, -3],
        [3, -3],
        [3, 3],
        [-3, 3],
        [-3, -3],
      ].map(([dx, dy]) => avanzar(avanzar(r.origen!, 90, lejos.x + dx!), 0, lejos.y + dy!)),
    };
    const c = conObstaculos(r, [casa], (id) => `el ${id}`);
    expect(c.noCuadra).toBeUndefined();
    expect(c.velocidades).toEqual(r.velocidades);
    expect(c.limites.at(-1)).toMatch(/es solo el dibujo de la llegada/);
  });

  it("los cruces, por vehículo y obstáculo, con el primer instante", () => {
    const cruces = crucesDeTrayectorias(
      [{ id: "veh-a", trayectoria: { ...tr, rumbo: tr.x.map(() => 0) } }],
      [
        {
          nombre: "muro 7",
          tipo: "muro",
          puntos: [
            { x: centro.x, y: centro.y - 5 },
            { x: centro.x, y: centro.y + 5 },
          ],
        },
      ],
    );
    expect(cruces).toHaveLength(1);
    expect(cruces[0]).toMatchObject({ vehiculo: "veh-a", obstaculo: "muro 7", tipo: "muro" });
  });
}, 240_000);
