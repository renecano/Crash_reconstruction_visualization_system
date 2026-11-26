import { describe, expect, it } from "vitest";
import {
  ALTO_VIDEO,
  ANCHO_VIDEO,
  instantesDelVideo,
  lienzoDelVideo,
  modoDelVideo,
  tarjetaIntegrada,
  textoTarda,
  nombreDelVideo,
  puedeGrabarVideo,
  SUPERMUESTREO_VIDEO,
  textoFalta,
} from "./video";

describe("descargar el video del 3D (René, 2026-11-18, B7)", () => {
  it("un cuadro cada 1/30 s, de principio a fin, sin pasarse", () => {
    const t = instantesDelVideo(-2, 1);
    expect(t).toHaveLength(91);
    expect(t[0]).toBe(-2);
    expect(t.at(-1)).toBeCloseTo(1);
    expect(instantesDelVideo(0, 0.1)).toHaveLength(4);
    // Un intervalo vacío da un solo cuadro.
    expect(instantesDelVideo(3, 3)).toEqual([3]);
  });

  it("cuánto falta, en palabras", () => {
    expect(textoFalta(0, 300, 0)).toBe("Calculando cuánto falta…");
    expect(textoFalta(100, 300, 20_000)).toBe("Faltan 40 s");
    expect(textoFalta(30, 300, 15_000)).toBe("Faltan 2 min 15 s");
    expect(textoFalta(60, 120, 60_000)).toBe("Falta 1 min");
    expect(textoFalta(299, 300, 60_000)).toBe("Casi listo");
  });

  it("el nombre del archivo, sin acentos ni espacios", () => {
    expect(nombreDelVideo("AXA · A2010930", "Cinemática")).toBe(
      "croquis-axa-a2010930-cinematica.mp4",
    );
    expect(nombreDelVideo("", null)).toBe("croquis-caso.mp4");
  });

  it("sin WebCodecs (jsdom) dice que no puede", () => {
    expect(puedeGrabarVideo()).toBe(false);
  });
});

describe("el antialiasing del video (René, 2026-11-26)", () => {
  it("Unity dibuja al doble: 3840×2160 pixeles reales, con cualquier devicePixelRatio", () => {
    expect(SUPERMUESTREO_VIDEO).toBe(2);
    for (const dpr of [1, 1.25, 2]) {
      const l = lienzoDelVideo(dpr);
      expect(l.ancho * dpr).toBeCloseTo(ANCHO_VIDEO * 2, 6);
      expect(l.alto * dpr).toBeCloseTo(ALTO_VIDEO * 2, 6);
    }
    expect(lienzoDelVideo(0)).toEqual({ ancho: 3840, alto: 2160 });
  });
});

describe("el modo del video según la tarjeta (René, 2026-11-26: medido en la laptop de 8 GB)", () => {
  it("integradas y por software van como antes; las dedicadas, al doble y en ultra", () => {
    for (const r of [
      "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
      null,
    ])
      expect(modoDelVideo(r)).toEqual({ escala: 1, calidad: null });
    for (const r of [
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "Apple M2",
    ])
      expect(modoDelVideo(r)).toEqual({ escala: 2, calidad: "ultra" });
    expect(tarjetaIntegrada("Intel(R) Iris(R) Xe Graphics")).toBe(true);
  });

  it("dice cuánto tarda en minutos redondos", () => {
    expect(textoTarda(30_000)).toBe("Tarda menos de un minuto");
    expect(textoTarda(420_000)).toBe("Tarda ~7 min");
    expect(lienzoDelVideo(1, 1)).toEqual({ ancho: 1920, alto: 1080 });
  });
});
