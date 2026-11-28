import { describe, expect, it } from "vitest";
import {
  ALTO_VIDEO,
  CODIFICADORES,
  SIN_VIDEO,
  UMBRAL_RAPIDO_MS,
  elegirModo,
  ANCHO_VIDEO,
  instantesDelVideo,
  CAMARA_LENTA_VIDEO,
  aceleradoDelVideo,
  rotuloAcelerado,
  rotuloLenta,
  lienzoDelVideo,
  modosDelVideo,
  estimarVideo,
  guardarMedida,
  medidaGuardada,
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
    // La cámara lenta del impacto: en la ventana, cada cuadro avanza la quinta parte.
    const l = instantesDelVideo(-1, 1, 30, CAMARA_LENTA_VIDEO);
    const enVentana = l.filter((t) => t >= -0.35 && t <= 0.8);
    expect(enVentana.length).toBeGreaterThanOrEqual(165); // ~1.13 s × 30 / 0.2
    expect(l.filter((t) => t < -0.35).length).toBe(Math.ceil(0.65 * 30));
    expect(l.at(-1)).toBeLessThanOrEqual(1 + 1e-9);
    expect(rotuloLenta(CAMARA_LENTA_VIDEO)).toBe("Cámara lenta ×5");
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
  it("«Rápido» prueba alta y luego media; «Máxima», el doble en ultra solo con tarjeta dedicada", () => {
    const rapido = [
      { escala: 1, nivel: "alta" },
      { escala: 1, nivel: "media" },
    ];
    for (const r of [
      "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
      null,
    ])
      for (const c of ["rapido", "maxima"] as const) expect(modosDelVideo(r, c)).toEqual(rapido);
    for (const r of [
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "Apple M2",
    ]) {
      expect(modosDelVideo(r)).toEqual(rapido);
      expect(modosDelVideo(r, "maxima")).toEqual([
        { escala: 2, nivel: "ultra" },
        { escala: 1, nivel: "alta" },
      ]);
    }
    expect(tarjetaIntegrada("Intel(R) Iris(R) Xe Graphics")).toBe(true);
  });

  it("dice cuánto tarda en minutos redondos", () => {
    expect(textoTarda(30_000)).toBe("Tarda menos de un minuto");
    expect(textoTarda(420_000)).toBe("Tarda ~7 min");
    expect(lienzoDelVideo(1, 1)).toEqual({ ancho: 1920, alto: 1080 });
  });

  it("elige con lo medido, no por el nombre de la tarjeta", () => {
    const alta = { escala: 1, nivel: "alta" } as const;
    const media = { escala: 1, nivel: "media" } as const;
    const doble = { escala: 2, nivel: "ultra" } as const;
    // Rápido: alta si sale a tiempo; si no, media; si ninguna, la más rápida.
    expect(elegirModo([{ modo: alta, ms: 90 }], "rapido")?.modo).toBe(alta);
    expect(
      elegirModo(
        [
          { modo: alta, ms: 968 },
          { modo: media, ms: UMBRAL_RAPIDO_MS },
        ],
        "rapido",
      )?.modo,
    ).toBe(media);
    expect(
      elegirModo(
        [
          { modo: alta, ms: 968 },
          { modo: media, ms: 400 },
        ],
        "rapido",
      )?.modo,
    ).toBe(media);
    // Máxima: el primero que dibuja, aunque tarde (se dice cuánto antes de empezar).
    expect(elegirModo([{ modo: doble, ms: 2900 }], "maxima")?.modo).toBe(doble);
    expect(
      elegirModo(
        [
          { modo: doble, ms: Infinity },
          { modo: alta, ms: 968 },
        ],
        "maxima",
      )?.modo,
    ).toBe(alta);
    // Ninguno dibujó: nada (el video dice que no se pudo).
    expect(elegirModo([{ modo: alta, ms: Infinity }], "rapido")).toBeNull();
  });

  it("si el codificador falla, reintenta por software antes de rendirse, con un mensaje claro", () => {
    expect(CODIFICADORES[0].aceleracion).toBe("no-preference");
    expect(CODIFICADORES.slice(1).every((c) => c.aceleracion === "prefer-software")).toBe(true);
    expect(SIN_VIDEO).not.toMatch(/error/i);
    expect(SIN_VIDEO).toContain("vuelve a intentarlo");
  });
  it("«Desde el inicio» acelera el trayecto lejano para que el video dure ~1 min (René, 2026-11-27)", () => {
    // El crucero con 3.8 km previos: ~700 s de trayecto, la reconstrucción desde −3 s hasta 4 s.
    const inicio = -703;
    const reconstruccion = -3;
    const fin = 4;
    const a = aceleradoDelVideo(inicio, reconstruccion, fin, CAMARA_LENTA_VIDEO)!;
    expect(a.hasta).toBe(reconstruccion - 8);
    const t = instantesDelVideo(inicio, fin, 30, CAMARA_LENTA_VIDEO, a);
    expect(t.length / 30).toBeLessThanOrEqual(60);
    expect(t.length / 30).toBeGreaterThan(30);
    // La llegada va a 1× y el impacto en cámara lenta, como siempre.
    const llegada = t.filter((x) => x >= a.hasta && x < -0.35);
    expect(llegada.length).toBeGreaterThanOrEqual(Math.floor((a.hasta * -1 - 0.35) * 30) - 1);
    expect(t.filter((x) => x >= -0.35 && x <= 0.8).length).toBeGreaterThan(160);
    expect(rotuloAcelerado(a)).toMatch(/^Trayecto ilustrativo · acelerado ×\d+$/);
    // Un trayecto corto no se acelera.
    expect(aceleradoDelVideo(-20, -3, 4, null)).toBeNull();
  });

  it("estima antes de empezar con lo que tardó cada cuadro la última vez", () => {
    expect(estimarVideo(450, null)).toBeNull();
    expect(estimarVideo(450, 120)).toBe(54_000);
    expect(textoTarda(estimarVideo(450, 120)!)).toBe("Tarda menos de un minuto");
    const m = {
      cuadros: 450,
      ms_total: 90_000,
      ms_unity: 80_000,
      ms_componer: 5_000,
      ms_codificar: 4_000,
      ms_cerrar: 1_000,
    };
    localStorage.removeItem("croquis.video.msPorCuadro.rapido");
    expect(medidaGuardada("rapido")).toBeNull();
    guardarMedida("rapido", m);
    expect(medidaGuardada("rapido")).toBe(200);
    expect(medidaGuardada("maxima")).toBeNull();
  });
});
