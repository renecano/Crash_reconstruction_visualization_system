import { describe, expect, it } from "vitest";
import { CASO, MARCA, nubeDeVelocidades, percentil, poseEn, rayasDeLaCalle } from "./datos";
import { CORTES } from "./escenas/Frases";
import { FPS } from "./ritmo";

describe("los datos del tráiler", () => {
  it("son de una escena inventada: nada de AXA ni de casos reales", () => {
    expect(CASO.caso).toBe("nocturno_lluvia");
    expect(JSON.stringify(CASO).toLowerCase()).not.toMatch(/axa|siniestro|cesvi-/);
  });

  it("cada cita está tal cual en el relato y no se traslapa con otra", () => {
    expect(CASO.citas.length).toBeGreaterThan(5);
    let fin = 0;
    for (const c of CASO.citas) {
      expect(CASO.relato.slice(c.inicio, c.fin)).toBe(c.texto);
      expect(c.inicio).toBeGreaterThanOrEqual(fin);
      fin = c.fin;
    }
  });

  it("las simulaciones son las que corrió el solver: todas válidas, con un camino por vehículo", () => {
    const s = CASO.simulaciones;
    expect(s.muestras.length).toBe(s.validas);
    expect(s.orden_vehiculos).toEqual(CASO.vehiculos.map((v) => v.id));
    for (const m of s.muestras) {
      expect(m.caminos.length).toBe(CASO.vehiculos.length);
      expect(m.v_impacto_kmh.length).toBe(CASO.vehiculos.length);
      expect(m.caminos[0]!.length).toBeGreaterThan(5);
    }
  });

  it("en el instante del impacto, los dos vehículos están junto al punto de impacto", () => {
    for (const v of CASO.vehiculos) {
      const p = poseEn(v, 0);
      expect(Math.hypot(p.x - CASO.impacto.x, p.y - CASO.impacto.y)).toBeLessThan(v.largo);
    }
    // Antes y después de la trayectoria, la pose se queda en su extremo.
    const a = CASO.vehiculos[0]!;
    expect(poseEn(a, -999)).toEqual(poseEn(a, CASO.t_inicio));
    expect(poseEn(a, 999).x).toBeCloseTo(a.final.x, 1);
  });

  it("la calle tiene sus orillas, su camellón y sus carriles", () => {
    const rayas = rayasDeLaCalle();
    const tira = CASO.calle.tiras[0]!;
    expect(rayas.filter((r) => r.tipo === "orilla").length).toBe(2);
    expect(rayas.filter((r) => r.tipo === "camellon").length).toBe(2);
    expect(rayas.filter((r) => r.tipo === "carril").length).toBe(tira.lanes - 2);
    expect(rayas[rayas.length - 1]!.y - rayas[0]!.y).toBeCloseTo(tira.width);
  });

  it("la nube cuenta cada simulación una sola vez y su rango queda adentro", () => {
    const n = nubeDeVelocidades(1);
    expect(n.columnas.reduce((s, c) => s + c.n, 0)).toBe(CASO.simulaciones.validas);
    expect(n.total).toBe(CASO.simulaciones.validas);
    expect(n.p10).toBeLessThan(n.p50);
    expect(n.p50).toBeLessThan(n.p90);
    expect(percentil([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentil([10, 20], 0.25)).toBe(12.5);
  });

  it("el logotipo trae la palabra completa, letra por letra y en orden", () => {
    expect(MARCA.palabra.letras.map((l) => l.letra).join("")).toBe("CROQUIS");
    for (let i = 1; i < MARCA.palabra.letras.length; i++)
      expect(MARCA.palabra.letras[i]!.x0).toBeGreaterThan(MARCA.palabra.letras[i - 1]!.x1);
  });

  it("los cortes de las frases van seguidos y cada uno cae en un cuadro entero", () => {
    let fin = 0;
    for (const c of CORTES) {
      expect(c.desde).toBeCloseTo(fin, 9);
      expect(Math.abs(c.hasta * FPS - Math.round(c.hasta * FPS))).toBeLessThan(1e-6);
      fin = c.hasta;
    }
    expect(fin).toBe(5.5);
  });
});
