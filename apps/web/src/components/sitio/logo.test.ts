/**
 * El logo sale de una sola fuente (`assets/brand/marca.json`, René, 2026-11-15): los SVG del sitio
 * son los de `assets/brand` byte por byte, el componente toma su tamaño de `medidas.json` y la
 * portada no vuelve a escribir la geometría.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(aqui, "../../../../..");
const BRAND = join(RAIZ, "assets/brand");
const PUBLICO = join(RAIZ, "apps/web/public/marca");
const marca = JSON.parse(readFileSync(join(BRAND, "marca.json"), "utf8")) as {
  arco: string;
  colores: { senal: string };
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
      if (!/-(blanco|negro)\.svg$/.test(f)) expect(svg, f).toContain(marca.colores.senal);
    }
  });

  it("la portada y el video leen marca.json en vez de volver a escribir la geometría", () => {
    for (const ruta of [
      "apps/web/src/components/portada-v3/portada-v3.tsx",
      "demo/video/marca.mjs",
    ]) {
      const fuente = readFileSync(join(RAIZ, ruta), "utf8");
      expect(fuente, ruta).toContain("marca.json");
      expect(fuente, ruta).not.toContain(marca.arco);
    }
  });
});
