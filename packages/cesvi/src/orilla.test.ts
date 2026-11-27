import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { outsideRedVialM } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import { avanzar, enMetros, type LonLat } from "./geo";
import { choqueEnLaOrilla, ladoNarrado, RADIO_OBJETO_M } from "./orilla";
import { especDeExpediente } from "./reconstruccion";

const recta = (y: number, carriles = 2) => ({
  tipo: "primary",
  nombre: "Calle recta",
  carriles,
  puntos: [
    { x: -100, y },
    { x: 100, y },
  ],
});
const frente = (c: { x: number; y: number; rumboDeg: number }, d: number) => ({
  x: c.x + d * Math.cos((c.rumboDeg * Math.PI) / 180),
  y: c.y + d * Math.sin((c.rumboDeg * Math.PI) / 180),
});

describe("el objeto del primer choque en la orilla de la calle", () => {
  it("un árbol dentro de la calzada pasa a la orilla y el vehículo llega de frente a él", () => {
    const vias = [recta(0)];
    const r = choqueEnLaOrilla({
      impacto: { x: 0, y: 0, rumboDeg: 0 },
      alcance: 2.4,
      giroCara: 0,
      antesM: 12,
      vias,
      lado: null,
    })!;
    // Fuera de la calzada (7 m de dos carriles), a la derecha del que va al este.
    expect(outsideRedVialM(r.objeto, vias)).toBeGreaterThanOrEqual(RADIO_OBJETO_M - 1e-6);
    expect(r.objeto.y).toBeLessThan(0);
    expect(r.lado).toBe("derecha");
    expect(r.dentroM).toBeCloseTo(3.65, 2);
    // El frente del vehículo toca el objeto y sale de su carril con un desvío moderado.
    const f = frente(r.impacto, 2.4);
    expect(f.x).toBeCloseTo(r.objeto.x, 2);
    expect(f.y).toBeCloseTo(r.objeto.y, 2);
    expect(Math.abs(r.impacto.rumboDeg)).toBeLessThan(20);
    expect(r.impacto.rumboDeg).toBeLessThan(0);
  });

  it("va del lado que dice la narración", () => {
    const r = choqueEnLaOrilla({
      impacto: { x: 0, y: 0, rumboDeg: 0 },
      alcance: 2.4,
      giroCara: 0,
      antesM: 12,
      vias: [recta(0)],
      lado: "izquierda",
    })!;
    expect(r.objeto.y).toBeGreaterThan(0);
    expect(r.lado).toBe("izquierda");
  });

  it("si el objeto ya está fuera de la calzada, no se mueve nada", () => {
    expect(
      choqueEnLaOrilla({
        impacto: { x: 0, y: -2.5, rumboDeg: -90 },
        alcance: 2.4,
        giroCara: 0,
        antesM: 12,
        vias: [recta(0)],
        lado: null,
      }),
    ).toBeNull();
  });

  it("si una orilla da a la otra calzada, va a la libre; si la narrada no cabe, no inventa otra", () => {
    // Dos cuerpos a ±3.6 m: el camellón entre ellos mide 0.2 m y no cabe un árbol.
    const vias = [recta(3.6), recta(-3.6)];
    const libre = choqueEnLaOrilla({
      impacto: { x: 0, y: 3.6, rumboDeg: 0 },
      alcance: 2.4,
      giroCara: 0,
      antesM: 12,
      vias,
      lado: null,
    })!;
    expect(libre.objeto.y).toBeGreaterThan(7.1);
    expect(outsideRedVialM(libre.objeto, vias)).toBeGreaterThanOrEqual(RADIO_OBJETO_M - 1e-6);
    expect(
      choqueEnLaOrilla({
        impacto: { x: 0, y: 3.6, rumboDeg: 0 },
        alcance: 2.4,
        giroCara: 0,
        antesM: 12,
        vias,
        lado: "derecha",
      }),
    ).toBeNull();
  });

  it("lee el lado de la narración", () => {
    expect(ladoNarrado(["me salí a la derecha y pegué contra un poste"])).toBe("derecha");
    expect(ladoNarrado(["del lado izquierdo de la carretera"])).toBe("izquierda");
    expect(ladoNarrado(["me salí de la carretera", undefined])).toBeNull();
    expect(ladoNarrado(["de izquierda a derecha"])).toBeNull();
  });
});

