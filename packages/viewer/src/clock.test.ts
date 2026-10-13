import { describe, expect, it, vi } from "vitest";
import { createClock } from "./clock";
import { createTimeline, togglePlay } from "./timeline";

describe("reloj del visor", () => {
  it("avanza solo al reproducir y limita los avisos a la interfaz", () => {
    const clock = createClock(createTimeline(-3, 2, 0.02), 10);
    const fn = vi.fn();
    clock.subscribe(fn);
    clock.tick(0.5, 0);
    expect(clock.get().t).toBe(-3);
    clock.set(togglePlay);
    expect(fn).toHaveBeenCalledTimes(1);
    for (let i = 1; i <= 60; i++) clock.tick(1 / 60, i * (1000 / 60));
    expect(clock.get().t).toBeCloseTo(-2, 9);
    // 1 s a 10 Hz: unos 10 avisos, no 60.
    expect(fn.mock.calls.length).toBeLessThanOrEqual(12);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(9);
  });

  it("avisa al llegar al final aunque no toque por frecuencia", () => {
    const clock = createClock(createTimeline(0, 0.1, 0.02, { playing: true }), 1);
    const fn = vi.fn();
    const off = clock.subscribe(fn);
    clock.tick(0.05, 0);
    clock.tick(1, 10);
    expect(clock.get().playing).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    clock.set((s) => ({ ...s, t: 0 }));
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
