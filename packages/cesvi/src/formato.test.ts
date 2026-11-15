import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  conSigno,
  diferenciaKmh,
  diferenciaPct,
  fijo,
  grados,
  instante,
  kmh,
  kmhConUnidad,
  metros,
  numero,
  porcentaje,
  rangoKmh,
  segundos,
  tasa,
  velocidad,
} from "./formato";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("el formateador único de las cifras (decisión 5 de René, ADR 0138)", () => {
  it("la conclusión de la reconstrucción va en enteros, con su rango", () => {
    // AXA: 56.87 km/h (54.79–78.39).
    expect(velocidad({ mejor: 56.87, p10: 54.79, p90: 78.39 })).toBe("57 km/h (55–78)");
    expect(velocidad({ mejor: 14.98, p10: 0.8, p90: 16.45 })).toBe("15 km/h (1–16)");
    expect(velocidad({ mejor: 56.87 })).toBe("57 km/h");
    expect(velocidad({ mejor: 56.87, p10: null, p90: null })).toBe("57 km/h");
    expect(kmh(56.87, "reconstruccion")).toBe("57");
    expect(kmhConUnidad(31.32, "reconstruccion")).toBe("31 km/h");
    expect(rangoKmh(54.79, 78.39, "reconstruccion")).toBe("55–78");
    expect(diferenciaKmh(-6.28, "reconstruccion")).toBe("−6 km/h");
    expect(diferenciaPct(-48.03, "reconstruccion")).toBe("−48 %");
  });

  it("la tabla que reproduce el método de CESVI conserva dos decimales", () => {
    expect(kmh(60.27, "metodo")).toBe("60.27");
    expect(kmhConUnidad(63.9, "metodo")).toBe("63.90 km/h");
    expect(velocidad({ mejor: 63.15, p10: 60.27, p90: 63.9 }, "metodo")).toBe(
      "63.15 km/h (60.27–63.90)",
    );
    expect(diferenciaKmh(0.75, "metodo")).toBe("+0.75 km/h");
    expect(diferenciaPct(1.19, "metodo")).toBe("+1.19 %");
    expect(diferenciaPct(0, "metodo")).toBe("0.00 %");
  });

  it("sin dato, una raya; y el cero nunca lleva signo", () => {
    expect(kmh(undefined, "reconstruccion")).toBe("—");
    expect(kmh(null, "metodo")).toBe("—");
    expect(kmh(Number.NaN, "metodo")).toBe("—");
    expect(fijo(-0.001, 2)).toBe("0.00");
    expect(fijo(-0.4, 0)).toBe("0");
    expect(conSigno(-0.001, 2)).toBe("0.00");
    expect(conSigno(0.4, 0)).toBe("0");
    expect(numero(-3.25, 1)).toBe("−3.3");
  });

  it("una tasa va completa: k de n con su porcentaje", () => {
    expect(tasa({ k: 91, n: 156, pct: 58.3 })).toBe("91 de 156 (58.3 %)");
    expect(tasa({ k: 91, n: 156, pct: 58.3 }, "of")).toBe("91 of 156 (58.3 %)");
    expect(tasa({ k: 0, n: 0, pct: null })).toBe("0 de 0");
    expect(porcentaje(37.2, 1)).toBe("37.2 %");
  });

  it("metros, tiempos y ángulos", () => {
    expect(metros(15.894)).toBe("15.89 m");
    expect(metros(31.92, 1)).toBe("31.9 m");
    expect(instante(1.2)).toBe("+1.20 s");
    expect(instante(-0.4)).toBe("−0.40 s");
    expect(instante(0)).toBe("0.00 s");
    expect(segundos(1.234)).toBe("1.23 s");
    expect(grados(12.46)).toBe("12.5°");
  });

  it("nadie más redondea para escribir: `toFixed` solo vive en formato.ts", () => {
    // El flujo de CESVI: el paquete, sus pantallas, la portada y lo de la web que usa el paquete.
    const EXT = /\.(ts|tsx)$/;
    const fuera: string[] = [];
    const revisa = (ruta: string, siempre: boolean) => {
      const texto = readFileSync(join(RAIZ, ruta), "utf8");
      if (!siempre && !texto.includes("@croquis/cesvi")) return;
      texto.split("\n").forEach((linea, i) => {
        if (linea.includes(".toFixed(")) fuera.push(`${ruta}:${i + 1}`);
      });
    };
    const recorre = (dir: string, siempre: boolean) => {
      for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
        const ruta = `${dir}/${e.name}`;
        if (e.isDirectory()) recorre(ruta, siempre);
        else if (EXT.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !ruta.endsWith("/formato.ts"))
          revisa(ruta, siempre);
      }
    };
    recorre("packages/cesvi/src", true);
    recorre("apps/web/src/components/cesvi", true);
    recorre("apps/web/src/components/portada-v3", true);
    recorre("apps/web/src/lib", false);
    expect(fuera).toEqual([]);
  });
});
