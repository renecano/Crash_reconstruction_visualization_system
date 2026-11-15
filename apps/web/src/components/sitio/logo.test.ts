/**
 * El logo sale de una sola fuente (`assets/brand/marca.json`, René, 2026-11-15): los SVG del sitio
 * son los de `assets/brand` byte por byte, el componente toma su tamaño de `medidas.json` y la
 * portada no vuelve a escribir la geometría.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(aqui, "../../../../..");
const BRAND = join(RAIZ, "assets/brand");
const PUBLICO = join(RAIZ, "apps/web/public/marca");
const marca = JSON.parse(readFileSync(join(BRAND, "marca.json"), "utf8")) as {
  arco: string;
  colores: Record<string, string> & { senal: string };
};
const medidas = JSON.parse(readFileSync(join(BRAND, "medidas.json"), "utf8")) as Record<
  string,
  { w: number; h: number }
>;

describe("el logo, de una sola fuente", () => {
  const svgs = readdirSync(BRAND).filter((f) => f.endsWith(".svg"));

  it("los SVG del sitio son los de assets/brand, sin cambios", () => {
    expect(svgs.length).toBeGreaterThan(10);
    for (const f of svgs)
      expect(readFileSync(join(PUBLICO, f)).equals(readFileSync(join(BRAND, f))), f).toBe(true);
  });

  it("cada SVG mide lo que dice medidas.json y lleva el arco y la señal de marca.json", () => {
    for (const f of svgs) {
      const svg = readFileSync(join(BRAND, f), "utf8");
      const m = medidas[f.replace(".svg", "")]!;
      expect(svg, f).toContain(`viewBox="0 0 ${m.w.toFixed(2)} ${m.h.toFixed(2)}"`);
      if (f.startsWith("palabra")) continue;
      expect(svg, f).toContain(marca.arco);
    }
  });

  it("lo que dibuja el logo en línea para animarlo lee marca.json", () => {
    for (const ruta of [
      "apps/web/src/components/portada-v3/portada-v3.tsx",
      "apps/web/src/components/cesvi/recorrido/transicion-acto.tsx",
      "demo/video/marca.mjs",
    ]) {
      const fuente = readFileSync(join(RAIZ, ruta), "utf8");
      expect(fuente, ruta).toContain("marca.json");
      expect(fuente, ruta).not.toContain(marca.arco);
    }
  });

  it("los colores del logo son tokens del sistema, y la señal es una sola", () => {
    const tokens = (
      JSON.parse(readFileSync(join(BRAND, "tokens.json"), "utf8")) as {
        color: Record<string, { value: string }>;
      }
    ).color;
    for (const [clave, nombre] of Object.entries(marca.colores)) {
      if (clave === "nota") continue;
      expect(tokens[nombre], `${clave}: ${nombre}`).toBeDefined();
    }
    const senal = tokens[marca.colores.senal]!.value;
    expect(senal).toBe("#FF5B2E");
    expect(tokens["lab-impacto"]!.value).toBe(senal);
    for (const f of svgs) {
      if (/-(blanco|negro)\.svg$/.test(f) || f.startsWith("palabra")) continue;
      expect(readFileSync(join(BRAND, f), "utf8"), f).toContain(senal);
    }
  });

  it("nadie más dibuja el logo: ni el anterior ni el nuevo, ni el nombre escrito con la fuente", () => {
    // Firmas del logo dibujado a mano: la geometría del anterior (la C de tres rayas y la X), el
    // arco del nuevo, y el nombre como texto en un rótulo de marca.
    const FIRMAS: [string, RegExp][] = [
      ["el arco del logo anterior", /A\s?44[ ,]44|91\.11 28\.89/],
      ["las rayas del logo anterior", /52[ ,]25\.6/],
      ["la X del logo anterior", /M\s?91[ ,]51\s?L\s?109[ ,]69/],
      ["el arco del logo", /A\s?20[ ,]20[ ,]0[ ,]1[ ,]1[ ,]46\.86/],
      ["el nombre escrito como texto", /class(Name)?="(wordmark|intro-word)"[^>]*>\s*Croquis/i],
    ];
    const CARPETAS = [
      "apps/web/src",
      "apps/web/scripts",
      "apps/web/e2e",
      "apps/visor-unity/Assets/Croquis",
      "apps/visor-unity/Assets/WebGLTemplates",
      "demo",
      "tools",
      "packages",
    ];
    const SALTAR =
      /node_modules|[\\/](\.next|dist|Library|Generated|fixtures|grabaciones|salida)[\\/]/;
    const EXTENSIONES = /\.(tsx?|mjs|mts|js|css|html|cs|svg|json)$/;
    const PERMITIDOS = new Set(["apps/web/src/components/sitio/logo.test.ts"]);
    const hallazgos: string[] = [];
    const recorre = (dir: string) => {
      for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
        const ruta = `${dir}/${e.name}`;
        if (SALTAR.test(`${ruta}/`)) continue;
        if (e.isDirectory()) recorre(ruta);
        else if (EXTENSIONES.test(e.name) && !PERMITIDOS.has(ruta)) {
          if (statSync(join(RAIZ, ruta)).size > 400_000) continue;
          const texto = readFileSync(join(RAIZ, ruta), "utf8");
          for (const [que, rx] of FIRMAS) if (rx.test(texto)) hallazgos.push(`${ruta}: ${que}`);
        }
      }
    };
    CARPETAS.forEach(recorre);
    expect(hallazgos).toEqual([]);
  });
});
