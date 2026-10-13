/**
 * Elección automática del backend del renderer por medición (ADR 0006, E6).
 *
 * `WebGPURenderer` puede usar WebGPU o su backend WebGL 2. Cuál rinde más depende de la GPU y
 * del navegador: en la laptop de referencia (Intel UHD) WebGL 2 dio más cuadros por segundo.
 * En modo automático se empieza con WebGPU; si no alcanza el objetivo se prueba WebGL 2 y se
 * queda el que midió más. La decisión se recuerda en el navegador (comodidad local, no dato).
 */
export type Backend = "webgpu" | "webgl";

export interface BackendTrial {
  /** Backend en uso. */
  current: Backend;
  /** fps medidos por backend. */
  measured: Partial<Record<Backend, number>>;
  /** Decisión tomada (ya no se prueba más). */
  decided: boolean;
}

export const TARGET_FPS = 60;

export function startTrial(remembered?: Backend | null): BackendTrial {
  if (remembered === "webgpu" || remembered === "webgl") {
    return { current: remembered, measured: {}, decided: true };
  }
  return { current: "webgpu", measured: {}, decided: false };
}

/**
 * Registra los fps medidos con el backend en uso y decide el siguiente paso. Si el backend real
 * resultó ser WebGL 2 (el navegador no ofrece WebGPU), la prueba termina ahí.
 */
export function recordTrial(
  trial: BackendTrial,
  fps: number,
  actual: "webgpu" | "webgl2",
): BackendTrial {
  if (trial.decided) return trial;
  const measured = { ...trial.measured, [trial.current]: fps };
  if (actual === "webgl2" && trial.current === "webgpu") {
    return { current: "webgl", measured: { webgl: fps }, decided: true };
  }
  if (trial.current === "webgpu") {
    if (fps >= TARGET_FPS) return { current: "webgpu", measured, decided: true };
    return { current: "webgl", measured, decided: false };
  }
  const gpu = measured.webgpu ?? 0;
  const gl = measured.webgl ?? 0;
  return { current: gl >= gpu ? "webgl" : "webgpu", measured, decided: true };
}

/** fps promedio de los últimos `n` tiempos de cuadro (ms); NaN si no hay suficientes. */
export function recentFps(frameMs: readonly number[], n = 90): number {
  if (frameMs.length < n) return Number.NaN;
  const recent = frameMs.slice(-n);
  return 1000 / (recent.reduce((a, b) => a + b, 0) / recent.length);
}
