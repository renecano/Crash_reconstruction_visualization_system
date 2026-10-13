import { describe, expect, it } from "vitest";
import { recentFps, recordTrial, startTrial, TARGET_FPS } from "./backend-choice";

describe("elección automática del backend", () => {
  it("se queda con WebGPU si alcanza el objetivo", () => {
    const t = recordTrial(startTrial(), TARGET_FPS + 5, "webgpu");
    expect(t).toEqual({ current: "webgpu", measured: { webgpu: 65 }, decided: true });
  });

  it("si WebGPU no alcanza, prueba WebGL 2 y se queda con el más rápido", () => {
    let t = recordTrial(startTrial(), 48, "webgpu");
    expect(t.current).toBe("webgl");
    expect(t.decided).toBe(false);
    t = recordTrial(t, 85, "webgl2");
    expect(t).toEqual({ current: "webgl", measured: { webgpu: 48, webgl: 85 }, decided: true });
    const back = recordTrial(recordTrial(startTrial(), 48, "webgpu"), 40, "webgl2");
    expect(back.current).toBe("webgpu");
    expect(back.decided).toBe(true);
  });

  it("sin WebGPU en el navegador termina con WebGL 2 sin más pruebas", () => {
    const t = recordTrial(startTrial(), 30, "webgl2");
    expect(t).toEqual({ current: "webgl", measured: { webgl: 30 }, decided: true });
  });

  it("respeta la decisión recordada y no vuelve a probar", () => {
    const t = startTrial("webgl");
    expect(t.decided).toBe(true);
    expect(recordTrial(t, 10, "webgl2")).toBe(t);
    expect(startTrial("otro" as never).decided).toBe(false);
  });

  it("promedia los últimos cuadros", () => {
    expect(recentFps([10, 10], 3)).toBeNaN();
    expect(recentFps([100, 20, 20, 20], 3)).toBeCloseTo(50, 9);
  });
});
