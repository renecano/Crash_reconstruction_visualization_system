import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { datosPortadaCesvi } from "@/lib/portada-cesvi";
import tomas from "../../../public/portada/tomas.json";
import { capturaMalCopiada, segmentosNarracion, textosPortadaV3 } from "./textos";

const PUBLICO = join(dirname(fileURLToPath(import.meta.url)), "../../../public");
const d = datosPortadaCesvi();

describe("portada v3: los textos llevan las cifras de los datos", () => {
  it("la tabla de AXA, las cifras y las barras son las del cálculo, en los dos idiomas", () => {
    for (const lang of ["es", "en"] as const) {
      const t = textosPortadaV3(lang, d);
      expect(t.cifras.map(([n]) => n)).toEqual([d.reportes, d.aCiegas]);
      expect(t.cifraModalidad).toBe(d.modalidadPct);
      expect(t.cifraRegla).toBe(d.reglaPct);
      expect(t.cifraRestos).toBe(Math.round(d.axa.restos.croquis * 100) / 100);
      const [, restos, deformacion] = t.filas;
      expect(restos!.cesvi).toBe(d.axa.restos.cesvi.toFixed(2));
      expect(restos!.croquis).toBe(d.axa.restos.croquis.toFixed(2));
      expect(restos!.dif).toBe("0.00 %");
      expect(deformacion!.croquis).toBe(d.axa.deformacion.croquis.toFixed(2));
      expect(deformacion!.dif).toBe(`+${d.axa.deformacion.pct.toFixed(2)} %`);
      expect(t.faq.flat().join(" ")).toContain(`${d.modalidadPct.toFixed(1)} %`);
    }
  });

  it("el «63.15 → 63.51» de piezas sueltas es una ilustración de un dígito transpuesto", () => {
    expect(capturaMalCopiada("63.15")).toBe("63.51");
    const f = textosPortadaV3("es", d).frags[1]!.fault;
    expect(f).toEqual({
      tipo: "captura",
      antes: d.axa.deformacion.cesvi.toFixed(2),
      despues: capturaMalCopiada(d.axa.deformacion.cesvi.toFixed(2)),
    });
  });

  it("la narración de ejemplo marca, en orden, la modalidad, la vía y la ubicación", () => {
    const s = segmentosNarracion(d.axa.narracion, d.axa.modalidad.cesvi);
    expect(s.filter((x) => x.marca).map((x) => x.texto)).toEqual([
      "alcance",
      "carretera México-Nogales",
      "km 47+800",
    ]);
    expect(s.map((x) => x.texto).join("")).toBe(d.axa.narracion);
    expect(() => segmentosNarracion("Un texto sin datos.", "alcance")).toThrow();
  });
});

describe("portada v3: las tomas de fondo", () => {
  it("de 3 a 4 tomas, cada una en MP4 de escritorio y de celular de menos de 3 MB, con su póster", () => {
    expect(tomas.length).toBeGreaterThanOrEqual(3);
    expect(tomas.length).toBeLessThanOrEqual(4);
    for (const t of tomas) {
      for (const f of [`toma-${t.toma}.mp4`, `toma-${t.toma}-movil.mp4`]) {
        const ruta = join(PUBLICO, "portada", f);
        expect(existsSync(ruta), f).toBe(true);
        expect(statSync(ruta).size).toBeLessThan(3 * 1024 * 1024);
      }
      expect(existsSync(join(PUBLICO, "portada", `toma-${t.toma}.jpg`))).toBe(true);
      expect(t.duracion_s).toBeGreaterThan(6);
    }
  });
});
