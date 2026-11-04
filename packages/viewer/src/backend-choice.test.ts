import { describe, expect, it } from "vitest";
import { recentFps, recordTrial, startTrial, TARGET_FPS } from "./backend-choice";

describe("elección automática del backend", () => {
  it("empieza con WebGPU o con el recordado, y siempre mide", () => {
    expect(startTrial()).toEqual({ current: "webgpu", measured: {}, decided: false });
    expect(startTrial("webgl")).toEqual({ current: "webgl", measured: {}, decided: false });
    expect(startTrial("otro" as never).current).toBe("webgpu");
  });

  it("se queda si alcanza el objetivo", () => {
    expect(recordTrial(startTrial(), TARGET_FPS + 5, "webgpu")).toEqual({
      current: "webgpu",
      measured: { webgpu: 65 },
      decided: true,
    });
  });

  it("si no alcanza, prueba el otro y se queda con el más rápido", () => {
    let t = recordTrial(startTrial(), 48, "webgpu");
    expect(t).toEqual({ current: "webgl", measured: { webgpu: 48 }, decided: false });
    t = recordTrial(t, 85, "webgl2");
    expect(t).toEqual({ current: "webgl", measured: { webgpu: 48, webgl: 85 }, decided: true });
    const back = recordTrial(recordTrial(startTrial("webgl"), 40, "webgl2"), 52, "webgpu");
    expect(back).toEqual({ current: "webgpu", measured: { webgl: 40, webgpu: 52 }, decided: true });
    expect(recordTrial(back, 1, "webgpu")).toBe(back);
  });

  it("sin WebGPU en el navegador termina con WebGL 2", () => {
    expect(recordTrial(startTrial(), 30, "webgl2")).toEqual({
      current: "webgl",
      measured: { webgl: 30 },
      decided: true,
    });
  });

  it("promedia los últimos cuadros", () => {
    expect(recentFps([10, 10], 3)).toBeNaN();
    expect(recentFps([100, 20, 20, 20], 3)).toBeCloseTo(50, 9);
  });
});

describe("fps en ventana de tiempo", () => {
  it("promedia solo los cuadros de la ventana y es NaN si no la cubren", async () => {
    const { fpsEnVentana } = await import("./backend-choice");
    expect(fpsEnVentana([16, 16, 16], 3000)).toBeNaN();
    const lentos = Array.from({ length: 100 }, () => 50); // 20 fps, 5 s
    expect(fpsEnVentana(lentos, 3000)).toBeCloseTo(20, 5);
    const mezcla = [
      ...Array.from({ length: 200 }, () => 100),
      ...Array.from({ length: 200 }, () => 16),
    ];
    expect(fpsEnVentana(mezcla, 3000)).toBeCloseTo(62.5, 5); // 3.2 s de cuadros rápidos al final
  });
});

describe("backend inicial sin prueba en vivo (2026-11-04)", () => {
  it("lo recordado manda; si no, WebGL 2 en GPU integrada y WebGPU en las demás", async () => {
    const { defaultBackendFor } = await import("./backend-choice");
    expect(defaultBackendFor("GPU integrada", null)).toBe("webgl");
    expect(defaultBackendFor("GPU dedicada", null)).toBe("webgpu");
    expect(defaultBackendFor("Apple Silicon", undefined)).toBe("webgpu");
    expect(defaultBackendFor("GPU integrada", "webgpu")).toBe("webgpu");
    expect(defaultBackendFor(null, "webgl")).toBe("webgl");
  });
});