describe("Tollocan (René, 2026-11-26): el árbol no queda dentro de la calzada", () => {
  const raiz = resolve(__dirname, "../../..");
  const guardado = JSON.parse(
    readFileSync(resolve(raiz, "data/cesvi/casos/tollocan-rene.croquis"), "utf8"),
  ) as { expediente: Expediente };
  const e0 = guardado.expediente;
  const imp = e0.versiones![0]!.posiciones!.find((p) => p.fase === "impacto")!;
  // Una calle de tres carriles por donde iba, centrada en el choque que colocó René: el árbol que
  // el perito puso frente al auto queda dentro de ella.
  const centro: LonLat = [imp.punto.lon, imp.punto.lat];
  const a = avanzar(centro, imp.rumbo + 180, 150);
  const b = avanzar(centro, imp.rumbo, 150);
  const conCalles: Expediente = {
    ...e0,
    caso: {
      ...e0.caso,
      lugar: {
        ...e0.caso.lugar,
        calles_del_mapa: {
          fuente: "overpass",
          atribucion: "© OpenStreetMap contributors (ODbL)",
          consultado: "2026-11-26T00:00:00Z",
          centro: { lat: imp.punto.lat, lon: imp.punto.lon },
          radio_m: 250,
          vias: [{ id: 1, tipo: "trunk", nombre: "Paseo Tollocan", carriles: "3", puntos: [a, b] }],
        },
      },
    },
  };
  const objeto = (spec: Record<string, unknown>) =>
    (
      spec.entorno as { objetos: { id: string; posicion: { x: number; y: number } }[] }
    ).objetos.find((o) => o.id === "obj-1")!.posicion;

  it("con las calles guardadas, el árbol va en la orilla y el choque en ese borde", () => {
    const sin = especDeExpediente(e0);
    const con = especDeExpediente(conCalles);
    const enEscena = (p: readonly [number, number]) => {
      const m = enMetros(p, con.origen!);
      return { x: m.este, y: m.norte };
    };
    const vias = [{ tipo: "trunk", carriles: 3, puntos: [a, b].map(enEscena) }];
    // Sin calles, el árbol queda frente al auto, dentro de la calzada (como lo reportó René).
    const viasSin = [
      {
        tipo: "trunk",
        carriles: 3,
        puntos: [a, b].map((p) => {
          const m = enMetros(p, sin.origen!);
          return { x: m.este, y: m.norte };
        }),
      },
    ];
    expect(outsideRedVialM(objeto(sin.spec), viasSin)).toBeLessThan(0);
    // Con ellas, fuera de la calzada, y el frente del vehículo en el impacto toca el árbol.
    const o = objeto(con.spec);
    expect(outsideRedVialM(o, vias)).toBeGreaterThanOrEqual(RADIO_OBJETO_M - 0.01);
    const d = Math.hypot(
      o.x - con.posesDeImpacto!["veh-a"]!.x,
      o.y - con.posesDeImpacto!["veh-a"]!.y,
    );
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(3);
    const texto = (con as unknown as { limites: string[] }).limites.find((l) =>
      l.includes("orilla"),
    );
    expect(texto).toMatch(
      /dentro de la calzada de Paseo Tollocan: va en la orilla (derecha|izquierda)/,
    );
    // El choque en ese borde: el punto de impacto del perito se movió hacia la orilla.
    expect(con.origen).not.toEqual(sin.origen);
  });
});
