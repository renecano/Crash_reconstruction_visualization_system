import { describe, expect, it } from "vitest";
import { CODECS, frameTimes } from "./video";

describe("video de la reconstrucción", () => {
  it("un cuadro por cada 1/fps desde t0, sin pasar de t1", () => {
    expect(frameTimes(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    const t = frameTimes(-3, 2.14, 24);
    expect(t).toHaveLength(124);
    expect(t[0]).toBe(-3);
    expect(t.at(-1)!).toBeLessThanOrEqual(2.14);
    expect(2.14 - t.at(-1)!).toBeLessThan(1 / 24);
  });

  it("MP4 prefiere H.264 (lo abre cualquier reproductor); WebM, VP9", () => {
    expect(CODECS.mp4[0]).toBe("avc");
    expect(CODECS.webm[0]).toBe("vp9");
    expect(CODECS.webm).not.toContain("avc");
  });
});
