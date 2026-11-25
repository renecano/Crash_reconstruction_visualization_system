import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formato as F } from "@croquis/cesvi";
import { datosPortadaCesvi } from "@/lib/portada-cesvi";
import IMAGENES from "./imagenes.json";
import { DETALLES, PASOS, textosPortadaV3 } from "./textos";

const APP = join(dirname(fileURLToPath(import.meta.url)), "../../../public/portada/app");
const d = datosPortadaCesvi();

describe.each(["es", "en"] as const)("portada (%s)", (lang) => {
  const t = textosPortadaV3(lang, d);
  const todo = JSON.stringify(t);

  it("el nombre de la app no se escribe (va el logo) y no hay datos de AXA ni de un caso", () => {
    expect(todo).not.toMatch(/croquis(?! 2D)/i);
    expect(todo).not.toMatch(/AXA|A2010930/);
  });

  it("las cifras del índice, cada una con su límite; ninguna más escrita a mano", () => {
    expect(t.cifras.map((c) => c.tasa)).toEqual([d.cobertura, d.modalidad, d.carambolas]);
    for (const c of t.cifras) expect(c.limite.length).toBeGreaterThan(20);
    expect(t.cifras[1]!.limite).toContain(F.tasa(d.regla, lang === "es" ? "de" : "of"));
    // Fuera de las del índice (y «2D», «3D» y la versión de la licencia) no hay dígitos en los textos.
    const resto = JSON.stringify({ ...t, cifras: [], h1: t.h1.join(" ") });
    expect(resto.replace(/\b[23]D\b|OFL 1\.1|"h1":/g, "")).not.toMatch(/\d/);
  });

  it("un texto por paso y por detalle", () => {
    expect(t.pasos).toHaveLength(PASOS.length);
    expect(t.distinto).toHaveLength(DETALLES.length);
  });
});

it("cada captura existe, de día y de noche, en AVIF y con su respaldo WebP", () => {
  for (const [nombre, { anchos }] of Object.entries(IMAGENES))
    for (const tema of nombre === "inicio" ? [""] : ["-claro", "-oscuro"])
      for (const ancho of anchos)
        for (const formato of ["avif", "webp"]) {
          const f = `${nombre}${tema}-${ancho}.${formato}`;
          expect(existsSync(join(APP, f)), f).toBe(true);
        }
  const usadas = ["inicio", ...PASOS, ...DETALLES.map((d) => `detalle-${d}`)];
  expect(Object.keys(IMAGENES).sort()).toEqual(usadas.sort());
});
