import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CONFIG_DEMO,
  configDesdeUrl,
  ESCENAS_E6,
  frecuenciaPantalla,
  percentil,
  planMedicion,
  repeticionMediana,
  resumirCuadros,
  tironesExternos,
  topadoPorPantalla,
  urlVisor,
} from "./medicion";

const OPC = { numRuns: 200, seed: 20261019 };

describe("medición E6 en el navegador", () => {
  it("el plan mide cada configuración las veces pedidas, en orden alterno", () => {
    const pasos = planMedicion(CONFIG_DEMO);
    expect(pasos).toHaveLength(ESCENAS_E6.length * 2 * 2 * 3);
    const altaGpu = pasos.filter((p) => p.calidad === "alta" && p.renderer === "webgpu");
    const rep1 = altaGpu.filter((p) => p.repeticion === 1).map((p) => p.escena);
    const rep2 = altaGpu.filter((p) => p.repeticion === 2).map((p) => p.escena);
    expect(rep1).toEqual([...ESCENAS_E6]);
    expect(rep2).toEqual([...ESCENAS_E6].reverse());
  });

  it("los percentiles son los de viewer-measure.mjs", () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentil(xs, 50)).toBe(50);
    expect(percentil(xs, 99)).toBe(100);
    expect(percentil(xs, 0)).toBe(10);
    expect(Number.isNaN(percentil([], 50))).toBe(true);
  });

  it("a cuadros constantes, fps promedio, mediano y del 1 % lento coinciden", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 2, max: 100, noNaN: true }),
        fc.integer({ min: 30, max: 600 }),
        (ms, n) => {
          const r = resumirCuadros(Array.from({ length: n }, () => ms));
          const fps = Math.round((1000 / ms) * 10) / 10;
          expect(r.cuadros).toBe(n);
          expect(r.fps_promedio).toBeCloseTo(fps, 6);
          expect(r.fps_mediana).toBeCloseTo(fps, 6);
          expect(r.fps_p1_bajo).toBeCloseTo(fps, 6);
        },
      ),
      OPC,
    );
  });

  it("el 1 % lento nunca supera a la mediana", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 1, max: 200, noNaN: true }), { minLength: 1, maxLength: 400 }),
        (ms) => {
          const r = resumirCuadros(ms);
          expect(r.fps_p1_bajo!).toBeLessThanOrEqual(r.fps_mediana!);
        },
      ),
      OPC,
    );
  });

  it("sin cuadros no inventa números", () => {
    expect(resumirCuadros([])).toEqual({
      cuadros: 0,
      fps_promedio: null,
      fps_mediana: null,
      fps_p1_bajo: null,
      cuadro_p95_ms: null,
    });
  });

  it("la repetición mediana es la central por fps promedio", () => {
    const r = repeticionMediana([{ fps_promedio: 70 }, { fps_promedio: 50 }, { fps_promedio: 60 }]);
    expect(r.fps_promedio).toBe(60);
    expect(repeticionMediana([{ fps_promedio: 70 }, { fps_promedio: 50 }]).fps_promedio).toBe(50);
  });

  it("la frecuencia de la pantalla y el tope de vsync", () => {
    expect(frecuenciaPantalla(Array.from({ length: 60 }, () => 1000 / 60))).toBeCloseTo(60, 1);
    expect(frecuenciaPantalla([16.7])).toBeNull();
    expect(topadoPorPantalla(59.6, 60)).toBe(true);
    expect(topadoPorPantalla(45, 60)).toBe(false);
    expect(topadoPorPantalla(null, 60)).toBe(false);
  });

  it("tirones externos con el criterio de E6", () => {
    expect(tironesExternos({ tareas_largas: 2, fps_mediana: 60, fps_promedio: 45 })).toBe(true);
    expect(tironesExternos({ tareas_largas: 0, fps_mediana: 60, fps_promedio: 45 })).toBe(false);
    expect(tironesExternos({ tareas_largas: 3, fps_mediana: 30, fps_promedio: 20 })).toBe(false);
  });

  it("la configuración de la URL se valida y lo demás queda como en E6", () => {
    expect(configDesdeUrl(new URLSearchParams())).toEqual(CONFIG_DEMO);
    const c = configDesdeUrl(
      new URLSearchParams(
        "escenas=glorieta,nada,glorieta&calidades=baja&renderers=webgl&repeticiones=9&segundos=0.5&pausa=-3",
      ),
    );
    expect(c.escenas).toEqual(["glorieta"]);
    expect(c.calidades).toEqual(["baja"]);
    expect(c.renderers).toEqual(["webgl"]);
    expect(c.repeticiones).toBe(5);
    expect(c.segundos).toBe(1);
    expect(c.pausa_s).toBe(0);
    expect(c.calentamiento_s).toBe(CONFIG_DEMO.calentamiento_s);
    expect(configDesdeUrl(new URLSearchParams("calidades=nada")).calidades).toEqual(
      CONFIG_DEMO.calidades,
    );
  });

  it("abre el visor con los parámetros de E6", () => {
    const u = new URL(
      urlVisor("http://x/visor", {
        escena: "glorieta",
        calidad: "ultra",
        renderer: "webgl",
        repeticion: 1,
      }),
    );
    expect(Object.fromEntries(u.searchParams)).toEqual({
      escena: "glorieta",
      calidad: "ultra",
      camara: "cinematica",
      pantalla: "completa",
      auto: "1",
      bucle: "1",
      renderer: "webgl",
    });
  });
});
