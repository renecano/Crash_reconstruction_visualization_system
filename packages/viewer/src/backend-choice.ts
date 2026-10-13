/**
 * Elección automática del backend del renderer por medición (ADR 0006, E6).
 *
 * `WebGPURenderer` puede usar WebGPU o su backend WebGL 2. Cuál rinde más depende de la GPU y
 * del navegador y también de la escena: en la laptop de referencia (Intel UHD) WebGL 2 dio más
 * cuadros por segundo con daño. En modo automático cada escena empieza con el backend recordado
 * (o WebGPU); si no alcanza el objetivo se prueba el otro y se queda el que midió más. La última
 * decisión se recuerda en el navegador (comodidad local, no dato).
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

/**
 * Empieza la prueba de una escena desde el backend recordado (o WebGPU). Siempre se mide: lo que
 * rinde bien en una escena puede no rendir en otra.
 */
export function startTrial(remembered?: Backend | null): BackendTrial {
  const current = remembered === "webgl" || remembered === "webgpu" ? remembered : "webgpu";
  return { current, measured: {}, decided: false };
}

/**
 * Registra los fps medidos con el backend en uso. Si alcanzan el objetivo se queda; si no, prueba
 * el otro una vez y se queda con el más rápido. Si se pidió WebGPU y el navegador dio WebGL 2
 * (no hay WebGPU), termina ahí.
 */
export function recordTrial(
  trial: BackendTrial,
  fps: number,
  actual: "webgpu" | "webgl2",
): BackendTrial {
  if (trial.decided) return trial;
  if (actual === "webgl2" && trial.current === "webgpu") {
    return { current: "webgl", measured: { ...trial.measured, webgl: fps }, decided: true };
  }
  const measured = { ...trial.measured, [trial.current]: fps };
  if (fps >= TARGET_FPS) return { current: trial.current, measured, decided: true };
  const other: Backend = trial.current === "webgpu" ? "webgl" : "webgpu";
  if (measured[other] === undefined) return { current: other, measured, decided: false };
  const best: Backend = (measured.webgl ?? 0) >= (measured.webgpu ?? 0) ? "webgl" : "webgpu";
  return { current: best, measured, decided: true };
}

/** fps promedio de los últimos `n` tiempos de cuadro (ms); NaN si no hay suficientes. */
export function recentFps(frameMs: readonly number[], n = 90): number {
  if (frameMs.length < n) return Number.NaN;
  const recent = frameMs.slice(-n);
  return 1000 / (recent.reduce((a, b) => a + b, 0) / recent.length);
}
