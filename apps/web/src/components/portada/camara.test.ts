import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CAPITULOS,
  indiceDe,
  linger,
  N,
  opacidadTexto,
  poseCamara,
  revelado,
  T_ANTES,
  T_DESPUES,
  tiempoEscena,
} from "./camara";

const OPC = { numRuns: 200, seed: 20261019 };

describe("cámara y tiempo de la portada", () => {
  it("linger fija las costuras y la mitad, y es monótona", () => {
    expect(linger(0)).toBeCloseTo(0, 12);
    expect(linger(0.5)).toBeCloseTo(0.5, 12);
    expect(linger(1)).toBeCloseTo(1, 12);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.999, noNaN: true }),
        fc.double({ min: 1e-4, max: 1e-3, noNaN: true }),
        (x, d) => {
          expect(linger(x + d)).toBeGreaterThanOrEqual(linger(x));
        },
      ),
      OPC,
    );
  });

  it("la pose es continua: un paso chico de scroll mueve poco la cámara", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: N - 0.01, noNaN: true }),
        fc.constantFrom(16 / 9, 390 / 844, 1),
        (p, aspecto) => {
          const a = poseCamara(p, aspecto);
          const b = poseCamara(p + 0.005, aspecto);
          const d = Math.hypot(...a.position.map((v, i) => v - b.position[i]!));
          expect(d).toBeLessThan(2.5);
          for (const v of [...a.position, ...a.target, ...(a.up ?? [])])
            expect(Number.isFinite(v)).toBe(true);
        },
      ),
      OPC,
    );
  });

  it("la cámara nunca baja del asfalto", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: N, noNaN: true }),
        fc.constantFrom(16 / 9, 390 / 844),
        (p, aspecto) => {
          expect(poseCamara(p, aspecto).position[1]).toBeGreaterThan(0.5);
        },
      ),
      OPC,
    );
  });

  it("el tiempo de la escena solo corre en «Impacta» y es monótono", () => {
    const i = indiceDe("i");
    expect(tiempoEscena(0)).toBe(T_ANTES);
    expect(tiempoEscena(i - 0.01)).toBe(T_ANTES);
    expect(tiempoEscena(i + 1)).toBe(T_DESPUES);
    expect(tiempoEscena(N)).toBe(T_DESPUES);
    fc.assert(
      fc.property(fc.double({ min: 0, max: N - 0.01, noNaN: true }), (p) => {
        expect(tiempoEscena(p + 0.01)).toBeGreaterThanOrEqual(tiempoEscena(p));
      }),
      OPC,
    );
  });

  it("en «Ubica» solo se ve el croquis pintado; antes y después, la escena", () => {
    const u = indiceDe("u");
    expect(revelado(u + 0.3)).toBe(0);
    expect(revelado(0)).toBe(1);
    expect(revelado(indiceDe("s") + 0.5)).toBe(1);
    fc.assert(
      fc.property(fc.double({ min: 0, max: N, noNaN: true }), (p) => {
        const r = revelado(p);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }),
      OPC,
    );
  });

  it("a la mitad de cada capítulo su texto se ve completo y el de los demás no", () => {
    CAPITULOS.forEach((_, k) => {
      const p = k + 0.5;
      expect(opacidadTexto(p, k)).toBeCloseTo(1, 6);
      CAPITULOS.forEach((__, j) => {
        if (j !== k) expect(opacidadTexto(p, j)).toBe(0);
      });
    });
  });
});
