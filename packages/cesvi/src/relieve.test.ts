/**
 * O4 (W5): la malla de relieve en el marco de la escena y sus curvas de nivel. La malla es un plano
 * inclinado conocido (entrada de prueba, no un dato de un lugar).
 */
import { describe, expect, it } from "vitest";
import { desdeMetros } from "./geo";
import {
  alturaEn,
  curvasDeNivel,
  desnivelDe,
  intervaloDeCurvas,
  puntoDeRelieve,
  relieveEnEscena,
  type MallaRelieve,
} from "./relieve";

const CENTRO = { lat: 19.3576, lon: -99.0625 };

/** Una malla de 21 × 21 nodos cada 30 m centrada en CENTRO: sube `este` por metro al este y `norte` al norte. */
function plano(este: number, norte: number, base = 0): MallaRelieve {
  const n = 21;
  const alturas: number[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) alturas.push(base + este * (i - 10) * 30 + norte * (j - 10) * 30);
  const [lon, lat] = desdeMetros(-300, -300, [CENTRO.lon, CENTRO.lat]);
  return {
    id: "prueba",
    origen: { lat, lon, x: -300, y: -300 },
    resolucion_m: 30,
    ancho: n,
    alto: n,
    alturas_m: alturas,
    fuente: "prueba",
    licencia: "prueba",
    resolucion_nativa_m: 30,
  };
}

describe("la malla en el marco de la escena", () => {
  it("el punto para pedirla no cambia al mover la escena unos metros", () => {
    const a = puntoDeRelieve([-99.06251, 19.35762]);
    const b = puntoDeRelieve([-99.06254, 19.35759]);
    expect(a).toEqual(b);
    expect(a).toEqual({ lat: 19.3576, lon: -99.0625 });
  });

  it("queda en metros desde el punto de impacto, con altura 0 ahí", () => {
    // El impacto está 12 m al este y 7 m al norte del centro de la malla.
    const origen = desdeMetros(12, 7, [CENTRO.lon, CENTRO.lat]);
    const m = relieveEnEscena(plano(0.05, -0.02, 2240), origen);
    expect(m.origen.x).toBeCloseTo(-312, 1);
    expect(m.origen.y).toBeCloseTo(-307, 1);
    expect(alturaEn(m, 0, 0)).toBeCloseTo(0, 2);
    // La pendiente no cambia: 5 % al este y −2 % al norte.
    expect(alturaEn(m, 100, 0)).toBeCloseTo(5, 1);
    expect(alturaEn(m, 0, 100)).toBeCloseTo(-2, 1);
    expect(desnivelDe(m)).toBeCloseTo(600 * 0.05 + 600 * 0.02, 1);
    // Fuera de la malla vale la orilla.
    expect(alturaEn(m, 10_000, 0)).toBeCloseTo(alturaEn(m, m.origen.x + 600, 0), 6);
  });
});

describe("las curvas de nivel", () => {
  it("en un plano inclinado son rectas paralelas, a la separación que toca", () => {
    const m = plano(0.05, 0);
    // 30 m de desnivel: curvas cada 5 m.
    expect(intervaloDeCurvas(m)).toBe(5);
    const curvas = curvasDeNivel(m);
    expect(curvas.map((c) => c.nivel)).toEqual([-15, -10, -5, 0, 5, 10]);
    for (const c of curvas) {
      // 5 % al este: la curva de nivel z está en x = z / 0.05, de sur a norte.
      for (const [x1, , x2] of c.tramos) {
        expect(x1).toBeCloseTo(c.nivel / 0.05, 2);
        expect(x2).toBeCloseTo(c.nivel / 0.05, 2);
      }
      const largo = c.tramos.reduce((s, [, y1, , y2]) => s + Math.abs(y2 - y1), 0);
      expect(largo).toBeCloseTo(600, 3);
    }
  });

  it("una malla plana no tiene curvas", () => {
    expect(curvasDeNivel(plano(0, 0))).toEqual([]);
    expect(desnivelDe(plano(0, 0))).toBe(0);
  });

  it("un cerro da curvas cerradas alrededor de la cima", () => {
    const m = plano(0, 0);
    m.alturas_m = m.alturas_m.map((_, k) => {
      const i = (k % 21) - 10;
      const j = Math.floor(k / 21) - 10;
      return 20 - 0.2 * (i * i + j * j);
    });
    const curva = curvasDeNivel(m, 5).find((c) => c.nivel === 15)!;
    // 20 − 0.2·r² = 15 → r = 5 nodos = 150 m: todos los tramos quedan cerca de ese radio.
    for (const [x1, y1] of curva.tramos) expect(Math.abs(Math.hypot(x1, y1) - 150)).toBeLessThan(8);
    expect(curva.tramos.length).toBeGreaterThan(20);
  });
});
