import { describe, expect, it } from "vitest";
import { qualityForGpu } from "./gpu-tier";

describe("nivel inicial por GPU", () => {
  it.each([
    // La laptop de referencia (E6) arranca en media.
    ["ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)", "media"],
    ["ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)", "media"],
    ["ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)", "media"],
    ["ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)", "alta"],
    ["ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)", "ultra"],
    ["ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)", "ultra"],
    ["ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)", "ultra"],
    ["ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)", "alta"],
    ["ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)", "alta"],
    ["ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)", "ultra"],
    ["ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)", "alta"],
    ["Apple GPU", "baja"],
    ["Adreno (TM) 650", "baja"],
    ["Mali-G78", "baja"],
    [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
      "baja",
    ],
    ["llvmpipe (LLVM 15.0.7, 256 bits)", "baja"],
  ])("%s → %s", (renderer, level) => {
    expect(qualityForGpu(renderer).level).toBe(level);
  });

  it("sin nombre o desconocida, media", () => {
    expect(qualityForGpu(null)).toMatchObject({ level: "media", kind: "GPU desconocida" });
    expect(qualityForGpu("  ")).toMatchObject({ level: "media", kind: "GPU desconocida" });
    expect(qualityForGpu("Moore Threads MTT S80")).toMatchObject({
      level: "media",
      kind: "GPU sin clasificar",
    });
  });
});
